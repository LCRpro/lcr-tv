import { and, eq, sql as raw } from 'drizzle-orm';
import type { ItemType } from '@iptv/shared';
import { db } from '../db/client.js';
import { episodes, favorites, streams, watchProgress } from '../db/schema.js';
import { badRequest } from '../lib/errors.js';

export async function addFavorite(
  profileId: number,
  itemType: 'stream' | 'series',
  itemId: number,
): Promise<void> {
  await db
    .insert(favorites)
    .values({ profileId, itemType, itemId })
    .onConflictDoNothing({ target: [favorites.profileId, favorites.itemType, favorites.itemId] });
}

export async function removeFavorite(
  profileId: number,
  itemType: 'stream' | 'series',
  itemId: number,
): Promise<void> {
  await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.profileId, profileId),
        eq(favorites.itemType, itemType),
        eq(favorites.itemId, itemId),
      ),
    );
}

/** Au-dela de ce ratio, on considere le contenu vu et on le sort de « Reprendre ». */
const COMPLETION_RATIO = 0.92;
/** En deca, ce n'est pas une reprise mais un faux depart. */
const MIN_RESUME_SEC = 30;

/**
 * Progression de lecture. Le client envoie un PATCH toutes les 10 s : l'ecriture
 * doit rester un seul upsert, sans lecture prealable.
 */
export async function saveProgress(input: {
  profileId: number;
  itemType: ItemType;
  itemId: number;
  positionSec: number;
  durationSec?: number | undefined;
}): Promise<{ completed: boolean }> {
  if (input.itemType === 'stream') {
    // Un direct n'a pas de position reprenable : on ignore silencieusement.
    const [row] = await db
      .select({ type: streams.type })
      .from(streams)
      .where(eq(streams.id, input.itemId))
      .limit(1);
    if (!row) throw badRequest('Contenu inconnu.');
    if (row.type === 'live') return { completed: false };
  }

  const position = Math.max(0, Math.round(input.positionSec));
  const duration =
    input.durationSec && input.durationSec > 0 ? Math.round(input.durationSec) : null;
  const completed = duration !== null && position >= duration * COMPLETION_RATIO;

  await db
    .insert(watchProgress)
    .values({
      profileId: input.profileId,
      itemType: input.itemType,
      itemId: input.itemId,
      positionSec: position,
      durationSec: duration,
      completed,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchProgress.profileId, watchProgress.itemType, watchProgress.itemId],
      set: {
        positionSec: raw`excluded.position_sec`,
        // Une duree connue ne doit pas etre effacee par un envoi qui l'omet.
        durationSec: raw`coalesce(excluded.duration_sec, watch_progress.duration_sec)`,
        completed: raw`excluded.completed`,
        updatedAt: raw`excluded.updated_at`,
      },
    });

  return { completed };
}

export async function deleteProgress(
  profileId: number,
  itemType: ItemType,
  itemId: number,
): Promise<void> {
  await db
    .delete(watchProgress)
    .where(
      and(
        eq(watchProgress.profileId, profileId),
        eq(watchProgress.itemType, itemType),
        eq(watchProgress.itemId, itemId),
      ),
    );
}

/**
 * Marquer comme vu — ou defaire.
 *
 * La progression ne s'ecrivait qu'en regardant : rien ne permettait de dire
 * « celui-la, je l'ai vu ailleurs », et une liste ou rien ne se marque ne se
 * vide jamais. Vu, c'est une progression complete, a la duree connue quand on
 * la connait ; defait, c'est la ligne qui disparait — le contenu redevient
 * « jamais lance ».
 */
export async function markSeen(
  profileId: number,
  itemType: 'stream' | 'episode',
  itemId: number,
  seen: boolean,
): Promise<void> {
  if (!seen) {
    await deleteProgress(profileId, itemType, itemId);
    return;
  }
  const [row] =
    itemType === 'episode'
      ? await db
          .select({ duration: episodes.durationSec, type: raw<string>`'vod'` })
          .from(episodes)
          .where(eq(episodes.id, itemId))
          .limit(1)
      : await db
          .select({ duration: streams.durationSec, type: streams.type })
          .from(streams)
          .where(eq(streams.id, itemId))
          .limit(1);
  if (!row) throw badRequest('Contenu inconnu.');
  if (row.type === 'live') throw badRequest('Une chaine ne se marque pas comme vue.');

  const duration = row.duration && row.duration > 0 ? row.duration : null;
  await db
    .insert(watchProgress)
    .values({
      profileId,
      itemType,
      itemId,
      positionSec: duration ?? 0,
      durationSec: duration,
      completed: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchProgress.profileId, watchProgress.itemType, watchProgress.itemId],
      set: {
        // Duree inconnue : la position deja enregistree vaut mieux que zero.
        positionSec: raw`coalesce(excluded.duration_sec, watch_progress.duration_sec, watch_progress.position_sec)`,
        durationSec: raw`coalesce(excluded.duration_sec, watch_progress.duration_sec)`,
        completed: raw`true`,
        updatedAt: raw`excluded.updated_at`,
      },
    });
}

export const RESUME_THRESHOLD_SEC = MIN_RESUME_SEC;
