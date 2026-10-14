import { and, eq, sql as raw } from 'drizzle-orm';
import type { Tag } from '@iptv/shared';
import { db } from '../db/client.js';
import { tagItems, tags } from '../db/schema.js';
import { AppError, badRequest } from '../lib/errors.js';

type TagItemType = 'stream' | 'series';

/**
 * Les étiquettes du profil.
 *
 * Elles appartiennent au profil, pas au compte : chacun range à sa façon. Tout
 * passe donc par `profileId`, et l'écriture vérifie toujours que l'étiquette
 * visée est bien la sienne avant d'y toucher.
 */

/** La liste des étiquettes du profil, chacune avec le nombre de contenus qu'elle range. */
export async function listTags(profileId: number): Promise<Tag[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      count: raw<number>`count(${tagItems.tagId})`,
    })
    .from(tags)
    .leftJoin(tagItems, eq(tagItems.tagId, tags.id))
    .where(eq(tags.profileId, profileId))
    .groupBy(tags.id, tags.name, tags.createdAt)
    .orderBy(tags.createdAt);

  return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }));
}

/**
 * Les étiquettes du profil, en disant pour chacune si elle contient déjà ce
 * contenu. C'est ce que lit le sélecteur d'étiquettes, pour cocher les bonnes.
 */
export async function tagsForItem(
  profileId: number,
  itemType: TagItemType,
  itemId: number,
): Promise<Tag[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      count: raw<number>`count(${tagItems.tagId})`,
      contains: raw<boolean>`bool_or(${tagItems.itemType} = ${itemType} and ${tagItems.itemId} = ${itemId})`,
    })
    .from(tags)
    .leftJoin(tagItems, eq(tagItems.tagId, tags.id))
    .where(eq(tags.profileId, profileId))
    .groupBy(tags.id, tags.name, tags.createdAt)
    .orderBy(tags.createdAt);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
    contains: Boolean(r.contains),
  }));
}

/** Crée une étiquette, ou renvoie celle qui porte déjà ce nom (casse ignorée). */
export async function createTag(profileId: number, name: string): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw badRequest('Le nom de l’étiquette est vide.');

  // Conflit possible : l'index unique (profile_id, lower(name)). Sans cible
  // explicite, « DO NOTHING » couvre cet index sur expression.
  const [row] = await db
    .insert(tags)
    .values({ profileId, name: trimmed })
    .onConflictDoNothing()
    .returning({ id: tags.id, name: tags.name });

  if (row) return { id: row.id, name: row.name, count: 0 };

  // Elle existait déjà : on la retrouve plutôt que d'échouer.
  const [existing] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.profileId, profileId), raw`lower(${tags.name}) = lower(${trimmed})`))
    .limit(1);
  if (!existing) throw badRequest('Création de l’étiquette impossible.');
  return { id: existing.id, name: existing.name, count: 0 };
}

export async function deleteTag(profileId: number, tagId: number): Promise<void> {
  await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.profileId, profileId)));
}

/** Le profil est-il bien propriétaire de l'étiquette ? Sinon on ne touche à rien. */
async function ownTagOrThrow(profileId: number, tagId: number): Promise<void> {
  const [row] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.profileId, profileId)))
    .limit(1);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Étiquette introuvable.');
}

export async function addTagItem(
  profileId: number,
  tagId: number,
  itemType: TagItemType,
  itemId: number,
): Promise<void> {
  await ownTagOrThrow(profileId, tagId);
  await db
    .insert(tagItems)
    .values({ tagId, itemType, itemId })
    .onConflictDoNothing({ target: [tagItems.tagId, tagItems.itemType, tagItems.itemId] });
}

export async function removeTagItem(
  profileId: number,
  tagId: number,
  itemType: TagItemType,
  itemId: number,
): Promise<void> {
  await ownTagOrThrow(profileId, tagId);
  await db
    .delete(tagItems)
    .where(
      and(
        eq(tagItems.tagId, tagId),
        eq(tagItems.itemType, itemType),
        eq(tagItems.itemId, itemId),
      ),
    );
}
