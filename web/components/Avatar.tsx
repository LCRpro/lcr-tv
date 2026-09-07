import type { ProfileAvatar, ProfileColor } from '@iptv/shared';

/**
 * Vignette de profil : un dessin plein, pas une photo.
 *
 * Le sélecteur se regarde parfois à trois mètres, sur un téléviseur. Une photo
 * recadrée en rond y devient une tache indistincte ; une forme pleine et
 * contrastée reste reconnaissable, et se distingue de ses voisines par la
 * couleur autant que par le motif — c'est ce couple qui sert de repère, pas le
 * prénom écrit dessous.
 */
const PATHS: Record<ProfileAvatar, string> = {
  wave: 'M3 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M3 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M3 9c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3',
  star: 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z',
  bolt: 'M13.5 2.5L4.5 13.5h6l-1 8 9-11h-6z',
  moon: 'M20.5 14.8A9 9 0 0 1 9.2 3.5a9 9 0 1 0 11.3 11.3z',
  leaf: 'M4.5 19.5C3 14 6 4.5 19.5 4.5c0 12-8 15.5-13 13.5M9 15c1.5-3.5 4-5.5 7.5-6.5',
  flame: 'M12 2.5s5.5 4.4 5.5 9.4a5.5 5.5 0 0 1-11 0c0-2 1-3.5 1-3.5s.8 1.6 2 1.6C10.9 10 9 7 12 2.5z',
  ghost: 'M5 20.5V10a7 7 0 0 1 14 0v10.5l-2.3-1.8-2.3 1.8-2.4-1.8-2.4 1.8-2.3-1.8zM9.5 9.5v1.2M14.5 9.5v1.2',
  crown: 'M4 17.5h16M4.5 17.5L3 7l5 3.5L12 4l4 6.5L21 7l-1.5 10.5z',
  rocket: 'M13.5 3.5c3.6 1 6 4.4 6.5 8.5-3 2.5-6 4-9 4.5-1.5-1-2.5-2-3.5-3.5.5-3 2-6 6-9.5zM8 15.5l-3 3M11 18.5c-.5 1.5-2 2.5-4 3 .5-2 1.5-3.5 3-4M5.5 13c-1.5.5-2.5 2-3 4 2-.5 3.5-1.5 4-3',
  heart: 'M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3z',
};

/**
 * Chaque couleur a sa version foncée : la vignette est un dégradé, pas un
 * aplat, sinon dix pastilles côte à côte donnent une planche de gommettes.
 */
const RAMPS: Record<ProfileColor, [string, string]> = {
  cyan: ['#22d3ee', '#0b6f85'],
  violet: ['#a78bfa', '#5b3bb5'],
  rose: ['#fb7185', '#9f2540'],
  amber: ['#fbbf24', '#a16207'],
  emerald: ['#4ade80', '#15803d'],
  blue: ['#60a5fa', '#1d4ed8'],
};

export function Avatar({
  avatar,
  color,
  size = 96,
}: {
  avatar: ProfileAvatar;
  color: ProfileColor;
  size?: number;
}) {
  const [light, dark] = RAMPS[color] ?? RAMPS.cyan;
  // L'identifiant du dégradé doit être unique par couleur : deux <svg> partageant
  // un même id feraient toutes les vignettes prendre le premier dégradé rencontré.
  const id = `av-${color}`;
  return (
    <svg
      className="avatar"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ ['--av-glow' as string]: light }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="24" height="24" rx="7" fill={`url(#${id})`} />
      <path
        d={PATHS[avatar] ?? PATHS.wave}
        fill="none"
        stroke="rgba(6, 20, 26, 0.82)"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(12 12) scale(0.62) translate(-12 -12)"
      />
    </svg>
  );
}
