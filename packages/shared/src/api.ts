import { z } from 'zod';
import { UI_LOCALES } from './language.js';
import type { Category, ItemType, LiveChannel, Movie, SeriesSummary } from './catalog.js';

export type UserRole = 'admin' | 'user';

export interface CurrentUser {
  id: number;
  email: string;
  role: UserRole;
  canWatchAdult: boolean;
}

/**
 * Vignettes proposées pour un profil.
 *
 * Une liste fermée, et non un fichier téléversé : rien à stocker, rien à
 * modérer, et un dessin plein reste lisible à trois mètres sur un téléviseur là
 * où une photo recadrée en rond devient une tache.
 */
export const PROFILE_AVATARS = [
  'wave',
  'star',
  'bolt',
  'moon',
  'leaf',
  'flame',
  'ghost',
  'crown',
  'rocket',
  'heart',
] as const;
export type ProfileAvatar = (typeof PROFILE_AVATARS)[number];

export const PROFILE_COLORS = [
  'cyan',
  'violet',
  'rose',
  'amber',
  'emerald',
  'blue',
] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

/**
 * Un profil du compte.
 *
 * Il porte les goûts — liste, historique, chaînes épinglées — là où le compte
 * porte l'identité et les droits. `canWatchAdult` est déjà croisé avec le
 * plafond du compte : il dit ce que ce profil peut voir, pas ce qu'il a demandé.
 */
export interface Profile {
  id: number;
  name: string;
  avatar: ProfileAvatar;
  color: ProfileColor;
  isKid: boolean;
  canWatchAdult: boolean;
  /**
   * Les langues mises en avant, de une à trois, dans l'ordre de préférence.
   *
   * Elles ne filtrent rien : elles ordonnent. Le catalogue étranger reste
   * accessible, il passe derrière — filtrer aurait vidé l'écran d'un foyer
   * dont le fournisseur ne publie pas la langue choisie.
   */
  languages: string[];
  /**
   * La langue de l'interface, ou `null` pour la déduire des langues ci-dessus.
   *
   * Deux réglages et non un seul : mettre son catalogue en allemand ne veut pas
   * dire vouloir des boutons en allemand, et l'inverse non plus. `null` garde
   * le comportement évident — la première langue du catalogue qui existe en
   * traduction, le français sinon.
   */
  uiLanguage: string | null;
  createdAt: string;
}

/**
 * Trois langues au plus.
 *
 * Au-delà, l'ordre de préférence ne veut plus dire grand-chose : la quatrième
 * langue arriverait après plusieurs milliers de titres et ne se verrait jamais.
 */
export const MAX_PROFILE_LANGUAGES = 3;

/** Nombre maximum de profils par compte. Au-delà, le sélecteur ne tient plus
 *  sur un écran de télévision sans défilement — et un foyer n'en a pas besoin. */
export const MAX_PROFILES = 6;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(24),
  avatar: z.enum(PROFILE_AVATARS).optional(),
  color: z.enum(PROFILE_COLORS).optional(),
  isKid: z.boolean().optional(),
  canWatchAdult: z.boolean().optional(),
  /*
   * Les codes viennent du catalogue du fournisseur : deux à huit lettres,
   * majuscules. Contraints ici parce qu'ils finissent dans une comparaison SQL
   * — en paramètre, jamais concaténés, mais autant refuser l'absurde à l'entrée.
   */
  languages: z
    .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/))
    .min(1)
    .max(MAX_PROFILE_LANGUAGES)
    .optional(),
  /** `null` remet le réglage sur « suit les langues du catalogue ». */
  uiLanguage: z.enum(UI_LOCALES).nullable().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface DeviceSession {
  id: number;
  deviceLabel: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// ---------------------------------------------------------------- auth

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  /** Mobile : le token est renvoyé dans le corps. Web : cookie httpOnly. */
  transport: z.enum(['cookie', 'bearer']).default('cookie'),
  deviceLabel: z.string().max(120).optional(),
});
export type LoginRequest = z.input<typeof loginSchema>;

export interface LoginResponse {
  user: CurrentUser;
  /** Présent uniquement quand transport === 'bearer'. */
  token?: string;
  expiresAt: string;
}

/**
 * Changement d'adresse.
 *
 * Le mot de passe est exigé : l'adresse est l'identifiant de connexion, et un
 * navigateur laissé ouvert suffirait sinon à se faire remettre le compte.
 */
export const changeEmailSchema = z.object({
  password: z.string().min(1).max(200),
  email: z.string().email().max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

/**
 * Création de compte en libre-service.
 *
 * Chaque compte apporte ses propres abonnements : un nouvel inscrit n'entame
 * donc pas les connexions simultanées de qui que ce soit, il arrive avec les
 * siennes. C'est ce qui rend l'inscription ouverte tenable.
 */
export const signupSchema = z.object({
  email: z.string().email().max(200),
  /** Dix caractères : la même exigence qu'au changement de mot de passe. */
  password: z.string().min(10).max(200),
  /** Nom du premier profil. Vide, on le tire de l'adresse. */
  profileName: z.string().trim().min(1).max(24).optional(),
  /** Requis quand l'installation tourne en `SIGNUP_MODE=code`. */
  code: z.string().max(200).optional(),
  transport: z.enum(['cookie', 'bearer']).default('cookie'),
  deviceLabel: z.string().max(120).optional(),
});
export type SignupRequest = z.input<typeof signupSchema>;

/**
 * Ce que la page de connexion doit savoir avant d'afficher quoi que ce soit :
 * proposer l'inscription, et si un code est attendu. Public — il n'y a rien à
 * protéger dans « les inscriptions sont ouvertes ».
 */
export interface SignupPolicy {
  mode: 'open' | 'code' | 'closed';
}

// ---------------------------------------------------- association d'un téléviseur

/**
 * Le téléviseur démarre l'association : il n'a pas de session, il demande juste
 * un code à afficher. `deviceLabel` nomme l'appareil dans « appareils connectés »
 * une fois la session créée.
 */
export const tvPairStartSchema = z.object({
  deviceLabel: z.string().max(120).optional(),
});
export interface TvPairStartResponse {
  /** Le code lisible, à afficher et à saisir, mis en forme (ex. « K7P2-9QMX »). */
  code: string;
  /** Le secret que le téléviseur garde pour sonder : il n'est jamais réaffiché. */
  deviceSecret: string;
  /** L'URL que le QR code encode : la page du site où saisir le code. */
  verificationUrl: string;
  expiresInSec: number;
  pollIntervalSec: number;
}

/** Le téléviseur sonde avec son secret jusqu'à ce que quelqu'un réclame le code. */
export const tvPairPollSchema = z.object({
  deviceSecret: z.string().min(10).max(400),
});
export type TvPairPollResponse =
  | { status: 'pending' }
  | { status: 'expired' }
  /** La session du téléviseur : il la stocke et appelle ensuite `/auth/me`. */
  | { status: 'approved'; token: string };

/**
 * L'utilisateur réclame le code depuis le site ou son application — déjà
 * connecté. Le téléviseur hérite du profil actif du réclamant, ou de « qui
 * regarde ? » si aucun n'est choisi.
 */
export const tvPairClaimSchema = z.object({
  code: z.string().min(4).max(20),
});
export interface TvPairClaimResponse {
  deviceLabel: string | null;
}

// ---------------------------------------------------------------- catalogue

export const listQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).optional(),
  // `fr` par defaut : sur un catalogue a 24 000 chaines dont une centaine
  // interessent vraiment, un tri alphabetique brut enterre le francais entre
  // l'albanais et l'arabe.
  sort: z.enum(['fr', 'name', 'added', 'recent', 'rating']).default('fr'),
  /*
   * Un genre TMDB, tel qu'il est écrit dans le catalogue : « Drame », « Comédie ».
   *
   * Les catégories du fournisseur sont une taxonomie technique — le bouquet, la
   * langue, la qualité. Le genre est la seule éditoriale, et 92 % des films en
   * portent un depuis l'enrichissement.
   */
  genre: z.string().trim().min(1).max(60).optional(),
  // Restreint la liste aux favoris de l'utilisateur, pagination comprise.
  favorites: z.coerce.boolean().optional(),
  /*
   * Ne garde que ce que le profil a deja regarde, du plus recent au plus
   * ancien.
   *
   * L'historique existait deja, mais comme une page a part : on y allait pour
   * effacer, pas pour reprendre. Ici c'est un filtre du catalogue comme un
   * autre — il se combine avec un genre, une categorie, une recherche.
   */
  watched: z.coerce.boolean().optional(),
  // Réaffiche les séparateurs décoratifs du fournisseur, masqués par défaut.
  separators: z.coerce.boolean().optional(),
  /*
   * Ne garde qu'une langue, parmi celles que le profil a mises en avant.
   *
   * Le tri les met dans l'ordre, mais un profil qui en a deux voyait la seconde
   * commencer à la 969e ligne — derrière l'intégralité de la première. Ordonner
   * ne suffit pas dès qu'un seul des deux groupes remplit l'écran.
   */
  language: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListQuery = z.input<typeof listQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Une langue présente dans le catalogue du compte.
 *
 * Le sélecteur ne propose pas une liste figée de langues : il propose celles
 * que le fournisseur publie vraiment, avec leur volume. Offrir « Coréen » à un
 * abonnement qui n'en a pas une ligne serait une promesse vide.
 */
export interface CatalogLanguage {
  /** Code tel que le fournisseur le préfixe : « FR », « EN », « DE »… */
  code: string;
  /** « Français », « Anglais »… ou le code lui-même s'il n'est pas reconnu. */
  label: string;
  /** Drapeau emoji, absent pour un marqueur qui ne désigne aucun pays. */
  flag: string | null;
  count: number;
}

export interface HomePayload {
  /**
   * Aucun abonnement sur ce compte.
   *
   * À distinguer de `catalogEmpty` : là il n'y a rien à attendre, il faut
   * ajouter un abonnement. Un écran de synchronisation en cours devant un
   * compte qui vient de s'inscrire promettrait un catalogue qui n'arrivera
   * jamais.
   */
  noProvider: boolean;
  /** Vrai tant qu'aucun sync n'a rempli le catalogue : le front affiche l'écran d'attente. */
  catalogEmpty: boolean;
  sync: SyncStatus | null;
  /**
   * La sélection mise en avant, en tête de page.
   *
   * Cinq œuvres tirées chaque jour du même vivier : sans mise en avant,
   * l'accueil s'ouvrait sur une rangée de vignettes de 164 px, identique à
   * celle des pages de parcours — rien n'y disait par où commencer.
   */
  spotlight: import('./catalog.js').Spotlight[];
  resume: import('./catalog.js').HistoryEntry[];
  favorites: import('./catalog.js').FavoriteEntry[];
  recentMovies: Movie[];
  recentSeries: SeriesSummary[];
  /**
   * Ce que le fournisseur a ajouté depuis la dernière visite du profil.
   *
   * Le catalogue grossit sans arrêt — sept cent seize films et cinq cent
   * quatre-vingt-dix séries sur une seule semaine, mesuré — et rien ne le
   * disait. Les rangées « récemment ajoutés » montrent les vingt derniers,
   * toujours les mêmes tant qu'on revient souvent : elles répondent « voici du
   * neuf », jamais « voici ce que vous n'avez pas encore vu passer ».
   *
   * `since` est la date de la visite précédente, `null` à la première.
   */
  arrivals: {
    since: string | null;
    movies: number;
    series: number;
  };
  /**
   * Les chaînes épinglées du profil, avec le programme en cours. Vide si le
   * profil n'en a épinglé aucune.
   */
  livePinned: LiveChannel[];
  /**
   * Le direct, dans l'ordre habituel, hors chaînes déjà épinglées.
   *
   * C'était une liste de noms de catégories : elle ne répondait pas à
   * « qu'est-ce qu'il y a à la télé », elle demandait de cliquer pour le
   * savoir. Une vignette de chaîne porte le programme en cours et sa part
   * écoulée — la réponse, pas le chemin.
   */
  liveBrowse: LiveChannel[];
  rows: Array<{ category: Category; items: Array<Movie | SeriesSummary | LiveChannel> }>;
}

// ---------------------------------------------------------------- lecture

export const itemTypeSchema = z.enum(['stream', 'series', 'episode']);

export const playParamsSchema = z.object({
  /** `stream` couvre live et vod ; `episode` un épisode de série. */
  type: z.enum(['stream', 'episode']),
  id: z.coerce.number().int().positive(),
});

export const playBodySchema = z.object({
  /** `proxy` : manifest réécrit et segments streamés (web). `direct` : 302 (mobile). */
  mode: z.enum(['proxy', 'direct']).default('proxy'),
});

export interface PlayResponse {
  /** URL à donner au lecteur. Contient le ticket, aucune donnée de session. */
  url: string;
  ticket: string;
  /** ISO — le client renouvelle silencieusement avant cette date. */
  expiresAt: string;
  mode: 'proxy' | 'direct';
  kind: 'live' | 'vod' | 'episode';
  containerExtension: string | null;
  /** Identifiant du slot acquis, à renvoyer dans les heartbeats et à la libération. */
  slotId: number;
  heartbeatIntervalSec: number;
  label: string;
  resumeAtSec: number;
}

export const progressSchema = z.object({
  itemType: itemTypeSchema,
  itemId: z.coerce.number().int().positive(),
  positionSec: z.coerce.number().min(0),
  durationSec: z.coerce.number().min(0).optional(),
});

export const favoriteSchema = z.object({
  itemType: z.enum(['stream', 'series']),
  itemId: z.coerce.number().int().positive(),
});

export const favoriteCategorySchema = z.object({
  categoryId: z.coerce.number().int().positive(),
});

/**
 * « Marquer comme vu », ou l'inverse.
 *
 * Le geste manquait : la progression ne s'écrivait qu'en regardant, et une
 * liste dont rien ne sort ne se vide jamais. Un film est un `stream`, un
 * épisode un `episode` ; une chaîne n'a rien à marquer.
 */
export const seenSchema = z.object({
  itemType: z.enum(['stream', 'episode']),
  itemId: z.coerce.number().int().positive(),
  seen: z.boolean().default(true),
});

// ---------------------------------------------------------------- admin

/**
 * Les sortes de sources.
 *
 * `xtream` : un panel, interrogé par son API — catégories, synopsis, saisons,
 * et le nombre de connexions simultanées, qui n'existe que là.
 *
 * `m3u` : une playlist, c'est-à-dire un fichier texte. Pas de compte, pas de
 * métadonnées au-delà du nom, du logo et du groupe, et pas de connexions à
 * compter. Beaucoup de fournisseurs la servent à côté de leur panel, et c'est
 * aussi la seule forme des listes publiques.
 */
export const PROVIDER_KINDS = ['xtream', 'm3u'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Ce qu'une source demande selon sa sorte.
 *
 * Les identifiants n'ont de sens que pour un panel : les exiger d'une playlist
 * obligerait à inventer des valeurs vides pour satisfaire un schéma. Le
 * raffinement porte donc sur `kind`, et chaque branche ne déclare que ses
 * propres champs.
 */
const providerCommon = {
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().max(500),
  isActive: z.boolean().default(false),
};

/**
 * `kind` absent vaut `xtream`.
 *
 * Le défaut ne peut pas se déclarer sur le littéral : une union discriminée lit
 * le discriminant dans l'entrée brute, avant que le moindre défaut s'applique,
 * et un panel envoyé sans `kind` — ce que fait tout client écrit avant que les
 * playlists existent, mobile compris — se faisait rejeter.
 */
export const providerCreateSchema = z.preprocess(
  (raw) =>
    raw && typeof raw === 'object' && !('kind' in raw) ? { ...raw, kind: 'xtream' } : raw,
  z.discriminatedUnion('kind', [
    z.object({
      ...providerCommon,
      kind: z.literal('xtream'),
      username: z.string().trim().min(1).max(200),
      password: z.string().min(1).max(200),
    }),
    z.object({
      ...providerCommon,
      kind: z.literal('m3u'),
      /** XMLTV facultatif : une playlist ne dit pas où est sa grille. */
      epgUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
    }),
  ]),
);

/**
 * Seuls les champs modifiés sont envoyés : l'UI n'a jamais les valeurs en clair.
 *
 * `kind` ne se modifie pas — changer la sorte d'une source revient à en créer
 * une autre, et laisserait derrière elle un catalogue qui ne se rattache plus
 * à rien.
 */
export const providerUpdateSchema = z.object({
  name: providerCommon.name.optional(),
  baseUrl: providerCommon.baseUrl.optional(),
  isActive: z.boolean().optional(),
  username: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
  epgUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
});

export interface ProviderView {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Toujours masqué — les credentials ne sortent jamais de la base en clair. */
  usernameMasked: string;
  passwordMasked: string;
  /** Vide pour un panel, où la grille se déduit des identifiants. */
  epgUrl: string | null;
  isActive: boolean;
  /** `null` pour une playlist : il n'y a pas de connexions à compter. */
  maxConnections: number | null;
  /** Lus au dernier test du panel ; nuls pour une playlist ou avant tout test. */
  expiresAt: string | null;
  status: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  /**
   * Les autres abonnements du compte qui pointent sur le même serveur.
   *
   * Deux comptes chez le même fournisseur, c'est deux connexions sur le même
   * catalogue : la carte le dit, sans donner le nom du serveur — il identifie
   * le fournisseur, il reste en base.
   */
  sameAs: number[];
  /** Ce que la source a donné au catalogue, en lignes brutes, avant regroupement. */
  catalogue: { live: number; vod: number; series: number };
}

export interface ProviderTestResult {
  ok: boolean;
  status: string | null;
  expiresAt: string | null;
  maxConnections: number | null;
  activeConnections: number | null;
  serverName: string | null;
  message: string;
}

export const userCreateSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  role: z.enum(['admin', 'user']).default('user'),
  canWatchAdult: z.boolean().default(false),
});

/**
 * Ce qu'un administrateur peut encore changer sur un compte.
 *
 * Pas `canWatchAdult` : depuis que chaque compte apporte son propre abonnement,
 * le plafond « catégories adultes » est son affaire et se règle depuis sa page
 * de compte (`PATCH /api/me/settings`). Deux écritures pour un même réglage ne
 * feraient que se contredire.
 */
export const userUpdateSchema = z.object({
  password: z.string().min(10).max(200).optional(),
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Détail d'un compte, pour l'administration.
 *
 * Ce qu'il faut pour répondre à « ce compte s'en sert-il, et est-ce que ça
 * marche » — sans regarder par-dessus l'épaule : ni favoris, ni historique, ni
 * ce qui est en train d'être regardé. Les abonnements y figurent par leur nom
 * et leur état, jamais par leur URL ni leurs identifiants.
 */
export interface AccountDetail {
  profiles: Array<{ id: number; name: string; isKid: boolean }>;
  providers: Array<{
    id: number;
    name: string;
    isActive: boolean;
    maxConnections: number | null;
    expiresAt: string | null;
    lastSyncAt: string | null;
  }>;
  catalogue: { live: number; vod: number };
  /** Dernière activité, toutes sessions confondues. */
  lastSeenAt: string | null;
}

export interface AdminUserView {
  id: number;
  email: string;
  role: UserRole;
  canWatchAdult: boolean;
  isActive: boolean;
  createdAt: string;
  sessionCount: number;
  /**
   * Ce qu'on compare d'un compte à l'autre, dans le tableau.
   *
   * Les abonnements actifs et le dernier accès disaient « ce compte s'en
   * sert-il » — mais ils n'arrivaient qu'en dépliant la ligne, une requête par
   * compte. Deux sous-requêtes dans le listing les donnent pour tous.
   */
  activeProviders: number;
  lastSeenAt: string | null;
}

export type SyncPhase =
  | 'idle'
  | 'categories'
  | 'live'
  | 'vod'
  | 'series'
  | 'done'
  | 'failed';

export interface SyncStatus {
  running: boolean;
  phase: SyncPhase;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  counts: {
    categories: number;
    live: number;
    vod: number;
    series: number;
    removed: number;
  };
  /** Volumétrie actuellement en base, tous providers actifs confondus. */
  totals?: { live: number; vod: number; series: number; episodes: number };
}

// ------------------------------------------------------------ epg / tmdb

/** Occupation des connexions, detaillee par abonnement. */
export interface SlotUsage {
  used: number;
  max: number;
  providers: Array<{ id: number; name: string; used: number; max: number }>;
}

export interface EpgStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'running' | 'done' | 'failed' | null;
  error: string | null;
  lastRun: { programmes: number; channels: number; megabytes: number };
  totals: { programmes: number; channels: number };
  /** Chaines live effectivement rattachees a la grille. */
  coverage?: { matched: number; total: number };
}

export interface TmdbStatus {
  /** Faux tant que TMDB_API_KEY n'est pas renseignee : l'UI le dit plutot que d'echouer. */
  configured: boolean;
  running: boolean;
  progress: { processed: number; total: number } | null;
  movies: { enriched: number; tried: number; total: number };
  series: { enriched: number; tried: number; total: number };
}

export interface ActiveSlotView {
  id: number;
  providerId: number;
  providerName: string;
  userEmail: string;
  itemType: ItemType;
  itemId: number;
  itemLabel: string;
  acquiredAt: string;
  heartbeatAt: string;
  deviceLabel: string | null;
}
