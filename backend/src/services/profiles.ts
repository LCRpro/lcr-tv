import { and, asc, eq, sql as raw } from 'drizzle-orm';
import {
  MAX_PROFILES,
  type Profile,
  type ProfileAvatar,
  type ProfileColor,
  type ProfileInput,
} from '@iptv/shared';
import { db } from '../db/client.js';
import { profiles, sessions, users, type ProfileRow } from '../db/schema.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';

/**
 * Le profil ne peut jamais depasser le compte.
 *
 * `users.can_watch_adult` est pose par l'administrateur : c'est le plafond du
 * foyer. Un profil choisit en dessous, jamais au-dessus — sinon n'importe qui
 * contournerait le reglage en creant un profil de plus. Un profil enfant est
 * ferme quoi qu'autorise le compte.
 */
function effectiveAdult(row: ProfileRow, accountAdult: boolean): boolean {
  return accountAdult && row.canWatchAdult && !row.isKid;
}

export function toProfile(row: ProfileRow, accountAdult: boolean): Profile {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar as ProfileAvatar,
    color: row.color as ProfileColor,
    isKid: row.isKid,
    canWatchAdult: effectiveAdult(row, accountAdult),
    languages: row.languages,
    languageFilters: {
      vod: row.langFilterVod,
      series: row.langFilterSeries,
      live: row.langFilterLive,
    },
    uiLanguage: row.uiLanguage,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProfiles(userId: number, accountAdult: boolean): Promise<Profile[]> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(asc(profiles.createdAt), asc(profiles.id));
  return rows.map((r) => toProfile(r, accountAdult));
}

async function findOwned(userId: number, profileId: number): Promise<ProfileRow> {
  const [row] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);
  // Meme reponse qu'un identifiant inexistant : appartenir a un autre compte ne
  // doit pas etre distinguable de ne pas exister.
  if (!row) throw notFound('Profil introuvable.');
  return row;
}

export async function createProfile(
  userId: number,
  accountAdult: boolean,
  input: ProfileInput,
): Promise<Profile> {
  const [count] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if ((count?.n ?? 0) >= MAX_PROFILES) {
    throw new AppError(
      409,
      'CONFLICT',
      `Ce compte a deja ${MAX_PROFILES} profils, le maximum.`,
    );
  }

  try {
    const [row] = await db
      .insert(profiles)
      .values({
        userId,
        name: input.name,
        avatar: input.avatar ?? 'wave',
        color: input.color ?? 'cyan',
        isKid: input.isKid ?? false,
        // Un profil naissant est ferme : on l'ouvre ensuite, sciemment.
        canWatchAdult: input.isKid ? false : (input.canWatchAdult ?? false),
        ...(input.languages ? { languages: input.languages } : {}),
        ...(input.languageFilters?.vod !== undefined ? { langFilterVod: input.languageFilters.vod } : {}),
        ...(input.languageFilters?.series !== undefined
          ? { langFilterSeries: input.languageFilters.series }
          : {}),
        ...(input.languageFilters?.live !== undefined
          ? { langFilterLive: input.languageFilters.live }
          : {}),
        ...(input.uiLanguage !== undefined ? { uiLanguage: input.uiLanguage } : {}),
      })
      .returning();
    return toProfile(row!, accountAdult);
  } catch (err) {
    // Index unique sur (user_id, lower(name)).
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw badRequest('Un profil porte deja ce nom.');
    }
    throw err;
  }
}

export async function updateProfile(
  userId: number,
  accountAdult: boolean,
  profileId: number,
  input: ProfileInput,
): Promise<Profile> {
  const current = await findOwned(userId, profileId);
  const isKid = input.isKid ?? current.isKid;
  try {
    const [row] = await db
      .update(profiles)
      .set({
        name: input.name,
        avatar: input.avatar ?? current.avatar,
        color: input.color ?? current.color,
        isKid,
        canWatchAdult: isKid ? false : (input.canWatchAdult ?? current.canWatchAdult),
        languages: input.languages ?? current.languages,
        // Une liste vide **efface** le filtre ; `undefined` le laisse en place.
        langFilterVod: input.languageFilters?.vod ?? current.langFilterVod,
        langFilterSeries: input.languageFilters?.series ?? current.langFilterSeries,
        langFilterLive: input.languageFilters?.live ?? current.langFilterLive,
        // `undefined` laisse en place, `null` remet sur « automatique ».
        uiLanguage: input.uiLanguage === undefined ? current.uiLanguage : input.uiLanguage,
      })
      .where(eq(profiles.id, profileId))
      .returning();
    return toProfile(row!, accountAdult);
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw badRequest('Un profil porte deja ce nom.');
    }
    throw err;
  }
}

/**
 * Supprime un profil, et avec lui sa liste et son historique (cascade).
 *
 * Le dernier profil n'est pas supprimable : un compte sans profil ne mene nulle
 * part, et l'ecran suivant serait un selecteur vide dont on ne peut pas sortir.
 */
export async function deleteProfile(userId: number, profileId: number): Promise<void> {
  await findOwned(userId, profileId);
  const [count] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if ((count?.n ?? 0) <= 1) {
    throw new AppError(409, 'CONFLICT', 'Un compte garde au moins un profil.');
  }
  await db.delete(profiles).where(eq(profiles.id, profileId));
}

/**
 * Attache un profil a la session en cours.
 *
 * Le choix vit dans la session et non dans le client : rouvrir l'onglet ou
 * relancer l'application ne doit pas redemander qui regarde, et un autre
 * appareil garde son propre choix.
 */
export async function selectProfile(
  userId: number,
  accountAdult: boolean,
  sessionId: number,
  profileId: number,
): Promise<Profile> {
  const row = await findOwned(userId, profileId);
  await db.update(sessions).set({ profileId: row.id }).where(eq(sessions.id, sessionId));
  return toProfile(row, accountAdult);
}

/** Detache le profil : la session reste ouverte, on repasse par le selecteur. */
export async function clearProfile(sessionId: number): Promise<void> {
  await db.update(sessions).set({ profileId: null }).where(eq(sessions.id, sessionId));
}

/**
 * Profil par defaut d'un compte qui n'en aurait aucun.
 *
 * Ne devrait pas arriver — la migration en a cree un par compte, et les comptes
 * crees ensuite passent par `createProfile`. C'est un filet : sans profil, le
 * catalogue entier repond 409 et le compte est inutilisable.
 */
export async function ensureProfile(userId: number): Promise<void> {
  const [count] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if ((count?.n ?? 0) > 0) return;
  const [account] = await db
    .select({ email: users.email, adult: users.canWatchAdult })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const base = (account?.email ?? 'Profil').split('@')[0] ?? 'Profil';
  await db.insert(profiles).values({
    userId,
    name: base.charAt(0).toUpperCase() + base.slice(1),
    canWatchAdult: account?.adult ?? false,
  });
}
