import { sql } from 'drizzle-orm';
import type { ProviderKind } from '@iptv/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const categoryType = pgEnum('category_type', ['live', 'vod', 'series']);
export const streamType = pgEnum('stream_type', ['live', 'vod']);
export const itemType = pgEnum('item_type', ['stream', 'series', 'episode']);
export const userRole = pgEnum('user_role', ['admin', 'user']);
export const syncStatus = pgEnum('sync_status', ['running', 'done', 'failed']);

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// ------------------------------------------------------------------ provider

export const providers = pgTable(
  'providers',
  {
    id: serial().primaryKey(),
    /*
     * Chaque compte apporte ses propres abonnements.
     *
     * Globaux, ils faisaient partager un seul catalogue et surtout les memes
     * connexions simultanees : ouvrir l'inscription revenait a distribuer sa
     * place devant la television. Rattaches au compte, un nouveau venu arrive
     * avec son abonnement, voit son catalogue et consomme ses connexions.
     */
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /*
     * La sorte de source.
     *
     * Un panel Xtream se parcourt par une API : categories, synopsis, saisons,
     * et `max_connections`, d'ou l'indicateur de connexions tire son chiffre.
     * Une playlist M3U est un fichier texte sans compte : on la telecharge, on
     * la lit, et elle ne consomme aucune place puisqu'il n'y en a pas a compter.
     */
    kind: text().notNull().default('xtream').$type<ProviderKind>(),
    /** Le panel Xtream, ou l'adresse de la playlist selon `kind`. */
    baseUrl: text().notNull(),
    /*
     * AES-256-GCM. Ces deux colonnes ne sortent jamais de la base en clair.
     * Nulles pour une playlist, qui n'a pas d'identifiants a proteger.
     */
    usernameEnc: text(),
    passwordEnc: text(),
    /*
     * Le XMLTV d'une playlist, quand le fournisseur en donne un.
     *
     * Chez Xtream la grille se deduit des identifiants (`xmltv.php`) ; une
     * playlist ne dit rien de la sienne, il faut la demander a part.
     */
    epgUrl: text(),
    isActive: boolean().notNull().default(false),
    // Lu depuis user_info au sync, jamais codé en dur.
    maxConnections: integer(),
    activeConnections: integer(),
    status: text(),
    expiresAt: timestamp({ withTimezone: true }),
    serverName: text(),
    lastSyncAt: timestamp({ withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    /*
     * Plusieurs providers peuvent etre actifs pour un meme compte : chaque
     * abonnement apporte ses propres connexions simultanees, et elles
     * s'additionnent. L'index sert la question posee a chaque requete de
     * catalogue : « quels abonnements actifs ce compte a-t-il ? ».
     */
    index('providers_user_active_idx').on(t.userId, t.isActive),
  ],
);

// --------------------------------------------------------------------- users

export const users = pgTable(
  'users',
  {
    id: serial().primaryKey(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: userRole().notNull().default('user'),
    canWatchAdult: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    createdAt: now(),
  },
  (t) => [uniqueIndex('users_email_idx').on(sql`lower(${t.email})`)],
);

/**
 * Un compte, plusieurs profils.
 *
 * Le compte porte l'identite et les droits : c'est lui qui s'authentifie, lui
 * que l'administrateur active ou desactive, lui qui consomme les connexions de
 * l'abonnement. Le profil porte les gouts : la liste, l'historique, les chaines
 * epinglees. Sans cette separation la maison partageait une seule « reprendre
 * la lecture », ce qui la rendait inutilisable des qu'on est plus d'un.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /*
     * Vignette choisie dans une liste, jamais un fichier televerse : pas de
     * stockage a gerer, pas de contenu a moderer, et l'avatar reste lisible a
     * trois metres sur un ecran de television.
     */
    avatar: text().notNull().default('wave'),
    color: text().notNull().default('cyan'),
    isKid: boolean().notNull().default(false),
    /*
     * Ne peut qu'etre plus restrictif que le compte, jamais plus permissif :
     * `users.canWatchAdult` reste le plafond, pose par l'administrateur.
     */
    canWatchAdult: boolean().notNull().default(false),
    /*
     * Les langues mises en avant, de une a trois, dans l'ordre de preference.
     *
     * Tout ce qui classait le catalogue disait « francais d'abord » en dur.
     * C'etait le bon defaut pour ce foyer, mais un defaut ecrit dans le code
     * plutot qu'un choix. Sur le profil et non sur le compte, pour la meme
     * raison que les favoris : deux personnes d'un meme foyer ne regardent pas
     * dans la meme langue.
     */
    languages: text().array().notNull().default(['FR']),
    /*
     * La langue de l'interface. Nulle par defaut : elle suit alors les langues
     * ci-dessus. Deux reglages et non un seul, parce que classer son catalogue
     * en italien ne veut pas dire vouloir des boutons en italien — d'autant que
     * l'interface n'existe qu'en quatre langues, le catalogue en cent
     * vingt-sept.
     */
    uiLanguage: text(),
    createdAt: now(),
  },
  (t) => [
    index('profiles_user_idx').on(t.userId, t.createdAt),
    // Deux profils du meme nom dans un foyer ne se distinguent plus.
    uniqueIndex('profiles_user_name_idx').on(t.userId, sql`lower(${t.name})`),
  ],
);

/**
 * Les textes TMDB, une ligne par oeuvre et par langue.
 *
 * TMDB livre toutes ses traductions dans le meme appel que la fiche : le
 * multilingue ne coute aucune requete de plus, seulement du stockage. La cle
 * est l'identifiant TMDB et non la ligne du catalogue — le fournisseur publie
 * la meme oeuvre 3,26 fois en moyenne, une seule ligne les sert toutes.
 */
export const tmdbTexts = pgTable(
  'tmdb_texts',
  {
    /** 'movie' ou 'tv', comme les chemins de l'API. */
    kind: text().notNull(),
    tmdbId: text().notNull(),
    /** Code a deux lettres en majuscules, comme `streams.langCode`. */
    lang: text().notNull(),
    title: text(),
    plot: text(),
    fetchedAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.tmdbId, t.lang] }),
    index('tmdb_texts_lang_idx').on(t.lang, t.kind, t.tmdbId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /*
     * Le profil choisi vit dans la session : recharger la page ne doit pas
     * redemander qui regarde. Nul tant que le choix n'est pas fait.
     */
    profileId: integer().references(() => profiles.id, { onDelete: 'set null' }),
    // HMAC du token opaque : la base ne contient jamais le token lui-meme.
    tokenHash: text().notNull(),
    deviceLabel: text(),
    userAgent: text(),
    lastSeenAt: now(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

// ----------------------------------------------------------------- catalogue

export const categories = pgTable(
  'categories',
  {
    id: serial().primaryKey(),
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    xtreamId: text().notNull(),
    type: categoryType().notNull(),
    name: text().notNull(),
    isAdult: boolean().notNull().default(false),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('categories_provider_type_xtream_idx').on(
      t.providerId,
      t.type,
      t.xtreamId,
    ),
    index('categories_identity_idx').on(t.type, t.xtreamId, t.providerId),
  ],
);

export const streams = pgTable(
  'streams',
  {
    id: serial().primaryKey(),
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    /*
     * L'identifiant chez le fournisseur.
     *
     * Xtream le donne. Une playlist n'en a pas : on le derive alors du nom et
     * du groupe de la ligne, de facon a ce que la meme chaine retrouve la meme
     * ligne d'une synchronisation a l'autre — voir `m3uStreamId`.
     */
    xtreamId: integer().notNull(),
    type: streamType().notNull(),
    name: text().notNull(),
    /*
     * L'adresse du flux, quand elle ne se calcule pas.
     *
     * Chez Xtream on la fabrique a la demande — base, identifiants, numero —
     * et rien n'est stocke : les identifiants n'ont pas a etre recopies dans
     * 300 000 lignes. Une playlist porte l'adresse complete sur chaque ligne,
     * souvent vers un hote different d'elle-meme : la, il faut la garder.
     */
    sourceUrl: text(),
    // minuscule + unaccent, calculee par la base pour rester coherente avec la recherche.
    nameNormalized: text().generatedAlwaysAs(sql`public.normalize_name(name)`),
    /*
     * Nom sur lequel on cherche : le titre sans le bruit du fournisseur.
     *
     * `name_normalized` garde « fr - canal+ fhd ◉ ». Le prefixe de langue, la
     * qualite et les decorations diluaient la similarite trigramme au point
     * d'inverser le classement : « canal + » remontait « ##### MX - CANAL ##### »
     * (0,667) devant « FR - CANAL+ FHD » (0,500), mesure sur le catalogue.
     */
    searchName: text().generatedAlwaysAs(sql`public.search_name(name)`),
    /*
     * Meme nom, sans espace ni ponctuation.
     *
     * On tape « canal + », la chaine s'appelle « CANAL+ » ; on tape « bein
     * sport », elle s'appelle « beIN SPORTS 1 ». Le palier de correspondance se
     * teste sur cette forme, ou ces ecarts n'existent plus.
     */
    tightName: text().generatedAlwaysAs(sql`public.tight_name(name)`),
    /*
     * Identite de l'oeuvre, independamment de sa langue et de sa qualite.
     * Le fournisseur publie le meme film une vingtaine de fois — « FR - Joker -
     * 2019 [4K] », « ALB - Joker - 2019 », « EN - Joker - 2019 [MULTI-SUB] » —
     * et sans cette cle le catalogue serait illisible. Calculee par la base
     * pour que le regroupement et les requetes ne puissent pas diverger.
     */
    workKey: text().generatedAlwaysAs(sql`public.work_key(name)`),
    /** Preference d'affichage : le francais represente l'oeuvre s'il existe. */
    langRank: integer().generatedAlwaysAs(sql`public.lang_rank(name)`),
    /*
     * Cle de regroupement effective, choisie selon le type de la ligne.
     *
     * En VOD c'est `work_key` : l'oeuvre, toutes langues confondues. En live la
     * langue fait partie de l'identite de la chaine (« FR - TF1 » et « DE - TF1 »
     * sont deux chaines) mais la qualite non : le fournisseur publie « CANAL+
     * LIVE 1 » en FHD, HD, SD et HEVC, et la grille en devenait illisible —
     * 53 vignettes pour 26 chaines dans la seule categorie CANAL+ SPORTS.
     */
    groupKey: text().generatedAlwaysAs(sql`public.group_key(type, name)`),
    /*
     * Ordre de preference des qualites, du plus lisible au moins lisible :
     * FHD, HD, sans marqueur, 4K, SD, puis HEVC en dernier — les navigateurs ne
     * savent pas decoder le H.265, la variante ne doit jamais representer le
     * groupe par defaut.
     */
    qualityRank: integer().generatedAlwaysAs(sql`public.quality_rank(name)`),
    /*
     * Le code de langue tel que le fournisseur le prefixe — « FR », « EN »,
     * « VOSTFR ». Stocke plutot que redetecte : la meme expression reguliere
     * coutait 1,3 s par balayage des 311 908 lignes, et elle tournait a chaque
     * requete. Il prend la releve de `lang_rank`, dont l'ordre fige ne peut
     * pas servir trois profils qui n'ont pas les memes langues.
     */
    langCode: text().generatedAlwaysAs(sql`public.lang_code(name)`),
    /*
     * La place de la chaine sur la telecommande : 1 pour TF1, 2 pour France 2,
     * et l'equivalent dans les autres pays. Nul pour tout ce qui ne se numerote
     * pas — la longue traine thematique et regionale, qui garde l'ordre
     * alphabetique derriere les generalistes.
     */
    channelRank: integer().generatedAlwaysAs(sql`public.channel_rank(name)`),
    iconUrl: text(),
    categoryId: integer().references(() => categories.id, { onDelete: 'set null' }),
    containerExtension: text(),
    // Cle de rattachement au XMLTV (attribut `channel` des programmes).
    epgChannelId: text(),
    addedAt: timestamp({ withTimezone: true }),
    // Marquage logique : jamais de DELETE, sinon favoris et historique sautent.
    removedAt: timestamp({ withTimezone: true }),
    // Metadonnees de fiche, remplies par get_vod_info a la demande (puis TMDB en phase 8).
    plot: text(),
    rating: real(),
    releaseDate: text(),
    durationSec: integer(),
    genre: text(),
    castList: text(),
    director: text(),
    backdropUrl: text(),
    tmdbId: text(),
    tmdbFetchedAt: timestamp({ withTimezone: true }),
    infoFetchedAt: timestamp({ withTimezone: true }),
    syncedAt: now(),
  },
  (t) => [
    uniqueIndex('streams_provider_type_xtream_idx').on(t.providerId, t.type, t.xtreamId),
    index('streams_category_idx').on(t.categoryId),
    index('streams_type_removed_idx').on(t.type, t.removedAt),
    index('streams_name_trgm_idx').using('gin', sql`${t.nameNormalized} gin_trgm_ops`),
    index('streams_search_trgm_idx').using('gin', sql`${t.searchName} gin_trgm_ops`),
    index('streams_tight_idx').using('btree', sql`${t.tightName} text_pattern_ops`),
    // Appariement d'un meme contenu entre abonnements : deux comptes chez le
    // meme fournisseur exposent le meme catalogue avec les memes xtream_id.
    index('streams_identity_idx').on(t.type, t.xtreamId, t.providerId),
    // Choix du representant d'une oeuvre, et liste de ses variantes.
    index('streams_work_idx').on(t.type, t.workKey, t.langRank, t.id),
    // Meme role pour la cle effective, qui porte en plus l'ordre des qualites.
    index('streams_group_idx').on(t.type, t.groupKey, t.langRank, t.qualityRank, t.id),
    // Le representant d'une oeuvre se choisit desormais sur le code de langue,
    // que le classement du profil ordonne a la volee.
    index('streams_group_lang_idx').on(t.type, t.groupKey, t.langCode, t.qualityRank, t.id),
    index('streams_channel_rank_idx')
      .on(t.type, t.channelRank)
      .where(sql`type = 'live' and removed_at is null`),
    /*
     * Vivier de la mise en avant de l'accueil.
     *
     * Une image large et un synopsis : cote films, cela ne vient que de
     * l'enrichissement TMDB. Index partiel, donc — sa taille suit
     * l'enrichissement et non le catalogue, et l'accueil cesse de parcourir
     * 311 908 lignes pour en retenir quatre-vingts.
     */
    index('streams_spotlight_idx')
      .on(t.providerId, t.langRank, t.rating)
      .where(sql`type = 'vod' and removed_at is null and backdrop_url is not null and plot is not null`),
  ],
);

export const series = pgTable(
  'series',
  {
    id: serial().primaryKey(),
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    xtreamId: integer().notNull(),
    name: text().notNull(),
    nameNormalized: text().generatedAlwaysAs(sql`public.normalize_name(name)`),
    /** Voir `streams.searchName` : le titre debarrasse du bruit du fournisseur. */
    searchName: text().generatedAlwaysAs(sql`public.search_name(name)`),
    tightName: text().generatedAlwaysAs(sql`public.tight_name(name)`),
    workKey: text().generatedAlwaysAs(sql`public.work_key(name)`),
    langRank: integer().generatedAlwaysAs(sql`public.lang_rank(name)`),
    /** Voir `streams.langCode`. */
    langCode: text().generatedAlwaysAs(sql`public.lang_code(name)`),
    coverUrl: text(),
    backdropUrl: text(),
    plot: text(),
    rating: real(),
    releaseDate: text(),
    genre: text(),
    castList: text(),
    director: text(),
    categoryId: integer().references(() => categories.id, { onDelete: 'set null' }),
    addedAt: timestamp({ withTimezone: true }),
    removedAt: timestamp({ withTimezone: true }),
    tmdbId: text(),
    tmdbFetchedAt: timestamp({ withTimezone: true }),
    // get_series_info coute un appel par serie : on cache et on rafraichit a la demande.
    episodesFetchedAt: timestamp({ withTimezone: true }),
    syncedAt: now(),
  },
  (t) => [
    uniqueIndex('series_provider_xtream_idx').on(t.providerId, t.xtreamId),
    index('series_category_idx').on(t.categoryId),
    index('series_removed_idx').on(t.removedAt),
    index('series_name_trgm_idx').using('gin', sql`${t.nameNormalized} gin_trgm_ops`),
    index('series_search_trgm_idx').using('gin', sql`${t.searchName} gin_trgm_ops`),
    index('series_tight_idx').using('btree', sql`${t.tightName} text_pattern_ops`),
    index('series_identity_idx').on(t.xtreamId, t.providerId),
    index('series_work_idx').on(t.workKey, t.langRank, t.id),
    index('series_work_lang_idx').on(t.workKey, t.langCode, t.id),
  ],
);

export const episodes = pgTable(
  'episodes',
  {
    id: serial().primaryKey(),
    seriesId: integer()
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    xtreamId: text().notNull(),
    season: integer().notNull(),
    episodeNum: integer().notNull(),
    title: text().notNull(),
    containerExtension: text(),
    durationSec: integer(),
    plot: text(),
    stillUrl: text(),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('episodes_series_xtream_idx').on(t.seriesId, t.xtreamId),
    index('episodes_series_order_idx').on(t.seriesId, t.season, t.episodeNum),
  ],
);

// ------------------------------------------------------------------------ epg

/**
 * Grille des programmes, alimentee par `xmltv.php`.
 *
 * Le rattachement se fait par `channel_xmltv_id` et non par un identifiant de
 * chaine : le XMLTV utilise ses propres identifiants, et une meme grille peut
 * couvrir des chaines que le panel ne propose pas.
 */
export const epgProgrammes = pgTable(
  'epg_programmes',
  {
    id: serial().primaryKey(),
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    channelXmltvId: text().notNull(),
    title: text().notNull(),
    description: text(),
    startAt: timestamp({ withTimezone: true }).notNull(),
    endAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('epg_programme_unique_idx').on(t.providerId, t.channelXmltvId, t.startAt),
    // Requete dominante : « qu'y a-t-il en ce moment sur cette chaine ? »
    index('epg_channel_window_idx').on(t.channelXmltvId, t.startAt, t.endAt),
  ],
);

export const epgRuns = pgTable('epg_runs', {
  id: serial().primaryKey(),
  providerId: integer()
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  status: syncStatus().notNull().default('running'),
  error: text(),
  programmes: integer().notNull().default(0),
  channels: integer().notNull().default(0),
  bytesRead: integer().notNull().default(0),
  startedAt: now(),
  finishedAt: timestamp({ withTimezone: true }),
});

// ----------------------------------------------------------- personnalisation

export const favorites = pgTable(
  'favorites',
  {
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    itemType: itemType().notNull(),
    itemId: integer().notNull(),
    createdAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.itemType, t.itemId] }),
    index('favorites_profile_created_idx').on(t.profileId, t.createdAt),
  ],
);

/**
 * Categories epinglees.
 *
 * Table a part et non une valeur de plus dans `item_type` : ce dernier est
 * partage avec `watch_progress`, ou une categorie n'aurait aucun sens — on ne
 * reprend pas une categorie la ou on l'avait laissee. Une categorie epinglee n'a
 * ni progression, ni libelle a reconstituer, ni image : rien de ce que la table
 * `favorites` transporte pour un contenu.
 */
export const favoriteCategories = pgTable(
  'favorite_categories',
  {
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    categoryId: integer()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.categoryId] }),
    index('favorite_categories_profile_idx').on(t.profileId, t.createdAt),
  ],
);

export const watchProgress = pgTable(
  'watch_progress',
  {
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    itemType: itemType().notNull(),
    itemId: integer().notNull(),
    positionSec: integer().notNull().default(0),
    durationSec: integer(),
    completed: boolean().notNull().default(false),
    updatedAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.itemType, t.itemId] }),
    index('watch_progress_profile_updated_idx').on(t.profileId, t.updatedAt),
  ],
);

// --------------------------------------------------------------------- slots

export const playbackSlots = pgTable(
  'playback_slots',
  {
    id: serial().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: integer().references(() => sessions.id, { onDelete: 'cascade' }),
    // Chaque abonnement a sa propre limite : un slot occupe celui de son
    // contenu, pas un compteur global.
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    itemType: itemType().notNull(),
    itemId: integer().notNull(),
    itemLabel: text().notNull().default(''),
    acquiredAt: now(),
    heartbeatAt: now(),
    releasedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('playback_slots_live_idx').on(t.releasedAt, t.heartbeatAt),
    index('playback_slots_provider_idx').on(t.providerId, t.releasedAt),
    index('playback_slots_user_idx').on(t.userId),
  ],
);

// ---------------------------------------------------------------------- sync

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial().primaryKey(),
    providerId: integer()
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    status: syncStatus().notNull().default('running'),
    phase: text().notNull().default('categories'),
    error: text(),
    counts: jsonb()
      .$type<{
        categories: number;
        live: number;
        vod: number;
        series: number;
        removed: number;
      }>()
      .notNull()
      .default({ categories: 0, live: 0, vod: 0, series: 0, removed: 0 }),
    startedAt: now(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('sync_runs_provider_started_idx').on(t.providerId, t.startedAt)],
);

export type Provider = typeof providers.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type StreamRow = typeof streams.$inferSelect;
export type SeriesRow = typeof series.$inferSelect;
export type EpisodeRow = typeof episodes.$inferSelect;
export type SyncRunRow = typeof syncRuns.$inferSelect;
