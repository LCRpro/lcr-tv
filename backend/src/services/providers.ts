import { and, desc, eq, sql as raw } from 'drizzle-orm';
import type { ProviderTestResult, ProviderView } from '@iptv/shared';
import { db } from '../db/client.js';
import { forgetCatalogCache } from './catalog-cache.js';
import { profileProviderMutes, providers, type Provider } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { mask } from '../lib/redact.js';
import { probeM3u } from '../m3u/sync.js';
import { XtreamClient } from '../xtream/client.js';
import { normalizeBaseUrl } from '../xtream/urls.js';

/**
 * Vue publique : les credentials sont masques, jamais dechiffres pour l'API.
 *
 * Les jumeaux et la taille du catalogue ne se calculent que pour le listing —
 * une creation ou une modification renvoie la ligne seule, et la page recharge
 * la liste juste apres.
 */
export function toProviderView(
  row: Provider,
  extras: {
    sameAs?: number[];
    catalogue?: ProviderView['catalogue'];
    enabledHere?: boolean;
  } = {},
): ProviderView {
  const hasCredentials = row.kind === 'xtream';
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    // Une playlist n'a pas d'identifiants : un masque de points laisserait
    // croire qu'il en existe, et qu'on pourrait les relire.
    usernameMasked: hasCredentials ? mask(safeDecrypt(row.usernameEnc)) : '—',
    passwordMasked: hasCredentials ? '••••••••' : '—',
    epgUrl: row.epgUrl,
    isActive: row.isActive,
    // Hors contexte d'un profil (création, test, lecture d'une source), on
    // retombe sur l'état du compte : la vue n'est de toute façon pas une liste.
    enabledHere: extras.enabledHere ?? row.isActive,
    maxConnections: row.maxConnections,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.status,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    sameAs: extras.sameAs ?? [],
    catalogue: extras.catalogue ?? { live: 0, vod: 0, series: 0 },
  };
}

/**
 * Le masque du username est un confort d'UI. Si la MASTER_KEY a change, on ne
 * fait pas planter la page admin : on affiche un marqueur et le sync remontera
 * l'erreur reelle.
 */
function safeDecrypt(value: string | null): string {
  if (!value) return '';
  try {
    return decryptSecret(value);
  } catch {
    return '';
  }
}

export async function listProviders(
  userId: number,
  profileId?: number,
): Promise<ProviderView[]> {
  const rows = await db
    .select()
    .from(providers)
    .where(eq(providers.userId, userId))
    .orderBy(desc(providers.isActive), providers.id);
  if (rows.length === 0) return [];

  // Les sources que ce profil a éteintes : `enabledHere` les distingue des
  // autres, actives sur le compte et gardées par le profil. Sans profil (CLI),
  // on s'en tient à l'état du compte.
  const mutedRows =
    profileId == null
      ? []
      : await db
          .select({ providerId: profileProviderMutes.providerId })
          .from(profileProviderMutes)
          .where(eq(profileProviderMutes.profileId, profileId));
  const muted = new Set(mutedRows.map((r) => r.providerId));

  /*
   * La taille du catalogue par source, en lignes brutes.
   *
   * Deux requetes groupees pour toutes les sources : la page les affiche
   * rarement et ne les recharge pas avec les lectures. Le nom du serveur, lui,
   * ne sert qu'a reconnaitre deux comptes chez le meme fournisseur — il se
   * compare ici et ne sort pas.
   */
  const ids = raw.join(
    rows.map((r) => raw`${r.id}`),
    raw`, `,
  );
  const [streamCounts, seriesCounts] = await Promise.all([
    db.execute<{ provider_id: number; type: string; n: number }>(raw`
      select provider_id, type, count(*)::int as n from streams
      where removed_at is null and provider_id in (${ids})
      group by provider_id, type`),
    db.execute<{ provider_id: number; n: number }>(raw`
      select provider_id, count(*)::int as n from series
      where removed_at is null and provider_id in (${ids})
      group by provider_id`),
  ]);

  return rows.map((row) => {
    const catalogue = { live: 0, vod: 0, series: 0 };
    for (const c of streamCounts) {
      if (Number(c.provider_id) !== row.id) continue;
      if (c.type === 'live') catalogue.live = Number(c.n);
      else if (c.type === 'vod') catalogue.vod = Number(c.n);
    }
    for (const c of seriesCounts) {
      if (Number(c.provider_id) === row.id) catalogue.series = Number(c.n);
    }
    const sameAs = rows
      .filter(
        (peer) =>
          peer.id !== row.id &&
          row.kind === 'xtream' &&
          peer.kind === 'xtream' &&
          Boolean(row.serverName) &&
          peer.serverName === row.serverName,
      )
      .map((peer) => peer.id);
    return toProviderView(row, {
      sameAs,
      catalogue,
      enabledHere: row.isActive && !muted.has(row.id),
    });
  });
}

/**
 * Un profil (dés)active une source partagée, pour lui seul.
 *
 * On ne touche pas à `isActive` — l'état du compte, réglé au web — mais à la
 * liste des sources que *ce* profil a éteintes. Activer retire l'exception,
 * désactiver l'ajoute. Le catalogue du profil change : on oublie son cache.
 */
export async function setProviderEnabledForProfile(
  userId: number,
  profileId: number,
  providerId: number,
  enabled: boolean,
): Promise<void> {
  // La source doit appartenir au foyer : sinon « introuvable », on n'en dit pas plus.
  await getProvider(providerId, userId);

  if (enabled) {
    await db
      .delete(profileProviderMutes)
      .where(
        and(
          eq(profileProviderMutes.profileId, profileId),
          eq(profileProviderMutes.providerId, providerId),
        ),
      );
  } else {
    await db
      .insert(profileProviderMutes)
      .values({ profileId, providerId })
      .onConflictDoNothing();
  }
  forgetCatalogCache(userId);
}

/**
 * Un abonnement par son identifiant.
 *
 * `ownerId` fourni, l'abonnement doit lui appartenir — et un abonnement
 * d'autrui repond « introuvable » plutot que « interdit » : son existence meme
 * ne regarde pas celui qui demande. Omis, l'appelant a deja etabli le lien
 * autrement : la lecture resout le provider *du contenu*, lequel provient
 * necessairement d'une requete deja limitee aux abonnements du compte.
 */
export async function getProvider(id: number, ownerId?: number): Promise<Provider> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!row) throw notFound('Provider introuvable.');
  if (ownerId !== undefined && row.userId !== ownerId) throw notFound('Provider introuvable.');
  return row;
}

/**
 * Tous les abonnements actifs. Plusieurs peuvent l'etre en meme temps : chacun
 * apporte ses propres connexions simultanees, et un contenu est toujours lu
 * chez l'abonnement dont il provient.
 */
export async function listActiveProviders(userId: number): Promise<Provider[]> {
  return db
    .select()
    .from(providers)
    .where(and(eq(providers.userId, userId), eq(providers.isActive, true)))
    .orderBy(providers.id);
}

/**
 * Tous les abonnements actifs, comptes confondus.
 *
 * Reserve au planificateur : la synchronisation tourne pour la maison entiere,
 * elle ne peut donc pas se limiter a un compte. Aucune route ne doit l'appeler
 * — ce serait donner a voir les abonnements des autres.
 */
export async function listAllActiveProviders(): Promise<Provider[]> {
  return db.select().from(providers).where(eq(providers.isActive, true)).orderBy(providers.id);
}

/** Au moins un abonnement actif, sinon erreur explicite. */
export async function getActiveProviders(userId: number): Promise<Provider[]> {
  const rows = await listActiveProviders(userId);
  if (rows.length === 0) {
    throw new AppError(
      409,
      'NO_ACTIVE_PROVIDER',
      'Aucun abonnement actif : ajoutez le votre dans « Mes abonnements ».',
    );
  }
  return rows;
}

/**
 * Un abonnement actif quelconque. Reserve aux usages ou n'importe lequel fait
 * l'affaire ; toute operation liee a un contenu doit passer par le provider de
 * ce contenu, pas par celui-ci.
 */
export async function findActiveProvider(userId: number): Promise<Provider | null> {
  const [row] = await listActiveProviders(userId);
  return row ?? null;
}

/**
 * Rend a un compte les identifiants de **son** abonnement.
 *
 * La spec §5.1 disait « jamais renvoyes par l'API meme a un admin ». Elle a ete
 * ecrite quand les abonnements etaient globaux : l'admin y aurait lu ceux des
 * autres. Depuis qu'ils appartiennent au compte, ce sont les siens qu'il
 * redemande — ceux qu'il a saisis — pour les corriger sans les retaper de
 * memoire.
 *
 * Ce que la regle garde : `ownerId` est exige, un abonnement d'autrui repond
 * « introuvable », les identifiants ne sortent que par cette route appelee a la
 * demande, et jamais dans un listing. Le masquage dans les logs est inchange.
 */
export async function providerCredentials(
  id: number,
  ownerId: number,
): Promise<{ username: string; password: string }> {
  const row = await getProvider(id, ownerId);
  // Une playlist n'a pas d'identifiants : le formulaire n'a rien a preremplir.
  if (row.kind !== 'xtream' || !row.usernameEnc || !row.passwordEnc) {
    return { username: '', password: '' };
  }
  try {
    return { username: decryptSecret(row.usernameEnc), password: decryptSecret(row.passwordEnc) };
  } catch {
    throw new AppError(
      500,
      'INTERNAL',
      `Impossible de dechiffrer les identifiants de "${row.name}". MASTER_KEY a-t-elle change ?`,
    );
  }
}

/** Dechiffre les credentials et instancie un client. Le seul point qui les expose. */
export function clientFor(
  row: Provider,
  onWarn?: (message: string) => void,
): XtreamClient {
  /*
   * Une playlist n'a pas de client Xtream : l'appelant doit avoir regarde
   * `kind` avant. Le dire ici plutot que de dechiffrer du vide evite une
   * erreur de MASTER_KEY trompeuse sur une source qui n'a jamais eu de cle.
   */
  if (row.kind !== 'xtream') {
    throw new AppError(
      409,
      'BAD_REQUEST',
      `« ${row.name} » est une playlist : elle n'a pas d'API a interroger.`,
    );
  }
  let username: string;
  let password: string;
  try {
    username = decryptSecret(row.usernameEnc ?? '');
    password = decryptSecret(row.passwordEnc ?? '');
  } catch {
    throw new AppError(
      500,
      'INTERNAL',
      `Impossible de dechiffrer les identifiants du provider "${row.name}". MASTER_KEY a-t-elle change ?`,
    );
  }
  return new XtreamClient(
    { baseUrl: row.baseUrl, username, password },
    onWarn ? { onWarn } : {},
  );
}

/**
 * Une source, panel ou playlist.
 *
 * Les deux branches ne partagent que le nom, l'adresse et l'etat. Un panel
 * arrive avec des identifiants a chiffrer ; une playlist avec, au mieux, une
 * adresse de grille — et l'adresse de la playlist elle-meme est gardee telle
 * quelle : `normalizeBaseUrl` ne conserve que l'origine, ce qui effacerait le
 * chemin du fichier.
 */
export type ProviderInput = { userId: number; name: string; baseUrl: string; isActive?: boolean } & (
  | { kind?: 'xtream'; username: string; password: string }
  | { kind: 'm3u'; epgUrl?: string | undefined }
);

export async function createProvider(input: ProviderInput): Promise<ProviderView> {
  const isM3u = input.kind === 'm3u';
  return db.transaction(async (tx) => {
    // Ajouter un abonnement n'en desactive aucun autre : plusieurs peuvent
    // servir en meme temps, et leurs connexions s'additionnent.
    const [row] = await tx
      .insert(providers)
      .values({
        userId: input.userId,
        name: input.name,
        kind: isM3u ? 'm3u' : 'xtream',
        baseUrl: isM3u ? input.baseUrl.trim() : normalizeBaseUrl(input.baseUrl),
        usernameEnc: isM3u ? null : encryptSecret(input.username),
        passwordEnc: isM3u ? null : encryptSecret(input.password),
        epgUrl: isM3u && input.epgUrl ? input.epgUrl.trim() : null,
        isActive: input.isActive ?? false,
      })
      .returning();
    // Un abonnement de plus, c'est un catalogue different : ce que le compte a
    // en memoire (comptes par categorie, logos, langues) ne vaut plus rien.
    forgetCatalogCache(input.userId);
    return toProviderView(row!);
  });
}

/** Seuls les champs presents sont ecrits : l'UI n'envoie que ce qui a change. */
export async function updateProvider(
  id: number,
  ownerId: number,
  patch: {
    name?: string;
    baseUrl?: string;
    username?: string;
    password?: string;
    epgUrl?: string;
    isActive?: boolean;
  },
): Promise<ProviderView> {
  const existing = await getProvider(id, ownerId);
  const isM3u = existing.kind === 'm3u';
  return db.transaction(async (tx) => {
    const values: Partial<typeof providers.$inferInsert> = {};
    if (patch.name !== undefined) values.name = patch.name;
    // L'adresse d'une playlist est un chemin de fichier : la reduire a son
    // origine, comme on le fait d'un panel, effacerait la playlist elle-meme.
    if (patch.baseUrl !== undefined) {
      values.baseUrl = isM3u ? patch.baseUrl.trim() : normalizeBaseUrl(patch.baseUrl);
    }
    if (!isM3u && patch.username !== undefined) values.usernameEnc = encryptSecret(patch.username);
    if (!isM3u && patch.password !== undefined) values.passwordEnc = encryptSecret(patch.password);
    // Vider le champ retire la grille : la chaine vide est un choix, pas un oubli.
    if (isM3u && patch.epgUrl !== undefined) values.epgUrl = patch.epgUrl.trim() || null;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;

    if (Object.keys(values).length === 0) {
      const [row] = await tx.select().from(providers).where(eq(providers.id, id)).limit(1);
      return toProviderView(row!);
    }
    const [row] = await tx
      .update(providers)
      .set(values)
      .where(eq(providers.id, id))
      .returning();
    // Activer ou desactiver change le catalogue parcourable a lui seul.
    forgetCatalogCache(ownerId);
    return toProviderView(row!);
  });
}

/**
 * Active ou desactive un abonnement, sans toucher aux autres. Desactiver ne
 * detruit pas son catalogue : les lignes restent en base avec leurs favoris,
 * elles cessent simplement d'etre parcourables.
 */
export async function setProviderActive(
  id: number,
  ownerId: number,
  isActive: boolean,
): Promise<ProviderView> {
  return updateProvider(id, ownerId, { isActive });
}

/**
 * Suppression d'un provider. Le catalogue rattache part avec lui (cascade) :
 * c'est le seul endroit de l'application qui detruit vraiment des lignes, et
 * il est reserve au nettoyage d'une saisie ratee. Un provider actif doit
 * d'abord etre desactive, pour eviter de vider le catalogue par megarde.
 */
export async function deleteProvider(id: number, ownerId: number): Promise<void> {
  const row = await getProvider(id, ownerId);
  if (row.isActive) {
    throw badRequest(
      'Cet abonnement est actif : desactivez-le avant de le supprimer, sinon son catalogue part avec lui.',
    );
  }
  await db.delete(providers).where(eq(providers.id, id));
  forgetCatalogCache(ownerId);
}

export async function testProvider(id: number, ownerId: number): Promise<ProviderTestResult> {
  const row = await getProvider(id, ownerId);

  /*
   * Tester une playlist, c'est la lire.
   *
   * Il n'y a pas de compte a interroger : la seule question qui vaille est
   * « l'adresse repond-elle, et le fichier est-il lisible ? ». Le nombre de
   * chaines est la reponse utile — une playlist qui en annonce zero est
   * generalement une page d'erreur servie en 200.
   */
  if (row.kind === 'm3u') {
    const empty = {
      status: null,
      expiresAt: null,
      maxConnections: null,
      activeConnections: null,
      serverName: null,
    };
    try {
      const { count } = await probeM3u(row.baseUrl);
      return {
        ...empty,
        ok: count > 0,
        message:
          count > 0
            ? `Playlist lisible : ${count} chaine(s).`
            : "L'adresse repond mais ne contient aucune chaine lisible.",
      };
    } catch (err) {
      return { ...empty, ok: false, message: (err as Error).message };
    }
  }

  const client = clientFor(row);
  try {
    const { userInfo, serverInfo } = await client.getAccountInfo();
    // max_connections est lu ici, jamais suppose.
    await db
      .update(providers)
      .set({
        maxConnections: userInfo.max_connections,
        activeConnections: userInfo.active_cons,
        status: userInfo.status,
        expiresAt: userInfo.exp_date,
        serverName: serverInfo.url ?? null,
      })
      .where(eq(providers.id, id));

    const active = userInfo.status === null || /active/i.test(userInfo.status);
    return {
      ok: active,
      status: userInfo.status,
      expiresAt: userInfo.exp_date?.toISOString() ?? null,
      maxConnections: userInfo.max_connections,
      activeConnections: userInfo.active_cons,
      serverName: serverInfo.url ?? null,
      message: active
        ? `Connexion etablie. ${userInfo.max_connections ?? '?'} connexion(s) simultanee(s) autorisee(s).`
        : `Le panel repond mais le compte est en statut "${userInfo.status}".`,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      expiresAt: null,
      maxConnections: null,
      activeConnections: null,
      serverName: null,
      message: err instanceof AppError ? err.message : 'Panel injoignable.',
    };
  }
}

/**
 * Nombre de connexions simultanees autorisees. `null` en base signifie
 * "jamais teste" : on refuse de deviner et on prend 1, la valeur la plus prudente.
 */
export function maxConnectionsOf(row: Provider): number {
  /*
   * Une playlist ne compte pas de connexions.
   *
   * La limite est une regle du panel, appliquee par lui : il refuse la lecture
   * au-dela de N flux simultanes, et `user_info` dit combien. Un fichier M3U
   * n'a ni compte ni compteur — les flux qu'il liste appartiennent a des hotes
   * qui ne se connaissent pas entre eux. Lui appliquer la valeur de repli
   * bloquerait une deuxieme lecture au nom d'une limite qui n'existe pas.
   */
  if (row.kind === 'm3u') return Number.MAX_SAFE_INTEGER;
  return row.maxConnections && row.maxConnections > 0 ? row.maxConnections : 1;
}
