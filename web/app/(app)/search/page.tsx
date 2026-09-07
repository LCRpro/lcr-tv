'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LiveChannel, Movie, SearchResults, SeriesSummary } from '@iptv/shared';
import { api, qs } from '../../../lib/api';
import { useAsync, useDebounced } from '../../../lib/hooks';
import { usePlayer } from '../../../lib/player';
import { useIntlLocale, useT } from '../../../lib/i18n';
import { Chips, EmptyState, ErrorBand, type ChipItem } from '../../../components/blocks';
import { ChannelCard, SearchField, SkeletonGrid, WorkCard } from '../../../components/ui';

type Family = 'movies' | 'series' | 'live';
type Item = Movie | SeriesSummary | LiveChannel;

const FAMILIES: Array<{ key: Family; label: string; noun: string }> = [
  { key: 'movies', label: 'Films', noun: 'film' },
  { key: 'series', label: 'Séries', noun: 'série' },
  { key: 'live', label: 'Chaînes', noun: 'chaîne' },
];

/**
 * Le meilleur palier d'une famille, ou rien si elle est vide.
 *
 * C'est lui qui décide de l'ordre des blocs : chercher « bein sport » doit
 * ouvrir sur les chaînes, « toy story » sur les films. Il dit aussi quand une
 * famille ne contient que des ressemblances — la page l'écrit alors, plutôt
 * que de laisser croire que « The Canal » répond à « canal + ».
 */
function bestTier(items: Item[]): number {
  let best = Infinity;
  for (const item of items) best = Math.min(best, item.matchTier ?? 3);
  return best;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonGrid />}>
      <SearchResultsPage />
    </Suspense>
  );
}

/**
 * La page qu'on atteint par « voir tous les résultats ».
 *
 * On arrive ici après avoir déjà lu cinq réponses dans la barre. La page doit
 * aller plus loin qu'elles, pas les répéter avec un autre titre : le terme est
 * le titre, ce qui correspond est surligné, et ce qui passe en ce moment sur
 * une chaîne trouvée se lit sous son logo — la recherche cherche déjà dans les
 * programmes, elle ne le disait pas.
 */
function SearchResultsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { play } = usePlayer();
  const t = useT();
  const intl = useIntlLocale();

  const [term, setTerm] = useState(params.get('q') ?? '');
  const [family, setFamily] = useState<'all' | Family>('all');
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const debounced = useDebounced(term, 350);
  const query = debounced.trim();

  useEffect(() => {
    // `replace` et non `push` : chaque lettre tapée n'est pas une étape de
    // navigation, et le bouton retour doit ramener à la page précédente.
    router.replace(query.length >= 2 ? `/search${qs({ q: query })}` : '/search');
  }, [query, router]);

  const { data, error, loading } = useAsync<SearchResults | null>(
    async () =>
      query.length >= 2
        ? api.get<SearchResults>(`/api/search${qs({ q: query, limit: 40 })}`)
        : null,
    [query],
  );

  const isStarred = (item: Item) =>
    starred[item.type === 'series' ? `series-${item.id}` : `stream-${item.id}`] ??
    Boolean(item.isFavorite);

  const toggleFavorite = useCallback(
    (item: Item) => {
      const kind = item.type === 'series' ? 'series' : 'stream';
      const key = `${kind}-${item.id}`;
      const on = starred[key] ?? Boolean(item.isFavorite);
      setStarred((prev) => ({ ...prev, [key]: !on }));
      const call = on
        ? api.del(`/api/me/favorites/${kind}/${item.id}`)
        : api.post('/api/me/favorites', { itemType: kind, itemId: item.id });
      void call.catch(() => setStarred((prev) => ({ ...prev, [key]: on })));
    },
    [starred],
  );

  /* Les familles, rangées par la qualité de ce qu'elles ont trouvé ; une
     famille vide disparaît. */
  const blocks = useMemo(() => {
    if (!data) return [];
    return FAMILIES.map((f) => ({ ...f, items: data[f.key] as Item[], tier: bestTier(data[f.key] as Item[]) }))
      .filter((f) => f.items.length > 0)
      .sort((a, b) => a.tier - b.tier);
  }, [data]);
  const total = blocks.reduce((n, b) => n + b.items.length, 0);
  const shown = family === 'all' ? blocks : blocks.filter((b) => b.key === family);

  const chips: ChipItem[] = [
    { key: 'all', label: t('Tout'), text: t('Tout'), count: total },
    ...blocks.map((b) => ({ key: b.key, label: t(b.label), text: t(b.label), count: b.items.length })),
  ];

  const render = (item: Item) => {
    if (item.type === 'live') {
      return (
        <ChannelCard
          key={`c-${item.id}`}
          channel={{ ...item, isFavorite: isStarred(item) }}
          onPlay={() => play({ itemType: 'stream', itemId: item.id, label: item.name })}
          onToggleFavorite={toggleFavorite}
          highlight={query}
        />
      );
    }
    return (
      <WorkCard
        key={`${item.type}-${item.id}`}
        item={{ ...item, isFavorite: isStarred(item) } as Movie | SeriesSummary}
        onToggleFavorite={toggleFavorite}
        highlight={query}
      />
    );
  };

  return (
    <>
      {/* Le terme est le titre : la page dit ce qu'on a cherché, pas ce qu'elle est. */}
      <div className="bar">
        <div className="bar-id">
          <h1>{query.length >= 2 ? `« ${query} »` : t('Recherche')}</h1>
          {query.length >= 2 && data && (
            <span className="page-count">
              <b>{total.toLocaleString(intl)}</b> {t(total > 1 ? 'résultats' : 'résultat')}
            </span>
          )}
        </div>
        <div className="bar-actions">
          <SearchField value={term} onChange={setTerm} placeholder={t('Titre de film, série ou chaîne…')} />
        </div>
      </div>

      <ErrorBand error={error} />

      {query.length < 2 ? (
        <EmptyState
          title={t('Cherchez un film, une série, une chaîne')}
          hint={t(
            'Deux caractères suffisent. Les accents et les fautes de frappe sont tolérés, et les trois familles répondent ensemble.',
          )}
        />
      ) : loading && !data ? (
        <SkeletonGrid />
      ) : total === 0 ? (
        <EmptyState
          title={t('Rien pour « {query} »', { query })}
          hint={t('Vérifiez l’orthographe, ou cherchez un mot du titre plutôt que le titre entier.')}
        />
      ) : (
        <>
          <Chips items={chips} value={family} onChange={(k) => setFamily(k as 'all' | Family)} label={t('Familles')} />

          {shown.map((block) => (
            <section className="blk" key={block.key}>
              <div className="blk-head">
                <h2>{t(block.label)}</h2>
                <span className="blk-note">
                  {block.tier >= 3
                    ? t('ressemblances — aucun titre ne contient « {query} »', { query })
                    : block.tier === 2
                      ? t('le terme est dans le titre, pas au début')
                      : t('ce qui correspond le mieux')}
                  {block.key === 'live' ? ` · ${t('ce qui passe en ce moment')}` : ''}
                </span>
              </div>
              <div className="grid" data-kind={block.key === 'live' ? 'channel' : 'work'}>
                {block.items.map(render)}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
