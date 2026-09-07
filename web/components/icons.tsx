/**
 * Jeu d'icônes du lecteur.
 *
 * Des tracés plutôt que des caractères : « ▶ » et « ⏸ » n'ont pas le même
 * dessin d'une police à l'autre, ne s'alignent pas entre eux et ne suivent pas
 * la couleur du texte de façon fiable. Ici tout est en `currentColor` et cadré
 * dans la même grille de 24, donc les boutons se posent au pixel près.
 */
interface IconProps {
  size?: number;
}

function svg(path: React.ReactNode, size: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {path}
    </svg>
  );
}

export function IconPlay({ size = 20 }: IconProps) {
  return svg(<path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor" stroke="none" />, size);
}

export function IconPause({ size = 20 }: IconProps) {
  return svg(
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    </>,
    size,
  );
}

/** Recul / avance de 10 s : la flèche circulaire, avec le chiffre au centre. */
export function IconRewind({ size = 20 }: IconProps) {
  return svg(
    <>
      <path d="M3.5 8.5V4M3.5 8.5H8" />
      <path d="M3.9 8.7A8.5 8.5 0 1 1 3.5 13" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="7.6"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </>,
    size,
  );
}

export function IconForward({ size = 20 }: IconProps) {
  return svg(
    <>
      <path d="M20.5 8.5V4M20.5 8.5H16" />
      <path d="M20.1 8.7A8.5 8.5 0 1 0 20.5 13" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="7.6"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </>,
    size,
  );
}

export function IconVolume({ size = 20, level }: IconProps & { level: 'muted' | 'low' | 'high' }) {
  return svg(
    <>
      <path
        d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.4}
      />
      {level === 'muted' ? (
        <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
      ) : (
        <>
          <path d="M15 9.6a3.6 3.6 0 0 1 0 4.8" />
          {level === 'high' && <path d="M17.8 7.2a7.4 7.4 0 0 1 0 9.6" />}
        </>
      )}
    </>,
    size,
  );
}

export function IconFullscreen({ size = 20, exit }: IconProps & { exit?: boolean }) {
  return svg(
    exit ? (
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    ) : (
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    ),
    size,
  );
}

export function IconPip({ size = 20 }: IconProps) {
  return svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <rect x="12" y="12" width="7" height="5.2" rx="1.2" fill="currentColor" stroke="none" />
    </>,
    size,
  );
}

/**
 * Proportions : un cadre, et les quatre coins d'un recadrage à l'intérieur.
 *
 * C'est le dessin que les téléviseurs mettent sur cette touche depuis toujours
 * — le reconnaître dispense de lire le libellé.
 */
export function IconAspect({ size = 20 }: IconProps) {
  return svg(
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M7 9V8.5h1.6M17 9V8.5h-1.6M7 15v.5h1.6M17 15v.5h-1.6" />
    </>,
    size,
  );
}

/** Réglages : la roue dentée classique, sous laquelle se range le choix de qualité. */
export function IconSettings({ size = 20 }: IconProps) {
  return svg(
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z" />
    </>,
    size,
  );
}

export function IconBack({ size = 18 }: IconProps) {
  return svg(<path d="M15 5l-7 7 7 7" />, size);
}

export function IconCheck({ size = 16 }: IconProps) {
  return svg(<path d="M4.5 12.5l5 5 10-11" />, size);
}
