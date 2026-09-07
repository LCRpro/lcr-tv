import { and, eq, isNull, lt, sql as raw } from 'drizzle-orm';
import type { ActiveSlotView, ItemType, SlotConflictDetails, SlotUsage } from '@iptv/shared';
import { SLOT_STALE_SEC } from '../config/env.js';
import { db } from '../db/client.js';
import { playbackSlots, providers, users } from '../db/schema.js';
import { AppError, notFound } from '../lib/errors.js';
import {
  getProvider,
  listActiveProviders,
  listAllActiveProviders,
  maxConnectionsOf,
} from './providers.js';

/**
 * Slots de lecture.
 *
 * Chaque abonnement limite ses connexions simultanees. Depasser la limite fait
 * couper le panel au hasard, y compris les sessions deja en cours — un symptome
 * qu'on confond facilement avec un bug applicatif. On compte donc nous-memes,
 * et on refuse proprement avant d'appeler le panel.
 *
 * Le comptage est **par abonnement** : deux abonnements a une connexion donnent
 * deux lectures simultanees, mais pas deux lectures sur le meme abonnement. Un
 * slot est donc toujours rattache au provider du contenu.
 */

const STALE_SQL = raw`now() - make_interval(secs => ${SLOT_STALE_SEC})`;

/** Verrou d'exclusion pendant l'acquisition : deux clients ne doivent pas compter en meme temps. */
const ACQUIRE_LOCK_KEY = 918_273_645;

export async function releaseStaleSlots(): Promise<number> {
  const rows = await db
    .update(playbackSlots)
    .set({ releasedAt: new Date() })
    .where(and(isNull(playbackSlots.releasedAt), lt(playbackSlots.heartbeatAt, STALE_SQL)))
    .returning({ id: playbackSlots.id });
  return rows.length;
}

export interface AcquireInput {
  userId: number;
  sessionId: number;
  /** Abonnement dont provient le contenu : c'est sa limite qui s'applique. */
  providerId: number;
  itemType: ItemType;
  itemId: number;
  itemLabel: string;
}

export interface AcquiredSlot {
  id: number;
  reused: boolean;
}

export async function acquireSlot(input: AcquireInput): Promise<AcquiredSlot> {
  const provider = await getProvider(input.providerId);
  const maxConnections = maxConnectionsOf(provider);

  return db.transaction(async (tx) => {
    // Serialise les acquisitions concurrentes ; libere a la fin de la transaction.
    await tx.execute(raw`select pg_advisory_xact_lock(${ACQUIRE_LOCK_KEY})`);

    await tx
      .update(playbackSlots)
      .set({ releasedAt: new Date() })
      .where(and(isNull(playbackSlots.releasedAt), lt(playbackSlots.heartbeatAt, STALE_SQL)));

    // Meme appareil, meme contenu : c'est un renouvellement, pas une seconde lecture.
    const [existing] = await tx
      .select({ id: playbackSlots.id })
      .from(playbackSlots)
      .where(
        and(
          isNull(playbackSlots.releasedAt),
          eq(playbackSlots.sessionId, input.sessionId),
          eq(playbackSlots.itemType, input.itemType),
          eq(playbackSlots.itemId, input.itemId),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(playbackSlots)
        .set({ heartbeatAt: new Date(), itemLabel: input.itemLabel })
        .where(eq(playbackSlots.id, existing.id));
      return { id: existing.id, reused: true };
    }

    // Changer de contenu sur le meme appareil libere le slot precedent, quel
    // que soit l'abonnement qu'il occupait.
    await tx
      .update(playbackSlots)
      .set({ releasedAt: new Date() })
      .where(
        and(isNull(playbackSlots.releasedAt), eq(playbackSlots.sessionId, input.sessionId)),
      );

    // Seules les lectures en cours **sur cet abonnement** comptent.
    const active = await tx
      .select({
        id: playbackSlots.id,
        email: users.email,
        itemLabel: playbackSlots.itemLabel,
        acquiredAt: playbackSlots.acquiredAt,
      })
      .from(playbackSlots)
      .innerJoin(users, eq(users.id, playbackSlots.userId))
      .where(
        and(
          isNull(playbackSlots.releasedAt),
          eq(playbackSlots.providerId, input.providerId),
        ),
      );

    if (active.length >= maxConnections) {
      // Etat de tous les abonnements : dire seulement « celui-ci est plein »
      // laisserait croire que plus rien n'est lisible.
      const allActive = await listActiveProviders(input.userId);
      const counts = await tx
        .select({ providerId: playbackSlots.providerId, n: raw<number>`count(*)` })
        .from(playbackSlots)
        .where(isNull(playbackSlots.releasedAt))
        .groupBy(playbackSlots.providerId);
      const used = new Map(counts.map((c) => [c.providerId, Number(c.n)]));

      const details: SlotConflictDetails = {
        providerName: provider.name,
        maxConnections,
        occupants: active.map((a) => ({
          userEmail: a.email,
          itemLabel: a.itemLabel || 'un contenu',
          since: a.acquiredAt.toISOString(),
        })),
        allProviders: allActive.map((p) => ({
          name: p.name,
          used: used.get(p.id) ?? 0,
          max: maxConnectionsOf(p),
        })),
      };
      const who = details.occupants
        .map((o) => `${o.userEmail} (${o.itemLabel})`)
        .join(', ');
      throw new AppError(
        409,
        'SLOT_LIMIT_REACHED',
        `L'abonnement "${provider.name}" utilise toutes ses connexions : ${who}.`,
        details,
      );
    }

    const [row] = await tx
      .insert(playbackSlots)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        providerId: input.providerId,
        itemType: input.itemType,
        itemId: input.itemId,
        itemLabel: input.itemLabel,
      })
      .returning({ id: playbackSlots.id });

    return { id: row!.id, reused: false };
  });
}

/**
 * Battement de coeur. Un slot deja recycle renvoie 404 : le client doit
 * relancer /api/play plutot que continuer a battre dans le vide.
 */
export async function heartbeatSlot(slotId: number, userId: number): Promise<void> {
  const rows = await db
    .update(playbackSlots)
    .set({ heartbeatAt: new Date() })
    .where(
      and(
        eq(playbackSlots.id, slotId),
        eq(playbackSlots.userId, userId),
        isNull(playbackSlots.releasedAt),
      ),
    )
    .returning({ id: playbackSlots.id });
  if (rows.length === 0) throw notFound('Slot de lecture expire ou deja libere.');
}

export async function releaseSlot(slotId: number, userId: number): Promise<void> {
  await db
    .update(playbackSlots)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(playbackSlots.id, slotId),
        eq(playbackSlots.userId, userId),
        isNull(playbackSlots.releasedAt),
      ),
    );
}

/** Un slot vivant est requis pour servir un segment : sinon la lecture est fantome. */
export async function isSlotAlive(slotId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: playbackSlots.id })
    .from(playbackSlots)
    .where(
      and(
        eq(playbackSlots.id, slotId),
        eq(playbackSlots.userId, userId),
        isNull(playbackSlots.releasedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Lectures en cours.
 *
 * Sans compte, toute la machine : la vue de supervision. Avec, les siennes —
 * c'est ce qu'on regarde pour savoir qui, dans le foyer, occupe la connexion
 * qu'on voudrait prendre.
 */
export async function listActiveSlots(userId?: number): Promise<ActiveSlotView[]> {
  await releaseStaleSlots();
  const rows = await db
    .select({
      id: playbackSlots.id,
      providerId: playbackSlots.providerId,
      providerName: providers.name,
      email: users.email,
      itemType: playbackSlots.itemType,
      itemId: playbackSlots.itemId,
      itemLabel: playbackSlots.itemLabel,
      acquiredAt: playbackSlots.acquiredAt,
      heartbeatAt: playbackSlots.heartbeatAt,
    })
    .from(playbackSlots)
    .innerJoin(users, eq(users.id, playbackSlots.userId))
    .innerJoin(providers, eq(providers.id, playbackSlots.providerId))
    .where(
      userId === undefined
        ? isNull(playbackSlots.releasedAt)
        : and(isNull(playbackSlots.releasedAt), eq(playbackSlots.userId, userId)),
    )
    .orderBy(playbackSlots.acquiredAt);

  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    providerName: r.providerName,
    userEmail: r.email,
    itemType: r.itemType,
    itemId: r.itemId,
    itemLabel: r.itemLabel || 'un contenu',
    acquiredAt: r.acquiredAt.toISOString(),
    heartbeatAt: r.heartbeatAt.toISOString(),
    deviceLabel: null,
  }));
}

/**
 * Coupure d'une lecture en cours.
 *
 * `ownerId` fourni, on ne peut couper que les siennes : liberer la connexion
 * qu'un autre foyer est en train d'utiliser n'aurait aucun sens depuis que
 * chaque compte paie la sienne. Omis, c'est la coupure de supervision.
 */
export async function killSlot(slotId: number, ownerId?: number): Promise<void> {
  const rows = await db
    .update(playbackSlots)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(playbackSlots.id, slotId),
        isNull(playbackSlots.releasedAt),
        ownerId === undefined ? undefined : eq(playbackSlots.userId, ownerId),
      ),
    )
    .returning({ id: playbackSlots.id });
  if (rows.length === 0) throw notFound('Slot introuvable ou deja libere.');
}

/**
 * Occupation par abonnement, plus le total.
 *
 * Sans compte, la maison entiere : c'est la vue de supervision. Avec, les
 * seuls abonnements de ce compte — c'est ce que lit l'indicateur de la barre,
 * et voir la saturation de quelqu'un d'autre n'y voudrait rien dire.
 */
export async function slotUsage(userId?: number): Promise<SlotUsage> {
  await releaseStaleSlots();
  const all =
    userId === undefined ? await listAllActiveProviders() : await listActiveProviders(userId);
  /*
   * Les playlists ne figurent pas dans le decompte.
   *
   * Elles n'ont pas de limite a montrer : y faire figurer une valeur, fut-elle
   * « illimite », gonflerait le total de l'indicateur et laisserait croire a
   * des places qui ne se comptent nulle part. L'indicateur repond « puis-je
   * lancer une lecture ? » — pour une playlist, la reponse est toujours oui.
   */
  const active = all.filter((p) => p.kind !== 'm3u');

  const counts = await db
    .select({
      providerId: playbackSlots.providerId,
      n: raw<number>`count(*)`,
    })
    .from(playbackSlots)
    .where(isNull(playbackSlots.releasedAt))
    .groupBy(playbackSlots.providerId);

  const byProvider = new Map(counts.map((c) => [c.providerId, Number(c.n)]));

  const rows = active.map((p) => ({
    id: p.id,
    name: p.name,
    used: byProvider.get(p.id) ?? 0,
    max: maxConnectionsOf(p),
  }));

  return {
    used: rows.reduce((sum, r) => sum + r.used, 0),
    max: rows.reduce((sum, r) => sum + r.max, 0),
    providers: rows,
  };
}
