'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { parseVariant, workTitle, type Movie, type MovieDetail, type SeriesSummary } from '@iptv/shared';
import { api } from '../../../../lib/api';
import { useAsync } from '../../../../lib/hooks';
import { useIntlLocale, useT } from '../../../../lib/i18n';
import { usePlayer } from '../../../../lib/player';
import { ErrorBand } from '../../../../components/blocks';
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

/**
 * La fiche d'un film.
 *
 * Une fiche sert à décider, puis à lancer. Elle ouvrait sur un choix de
 * version que personne ne fait avant d'avoir lu de quoi ça parle, et le bouton
 * Lire venait après. L'ordre est celui de toutes les fiches qu'on sait lire :
 * l'image, le titre, lire ou reprendre, l'histoire, puis la technique.
 *
 * L'image large existe pour quatre-vingt-dix mille œuvres depuis
 * l'enrichissement : c'est elle qui tient la page, fondue dans le fond. Sans
 * elle, l'affiche floutée en tient lieu, comme avant.
 */
export default function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const intl = useIntlLocale();
  const { id } = use(params);
  const movieId = Number(id);
  const { play } = usePlayer();
  const { data, error, loading, reload } = useAsync<MovieDetail>(
    () => api.get(`/api/films/${movieId}`),
    [movieId],
  );
  const similar = useAsync<{ items: Array<Movie | SeriesSummary> }>(
    () => api.get(`/api/films/${movieId}/similar`),
    [movieId],
  );

  // Déclinaison choisie. On repart de celle de l'URL à chaque changement de
  // fiche, sinon on garderait le choix fait sur le film précédent.
  const [variantId, setVariantId] = useState(movieId);
  useEffect(() => setVariantId(movieId), [movieId]);

  // L'étoile et « vu » répondent au clic ; la fiche se relit ensuite.
  const [starred, setStarred] = useState<boolean | null>(null);
  useEffect(() => setStarred(null), [movieId]);

  if (loading && !data) return <SkeletonFiche />;
  if (error) return <ErrorBand error={error} />;
  if (!data) return null;

  const variant = data.variants.find((v) => v.id === variantId) ?? data.variants[0] ?? null;
  const playedId = variant?.id ?? movieId;
  const parsed = parseVariant(variant?.name ?? data.name);
  // Le titre de la fiche est celui de l'œuvre, pas d'une de ses déclinaisons.
  const title = workTitle(data.name);

  const progress = data.progress;
  const seen = progress?.completed ?? false;
  const resumeAt = progress && !progress.completed ? progress.positionSec : 0;
  const total = progress?.durationSec ?? data.durationSec ?? null;
  const on = starred ?? data.isFavorite;
  const genre = data.genre?.split(',')[0]?.trim() || null;
  const cast = (data.cast ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const launch = () =>
    play({ itemType: 'stream', itemId: playedId, label: `${title} — ${parsed.tag?.label ?? ''}` });

  const toggleFavorite = () => {
    const next = !on;
    setStarred(next);
    const call = next
      ? api.post('/api/me/favorites', { itemType: 'stream', itemId: movieId })
      : api.del(`/api/me/favorites/stream/${movieId}`);
    void call.catch(() => setStarred(!next));
  };

  const setSeen = async (value: boolean) => {
    await api.post('/api/me/seen', { itemType: 'stream', itemId: movieId, seen: value });
    reload();
  };

  const restart = async () => {
    await api.del(`/api/me/history/stream/${movieId}`);
    reload();
    launch();
  };

  const backdrop = data.backdropUrl ?? data.iconUrl;

  return (
    <div className="fiche">
      {/* L'image large, ou l'affiche floutée à défaut : la page prend la
          couleur du film sans qu'aucune donnée manquante ne se voie. */}
      <div className="fiche-hero" data-blur={data.backdropUrl ? undefined : ''} aria-hidden>
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" />
        )}
        <span className="fiche-veil" />
      </div>

      <div className="fiche-body">
        <div className="fiche-poster">
          {data.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.iconUrl} alt="" />
          ) : (
            <NoImage label={title} />
          )}
        </div>

        <div className="fiche-main">
          <h1>{title}</h1>

          <div className="fiche-meta">
            {data.rating != null && data.rating > 0 && <b>★ {data.rating.toFixed(1)}</b>}
            {data.releaseDate && <span>{data.releaseDate.slice(0, 4)}</span>}
            {data.durationSec ? <span>{formatDuration(data.durationSec)}</span> : null}
            {data.genre && <span>{data.genre}</span>}
            {seen && <span className="tag" data-tone="on">{t('Vu')}</span>}
          </div>

          <div className="fiche-actions">
            <Button variant="primary" size="lg" icon={<IconPlay size={15} />} onClick={launch}>
              {resumeAt > 0 ? t('Reprendre à {time}', { time: clock(resumeAt) }) : t('Lire')}
            </Button>
            {resumeAt > 0 && (
              <Button size="lg" onClick={() => void restart()}>
                {t('Lire depuis le début')}
              </Button>
            )}
            <Button size="lg" icon={<IconStar filled={on} />} onClick={toggleFavorite}>
              {on ? t('Dans ma liste') : t('Ma liste')}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => void setSeen(!seen)}>
              {seen ? t('Vu · annuler') : t('Marquer comme vu')}
            </Button>
          </div>

          {resumeAt > 0 && total && (
            <div className="fiche-resume">
              <div className="fiche-bar">
                <span style={{ width: `${Math.min(100, (resumeAt / total) * 100)}%` }} />
              </div>
              <span>
                {t('{time} restantes', { time: formatDuration(total - resumeAt) })}
                {progress?.updatedAt
                  ? ` · ${t('arrêté le {date}', {
                      date: new Date(progress.updatedAt).toLocaleString(intl, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}`
                  : ''}
              </span>
            </div>
          )}

          <Versions variants={data.variants} selectedId={playedId} onSelect={setVariantId} />

          {data.plot && <p className="fiche-plot">{data.plot}</p>}

          <dl className="fiche-facts">
            {data.director && (
              <div>
                <dt>{t('Réalisation')}</dt>
                <dd>{data.director}</dd>
              </div>
            )}
            {data.durationSec ? (
              <div>
                <dt>{t('Durée')}</dt>
                <dd>{formatDuration(data.durationSec)}</dd>
              </div>
            ) : null}
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

      {/* Huit films du même genre : pour continuer sans repasser par la liste. */}
      {genre && (similar.data?.items.length ?? 0) > 0 && (
        <section className="blk">
          <div className="blk-head">
            <h2>{t('Du même genre')}</h2>
            <span className="blk-note">
              {genre} · {t('les mieux notés')}
            </span>
            <Link
              className="blk-more"
              href={`/films?genre=${encodeURIComponent(genre)}&sort=rating`}
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
