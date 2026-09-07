'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  languageTag,
  splitLanguage,
  type Category,
  type GenreCount,
  type LiveChannel,
  type Movie,
  type Paginated,
  type SeriesSummary,
} from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useNowPlaying } from '../lib/epg';
import { useAsync, useDebounced } from '../lib/hooks';
import { useT } from '../lib/i18n';
import { usePlayer } from '../lib/player';
import { useSession } from '../lib/session';
import { CategorySidebar, EmptyState, ErrorBand, type CategorySelection } from './blocks';
import { Button } from './kit';
import {
  ChannelCard,
  Loading,
  PageHead,
  ResultCount,
  SearchField,
  SkeletonGrid,
  WorkCard,
} from './ui';

type Kind = 'live' | 'vod' | 'series';
type Item = Movie | SeriesSummary | LiveChannel;
type Sort = 'recent' | 'rating' | 'name' | 'added';

const ENDPOINT: Record<Kind, '/api/live' | '/api/films' | '/api/series'> = {
  live: '/api/live',
  vod: '/api/films',
  series: '/api/series',
};
const NOUN: Record<Kind, string> = { live: 'chaîne', vod: 'film', series: 'série' };
/** L'entrée des favoris dans la colonne, nommée pour ce que la page liste. */
const FAVORITES: Record<Kind, string> = {
  live: 'Mes chaînes',
  vod: 'Mes films',
  series: 'Mes séries',
};
const EMPTY_FAVORITES: Record<Kind, string> = {
  live: 'Aucune chaîne épinglée',
  vod: 'Aucun film dans votre liste',
  series: 'Aucune série dans votre liste',
};
/** L'entrée « déjà regardé » de la colonne, et son vide. */
const WATCHED: Record<Kind, string> = {
  live: 'Chaînes vues récemment',
  vod: 'Films vus récemment',
  series: 'Séries vues récemment',
};
const EMPTY_WATCHED: Record<Kind, string> = {
  live: 'Aucune chaîne regardée pour l’instant',
  vod: 'Aucun film regardé pour l’instant',
  series: 'Aucune série regardée pour l’instant',
};

const PAGE_SIZE = 40;

/*
 * Trois ordres, pas quatre : `added` — la récence pure, toutes langues
 * mêlées — reste la cible des liens « Tout voir » de l'accueil, mais ne se
 * choisit pas ici. Dans le choix, il s'affiche comme « Récents ».
 */
const SORTS: Array<[Exclude<Sort, 'added'>, string]> = [
  ['recent', 'Récents'],
  ['rating', 'Mieux notés'],
  ['name', 'A → Z'],
];

interface Props {
  kind: Kind;
  /** « Films », « Séries », « Live » — traduit ici, pas par l'appelant. */
  title: string;
}

/**
 * Une page de parcours : la barre, la colonne des catégories, la grille.
 *
 * La colonne est le repère, et elle porte tous les filtres : les catégories du
 * fournisseur, groupées par langue, épinglables ; et sur les films et les
 * séries, les genres au-dessus d'elles — « LATEST MOVIES » ne dit rien,
 * « Drame · 33 393 » dit quelque chose. Un seul s'applique à la fois : la
 * colonne se lit comme une liste de destinations, et cliquer dans l'une efface
 * le choix fait dans l'autre. Le titre au-dessus de la grille dit lequel.
 *
 * La barre ne porte que le titre, le compte et le champ : les tris et les
 * langues vivent au-dessus des résultats, là où ils agissent.
 *
 * L'URL garde la catégorie, le genre et le tri, pour qu'un retour depuis une
 * fiche retrouve la même vue, et pour que l'accueil puisse ouvrir une
 * catégorie d'un lien.
 */
export function Catalogue({ kind, title }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { play } = usePlayer();
  const { profile } = useSession();
  const t = useT();
  const languages = profile?.languages ?? [];

  // ------------------------------------------------------- ce que l'URL dit

  const [category, setCategory] = useState<CategorySelection>(() => {
    /* Un lien enregistré du temps où les deux filtres se combinaient peut
       porter les deux. Le genre l'emporte : c'est le plus précis. */
    if (params.get('genre')) return null;
    const c = params.get('category');
    if (c === 'favorites') return 'favorites';
    if (c === 'watched') return 'watched';
    const n = c ? Number(c) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [genre, setGenre] = useState<string | null>(() => params.get('genre'));
  const [sort, setSort] = useState<Sort>(() => {
    const s = params.get('sort');
    return s === 'rating' || s === 'name' || s === 'added' ? s : 'recent';
  });
  const [language, setLanguage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  /*
   * La colonne ne retient qu'un filtre à la fois.
   *
   * Genres et catégories se combinaient. Sur le papier c'était plus riche ;
   * à l'usage, être dans « Drame » puis cliquer sur la catégorie « ACTION »
   * ne montrait que les films d'action qui sont aussi des drames — presque
   * rien — sans que rien à l'écran n'explique pourquoi. Les deux listes sont
   * dans le même panneau et se lisent comme un seul choix : elles en font un.
   */
  const chooseCategory = useCallback((next: CategorySelection) => {
    setCategory(next);
    setGenre(null);
  }, []);
  const chooseGenre = useCallback((next: string | null) => {
    setGenre(next);
    setCategory(null);
  }, []);


  useEffect(() => {
    const next = new URLSearchParams();
    if (category) next.set('category', String(category));
    if (kind !== 'live' && genre) next.set('genre', genre);
    if (kind !== 'live' && sort !== 'recent') next.set('sort', sort);
    const s = next.toString();
    router.replace(s ? `?${s}` : window.location.pathname, { scroll: false });
  }, [kind, category, genre, sort, router]);

  // ------------------------------------------------- la colonne et les puces

  const categories = useAsync<{ items: Category[] }>(
    () => api.get(`/api/categories/${kind}`),
    [kind],
  );
  const genres = useAsync<{ items: GenreCount[] }>(
    () => (kind === 'live' ? Promise.resolve({ items: [] }) : api.get(`/api/genres/${kind}`)),
    [kind],
  );

  /*
   * L'épingle répond au clic, sans attendre le serveur.
   *
   * La liste vient du serveur et n'en bouge plus ; cette table couvre l'état
   * reçu le temps de l'aller-retour, puis la liste se recharge — c'est le
   * serveur qui range les épinglées en tête.
   */
  const [pins, setPins] = useState<Record<number, boolean>>({});
  useEffect(() => setPins({}), [categories.data]);
  const categoryList = useMemo(
    () =>
      (categories.data?.items ?? []).map((c) =>
        c.id in pins ? { ...c, isFavorite: pins[c.id] } : c,
      ),
    [categories.data, pins],
  );
  const togglePin = useCallback(
    (c: Category) => {
      const next = !c.isFavorite;
      setPins((prev) => ({ ...prev, [c.id]: next }));
      const call = next
        ? api.post('/api/me/favorites/categories', { categoryId: c.id })
        : api.del(`/api/me/favorites/categories/${c.id}`);
      void call.then(() => categories.reload()).catch(() =>
        setPins((prev) => {
          const rest = { ...prev };
          delete rest[c.id];
          return rest;
        }),
      );
    },
    [categories],
  );

  /*
   * Le compte des favoris, à côté de leur entrée dans la colonne.
   *
   * Une requête d'un seul élément dont seul le `total` sert : le listing sait
   * déjà compter avec la déduplication et les droits, dupliquer ce calcul
   * ailleurs le ferait diverger. `favoriteTick` la rejoue après chaque bascule.
   */
  const [favoriteTick, setFavoriteTick] = useState(0);
  const favoriteTotal = useAsync<Paginated<Item>>(
    () => api.get(`${ENDPOINT[kind]}${qs({ favorites: true, limit: 1 })}`),
    [kind, favoriteTick],
  );
  /* Le même décompte pour « vu récemment ». Sans lui, l'entrée annonçait un
     vide là où deux films attendaient. */
  const watchedTotal = useAsync<Paginated<Item>>(
    () => api.get(`${ENDPOINT[kind]}${qs({ watched: true, limit: 1 })}`),
    [kind],
  );

  // -------------------------------------------------------------- la liste

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const term = debounced.trim();
  const query = useCallback(
    (from: number) =>
      api.get<Paginated<Item>>(
        `${ENDPOINT[kind]}${qs({
          categoryId: typeof category === 'number' ? category : undefined,
          favorites: category === 'favorites' ? true : undefined,
          watched: category === 'watched' ? true : undefined,
          genre: kind === 'live' ? undefined : (genre ?? undefined),
          q: term.length >= 2 ? term : undefined,
          language: language ?? undefined,
          // Une chaîne ne « sort » pas : elle se range, dans l'ordre du pays.
          sort: kind === 'live' ? 'fr' : sort,
          limit: PAGE_SIZE,
          offset: from,
        })}`,
      ),
    [kind, category, genre, term, language, sort],
  );

  const first = useAsync<Paginated<Item>>(() => query(0), [query]);

  useEffect(() => {
    if (!first.data) return;
    setItems(first.data.items);
    setTotal(first.data.total);
    setOffset(first.data.items.length);
  }, [first.data]);

  // Pagination infinie. Offset et verrou passent par des refs : l'observateur
  // est créé une fois par jeu de filtres et doit lire l'état le plus récent.
  const busyRef = useRef(false);
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  offsetRef.current = offset;
  totalRef.current = total;

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (busyRef.current || offsetRef.current >= totalRef.current) return;
      busyRef.current = true;
      setLoadingMore(true);
      try {
        const page = await query(offsetRef.current);
        setItems((prev) => [...prev, ...page.items]);
        setOffset((o) => o + page.items.length);
      } catch {
        // Erreur de pagination : la sentinelle réessaiera au prochain défilement.
      } finally {
        busyRef.current = false;
        setLoadingMore(false);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [query]);

  /*
   * Bascule de favori, appliquée à l'écran avant la réponse du serveur.
   *
   * Une étoile qui attend un aller-retour réseau donne l'impression de ne pas
   * répondre. En cas d'échec, on recharge : l'état affiché redevient celui de
   * la base plutôt que de rester faux.
   */
  const toggleFavorite = useCallback(
    (item: Item) => {
      const next = !item.isFavorite;
      setItems((prev) =>
        prev.map((i) => (i.type === item.type && i.id === item.id ? { ...i, isFavorite: next } : i)),
      );
      // Une série est un `series` ; une chaîne comme un film sont des `stream`.
      const target = item.type === 'series' ? 'series' : 'stream';
      const call = next
        ? api.post('/api/me/favorites', { itemType: target, itemId: item.id })
        : api.del(`/api/me/favorites/${target}/${item.id}`);
      void call.then(() => setFavoriteTick((n) => n + 1)).catch(() => first.reload());
    },
    [first],
  );

  /*
   * Le programme en cours ne doit pas se figer : à 21 h les vignettes
   * annonçaient encore celui de 20 h. `useNowPlaying` relit toutes les deux
   * minutes ce que la grille sait des chaînes affichées.
   */
  const playing = useNowPlaying(
    kind === 'live' ? items.filter((i) => i.type === 'live').map((i) => i.id) : [],
  );
  const fresh = (item: Item): Item =>
    item.type === 'live' && playing.has(item.id)
      ? { ...item, now: playing.get(item.id) ?? null }
      : item;

  // ------------------------------------------------- l'en-tête des résultats

  const sortShown: Exclude<Sort, 'added'> = sort === 'added' ? 'recent' : sort;

  /* Ce qu'on regarde, en toutes lettres au-dessus de la grille : la colonne
     dit où l'on est, mais elle est loin de la première vignette. */
  const chosen = typeof category === 'number' ? categoryList.find((x) => x.id === category) : null;
  /*
   * Ce que la grille montre, en toutes lettres au-dessus d'elle. La colonne le
   * dit aussi, mais elle est loin de la première vignette — et un seul des
   * deux choix peut être actif, donc une seule ligne suffit.
   */
  const current = genre
    ? genre
    : category === 'favorites'
      ? t(FAVORITES[kind])
      : category === 'watched'
        ? t(WATCHED[kind])
        : typeof category === 'number'
          ? chosen
            ? splitLanguage(chosen.name).title || chosen.name
            : t('Catégorie')
          : t('Toutes les catégories');

  /* « Vu récemment » porte son ordre dans son nom : proposer « A → Z » à côté
     serait proposer un tri que le serveur ignore. */
  const sortSeg =
    kind !== 'live' && category !== 'watched' ? (
      /* Trois états visibles à la fois : le tri se voit et se change d'un
         clic, et il n'y en aura jamais un quatrième. */
      <div className="seg" role="radiogroup" aria-label={t('Trier')}>
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            role="radio"
            aria-checked={sortShown === key}
            data-on={sortShown === key || undefined}
            onClick={() => setSort(key)}
          >
            {t(label)}
          </button>
        ))}
      </div>
    ) : null;

  const languageSeg =
    languages.length > 1 ? (
      /*
       * Ne garder qu'une langue, quand le profil en a plusieurs.
       *
       * Le tri les met dans l'ordre, mais avec « français, anglais » la
       * première chaîne anglaise arrivait en 969e position. Il n'apparaît que
       * s'il y a un choix à faire.
       */
      <div className="seg" role="radiogroup" aria-label={t('Langue')}>
        <button
          role="radio"
          aria-checked={language === null}
          data-on={language === null || undefined}
          onClick={() => setLanguage(null)}
        >
          {t('Tout')}
        </button>
        {languages.map((code) => {
          const tag = languageTag(code);
          return (
            <button
              key={code}
              role="radio"
              aria-checked={language === code}
              data-on={language === code || undefined}
              onClick={() => setLanguage(code)}
              title={t(tag?.label ?? code)}
            >
              <span className="flag">{tag?.flag ?? code}</span>
              <span>{t(tag?.label ?? code)}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  // ------------------------------------------------------------- le vide

  const emptyTitle =
    category === 'favorites'
      ? t(EMPTY_FAVORITES[kind])
      : category === 'watched'
        ? t(EMPTY_WATCHED[kind])
        : term
        ? t('Rien pour « {query} »', { query: term })
        : genre
          ? t('Rien dans ce genre')
          : t('Rien dans cette catégorie');
  const emptyHint =
    category === 'favorites'
      ? t('L’étoile posée sur une vignette range la chaîne ici, pour la retrouver sans la chercher.')
      : category === 'watched'
        ? t('Tout ce que vous ouvrez se range ici, du plus récent au plus ancien.')
        : term
        ? t('Vérifiez l’orthographe, ou cherchez un mot du titre plutôt que le titre entier.')
        : undefined;
  const emptyAction =
    category !== null ? (
      <Button onClick={() => chooseCategory(null)}>{t('Toutes les catégories')}</Button>
    ) : genre ? (
      <Button onClick={() => chooseGenre(null)}>{t('Tous les genres')}</Button>
    ) : undefined;

  return (
    <>
      {/*
        Le bandeau de la page, sur toute la largeur, sous la navigation.

        Il a été essayé dans la colonne des résultats, puis fondu dans la barre
        de navigation : les deux déplaçaient un problème qui n'était pas là. Ce
        qui gênait, c'était l'écart entre lui et la colonne des filtres — la
        colonne le touche maintenant.
      */}
      <PageHead
        title={title}
        meta={<ResultCount total={total} noun={NOUN[kind]} />}
        actions={
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t('Filtrer dans {name}…', { name: t(title).toLowerCase() })}
          />
        }
      />

      <ErrorBand error={first.error ?? categories.error ?? genres.error ?? null} />

      <div className="split">
        <CategorySidebar
          categories={categoryList}
          selected={category}
          onSelect={chooseCategory}
          onTogglePin={togglePin}
          favoriteLabel={t(FAVORITES[kind])}
          favoriteCount={favoriteTotal.data?.total ?? null}
          watchedLabel={t(WATCHED[kind])}
          watchedCount={watchedTotal.data?.total ?? null}
          genres={kind === 'live' ? undefined : (genres.data?.items ?? [])}
          genre={genre}
          onGenre={kind === 'live' ? undefined : chooseGenre}
        />

        <div className="results">
          <div className="results-head">
            <h2 className="results-title">{current}</h2>
            {(sortSeg || languageSeg) && (
              <div className="results-tools">
                {sortSeg}
                {languageSeg}
              </div>
            )}
          </div>

          {first.loading && items.length === 0 ? (
            <SkeletonGrid kind={kind === 'live' ? 'channel' : 'work'} />
          ) : items.length === 0 ? (
            <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
          ) : (
            <div className="grid" data-kind={kind === 'live' ? 'channel' : 'work'}>
              {items.map(fresh).map((item) =>
                item.type === 'live' ? (
                  <ChannelCard
                    key={`l-${item.id}`}
                    channel={item}
                    onPlay={() => play({ itemType: 'stream', itemId: item.id, label: item.name })}
                    onToggleFavorite={toggleFavorite}
                  />
                ) : (
                  <WorkCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    onToggleFavorite={toggleFavorite}
                    /* « Vu récemment » est le seul listing qui connaisse la
                       progression : ailleurs le champ est absent, et la
                       vignette reste ce qu'elle est. */
                    seen={item.watch?.completed}
                    progressRatio={
                      item.watch && !item.watch.completed ? item.watch.ratio : null
                    }
                  />
                ),
              )}
            </div>
          )}

          <div ref={sentinel} style={{ height: 40 }}>
            {loadingMore && <Loading label={t('Chargement…')} />}
          </div>
        </div>
      </div>
    </>
  );
}
