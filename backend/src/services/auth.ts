import { and, desc, eq, gt, lt, ne, sql as raw } from 'drizzle-orm';
import type { AccountDetail, AdminUserView, CurrentUser, DeviceSession } from '@iptv/shared';
import { db } from '../db/client.js';
import {
  profiles,
  providers,
  sessions,
  streams,
  users,
  type ProfileRow,
  type SessionRow,
  type UserRow,
} from '../db/schema.js';
import { timingSafeEqual } from 'node:crypto';
import { generateSessionToken, hashToken } from '../lib/crypto.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { env } from '../config/env.js';

export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    canWatchAdult: row.canWatchAdult,
  };
}

function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 3600 * 1000);
}

export interface LoginResult {
  user: UserRow;
  session: SessionRow;
  /** Le token en clair n'existe qu'ici : la base n'en garde que le hash. */
  token: string;
}

export async function login(input: {
  email: string;
  password: string;
  deviceLabel?: string | undefined;
  userAgent?: string | undefined;
}): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(users)
    .where(raw`lower(${users.email}) = ${email}`)
    .limit(1);

  // Meme message et meme cout dans les deux cas : ne pas reveler l'existence du compte.
  const digest = row?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000';
  const ok = await verifyPassword(digest, input.password);
  if (!row || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }
  if (!row.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est desactive.');
  }

  const token = generateSessionToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: row.id,
      tokenHash: hashToken(token),
      deviceLabel: input.deviceLabel ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      expiresAt: sessionExpiry(),
    })
    .returning();

  return { user: row, session: session!, token };
}

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
  /**
   * Profil choisi pour cette session. Nul juste apres la connexion, tant que
   * personne n'a repondu a « qui regarde ? ».
   */
  profile: ProfileRow | null;
}

/**
 * Resolution d'un token, quel que soit son transport. Une session expiree est
 * supprimee au passage plutot que laissee a trainer.
 */
export async function resolveToken(token: string): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users, profile: profiles })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // Jointure externe : une session sans profil choisi reste valide, elle mene
    // simplement au selecteur au lieu du catalogue.
    .leftJoin(profiles, eq(profiles.id, sessions.profileId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  if (!row.user.isActive) {
    // Desactiver un compte doit couper ses sessions immediatement.
    await db.delete(sessions).where(eq(sessions.userId, row.user.id));
    return null;
  }

  // Ecriture au plus une fois par minute : le heartbeat de lecture passe ici souvent.
  if (Date.now() - row.session.lastSeenAt.getTime() > 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.session.id));
  }

  return { user: row.user, session: row.session, profile: row.profile };
}

export async function revokeSession(sessionId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Deconnexion d'un appareil depuis /compte : l'utilisateur ne peut viser que les siens. */
export async function revokeOwnSession(userId: number, sessionId: number): Promise<void> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  if (deleted.length === 0) throw notFound('Appareil introuvable.');
}

/** Tous les appareils du compte sauf celui qui demande. Renvoie combien sont partis. */
export async function revokeOtherSessions(userId: number, keepSessionId: number): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
    .returning({ id: sessions.id });
  return deleted.length;
}

export async function listUserSessions(
  userId: number,
  currentSessionId: number,
): Promise<DeviceSession[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));

  return rows.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    userAgent: s.userAgent,
    lastSeenAt: s.lastSeenAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    current: s.id === currentSessionId,
  }));
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  keepSessionId: number,
): Promise<void> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw notFound('Compte introuvable.');
  if (!(await verifyPassword(row.passwordHash, currentPassword))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Mot de passe actuel incorrect.');
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, userId));
  // Changer son mot de passe deconnecte les autres appareils, pas celui en cours.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

/** Menage des sessions expirees, appele au demarrage et par le job quotidien. */
export async function purgeExpiredSessions(): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return rows.length;
}

// --------------------------------------------------------------------- admin

export async function listUsers(): Promise<AdminUserView[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      canWatchAdult: users.canWatchAdult,
      isActive: users.isActive,
      createdAt: users.createdAt,
      // Noms en clair et alias explicite : dans un template `sql`, Drizzle rend
      // les colonnes sans prefixe, ce qui casserait la correlation.
      sessionCount: raw<number>`(select count(*) from sessions sub where sub.user_id = users.id and sub.expires_at > now())`,
      // Ce que le tableau compare d'un compte a l'autre : deux sous-requetes
      // pour tous, la ou le depli en faisait une par compte ouvert.
      activeProviders: raw<number>`(select count(*) from providers p where p.user_id = users.id and p.is_active)`,
      lastSeenAt: raw<Date | string | null>`(select max(sub.last_seen_at) from sessions sub where sub.user_id = users.id)`,
    })
    .from(users)
    .orderBy(users.id);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    canWatchAdult: r.canWatchAdult,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    sessionCount: Number(r.sessionCount),
    activeProviders: Number(r.activeProviders),
    // Un `timestamptz` calcule arrive en chaine ou en `Date` selon le chemin.
    lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
  }));
}

/**
 * Ce qu'un administrateur peut savoir d'un compte sans en violer l'intimite.
 *
 * Les noms de profils, les abonnements (nom et etat, jamais l'URL ni les
 * identifiants), la taille du catalogue et la derniere activite : de quoi
 * repondre a « ce compte s'en sert-il, et est-ce que ca marche ». Ni favoris,
 * ni historique, ni ce qui est en train d'etre regarde — l'administration
 * ouvre et ferme des acces, elle ne regarde pas par-dessus l'epaule.
 */
export async function accountDetail(userId: number): Promise<AccountDetail> {
  const [profileRows, providerRows, catalogue] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.name, isKid: profiles.isKid })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .orderBy(profiles.createdAt),
    db
      .select({
        id: providers.id,
        name: providers.name,
        isActive: providers.isActive,
        maxConnections: providers.maxConnections,
        expiresAt: providers.expiresAt,
        lastSyncAt: providers.lastSyncAt,
      })
      .from(providers)
      .where(eq(providers.userId, userId))
      .orderBy(providers.id),
    db
      .select({
        live: raw<number>`count(*) filter (where streams.type = 'live')`,
        vod: raw<number>`count(*) filter (where streams.type = 'vod')`,
      })
      .from(streams)
      .where(
        raw`streams.removed_at is null and streams.provider_id in (
          select id from providers where user_id = ${userId}
        )`,
      ),
  ]);

  const [lastSeen] = await db
    .select({ at: raw<Date | null>`max(sessions.last_seen_at)` })
    .from(sessions)
    .where(eq(sessions.userId, userId));

  return {
    profiles: profileRows,
    providers: providerRows.map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      maxConnections: p.maxConnections,
      expiresAt: p.expiresAt?.toISOString() ?? null,
      lastSyncAt: p.lastSyncAt?.toISOString() ?? null,
    })),
    catalogue: {
      live: Number(catalogue[0]?.live ?? 0),
      vod: Number(catalogue[0]?.vod ?? 0),
    },
    lastSeenAt: lastSeen?.at ? new Date(lastSeen.at).toISOString() : null,
  };
}

export async function createUser(input: {
  email: string;
  password: string;
  role?: 'admin' | 'user';
  canWatchAdult?: boolean;
}): Promise<AdminUserView> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(raw`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) throw badRequest('Un compte utilise deja cet email.');

  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? 'user',
      canWatchAdult: input.canWatchAdult ?? false,
    })
    .returning();

  return {
    id: row!.id,
    email: row!.email,
    role: row!.role,
    canWatchAdult: row!.canWatchAdult,
    isActive: row!.isActive,
    createdAt: row!.createdAt.toISOString(),
    sessionCount: 0,
    activeProviders: 0,
    lastSeenAt: null,
  };
}

export async function updateUser(
  id: number,
  patch: {
    password?: string;
    role?: 'admin' | 'user';
    canWatchAdult?: boolean;
    isActive?: boolean;
  },
  actingUserId: number,
): Promise<void> {
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) throw notFound('Compte introuvable.');

  // Garde-fou : ne pas se retirer soi-meme l'admin ou l'acces, on se verrouille dehors.
  if (id === actingUserId) {
    if (patch.role === 'user') throw badRequest('Impossible de retirer son propre role admin.');
    if (patch.isActive === false) throw badRequest('Impossible de desactiver son propre compte.');
  }
  if (target.role === 'admin' && (patch.role === 'user' || patch.isActive === false)) {
    const admins = await db
      .select({ n: raw<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.isActive, true)));
    if (Number(admins[0]?.n ?? 0) <= 1) {
      throw badRequest('Il doit rester au moins un administrateur actif.');
    }
  }

  const values: Partial<typeof users.$inferInsert> = {};
  if (patch.password !== undefined) values.passwordHash = await hashPassword(patch.password);
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.canWatchAdult !== undefined) values.canWatchAdult = patch.canWatchAdult;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;
  if (Object.keys(values).length === 0) return;

  await db.update(users).set(values).where(eq(users.id, id));

  // Desactivation ou changement de mot de passe : les sessions existantes sautent.
  if (patch.isActive === false || patch.password !== undefined) {
    await db.delete(sessions).where(eq(sessions.userId, id));
  }
}

/**
 * Changement d'adresse.
 *
 * Le mot de passe est exige : l'adresse est l'identifiant de connexion, et un
 * navigateur laisse ouvert suffit sinon a se faire remettre le compte. Les
 * sessions ne sautent pas — c'est le meme compte, on ne fait que le renommer.
 */
export async function changeEmail(
  userId: number,
  password: string,
  newEmail: string,
): Promise<string> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw notFound('Compte introuvable.');
  if (!(await verifyPassword(row.passwordHash, password))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Mot de passe incorrect.');
  }

  const email = newEmail.trim().toLowerCase();
  if (email === row.email.toLowerCase()) return row.email;

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(raw`lower(${users.email}) = ${email}`, ne(users.id, userId)))
    .limit(1);
  if (taken) throw badRequest('Un compte utilise deja cette adresse.');

  await db.update(users).set({ email }).where(eq(users.id, userId));
  return email;
}

/**
 * Plafond « categories adultes » du compte.
 *
 * Le retirer ferme aussi tous les profils qui l'avaient : sinon un profil
 * garderait un droit que son compte n'accorde plus, et le rouvrir plus tard le
 * lui rendrait sans que personne ne l'ait demande. La lecture croise deja les
 * deux (`viewerOf`), mais l'etat en base doit dire la verite — c'est lui que
 * l'ecran des profils affiche.
 */
export async function setAccountAdult(userId: number, canWatchAdult: boolean): Promise<void> {
  await db.update(users).set({ canWatchAdult }).where(eq(users.id, userId));
  if (!canWatchAdult) {
    await db.update(profiles).set({ canWatchAdult: false }).where(eq(profiles.userId, userId));
  }
}

/**
 * Inscription en libre-service.
 *
 * Le compte cree est toujours ordinaire et toujours ferme aux categories
 * adultes : ni le role ni ce droit ne se demandent, ils s'accordent. Un profil
 * l'accompagne d'emblee, faute de quoi le nouveau venu arriverait sur un
 * selecteur vide.
 *
 * La connexion est immediate. Demander de se reconnecter juste apres avoir
 * saisi deux fois son mot de passe n'apprend rien a personne.
 */
export async function signup(input: {
  email: string;
  password: string;
  profileName?: string | undefined;
  code?: string | undefined;
  deviceLabel?: string | undefined;
  userAgent?: string | undefined;
}): Promise<LoginResult> {
  if (env.SIGNUP_MODE === 'closed') {
    throw new AppError(
      403,
      'FORBIDDEN',
      "Les inscriptions sont fermees sur cette installation : demandez un compte a l'administrateur.",
    );
  }
  if (env.SIGNUP_MODE === 'code') {
    /*
     * Comparaison a temps constant : le code est un secret partage, et un
     * `!==` laisse fuir sa longueur puis ses premiers caracteres a qui mesure
     * les temps de reponse. Les longueurs sont comparees d'abord parce que
     * `timingSafeEqual` jette sur des tampons de tailles differentes.
     */
    const given = Buffer.from(input.code ?? '', 'utf8');
    const expected = Buffer.from(env.SIGNUP_CODE ?? '', 'utf8');
    const ok = given.length === expected.length && timingSafeEqual(given, expected);
    if (!ok) throw new AppError(403, 'FORBIDDEN', "Code d'invitation invalide.");
  }

  const email = input.email.trim().toLowerCase();
  const created = await createUser({ email, password: input.password });

  const base = input.profileName?.trim() || (email.split('@')[0] ?? 'Profil');
  await db.insert(profiles).values({
    userId: created.id,
    name: base.charAt(0).toUpperCase() + base.slice(1),
  });

  return login({
    email,
    password: input.password,
    deviceLabel: input.deviceLabel,
    userAgent: input.userAgent,
  });
}

/** Cree le premier admin si aucun compte n'existe. Idempotent. */
export async function seedAdmin(
  email: string,
  password: string,
): Promise<{ created: boolean; email: string }> {
  const existing = await db.select({ n: raw<number>`count(*)` }).from(users);
  if (Number(existing[0]?.n ?? 0) > 0) return { created: false, email };
  await createUser({ email, password, role: 'admin', canWatchAdult: true });
  return { created: true, email: email.trim().toLowerCase() };
}
