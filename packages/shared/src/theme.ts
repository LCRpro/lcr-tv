/**
 * La palette, une fois pour les deux clients.
 *
 * Elle vivait deux fois : en propriétés CSS dans `web/app/styles/01-socle.css`,
 * et recopiée à la main dans `mobile/lib/theme.ts`. Les deux ont dérivé sans
 * que rien ne le signale — le mobile est resté sur l'accent cyan et le fond
 * bleu froid que le web a abandonnés, tout en portant un commentaire affirmant
 * que les valeurs étaient les mêmes. Un même produit ressemblait à deux
 * applications.
 *
 * Ce fichier est désormais la source. Le mobile l'importe directement ; le web
 * garde ses propriétés CSS, que `pnpm --filter web theme` compare à ces
 * valeurs — une divergence échoue au lieu de passer inaperçue.
 *
 * ---------------------------------------------------------------- la règle
 *
 * Le contenu porte la couleur, la coquille porte le contraste. Ce qui est
 * sélectionné ne change pas de teinte, il change de valeur : l'encre et le
 * papier s'inversent. Il ne reste donc que deux teintes dans toute
 * l'application, et chacune veut dire une chose — le rouge, et rien d'autre,
 * veut dire « ça passe en ce moment » ; le laiton signale ce qui appelle
 * l'œil, la note d'une œuvre et l'anneau de focus au clavier.
 */

/** Un jeu complet de couleurs : il en existe un par thème. */
export interface Palette {
  bg: string;
  bgSoft: string;
  elevated: string;
  hover: string;
  border: string;
  borderStrong: string;
  text: string;
  dim: string;
  faint: string;
  /** L'accent n'est pas une teinte : c'est l'inversion encre/papier. */
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentLine: string;
  onAccent: string;
  /** Le direct, et rien d'autre. */
  live: string;
  liveSoft: string;
  /** Les notes, et l'anneau de focus. */
  gold: string;
  ok: string;
  warn: string;
}

/**
 * Les neutres tirent vers le chaud, et non vers le bleu.
 *
 * Un gris bleuté est le fond par défaut de toutes les applications de
 * télévision ; un gris chaud se choisit, et surtout il accueille mieux des
 * affiches qui sont chaudes.
 */
export const LIGHT: Palette = {
  bg: '#f7f5f2',
  bgSoft: '#efece7',
  elevated: '#ffffff',
  hover: '#e8e4dd',
  border: '#e0dbd3',
  /* La bordure forte tient 3:1 sur les deux fonds clairs : c'est une mesure,
     pas un réglage à l'œil. */
  borderStrong: '#938c81',
  text: '#1c1a17',
  dim: '#6b655c',
  faint: '#8c867c',
  accent: '#1c1a17',
  accentHover: '#000000',
  accentSoft: 'rgba(28, 26, 23, 0.08)',
  accentLine: 'rgba(28, 26, 23, 0.28)',
  onAccent: '#f7f5f2',
  live: '#c8322f',
  liveSoft: 'rgba(200, 50, 47, 0.12)',
  gold: '#9a6b12',
  ok: '#2f6d4a',
  warn: '#8a6112',
};

/**
 * « Nuit indigo » — la charte sombre de tout le produit.
 *
 * Site web, application mobile et téléviseur la partagent : un seul endroit
 * décide des couleurs du mode sombre. La règle ne change pas — l'affiche porte
 * la teinte, la coquille porte le contraste — mais ici la coquille n'est plus
 * neutre : le fond tire vers un bleu de nuit, et l'accent est un périvenche
 * électrique. L'accent devient donc une vraie teinte (le bouton de lecture, la
 * puce active, l'anneau de focus), là où un sombre neutre n'inversait que
 * l'encre et le papier. Le rouge reste le direct, le laiton reste la note : ces
 * deux-là ne bougent pas. Le web garde en plus un thème clair, `LIGHT`.
 *
 * `onAccent` est sombre, parce que le périvenche est clair : une encre foncée
 * s'y lit mieux qu'un blanc qui tomberait sous le seuil.
 */
export const INDIGO: Palette = {
  bg: '#0d0e16',
  bgSoft: '#14161f',
  elevated: '#1b1e2a',
  hover: '#232738',
  border: '#272b3a',
  borderStrong: '#6a7091',
  text: '#eef0f7',
  dim: '#9aa0b5',
  faint: '#686d84',
  accent: '#8b93ff',
  accentHover: '#a7adff',
  accentSoft: 'rgba(139, 147, 255, 0.14)',
  accentLine: 'rgba(139, 147, 255, 0.34)',
  onAccent: '#0d0e16',
  live: '#ff5a5f',
  liveSoft: 'rgba(255, 90, 95, 0.16)',
  gold: '#f3c969',
  ok: '#54b98c',
  warn: '#f0a93b',
};

/**
 * Ce qui se pose sur une image, et non sur le papier de l'application.
 *
 * Le fond n'est alors pas le thème mais le visuel, et l'encre reste claire
 * dans les deux cas : ces valeurs ne sont donc pas redéfinies par thème.
 */
export const ON_ART = {
  /** L'encre sur un visuel. */
  ink: '#ffffff',
  /** Le voile posé sur un visuel pour y écrire. */
  scrim: 'rgba(0, 0, 0, 0.55)',
  /**
   * La plaque des logos de chaînes et de catégories.
   *
   * Elle était blanche : la moitié des logos du fournisseur sont des PNG
   * blancs sur fond transparent — DAZN, Disney+, ESPN+, Apple TV, Arte — et
   * disparaissaient entièrement. Mesuré sur le catalogue réel : sur fond
   * sombre, tous se lisent, à condition d'un halo clair qui détoure ceux qui
   * sont sombres.
   */
  plaque: '#1b1a18',
} as const;

/**
 * L'échelle des espacements.
 *
 * Avant, vingt-neuf espacements distincts : la signature du réglage à l'œil,
 * valeur par valeur, jusqu'à ce que ça tombe juste. Huit pas suffisent, et deux
 * éléments réglés séparément retombent alors d'accord sans qu'on s'en occupe.
 */
export const SPACE = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const RADIUS = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

/**
 * L'échelle de tailles de texte, en pixels.
 *
 * Le mobile s'en sert telle quelle ; le téléviseur la multiplie (voir
 * `mobile/lib/tv.ts`). Le web la porte en propriétés CSS.
 */
export const TEXT = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  display: 36,
} as const;
