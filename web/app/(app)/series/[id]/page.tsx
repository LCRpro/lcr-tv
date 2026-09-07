'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import {
  episodeTitle,
  parseVariant,
  workTitle,
  type Episode,
  type Movie,
  type SeriesDetail,
  type SeriesSummary,
} from '@iptv/shared';
import { api } from '../../../../lib/api';
import { useAsync } from '../../../../lib/hooks';
import { useIntlLocale, useT } from '../../../../lib/i18n';
import { usePlayer } from '../../../../lib/player';
import { EmptyState, ErrorBand } from '../../../../components/blocks';
import { Button } from '../../../../components/kit';
import {
  NoImage,
  SkeletonFiche,
  WorkCard,
  formatDuration,
  formatPosition as clock,
} from '../../../../components/ui';
import { Versions } from '../../../../components/Versions';
import { IconPlay } from '../../../../components/icons';
import { IconStar } from '../../../../components/marks';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * La fiche d'une série.
 *
 * La même tête que le film, et en dessous les épisodes comme des épisodes :
 * une image, un numéro, un titre, deux lignes de résumé, ce qu'il reste — et le
 * prochain à voir, cadré. Devant une série, la question est « où j'en suis »,
 * puis « lequel je lance » : la liste actuelle disait tout au même poids, et
 * rien ne désignait le prochain.
 */
export default function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const intl = useIntlLocale();
  const { id } = use(params);
  const seriesId = Number(id);
  const { play } = usePlayer();

  /*
   * Déclinaison affichée. Changer de langue change la liste des épisodes : on
   * recharge donc la fiche de cette déclinaison, sans naviguer — la position de
   * défilement et le contexte de la liste sont préservés.
   */
  const [activeId, setActiveId] = useState(seriesId);
  useEffect(() => setActiveId(seriesId), [seriesId]);

  const { data, error, loading, reload } = useAsync<SeriesDetail>(
    () => api.get(`/api/series/${activeId}`),
    [activeId],
  );
  const similar = useAsync<{ items: Array<Movie | SeriesSummary> }>(
    () => api.get(`/api/series/${seriesId}/similar`),
    [seriesId],
  );
  const [season, setSeason] = useState<number | null>(null);
  const [starred, setStarred] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Par défaut, on ouvre la saison de l'épisode à reprendre.
  useEffect(() => {
    if (!data || season !== null) return;
    setSeason(data.nextEpisode?.seasonNum ?? data.seasons[0]?.season ?? null);
  }, [data, season]);
  // Une autre déclinaison a sa propre numérotation : on repart de sa saison.
  useEffect(() => {
    setSeason(null);
    setStarred(null);
  }, [activeId]);

  if (loading && !data) return <SkeletonFiche />;
  if (error) return <ErrorBand error={error} />;
  if (!data) return null;

  const title = workTitle(data.name);
  const all = data.seasons.flatMap((s) => s.episodes);
  const current = data.seasons.find((s) => s.season === season) ?? data.seasons[0];
  const next = data.nextEpisode ? all.find((e) => e.id === data.nextEpisode!.episodeId) ?? null : null;
  const on = starred ?? data.isFavorite;
  const genre = data.genre?.split(',')[0]?.trim() || null;
  const cast = (data.cast ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const seenCount = all.filter((e) => e.progress?.completed).length;
  const parsedVersion = parseVariant(data.variants.find((v) => v.id === activeId)?.name ?? data.name);

  const launch = (ep: Episode) =>
    play({
      itemType: 'episode',
      itemId: ep.id,
      label: `${title} — S${pad(ep.season)}E${pad(ep.episodeNum)} · ${episodeTitle(ep.title, data.name)}`,
    });

  const toggleFavorite = () => {
    const next = !on;
    setStarred(next);
    const call = next
      ? api.post('/api/me/favorites', { itemType: 'series', itemId: activeId })
      : api.del(`/api/me/favorites/series/${activeId}`);
    void call.catch(() => setStarred(!next));
  };

  const setSeen = async (ep: Episode, value: boolean) => {
    await api.post('/api/me/seen', { itemType: 'episode', itemId: ep.id, seen: value });
    reload();
  };

  /* La saison entière d'un coup : une requête par épisode, il n'y en a jamais
     cent, et une route de masse serait une arme pour un geste rare. */
  const seeSeason = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await Promise.all(
        current.episodes
          .filter((e) => !e.progress?.completed)
          .map((e) => api.post('/api/me/seen', { itemType: 'episode', itemId: e.id, seen: true })),
      );
      reload();
    } finally {
      setBusy(false);
    }
  };

  const remaining = (ep: Episode) =>
    ep.progress?.durationSec && !ep.progress.completed && ep.progress.positionSec > 0
      ? ep.progress.durationSec - ep.progress.positionSec
      : null;

  const backdrop = data.backdropUrl ?? data.coverUrl;

  return (
    <div className="fiche">
      <div className="fiche-hero" data-blur={data.backdropUrl ? undefined : ''} aria-hidden>
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" />
        )}
        <span className="fiche-veil" />
      </div>

      <div className="fiche-body">
        <div className="fiche-poster">
          {data.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.coverUrl} alt="" />
          ) : (
            <NoImage label={title} />
          )}
        </div>

        <div className="fiche-main">
          <h1>{title}</h1>

          <div className="fiche-meta">
            {data.rating != null && data.rating > 0 && <b>★ {data.rating.toFixed(1)}</b>}
            {data.releaseDate && <span>{data.releaseDate.slice(0, 4)}</span>}
            {data.seasons.length > 0 && (
              <span>
                {t(data.seasons.length > 1 ? '{n} saisons' : '{n} saison', { n: data.seasons.length })}
                {' · '}
                {t(all.length > 1 ? '{n} épisodes' : '{n} épisode', { n: all.length })}
              </span>
            )}
            {data.genre && <span>{data.genre}</span>}
            {all.length > 0 && seenCount === all.length && (
              <span className="tag" data-tone="on">{t('Vu')}</span>
            )}
          </div>

          <div className="fiche-actions">
            {next && (
              <Button variant="primary" size="lg" icon={<IconPlay size={15} />} onClick={() => launch(next)}>
                {remaining(next)
                  ? t('Reprendre S{s}E{e} · {time} restantes', {
                      s: pad(next.season),
                      e: pad(next.episodeNum),
                      time: formatDuration(remaining(next)!),
                    })
                  : t('Lire S{s}E{e}', { s: pad(next.season), e: pad(next.episodeNum) })}
              </Button>
            )}
            <Button size="lg" icon={<IconStar filled={on} />} onClick={toggleFavorite}>
              {on ? t('Dans ma liste') : t('Ma liste')}
            </Button>
          </div>

          <Versions variants={data.variants} selectedId={activeId} onSelect={setActiveId} />

          {data.plot && <p className="fiche-plot">{data.plot}</p>}

          <dl className="fiche-facts">
            {data.director && (
              <div>
                <dt>{t('Création')}</dt>
                <dd>{data.director}</dd>
              </div>
            )}
            {data.releaseDate && (
              <div>
                <dt>{t('Sortie')}</dt>
                <dd>
                  {/^\d{4}-\d{2}-\d{2}/.test(data.releaseDate)
                    ? new Date(data.releaseDate).toLocaleDateString(intl, { dateStyle: 'long' })
                    : data.releaseDate}
                </dd>
              </div>
            )}
            {data.genre && (
              <div>
                <dt>{t('Genres')}</dt>
                <dd>{data.genre}</dd>
              </div>
            )}
            <div>
              <dt>{t('Langue')}</dt>
              <dd>{t(parsedVersion.tag?.label ?? 'Langue inconnue')}</dd>
            </div>
            {cast.length > 0 && (
              <div className="fiche-wide">
                <dt>{t('Distribution')}</dt>
                <dd className="fiche-cast">
                  {cast.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Les épisodes : le prochain cadré, le reste à sa suite. */}
      <section className="blk">
        <div className="blk-head">
          <h2>{t('Épisodes')}</h2>
          {data.seasons.length > 0 && (
            <div className="chips" role="radiogroup" aria-label={t('Saison')}>
              {data.seasons.map((s) => (
                <button
                  key={s.season}
                  type="button"
                  className="chip"
                  role="radio"
                  aria-checked={s.season === current?.season}
                  data-active={s.season === current?.season ? 'true' : undefined}
                  onClick={() => setSeason(s.season)}
                >
                  {t('Saison {n}', { n: s.season })}
                  <span className="chip-count">{s.episodes.length}</span>
                </button>
              ))}
            </div>
          )}
          {current && current.episodes.some((e) => !e.progress?.completed) && (
            <span className="blk-more">
              <Button size="sm" variant="ghost" onClick={() => void seeSeason()} busy={busy}>
                {t('Marquer la saison comme vue')}
              </Button>
            </span>
          )}
        </div>

        {data.seasons.length === 0 ? (
          <EmptyState
            title={t('Aucun épisode')}
            hint={t('Le fournisseur n’a remonté aucun épisode pour cette série. Une autre version, si elle existe, en a peut-être.')}
          />
        ) : (
          <div className="eps">
            {current?.episodes.map((ep) => {
              const done = ep.progress?.completed ?? false;
              const left = remaining(ep);
              const ratio =
                ep.progress?.durationSec && ep.progress.positionSec
                  ? ep.progress.positionSec / ep.progress.durationSec
                  : 0;
              const isNext = next?.id === ep.id;
              return (
                <article className="ep" key={ep.id} data-next={isNext || undefined} data-seen={done || undefined}>
                  <button type="button" className="ep-still" onClick={() => launch(ep)} title={t('Lire')}>
                    {ep.stillUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ep.stillUrl} alt="" loading="lazy" />
                    ) : (
                      <NoImage label={`S${ep.season} E${ep.episodeNum}`} shape="still" />
                    )}
                    {ratio > 0 && !done && (
                      <span className="ep-prog">
                        <b style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                      </span>
                    )}
                    {ep.durationSec ? <span className="ep-len">{formatDuration(ep.durationSec)}</span> : null}
                    {done && <span className="ep-seen">{t('Vu')}</span>}
                    <span className="ep-play" aria-hidden>
                      <IconPlay size={16} />
                    </span>
                  </button>

                  <div className="ep-body">
                    <span className="ep-n">
                      {isNext ? `${t('Prochain')} · ` : ''}
                      {t('Épisode {n}', { n: ep.episodeNum })}
                    </span>
                    <b className="ep-title">{episodeTitle(ep.title, data.name)}</b>
                    {ep.plot && <p className="ep-plot">{ep.plot}</p>}
                    <span className="ep-status">
                      {done
                        ? t('vu jusqu’au bout')
                        : left
                          ? t('arrêté à {pos} · {time} restantes', {
                              pos: clock(ep.progress!.positionSec),
                              time: formatDuration(left),
                            })
                          : t('pas encore vu')}
                    </span>
                  </div>

                  <div className="ep-actions">
                    <Button
                      size={isNext ? 'md' : 'sm'}
                      variant={isNext ? 'primary' : 'default'}
                      icon={<IconPlay size={13} />}
                      onClick={() => launch(ep)}
                    >
                      {done ? t('Revoir') : left ? t('Reprendre') : t('Lire')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void setSeen(ep, !done)}>
                      {done ? t('Vu · annuler') : t('Marquer comme vu')}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {genre && (similar.data?.items.length ?? 0) > 0 && (
        <section className="blk">
          <div className="blk-head">
            <h2>{t('Du même genre')}</h2>
            <span className="blk-note">
              {genre} · {t('les mieux notées')}
            </span>
            <Link
              className="blk-more"
              href={`/series?genre=${encodeURIComponent(genre)}&sort=rating`}
            >
              {t('Tout le genre')} <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="grid" data-kind="work">
            {similar.data!.items.map((item) => (
              <WorkCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
