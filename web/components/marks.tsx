'use client';

import type { CategoryIcon, LanguageTag, TopicKey } from '@iptv/shared';

/**
 * Icônes de catégories et de listes.
 *
 * Même grille de 24 et même `currentColor` que celles du lecteur : elles
 * s'alignent au pixel près et prennent la couleur du texte autour. Un emoji
 * aurait sa propre graisse, sa propre couleur, sa propre taille, et
 * dépendrait d'une police que le système peut ne pas avoir.
 */
function frame(path: React.ReactNode, size: number, fill?: boolean) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {path}
    </svg>
  );
}

/** Étoile de favori. Pleine quand c'est acquis, en contour sinon. */
export function IconStar({ filled, size = 15 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" />
    </svg>
  );
}

/** Déjà regardé : une horloge, aiguilles à dix heures dix. */
export function IconClock({ size = 15 }: { size?: number }) {
  return frame(
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.4 2" />
    </>,
    size,
  );
}

/** Toutes les catégories : des dossiers empilés. */
export function IconLibrary({ size = 15 }: { size?: number }) {
  return frame(
    <>
      <path d="M3 8.5a2 2 0 0 1 2-2h3.2l1.6 2H19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M6 6.5V5.2a1.7 1.7 0 0 1 1.7-1.7h2.1l1.4 1.8" />
    </>,
    size,
  );
}

/** Marqueur régional — « Afrique », « Asie », « Multilingue » : pas de pays. */
export function IconGlobe({ size = 15 }: { size?: number }) {
  return frame(
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6s-1.2 6.2-3.4 8.6c-2.2-2.4-3.4-5.4-3.4-8.6S9.8 5.8 12 3.4z" />
    </>,
    size,
  );
}

const TOPIC_PATHS: Record<TopicKey, React.ReactNode> = {
  // Ballon : cercle et coutures, plutôt qu'un pentagone illisible à 15 px.
  football: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.6l3.4 2.5-1.3 4h-4.2l-1.3-4z" />
      <path d="M12 3.4v4.2M19.9 9.6l-4 .5M16.8 19l-2.7-3.4M7.2 19l2.7-3.4M4.1 9.6l4 .5" />
    </>
  ),
  // Sport mécanique : le damier de l'arrivée, plus lisible qu'une voiture.
  motorsport: (
    <>
      <path d="M5 4.2v16" />
      <path d="M5 5.6h14v9H5z" />
      <path d="M9.7 5.6v9M14.3 5.6v9M5 10.1h14" />
    </>
  ),
  // Cricket : la batte et la balle.
  cricket: (
    <>
      <path d="M14.4 4.6l5 5-7.6 7.6-5-5z" />
      <path d="M9.6 13.4L4.8 18.2a1.9 1.9 0 0 0 2.7 2.7l4.8-4.8" />
      <circle cx="18.6" cy="17.6" r="2.6" />
    </>
  ),
  // Sport générique : la coupe.
  sport: (
    <>
      <path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 5.6H5a2.4 2.4 0 0 0 2.5 4.3M16.5 5.6H19a2.4 2.4 0 0 1-2.5 4.3" />
      <path d="M12 13.7V17M8.8 20h6.4l-.8-3H9.6z" />
    </>
  ),
  // Noël : le sapin.
  christmas: (
    <>
      <path d="M12 3.2l4 5.4h-2.4l3.2 4.4h-2.4l3.4 4.6H6.2l3.4-4.6H7.2l3.2-4.4H8z" />
      <path d="M12 17.6v3.2" />
    </>
  ),
  // Musique : la double croche.
  music: (
    <>
      <path d="M9.4 17.6V6.2l9.2-2v11.4" />
      <circle cx="6.8" cy="17.6" r="2.6" />
      <circle cx="16" cy="15.6" r="2.6" />
    </>
  ),
  // Humour : le masque de comédie.
  comedy: (
    <>
      <path d="M4.2 6.4c5.2-1.5 10.4-1.5 15.6 0 0 7.4-3 12.9-7.8 14.4C7.2 19.3 4.2 13.8 4.2 6.4z" />
      <path d="M9.2 10.6h.01M14.8 10.6h.01" />
      <path d="M9 14.6c1.8 1.5 4.2 1.5 6 0" />
    </>
  ),
  // Cinéma : la claquette.
  cinema: (
    <>
      <path d="M3 9.6h18v9.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19V9.6z" />
      <path d="M3.6 9.6L5.4 4.4l16.2 2-1 4.6" />
      <path d="M9.4 4.9l-1.3 4.4M14.9 5.5l-1.3 4.1" />
    </>
  ),
  // Repli : un écran, quand rien n'est reconnu.
  screen: (
    <>
      <rect x="3" y="5.4" width="18" height="12" rx="2.2" />
      <path d="M8.4 20.6h7.2" />
    </>
  ),
};

/** Icône d'un thème de catégorie, dessinée et non empruntée à une police. */
export function IconTopic({ topic, size = 15 }: { topic: TopicKey; size?: number }) {
  return frame(TOPIC_PATHS[topic], size);
}

/**
 * Ce qui précède le nom d'une catégorie : drapeau, thème, ou globe.
 *
 * Le drapeau reste un emoji — c'est le seul cas où l'emoji **est** l'icône, et
 * dessiner soixante drapeaux à la main les rendrait tous approximatifs.
 */
export function CategoryMark({ icon }: { icon: CategoryIcon }) {
  if (icon.kind === 'flag') {
    return (
      <span className="flag" title={icon.label} aria-label={icon.label}>
        {icon.flag}
      </span>
    );
  }
  return (
    <span className="mark" title={icon.label} aria-label={icon.label}>
      {icon.kind === 'globe' ? <IconGlobe /> : <IconTopic topic={icon.topic} />}
    </span>
  );
}

/**
 * Marqueur de langue devant un titre : drapeau, ou globe pour une région.
 *
 * Rend `null` quand le libellé ne porte aucune langue reconnue — une absence est
 * une information, il ne faut pas la combler par un symbole neutre.
 */
export function LanguageMark({ tag }: { tag: LanguageTag | null }) {
  if (!tag) return null;
  if (tag.flag) {
    return (
      <span className="flag" title={tag.label} aria-label={tag.label}>
        {tag.flag}
      </span>
    );
  }
  return (
    <span className="mark" title={tag.label} aria-label={tag.label}>
      <IconGlobe />
    </span>
  );
}
