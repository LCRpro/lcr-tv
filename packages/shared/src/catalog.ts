export type CategoryType = 'live' | 'vod' | 'series';
/** Ce qu'on peut mettre en favori / suivre en progression. */
export type ItemType = 'stream' | 'series' | 'episode';
/** Type d'un enregistrement de la table streams. */
export type StreamType = 'live' | 'vod';

export interface Category {
  id: number;
  type: CategoryType;
  name: string;
  isAdult: boolean;
  /** Nombre d'éléments visibles, présent uniquement sur les listings de catégories. */
  count?: number;
  /**
   * Logo de la catégorie, quand ses chaînes en partagent un.
   *
   * Les 33 chaînes de « AHL » portent toutes le logo de la ligue ; celles de
   * « GÉNÉRAL » n'ont rien en commun. Le serveur ne renvoie donc ce champ que
   * lorsqu'une écrasante majorité partage la même image — sinon c'est le
   * drapeau de langue qui représente la catégorie.
   */
  logoUrl?: string | null;
  /** Épinglée par l'utilisateur : elle remonte en tête de la barre latérale. */
  isFavorite?: boolean;
  /**
   * Langue réellement portée par les chaînes de la catégorie.
   *
   * Le préfixe du fournisseur ment parfois : « EU | FR | UFC INTERNATIONAL »
   * annonce du français alors que ses 62 chaînes sont toutes américaines. Quand
   * une écrasante majorité s'accorde sur une langue, c'est elle qui fait foi.
   */
  languageCode?: string | null;
}

export interface LiveChannel {
  id: number;
  type: 'live';
  name: string;
  iconUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  isAdult: boolean;
  /**
   * Le numéro de la chaîne, quand elle en a un.
   *
   * La numérotation TNT de son pays — TF1 est 1, France 2 est 2, BBC One est 1
   * au Royaume-Uni. C'est par ce numéro qu'on retrouve une chaîne sur un
   * téléviseur, jamais en la cherchant dans une liste alphabétique ; il vaut
   * donc d'être affiché. `null` pour les milliers de chaînes qui n'en ont pas.
   */
  number?: number | null;
  /** « FHD », « 4K »… tirée du nom. Deux déclinaisons ne se distinguent qu'à ça. */
  quality?: string | null;
  /** Programme en cours, présent uniquement quand l'EPG est disponible (phase 8). */
  now?: EpgEntry | null;
  /** En favori : l'étoile de la vignette, et le filtre « Favoris » de la colonne. */
  isFavorite?: boolean;
  /**
   * Où l'on en est. Voir `Movie.watch`.
   *
   * Une chaîne n'a pas de durée : le rapport y vaut toujours zéro et rien ne
   * dessine de barre. Le champ existe pour que « Chaînes vues récemment » ait
   * la même forme que ses deux voisines.
   */
  watch?: WatchState | null;
  /** Voir `MatchTier` : présent uniquement sur un résultat de recherche. */
  matchTier?: MatchTier;
}

export interface ChannelDetail extends LiveChannel {
  /**
   * Déclinaisons de qualité de la même chaîne, celle-ci comprise.
   *
   * Le fournisseur publie « CANAL+ LIVE 1 » quatre fois — FHD, HD, SD, HEVC.
   * La grille n'en montre qu'une ; le lecteur laisse basculer entre elles.
   */
  variants: Variant[];
  /** Programme suivant, quand la grille le donne. */
  next?: EpgEntry | null;
}

/**
 * Qualité de la correspondance d'un résultat de recherche.
 *
 * Renseigné par la recherche seule, absent partout ailleurs. Il permet au front
 * de **fusionner** les trois familles au lieu de les alterner aveuglément :
 * chercher « toy story » sortait *Boat Story* en deuxième position, avant
 * *Toy Story 2*, parce que c'était le tour des séries.
 *
 * - `0` le nom commence par ce qui est cherché ;
 * - `1` un mot du nom commence par le terme, en tête ;
 * - `2` le terme apparaît en entier ailleurs dans le nom ;
 * - `3` rapprochement par trigramme seul — une ressemblance, pas une réponse.
 */
export type MatchTier = 0 | 1 | 2 | 3;

/**
 * Où l'on en est d'une œuvre, quand la liste le sait.
 *
 * Renseigné par le filtre « vu récemment » et par lui seul : joindre la
 * progression à chaque listing coûterait une requête de plus pour une
 * information que la quasi-totalité des vignettes n'affiche pas.
 */
export interface WatchState {
  /** Part lue, entre 0 et 1. Zéro quand la durée est inconnue. */
  ratio: number;
  completed: boolean;
}

export interface Movie {
  id: number;
  type: 'vod';
  name: string;
  iconUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  containerExtension: string | null;
  isAdult: boolean;
  addedAt: string | null;
  /** Note du fournisseur, sur 10. Affichée en pastille sur la carte. */
  rating: number | null;
  /**
   * De quoi décider sans ouvrir la fiche.
   *
   * Le synopsis dans la langue du profil, l'année, les genres : la vignette
   * les montre au survol. Le catalogue les a depuis l'enrichissement — 217 000
   * films avec un résumé, 92 % avec un genre — et ne s'en servait qu'une fois
   * la fiche ouverte.
   */
  plot?: string | null;
  year?: number | null;
  /** « Drame, Romance » : la liste TMDB telle quelle, le front en lit ce qu'il veut. */
  genre?: string | null;
  /** En favori : l'étoile de la vignette, et le filtre « Mes films ». */
  isFavorite?: boolean;
  /**
   * Où l'on en est de la lecture, quand la liste le sait.
   *
   * Nommé `watch` et non `progress` : la fiche porte déjà un `progress`, plus
   * complet, dont le lecteur a besoin pour reprendre à la seconde près. Ici il
   * ne s'agit que de dessiner une barre sous une affiche.
   */
  watch?: WatchState | null;
  /** Voir `MatchTier` : présent uniquement sur un résultat de recherche. */
  matchTier?: MatchTier;
}

/** Un genre du catalogue, et combien d'œuvres visibles le portent. */
export interface GenreCount {
  genre: string;
  count: number;
}

/**
 * Une déclinaison d'une même œuvre : une langue, une qualité, un container.
 * Le nom brut est conservé tel quel — c'est le front qui en tire la langue et
 * la qualité, avec la même fonction partagée que le reste de l'interface.
 */
export interface Variant {
  id: number;
  name: string;
  containerExtension: string | null;
  /** Faux pour un .mkv : inutile de le proposer dans un navigateur. */
  browserPlayable: boolean;
  /** « FHD », « HD », « HEVC »… Présent pour les chaînes, absent en VOD. */
  quality?: string | null;
}

export interface MovieDetail extends Movie {
  /** Toutes les déclinaisons de l'œuvre, celle-ci comprise. */
  variants: Variant[];
  /** L'image large, quand l'enrichissement l'a donnée : c'est elle qui tient la fiche. */
  backdropUrl: string | null;
  plot: string | null;
  rating: number | null;
  releaseDate: string | null;
  durationSec: number | null;
  genre: string | null;
  cast: string | null;
  director: string | null;
  progress: WatchProgress | null;
  isFavorite: boolean;
}

export interface SeriesSummary {
  id: number;
  type: 'series';
  name: string;
  coverUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  isAdult: boolean;
  rating: number | null;
  /** Voir `Movie.plot` : le synopsis, l'année et les genres, pour le survol. */
  plot?: string | null;
  year?: number | null;
  genre?: string | null;
  /**
   * Le nombre de saisons et d'épisodes, quand on le sait.
   *
   * Les épisodes ne sont demandés au fournisseur qu'à l'ouverture d'une fiche :
   * cinq séries sur cent mille les ont. Nul tant que ce n'est pas fait — la
   * vignette montre alors l'année et le genre, comme un film.
   */
  seasonCount?: number | null;
  episodeCount?: number | null;
  /** En favori : l'étoile de la vignette, et le filtre « Mes séries ». */
  isFavorite?: boolean;
  /** Où l'on en est de la lecture. Voir `Movie.watch`. */
  watch?: WatchState | null;
  /** Voir `MatchTier` : présent uniquement sur un résultat de recherche. */
  matchTier?: MatchTier;
}

export interface Episode {
  id: number;
  seriesId: number;
  season: number;
  episodeNum: number;
  title: string;
  containerExtension: string | null;
  durationSec: number | null;
  plot: string | null;
  stillUrl: string | null;
  progress: WatchProgress | null;
}

export interface Season {
  season: number;
  episodes: Episode[];
}

export interface SeriesDetail extends SeriesSummary {
  /**
   * Déclinaisons de la même série. Contrairement à un film, changer de langue
   * change aussi la liste des épisodes : chaque déclinaison est une série à
   * part entière chez le fournisseur.
   */
  variants: Variant[];
  /** Voir `MovieDetail.backdropUrl`. */
  backdropUrl: string | null;
  plot: string | null;
  rating: number | null;
  releaseDate: string | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
  seasons: Season[];
  isFavorite: boolean;
  /** Épisode à reprendre / prochain à voir, calculé côté serveur. */
  nextEpisode: { seasonNum: number; episodeNum: number; episodeId: number } | null;
}

export interface EpgEntry {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
}

/**
 * Grille horaire d'un lot de chaînes sur une plage de temps.
 *
 * Les programmes retenus **chevauchent** la fenêtre, ils n'y commencent pas
 * forcément : une émission démarrée avant l'heure de départ occupe pourtant le
 * début de la grille.
 */
export interface GuidePayload {
  from: string;
  to: string;
  /** Clé : identifiant de chaîne. */
  items: Record<string, EpgEntry[]>;
}

export interface WatchProgress {
  itemType: ItemType;
  itemId: number;
  positionSec: number;
  durationSec: number | null;
  completed: boolean;
  updatedAt: string;
}

/** Entrée des rangées « Reprendre » et « Historique » : progression + de quoi l'afficher. */
export interface HistoryEntry {
  itemType: ItemType;
  itemId: number;
  positionSec: number;
  durationSec: number | null;
  completed: boolean;
  updatedAt: string;
  label: string;
  /** Pour un épisode : le nom de la série. */
  parentLabel: string | null;
  imageUrl: string | null;
  /** Cible de navigation côté front. */
  target: { kind: 'movie' | 'series' | 'live'; id: number };
  /**
   * L'œuvre est déjà dans la liste du profil.
   *
   * Renseigné là où l'écran propose de l'y ajouter — l'accueil — et absent
   * ailleurs : l'historique complet a ses propres actions, il n'a pas d'étoile
   * à dessiner.
   */
  isFavorite?: boolean;
}

export interface FavoriteEntry {
  itemType: 'stream' | 'series';
  itemId: number;
  createdAt: string;
  label: string;
  imageUrl: string | null;
  target: { kind: 'movie' | 'series' | 'live'; id: number };
  /** L'année et le genre, pour la ligne sous l'affiche. Nuls pour une chaîne. */
  year?: number | null;
  genre?: string | null;
  /**
   * Où en est ce profil avec cette œuvre.
   *
   * Une liste dont rien ne sort n'est plus une liste, c'est un entrepôt :
   * « vu » et « en cours » sont ce qui permet de la vider. Pour une série,
   * c'est l'épisode regardé en dernier, avec son numéro. Nul quand rien n'a
   * jamais été lancé.
   */
  progress?: { ratio: number; completed: boolean; episode: string | null } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResults {
  live: LiveChannel[];
  movies: Movie[];
  series: SeriesSummary[];
}

/**
 * Une œuvre mise en avant sur l'accueil.
 *
 * Ni un `Movie` ni une `SeriesSummary` : ce qu'il faut pour tenir un grand
 * visuel — une image large, un synopsis, une note — et rien d'autre. Les
 * vignettes de rangée n'en ont pas besoin et les listings pèseraient le double
 * à les transporter.
 */
export interface Spotlight {
  kind: 'movie' | 'series';
  id: number;
  /** Nom brut du fournisseur : le front en retire langue et décorations. */
  name: string;
  /** Image large, 1280 px. C'est elle qui porte le bloc ; sans elle, pas de mise en avant. */
  backdropUrl: string;
  /** Affiche, en repli sur les petits écrans où le format large ne tient pas. */
  posterUrl: string | null;
  plot: string;
  rating: number | null;
  /** Année seule : le jour et le mois n'apprennent rien sur une fiche d'accueil. */
  year: string | null;
  genre: string | null;
  /** Deja dans la liste du profil : le bouton de la mise en avant en depend. */
  isFavorite: boolean;
}
