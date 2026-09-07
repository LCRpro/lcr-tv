'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  channelTitle,
  splitChannelQuality,
  splitLanguage,
  workTitle,
  type EpgEntry,
  type LiveChannel,
  type Movie,
  type SeriesSummary,
} from '@iptv/shared';
import type { ApiError } from '../lib/api';
import { useIntlLocale, useT, type Translate } from '../lib/i18n';
import { usePlayer } from '../lib/player';
import { IconStar, LanguageMark } from './marks';
import { IconPlay } from './icons';

/** Loupe du champ de recherche : un placeholder seul n'annonce pas un champ. */
export function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

/** Champ de recherche : l'icône vit dans le même bloc pour suivre le focus. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="field">
      <SearchIcon />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * L'en-tête de page, dans la même barre que Live, Films et Séries.
 *
 * La barre est collante et pleine largeur : le titre reste lisible quand on
 * descend dans une longue liste. Le compteur se lit comme la suite du titre,
 * les commandes tiennent l'autre bout.
 */
export function PageHead({
  title,
  meta,
  actions,
}: {
  /**
   * Toujours un libellé d'interface, jamais un nom d'œuvre : la coquille le
   * traduit elle-même. Autrement chaque page devrait penser à appeler `t()`,
   * et un seul oubli laisse un titre français au milieu d'une page anglaise.
   */
  title: string;
  /** Ce que « 23 445 résultats » est au Live : court, chiffré, à côté du titre. */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="bar">
      <div className="bar-id">
        <h1>{t(title)}</h1>
        {meta}
      </div>
      {actions && <div className="bar-actions">{actions}</div>}
    </div>
  );
}

/**
 * Compteur de résultats, présenté comme une donnée et non comme une légende.
 *
 * Le singulier et le pluriel sont deux textes distincts, chacun traduit pour
 * lui-même : ajouter un « s » à la traduction donnerait « seriess », et les
 * règles de pluriel ne se ressemblent pas assez d'une langue à l'autre pour
 * tenir dans une convention.
 */
export function ResultCount({ total, noun }: { total: number; noun: string }) {
  const intl = useIntlLocale();
  const t = useT();
  return (
    <span className="page-count">
      <b>{total.toLocaleString(intl)}</b> {t(total > 1 ? `${noun}s` : noun)}
    </span>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="empty">
      <span className="spin" />{' '}
      <span style={{ marginLeft: 8 }}>{label ?? t('Chargement…')}</span>
    </div>
  );
}

/**
 * Écran de démarrage, le temps de savoir qui regarde.
 *
 * Il ne dure qu'un aller-retour de session — trop court pour lire une phrase,
 * assez long pour qu'un écran noir vide passe pour une panne. La marque animée
 * dit que l'application a démarré, ce qu'un rond qui tourne ne dit pas.
 */
export function Boot({ label = 'LCR TV' }: { label?: string }) {
  return (
    <div className="boot">
      <div className="boot-mark" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="boot-label">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------ squelettes */

/**
 * Squelettes : la forme de la page avant son contenu.
 *
 * Ils occupent la place *exacte* des vignettes à venir. Un rond qui tourne au
 * centre d'un écran vide ne dit ni ce qui arrive ni combien de temps ça prendra,
 * et la page saute au moment où le contenu le remplace ; ici rien ne bouge à
 * l'arrivée des données.
 */
export function SkeletonGrid({
  count = 18,
  kind = 'work',
}: {
  count?: number;
  kind?: 'work' | 'channel';
}) {
  const t = useT();
  return (
    <div
      className="grid skel-grid"
      data-kind={kind}
      aria-busy
      aria-label={t('Chargement du catalogue')}
    >
      {Array.from({ length: count }, (_, i) => (
        kind === 'channel' ? (
          <div className="skel-card" key={i}>
            <span className="skel" style={{ aspectRatio: '16 / 9', borderRadius: 'var(--radius)' }} />
            <span className="skel skel-line skel-sm" style={{ width: '42%' }} />
            <span className="skel skel-line" style={{ width: `${54 + ((i * 31) % 36)}%` }} />
          </div>
        ) : (
          <div className="skel-card" key={i}>
            <span className="skel skel-poster" />
            {/* Largeurs inégales : des barres toutes identiques se lisent comme
                un tableau, pas comme des titres. */}
            <span className="skel skel-line" style={{ width: `${58 + ((i * 37) % 34)}%` }} />
            <span className="skel skel-line skel-sm" />
          </div>
        )
      ))}
    </div>
  );
}

/**
 * Squelette d'une page de parcours entière : barre, colonne, grille.
 *
 * Il sert de repli au `Suspense` des pages Live / Films / Séries, avant même
 * que le composant de parcours existe — sans lui, la page se recomposait
 * complètement à l'arrivée du vrai contenu, exactement le saut que les
 * squelettes doivent éviter.
 */
export function SkeletonCatalogue({ kind = 'work' }: { kind?: 'work' | 'channel' }) {
  return (
    <>
      <div className="bar">
        <div className="bar-id">
          <span className="skel skel-line" style={{ width: 132, height: 17 }} />
          <span className="skel skel-line skel-sm" style={{ width: 74 }} />
        </div>
        <span className="skel" style={{ width: 260, height: 34, borderRadius: 999 }} />
      </div>
      <div className="split" aria-hidden>
        <div className="sidebar" style={{ minHeight: 480 }}>
          <div className="sidebar-head">
            <span className="skel" style={{ height: 34, borderRadius: 999 }} />
            <span className="skel skel-line" style={{ width: '58%', margin: '6px 8px' }} />
            <span className="skel skel-line" style={{ width: '72%', margin: '6px 8px' }} />
          </div>
          <div className="sidebar-list">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                className="skel skel-line"
                key={i}
                style={{ width: `${44 + ((i * 31) % 46)}%`, margin: '11px 10px' }}
              />
            ))}
          </div>
        </div>
        <div className="results">
          <SkeletonGrid kind={kind} />
        </div>
      </div>
    </>
  );
}

/**
 * Squelette de l'accueil : le bloc du soir, les catégories du direct, une rangée.
 *
 * L'accueil n'a pas la forme des pages de parcours — s'y servir d'un squelette
 * de grille annoncerait une mise en page qui n'arrivera pas.
 */
export function SkeletonDashboard() {
  const t = useT();
  return (
    <div aria-busy aria-label={t('Chargement de l’accueil')}>
      <div className="bar">
        <div className="bar-id">
          <span className="skel skel-line" style={{ width: 140, height: 17 }} />
          <span className="skel skel-line skel-sm" style={{ width: 108 }} />
        </div>
      </div>
      <div className="tonight-body" style={{ marginBottom: 'var(--space-7)' }}>
        <span className="skel" style={{ minHeight: 300, borderRadius: 'var(--radius-lg)' }} />
        <div className="tonight-side">
          {Array.from({ length: 3 }, (_, i) => (
            <span className="skel" key={i} style={{ minHeight: 64, borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      </div>
      <div className="cats" style={{ marginBottom: 'var(--space-7)' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <span className="skel" key={i} style={{ height: 58, borderRadius: 'var(--radius)' }} />
        ))}
      </div>
      <SkeletonGrid count={8} />
    </div>
  );
}

/**
 * Squelette d'une fiche : l'image large, l'affiche, le titre, les gestes.
 *
 * La fiche s'ouvre depuis une vignette : le passage doit garder la forme de ce
 * qui arrive — un rond au centre d'une page vide faisait sauter tout l'écran à
 * l'arrivée de l'image.
 */
export function SkeletonFiche() {
  const t = useT();
  return (
    <div className="fiche" aria-busy aria-label={t('Chargement de la fiche')}>
      <span className="skel fiche-hero" style={{ display: 'block' }} />
      <div className="fiche-body">
        <span className="skel fiche-poster" style={{ display: 'block' }} />
        <div className="fiche-main">
          <span className="skel skel-line" style={{ width: '46%', height: 30 }} />
          <span className="skel skel-line skel-sm" style={{ width: '30%' }} />
          <span className="skel" style={{ width: 260, height: 40, borderRadius: 999 }} />
          <span className="skel skel-line" style={{ width: '70%' }} />
          <span className="skel skel-line" style={{ width: '64%' }} />
          <span className="skel skel-line" style={{ width: '52%' }} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 10 }: { count?: number }) {
  const t = useT();
  return (
    <div className="list" aria-busy aria-label={t('Chargement du catalogue')}>
      {Array.from({ length: count }, (_, i) => (
        <div className="skel-row" key={i}>
          <span className="skel skel-wide" />
          <span className="skel-row-body">
            <span className="skel skel-line" style={{ width: `${46 + ((i * 29) % 38)}%` }} />
            <span className="skel skel-line skel-sm" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ErrorNotice({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="notice notice-error">
      <strong>{error.code}</strong> — {error.message}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ------------------------------------------------------------ visuels */

/** Initiales d'un libellé, pour le repli quand le fournisseur ne donne pas de visuel. */
function initials(label: string): string {
  return label
    .split(/[\s:–-]+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Le format d'un visuel.
 *
 * `poster` : une affiche, 2/3, recadrée. `logo` : un logo de chaîne, 16/9,
 * contenu sur sa plaque — un logo tronqué ne se reconnaît plus. `still` : une
 * image d'épisode ou de reprise, 16/9, recadrée.
 */
export type Shape = 'poster' | 'logo' | 'still';

/**
 * Ce qu'on montre quand le fournisseur n'a pas d'image.
 *
 * Il n'en donne pas pour tout, et les adresses qu'il donne meurent : sans
 * repli, la ligne gardait un rectangle vide, et une liste de suggestions
 * ressemblait à une liste à moitié chargée. Le cadre reste occupé, et il dit
 * quelque chose.
 *
 * Les initiales plutôt qu'un logo répété. Un même visuel sur chaque entrée sans
 * image en ferait un mur de marques identiques, impossible à parcourir de
 * l'œil ; « TS3 » distingue « Toy Story 3 » de son voisin. La marque de
 * l'application est là aussi, en filigrane : elle dit d'où vient le cadre sans
 * disputer la place aux lettres, et s'efface sous 40 px, où elle ne serait
 * qu'une tache.
 */
export function NoImage({
  label,
  className,
  shape,
}: {
  label: string;
  className?: string;
  shape?: Shape;
}) {
  return (
    <span
      className={className ? `${className} noimg` : 'noimg'}
      data-shape={shape}
      aria-hidden
    >
      <svg className="noimg-mark" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
        <rect x="3" y="7" width="4" height="10" rx="1.6" />
        <rect x="10" y="3" width="4" height="18" rx="1.6" />
        <rect x="17" y="9" width="4" height="6" rx="1.6" />
      </svg>
      <b>{initials(label)}</b>
    </span>
  );
}

interface CardProps {
  title: string;
  /** La ligne sous le titre : « 2024 · Drame », le programme en cours, la catégorie. */
  meta?: ReactNode;
  imageUrl?: string | null;
  href?: string;
  onClick?: () => void;
  shape?: Shape;
  progressRatio?: number | null;
  /** Avancement du programme en cours, distinct de la progression de lecture. */
  elapsedRatio?: number | null;
  badge?: string | null;
  rating?: number | null;
  /** Déjà vu jusqu'au bout : la liste le dit, sinon elle ne se vide jamais. */
  seen?: boolean;
  /** Le terme cherché, surligné dans le titre : on voit pourquoi le résultat est là. */
  highlight?: string | null;
  /**
   * Où le titre s'écrit.
   *
   * `poster` le pose sur l'affiche, au bas d'un dégradé, et ne laisse rien
   * dessous : la carte fait alors la hauteur exacte de son visuel, et une
   * grille ne peut plus finir en dents de scie selon la longueur des titres.
   * C'est la forme des grilles de parcours. `below`, le défaut, garde la
   * légende sous le visuel — les listes personnelles y écrivent où l'on en
   * est, ce qu'une affiche ne peut pas porter.
   */
  titleOn?: 'below' | 'poster';
}

/** Plie les accents et la casse : « É » et « e » sont la même lettre pour chercher. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Le terme cherché, surligné dans un titre.
 *
 * La recherche tolère les accents et la casse ; le surlignage doit tolérer les
 * mêmes choses, sinon « canal » ne se retrouverait pas dans « CANAL+ ». On
 * compare caractère par caractère sur une forme pliée, mais on découpe le
 * texte d'origine — un accent plié ne change pas de place.
 */
export function markMatch(text: string, query: string | null | undefined): ReactNode {
  const q = query ? fold(query.trim()) : '';
  if (!q) return text;
  const chars = [...text];
  const folded = chars.map(fold);
  for (let i = 0; i < chars.length; i += 1) {
    let k = 0;
    let j = i;
    while (k < q.length && j < chars.length) {
      const f = folded[j]!;
      if (f !== '' && !q.startsWith(f, k)) break;
      k += f.length;
      j += 1;
    }
    if (k === q.length) {
      return (
        <>
          {chars.slice(0, i).join('')}
          <mark>{chars.slice(i, j).join('')}</mark>
          {chars.slice(j).join('')}
        </>
      );
    }
  }
  return text;
}

/**
 * La vignette.
 *
 * Un visuel, une ou deux marques dessus, un titre et une ligne de contexte
 * dessous. Le survol ne fait qu'une chose : dire ce qu'un clic va faire — un
 * liseré, le bouton de lecture. Les affiches sont le seul décor de la page ;
 * la vignette ne leur dispute pas la couleur.
 */
export function Card({
  title,
  meta,
  imageUrl,
  href,
  onClick,
  shape = 'poster',
  progressRatio,
  elapsedRatio,
  badge,
  rating,
  seen,
  highlight,
  titleOn = 'below',
}: CardProps) {
  const t = useT();
  // La carte représente une œuvre, pas une de ses déclinaisons : le « [4K] »
  // appartient à la version, il se choisit sur la fiche.
  const { tag } = splitLanguage(title);
  const cleanTitle = workTitle(title);

  /*
   * Beaucoup de visuels du fournisseur sont morts. Masquer l'image cassée
   * laissait un rectangle vide ; on bascule sur les initiales, qui donnent au
   * moins une prise visuelle dans une grille.
   */
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(imageUrl) && !broken;

  /*
   * Le drapeau est **dans** le texte, pas à côté : en élément en ligne dans la
   * même boîte, la deuxième ligne d'un titre revient à la marge au lieu de
   * repartir sous la première lettre.
   */
  const name = (
    <>
      <LanguageMark tag={tag} />
      {highlight ? markMatch(cleanTitle, highlight) : cleanTitle}
    </>
  );

  const inner = (
    <>
      <div className="card-media">
        {showImage ? (
          // Hôtes d'images inconnus à l'avance et souvent en http : <img> brut.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="card-poster"
            data-shape={shape}
            src={imageUrl!}
            alt=""
            loading="lazy"
            /* Une affiche ne se traîne pas hors de la page : le
               glisser-déposer du navigateur volait le geste aux rangées qui
               défilent, où l'on attrape justement une affiche pour pousser. */
            draggable={false}
            onError={() => setBroken(true)}
          />
        ) : (
          <NoImage label={cleanTitle} className="card-poster" shape={shape} />
        )}

        {badge && <span className="badge">{badge}</span>}
        {rating != null && rating > 0 && (
          <span className="badge badge-rating">{rating.toFixed(1)}</span>
        )}
        {seen && <span className="card-seen">{t('Vu')}</span>}

        <span className="card-play" aria-hidden>
          <span>
            <IconPlay size={14} />
          </span>
        </span>

        {/* Le titre sur l'affiche : il vient après les marques, donc au-dessus
            d'elles dans l'empilement, et son dégradé les laisse lisibles. */}
        {titleOn === 'poster' && (
          <div className="card-over-name">
            <b>{name}</b>
            {meta && <span>{meta}</span>}
          </div>
        )}

        {elapsedRatio != null && elapsedRatio > 0 && (
          <div className="card-elapsed">
            <span style={{ width: `${Math.min(100, elapsedRatio * 100)}%` }} />
          </div>
        )}
        {progressRatio != null && progressRatio > 0 && (
          <div className="progress-bar">
            <span style={{ width: `${Math.min(100, progressRatio * 100)}%` }} />
          </div>
        )}
      </div>

      {titleOn === 'below' && (
        <div className="card-body">
          <div className="card-title">{name}</div>
          {meta && <div className="card-sub">{meta}</div>}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link className="card" href={href} title={cleanTitle}>
        {inner}
      </Link>
    );
  }
  return (
    <button className="card" onClick={onClick} title={cleanTitle}>
      {inner}
    </button>
  );
}

/** Nom de catégorie débarrassé de son préfixe de type et de ses décorations. */
export function categoryLabel(name: string | null): string | null {
  if (!name) return null;
  return splitLanguage(name).title || name;
}

/**
 * La ligne sous une affiche : l'année et le premier genre.
 *
 * « VOD | FR - LATEST MOVIES » ne dit rien. « 2024 · Drame » dit quelque chose.
 * Une série dont on connaît les épisodes dit plutôt combien il y en a — c'est
 * ce qu'on veut savoir avant de commencer. La catégorie du fournisseur ne
 * reste qu'en dernier recours, quand l'enrichissement n'a rien donné.
 */
/**
 * La ligne courte, sous un titre posé sur l'affiche.
 *
 * Rien pour un film : ni l'année, ni le genre. L'année ne décide de rien quand
 * on parcourt une grille, et le genre est déjà choisi dans la colonne — les
 * deux ne faisaient qu'ajouter une ligne grise sous chaque vignette. Une série
 * garde son nombre de saisons : c'est le seul renseignement qu'on veut avant
 * de commencer, et l'affiche ne le porte jamais.
 */
export function workLine(item: Movie | SeriesSummary, t: Translate): string | null {
  if (item.type === 'series' && item.seasonCount && item.episodeCount) {
    return t(item.seasonCount > 1 ? '{n} saisons' : '{n} saison', { n: item.seasonCount });
  }
  return null;
}

export function workMeta(item: Movie | SeriesSummary, t: Translate): string | null {
  if (item.type === 'series' && item.seasonCount && item.episodeCount) {
    return `${t(item.seasonCount > 1 ? '{n} saisons' : '{n} saison', { n: item.seasonCount })} · ${t(
      item.episodeCount > 1 ? '{n} épisodes' : '{n} épisode',
      { n: item.episodeCount },
    )}`;
  }
  const genre = item.genre?.split(',')[0]?.trim() || null;
  const parts = [item.year, genre].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return categoryLabel(item.categoryName);
}

/**
 * Étoile de favori, posée par-dessus une vignette.
 *
 * Toujours **à côté** de la carte dans le balisage et jamais dedans : la carte
 * est déjà un bouton ou un lien, et imbriquer une commande dans une autre est
 * invalide — le clic serait ambigu et le clavier n'atteindrait jamais l'étoile.
 */
export function FavoriteStar({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      className="card-star"
      data-on={on || undefined}
      onClick={onToggle}
      aria-pressed={on}
      title={
        on ? t('Retirer {label} de ma liste', { label }) : t('Ajouter {label} à ma liste', { label })
      }
    >
      <IconStar filled={on} />
    </button>
  );
}

/**
 * La vignette d'une œuvre, et ce qu'elle dit au survol.
 *
 * Le catalogue sait depuis l'enrichissement de quoi parle chaque film, dans la
 * langue du profil — et la grille ne s'en servait pas : il fallait ouvrir la
 * fiche pour lire trois lignes. Le survol les montre sur l'affiche, avec les
 * deux gestes qui suivent : lire, ou garder. Sur un écran tactile, où le
 * survol n'existe pas, la vignette reste une vignette et la fiche fait le
 * reste.
 *
 * Le voile et ses boutons sont des **frères** de la carte, jamais ses enfants :
 * la carte est un lien, et un bouton dans un lien est invalide. Le texte du
 * voile laisse passer les clics vers l'affiche ; seuls ses boutons les gardent.
 */
export function WorkCard({
  item,
  onToggleFavorite,
  meta,
  seen,
  progressRatio,
  highlight,
}: {
  item: Movie | SeriesSummary;
  onToggleFavorite?: (item: Movie | SeriesSummary) => void;
  /** Remplace la ligne par défaut — « Continuer · S02E04 » dans la liste. */
  meta?: ReactNode;
  seen?: boolean;
  progressRatio?: number | null;
  highlight?: string | null;
}) {
  const t = useT();
  const { play } = usePlayer();
  const title = workTitle(item.name);
  const href = item.type === 'vod' ? `/films/${item.id}` : `/series/${item.id}`;
  const image = item.type === 'vod' ? item.iconUrl : item.coverUrl;
  const plot = item.plot?.trim() || null;

  return (
    <div className="card-wrap" data-over={plot ? '' : undefined}>
      <Card
        title={item.name}
        /* Le titre est sur l'affiche : la ligne qui l'accompagne doit tenir en
           trois mots. Un appelant qui a mieux à dire — « Continuer · S02E04 » —
           passe le sien. */
        meta={meta ?? workLine(item, t)}
        imageUrl={image}
        href={href}
        badge={item.isAdult ? '18+' : null}
        rating={item.rating}
        seen={seen}
        progressRatio={progressRatio}
        highlight={highlight}
        titleOn="poster"
      />
      {onToggleFavorite && (
        <FavoriteStar
          on={Boolean(item.isFavorite)}
          label={title}
          onToggle={() => onToggleFavorite(item)}
        />
      )}
      {plot && (
        <div className="card-over">
          <p>{plot}</p>
          <div className="card-over-actions">
            {item.type === 'vod' ? (
              <button
                type="button"
                className="card-act"
                data-primary
                onClick={() => play({ itemType: 'stream', itemId: item.id, label: item.name })}
              >
                <IconPlay size={12} /> {t('Lire')}
              </button>
            ) : (
              <Link className="card-act" data-primary href={href}>
                <IconPlay size={12} /> {t('Voir la série')}
              </Link>
            )}
            <Link className="card-act" href={href}>
              {t('Fiche')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function MovieCard({
  movie,
  onToggleFavorite,
}: {
  movie: Movie;
  onToggleFavorite?: (movie: Movie) => void;
}) {
  return (
    <WorkCard
      item={movie}
      onToggleFavorite={onToggleFavorite ? (i) => onToggleFavorite(i as Movie) : undefined}
    />
  );
}

export function SeriesCard({
  series,
  onToggleFavorite,
}: {
  series: SeriesSummary;
  onToggleFavorite?: (series: SeriesSummary) => void;
}) {
  return (
    <WorkCard
      item={series}
      onToggleFavorite={onToggleFavorite ? (i) => onToggleFavorite(i as SeriesSummary) : undefined}
    />
  );
}

/** Part écoulée du programme en cours, entre 0 et 1. */
export function elapsedOf(now: EpgEntry): number | null {
  const start = new Date(now.startAt).getTime();
  const end = new Date(now.endAt).getTime();
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

/**
 * La carte d'une chaîne : ce qui passe, et sur quelle chaîne.
 *
 * Elle a été une tuile de logo, puis une ligne de guide. C'est maintenant une
 * carte de programme : un visuel 16/9, et dessous ce qu'on regarde. Le
 * changement n'est pas cosmétique — il inverse ce que la carte annonce.
 * « beIN SPORTS 1 » ne dit pas quoi faire de sa soirée ; « Basket-ball :
 * Coupe du monde féminine », si.
 *
 * Le visuel est le logo sur sa plaque, faute d'image de programme : le
 * fournisseur n'en publie pas, et l'agenda que nous importons n'en porte pas
 * non plus. Le titre en gras prend donc l'émission quand elle est connue, le
 * nom de la chaîne sinon : la ligne la plus lourde porte toujours le
 * renseignement le plus précis.
 */
export function ChannelCard({
  channel,
  onPlay,
  onToggleFavorite,
  highlight,
}: {
  channel: LiveChannel;
  onPlay: () => void;
  onToggleFavorite?: (channel: LiveChannel) => void;
  highlight?: string | null;
}) {
  const intl = useIntlLocale();
  const t = useT();
  const now = channel.now;
  const { tag, title: raw } = splitLanguage(channel.name);
  const name = channelTitle(channel.name);
  // La qualité de la déclinaison représentante : deux TF1 ne se ressemblent
  // plus trait pour trait. Lue du nom, comme la base le fait.
  const quality = splitChannelQuality(raw).quality;
  const [broken, setBroken] = useState(false);
  const elapsed = now ? elapsedOf(now) : null;

  const marked = highlight ? markMatch(name, highlight) : name;

  const card = (
    <button type="button" className="chan" onClick={onPlay} title={name}>
      <span className="chan-media">
        {/*
          Le numéro puis la qualité, en colonne à gauche.

          Le numéro d'abord : c'est par lui qu'on retrouve la chaîne sur un
          téléviseur — « fais 6 », pas « cherche M6 ». La qualité le suit
          plutôt que de se poser en face : le coin droit appartient à
          l'étoile, qui la recouvrait entièrement.
        */}
        <span className="chan-tags">
          {channel.number != null && <span className="chan-num">{channel.number}</span>}
          {quality && <span className="chan-q">{quality}</span>}
          {channel.isAdult && <span className="chan-q">18+</span>}
        </span>
        {channel.iconUrl && !broken ? (
          <>
            {/*
              Le fond : le même logo, agrandi et flou.

              Il n'existe pas d'image d'émission — ni le fournisseur ni l'agenda
              XMLTV n'en publient — et un aplat identique sur cent cartes ne
              distingue rien. Le logo, lui, porte les couleurs de la chaîne :
              étalé derrière, il donne à chaque carte le champ coloré de sa
              marque. Deux balises pour un seul téléchargement : le navigateur
              sert la seconde depuis son cache.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="chan-back" src={channel.iconUrl} alt="" loading="lazy" aria-hidden />
            {/* Hôtes d'images inconnus à l'avance et souvent en http : <img> brut. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="chan-logo"
              src={channel.iconUrl}
              alt=""
              loading="lazy"
              draggable={false}
              onError={() => setBroken(true)}
            />
          </>
        ) : (
          <NoImage label={name} />
        )}
        <span className="chan-play" aria-hidden>
          <IconPlay size={16} />
        </span>
        {/* Le nom, sur la plaque. Trente-trois chaînes d'une même ligue
            portent le même logo : sans lui, la grille est un mur de tuiles
            que rien ne distingue. */}
        <span className="chan-name">
          <LanguageMark tag={tag} />
          {marked}
        </span>
        {/* L'avancement de l'émission en cours, au ras du visuel. */}
        {elapsed != null && elapsed > 0 && (
          <span className="chan-elapsed" aria-hidden>
            <i style={{ width: `${Math.min(100, elapsed * 100)}%` }} />
          </span>
        )}
      </span>

      {/*
        L'émission, et elle seule.

        La carte disait auparavant « En direct », puis le nom de la chaîne, puis
        sa catégorie : trois lignes dont deux répétaient ce que le logo et la
        colonne de gauche annonçaient déjà. Sans agenda il ne reste donc rien
        sous le visuel, et la carte s'arrête à sa plaque.
      */}
      {now && (
        <span className="chan-prog">
          <b>{now.title}</b>
          <span>
            <i className="chan-dot" aria-hidden />
            {formatClock(now.startAt, intl)}
            {now.description ? ` · ${now.description}` : ''}
          </span>
        </span>
      )}
    </button>
  );

  if (!onToggleFavorite) return card;

  return (
    <div className="chan-wrap">
      {card}
      <FavoriteStar
        on={Boolean(channel.isFavorite)}
        label={name}
        onToggle={() => onToggleFavorite(channel)}
      />
    </div>
  );
}

export function formatClock(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/** « 1:04:12 » : une position dans le contenu, comme le lecteur l'affiche. */
export function formatPosition(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
