/**
 * Reconnaissance du marqueur de langue dans les libelles du fournisseur.
 *
 * Les panels prefixent presque tout : `EN - Where Is Your Faith - 2026`,
 * `VOD | AR - LATEST MOVIES`, `SRS | ARABIC [ASIA]`. Ce code est utile mais
 * illisible en grille ; on le remplace par un drapeau et on l'enleve du titre.
 *
 * Regle de prudence : on ne transforme que les codes **reconnus**. Un titre qui
 * commence par autre chose (`01 - The Shawshank Redemption`, `#1 Cheerleader
 * Camp`) est laisse strictement intact, faute de quoi on amputerait des titres.
 */

interface Entry {
  /** Code pays ISO 3166-1 alpha-2, d'ou le drapeau est derive. */
  country?: string;
  label: string;
}

/**
 * Un drapeau emoji est la paire d'indicateurs regionaux du code pays. On le
 * calcule plutot que de l'ecrire en dur : pas de caractere exotique en source,
 * et impossible de se tromper de sequence.
 */
function flagOf(country: string): string {
  const BASE = 0x1f1e6;
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((c) => BASE + c.charCodeAt(0) - 65),
  );
}

const CODES: Record<string, Entry> = {
  // Codes courts
  FR: { country: 'FR', label: 'Français' },
  VF: { country: 'FR', label: 'Version française' },
  VFF: { country: 'FR', label: 'Version française' },
  VOSTFR: { country: 'FR', label: 'Sous-titré français' },
  EN: { country: 'GB', label: 'Anglais' },
  UK: { country: 'GB', label: 'Anglais' },
  US: { country: 'US', label: 'Anglais (US)' },
  CA: { country: 'CA', label: 'Canada' },
  AR: { country: 'SA', label: 'Arabe' },
  EAR: { country: 'SA', label: 'Anglais / arabe' },
  ES: { country: 'ES', label: 'Espagnol' },
  LAT: { country: 'MX', label: 'Espagnol latino' },
  PT: { country: 'PT', label: 'Portugais' },
  BR: { country: 'BR', label: 'Brésilien' },
  DE: { country: 'DE', label: 'Allemand' },
  AT: { country: 'AT', label: 'Autrichien' },
  CH: { country: 'CH', label: 'Suisse' },
  IT: { country: 'IT', label: 'Italien' },
  NL: { country: 'NL', label: 'Néerlandais' },
  BE: { country: 'BE', label: 'Belge' },
  TR: { country: 'TR', label: 'Turc' },
  RU: { country: 'RU', label: 'Russe' },
  UA: { country: 'UA', label: 'Ukrainien' },
  PL: { country: 'PL', label: 'Polonais' },
  RO: { country: 'RO', label: 'Roumain' },
  BG: { country: 'BG', label: 'Bulgare' },
  GR: { country: 'GR', label: 'Grec' },
  AL: { country: 'AL', label: 'Albanais' },
  ALB: { country: 'AL', label: 'Albanais' },
  SE: { country: 'SE', label: 'Suédois' },
  SW: { country: 'SE', label: 'Suédois' },
  NO: { country: 'NO', label: 'Norvégien' },
  DK: { country: 'DK', label: 'Danois' },
  FI: { country: 'FI', label: 'Finnois' },
  IS: { country: 'IS', label: 'Islandais' },
  CZ: { country: 'CZ', label: 'Tchèque' },
  SK: { country: 'SK', label: 'Slovaque' },
  HU: { country: 'HU', label: 'Hongrois' },
  HR: { country: 'HR', label: 'Croate' },
  RS: { country: 'RS', label: 'Serbe' },
  IN: { country: 'IN', label: 'Indien' },
  PK: { country: 'PK', label: 'Pakistanais' },
  BD: { country: 'BD', label: 'Bengali' },
  IR: { country: 'IR', label: 'Persan' },
  IL: { country: 'IL', label: 'Hébreu' },
  JP: { country: 'JP', label: 'Japonais' },
  KR: { country: 'KR', label: 'Coréen' },
  CN: { country: 'CN', label: 'Chinois' },
  TH: { country: 'TH', label: 'Thaï' },
  VN: { country: 'VN', label: 'Vietnamien' },
  ID: { country: 'ID', label: 'Indonésien' },
  PH: { country: 'PH', label: 'Philippin' },
  MA: { country: 'MA', label: 'Maroc' },
  DZ: { country: 'DZ', label: 'Algérie' },
  TN: { country: 'TN', label: 'Tunisie' },
  EG: { country: 'EG', label: 'Égypte' },
  SO: { country: 'SO', label: 'Somali' },
  NG: { country: 'NG', label: 'Nigeria' },
  ZA: { country: 'ZA', label: 'Afrique du Sud' },
  AU: { country: 'AU', label: 'Australie' },
  ML: { country: 'ML', label: 'Mali' },
  SN: { country: 'SN', label: 'Sénégal' },
  CI: { country: 'CI', label: "Côte d'Ivoire" },
  CM: { country: 'CM', label: 'Cameroun' },
  UG: { country: 'UG', label: 'Ouganda' },
  CY: { country: 'CY', label: 'Chypre' },
  EE: { country: 'EE', label: 'Estonien' },
  LV: { country: 'LV', label: 'Letton' },
  LT: { country: 'LT', label: 'Lituanien' },
  GE: { country: 'GE', label: 'Géorgien' },
  // `AM` designe deja les Ameriques dans les prefixes du fournisseur : la cle
  // interne differe du code pays, dont seul le drapeau est tire.
  ARM: { country: 'AM', label: 'Arménien' },
  IE: { country: 'IE', label: 'Irlande' },
  MT: { country: 'MT', label: 'Malte' },
  SI: { country: 'SI', label: 'Slovène' },
  SG: { country: 'SG', label: 'Singapour' },
  MY: { country: 'MY', label: 'Malaisien' },
  KH: { country: 'KH', label: 'Cambodgien' },
  KZ: { country: 'KZ', label: 'Kazakh' },
  NZ: { country: 'NZ', label: 'Nouvelle-Zélande' },
  AZ: { country: 'AZ', label: 'Azerbaïdjanais' },
  QA: { country: 'QA', label: 'Qatar' },

  // Marqueurs regionaux, sans pays associe
  AF: { label: 'Afrique' },
  AM: { label: 'Amériques' },
  ASIA: { label: 'Asie' },
  EX: { label: 'Ex-Yougoslavie' },
  EXYU: { label: 'Ex-Yougoslavie' },
  MULTI: { label: 'Multilingue' },
  MULTISUB: { label: 'Multilingue' },
  INT: { label: 'International' },
  // Le kurde et le nordique n'ont pas de pays : le fournisseur les traite
  // pourtant comme des langues a part entiere, avec leurs propres categories.
  KU: { label: 'Kurde' },
  SC: { label: 'Nordique' },
};

/** Noms de langue ecrits en toutes lettres, frequents dans les categories. */
const WORDS: Record<string, string> = {
  FRENCH: 'FR',
  FRANCE: 'FR',
  ENGLISH: 'EN',
  ARABIC: 'AR',
  SPANISH: 'ES',
  SPAIN: 'ES',
  LATINO: 'LAT',
  PORTUGUESE: 'PT',
  PORTUGAL: 'PT',
  BRAZIL: 'BR',
  GERMAN: 'DE',
  GERMANY: 'DE',
  ITALIAN: 'IT',
  ITALY: 'IT',
  DUTCH: 'NL',
  TURKISH: 'TR',
  TURKEY: 'TR',
  RUSSIAN: 'RU',
  POLISH: 'PL',
  POLAND: 'PL',
  ROMANIAN: 'RO',
  ROMANIA: 'RO',
  GREEK: 'GR',
  GREECE: 'GR',
  ALBANIAN: 'AL',
  ALBANIA: 'AL',
  SWEDISH: 'SE',
  SWEDEN: 'SE',
  NORWAY: 'NO',
  DENMARK: 'DK',
  FINLAND: 'FI',
  INDIA: 'IN',
  HINDI: 'IN',
  PAKISTAN: 'PK',
  JAPANESE: 'JP',
  JAPAN: 'JP',
  KOREAN: 'KR',
  KOREA: 'KR',
  CHINESE: 'CN',
  CHINA: 'CN',
  SOMALIA: 'SO',
  NIGERIA: 'NG',
  CAMEROON: 'CM',
  SENEGAL: 'SN',
  COTEDIVOIRE: 'CI',
  UGANDA: 'UG',
  MALI: 'ML',
  AFRICA: 'AF',
  ASIA: 'ASIA',

  // Europe
  CYPRUS: 'CY',
  CZECH: 'CZ',
  CZECHREPUBLIC: 'CZ',
  ESTONIA: 'EE',
  ESTONIAN: 'EE',
  LATVIA: 'LV',
  LATVIAN: 'LV',
  LITHUANIA: 'LT',
  LITHUANIAN: 'LT',
  GEORGIA: 'GE',
  ARMENIA: 'ARM',
  IRELAND: 'IE',
  MALTA: 'MT',
  BELGIUM: 'BE',
  AUSTRIA: 'AT',
  SWISS: 'CH',
  SWITZERLAND: 'CH',
  BULGARIA: 'BG',
  BULGARIAN: 'BG',
  SLOVAKIA: 'SK',
  SLOVAK: 'SK',
  SLOVENIA: 'SI',
  HUNGARY: 'HU',
  HUNGARIA: 'HU',
  HUNGARIAN: 'HU',
  ICELAND: 'IS',
  // Siminn est l'operateur islandais : ses bouquets sont ranges avec l'Islande.
  SIMINN: 'IS',
  UKRAINE: 'UA',
  UKRAIN: 'UA',
  UKRAINIAN: 'UA',
  CROATIA: 'HR',
  CROATIAN: 'HR',
  HRVATSKA: 'HR',
  SERBIA: 'RS',
  SRBIJA: 'RS',
  RUSSIA: 'RU',
  NETHERLAND: 'NL',
  NETHERLANDS: 'NL',
  HOLLAND: 'NL',
  DEUTSCH: 'DE',
  FINNISH: 'FI',
  DANISH: 'DK',
  NORWEGIAN: 'NO',
  NORDIC: 'SC',
  AZERBAIJAN: 'AZ',

  // Asie et Moyen-Orient
  THAILAND: 'TH',
  PHILIPPINES: 'PH',
  INDONESIA: 'ID',
  MALAYSIA: 'MY',
  VIETNAM: 'VN',
  CAMBODIA: 'KH',
  SINGAPORE: 'SG',
  KAZAHKSTAN: 'KZ',
  KAZAKHSTAN: 'KZ',
  IRAN: 'IR',
  PERSIAN: 'IR',
  HEBREW: 'IL',
  ISRAEL: 'IL',
  KURDISH: 'KU',
  KURDISTAN: 'KU',
  // Les vingt et une categories « RAMADAN … » du fournisseur sont des series
  // arabes, rangees par annee et par region : c'est bien une langue.
  RAMADAN: 'AR',

  /*
   * Langues regionales de l'Inde et du Bangladesh. Le fournisseur leur consacre
   * une categorie chacune ; les ranger sous leur pays vaut mieux que de les
   * laisser sans repere.
   */
  /*
   * Abréviations du fournisseur, relevées dans le catalogue et non devinées.
   * « SIN » porte des marqueurs « [Telugu] » et « [Malayalam] » dans ses titres :
   * c'est South INdian, pas le Sinhala. « KO » et « SOM » complètent les noms
   * en toutes lettres déjà présents plus haut, que le fournisseur abrège.
   */
  SIN: 'IN',
  PUN: 'IN',
  KO: 'KR',
  SOM: 'SO',
  INDIAN: 'IN',
  BOLLYWOOD: 'IN',
  SOUTHINDIAN: 'IN',
  PUNJABI: 'IN',
  BHOJPURI: 'IN',
  TAMIL: 'IN',
  TELUGU: 'IN',
  GUJARATI: 'IN',
  MARATHI: 'IN',
  KANNADA: 'IN',
  MALAYALAM: 'IN',
  ODIA: 'IN',
  BANGLA: 'BD',
  BENGALI: 'BD',

  // Oceanie
  AUSTRALIA: 'AU',
  NEWZEALAND: 'NZ',
};

export interface LanguageTag {
  code: string;
  /**
   * Drapeau emoji, ou nul pour un marqueur régional — « Afrique », « Asie »,
   * « Multilingue » ne désignent aucun pays. Le front y dessine une icône de
   * globe : emprunter l'emoji 🌍 mêlerait deux registres graphiques dans une
   * même liste, l'un dessiné par nous, l'autre par le système.
   */
  flag: string | null;
  label: string;
}

function tagFor(rawCode: string): LanguageTag | null {
  const key = rawCode.toUpperCase().replace(/[^A-Z]/g, '');
  const code = WORDS[key] ?? key;
  const entry = CODES[code];
  if (!entry) return null;
  return {
    code,
    flag: entry.country ? flagOf(entry.country) : null,
    label: entry.label,
  };
}

/**
 * Le libellé et le drapeau d'un code du fournisseur, ou null s'il est inconnu.
 *
 * Le sélecteur de langues d'un profil en a besoin : il liste les codes que le
 * catalogue contient réellement, et doit les présenter en français plutôt
 * qu'en jargon — « Allemand » et non « DE ».
 */
export function languageTag(code: string): LanguageTag | null {
  return tagFor(code);
}

/**
 * Sépare le marqueur de langue du libellé.
 *
 * Accepte les deux formes rencontrées :
 *   `EN - Titre`            -> tag EN, titre « Titre »
 *   `VOD | AR - LATEST`     -> tag AR, titre « LATEST »
 *   `SRS | ARABIC [ASIA]`   -> tag AR, titre « ARABIC [ASIA] »
 *
 * Un libellé non reconnu ressort inchangé, avec `tag: null`.
 */
/**
 * Retire les décorations que les fournisseurs mettent autour de certains
 * libellés : `##### DAZN EVENEMENT PPV #####`, `=== SPORT ===`, `**• FOOT •**`.
 *
 * Ce ne sont pas toujours de fausses entrées — certaines sont de vraies chaînes
 * événementielles avec une grille — donc on nettoie l'affichage plutôt que de
 * les masquer.
 */
export function stripDecorations(label: string): string {
  const out = label
    .replace(/^[\s#*=~•·_+<>|-]{2,}/, '')
    .replace(/[\s#*=~•·_+<>|-]{2,}$/, '')
    .trim();
  // Un libellé entièrement décoratif ne doit pas disparaître.
  return out.length >= 2 ? out : label.trim();
}

export function splitLanguage(name: string): { tag: LanguageTag | null; title: string } {
  // Les libellés empilent parfois plusieurs segments : `AM | CA | DAZN PPV`.
  // Le dernier porte le sens, les précédents qualifient de plus en plus large.
  // Les décorations sont retirées avant toute analyse : sinon `#### AR - AL MAJD ####`
  // ne laisserait pas reconnaître son préfixe de langue.
  const segments = name
    .split('|')
    .map((s) => stripDecorations(s))
    .filter(Boolean);

  if (segments.length === 0) return { tag: null, title: name.trim() };

  const last = segments.length - 1;
  let title = stripDecorations(segments[last]!);

  // On cherche du plus précis au plus général : dans `AM | CA | …`, `CA` prime.
  for (let i = last; i >= 0; i -= 1) {
    const segment = segments[i]!;

    // Forme « CODE - reste ».
    const dashed = /^([A-Za-z]{2,8})\s*[-–]\s*(.+)$/.exec(segment);
    if (dashed) {
      const tag = tagFor(dashed[1]!);
      if (tag) {
        // Le code n'est retiré que du segment qui le portait.
        if (i === last) title = stripDecorations(dashed[2]!);
        return { tag, title };
      }
    }

    // Code entre crochets en fin de segment : `FILMAT SHQIPTAR [ALB]`,
    // `MALAYSIA [MY]`, `KURDISH MOVIES (BADINI) [KU]`. C'est le marqueur le plus
    // explicite du fournisseur, il prime sur le texte qui le précède.
    const bracketed = /\[([A-Za-z]{2,8})\]\s*$/.exec(segment);
    if (bracketed) {
      const tag = tagFor(bracketed[1]!);
      if (tag) return { tag, title };
    }

    // Segment entièrement reconnu : `CA`, `AF`, `SENEGAL`, mais aussi les noms
    // en deux mots — `CZECH REPUBLIC`, `NEW ZEALAND`. `tagFor` ne garde que les
    // lettres, l'espace ne gêne donc pas la correspondance.
    // Le libellé affiché reste le dernier segment, qui est le plus parlant.
    if (/^[A-Za-z][A-Za-z ]{1,23}$/.test(segment)) {
      const tag = tagFor(segment);
      if (tag) return { tag, title };
    }

    // Forme « LANGUE … » en toutes lettres, typique des catégories.
    const firstWord = /^([A-Za-z]{3,12})\b/.exec(segment);
    if (firstWord) {
      const tag = tagFor(firstWord[1]!);
      if (tag) return { tag, title };
    }
  }

  return { tag: null, title };
}

/*
 * Repères pour les catégories qui ne relèvent d'aucune langue.
 *
 * Le fournisseur range aussi par thème : `VIP | PREMIER LEAGUE`,
 * `VIP | FORMULA 1`, `VOD | IMDB TOP 500`. Leur coller un drapeau serait faux —
 * la Premier League n'est pas plus anglaise qu'un catalogue Netflix n'est
 * américain — mais les laisser nues casse l'alignement d'une liste où toutes
 * les autres lignes commencent par une icône.
 *
 * La table reste courte volontairement : au-delà, on invente des symboles pour
 * des libellés qu'on n'a pas lus.
 */
/**
 * Thèmes reconnus. La valeur est une **clé**, pas un glyphe : c'est le front qui
 * dessine, avec le même jeu de tracés que le reste de l'interface. Un emoji
 * n'aurait ni la graisse, ni la couleur, ni la taille des autres icônes, et
 * dépendrait d'une police que le système peut ne pas avoir.
 */
export type TopicKey =
  | 'football'
  | 'motorsport'
  | 'cricket'
  | 'sport'
  | 'christmas'
  | 'music'
  | 'comedy'
  | 'cinema'
  | 'screen';

const TOPICS: Array<[RegExp, TopicKey, string]> = [
  [/champions league|europa league|premier league|la liga|ligue 1|serie a|bundesliga|liga portugal|world cup|football|foot\b/i, 'football', 'Football'],
  [/formula\s*1|\bf1\b/i, 'motorsport', 'Formule 1'],
  [/cricket/i, 'cricket', 'Cricket'],
  [/sport/i, 'sport', 'Sport'],
  [/christmas|no[eë]l/i, 'christmas', 'Noël'],
  [/music|concert/i, 'music', 'Musique'],
  [/comedy|humor|humour/i, 'comedy', 'Humour'],
  [/imdb|top \d|movies?|cin[eé]ma/i, 'cinema', 'Cinéma'],
];

/**
 * Ce qu'une catégorie affiche à gauche de son nom.
 *
 * Trois cas seulement : un drapeau quand la langue désigne un pays, un thème
 * quand le libellé n'est pas une langue, un globe pour le reste — un marqueur
 * régional, ou un libellé qu'on n'a pas su lire.
 */
export type CategoryIcon =
  | { kind: 'flag'; flag: string; label: string }
  | { kind: 'topic'; topic: TopicKey; label: string }
  | { kind: 'globe'; label: string };

/**
 * Icône d'une catégorie : son drapeau de langue, sinon son thème.
 *
 * Réservé aux listes de catégories. Ailleurs — cartes, fiches — seul le drapeau
 * a un sens, et une absence de drapeau est une information en soi.
 */
export function categoryIcon(
  name: string,
  languageCode?: string | null,
  options?: {
    /**
     * Le thème avant le drapeau.
     *
     * Là où la langue est déjà dite — l'accueil, qui ne montre que celles du
     * profil et écrit les autres en toutes lettres — un drapeau ne distingue
     * plus rien : « Sport », « Cinéma » et « Général » portaient le même. Le
     * thème, lui, dit ce qu'on va y trouver.
     */
    topicFirst?: boolean;
  },
): CategoryIcon {
  const { tag: parsed, title } = splitLanguage(name);
  // Le contenu prime sur l'étiquette : « EU | FR | UFC INTERNATIONAL » annonce
  // du français alors que toutes ses chaînes sont américaines.
  const tag = (languageCode ? tagFor(languageCode) : null) ?? parsed;

  const topic = (): CategoryIcon | null => {
    for (const [pattern, key, label] of TOPICS) {
      if (pattern.test(title)) return { kind: 'topic', topic: key, label };
    }
    return null;
  };

  if (options?.topicFirst) {
    const found = topic();
    if (found) return found;
  }

  if (tag?.flag) return { kind: 'flag', flag: tag.flag, label: tag.label };
  if (tag) return { kind: 'globe', label: tag.label };

  return topic() ?? { kind: 'topic', topic: 'screen', label: 'Autre' };
}

/**
 * Rang d'affichage d'un libellé : le français d'abord.
 *
 * Doit rester le pendant exact de `public.lang_rank` côté base, à une nuance
 * près — les catégories empilent plusieurs segments (`EU | FR | CANAL+ SPORTS`)
 * là où un nom de chaîne n'en a qu'un, et `splitLanguage` sait déjà lire les
 * deux formes. C'est donc lui qui décide ici, comme il décide du drapeau
 * affiché à côté : l'ordre et le drapeau ne peuvent pas se contredire.
 */
/**
 * Les codes qui désignent une même langue chez le fournisseur.
 *
 * Il n'en emploie pas un par langue mais un par **marché** : l'anglais arrive
 * sous `EN`, `US`, `UK`, `AU`, `IE`, `NZ` et `ENGLISH`. Choisir « Anglais »
 * ne ramenait donc que les 60 578 entrées estampillées `EN`, et les 11 960 de
 * `US` restaient rangées avec le turc et le bulgare.
 *
 * Chaque famille ci-dessous a été vérifiée présente dans le catalogue réel, et
 * chacune s'appuie sur ce que la table des libellés dit déjà — `UK` et `EN` y
 * portent tous deux « Anglais », `AL` et `ALB` « Albanais », `SE` et `SW`
 * « Suédois ». On ne regroupe pas plus loin : `CA` est bilingue et `BR` porte
 * son propre libellé, les fondre serait ramener du contenu qui n'est pas dans
 * la langue demandée.
 *
 * Le premier code de chaque liste est le représentant : c'est lui que le profil
 * enregistre et que le sélecteur propose.
 */
const FAMILIES: readonly (readonly string[])[] = [
  ['FR', 'VF', 'VFF', 'VFQ', 'TRUEFRENCH', 'FRENCH', 'VOSTFR'],
  ['EN', 'ENG', 'ENGLISH', 'UK', 'US', 'AU', 'IE', 'NZ'],
  ['ES', 'SPA', 'LAT'],
  ['AL', 'ALB'],
  ['SE', 'SW'],
];

/** Code -> sa famille. Construit une fois : la table ne bouge pas. */
const FAMILY_OF = new Map<string, readonly string[]>(
  FAMILIES.flatMap((family) => family.map((code) => [code, family] as const)),
);

/**
 * Toutes les façons dont le fournisseur écrit cette langue, la première d'abord.
 *
 * Répond aussi bien pour le représentant que pour n'importe quel membre : un
 * profil qui aurait enregistré `US` obtient la famille entière, comme s'il
 * avait choisi `EN`.
 */
export function languageSpellings(code: string): readonly string[] {
  const key = code.toUpperCase();
  return FAMILY_OF.get(key) ?? [key];
}

/**
 * Le représentant de la famille d'un code — `US` donne `EN`, `ALB` donne `AL`.
 *
 * C'est ce qui permet de n'offrir qu'une entrée « Anglais » dans le sélecteur
 * au lieu de sept, et d'y additionner les volumes de toutes ses orthographes.
 */
export function canonicalLanguage(code: string): string {
  const key = code.toUpperCase();
  return FAMILY_OF.get(key)?.[0] ?? key;
}

/** Langue retenue par défaut, quand un profil n'a rien choisi. */
export const DEFAULT_LANGUAGES = ['FR'] as const;

/**
 * Les langues dans lesquelles l'interface existe.
 *
 * Distincte des langues du catalogue : celles-là ordonnent des dizaines de
 * milliers d'entrées et le fournisseur en publie 127, celle-ci demande deux
 * cents traductions écrites à la main. Un profil peut donc très bien classer
 * son catalogue en italien et garder des boutons en français — c'est même le
 * seul choix raisonnable tant que l'italien n'est pas traduit.
 *
 * Partagée pour que la validation du serveur et le sélecteur du front ne
 * puissent pas diverger.
 */
export const UI_LOCALES = ['FR', 'EN', 'DE', 'ES'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/**
 * L'ordre de préférence, à plat.
 *
 * Les langues du profil dans l'ordre choisi, chacune avec ses orthographes,
 * puis `MULTI` — une piste multilingue contient très probablement celle qu'on
 * veut, mais elle ne vaut pas une version dans la langue demandée.
 */
export function preferredCodes(languages?: readonly string[] | null): string[] {
  const chosen = languages?.length ? languages : DEFAULT_LANGUAGES;
  const out: string[] = [];
  for (const code of chosen) {
    for (const spelling of languageSpellings(code)) {
      if (!out.includes(spelling)) out.push(spelling);
    }
  }
  if (!out.includes('MULTI')) out.push('MULTI');
  return out;
}

/**
 * Rang d'un libellé selon les langues mises en avant par le profil.
 *
 * Zéro pour la première langue choisie, un pour la deuxième, et ainsi de suite ;
 * tout le reste tombe au même rang, loin derrière. C'était figé sur le français
 * — le bon défaut pour ce foyer, mais un défaut écrit dans le code plutôt qu'un
 * choix. Sans argument, le comportement d'avant est conservé.
 */
export function languageRank(
  name: string,
  languageCode?: string | null,
  languages?: readonly string[] | null,
): number {
  const code = (languageCode ? tagFor(languageCode)?.code : null) ?? splitLanguage(name).tag?.code;
  if (!code) return 99;
  /*
   * Le rang porte sur la **langue**, pas sur l'orthographe.
   *
   * « FR », « VF » et « VOSTFR » sont trois écritures du français et doivent
   * peser pareil ici : ce rang sert à grouper des catégories, pas à départager
   * deux déclinaisons d'un même film. Ce départage-là vit dans
   * `preferredCodes`, où l'ordre fin compte.
   */
  const chosen = languages?.length ? languages : DEFAULT_LANGUAGES;
  for (let i = 0; i < chosen.length; i += 1) {
    if (languageSpellings(chosen[i]!).includes(code)) return i;
  }
  // Une piste multilingue passe après les langues choisies, avant les autres.
  return code === 'MULTI' ? chosen.length : 99;
}

// --------------------------------------------------------------- variantes

/** Qualités reconnues, de la meilleure à la moins bonne. */
export const QUALITIES = ['4K', 'FHD', 'HD', 'SD'] as const;
export type Quality = (typeof QUALITIES)[number];

const QUALITY_PATTERNS: Array<[Quality, RegExp]> = [
  ['4K', /\b(4k|uhd|2160p?)\b/i],
  ['FHD', /\b(fhd|1080p?|full ?hd)\b/i],
  ['HD', /\b(hd|720p?)\b/i],
  ['SD', /\b(sd|480p?|360p?)\b/i],
];

/** Mentions de piste ou de sous-titres, utiles pour choisir une variante. */
const TAG_PATTERNS: Array<[string, RegExp]> = [
  ['VOSTFR', /\bvostfr\b/i],
  ['VF', /\bv(f{1,2}|ost)\b/i],
  ['Multi-sub', /\bmulti[ -]?sub\b/i],
  ['Multi', /\bmulti(?![ -]?sub)\b/i],
  ['Sous-titré', /\bsub(s|bed|title[sd]?)?\b/i],
  ['Doublé', /\b(dub|dubbed|doubl[ée])\b/i],
];

export interface ParsedVariant {
  /** Langue déduite du préfixe, si reconnue. */
  tag: LanguageTag | null;
  quality: Quality | null;
  /** Mentions de piste et de sous-titres, dédoublonnées. */
  tags: string[];
  /** Titre débarrassé du préfixe de langue. */
  title: string;
}

/**
 * Décompose un libellé de variante.
 *
 * `FR - Backrooms - 2026 [VOSTFR]` donne la langue française, aucune qualité
 * explicite et la mention VOSTFR. Ce qui n'est pas reconnu reste simplement
 * absent : mieux vaut une variante peu décrite qu'une étiquette inventée.
 */
export function parseVariant(name: string): ParsedVariant {
  const { tag, title } = splitLanguage(name);

  let quality: Quality | null = null;
  for (const [value, pattern] of QUALITY_PATTERNS) {
    if (pattern.test(name)) {
      quality = value;
      break;
    }
  }

  const tags: string[] = [];
  for (const [label, pattern] of TAG_PATTERNS) {
    if (!pattern.test(name) || tags.includes(label)) continue;
    // « Sous-titré » n'apporte rien à côté de VOSTFR ou Multi-sub, qui le disent
    // déjà et plus précisément.
    if (label === 'Sous-titré' && (tags.includes('VOSTFR') || tags.includes('Multi-sub'))) {
      continue;
    }
    tags.push(label);
  }

  return { tag, quality, tags, title };
}

// ----------------------------------------------------------------- chaînes

/**
 * Marqueur de qualité en fin de nom de chaîne, tel que le fournisseur l'écrit.
 *
 * Doit rester le pendant exact de `public.channel_quality` côté base : c'est
 * elle qui décide du regroupement des chaînes, cette fonction ne fait
 * qu'afficher le résultat. Toute divergence se verrait comme une chaîne
 * étiquetée « HD » dans une grille qui l'a rangée ailleurs.
 */
const CHANNEL_QUALITY =
  /\s+[[(]?(FHD|UHD|HD|SD|HEVC|H\.?265|H\.?264|4K|8K|2160P|1080P|720P|576P|480P|ᴴᴰ)[\])]?\s*$/i;

/** Décorations que le fournisseur colle en fin de nom : « ◉ », « ² », « ᴿᴬᵂ ». */
const CHANNEL_DECOR = /\s*[◉●✦★☆¹²³⁴ᴿᴬᵂᵛᶦᵖ]+\s*$/;

/**
 * Sépare un nom de chaîne de sa qualité.
 *
 * La grille ne montre qu'une vignette par chaîne — « CANAL+ LIVE 1 » et non ses
 * quatre déclinaisons — donc afficher « FHD » sur cette vignette mentirait sur
 * ce qu'elle représente. La qualité redevient visible dans le lecteur, où elle
 * se choisit.
 */
export function splitChannelQuality(name: string): {
  title: string;
  quality: string | null;
} {
  const withoutDecor = name.replace(CHANNEL_DECOR, '');
  const match = CHANNEL_QUALITY.exec(withoutDecor);
  const quality = match
    ? match[1]!.toUpperCase().replace('ᴴᴰ', 'HD')
    : null;
  const title = (match ? withoutDecor.slice(0, match.index) : withoutDecor).trim();
  return { title: title.length >= 2 ? title : name.trim(), quality };
}

/** Nom de chaîne prêt à afficher : sans préfixe de langue, sans qualité. */
export function channelTitle(name: string): string {
  return splitChannelQuality(splitLanguage(name).title).title;
}

/** Libellé court d'une variante, pour un bouton de choix. */
export function variantLabel(name: string): string {
  const { tag, quality, tags } = parseVariant(name);
  const parts = [tag?.label ?? 'Langue inconnue', quality, ...tags].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Titre de l'œuvre, lisible.
 *
 * Retire le préfixe de langue et les mentions de déclinaison entre crochets ou
 * parenthèses, mais conserve la casse, les accents et l'année — contrairement à
 * la clé de regroupement calculée par la base, qui est normalisée et sert au
 * seul rapprochement.
 */
export function workTitle(name: string): string {
  const { title } = splitLanguage(name);
  return (
    title
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .replace(/\s{2,}/g, ' ')
      // « Capitaine - 2026 » : l'année accrochée d'un tiret n'est pas le titre,
      // et la ligne du dessous la dit déjà. Un nombre sans tiret reste — « 2012 »
      // et « Blade Runner 2049 » sont des titres.
      .replace(/\s+[-–]\s*(?:19|20)\d{2}\s*$/, '')
      .replace(/\s*[-–]\s*$/, '')
      .trim()
  );
}

/**
 * Titre d'épisode débarrassé de ce que la fiche affiche déjà.
 *
 * Le fournisseur répète tout dans chaque épisode : « FR - Outer Banks [VOSTFR]
 * - S01E01 - "Nothing to Lose" ». Le nom de la série et le numéro figurent déjà
 * à côté ; ne reste que le titre propre à l'épisode.
 *
 * Si le nettoyage ne laisse rien d'exploitable, on rend le libellé d'origine :
 * mieux vaut un titre verbeux qu'une ligne vide.
 */
export function episodeTitle(rawTitle: string, seriesName: string): string {
  const seriesForms = [seriesName, workTitle(seriesName), splitLanguage(seriesName).title]
    .map((s) => s.trim())
    .filter(Boolean);

  let out = rawTitle.trim();

  // Le nom de la série, sous n'importe laquelle de ses formes.
  for (const form of seriesForms) {
    const index = out.toLowerCase().indexOf(form.toLowerCase());
    if (index !== -1) {
      out = (out.slice(0, index) + out.slice(index + form.length)).trim();
    }
  }

  out = out
    // Marqueur de saison et d'épisode, déjà porté par la liste.
    .replace(/\bS\d{1,3}\s?E\d{1,4}\b/gi, ' ')
    // Mentions de déclinaison, déjà choisies plus haut.
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    // Préfixe de langue résiduel.
    .replace(/^\s*[A-Za-z]{2,8}\s*[-–]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    // Séparateurs orphelins laissés par les retraits.
    .replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '')
    .trim();

  return out.length >= 2 ? out : rawTitle.trim();
}
