'use client';

import { useMemo, useState } from 'react';
import type { HistoryEntry } from '@iptv/shared';
import { channelTitle, workTitle } from '@iptv/shared';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/hooks';
import { usePlayer } from '../../../lib/player';
import { useIntlLocale, useT, type Translate } from '../../../lib/i18n';
import { EmptyState, ErrorBand } from '../../../components/blocks';
import { Button, ButtonLink } from '../../../components/kit';
import { Card, PageHead, ResultCount, SkeletonGrid, formatDuration } from '../../../components/ui';

/**
 * Depuis quand, en une expression.
 *
 * « 31/08/2026 17:40 » demande de calculer soi-même l'écart avec aujourd'hui.
 * Ce qu'on cherche dans un historique, c'est l'ordre et la fraîcheur, pas
 * l'horodatage exact — celui-ci reste dans l'infobulle.
 */
function since(t: Translate, intl: string, iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("à l'instant");
  if (min < 60) return t('il y a {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('il y a {n} h', { n: h });
  return new Date(iso).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
}

/** Position dans le contenu, pour se rappeler où on en était. */
function clock(t: Translate, sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? t('{h} h {m}', { h, m: String(m).padStart(2, '0') }) : t('{m} min', { m });
}

/**
 * Regroupement par jour, dans l'ordre où on s'en souvient.
 *
 * Une liste plate de cent entrées demande de lire chaque date pour se repérer.
 * Les intertitres font ce repérage à notre place — on cherche « ce que j'ai vu
 * hier » bien plus souvent qu'une date précise.
 */
function bucketOf(t: Translate, intl: string, iso: string): string {
  const day = 86_400_000;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = new Date(iso).getTime();
  if (at >= midnight) return t("Aujourd'hui");
  if (at >= midnight - day) return t('Hier');
  return new Date(iso).toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long' });
}

type Filter = 'all' | 'unfinished' | 'done';

/** « S02E04 — Le titre » → « S02E04 ». */
const episodeCode = (label: string) => label.split(' — ')[0] ?? label;

/**
 * Historique.
 *
 * Des cartes par jour, pas des lignes de tableau : on reconnaît ce qu'on a
 * regardé à son image, et on relit où on s'est arrêté sur la barre, pas dans
 * une colonne de chiffres. Le résumé chiffré en tête répond à la question
 * qu'on ne pose pas mais qu'on se pose — combien, cette semaine.
 */
export default function HistoriquePage() {
  const { play } = usePlayer();
  const { data, error, loading, reload } = useAsync<{ items: HistoryEntry[] }>(
    () => api.get('/api/me/history?limit=100'),
    [],
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const t = useT();
  const intl = useIntlLocale();

  const keyOf = (e: HistoryEntry) => `${e.itemType}-${e.itemId}`;
  const all = useMemo(
    () => (data?.items ?? []).filter((e) => !gone.has(keyOf(e))),
    [data, gone],
  );
  const unfinished = useMemo(() => all.filter((e) => !e.completed), [all]);
  const done = useMemo(() => all.filter((e) => e.completed), [all]);

  const items = filter === 'unfinished' ? unfinished : filter === 'done' ? done : all;

  /* Regroupées à l'affichage seulement : l'API les renvoie déjà triées. */
  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of items) {
      const key = bucketOf(t, intl, entry.updatedAt);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()];
  }, [items, t, intl]);

  /* Le résumé de la semaine : ce qu'on a regardé, pas ce qu'on a ouvert. */
  const week = useMemo(() => {
    const from = Date.now() - 7 * 86_400_000;
    const recent = all.filter((e) => new Date(e.updatedAt).getTime() >= from);
    const watched = recent.reduce(
      (n, e) => n + (e.completed ? (e.durationSec ?? e.positionSec) : e.positionSec),
      0,
    );
    return {
      count: recent.length,
      watched,
      unfinished: recent.filter((e) => !e.completed && e.durationSec).length,
      done: recent.filter((e) => e.completed).length,
    };
  }, [all]);

  /* L'oubli est optimiste : la carte part au clic, et revient si le serveur refuse. */
  const forget = (entry: HistoryEntry) => {
    const key = keyOf(entry);
    setGone((prev) => new Set(prev).add(key));
    void api.del(`/api/me/history/${entry.itemType}/${entry.itemId}`).catch(() =>
      setGone((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      }),
    );
  };

  const clearFinished = async () => {
    setBusy(true);
    try {
      // Une requête par entrée : il n'y en a jamais cent, et une route de purge
      // en masse serait une arme pour un geste qu'on fait deux fois par an.
      await Promise.all(done.map((e) => api.del(`/api/me/history/${e.itemType}/${e.itemId}`)));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const launch = (entry: HistoryEntry) =>
    play({
      itemType: entry.itemType === 'episode' ? 'episode' : 'stream',
      itemId: entry.itemId,
      label: entry.label,
    });

  const tools =
    all.length > 0 ? (
      <>
        <div className="seg" role="radiogroup" aria-label={t('Filtrer')}>
          {(
            [
              ['all', 'Tout', all.length],
              ['unfinished', 'À reprendre', unfinished.length],
              ['done', 'Terminés', done.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              role="radio"
              aria-checked={filter === key}
              data-on={filter === key || undefined}
              onClick={() => setFilter(key)}
              disabled={n === 0 && key !== 'all'}
            >
              {t(label)}
              <span className="seg-count">{n}</span>
            </button>
          ))}
        </div>
        {done.length > 0 && (
          <Button size="sm" onClick={() => void clearFinished()} busy={busy}>
            {t('Effacer les terminés')}
          </Button>
        )}
      </>
    ) : null;

  return (
    <>
      <PageHead
        title="Historique"
        meta={data ? <ResultCount total={all.length} noun="lecture" /> : null}
        actions={tools}
      />
      <ErrorBand error={error} />

      {loading && !data ? (
        <SkeletonGrid count={10} kind="channel" />
      ) : all.length === 0 ? (
        <EmptyState
          title={t('Rien encore')}
          hint={t(
            'Ce que vous regardez s’inscrit ici, et se reprend là où vous l’aviez laissé. Chaque profil a son propre historique.',
          )}
          action={<ButtonLink variant="primary" href="/films">{t('Parcourir les films')}</ButtonLink>}
        />
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <b>{week.count}</b>
              <span>{t(week.count > 1 ? 'lectures cette semaine' : 'lecture cette semaine')}</span>
            </div>
            <div className="stat">
              <b>{formatDuration(week.watched) || '0 min'}</b>
              <span>{t('regardées')}</span>
            </div>
            <div className="stat">
              <b>{week.unfinished}</b>
              <span>{t('à reprendre')}</span>
            </div>
            <div className="stat">
              <b>{week.done}</b>
              <span>{t('vus jusqu’au bout')}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState title={t('Rien dans cette catégorie.')} />
          ) : (
            groups.map(([bucket, entries]) => (
              <section className="blk" key={bucket}>
                <div className="day">
                  {bucket} · {entries.length}
                </div>
                <div className="grid" data-kind="still">
                  {entries.map((entry) => {
                    const live = entry.target.kind === 'live';
                    const title = live
                      ? channelTitle(entry.label)
                      : workTitle(entry.parentLabel ?? entry.label);
                    const ratio = entry.durationSec ? entry.positionSec / entry.durationSec : 0;
                    const left =
                      entry.durationSec && !entry.completed
                        ? entry.durationSec - entry.positionSec
                        : 0;
                    const meta = live
                      ? `${t('Chaîne')} · ${since(t, intl, entry.updatedAt)}`
                      : entry.completed
                        ? `${entry.parentLabel ? episodeCode(entry.label) + ' · ' : ''}${t('vu jusqu’au bout')} · ${since(t, intl, entry.updatedAt)}`
                        : `${entry.parentLabel ? episodeCode(entry.label) + ' · ' : ''}${
                            entry.positionSec > 0
                              ? t('arrêté à {time}', { time: clock(t, entry.positionSec) })
                              : since(t, intl, entry.updatedAt)
                          }${left > 60 ? ` · ${t('{time} restantes', { time: formatDuration(left) })}` : ''}`;
                    return (
                      <div className="card-wrap" key={keyOf(entry)}>
                        <Card
                          title={title}
                          meta={meta}
                          imageUrl={entry.imageUrl}
                          shape={live ? 'logo' : 'still'}
                          onClick={() => launch(entry)}
                          seen={entry.completed}
                          progressRatio={!entry.completed && ratio > 0 ? ratio : null}
                        />
                        <button
                          type="button"
                          className="card-x"
                          onClick={() => forget(entry)}
                          title={t('Retirer de l’historique')}
                          aria-label={t('Retirer {name} de l’historique', { name: title })}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
