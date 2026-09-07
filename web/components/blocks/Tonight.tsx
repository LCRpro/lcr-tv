'use client';

import Link from 'next/link';
import type { HistoryEntry, Spotlight } from '@iptv/shared';
import { workTitle } from '@iptv/shared';
import { useT, type Translate } from '../../lib/i18n';
import { usePlayer } from '../../lib/player';
import { Button, ButtonLink } from '../kit';
import { NoImage } from '../ui';
import { IconPlay } from '../icons';

/**
 * Ce soir : la sélection du jour, et ce qu'on avait laissé, dans le même bloc.
 *
 * « Reprendre » et « Sélection du jour » étaient deux blocs. Avec deux
 * lectures en cours, le premier montrait une grande carte et une colonne aux
 * deux tiers vide ; sans lecture en cours, il disparaissait. Le bloc est
 * maintenant toujours plein, et c'est la sélection qui tient la grande carte :
 * c'est ce que la page a de neuf à dire. Les reprises viennent en tête de la
 * colonne — deux au plus, pour qu'une deuxième proposition garde sa place —
 * et la sélection complète. Sans proposition du jour, la reprise la plus
 * récente prend la grande carte.
 */
type Slot = { kind: 'resume'; entry: HistoryEntry } | { kind: 'pick'; pick: Spotlight };

/** Trois cartes dans la colonne : la hauteur de la grande carte, sans vide. */
const SIDE = 3;
/** Au plus deux reprises dans la colonne : une proposition de plus garde sa place. */
const SIDE_RESUMES = 2;

/** Ce qu'il reste, en toutes lettres : c'est ce qui décide si on relance. */
function reste(entry: HistoryEntry, t: Translate): string | null {
  if (!entry.durationSec || entry.durationSec <= entry.positionSec) return null;
  const min = Math.round((entry.durationSec - entry.positionSec) / 60);
  if (min < 60) return t('{m} min restantes', { m: min });
  return t('{h} h {m} restantes', { h: Math.floor(min / 60), m: min % 60 });
}

/**
 * L'épisode, dit proprement.
 *
 * Le libellé d'un épisode est « S01E01 — » suivi du titre du fournisseur, qui
 * répète tout : la langue, le nom de la série, le numéro, les horaires. Seul
 * le code sert ; il se lit mieux en toutes lettres.
 */
function episode(entry: HistoryEntry, t: Translate): string | null {
  if (!entry.parentLabel) return null;
  const code = entry.label.split(' — ')[0]?.trim() ?? entry.label;
  const m = /^S(\d+)E(\d+)$/i.exec(code);
  if (!m) return code;
  return t('Saison {s} · Épisode {e}', { s: Number(m[1]), e: Number(m[2]) });
}

const part = (e: HistoryEntry) =>
  e.durationSec && e.durationSec > 0 ? Math.min(1, e.positionSec / e.durationSec) : 0;

const hrefOfPick = (p: Spotlight) => (p.kind === 'series' ? `/series/${p.id}` : `/films/${p.id}`);

const firstGenre = (genre: string | null) => genre?.split(',')[0]?.trim() || null;

export function TonightBlock({
  resume,
  picks,
  onPlay,
  hrefOf,
}: {
  resume: HistoryEntry[];
  picks: Spotlight[];
  onPlay: (entry: HistoryEntry) => void;
  hrefOf: (entry: HistoryEntry) => string | undefined;
}) {
  const t = useT();
  const resumes: Slot[] = resume.map((entry) => ({ kind: 'resume', entry }));
  const proposals: Slot[] = picks.map((pick) => ({ kind: 'pick', pick }));
  const featured = proposals[0] ?? resumes[0];
  if (!featured) return null;

  const side = [
    ...resumes.filter((r) => r !== featured).slice(0, SIDE_RESUMES),
    ...proposals.filter((p) => p !== featured),
  ].slice(0, SIDE);
  const hasResume = resumes.length > 0;

  return (
    <section className="tonight">
      <div className="blk-head">
        <h2>{hasResume ? t('Ce soir') : t('Sélection du jour')}</h2>
        <span className="blk-note">
          {hasResume ? t('la sélection du jour, et ce que vous aviez laissé') : t('renouvelée chaque matin')}
        </span>
        {hasResume && (
          <Link className="blk-more" href="/historique">
            {t('Tout l’historique')} <span aria-hidden>→</span>
          </Link>
        )}
      </div>

      <div className="tonight-body" data-alone={side.length === 0 || undefined}>
        {featured.kind === 'resume' ? (
          <FeaturedResume entry={featured.entry} onPlay={onPlay} href={hrefOf(featured.entry)} t={t} />
        ) : (
          <FeaturedPick pick={featured.pick} t={t} />
        )}
        {side.length > 0 && (
          <div className="tonight-side">
            {side.map((slot) =>
              slot.kind === 'resume' ? (
                <SideResume
                  key={`r-${slot.entry.itemType}-${slot.entry.itemId}`}
                  entry={slot.entry}
                  onPlay={onPlay}
                  t={t}
                />
              ) : (
                <SidePick key={`p-${slot.pick.kind}-${slot.pick.id}`} pick={slot.pick} t={t} />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Art({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="tonight-art" aria-hidden>
      {src ? (
        // Hôtes d'images inconnus à l'avance : <img> brut.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <NoImage label={label} />
      )}
      <span className="tonight-veil" />
    </div>
  );
}

/** La ligne de faits sous le titre : la note en laiton, l'année, le genre. */
function Facts({ rating, bits }: { rating?: number | null; bits: Array<string | null | undefined> }) {
  const shown = bits.filter((b): b is string => Boolean(b));
  if (rating == null && shown.length === 0) return null;
  return (
    <div className="tonight-facts">
      {rating != null && rating > 0 && <span className="tonight-rating">★ {rating.toFixed(1)}</span>}
      {shown.map((b) => (
        <span key={b}>{b}</span>
      ))}
    </div>
  );
}

function FeaturedResume({
  entry,
  onPlay,
  href,
  t,
}: {
  entry: HistoryEntry;
  onPlay: (e: HistoryEntry) => void;
  href: string | undefined;
  t: Translate;
}) {
  const title = workTitle(entry.parentLabel ?? entry.label);
  return (
    <article className="tonight-main">
      <Art src={entry.imageUrl} label={title} />
      <div className="tonight-text">
        <span className="tonight-k">
          {t('Reprendre')} · {entry.target.kind === 'series' ? t('Série') : t('Film')}
        </span>
        <h3>{title}</h3>
        <Facts bits={[episode(entry, t)]} />
        <div className="tonight-bar" aria-hidden>
          <span style={{ width: `${part(entry) * 100}%` }} />
        </div>
        <p className="tonight-left">{reste(entry, t) ?? t('Reprendre')}</p>
        <div className="tonight-actions">
          <Button variant="primary" icon={<IconPlay size={14} />} onClick={() => onPlay(entry)}>
            {t('Reprendre')}
          </Button>
          {href && <ButtonLink href={href}>{t('Plus d’infos')}</ButtonLink>}
        </div>
      </div>
    </article>
  );
}

function FeaturedPick({ pick, t }: { pick: Spotlight; t: Translate }) {
  const { play } = usePlayer();
  const title = workTitle(pick.name);
  return (
    <article className="tonight-main">
      <Art src={pick.backdropUrl} label={title} />
      <div className="tonight-text">
        <span className="tonight-k">
          {t('Sélection du jour')} · {pick.kind === 'series' ? t('Série') : t('Film')}
        </span>
        <h3>{title}</h3>
        <Facts rating={pick.rating} bits={[pick.year, firstGenre(pick.genre)]} />
        {pick.plot && <p className="tonight-plot">{pick.plot}</p>}
        <div className="tonight-actions">
          {pick.kind === 'movie' ? (
            <Button
              variant="primary"
              icon={<IconPlay size={14} />}
              onClick={() => play({ itemType: 'stream', itemId: pick.id, label: pick.name })}
            >
              {t('Lire')}
            </Button>
          ) : (
            /* Une série ne se lance pas d'un bloc : la fiche sait quel épisode reprendre. */
            <ButtonLink variant="primary" icon={<IconPlay size={14} />} href={hrefOfPick(pick)}>
              {t('Voir la série')}
            </ButtonLink>
          )}
          <ButtonLink href={hrefOfPick(pick)}>{t('Plus d’infos')}</ButtonLink>
        </div>
      </div>
    </article>
  );
}

/**
 * Une carte de la colonne : le visuel, trois lignes, un geste au bout.
 *
 * L'intitulé du haut dit ce que c'est — une reprise, une proposition — le
 * titre est le titre, et la dernière ligne ce qu'on a besoin de savoir avant
 * de cliquer : où l'on en est, ou ce que ça vaut. Le rond au bout de la ligne
 * dit ce que le clic fera : reprendre, ou ouvrir.
 */
function SideResume({
  entry,
  onPlay,
  t,
}: {
  entry: HistoryEntry;
  onPlay: (e: HistoryEntry) => void;
  t: Translate;
}) {
  const title = workTitle(entry.parentLabel ?? entry.label);
  const detail = [episode(entry, t), reste(entry, t)].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="tonight-item"
      data-kind="resume"
      onClick={() => onPlay(entry)}
      title={title}
    >
      <span className="tonight-item-art">
        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt="" loading="lazy" />
        ) : (
          <NoImage label={title} />
        )}
        <span className="tonight-item-bar" aria-hidden>
          <span style={{ width: `${part(entry) * 100}%` }} />
        </span>
      </span>
      <span className="tonight-item-text">
        <span className="tonight-item-k">{t('Reprendre')}</span>
        <b>{title}</b>
        <span>{detail || (entry.target.kind === 'series' ? t('Série') : t('Film'))}</span>
      </span>
      <span className="tonight-item-go" aria-hidden>
        <IconPlay size={12} />
      </span>
    </button>
  );
}

function SidePick({ pick, t }: { pick: Spotlight; t: Translate }) {
  const title = workTitle(pick.name);
  const detail = [
    pick.rating != null && pick.rating > 0 ? `★ ${pick.rating.toFixed(1)}` : null,
    pick.year,
    firstGenre(pick.genre),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link className="tonight-item" data-kind="pick" href={hrefOfPick(pick)} title={title}>
      <span className="tonight-item-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pick.backdropUrl} alt="" loading="lazy" />
      </span>
      <span className="tonight-item-text">
        <span className="tonight-item-k">
          {t('Sélection du jour')} · {pick.kind === 'series' ? t('Série') : t('Film')}
        </span>
        <b>{title}</b>
        <span>{detail}</span>
      </span>
      <span className="tonight-item-go" aria-hidden>
        →
      </span>
    </Link>
  );
}
