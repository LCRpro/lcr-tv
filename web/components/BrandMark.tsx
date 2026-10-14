/**
 * La marque LCR TV — le triangle de lecture, aux couleurs du logo.
 *
 * Vectorielle, donc nette à toute taille et accordée à la charte : le dégradé
 * cyan → bleu → violet du logo, avec l'encoche de lecture en bleu de nuit. Une
 * seule source pour la barre du haut comme pour la page d'accueil publique.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lcrBrandMark" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#19b2f0" />
          <stop offset="0.5" stopColor="#2f6bf2" />
          <stop offset="1" stopColor="#7a35ec" />
        </linearGradient>
      </defs>
      <polygon
        points="15,9 15,39 41,24"
        fill="url(#lcrBrandMark)"
        stroke="url(#lcrBrandMark)"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <polygon points="23,18 23,30 33,24" fill="#080a12" />
    </svg>
  );
}
