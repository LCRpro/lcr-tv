'use client';

import { useMemo, useState } from 'react';
import type { FavoriteEntry, LiveChannel } from '@iptv/shared';
import { workTitle } from '@iptv/shared';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/hooks';
import { usePlayer } from '../../../lib/player';
import { useIntlLocale, useT } from '../../../lib/i18n';
import { EmptyState, ErrorBand } from '../../../components/blocks';
import { ButtonLink } from '../../../components/kit';
import {
  Card,
  ChannelCard,
  FavoriteStar,
  PageHead,
  SearchField,
  SkeletonGrid,
} from '../../../components/ui';

type Kind = 'movie' | 'series' | 'live';
type Filter = 'all' | Kind;
type Order = 'added' | 'name';

/** Les trois groupes, dans l'ordre de la page : films, séries, chaînes. */
const GROUPS: Array<[Kind, string]> = [
  ['movie', 'Films'],
  ['series', 'Séries'],
  ['live', 'Chaînes'],
];

/**
 * Ma liste.
 *
 * Une liste sert à retrouver ce qu'on a mis de côté. Elle doit dire ce qu'on
 * a déjà vu, et ce qu'on avait commencé — sinon elle grossit sans jamais se
 * vider : une liste dont rien ne sort n'est plus une liste, c'est un entrepôt.
 *
 * Trois groupes, films puis séries puis chaînes : une affiche et un logo ne
 * se rangent pas dans la même grille, et on sait en arrivant ce qu'on vient
 * chercher. Le filtre de la barre n'en garde qu'un ; le tri par défaut est
 * l'ordre d'ajout — on vient chercher ce qu'on vient de mettre de côté. Le
 * retrait, c'est l'étoile pleine, le même geste que partout ailleurs.
 */
export default function MaListePage() {
  const t = useT();
  const intl = useIntlLocale();
  const { play } = usePlayer();
  const { data, error, loading } = useAsync<{ items: FavoriteEntry[] }>(
    () => api.get('/api/me/favorites'),
    [],
  );

  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<Order>('added');
  const [term, setTerm] = useState('');
  /*
   * Le retrait est optimiste : la vignette part au clic.
   *
   * Attendre le serveur laissait la carte en place une demi-seconde, si bien
   * qu'on recliquait en croyant avoir manqué la cible. En cas d'échec, la
   * vignette revient — elle n'a jamais quitté la base.
   */
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const all = useMemo(
    () => (data?.items ?? []).filter((e) => !removed.has(`${e.itemType}-${e.itemId}`)),
    [data, removed],
  );

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = all.filter((e) => !q || e.label.toLowerCase().includes(q));
    if (order === 'name') {
      return [...list].sort((a, b) =>
        workTitle(a.label).localeCompare(workTitle(b.label), intl, { numeric: true }),
      );
    }
    return list;
  }, [all, term, order, intl]);

  const groups = GROUPS.filter(([kind]) => filter === 'all' || filter === kind).map(
    ([kind, label]) => ({ kind, label, items: shown.filter((e) => e.target.kind === kind) }),
  );

  /** Comptes sur la liste entière : un filtre ne doit pas faire croire qu'on a
   *  moins de favoris qu'en réalité. */
  const countOf = (kind: Filter) =>
    kind === 'all' ? all.length : all.filter((e) => e.target.kind === kind).length;
  const seen = all.filter((e) => e.progress?.completed).length;
  const started = all.filter((e) => e.progress && !e.progress.completed && e.progress.ratio > 0).length;

  const remove = (entry: FavoriteEntry) => {
    const key = `${entry.itemType}-${entry.itemId}`;
    setRemoved((prev) => new Set(prev).add(key));
    void api.del(`/api/me/favorites/${entry.itemType}/${entry.itemId}`).catch(() =>
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      }),
    );
  };

  const meta = data ? (
    <span className="page-count">
      <b>{all.length.toLocaleString(intl)}</b> {t(all.length > 1 ? 'titres' : 'titre')}
      {seen > 0 && <> · {t(seen > 1 ? '{n} vus' : '{n} vu', { n: seen })}</>}
      {started > 0 && <> · {t('{n} en cours', { n: started })}</>}
    </span>
  ) : null;

  const tools =
    all.length > 0 ? (
      <>
        <SearchField value={term} onChange={setTerm} placeholder={t('Filtrer par titre…')} />
        <div className="seg" role="radiogroup" aria-label={t('Filtrer')}>
          {[['all', 'Tout'] as [Filter, string], ...GROUPS]
            .filter(([k]) => k === 'all' || countOf(k) > 0)
            .map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={filter === key}
                data-on={filter === key || undefined}
                onClick={() => setFilter(key)}
              >
                {t(label)}
                <span className="seg-count">{countOf(key)}</span>
              </button>
            ))}
        </div>
        <div className="seg" role="radiogroup" aria-label={t('Trier')}>
          <button
            role="radio"
            aria-checked={order === 'added'}
            data-on={order === 'added' || undefined}
            onClick={() => setOrder('added')}
          >
            {t('Ajouté récemment')}
          </button>
          <button
            role="radio"
            aria-checked={order === 'name'}
            data-on={order === 'name' || undefined}
            onClick={() => setOrder('name')}
          >
            {t('A → Z')}
          </button>
        </div>
      </>
    ) : null;

  return (
    <>
      <PageHead title="Ma liste" meta={meta} actions={tools} />
      <ErrorBand error={error} />

      {loading && !data ? (
        <SkeletonGrid count={12} />
      ) : all.length === 0 ? (
        <EmptyState
          title={t('Votre liste est vide')}
          hint={t(
            'L’étoile sur une vignette, ou le bouton « Ma liste » d’une fiche, range ce que vous voulez retrouver ici. Chaque profil a la sienne.',
          )}
          action={<ButtonLink variant="primary" href="/films">{t('Parcourir les films')}</ButtonLink>}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title={
            term.trim()
              ? t('Aucun favori ne correspond à « {term} ».', { term: term.trim() })
              : t('Rien dans cette catégorie.')
          }
        />
      ) : (
        groups.map(({ kind, label, items }) =>
          items.length === 0 ? null : (
            <section className="blk" key={kind}>
              <div className="blk-head">
                <h2>{t(label)}</h2>
                <span className="blk-note">
                  {kind === 'live'
                    ? t(items.length > 1 ? '{n} chaînes' : '{n} chaîne', { n: items.length })
                    : t(items.length > 1 ? '{n} titres' : '{n} titre', { n: items.length })}
                </span>
              </div>
              <div className="grid" data-kind={kind === 'live' ? 'channel' : 'work'}>
                {items.map((entry) =>
                  kind === 'live' ? (
                    <ChannelCard
                      key={`${entry.itemType}-${entry.itemId}`}
                      channel={asChannel(entry)}
                      onPlay={() => play({ itemType: 'stream', itemId: entry.itemId, label: entry.label })}
                      onToggleFavorite={() => remove(entry)}
                    />
                  ) : (
                    <ListEntry
                      key={`${entry.itemType}-${entry.itemId}`}
                      entry={entry}
                      onRemove={() => remove(entry)}
                    />
                  ),
                )}
              </div>
            </section>
          ),
        )
      )}
    </>
  );
}

/**
 * Une chaîne de la liste, dans la forme que la carte de chaîne attend.
 *
 * La liste ne connaît d'une chaîne que son nom et son logo : c'est assez
 * pour la même carte que sur le direct, l'étoile pleine en plus.
 */
function asChannel(entry: FavoriteEntry): LiveChannel {
  return {
    id: entry.itemId,
    type: 'live',
    name: entry.label,
    iconUrl: entry.imageUrl,
    categoryId: null,
    categoryName: null,
    isAdult: false,
    isFavorite: true,
  };
}

/** Une œuvre de la liste : la vignette, l'état, l'étoile. */
function ListEntry({ entry, onRemove }: { entry: FavoriteEntry; onRemove: () => void }) {
  const t = useT();
  const title = workTitle(entry.label);
  const genre = entry.genre?.split(',')[0]?.trim() || null;
  const progress = entry.progress ?? null;

  const meta =
    progress?.episode && !progress.completed
      ? t('Continuer · {ep}', { ep: progress.episode })
      : [entry.year, genre].filter(Boolean).join(' · ') || null;

  return (
    <div className="card-wrap">
      <Card
        title={entry.label}
        meta={meta}
        imageUrl={entry.imageUrl}
        href={entry.target.kind === 'series' ? `/series/${entry.target.id}` : `/films/${entry.target.id}`}
        seen={Boolean(progress?.completed)}
        progressRatio={progress && !progress.completed ? progress.ratio : null}
      />
      <FavoriteStar on label={title} onToggle={onRemove} />
    </div>
  );
}
