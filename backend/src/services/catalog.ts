import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql as raw,
  type SQL,
} from 'drizzle-orm';
import type {
  CatalogLanguage,
  Category,
  CategoryType,
  ChannelDetail,
  FavoriteEntry,
  GenreCount,
  HistoryEntry,
  ItemType,
  LiveChannel,
  MatchTier,
  Movie,
  MovieDetail,
  Paginated,
  SearchResults,
  SeriesDetail,
  SeriesSummary,
  Spotlight,
  Variant as VariantDto,
  WatchProgress,
  WatchState,
} from '@iptv/shared';
import {
  DEFAULT_LANGUAGES,
  canonicalLanguage,
  languageRank,
  languageSpellings,
  languageTag,
  splitLanguage,
} from '@iptv/shared';
import { db } from '../db/client.js';
import {
  categories,
  episodes,
  favoriteCategories,
  favorites,
  profiles,
  series,
  streams,
  tmdbTexts,
  watchProgress,
} from '../db/schema.js';
import { AppError, notFound } from '../lib/errors.js';
import { memoByUser } from './catalog-cache.js';
import { clientFor, getProvider, listActiveProviders } from './providers.js';
import { fetchAndStoreEpisodes } from './sync.js';
import { isBrowserPlayable } from '../xtream/urls.js';
import { channelSchedule, nowPlayingFor } from './epg.js';

export interface Viewer {
  /** Le compte : ce qui s'authentifie, et ce qui consomme les connexions. */
  id: number;
  /**
   * Le profil : ce qui porte les gouts.
   *
   * Favoris, liste et progression sont rattaches a lui, pas au compte —
   * autrement toute la maison partagerait une seule « reprendre la lecture ».
   */
  profileId: number;
  /** Deja croise avec le plafond du compte : le profil ne peut qu'en retirer. */
  canWatchAdult: boolean;
  /**
   * Les langues mises en avant par ce profil, dans l'ordre de sa preference.
   *
   * Elles ne filtrent rien : elles ordonnent. Le catalogue etranger reste
   * accessible, il passe simplement derriere — filtrer aurait vide l'ecran d'un
   * foyer dont le fournisseur ne publie pas la langue choisie.
   */
  languages: string[];
  /**
   * La langue dans laquelle ce profil **lit**, quand il en a choisi une.
   *
   * Distincte des precedentes : celles-la disent quel contenu remonter, celle-ci
   * dans quelle langue en lire le resume. Un profil peut vouloir un catalogue
   * allemand et des synopsis en francais — c'est meme le cas courant quand on
   * cherche du contenu etranger sans parler la langue.
   */
  uiLanguage: string | null;
}

/**
 * Le catalogue parcourable est celui du provider actif, et lui seul.
 *
 * Les lignes des anciens providers restent en base — favoris et historique
 * doivent y survivre — mais elles ne doivent plus apparaitre dans les listes :
 * leurs identifiants Xtream n'ont aucun sens pour l'abonnement courant, et une
 * tentative de lecture construirait une URL absurde.
 *
 * Sous-requete plutot que valeur mise en cache : la table providers tient en
 * une poignee de lignes, et il n'y a aucune invalidation a gerer.
 */
/**
 * Les abonnements actifs **de ce compte**, et eux seuls.
 *
 * Chaque compte apporte ses providers : le catalogue parcourable, les
 * connexions consommees et les URLs de lecture en decoulent. Ecrit comme une
 * sous-requete plutot que resolu en amont — la table tient en une poignee de
 * lignes, et il n'y a aucune invalidation a gerer.
 *
 * Le compte, jamais le profil : l'abonnement est paye par le foyer, tous ses
 * profils voient le meme catalogue.
 */
const activeProviders = (userId: number): SQL =>
  raw`(select id from providers where is_active and user_id = ${userId})`;

/**
 * L'ordre de preference du profil, en SQL.
 *
 * Le classement etait fige dans la colonne `lang_rank` : francais 0, VOSTFR 1,
 * multi 2, anglais 3, le reste 9. C'etait le bon defaut pour ce foyer, mais un
 * defaut ecrit en base — impossible a changer pour un profil qui regarde en
 * allemand sans reecrire la colonne pour tout le monde.
 *
 * `lang_code` stocke le code brut ; le rang se calcule ici, a la volee, contre
 * la liste du profil. Les codes voyagent en parametres et jamais concatenes :
 * ils viennent d'une table, donc de quelque chose qu'un utilisateur ecrit.
 */
/** Les codes d'une langue, en tableau SQL parametre. */
function codeArray(codes: readonly string[]): SQL {
  return raw`array[${raw.join(
    codes.map((c) => raw`${c}`),
    raw`, `,
  )}]::text[]`;
}

/**
 * Ne garder qu'une langue.
 *
 * Le rang met les langues du profil dans l'ordre, mais un profil qui en a deux
 * voyait la seconde commencer a la 969e ligne du direct — derriere les 968
 * chaines de la premiere. Ordonner ne suffit pas des qu'un seul des groupes
 * remplit l'ecran ; il faut pouvoir n'en demander qu'un.
 *
 * Toutes les orthographes de la langue, comme partout ailleurs : demander
 * l'anglais ramene EN, US, UK, AU, IE et NZ.
 */
function languageFilter(table: 'streams' | 'series', code: string): SQL {
  const col = table === 'streams' ? raw`streams.lang_code` : raw`series.lang_code`;
  return raw`${col} = any(${codeArray(languageSpellings(code))})`;
}

/**
 * Ne garder qu'un genre.
 *
 * Le fournisseur ne range pas ses films par genre mais par bouquet — « LATEST
 * MOVIES », « NETFLIX », « 4K » — et c'est TMDB qui a donne le genre a
 * l'enrichissement : « Drame », « Comedie, Romance ». La colonne est une liste
 * separee par des virgules ; on la coupe et on cherche le genre dedans, tel
 * quel — il vient de la liste que le serveur a lui-meme renvoyee.
 */
function genreFilter(table: 'streams' | 'series', genre: string): SQL {
  const col = table === 'streams' ? raw`streams.genre` : raw`series.genre`;
  return raw`${genre} = any(string_to_array(replace(${col}, ', ', ','), ','))`;
}

/**
 * Rang de la ligne : 0 pour la premiere langue du profil, puis 1, 2… et 99 pour
 * tout ce qu'il n'a pas choisi. Rien n'est filtre — le catalogue etranger reste
 * accessible, il passe derriere.
 *
 * Le rang porte sur la **langue**, pas sur l'orthographe. Le fournisseur emploie
 * un code par marche : l'anglais arrive sous EN, US, UK, AU… Ordonner sur la
 * liste a plat mettait les 60 578 entrees « EN » devant les 2 132 « UK », et
 * BBC One se retrouvait soixante mille lignes plus bas que Christmas 3. A rang
 * egal, c'est le numero de chaine qui departage — la suite du tri s'en charge.
 */
function prefRank(viewer: Viewer, table: 'streams' | 'series' | 'peer'): SQL {
  const col =
    table === 'peer'
      ? raw`peer.lang_code`
      : table === 'streams'
        ? raw`streams.lang_code`
        : raw`series.lang_code`;

  const chosen = viewer.languages.length > 0 ? viewer.languages : [...DEFAULT_LANGUAGES];
  const arms = chosen.map(
    (code, i) => raw`when ${col} = any(${codeArray(languageSpellings(code))}) then ${i}`,
  );
  // Une piste multilingue passe apres les langues choisies, avant les autres.
  arms.push(raw`when ${col} = 'MULTI' then ${chosen.length}`);
  return raw`(case ${raw.join(arms, raw` `)} else 99 end)`;
}

/**
 * Une ligne par oeuvre.
 *
 * Le fournisseur publie le meme film une vingtaine de fois — une ligne par
 * langue, par qualite, par variante de sous-titrage — et deux abonnements
 * doublent encore le tout. Chercher « Backrooms » sortait 24 resultats pour
 * deux films. On ne garde donc qu'un representant par `work_key`, celui de
 * meilleur `lang_rank` (le francais d'abord) puis de plus petit identifiant.
 *
 * Les chaines suivent la meme regle a une nuance pres : leur langue fait partie
 * de leur identite (« FR - TF1 » et « DE - TF1 » sont deux chaines) mais pas
 * leur qualite. `group_key` tranche selon le type ; la categorie CANAL+ SPORTS
 * passe ainsi de 53 vignettes a 26 chaines reelles.
 *
 * Les autres variantes ne sont pas perdues : la fiche les propose au choix — le
 * lecteur pour une chaine — et la lecture bascule d'abonnement toute seule si
 * le sien est sature.
 *
 * `not exists` plutot qu'un `distinct on` : l'ordre de tri reste libre, et le
 * predicat n'est evalue que sur les lignes reellement renvoyees.
 */
function dedupAcrossProviders(table: 'streams' | 'series', viewer: Viewer): SQL {
  if (table === 'streams') {
    return raw`not exists (
      select 1 from streams peer
      where peer.type = streams.type
        and peer.group_key = streams.group_key
        and peer.removed_at is null
        and peer.provider_id in ${activeProviders(viewer.id)}
        and (${prefRank(viewer, 'peer')}, peer.quality_rank, peer.id)
          < (${prefRank(viewer, 'streams')}, streams.quality_rank, streams.id)
    )`;
  }
  return raw`not exists (
    select 1 from series peer
    where peer.work_key = series.work_key
      and peer.removed_at is null
      and peer.provider_id in ${activeProviders(viewer.id)}
      and (${prefRank(viewer, 'peer')}, peer.id) < (${prefRank(viewer, 'series')}, series.id)
  )`;
}

function fromActiveProvider(
  table: 'streams' | 'series' | 'categories',
  viewer: Viewer,
): SQL {
  if (table === 'streams') return raw`streams.provider_id in ${activeProviders(viewer.id)}`;
  if (table === 'series') return raw`series.provider_id in ${activeProviders(viewer.id)}`;
  return raw`categories.provider_id in ${activeProviders(viewer.id)}`;
}

/**
 * Les categories adultes sont melangees aux autres. Un compte sans le flag ne
 * doit jamais les voir, y compris en recherche et dans les rangees d'accueil :
 * le filtre est donc pose sur chaque requete, pas sur une route particuliere.
 */
function adultGuard(viewer: Viewer): SQL | undefined {
  if (viewer.canWatchAdult) return undefined;
  return raw`(categories.is_adult is not true)`;
}

function visible(viewer: Viewer, extra: (SQL | undefined)[] = []): SQL {
  const parts = [
    isNull(streams.removedAt),
    fromActiveProvider('streams', viewer),
    dedupAcrossProviders('streams', viewer),
    adultGuard(viewer),
    ...extra,
  ].filter(
    Boolean,
  ) as SQL[];
  return and(...parts)!;
}

// ------------------------------------------------------------------ mapping

/** « 2019-06-14 » comme « 2019 » : l'année seule se lit sous une affiche. */
function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '');
  return m ? Number(m[1]) : null;
}

function toMovie(r: {
  id: number;
  name: string;
  iconUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIsAdult: boolean | null;
  containerExtension: string | null;
  addedAt: Date | null;
  rating: number | null;
  plot?: string | null;
  releaseDate?: string | null;
  genre?: string | null;
}): Movie {
  return {
    id: r.id,
    type: 'vod',
    name: r.name,
    iconUrl: r.iconUrl,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    containerExtension: r.containerExtension,
    isAdult: r.categoryIsAdult === true,
    addedAt: r.addedAt?.toISOString() ?? null,
    rating: r.rating,
    plot: r.plot ?? null,
    year: yearOf(r.releaseDate),
    genre: r.genre ?? null,
  };
}

function toChannel(r: {
  id: number;
  name: string;
  iconUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIsAdult: boolean | null;
  channelRank?: number | null;
}): LiveChannel {
  return {
    id: r.id,
    type: 'live',
    name: r.name,
    iconUrl: r.iconUrl,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    isAdult: r.categoryIsAdult === true,
    number: r.channelRank ?? null,
    // La qualite est deja lue du nom cote client par `splitChannelQuality` :
    // la recalculer ici la ferait diverger a la premiere correction.
    quality: null,
  };
}

function toSeries(r: {
  id: number;
  name: string;
  coverUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIsAdult: boolean | null;
  rating: number | null;
  plot?: string | null;
  releaseDate?: string | null;
  genre?: string | null;
  seasonCount?: number | null;
  episodeCount?: number | null;
}): SeriesSummary {
  return {
    id: r.id,
    type: 'series',
    name: r.name,
    coverUrl: r.coverUrl,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    isAdult: r.categoryIsAdult === true,
    rating: r.rating,
    plot: r.plot ?? null,
    year: yearOf(r.releaseDate),
    genre: r.genre ?? null,
    // Zero veut dire « pas encore demande au fournisseur », pas « aucun ».
    seasonCount: r.seasonCount ? Number(r.seasonCount) : null,
    episodeCount: r.episodeCount ? Number(r.episodeCount) : null,
  };
}

/*
 * Les colonnes d'une vignette, fiche comprise.
 *
 * Le synopsis, l'annee et le genre voyagent avec chaque ligne de liste : c'est
 * ce que la vignette montre au survol, et ce que la page de parcours filtre.
 * Le prix est quelques centaines d'octets par ligne sur des pages de quarante.
 * `tmdbId` sert a retrouver le synopsis dans la langue du profil.
 */
const streamColumns = {
  id: streams.id,
  name: streams.name,
  iconUrl: streams.iconUrl,
  categoryId: streams.categoryId,
  categoryName: categories.name,
  categoryIsAdult: categories.isAdult,
  // La numerotation TNT, calculee par la base : voir `public.channel_rank`.
  channelRank: streams.channelRank,
  containerExtension: streams.containerExtension,
  addedAt: streams.addedAt,
  rating: streams.rating,
  plot: streams.plot,
  releaseDate: streams.releaseDate,
  genre: streams.genre,
  tmdbId: streams.tmdbId,
};

const seriesColumns = {
  id: series.id,
  name: series.name,
  coverUrl: series.coverUrl,
  categoryId: series.categoryId,
  categoryName: categories.name,
  categoryIsAdult: categories.isAdult,
  rating: series.rating,
  plot: series.plot,
  releaseDate: series.releaseDate,
  genre: series.genre,
  tmdbId: series.tmdbId,
};

/**
 * Le synopsis de chaque ligne, dans la langue du profil.
 *
 * Une requete pour la page entiere. Les lignes sans traduction gardent le
 * texte du fournisseur, qui est le plus souvent deja dans la bonne langue —
 * la deduplication a choisi la version du profil.
 */
async function localizePlots<T extends { tmdbId: string | null; plot: string | null }>(
  kind: 'movie' | 'tv',
  rows: T[],
  viewer: Viewer,
): Promise<Map<T, string | null>> {
  const texts = await localizedTexts(
    kind,
    rows.map((r) => r.tmdbId).filter((id): id is string => Boolean(id)),
    viewer,
  );
  const out = new Map<T, string | null>();
  for (const r of rows) {
    const text = r.tmdbId ? texts.get(r.tmdbId) : undefined;
    out.set(r, text?.plot ?? r.plot);
  }
  return out;
}

/**
 * Les langues que le catalogue du compte contient reellement.
 *
 * Le selecteur d'un profil ne propose pas une liste figee : offrir « Coreen » a
 * un abonnement qui n'en a pas une ligne serait une promesse vide. On compte
 * donc ce qui existe, chaines et oeuvres confondues, et on garde les langues
 * assez fournies pour valoir un choix.
 *
 * Le compte et non le profil : les langues d'un catalogue dependent des
 * abonnements, pas de qui regarde. C'est ce qui permet d'appeler cette liste
 * depuis l'ecran des profils, ou justement aucun profil n'est encore choisi —
 * elle y repondait 409 « choisissez un profil », et le selecteur restait vide.
 *
 * Le seuil ecarte le bruit : un fournisseur prefixe une poignee d'entrees avec
 * des codes qui n'en sont pas — « HD », « PPV », un nom de bouquet.
 */
export async function catalogLanguages(userId: number, min = 40): Promise<CatalogLanguage[]> {
  const rows = await db.execute<{ code: string; n: number }>(raw`
    select lang_code as code, sum(n)::int as n from (
      select lang_code, count(*) as n from streams
      where removed_at is null and lang_code is not null
        and provider_id in ${activeProviders(userId)}
      group by lang_code
      union all
      select lang_code, count(*) as n from series
      where removed_at is null and lang_code is not null
        and provider_id in ${activeProviders(userId)}
      group by lang_code
    ) t
    group by lang_code
    order by 2 desc
  `);

  /*
   * Les orthographes d'une meme langue comptent ensemble.
   *
   * Le fournisseur emploie un code par marche et non par langue : l'anglais
   * arrive sous EN, US, UK, AU, IE, NZ. Sept lignes « Anglais » dans un
   * selecteur qui n'en accepte que trois n'auraient laisse aucun choix
   * raisonnable — et choisir la premiere aurait laisse les autres dehors.
   */
  const folded = new Map<string, number>();
  for (const row of rows) {
    const code = canonicalLanguage(row.code);
    folded.set(code, (folded.get(code) ?? 0) + Number(row.n));
  }

  return [...folded]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => {
      const tag = languageTag(code);
      return { code, label: tag?.label ?? code, flag: tag?.flag ?? null, count: n };
    });
}

// --------------------------------------------------------------- categories

export async function listCategories(
  type: CategoryType,
  viewer: Viewer,
): Promise<Category[]> {
  const conditions: SQL[] = [
    eq(categories.type, type),
    isNull(categories.removedAt),
    fromActiveProvider('categories', viewer),
    // Les categories aussi sont dupliquees entre abonnements. Sans ce filtre,
    // on compterait les doublons avant de les jeter faute de contenu : le
    // resultat serait juste, le cout doublerait.
    raw`not exists (
      select 1 from categories peer
      where peer.type = categories.type
        and peer.xtream_id = categories.xtream_id
        and peer.provider_id < categories.provider_id
        and peer.removed_at is null
        and peer.provider_id in ${activeProviders(viewer.id)}
    )`,
  ];
  if (!viewer.canWatchAdult) conditions.push(raw`categories.is_adult is not true`);

  const [rows, counts, logos, langs, pinned] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, isAdult: categories.isAdult })
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.name)),
    /*
     * Les trois cartes derivees viennent du cache : elles parcourent le
     * catalogue entier et ne changent qu'a la synchronisation. Voir
     * `catalog-cache.ts` — c'est ce qui faisait attendre trois secondes a
     * chaque ouverture de page.
     */
    memoByUser(`counts:${type}`, viewer.id, viewer.languages, () =>
      categoryCounts(type, viewer),
    ),
    type === 'live'
      ? // Les logos ne dependent pas de la langue : une cle commune evite de
        // recalculer la meme chose pour chaque profil du foyer.
        memoByUser('logos', viewer.id, [], () => categoryLogos(viewer))
      : Promise.resolve(new Map<number, string>()),
    memoByUser(`langs:${type}`, viewer.id, [], () => categoryLanguages(type, viewer)),
    db
      .select({ categoryId: favoriteCategories.categoryId })
      .from(favoriteCategories)
      .where(eq(favoriteCategories.profileId, viewer.profileId))
      .then((r) => new Set(r.map((x) => x.categoryId))),
  ]);

  return rows
    .map((r) => ({
      id: r.id,
      type,
      name: r.name,
      isAdult: r.isAdult,
      count: counts.get(r.id) ?? 0,
      logoUrl: logos.get(r.id) ?? null,
      isFavorite: pinned.has(r.id),
      languageCode: langs.get(r.id) ?? null,
    }))
    .filter((c) => c.count > 0)
    /*
     * Francais d'abord, puis l'ordre alphabetique du libelle affiche.
     *
     * Le tri se fait ici et non en SQL parce que les noms de categories
     * empilent plusieurs segments (`EU | FR | CANAL+ SPORTS`) que seule
     * `splitLanguage` sait lire — la meme fonction qui choisit le drapeau
     * affiche a cote, donc l'ordre et le drapeau ne peuvent pas diverger.
     *
     * Trier sur le nom brut, comme le faisait la base, rangeait la liste par
     * prefixe de region : l'utilisateur, qui ne voit que le libelle, y lisait
     * un ordre aleatoire.
     */
    .sort((a, b) => {
      // Une categorie epinglee passe devant tout le reste, francais compris :
      // c'est un choix explicite de l'utilisateur, il prime sur un defaut.
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      const rank =
        languageRank(a.name, a.languageCode, viewer.languages) -
        languageRank(b.name, b.languageCode, viewer.languages);
      if (rank !== 0) return rank;
      // `numeric` : « LIGUE 1+ 2 » avant « LIGUE 1+ 10 », comme en base.
      return splitLanguage(a.name).title.localeCompare(splitLanguage(b.name).title, 'fr', {
        numeric: true,
      });
    });
}

/**
 * Rechauffe le cache d'un compte, sans que personne n'attende.
 *
 * Le cache repond en 8 ms une fois rempli, mais le remplir coute 3,9 s : ce
 * prix se payait au premier chargement apres un demarrage du serveur ou apres
 * la synchronisation de 4 h — c'est-a-dire, presque toujours, a la premiere
 * visite du matin. Le faire d'avance le rend invisible.
 *
 * Une passe par jeu de langues distinct du foyer, et non par profil : trois
 * profils qui regardent tous en francais partagent le meme cache, et n'en
 * remplissent qu'un. L'epinglage et le filtre adulte, eux, restent calcules a
 * chaque appel — ils ne sont pas caches.
 */
export async function primeCatalogCache(userId: number): Promise<void> {
  const rows = await db
    .select({ languages: profiles.languages })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const sets = new Map<string, string[]>();
  for (const row of rows) {
    const langs = row.languages.length > 0 ? row.languages : [...DEFAULT_LANGUAGES];
    sets.set(langs.join('+'), langs);
  }
  // Un compte sans profil n'a pas encore de langue : le defaut fera l'affaire
  // pour celui qu'il creera.
  if (sets.size === 0) sets.set('FR', [...DEFAULT_LANGUAGES]);

  await Promise.all(
    [...sets.values()].map((languages) => {
      const viewer: Viewer = {
        id: userId,
        profileId: 0,
        canWatchAdult: false,
        languages,
        uiLanguage: null,
      };
      return Promise.all([
        listCategories('live', viewer),
        listCategories('vod', viewer),
        listCategories('series', viewer),
      ]);
    }),
  );
}

/**
 * Langue reellement portee par les chaines d'une categorie.
 *
 * Le prefixe du fournisseur ment parfois : « EU | FR | UFC INTERNATIONAL »
 * annonce du francais alors que ses 62 chaines sont toutes en « US - … ». Quand
 * au moins trois quarts s'accordent sur une meme langue, c'est elle qui fait
 * foi — le contenu prime sur l'etiquette.
 *
 * Mesure sur le catalogue reel : 73 categories sur 367 sont concernees, et
 * toutes y gagnent (« AM | USA | ABC » portait le globe des Ameriques, elle
 * porte desormais le drapeau americain). Une seule categorie francaise change
 * de groupe, et c'est precisement UFC INTERNATIONAL.
 */
async function categoryLanguages(type: CategoryType, viewer: Viewer): Promise<Map<number, string>> {
  const table = type === 'series' ? raw`series` : raw`streams`;
  const typeFilter = type === 'series' ? raw`true` : raw`type = ${type}`;

  const rows = await db.execute<{ category_id: number; lang: string }>(raw`
    with vis as (
      select category_id,
             upper(coalesce((regexp_match(name, '^[[:space:]]*([A-Za-z]{2,8})[[:space:]]*[-|]'))[1], '')) as lang
      from ${table}
      where removed_at is null and category_id is not null
        and ${typeFilter}
        and provider_id in ${activeProviders(viewer.id)}
    ), tally as (
      select category_id, lang, count(*) as n,
             sum(count(*)) over (partition by category_id) as total,
             row_number() over (partition by category_id order by count(*) desc, lang) as rk
      from vis where lang <> '' group by category_id, lang
    )
    select category_id, lang from tally
    where rk = 1 and n >= total * ${LOGO_DOMINANCE}
  `);

  const map = new Map<number, string>();
  for (const row of rows) map.set(Number(row.category_id), row.lang);
  return map;
}

/** Au-dela de cette part, le logo represente vraiment la categorie entiere. */
const LOGO_DOMINANCE = 0.75;

/**
 * Logo d'une categorie, quand ses chaines en partagent un.
 *
 * « AHL » aligne 33 chaines qui portent toutes le logo de la ligue : le drapeau
 * americain n'y apprend rien, le logo si. « GENERAL » en revanche rassemble des
 * chaines sans rapport, et prendre celle qui arrive en premier afficherait un
 * logo arbitraire pour toute la categorie.
 *
 * On ne renvoie donc le logo majoritaire que s'il couvre au moins trois quarts
 * des chaines. Mesure sur le catalogue reel : AHL 97 %, NHL 96 %, Apple TV 98 %,
 * Disney+ 95 % passent ; GENERAL 5 a 39 %, CINEMA 10 % sont ecartees.
 *
 * Live uniquement : une categorie de films n'a pas de logo, seulement des
 * affiches, et en prendre une au hasard ne voudrait rien dire.
 */
async function categoryLogos(viewer: Viewer): Promise<Map<number, string>> {
  const rows = await db.execute<{ category_id: number; icon_url: string }>(raw`
    with vis as (
      select category_id, icon_url from ${streams}
      where type = 'live' and removed_at is null
        and category_id is not null and icon_url is not null and icon_url <> ''
        and provider_id in ${activeProviders(viewer.id)}
    ), tally as (
      select category_id, icon_url, count(*) as n,
             sum(count(*)) over (partition by category_id) as total,
             row_number() over (partition by category_id order by count(*) desc, icon_url) as rk
      from vis group by category_id, icon_url
    )
    select category_id, icon_url from tally
    where rk = 1 and n >= total * ${LOGO_DOMINANCE}
  `);

  const map = new Map<number, string>();
  for (const row of rows) map.set(Number(row.category_id), row.icon_url);
  return map;
}

/**
 * Nombre d'elements visibles par categorie.
 *
 * Une seule passe groupee, et non une sous-requete correlee par categorie : le
 * compteur doit appliquer la meme deduplication que le listing, sinon la barre
 * laterale annonce 53 chaines la ou la grille en montre 26. Correlee, cette
 * verification prenait 59 s ; groupee, 70 ms en live, 157 ms en VOD.
 */
async function categoryCounts(type: CategoryType, viewer: Viewer): Promise<Map<number, number>> {
  const rows =
    type === 'series'
      ? await db
          .select({ categoryId: series.categoryId, count: raw<number>`count(*)` })
          .from(series)
          .where(
            and(
              isNull(series.removedAt),
              fromActiveProvider('series', viewer),
              dedupAcrossProviders('series', viewer),
            ),
          )
          .groupBy(series.categoryId)
      : await db
          .select({ categoryId: streams.categoryId, count: raw<number>`count(*)` })
          .from(streams)
          .where(
            and(
              eq(streams.type, type),
              isNull(streams.removedAt),
              fromActiveProvider('streams', viewer),
              dedupAcrossProviders('streams', viewer),
            ),
          )
          .groupBy(streams.categoryId);

  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.categoryId != null) map.set(row.categoryId, Number(row.count));
  }
  return map;
}

/**
 * Les genres du catalogue, et combien d'oeuvres visibles chacun porte.
 *
 * C'est la seule taxonomie editoriale que les pages de parcours aient a
 * proposer : les categories du fournisseur disent le bouquet et la langue,
 * jamais de quoi parle le film. Le compte suit la meme deduplication que le
 * listing, pour que la puce annonce le nombre de vignettes qu'on verra.
 *
 * Dans le cache, comme les comptes de categories : c'est un parcours du
 * catalogue entier, et il ne change qu'a la synchronisation. Le droit adulte
 * entre dans la cle — un profil enfant ne doit pas lire un compte qui inclut
 * ce qu'il ne verra pas. Le seuil ecarte les genres exotiques : une poignee
 * d'entrees italiennes ou arabes que l'enrichissement n'a pas traduites.
 */
export async function genreCounts(
  type: 'vod' | 'series',
  viewer: Viewer,
  min = 40,
): Promise<GenreCount[]> {
  const key = `genres:${type}:${viewer.canWatchAdult ? 'adult' : 'kid'}`;
  return memoByUser(key, viewer.id, viewer.languages, async () => {
    const adult = viewer.canWatchAdult ? raw`true` : raw`(categories.is_adult is not true)`;
    const rows =
      type === 'series'
        ? await db.execute<{ genre: string; n: number }>(raw`
            select g as genre, count(*)::int as n
            from series
            left join categories on categories.id = series.category_id
            cross join lateral unnest(string_to_array(replace(series.genre, ', ', ','), ',')) as g
            where series.removed_at is null and series.genre is not null
              and ${fromActiveProvider('series', viewer)}
              and ${dedupAcrossProviders('series', viewer)}
              and ${adult}
            group by g
            having count(*) >= ${min}
            order by n desc, g
          `)
        : await db.execute<{ genre: string; n: number }>(raw`
            select g as genre, count(*)::int as n
            from streams
            left join categories on categories.id = streams.category_id
            cross join lateral unnest(string_to_array(replace(streams.genre, ', ', ','), ',')) as g
            where streams.type = 'vod' and streams.removed_at is null and streams.genre is not null
              and ${fromActiveProvider('streams', viewer)}
              and ${dedupAcrossProviders('streams', viewer)}
              and ${adult}
            group by g
            having count(*) >= ${min}
            order by n desc, g
          `);
    /*
     * Le seuil est relatif au genre le plus fourni.
     *
     * Le plancher absolu laissait passer la queue de la liste des series :
     * « Drama » en anglais, « دراما », « Soap » — des restes d'enrichissement
     * dans une autre langue, a quelques centaines d'entrees quand « Drame » en
     * compte douze mille. A trois pour cent du premier, il ne reste que ce
     * qui merite une puce.
     */
    const top = Number(rows[0]?.n ?? 0);
    return rows
      .filter((r) => Number(r.n) >= Math.max(min, top * 0.03))
      .map((r) => ({ genre: r.genre, count: Number(r.n) }));
  });
}

/**
 * Ou l'on en est, pour les flux d'une page de resultats.
 *
 * La progression est enregistree sur la ligne effectivement lue, qui n'est pas
 * forcement le representant retenu par la deduplication — la meme regle de
 * groupe que le favori. Quand un groupe a plusieurs progressions (« TF1 FHD »
 * hier, « TF1 HD » ce matin), c'est la plus recente qui vaut.
 */
async function streamProgress(
  profileId: number,
  ids: number[],
): Promise<Map<number, WatchState>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute<{
    id: number;
    position_sec: number;
    duration_sec: number | null;
    completed: boolean;
  }>(raw`
    select distinct on (s.id) s.id, w.position_sec, w.duration_sec, w.completed
    from ${streams} s
    join ${streams} seen on seen.type = s.type and seen.group_key = s.group_key
    join watch_progress w on w.item_id = seen.id and w.item_type = 'stream'
    where s.id in ${ids} and w.profile_id = ${profileId}
    order by s.id, w.updated_at desc
  `);
  return new Map(rows.map((r) => [Number(r.id), watchState(r)]));
}

/**
 * Ou l'on en est, pour les series d'une page de resultats.
 *
 * Une serie n'a pas de progression a elle : ce sont ses episodes qui en
 * portent une. On prend la plus recente du groupe, celle qui dit ou reprendre.
 */
async function seriesProgress(
  profileId: number,
  ids: number[],
): Promise<Map<number, WatchState>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute<{
    id: number;
    position_sec: number;
    duration_sec: number | null;
    completed: boolean;
  }>(raw`
    select distinct on (s.id) s.id, w.position_sec, w.duration_sec, w.completed
    from ${series} s
    join ${series} seen on seen.work_key = s.work_key
    join ${episodes} ep on ep.series_id = seen.id
    join watch_progress w on w.item_id = ep.id and w.item_type = 'episode'
    where s.id in ${ids} and w.profile_id = ${profileId}
    order by s.id, w.updated_at desc
  `);
  return new Map(rows.map((r) => [Number(r.id), watchState(r)]));
}

/** La part lue, bornee : une duree absente vaut zero, pas une division par zero. */
function watchState(row: {
  position_sec: number;
  duration_sec: number | null;
  completed: boolean;
}): WatchState {
  const duration = Number(row.duration_sec ?? 0);
  const ratio = duration > 0 ? Math.min(1, Number(row.position_sec) / duration) : 0;
  return { ratio, completed: Boolean(row.completed) };
}

// ------------------------------------------------------------------ listing

export interface ListParams {
  categoryId?: number | undefined;
  q?: string | undefined;
  /** Restreint aux favoris de l'utilisateur, pagination et compteur compris. */
  favorites?: boolean | undefined;
  watched?: boolean | undefined;
  /** Reaffiche les separateurs decoratifs du fournisseur, masques par defaut. */
  separators?: boolean | undefined;
  /** Ne garde qu'une langue : voir `languageFilter`. */
  language?: string | undefined;
  /** Ne garde qu'un genre : voir `genreFilter`. */
  genre?: string | undefined;
  sort: 'fr' | 'name' | 'added' | 'recent' | 'rating';
  limit: number;
  offset: number;
}

/*
 * Les quatre ordres, et ce qui les distingue.
 *
 * `fr`     — francais d'abord, puis alphabetique naturel. Defaut du direct : une
 *            chaine ne « sort » pas, on la cherche par son nom.
 * `recent` — francais d'abord, puis du plus recemment ajoute. Defaut des films
 *            et des series : un catalogue de 95 000 titres tries par nom montre
 *            eternellement les memes en tete, et jamais les nouveautes.
 * `added`  — recence pure, toutes langues melangees. Cible des liens
 *            « Tout voir » des rangees de nouveautes de l'accueil.
 * `name`   — alphabetique seul.
 *
 * Pourquoi `recent` garde le rang de langue devant la date : dans une categorie,
 * il ne departage rien — les 156 categories de films sont a plus de 75 % d'une
 * seule langue, 154 a plus de 90 %. L'ordre y est donc bien celui de la date.
 * Il ne joue que sur « toutes les categories », ou une recence pure noierait le
 * francais sous les ajouts anglophones du jour.
 */

/**
 * Ordre naturel : « LIGUE 1+ 2 » avant « LIGUE 1+ 10 ».
 *
 * Un tri texte classe les chiffres caractere par caractere et intercale donc
 * « 10 » entre « 1 » et « 2 ». La collation ICU `public.natural` (locale
 * `fr-u-kn`) compare les suites de chiffres comme des nombres. Elle coute
 * 15 ms sur les chaines et 30 sur les films, sans index dedie.
 */
const NATURAL = (table: 'streams' | 'series'): SQL =>
  table === 'streams'
    ? raw`streams.name collate public.natural asc`
    : raw`series.name collate public.natural asc`;

/*
 * « Mieux notes », sans les dix sur dix de complaisance.
 *
 * Mille sept cent soixante-dix films portent 9,5 ou plus, et les premiers sont
 * un concert de Lana Del Rey, un documentaire sur la sante et « Pate
 * feuilletee » : la note d'une oeuvre que trois personnes ont notee. Sans
 * nombre de votes pour la ponderer, on range ces notes-la derriere les autres
 * — elles restent dans la liste, elles ne la menent plus.
 */
const RATED = (table: 'streams' | 'series'): SQL => {
  const col = table === 'streams' ? raw`streams.rating` : raw`series.rating`;
  return raw`(${col} between 1 and 9.4) desc, ${col} desc nulls last`;
};

/*
 * Les langues du profil d'abord, puis l'ordre de la telecommande.
 *
 * Le tri `fr` porte mal son nom depuis que la langue se choisit : il remonte
 * ce que le profil a mis en avant, quel que soit ce que c'est. Sur un
 * catalogue de 24 000 chaines dont une centaine interessent vraiment, c'est ce
 * qui rend la premiere page utile.
 *
 * Sur le direct, l'alphabet ne suffisait pas : « 6TER », « 13EME RUE », « 20
 * MINUTES TV », « A LA CARTE 1 »… et TF1 quelque part au milieu. Personne ne
 * cherche une chaine a son initiale, on la cherche a sa place. `channel_rank`
 * la donne pour les generalistes de chaque pays ; le reste garde l'alphabet,
 * derriere.
 */
function orderFor(
  params: ListParams,
  table: 'streams' | 'series',
  viewer: Viewer,
  type?: 'live' | 'vod',
): SQL {
  /*
   * Une recherche se classe par pertinence, pas par alphabet.
   *
   * Les pages de parcours acceptent un terme, et le filtre trigramme faisait
   * bien son travail — mais l'ordre restait celui de la liste complete. Chercher
   * « toy story » dans les films sortait « Toy Story 2 Pt » avant « Toy
   * Story », parce que le second commence par la meme lettre et vient apres
   * dans l'alphabet. Le meme classement que la recherche globale s'applique.
   */
  if (params.q) return relevance(table, params.q, viewer);
  /*
   * « Vu recemment » porte son ordre dans son nom.
   *
   * Le tri choisi dans la barre ne s'applique pas ici : demander ce qu'on a
   * regarde et l'obtenir par ordre alphabetique n'aurait aucun sens. La
   * sous-requete ne coute rien — le filtre a deja ramene la liste aux quelques
   * dizaines de lignes que le profil a ouvertes.
   */
  if (params.watched) {
    return table === 'streams'
      ? raw`(select max(w.updated_at) from watch_progress w
             join streams seen on seen.id = w.item_id
             where w.profile_id = ${viewer.profileId} and w.item_type = 'stream'
               and seen.type = streams.type and seen.group_key = streams.group_key) desc nulls last,
            ${NATURAL('streams')}`
      : raw`(select max(w.updated_at) from watch_progress w
             join episodes ep on ep.id = w.item_id
             join series seen on seen.id = ep.series_id
             where w.profile_id = ${viewer.profileId} and w.item_type = 'episode'
               and seen.work_key = series.work_key) desc nulls last,
            ${NATURAL('series')}`;
  }
  const pref = prefRank(viewer, table);
  // `nulls last` : une chaine non numerotee passe apres toutes celles qui le
  // sont, et non avant — c'est l'ordre par defaut de Postgres en ascendant,
  // qu'on ecrit malgre tout pour que la regle se lise.
  const numbered =
    type === 'live' ? raw`streams.channel_rank asc nulls last, ` : raw``;
  if (table === 'streams') {
    if (params.sort === 'fr') return raw`${pref} asc, ${numbered}${NATURAL('streams')}`;
    if (params.sort === 'recent') {
      return raw`${pref} asc, streams.added_at desc nulls last, ${NATURAL('streams')}`;
    }
    // Les langues du profil d'abord, comme `recent` : ce qui reste en langue
    // etrangere apres deduplication n'existe qu'en langue etrangere.
    if (params.sort === 'rating') return raw`${pref} asc, ${RATED('streams')}, ${NATURAL('streams')}`;
    return params.sort === 'name'
      ? raw`${numbered}${NATURAL('streams')}`
      : raw`streams.added_at desc nulls last, ${NATURAL('streams')}`;
  }
  if (params.sort === 'fr') return raw`${pref} asc, ${NATURAL('series')}`;
  if (params.sort === 'recent') {
    return raw`${pref} asc, series.added_at desc nulls last, ${NATURAL('series')}`;
  }
  if (params.sort === 'rating') return raw`${pref} asc, ${RATED('series')}, ${NATURAL('series')}`;
  return params.sort === 'name'
    ? raw`${NATURAL('series')}`
    : raw`series.added_at desc nulls last, ${NATURAL('series')}`;
}

/**
 * Filtre de recherche. Le terme est normalise par la base avec la meme fonction
 * que la colonne generee, sinon un titre accentue ne serait jamais trouve.
 *
 * `%` (pg_trgm) attrape les fautes de frappe, `like` la sous-chaine exacte que la
 * similarite trigramme rate sur les termes courts. Les colonnes sont ecrites en
 * clair : dans un template `sql`, Drizzle les rendrait sans prefixe de table.
 */
function trigramFilter(table: 'streams' | 'series', q: string): SQL {
  const col = table === 'streams' ? raw`streams.search_name` : raw`series.search_name`;
  const tight = table === 'streams' ? raw`streams.tight_name` : raw`series.tight_name`;
  /*
   * `nullif` sur la forme serree : une requete faite uniquement de ponctuation
   * la reduit a la chaine vide, et `like '' || '%'` ramenerait tout le
   * catalogue. Compare a NULL, le test est simplement faux.
   */
  return raw`(${col} % public.search_name(${q})
    or ${col} like '%' || public.search_name(${q}) || '%'
    or ${tight} like nullif(public.tight_name(${q}), '') || '%')`;
}

/**
 * Classement par palier de correspondance, puis par langue.
 *
 * La similarite trigramme seule inversait le classement : elle favorise les
 * noms courts, si bien que « canal + » remontait « GT - CANAL 3 » (0,545)
 * devant « FR - CANAL+ FOOT » (0,500) — mesure sur le catalogue reel. Un nom
 * *qui commence par* le terme cherche doit passer devant un nom qui le contient
 * par hasard, quelle que soit sa longueur.
 *
 * Les paliers rendent aussi le francais utilisable comme second critere : a
 * qualite de correspondance egale il passe devant, sans jamais remonter un
 * titre francais sans rapport devant la correspondance exacte.
 */
/**
 * Le palier de correspondance, isole pour etre a la fois trie et renvoye.
 *
 * Le front en a besoin : il fusionne les trois familles au lieu de les
 * alterner. Chercher « toy story » sortait *Boat Story* en deuxieme position,
 * avant *Toy Story 2*, simplement parce que c'etait le tour des series.
 *
 * Trois paliers seulement, et la correspondance exacte n'en forme pas un a
 * part : « le nom commence par ce que j'ai tape » couvre les deux, et laisse la
 * langue departager. Un palier « exact » separe faisait remonter « GR - SPORT
 * HD » devant « FR - SPORT EN FRANCE » sur la requete « sport ».
 *
 * Le dernier mot de la requete est traite comme un prefixe : on cherche pendant
 * qu'on tape, et « bein sport » doit trouver « beIN SPORTS 1 ». Un test de mot
 * entier laissait le pluriel echouer, et les chaines arabes « BEIN SPORT TOD »
 * passaient devant les francaises.
 */
function matchTier(table: 'streams' | 'series', q: string): SQL {
  const name = table === 'streams' ? raw`streams.search_name` : raw`series.search_name`;
  const tight = table === 'streams' ? raw`streams.tight_name` : raw`series.tight_name`;
  // « ␣mot␣mot␣ » : la ponctuation devient une frontiere, un mot entier se
  // teste alors avec un simple `like`. Calcule sur les seuls candidats deja
  // filtres par l'index, jamais sur la table entiere.
  const loose = raw`(' ' || regexp_replace(${name}, '[^a-z0-9]+', ' ', 'g') || ' ')`;
  const lq = raw`btrim(regexp_replace(public.search_name(${q}), '[^a-z0-9]+', ' ', 'g'))`;
  const tq = raw`nullif(public.tight_name(${q}), '')`;
  return raw`case
      when ${tight} like ${tq} || '%' then 0
      when ${loose} like ' ' || ${lq} || '%' then 1
      when ${loose} like '% ' || ${lq} || '%' then 2
      else 3
    end`;
}

function relevance(table: 'streams' | 'series', q: string, viewer: Viewer): SQL {
  const name = table === 'streams' ? raw`streams.search_name` : raw`series.search_name`;
  const rank = prefRank(viewer, table);
  const tier = matchTier(table, q);
  /*
   * Le francais departage a l'interieur des correspondances *fortes*, pas sur
   * tout le classement.
   *
   * Trier par palier d'abord laissait « sport » ne ramener que « GR - SPORT
   * HD », « HU - SPORT 2 », « CZ - SPORT 1 » : aucune chaine francaise ne
   * *commence* par « sport », CANAL+ SPORT et BEIN SPORTS arrivaient au palier
   * suivant et les six places etaient prises. Trier par langue d'abord, a
   * l'inverse, remonterait n'importe quel titre francais vaguement approchant
   * devant la correspondance exacte cherchee — « breaking bad » ne trouverait
   * plus la serie.
   *
   * On separe donc d'abord le fort du faible (le nom contient le terme cherche,
   * ou non), on prefere le francais dans le groupe fort, et le palier ne sert
   * qu'ensuite a ordonner. Le trigramme seul, lui, reste en fin de liste.
   */
  /*
   * Le dernier depart d'egalite est l'ordre naturel, pas l'identifiant.
   *
   * « Toy Story 2 », « Toy Story 3 » et « Toy Story 4 » ont le meme palier, la
   * meme langue, la meme similarite et la meme longueur : rien ne les
   * departageait, et la suite sortait dans le desordre — 4, puis 5, puis 2. La
   * collation naturelle les remet dans l'ordre de leur numero.
   */
  return raw`case when ${tier} <= 2 then 0 else 1 end asc,
    ${rank} asc,
    ${tier} asc,
    similarity(${name}, public.search_name(${q})) desc,
    length(${name}) asc,
    ${NATURAL(table)}`;
}

/**
 * Recherche etendue au programme en cours.
 *
 * Chercher « premier league » ne trouvait rien : aucune chaine ne s'appelle
 * ainsi. « CANAL+ FOOT » la diffuse pourtant, et la grille le sait. On teste
 * donc aussi le titre de ce qui passe **maintenant**.
 *
 * Les programmes sont filtres d'abord, dans une sous-requete a part : leur index
 * trigramme sert alors pleinement. Poser le test au meme niveau que celui du nom
 * force un parcours des 272 000 programmes par chaine candidate — 374 ms
 * mesurees, contre 68 sous cette forme.
 */
function nowPlayingFilter(q: string): SQL {
  return raw`(streams.epg_channel_id is not null and streams.epg_channel_id <> ''
    and (streams.provider_id, streams.epg_channel_id) in (
      select e.provider_id, e.channel_xmltv_id from epg_programmes e
      where e.title_normalized % public.normalize_name(${q})
        and e.start_at <= now() and e.end_at > now()
    ))`;
}

/**
 * Entrees decoratives du fournisseur.
 *
 * Il insere des separateurs dans sa liste de chaines : « ##### DAZN EVENEMENT
 * PPV ##### ». Ce ne sont pas des chaines — 1 102 sur 24 542 vignettes, et sur
 * ces 1 102, sept seulement portent un identifiant EPG et trois un programme.
 *
 * Elles sont masquees et non supprimees : la regle est une heuristique sur le
 * nom, et une chaine reelle mal nommee doit rester rattrapable. Le parametre
 * `separators` du listing les fait reapparaitre.
 */
const SEPARATOR = raw`(streams.name ~ '^[^A-Za-z0-9]*#{3,}')`;

export async function listStreams(
  type: 'live' | 'vod',
  params: ListParams,
  viewer: Viewer,
): Promise<Paginated<Movie | LiveChannel>> {
  const extra: (SQL | undefined)[] = [eq(streams.type, type)];
  if (params.categoryId) extra.push(eq(streams.categoryId, params.categoryId));
  if (params.q) {
    // Sur une chaine, ce qui passe compte autant que le nom.
    extra.push(
      type === 'live'
        ? raw`(${trigramFilter('streams', params.q)} or ${nowPlayingFilter(params.q)})`
        : trigramFilter('streams', params.q),
    );
  }
  // Les separateurs du fournisseur ne sont pas des chaines : hors listing.
  if (type === 'live' && !params.separators) extra.push(raw`not ${SEPARATOR}`);
  if (params.language) extra.push(languageFilter('streams', params.language));
  if (params.genre) extra.push(genreFilter('streams', params.genre));
  /*
   * Le favori porte sur la ligne mise en favori, qui n'est pas forcement le
   * representant retenu par la deduplication : mettre « FR - TF1 FHD » en favori
   * puis voir la grille afficher « FR - TF1 HD » ferait disparaitre le favori.
   * On teste donc tout le groupe.
   */
  if (params.favorites) {
    extra.push(raw`exists (
      select 1 from favorites f
      join streams fav on fav.id = f.item_id
      where f.profile_id = ${viewer.profileId} and f.item_type = 'stream'
        and fav.type = streams.type and fav.group_key = streams.group_key
    )`);
  }
  /*
   * Deja regarde. Meme regle de groupe que le favori : la progression est
   * enregistree sur la ligne effectivement lue, qui n'est pas forcement le
   * representant que la deduplication retient.
   */
  if (params.watched) {
    extra.push(raw`exists (
      select 1 from watch_progress w
      join streams seen on seen.id = w.item_id
      where w.profile_id = ${viewer.profileId} and w.item_type = 'stream'
        and seen.type = streams.type and seen.group_key = streams.group_key
    )`);
  }
  const where = visible(viewer, extra);

  const [rows, [countRow]] = await Promise.all([
    db
      .select(streamColumns)
      .from(streams)
      .leftJoin(categories, eq(categories.id, streams.categoryId))
      .where(where)
      .orderBy(orderFor(params, 'streams', viewer, type))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ n: raw<number>`count(*)` })
      .from(streams)
      .leftJoin(categories, eq(categories.id, streams.categoryId))
      .where(where),
  ]);

  const items = rows.map((r) => (type === 'vod' ? toMovie(r) : toChannel(r)));

  // Le synopsis dans la langue du profil : c'est lui que la vignette montre.
  if (type === 'vod' && rows.length > 0) {
    const plots = await localizePlots('movie', rows, viewer);
    rows.forEach((r, i) => {
      const item = items[i];
      if (item && item.type === 'vod') item.plot = plots.get(r) ?? null;
    });
  }

  /*
   * « En ce moment » et « en favori » : une requete chacun pour toute la page.
   * Le favori vaut pour les deux types — une carte de film doit pouvoir
   * s'etoiler depuis la grille, comme une chaine.
   */
  if (items.length > 0) {
    const ids = items.map((i) => i.id);
    const [playing, starred, seen] = await Promise.all([
      type === 'live' ? nowPlayingFor(ids) : Promise.resolve(new Map()),
      favoriteChannelIds(viewer.profileId, ids),
      // Une seule requete pour la page entiere, comme les favoris au-dessus.
      params.watched ? streamProgress(viewer.profileId, ids) : Promise.resolve(new Map()),
    ]);
    for (const item of items) {
      item.isFavorite = starred.has(item.id);
      if (params.watched) item.watch = seen.get(item.id) ?? null;
      if (item.type === 'live') item.now = playing.get(item.id) ?? null;
    }
  }

  return {
    items,
    total: Number(countRow?.n ?? 0),
    limit: params.limit,
    offset: params.offset,
  };
}

export async function listSeries(
  params: ListParams,
  viewer: Viewer,
): Promise<Paginated<SeriesSummary>> {
  const parts: SQL[] = [
    isNull(series.removedAt),
    fromActiveProvider('series', viewer),
    dedupAcrossProviders('series', viewer),
  ];
  if (!viewer.canWatchAdult) parts.push(raw`(categories.is_adult is not true)`);
  if (params.categoryId) parts.push(eq(series.categoryId, params.categoryId));
  if (params.q) parts.push(trigramFilter('series', params.q));
  if (params.language) parts.push(languageFilter('series', params.language));
  if (params.genre) parts.push(genreFilter('series', params.genre));
  /*
   * Meme regle qu'en streams : le favori porte sur la ligne mise en favori, qui
   * n'est pas forcement le representant retenu par la deduplication. On teste
   * donc tout le groupe — ici `work_key`, les series n'ayant pas de qualite.
   */
  if (params.favorites) {
    parts.push(raw`exists (
      select 1 from favorites f
      join series fav on fav.id = f.item_id
      where f.profile_id = ${viewer.profileId} and f.item_type = 'series'
        and fav.work_key = series.work_key
    )`);
  }
  /*
   * Deja regardee. La progression d'une serie vit sur ses episodes : on
   * remonte l'episode a sa serie, puis au groupe de deduplication.
   */
  if (params.watched) {
    parts.push(raw`exists (
      select 1 from watch_progress w
      join episodes ep on ep.id = w.item_id
      join series seen on seen.id = ep.series_id
      where w.profile_id = ${viewer.profileId} and w.item_type = 'episode'
        and seen.work_key = series.work_key
    )`);
  }
  const where = and(...parts)!;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        ...seriesColumns,
        /*
         * Saisons et episodes, comptes sur ce que la base sait deja.
         *
         * Les episodes n'arrivent qu'a l'ouverture d'une fiche : pour presque
         * toutes les series le compte vaut zero, que `toSeries` rend en `null`.
         * Une sous-requete par ligne, servie par l'index de la serie.
         */
        seasonCount: raw<number>`(select count(distinct e.season)::int from episodes e
          where e.series_id = series.id and e.removed_at is null)`,
        episodeCount: raw<number>`(select count(*)::int from episodes e
          where e.series_id = series.id and e.removed_at is null)`,
      })
      .from(series)
      .leftJoin(categories, eq(categories.id, series.categoryId))
      .where(where)
      .orderBy(orderFor(params, 'series', viewer))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ n: raw<number>`count(*)` })
      .from(series)
      .leftJoin(categories, eq(categories.id, series.categoryId))
      .where(where),
  ]);

  const items = rows.map(toSeries);
  if (rows.length > 0) {
    const plots = await localizePlots('tv', rows, viewer);
    rows.forEach((r, i) => {
      const item = items[i];
      if (item) item.plot = plots.get(r) ?? null;
    });
  }
  // Une requete pour toute la page : l'etoile doit s'allumer des la liste, pas
  // seulement une fois la fiche ouverte.
  if (items.length > 0) {
    const ids = items.map((i) => i.id);
    const [starred, seen] = await Promise.all([
      favoriteSeriesIds(viewer.profileId, ids),
      params.watched ? seriesProgress(viewer.profileId, ids) : Promise.resolve(new Map()),
    ]);
    for (const item of items) {
      item.isFavorite = starred.has(item.id);
      if (params.watched) item.watch = seen.get(item.id) ?? null;
    }
  }

  return {
    items,
    total: Number(countRow?.n ?? 0),
    limit: params.limit,
    offset: params.offset,
  };
}

// ---------------------------------------------------------------- recherche

export async function search(
  q: string,
  limit: number,
  viewer: Viewer,
): Promise<SearchResults> {
  const [live, movies, seriesRows] = await Promise.all([
    db
      .select({ ...streamColumns, matchTier: raw<number>`${matchTier('streams', q)}` })
      .from(streams)
      .leftJoin(categories, eq(categories.id, streams.categoryId))
      .where(
        visible(viewer, [
          eq(streams.type, 'live'),
          trigramFilter('streams', q),
          /*
           * Les separateurs sont masques dans la grille mais remontaient en
           * recherche : « ##### MX - CANAL ##### », reduit a « canal » une fois
           * nettoye, arrivait premier sur « canal + ». Ce ne sont pas des
           * chaines — ils n'ont rien a faire dans les resultats non plus.
           */
          raw`not ${SEPARATOR}`,
        ]),
      )
      .orderBy(relevance('streams', q, viewer))
      .limit(limit),
    db
      .select({ ...streamColumns, matchTier: raw<number>`${matchTier('streams', q)}` })
      .from(streams)
      .leftJoin(categories, eq(categories.id, streams.categoryId))
      .where(visible(viewer, [eq(streams.type, 'vod'), trigramFilter('streams', q)]))
      .orderBy(relevance('streams', q, viewer))
      .limit(limit),
    db
      .select({ ...seriesColumns, matchTier: raw<number>`${matchTier('series', q)}` })
      .from(series)
      .leftJoin(categories, eq(categories.id, series.categoryId))
      .where(
        and(
          isNull(series.removedAt),
          fromActiveProvider('series', viewer),
          dedupAcrossProviders('series', viewer),
          viewer.canWatchAdult ? undefined : raw`(categories.is_adult is not true)`,
          trigramFilter('series', q),
        ),
      )
      .orderBy(relevance('series', q, viewer))
      .limit(limit),
  ]);

  /*
   * Le palier voyage avec chaque resultat.
   *
   * Le front melange les trois familles ; sans lui, il ne peut qu'alterner a
   * l'aveugle et poser une ressemblance vague de serie au-dessus d'un titre de
   * film qui commence exactement par ce qui est cherche.
   */
  // Postgres renvoie le `case` en entier ; le type partage n'en accepte que
  // quatre valeurs, et c'est bien ce que l'expression produit.
  const tierOf = (row: { matchTier: number }): MatchTier => row.matchTier as MatchTier;

  const liveItems: LiveChannel[] = live.map((r) => ({ ...toChannel(r), matchTier: tierOf(r) }));
  if (liveItems.length > 0) {
    const playing = await nowPlayingFor(liveItems.map((i) => i.id));
    for (const item of liveItems) item.now = playing.get(item.id) ?? null;
  }

  return {
    live: liveItems,
    movies: movies.map((r) => ({ ...toMovie(r), matchTier: tierOf(r) })),
    series: seriesRows.map((r) => ({ ...toSeries(r), matchTier: tierOf(r) })),
  };
}

/**
 * Le texte TMDB dans la langue du profil.
 *
 * Le catalogue est classe par langue depuis que chaque profil choisit les
 * siennes, mais les synopsis restaient dans celle du fournisseur : un profil
 * regle en allemand lisait un titre allemand surmontant un resume francais.
 *
 * L'ordre suit ce qu'on lit, pas ce qu'on cherche : la langue de l'interface
 * d'abord, puis les langues du catalogue, puis le texte d'origine. Un synopsis
 * est du texte a lire, comme les boutons — pas un critere de selection. Un
 * profil qui met son catalogue en allemand mais garde une interface francaise
 * lisait ses resumes en allemand, ce qu'il n'avait demande nulle part.
 *
 * Les titres des **listes** ne passent pas par ici, et n'en ont pas besoin : la
 * deduplication choisit deja la ligne dans la langue du profil, donc son nom
 * est deja dans la bonne langue. Seules les fiches et la mise en avant, qui
 * montrent un synopsis, ont quelque chose a traduire.
 */
async function localizedTexts(
  kind: 'movie' | 'tv',
  tmdbIds: string[],
  viewer: Viewer,
): Promise<Map<string, { title: string | null; plot: string | null }>> {
  const out = new Map<string, { title: string | null; plot: string | null }>();
  const ids = [...new Set(tmdbIds.filter(Boolean))];
  // La langue de lecture en tete, sans doublon si elle est deja dans la liste.
  const wanted = [...new Set([viewer.uiLanguage, ...viewer.languages])].filter(
    (c): c is string => Boolean(c),
  );
  if (ids.length === 0 || wanted.length === 0) return out;

  const rows = await db
    .select({
      tmdbId: tmdbTexts.tmdbId,
      lang: tmdbTexts.lang,
      title: tmdbTexts.title,
      plot: tmdbTexts.plot,
    })
    .from(tmdbTexts)
    .where(
      and(
        eq(tmdbTexts.kind, kind),
        inArray(tmdbTexts.tmdbId, ids),
        inArray(tmdbTexts.lang, wanted),
      ),
    );

  // Le rang de la langue decide : deux traductions disponibles, on prend celle
  // que le profil a placee en premier.
  const rank = new Map(wanted.map((code, i) => [code, i]));
  const best = new Map<string, number>();
  for (const row of rows) {
    const at = rank.get(row.lang) ?? 99;
    if ((best.get(row.tmdbId) ?? 99) <= at) continue;
    best.set(row.tmdbId, at);
    out.set(row.tmdbId, { title: row.title, plot: row.plot });
  }
  return out;
}

// -------------------------------------------------------------------- fiches

async function progressFor(
  profileId: number,
  itemType: ItemType,
  itemIds: number[],
): Promise<Map<number, WatchProgress>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(watchProgress)
    .where(
      and(
        eq(watchProgress.profileId, profileId),
        eq(watchProgress.itemType, itemType),
        inArray(watchProgress.itemId, itemIds),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.itemId,
      {
        itemType: r.itemType,
        itemId: r.itemId,
        positionSec: r.positionSec,
        durationSec: r.durationSec,
        completed: r.completed,
        updatedAt: r.updatedAt.toISOString(),
      },
    ]),
  );
}

async function isFavorite(
  profileId: number,
  itemType: 'stream' | 'series',
  itemId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ itemId: favorites.itemId })
    .from(favorites)
    .where(
      and(
        eq(favorites.profileId, profileId),
        eq(favorites.itemType, itemType),
        eq(favorites.itemId, itemId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Chaines de la page qui sont en favori.
 *
 * On compare par groupe et non par identifiant : la grille montre un
 * representant par chaine, et la ligne effectivement mise en favori peut etre
 * une autre qualite du meme groupe.
 */
async function favoriteChannelIds(
  profileId: number,
  streamIds: number[],
): Promise<Set<number>> {
  if (streamIds.length === 0) return new Set();
  const rows = await db
    .select({ id: streams.id })
    .from(streams)
    .where(
      and(
        inArray(streams.id, streamIds),
        raw`exists (
          select 1 from favorites f
          join streams fav on fav.id = f.item_id
          where f.profile_id = ${profileId} and f.item_type = 'stream'
            and fav.type = streams.type and fav.group_key = streams.group_key
        )`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * Series de la page qui sont en favori.
 *
 * Meme regle qu'ailleurs : on compare par `work_key` et non par identifiant. La
 * liste montre un representant par oeuvre, et la ligne effectivement mise en
 * favori peut etre une autre declinaison du meme groupe.
 */
async function favoriteSeriesIds(
  profileId: number,
  seriesIds: number[],
): Promise<Set<number>> {
  if (seriesIds.length === 0) return new Set();
  const rows = await db
    .select({ id: series.id })
    .from(series)
    .where(
      and(
        inArray(series.id, seriesIds),
        raw`exists (
          select 1 from favorites f
          join series fav on fav.id = f.item_id
          where f.profile_id = ${profileId} and f.item_type = 'series'
            and fav.work_key = series.work_key
        )`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Epingle ou desepingle une categorie. Renvoie l'etat obtenu. */
export async function toggleFavoriteCategory(
  profileId: number,
  categoryId: number,
  pinned: boolean,
): Promise<void> {
  if (pinned) {
    await db.insert(favoriteCategories).values({ profileId, categoryId }).onConflictDoNothing();
    return;
  }
  await db
    .delete(favoriteCategories)
    .where(
      and(
        eq(favoriteCategories.profileId, profileId),
        eq(favoriteCategories.categoryId, categoryId),
      ),
    );
}

/**
 * Fiche d'une chaine, ouverte par le lecteur.
 *
 * Une chaine n'a pas de page a elle — on la lance depuis la grille — mais le
 * lecteur a besoin de trois choses que la vignette ne porte pas : les qualites
 * disponibles, le programme en cours et le suivant.
 */
export async function getChannel(id: number, viewer: Viewer): Promise<ChannelDetail> {
  const [row] = await db
    .select({ ...streamColumns, groupKey: streams.groupKey })
    .from(streams)
    .leftJoin(categories, eq(categories.id, streams.categoryId))
    .where(and(eq(streams.id, id), eq(streams.type, 'live')))
    .limit(1);

  if (!row) throw notFound('Chaine introuvable.');
  if (row.categoryIsAdult === true && !viewer.canWatchAdult) {
    throw new AppError(403, 'ADULT_CONTENT_FORBIDDEN', 'Contenu non autorise sur ce compte.');
  }

  const [variants, schedule] = await Promise.all([
    channelVariants(row.groupKey, viewer),
    channelSchedule(id, 2),
  ]);

  // `channelSchedule` part du programme en cours : le premier n'en est un que
  // s'il a effectivement commence, sinon la chaine est entre deux emissions.
  const started = schedule[0] && new Date(schedule[0].startAt).getTime() <= Date.now();

  return {
    ...toChannel(row),
    variants,
    now: started ? schedule[0]! : null,
    next: started ? schedule[1] ?? null : schedule[0] ?? null,
  };
}

/**
 * Qualites disponibles pour une meme chaine, celle-ci comprise.
 *
 * Meme regle qu'en VOD : on dedoublonne sur le nom, pas sur l'abonnement. Deux
 * abonnements servant « FR - CANAL+ LIVE 1 FHD » donnent la meme image, et la
 * bascule automatique choisira celui qui a une connexion libre.
 */
async function channelVariants(groupKey: string | null, viewer: Viewer): Promise<VariantDto[]> {
  if (!groupKey) return [];

  const rows = await db
    .select({
      id: streams.id,
      name: streams.name,
      containerExtension: streams.containerExtension,
      quality: raw<string | null>`public.channel_quality(streams.name)`,
    })
    .from(streams)
    .where(
      and(
        eq(streams.type, 'live'),
        eq(streams.groupKey, groupKey),
        isNull(streams.removedAt),
        fromActiveProvider('streams', viewer),
      ),
    )
    .orderBy(raw`streams.quality_rank asc, ${NATURAL('streams')}, streams.id asc`);

  const seen = new Set<string>();
  const variants: VariantDto[] = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    variants.push({
      id: r.id,
      name: r.name,
      containerExtension: r.containerExtension,
      browserPlayable: isBrowserPlayable(r.containerExtension),
      quality: r.quality,
    });
  }
  return variants;
}

export async function getMovie(id: number, viewer: Viewer): Promise<MovieDetail> {
  const [row] = await db
    .select({
      ...streamColumns,
      providerId: streams.providerId,
      xtreamId: streams.xtreamId,
      plot: streams.plot,
      rating: streams.rating,
      releaseDate: streams.releaseDate,
      durationSec: streams.durationSec,
      genre: streams.genre,
      castList: streams.castList,
      director: streams.director,
      backdropUrl: streams.backdropUrl,
      infoFetchedAt: streams.infoFetchedAt,
      workKey: streams.workKey,
      // Sert a retrouver le texte traduit dans la langue du profil.
      tmdbId: streams.tmdbId,
    })
    .from(streams)
    .leftJoin(categories, eq(categories.id, streams.categoryId))
    .where(and(eq(streams.id, id), eq(streams.type, 'vod')))
    .limit(1);

  if (!row) throw notFound('Film introuvable.');
  if (row.categoryIsAdult === true && !viewer.canWatchAdult) {
    throw new AppError(403, 'ADULT_CONTENT_FORBIDDEN', 'Contenu non autorise sur ce compte.');
  }

  // Les metadonnees de get_vod_streams sont pauvres : on complete a la premiere ouverture.
  const enriched = row.infoFetchedAt ? row : await enrichMovie(row.id, row.xtreamId, row, viewer);

  const [progressMap, favorite, localized] = await Promise.all([
    progressFor(viewer.profileId, 'stream', [id]),
    isFavorite(viewer.profileId, 'stream', id),
    localizedTexts('movie', enriched.tmdbId ? [enriched.tmdbId] : [], viewer),
  ]);
  const text = enriched.tmdbId ? localized.get(enriched.tmdbId) : undefined;

  return {
    ...toMovie(enriched),
    variants: await workVariants(row.workKey, viewer),
    backdropUrl: enriched.backdropUrl,
    plot: text?.plot ?? enriched.plot,
    rating: enriched.rating,
    releaseDate: enriched.releaseDate,
    durationSec: enriched.durationSec,
    genre: enriched.genre,
    cast: enriched.castList,
    director: enriched.director,
    progress: progressMap.get(id) ?? null,
    isFavorite: favorite,
  };
}

interface MovieRow {
  id: number;
  name: string;
  iconUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIsAdult: boolean | null;
  containerExtension: string | null;
  addedAt: Date | null;
  providerId: number;
  xtreamId: number;
  plot: string | null;
  rating: number | null;
  releaseDate: string | null;
  durationSec: number | null;
  genre: string | null;
  castList: string | null;
  director: string | null;
  backdropUrl: string | null;
  infoFetchedAt: Date | null;
  workKey: string | null;
  /** Sert a retrouver le texte traduit dans la langue du profil. */
  tmdbId: string | null;
}

/**
 * `get_vod_info` est un appel par film : on ne le declenche qu'a l'ouverture
 * d'une fiche, et on garde le resultat. Un echec ne doit pas casser la page.
 */
async function enrichMovie(
  id: number,
  xtreamId: number,
  fallback: MovieRow,
  viewer: Viewer,
): Promise<MovieRow> {
  // Chaque abonnement a sa propre numerotation : la fiche doit etre completee
  // par le panel d'ou vient le film, jamais par un autre.
  const active = await listActiveProviders(viewer.id);
  const provider = active.find((p) => p.id === fallback.providerId);
  if (!provider) return fallback;
  try {
    const client = clientFor(provider);
    const info = await client.getVodInfo(xtreamId);
    const i = info.info ?? {};
    const patch = {
      plot: i.plot ?? i.description ?? fallback.plot,
      rating: i.rating ?? fallback.rating,
      releaseDate: i.releasedate ?? i.releaseDate ?? fallback.releaseDate,
      durationSec: i.duration_secs ?? fallback.durationSec,
      genre: i.genre ?? fallback.genre,
      castList: i.cast ?? fallback.castList,
      director: i.director ?? fallback.director,
      backdropUrl: i.backdrop_path ?? null,
      tmdbId: i.tmdb_id ?? null,
      containerExtension:
        info.movie_data?.container_extension ?? fallback.containerExtension,
      infoFetchedAt: new Date(),
    };
    await db.update(streams).set(patch).where(eq(streams.id, id));
    return { ...fallback, ...patch };
  } catch {
    // Marquer la tentative evite de rappeler le panel a chaque rafraichissement.
    await db.update(streams).set({ infoFetchedAt: new Date() }).where(eq(streams.id, id));
    return fallback;
  }
}

/**
 * Declinaisons d'une meme oeuvre.
 *
 * On dedoublonne sur le **nom** et non sur l'abonnement : deux abonnements
 * exposant « FR - Backrooms - 2026 [4K] » proposent la meme chose, et la
 * bascule automatique choisira celui qui a une connexion libre au moment de
 * lire. Inutile donc d'afficher deux fois la meme ligne.
 */
async function workVariants(workKey: string | null, viewer: Viewer): Promise<VariantDto[]> {
  if (!workKey) return [];

  const rows = await db
    .select({
      id: streams.id,
      name: streams.name,
      containerExtension: streams.containerExtension,
      langRank: streams.langRank,
    })
    .from(streams)
    .where(
      and(
        eq(streams.type, 'vod'),
        eq(streams.workKey, workKey),
        isNull(streams.removedAt),
        fromActiveProvider('streams', viewer),
      ),
    )
    .orderBy(raw`${prefRank(viewer, 'streams')} asc, ${NATURAL('streams')}, streams.id asc`);

  const seen = new Set<string>();
  const variants: VariantDto[] = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    variants.push({
      id: r.id,
      name: r.name,
      containerExtension: r.containerExtension,
      browserPlayable: isBrowserPlayable(r.containerExtension),
    });
  }
  return variants;
}

/**
 * Declinaisons d'une meme serie.
 *
 * Une serie n'a pas de container propre — c'est l'episode qui en a un — donc
 * les champs de lisibilite ne veulent rien dire a ce niveau et sont neutres.
 * Changer de declinaison change la liste des episodes, pas seulement la piste.
 */
async function seriesWorkVariants(workKey: string | null, viewer: Viewer): Promise<VariantDto[]> {
  if (!workKey) return [];

  const rows = await db
    .select({ id: series.id, name: series.name })
    .from(series)
    .where(
      and(
        eq(series.workKey, workKey),
        isNull(series.removedAt),
        fromActiveProvider('series', viewer),
      ),
    )
    .orderBy(raw`${prefRank(viewer, 'series')} asc, ${NATURAL('series')}, series.id asc`);

  const seen = new Set<string>();
  const variants: VariantDto[] = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    variants.push({
      id: r.id,
      name: r.name,
      containerExtension: null,
      browserPlayable: true,
    });
  }
  return variants;
}

/** Au-dela, on rappelle le panel : une serie en cours gagne des episodes. */
const EPISODES_TTL_MS = 12 * 3600 * 1000;

export async function getSeriesDetail(id: number, viewer: Viewer): Promise<SeriesDetail> {
  const [row] = await db
    .select({
      ...seriesColumns,
      providerId: series.providerId,
      xtreamId: series.xtreamId,
      plot: series.plot,
      rating: series.rating,
      releaseDate: series.releaseDate,
      castList: series.castList,
      director: series.director,
      genre: series.genre,
      backdropUrl: series.backdropUrl,
      episodesFetchedAt: series.episodesFetchedAt,
      workKey: series.workKey,
      // Sert a retrouver le texte traduit dans la langue du profil.
      tmdbId: series.tmdbId,
    })
    .from(series)
    .leftJoin(categories, eq(categories.id, series.categoryId))
    .where(eq(series.id, id))
    .limit(1);

  if (!row) throw notFound('Serie introuvable.');
  if (row.categoryIsAdult === true && !viewer.canWatchAdult) {
    throw new AppError(403, 'ADULT_CONTENT_FORBIDDEN', 'Contenu non autorise sur ce compte.');
  }

  const stale =
    !row.episodesFetchedAt ||
    Date.now() - row.episodesFetchedAt.getTime() > EPISODES_TTL_MS;
  if (stale) {
    const active = await listActiveProviders(viewer.id);
    const provider = active.find((p) => p.id === row.providerId);
    if (provider) {
      try {
        await fetchAndStoreEpisodes(clientFor(provider), row.id, row.xtreamId);
      } catch {
        // Une fiche sans episodes reste consultable ; le message viendra du front.
        await db
          .update(series)
          .set({ episodesFetchedAt: new Date() })
          .where(eq(series.id, row.id));
      }
    }
  }

  const episodeRows = await db
    .select()
    .from(episodes)
    .where(and(eq(episodes.seriesId, id), isNull(episodes.removedAt)))
    .orderBy(asc(episodes.season), asc(episodes.episodeNum));

  const [progressMap, favorite] = await Promise.all([
    progressFor(
      viewer.profileId,
      'episode',
      episodeRows.map((e) => e.id),
    ),
    isFavorite(viewer.profileId, 'series', id),
  ]);

  const bySeason = new Map<number, SeriesDetail['seasons'][number]>();
  for (const e of episodeRows) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, { season: e.season, episodes: [] });
    bySeason.get(e.season)!.episodes.push({
      id: e.id,
      seriesId: e.seriesId,
      season: e.season,
      episodeNum: e.episodeNum,
      title: e.title,
      containerExtension: e.containerExtension,
      durationSec: e.durationSec,
      plot: e.plot,
      stillUrl: e.stillUrl,
      progress: progressMap.get(e.id) ?? null,
    });
  }
  const seasons = [...bySeason.values()].sort((a, b) => a.season - b.season);

  const localized = await localizedTexts('tv', row.tmdbId ? [row.tmdbId] : [], viewer);
  const text = row.tmdbId ? localized.get(row.tmdbId) : undefined;

  return {
    ...toSeries(row),
    variants: await seriesWorkVariants(row.workKey, viewer),
    backdropUrl: row.backdropUrl,
    plot: text?.plot ?? row.plot,
    rating: row.rating,
    releaseDate: row.releaseDate,
    cast: row.castList,
    director: row.director,
    genre: row.genre,
    seasons,
    isFavorite: favorite,
    nextEpisode: pickNextEpisode(episodeRows, progressMap),
  };
}

/**
 * Huit oeuvres du meme genre, les mieux notees.
 *
 * Pour continuer depuis une fiche sans repasser par la liste. Le premier genre
 * de l'oeuvre sert de cle — « Animation, Action » donne l'animation — et le
 * filtre est celui de la page Films : meme compte, meme deduplication, meme
 * ordre « mieux notes ». L'oeuvre elle-meme est ecartee.
 */
export async function similarTo(
  kind: 'movie' | 'series',
  id: number,
  viewer: Viewer,
  limit = 8,
): Promise<Array<Movie | SeriesSummary>> {
  const [row] =
    kind === 'movie'
      ? await db.select({ genre: streams.genre }).from(streams).where(eq(streams.id, id)).limit(1)
      : await db.select({ genre: series.genre }).from(series).where(eq(series.id, id)).limit(1);
  const genre = row?.genre?.split(',')[0]?.trim();
  if (!genre) return [];
  const params: ListParams = { genre, sort: 'rating', limit: limit + 1, offset: 0 };
  const page = kind === 'movie' ? await listStreams('vod', params, viewer) : await listSeries(params, viewer);
  return page.items
    .filter((i): i is Movie | SeriesSummary => i.type !== 'live' && i.id !== id)
    .slice(0, limit);
}

/**
 * Dix-huit affiches pour la page de connexion.
 *
 * Elle est publique, et c'est le seul ecran que voit quelqu'un qui n'a pas de
 * compte : il doit montrer ce qu'il y a derriere. Rien d'identifiant ne sort —
 * les affiches hebergees par TMDB seulement, jamais celles du fournisseur,
 * dont l'adresse dirait d'ou vient le catalogue. Tirage du jour, garde en
 * memoire une heure : la page se charge a chaque visite, la base pas.
 */
let mosaicCache: { at: number; items: string[] } | null = null;

export async function mosaicPosters(limit = 18): Promise<string[]> {
  if (mosaicCache && Date.now() - mosaicCache.at < 3600_000) return mosaicCache.items;
  const rows = await db.execute<{ icon_url: string }>(raw`
    select icon_url from streams
    where type = 'vod' and removed_at is null and rating >= 7
      and icon_url like 'https://image.tmdb.org/%'
      and provider_id in (select id from providers where is_active)
    order by md5(id::text || ${daySeed()})
    limit ${limit}
  `);
  mosaicCache = { at: Date.now(), items: rows.map((r) => r.icon_url) };
  return mosaicCache.items;
}

/**
 * Prochain episode a regarder : le premier non termine dans l'ordre, sinon
 * celui qui suit le dernier termine, sinon le tout premier.
 */
function pickNextEpisode(
  ordered: Array<{ id: number; season: number; episodeNum: number }>,
  progress: Map<number, WatchProgress>,
): SeriesDetail['nextEpisode'] {
  if (ordered.length === 0) return null;
  const started = ordered.find((e) => {
    const p = progress.get(e.id);
    return p && !p.completed && p.positionSec > 0;
  });
  const target =
    started ??
    ordered.find((e) => !progress.get(e.id)?.completed) ??
    ordered[0]!;
  return { seasonNum: target.season, episodeNum: target.episodeNum, episodeId: target.id };
}

// --------------------------------------------------------- lecture : cible

/**
 * Verifie qu'un contenu appartient bien a l'abonnement en cours. Sert de
 * garde-fou aux favoris et a l'historique, qui survivent volontairement a un
 * changement de provider.
 */
async function assertActiveProvider(providerId: number, viewer: Viewer): Promise<void> {
  const active = await listActiveProviders(viewer.id);
  if (active.length === 0) {
    throw new AppError(
      409,
      'NO_ACTIVE_PROVIDER',
      "Aucun abonnement actif : configurez-en un dans l'administration.",
    );
  }
  if (!active.some((p) => p.id === providerId)) {
    throw notFound(
      "Ce contenu provient d'un abonnement qui n'est plus actif.",
    );
  }
}

export type Playable =
  | {
      kind: 'live';
      itemType: 'stream';
      itemId: number;
      /** Abonnement d'ou provient le contenu : il decide des credentials et du slot. */
      providerId: number;
      xtreamId: number;
      /*
       * L'adresse telle quelle, pour une chaine venue d'une playlist.
       *
       * Chez Xtream elle se reconstruit a partir des identifiants ; une
       * playlist la porte deja, et souvent vers un hote qui n'a rien a voir
       * avec la liste. Nulle pour toute source Xtream.
       */
      sourceUrl: string | null;
      containerExtension: null;
      label: string;
    }
  | {
      kind: 'vod';
      itemType: 'stream';
      itemId: number;
      providerId: number;
      xtreamId: number;
      containerExtension: string;
      label: string;
    }
  | {
      kind: 'episode';
      itemType: 'episode';
      itemId: number;
      providerId: number;
      xtreamId: string;
      containerExtension: string;
      label: string;
    };

/** Resout un item en cible lisible, en verifiant le droit d'acces au passage. */
export async function resolvePlayable(
  itemType: 'stream' | 'episode',
  itemId: number,
  viewer: Viewer,
): Promise<Playable> {
  if (itemType === 'stream') {
    const [row] = await db
      .select({
        id: streams.id,
        type: streams.type,
        name: streams.name,
        xtreamId: streams.xtreamId,
        sourceUrl: streams.sourceUrl,
        providerId: streams.providerId,
        containerExtension: streams.containerExtension,
        removedAt: streams.removedAt,
        categoryIsAdult: categories.isAdult,
      })
      .from(streams)
      .leftJoin(categories, eq(categories.id, streams.categoryId))
      .where(eq(streams.id, itemId))
      .limit(1);

    if (!row) throw notFound('Contenu introuvable.');
    if (row.removedAt) {
      throw notFound("Ce contenu n'est plus propose par le fournisseur.");
    }
    // Un favori pose du temps d'un ancien abonnement pointe sur un identifiant
    // Xtream qui ne veut plus rien dire : mieux vaut le dire que fabriquer une
    // URL absurde avec les credentials du provider courant.
    await assertActiveProvider(row.providerId, viewer);
    if (row.categoryIsAdult === true && !viewer.canWatchAdult) {
      throw new AppError(403, 'ADULT_CONTENT_FORBIDDEN', 'Contenu non autorise sur ce compte.');
    }
    if (row.type === 'live') {
      return {
        kind: 'live',
        itemType: 'stream',
        itemId: row.id,
        providerId: row.providerId,
        xtreamId: row.xtreamId,
        sourceUrl: row.sourceUrl,
        containerExtension: null,
        label: row.name,
      };
    }
    return {
      kind: 'vod',
      itemType: 'stream',
      itemId: row.id,
      providerId: row.providerId,
      xtreamId: row.xtreamId,
      containerExtension: row.containerExtension ?? 'mp4',
      label: row.name,
    };
  }

  const [row] = await db
    .select({
      id: episodes.id,
      xtreamId: episodes.xtreamId,
      containerExtension: episodes.containerExtension,
      season: episodes.season,
      episodeNum: episodes.episodeNum,
      title: episodes.title,
      seriesName: series.name,
      providerId: series.providerId,
      removedAt: episodes.removedAt,
      categoryIsAdult: categories.isAdult,
    })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .leftJoin(categories, eq(categories.id, series.categoryId))
    .where(eq(episodes.id, itemId))
    .limit(1);

  if (!row) throw notFound('Episode introuvable.');
  if (row.removedAt) throw notFound("Cet episode n'est plus propose par le fournisseur.");
  await assertActiveProvider(row.providerId, viewer);
  if (row.categoryIsAdult === true && !viewer.canWatchAdult) {
    throw new AppError(403, 'ADULT_CONTENT_FORBIDDEN', 'Contenu non autorise sur ce compte.');
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    kind: 'episode',
    itemType: 'episode',
    itemId: row.id,
    providerId: row.providerId,
    xtreamId: row.xtreamId,
    containerExtension: row.containerExtension ?? 'mp4',
    label: `${row.seriesName} S${pad(row.season)}E${pad(row.episodeNum)} — ${row.title}`,
  };
}

/**
 * Exemplaires du meme contenu chez les autres abonnements actifs.
 *
 * Deux comptes chez un meme fournisseur exposent le meme catalogue avec les
 * memes `xtream_id` : l'appariement est exact, sans heuristique de titre. Le
 * catalogue n'en montre qu'un exemplaire, mais la lecture peut prendre
 * n'importe lequel — c'est ce qui permet de regarder deux choses differentes
 * avec deux abonnements a une connexion.
 *
 * Le premier element est toujours celui qui a ete demande.
 */
export async function playbackCandidates(
  itemType: 'stream' | 'episode',
  itemId: number,
  viewer: Viewer,
): Promise<Playable[]> {
  const primary = await resolvePlayable(itemType, itemId, viewer);
  const active = await listActiveProviders(viewer.id);
  if (active.length < 2) return [primary];

  const others = active.filter((p) => p.id !== primary.providerId).map((p) => p.id);
  if (others.length === 0) return [primary];

  if (primary.itemType === 'stream') {
    const rows = await db
      .select({ id: streams.id, providerId: streams.providerId })
      .from(streams)
      .where(
        and(
          eq(streams.type, primary.kind === 'live' ? 'live' : 'vod'),
          eq(streams.xtreamId, primary.xtreamId),
          inArray(streams.providerId, others),
          isNull(streams.removedAt),
        ),
      );
    return [
      primary,
      ...rows.map((r) => ({ ...primary, itemId: r.id, providerId: r.providerId })),
    ];
  }

  // Episode : on retrouve la serie jumelle, puis l'episode de meme identifiant.
  const [origin] = await db
    .select({ episodeXtreamId: episodes.xtreamId, seriesXtreamId: series.xtreamId })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(eq(episodes.id, primary.itemId))
    .limit(1);
  if (!origin) return [primary];

  const rows = await db
    .select({ id: episodes.id, providerId: series.providerId })
    .from(episodes)
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(
      and(
        eq(series.xtreamId, origin.seriesXtreamId),
        eq(episodes.xtreamId, origin.episodeXtreamId),
        inArray(series.providerId, others),
        isNull(episodes.removedAt),
      ),
    );

  return [
    primary,
    ...rows.map((r) => ({ ...primary, itemId: r.id, providerId: r.providerId })),
  ];
}

// ------------------------------------------------- enrichissement historique

interface RawEntry {
  itemType: ItemType;
  itemId: number;
}

/**
 * Historique, reprise et favoris ne stockent qu'un couple (type, id). Cette
 * passe va chercher les libelles et visuels en trois requetes, quelle que soit
 * la taille de la liste.
 */
export async function decorate<T extends RawEntry>(
  entries: T[],
  viewer: Viewer,
): Promise<
  Array<
    T & {
      label: string;
      parentLabel: string | null;
      imageUrl: string | null;
      target: { kind: 'movie' | 'series' | 'live'; id: number };
      /** L'annee et le genre, pour la ligne sous l'affiche de « Ma liste ». */
      year: number | null;
      genre: string | null;
    }
  >
> {
  const streamIds = entries.filter((e) => e.itemType === 'stream').map((e) => e.itemId);
  const seriesIds = entries.filter((e) => e.itemType === 'series').map((e) => e.itemId);
  const episodeIds = entries.filter((e) => e.itemType === 'episode').map((e) => e.itemId);

  const [streamRows, seriesRows, episodeRows] = await Promise.all([
    streamIds.length
      ? db
          .select({
            id: streams.id,
            name: streams.name,
            type: streams.type,
            iconUrl: streams.iconUrl,
            isAdult: categories.isAdult,
            releaseDate: streams.releaseDate,
            genre: streams.genre,
          })
          .from(streams)
          .leftJoin(categories, eq(categories.id, streams.categoryId))
          .where(inArray(streams.id, streamIds))
      : Promise.resolve([]),
    seriesIds.length
      ? db
          .select({
            id: series.id,
            name: series.name,
            coverUrl: series.coverUrl,
            isAdult: categories.isAdult,
            releaseDate: series.releaseDate,
            genre: series.genre,
          })
          .from(series)
          .leftJoin(categories, eq(categories.id, series.categoryId))
          .where(inArray(series.id, seriesIds))
      : Promise.resolve([]),
    episodeIds.length
      ? db
          .select({
            id: episodes.id,
            title: episodes.title,
            season: episodes.season,
            episodeNum: episodes.episodeNum,
            stillUrl: episodes.stillUrl,
            seriesId: series.id,
            seriesName: series.name,
            coverUrl: series.coverUrl,
            isAdult: categories.isAdult,
          })
          .from(episodes)
          .innerJoin(series, eq(series.id, episodes.seriesId))
          .leftJoin(categories, eq(categories.id, series.categoryId))
          .where(inArray(episodes.id, episodeIds))
      : Promise.resolve([]),
  ]);

  const streamMap = new Map(streamRows.map((r) => [r.id, r]));
  const seriesMap = new Map(seriesRows.map((r) => [r.id, r]));
  const episodeMap = new Map(episodeRows.map((r) => [r.id, r]));
  const pad = (n: number) => String(n).padStart(2, '0');

  const out = [];
  for (const entry of entries) {
    if (entry.itemType === 'stream') {
      const r = streamMap.get(entry.itemId);
      if (!r) continue;
      if (r.isAdult === true && !viewer.canWatchAdult) continue;
      out.push({
        ...entry,
        label: r.name,
        parentLabel: null,
        imageUrl: r.iconUrl,
        target: { kind: r.type === 'live' ? ('live' as const) : ('movie' as const), id: r.id },
        year: yearOf(r.releaseDate),
        genre: r.genre,
      });
    } else if (entry.itemType === 'series') {
      const r = seriesMap.get(entry.itemId);
      if (!r) continue;
      if (r.isAdult === true && !viewer.canWatchAdult) continue;
      out.push({
        ...entry,
        label: r.name,
        parentLabel: null,
        imageUrl: r.coverUrl,
        target: { kind: 'series' as const, id: r.id },
        year: yearOf(r.releaseDate),
        genre: r.genre,
      });
    } else {
      const r = episodeMap.get(entry.itemId);
      if (!r) continue;
      if (r.isAdult === true && !viewer.canWatchAdult) continue;
      out.push({
        ...entry,
        label: `S${pad(r.season)}E${pad(r.episodeNum)} — ${r.title}`,
        parentLabel: r.seriesName,
        imageUrl: r.stillUrl ?? r.coverUrl,
        target: { kind: 'series' as const, id: r.seriesId },
        year: null,
        genre: null,
      });
    }
  }
  return out;
}

/**
 * Pose l'etoile sur ce qui est deja dans la liste du profil.
 *
 * Les listings s'en chargent eux-memes, mais l'accueil assemble ses rangees a
 * partir de plusieurs requetes qui l'ignoraient : aucune vignette n'y portait
 * d'etoile, et il n'y avait donc rien a ajouter a sa liste depuis la page qui
 * en montre le plus.
 *
 * Deux requetes pour toute la page, quel que soit le nombre de rangees — et la
 * comparaison se fait par groupe, jamais par identifiant : la ligne mise en
 * favori n'est pas forcement le representant que la rangee affiche.
 */
export async function markFavorites(
  viewer: Viewer,
  items: Array<Movie | SeriesSummary | LiveChannel>,
): Promise<void> {
  const streamIds = items.filter((i) => i.type !== 'series').map((i) => i.id);
  const seriesIds = items.filter((i) => i.type === 'series').map((i) => i.id);
  const [starredStreams, starredSeries] = await Promise.all([
    favoriteChannelIds(viewer.profileId, streamIds),
    favoriteSeriesIds(viewer.profileId, seriesIds),
  ]);
  for (const item of items) {
    item.isFavorite =
      item.type === 'series' ? starredSeries.has(item.id) : starredStreams.has(item.id);
  }
}

/**
 * Marque les entrees de reprise deja presentes dans la liste du profil.
 *
 * Une entree d'historique n'est pas une oeuvre : reprendre l'episode 3 d'une
 * serie, c'est avoir la **serie** en favori ou non — l'episode, lui, ne se met
 * pas en liste. On teste donc la cible de navigation et non l'element joue.
 */
export async function markResumeFavorites(
  viewer: Viewer,
  entries: HistoryEntry[],
): Promise<void> {
  const streamIds = entries.filter((e) => e.target.kind !== 'series').map((e) => e.target.id);
  const seriesIds = entries.filter((e) => e.target.kind === 'series').map((e) => e.target.id);
  const [starredStreams, starredSeries] = await Promise.all([
    favoriteChannelIds(viewer.profileId, streamIds),
    favoriteSeriesIds(viewer.profileId, seriesIds),
  ]);
  for (const entry of entries) {
    entry.isFavorite =
      entry.target.kind === 'series'
        ? starredSeries.has(entry.target.id)
        : starredStreams.has(entry.target.id);
  }
}

// ------------------------------------------------------------------ accueil

/**
 * La graine des tirages de l'accueil : la date, en heure locale du serveur.
 *
 * Le foyer et le serveur vivent au meme endroit, et une bascule a 2 h du matin
 * heure UTC se verrait. Tout ce qui est tire au sort sur l'accueil la partage,
 * pour que la page entiere se renouvelle d'un bloc chaque matin plutot que par
 * morceaux.
 */
function daySeed(): string {
  return new Date().toLocaleDateString('fr-CA');
}

/**
 * Rangees par categorie : une seule requete, decoupee par `row_number`.
 *
 * Le contenu de chaque rangee est **tire au sort, une fois par jour**, et non
 * pris dans l'ordre des ajouts. Deux raisons :
 *
 * - l'accueil porte deja une rangee « films recemment ajoutes ». Trie par date,
 *   la premiere categorie — « LATEST MOVIES » chez ce fournisseur — reprenait
 *   exactement les memes vignettes deux fois de suite ;
 * - une categorie de 12 586 films n'en montrait que les vingt derniers, les
 *   memes pendant des semaines. Le tirage du jour en fait une porte d'entree
 *   sur le catalogue plutot qu'une liste figee.
 *
 * La graine est la date : la rangee ne bouge pas de la journee. Un tirage
 * reellement aleatoire changeait a chaque retour a l'accueil, et ce qu'on
 * venait d'y voir devenait introuvable.
 */
async function categoryRows(
  viewer: Viewer,
  categoryIds: number[],
  perRow: number,
): Promise<Map<number, Movie[]>> {
  if (categoryIds.length === 0) return new Map();
  const rows = await db.execute<{
    id: number;
    name: string;
    icon_url: string | null;
    category_id: number;
    category_name: string;
    category_is_adult: boolean;
    container_extension: string | null;
    added_at: Date | null;
    rating: number | null;
  }>(raw`
    select s.id, s.name, s.icon_url, s.category_id, c.name as category_name,
           c.is_adult as category_is_adult, s.container_extension, s.added_at, s.rating
    from (
      select *, row_number() over (partition by category_id order by md5(id::text || ${daySeed()})) as rn
      from ${streams}
      where removed_at is null and type = 'vod'
        and provider_id in ${activeProviders(viewer.id)}
        and not exists (
          select 1 from streams peer
          where peer.type = streams.type and peer.group_key = streams.group_key
            and peer.removed_at is null and peer.provider_id in ${activeProviders(viewer.id)}
            and (${prefRank(viewer, 'peer')}, peer.quality_rank, peer.id)
              < (${prefRank(viewer, 'streams')}, streams.quality_rank, streams.id)
        )
        and category_id in (${raw.join(categoryIds.map((id) => raw`${id}`), raw`, `)})
    ) s
    join ${categories} c on c.id = s.category_id
    where s.rn <= ${perRow}
    order by c.name, s.rn
  `);

  const map = new Map<number, Movie[]>();
  for (const r of rows) {
    if (r.category_is_adult && !viewer.canWatchAdult) continue;
    const list = map.get(r.category_id) ?? [];
    list.push(
      toMovie({
        id: r.id,
        name: r.name,
        iconUrl: r.icon_url,
        categoryId: r.category_id,
        categoryName: r.category_name,
        categoryIsAdult: r.category_is_adult,
        containerExtension: r.container_extension,
        addedAt: r.added_at ? new Date(r.added_at) : null,
        rating: r.rating,
      }),
    );
    map.set(r.category_id, list);
  }
  return map;
}

/**
 * La sélection mise en avant, en tête d'accueil.
 *
 * Cinq œuvres tirées d'un vivier commun aux films et aux séries : celles qui
 * portent une image large **et** un synopsis, seules capables de tenir un grand
 * bloc. Le reste du catalogue n'a qu'une affiche de 300 px, illisible étirée.
 *
 * Le tirage est semé par la date : la sélection change chaque matin et ne bouge
 * plus de la journée. Un tirage vraiment aléatoire changeait à chaque
 * navigation — revenir à l'accueil après un film ne ramenait jamais ce qu'on y
 * avait vu, et plus rien n'était retrouvable.
 *
 * L'ordre place le français d'abord, puis les ajouts récents : le hasard ne
 * joue qu'entre œuvres également pertinentes. Filtrer sur la langue aurait vidé
 * la mise en avant chez un abonnement sans catalogue français.
 */
export async function spotlight(viewer: Viewer, limit = 5): Promise<Spotlight[]> {
  const seed = daySeed();
  const adult = viewer.canWatchAdult ? raw`true` : raw`(categories.is_adult is not true)`;

  /*
   * Un synopsis d'au moins soixante caractères.
   *
   * Le fournisseur en publie qui tiennent en trois mots — « Saison 2 », le nom
   * du studio — et le bloc se retrouvait avec un titre géant surmontant une
   * ligne vide. Mieux vaut prendre l'œuvre suivante.
   */
  const rows = await db.execute<{
    kind: 'movie' | 'series';
    id: number;
    name: string;
    backdrop_url: string;
    poster_url: string | null;
    plot: string;
    rating: number | null;
    release_date: string | null;
    genre: string | null;
    tmdb_id: string | null;
    is_favorite: boolean;
  }>(raw`
    with pool as (
      select 'series'::text as kind, series.id, series.name,
             series.backdrop_url, series.cover_url as poster_url,
             series.plot, series.rating, series.release_date, series.genre, series.tmdb_id,
             exists (
               select 1 from favorites f
               where f.profile_id = ${viewer.profileId}
                 and f.item_type = 'series' and f.item_id = series.id
             ) as is_favorite,
             ${prefRank(viewer, 'series')} as lang_rank,
             (series.added_at > now() - interval '120 days') as fresh
      from series
      join categories on categories.id = series.category_id
      where series.removed_at is null
        and ${fromActiveProvider('series', viewer)}
        and ${dedupAcrossProviders('series', viewer)}
        and ${adult}
        and series.backdrop_url is not null
        and series.plot is not null and length(series.plot) > 60
        and series.rating >= 7.5
      union all
      select 'movie'::text, streams.id, streams.name,
             streams.backdrop_url, streams.icon_url,
             streams.plot, streams.rating, streams.release_date, streams.genre, streams.tmdb_id,
             exists (
               select 1 from favorites f
               where f.profile_id = ${viewer.profileId}
                 and f.item_type = 'stream' and f.item_id = streams.id
             ),
             ${prefRank(viewer, 'streams')},
             (streams.added_at > now() - interval '120 days')
      from streams
      join categories on categories.id = streams.category_id
      where streams.type = 'vod' and streams.removed_at is null
        and ${fromActiveProvider('streams', viewer)}
        and ${dedupAcrossProviders('streams', viewer)}
        and ${adult}
        and streams.backdrop_url is not null
        and streams.plot is not null and length(streams.plot) > 60
        and streams.rating >= 7.5
    )
    /*
     * Un tirage par famille, puis on alterne.
     *
     * Le vivier compte 1 851 series francaises pour 30 films — le fournisseur
     * publie les images larges des series, celles des films ne viennent que de
     * l'enrichissement TMDB. Un tirage unique ne sortait donc que des series,
     * cinq fois sur cinq. Chaque famille classe les siens de son cote, et
     * l'alternance les entrelace : premiere serie, premier film, deuxieme
     * serie… Si une famille est vide, l'autre remplit tout.
     *
     * Les visuels heberges par TMDB passent devant. Le fournisseur en heberge
     * aussi, sur ses propres domaines, et un sur deux ne repond plus : la mise
     * en avant tombait alors sur un cadre noir. Ils restent dans le vivier, en
     * dernier recours pour un abonnement qui n'aurait que ceux-la.
     */
    select kind, id, name, backdrop_url, poster_url, plot, rating, release_date, genre,
           tmdb_id, is_favorite
    from (
      select *, row_number() over (
        partition by kind
        order by lang_rank asc,
                 (backdrop_url like 'https://image.tmdb.org/%') desc,
                 fresh desc,
                 md5(kind || id::text || ${seed})
      ) as rn
      from pool
    ) t
    -- Quelle famille ouvre la serie fait partie du tirage du jour.
    order by rn asc, md5(kind || ${seed})
    limit ${limit}
  `);

  /*
   * Le synopsis dans la langue du profil.
   *
   * La mise en avant est l'endroit ou le texte se lit le plus — trois lignes en
   * gros sous un grand visuel : le laisser dans la langue du fournisseur alors
   * que tout le reste de l'ecran suit le profil se voyait tout de suite.
   */
  const ids = { movie: [] as string[], tv: [] as string[] };
  for (const r of rows) if (r.tmdb_id) ids[r.kind === 'series' ? 'tv' : 'movie'].push(r.tmdb_id);
  const [movieTexts, tvTexts] = await Promise.all([
    localizedTexts('movie', ids.movie, viewer),
    localizedTexts('tv', ids.tv, viewer),
  ]);

  const out: Spotlight[] = [];
  for (const r of rows) {
    const text = r.tmdb_id
      ? (r.kind === 'series' ? tvTexts : movieTexts).get(r.tmdb_id)
      : undefined;
    out.push({
      kind: r.kind,
      id: r.id,
      name: r.name,
      backdropUrl: r.backdrop_url,
      posterUrl: r.poster_url,
      plot: text?.plot ?? r.plot,
      rating: r.rating,
      // « 2019-06-14 » comme « 2019 » : on ne garde que ce qui se lit sous un titre.
      year: /^(\d{4})/.exec(r.release_date ?? '')?.[1] ?? null,
      genre: r.genre,
      isFavorite: r.is_favorite,
    });
  }
  return out;
}

/**
 * Les rangees de l'accueil, et l'ordre dans lequel on les propose.
 *
 * Elles etaient choisies sur le seul volume : les six plus grosses categories
 * du fournisseur donnaient « ITALY », « PORTUGAL », « TURKISH » et
 * « MULTI-LANG » — un accueil qui ne parlait la langue de personne ici. Le
 * volume ne dit pas l'interet, il dit la taille du catalogue etranger.
 *
 * L'ordre suit donc celui de la colonne de gauche, que l'utilisateur connait
 * deja : ce qu'il a epingle d'abord, le francais ensuite, le reste apres — et
 * le volume ne departage qu'a l'interieur de chaque groupe.
 */
/**
 * L'ordre de la colonne de gauche : epinglees, langues du profil, le reste.
 *
 * L'accueil s'y accorde pour choisir ses rangees : proposer une categorie que
 * la colonne de gauche enterre en bas de liste donnerait deux classements
 * contradictoires sur deux ecrans voisins.
 */
function homeRank(c: Category, viewer: Viewer): number {
  if (c.isFavorite) return 0;
  return languageRank(c.name, c.languageCode, viewer.languages) < 99 ? 1 : 2;
}

const byRankThenSize = (viewer: Viewer) => (a: Category, b: Category) =>
  homeRank(a, viewer) - homeRank(b, viewer) || (b.count ?? 0) - (a.count ?? 0);

/**
 * Ce qui est arrivé depuis la visite précédente.
 *
 * La borne est la fin de la session **d'avant**, pas celle en cours : compter
 * depuis maintenant donnerait toujours zéro. Sans session antérieure — premier
 * jour, ou historique de sessions expiré — on ne compte rien plutôt que de
 * compter depuis l'origine et d'annoncer quatre-vingt-quinze mille nouveautés.
 *
 * Deux `count` et non deux listes : l'accueil affiche un chiffre et un lien,
 * pas vingt vignettes de plus. Les listes existent déjà sous « récemment
 * ajoutés » et se rechargent au clic.
 */
export async function arrivalsSince(
  viewer: Viewer,
): Promise<{ since: string | null; movies: number; series: number }> {
  const [prev] = await db.execute<{ seen: Date | string }>(raw`
    select last_seen_at as seen
    from sessions
    where user_id = ${viewer.id}
    order by last_seen_at desc
    offset 1
    limit 1
  `);
  if (!prev?.seen) return { since: null, movies: 0, series: 0 };
  /*
   * `db.execute` rend la ligne brute du pilote : un `timestamptz` y arrive en
   * chaine, pas en `Date`. Le typer `Date` ne le convertissait pas — il
   * mentait, et `toISOString` n'existait pas dessus.
   *
   * Le parametre SQL, lui, repart en chaine ISO : `pg` refuse une `Date` la ou
   * il attend une valeur a serialiser.
   */
  const since = prev.seen instanceof Date ? prev.seen : new Date(prev.seen);
  const sinceIso = since.toISOString();

  const [counts] = await db.execute<{ movies: number; series: number }>(raw`
    select
      (select count(*) from streams s
        where s.provider_id in ${activeProviders(viewer.id)}
          and s.type = 'vod' and s.removed_at is null and s.added_at > ${sinceIso}) as movies,
      (select count(*) from series x
        where x.provider_id in ${activeProviders(viewer.id)}
          and x.removed_at is null and x.added_at > ${sinceIso}) as series
  `);

  return {
    since: since.toISOString(),
    movies: Number(counts?.movies ?? 0),
    series: Number(counts?.series ?? 0),
  };
}

export async function homeRows(
  viewer: Viewer,
  rowCount = 6,
  perRow = 20,
): Promise<Array<{ category: Category; items: Movie[] }>> {
  const vodCategories = await listCategories('vod', viewer);
  const picked = vodCategories.slice().sort(byRankThenSize(viewer)).slice(0, rowCount);

  const map = await categoryRows(
    viewer,
    picked.map((c) => c.id),
    perRow,
  );

  return picked
    .map((category) => ({ category, items: map.get(category.id) ?? [] }))
    .filter((r) => r.items.length > 0);
}

/**
 * Le francais d'abord, la fraicheur ensuite.
 *
 * Les rangees « recemment ajoutes » ne triaient que sur la date, et le
 * fournisseur publie huit fois plus d'etranger que de francais : la rangee des
 * series ne sortait que du turc, de l'arabe et de l'anglais, au milieu d'un
 * accueil entierement francais. Ce n'etait pas un tri casse, c'etait la
 * proportion du catalogue.
 *
 * Un ordre, pas un filtre : les oeuvres etrangeres restent accessibles en fin
 * de rangee, et un abonnement sans catalogue francais garde une rangee pleine.
 * La deduplication a deja fait son travail en amont — une serie publiee en
 * francais **et** en anglais est representee par sa version francaise, si bien
 * que ce qui reste ici en rang 3 ou 9 n'existe qu'en langue etrangere.
 */
const preferredFirst = (viewer: Viewer, table: 'streams' | 'series'): SQL =>
  raw`(${prefRank(viewer, table)} < 99) desc`;

export async function recentMovies(viewer: Viewer, limit = 20): Promise<Movie[]> {
  const rows = await db
    .select(streamColumns)
    .from(streams)
    .leftJoin(categories, eq(categories.id, streams.categoryId))
    .where(visible(viewer, [eq(streams.type, 'vod')]))
    .orderBy(
      raw`${preferredFirst(viewer, 'streams')}, streams.added_at desc nulls last, streams.id desc`,
    )
    .limit(limit);
  return rows.map(toMovie);
}

export async function recentSeries(viewer: Viewer, limit = 20): Promise<SeriesSummary[]> {
  const rows = await db
    .select(seriesColumns)
    .from(series)
    .leftJoin(categories, eq(categories.id, series.categoryId))
    .where(
      and(
        isNull(series.removedAt),
        fromActiveProvider('series', viewer),
        dedupAcrossProviders('series', viewer),
        viewer.canWatchAdult ? undefined : raw`(categories.is_adult is not true)`,
      ),
    )
    .orderBy(
      raw`${preferredFirst(viewer, 'series')}, series.added_at desc nulls last, series.id desc`,
    )
    .limit(limit);
  return rows.map(toSeries);
}

// ------------------------------------------------------- favoris / reprise

export async function listFavorites(
  viewer: Viewer,
  type?: 'stream' | 'series',
): Promise<FavoriteEntry[]> {
  const rows = await db
    .select()
    .from(favorites)
    .where(
      and(
        eq(favorites.profileId, viewer.profileId),
        type ? eq(favorites.itemType, type) : undefined,
        or(eq(favorites.itemType, 'stream'), eq(favorites.itemType, 'series')),
      ),
    )
    .orderBy(desc(favorites.createdAt));

  const decorated = await decorate(
    rows.map((r) => ({
      itemType: r.itemType,
      itemId: r.itemId,
      createdAt: r.createdAt.toISOString(),
    })),
    viewer,
  );

  const progress = await favoriteProgress(
    viewer.profileId,
    decorated.map((d) => ({ itemType: d.itemType as 'stream' | 'series', itemId: d.itemId })),
  );

  return decorated.map((d) => ({
    itemType: d.itemType as 'stream' | 'series',
    itemId: d.itemId,
    createdAt: d.createdAt,
    label: d.label,
    imageUrl: d.imageUrl,
    target: d.target,
    year: d.year,
    genre: d.genre,
    progress: progress.get(`${d.itemType}-${d.itemId}`) ?? null,
  }));
}

/**
 * Ou en est le profil avec chaque entree de sa liste.
 *
 * Un film : sa propre progression. Une serie : celle de l'episode regarde en
 * dernier, avec son numero — c'est ce qu'on veut lire sous l'affiche,
 * « S02E04 », pas un pourcentage de la serie entiere que personne ne sait
 * calculer. Deux requetes pour la liste entiere.
 */
async function favoriteProgress(
  profileId: number,
  entries: Array<{ itemType: 'stream' | 'series'; itemId: number }>,
): Promise<Map<string, { ratio: number; completed: boolean; episode: string | null }>> {
  const out = new Map<string, { ratio: number; completed: boolean; episode: string | null }>();
  const streamIds = entries.filter((e) => e.itemType === 'stream').map((e) => e.itemId);
  const seriesIds = entries.filter((e) => e.itemType === 'series').map((e) => e.itemId);
  const ratio = (pos: number, dur: number | null) =>
    dur && dur > 0 ? Math.min(1, pos / dur) : 0;
  const pad = (n: number) => String(n).padStart(2, '0');

  const [streamRows, episodeRows] = await Promise.all([
    streamIds.length
      ? db
          .select({
            itemId: watchProgress.itemId,
            positionSec: watchProgress.positionSec,
            durationSec: watchProgress.durationSec,
            completed: watchProgress.completed,
          })
          .from(watchProgress)
          .where(
            and(
              eq(watchProgress.profileId, profileId),
              eq(watchProgress.itemType, 'stream'),
              inArray(watchProgress.itemId, streamIds),
            ),
          )
      : Promise.resolve([]),
    seriesIds.length
      ? db.execute<{
          series_id: number;
          position_sec: number;
          duration_sec: number | null;
          completed: boolean;
          season: number;
          episode_num: number;
        }>(raw`
          select distinct on (e.series_id)
                 e.series_id, wp.position_sec, wp.duration_sec, wp.completed, e.season, e.episode_num
          from watch_progress wp
          join episodes e on e.id = wp.item_id
          where wp.profile_id = ${profileId} and wp.item_type = 'episode'
            and e.series_id in (${raw.join(seriesIds.map((id) => raw`${id}`), raw`, `)})
          order by e.series_id, wp.updated_at desc
        `)
      : Promise.resolve([]),
  ]);

  for (const r of streamRows) {
    out.set(`stream-${r.itemId}`, {
      ratio: ratio(r.positionSec, r.durationSec),
      completed: r.completed,
      episode: null,
    });
  }
  for (const r of episodeRows) {
    out.set(`series-${r.series_id}`, {
      ratio: ratio(Number(r.position_sec), r.duration_sec == null ? null : Number(r.duration_sec)),
      completed: r.completed,
      episode: `S${pad(Number(r.season))}E${pad(Number(r.episode_num))}`,
    });
  }
  return out;
}

export async function listHistory(
  viewer: Viewer,
  options: { onlyUnfinished?: boolean; limit?: number } = {},
): Promise<HistoryEntry[]> {
  const rows = await db
    .select()
    .from(watchProgress)
    .where(
      and(
        eq(watchProgress.profileId, viewer.profileId),
        options.onlyUnfinished ? eq(watchProgress.completed, false) : undefined,
        // Un live n'a pas de reprise utile : on ne le met pas dans « Reprendre ».
        options.onlyUnfinished ? raw`watch_progress.position_sec > 30` : undefined,
      ),
    )
    .orderBy(desc(watchProgress.updatedAt))
    .limit(options.limit ?? 50);

  const decorated = await decorate(
    rows.map((r) => ({
      itemType: r.itemType,
      itemId: r.itemId,
      positionSec: r.positionSec,
      durationSec: r.durationSec,
      completed: r.completed,
      updatedAt: r.updatedAt.toISOString(),
    })),
    viewer,
  );

  return decorated.map((d) => ({
    itemType: d.itemType,
    itemId: d.itemId,
    positionSec: d.positionSec,
    durationSec: d.durationSec,
    completed: d.completed,
    updatedAt: d.updatedAt,
    label: d.label,
    parentLabel: d.parentLabel,
    imageUrl: d.imageUrl,
    target: d.target,
  }));
}

