/*
 * Le relevé des traductions.
 *
 * Le français est la langue source : il est écrit dans le code, et sert de clé.
 * Une entrée manquante ne casse donc rien — elle laisse simplement une phrase
 * française au milieu d'une page anglaise, ce qui ne se voit qu'en ouvrant la
 * page dans la bonne langue. C'est exactement ce qui échappe à la relecture, et
 * ce que ce relevé cherche.
 *
 * Quatre questions, dans cet ordre :
 *
 *   1. reste-t-il du texte affiché qui ne passe pas par `t()` ?
 *   2. toutes les clés appelées existent-elles dans les trois dictionnaires ?
 *   3. un dictionnaire déclare-t-il deux fois la même clé ?
 *   4. traduire deux fois de suite change-t-il le texte ?
 *
 * La quatrième mérite un mot : les coquilles partagées (`PageHead`, `Section`)
 * traduisent le titre qu'on leur passe, et quelques pages le traduisent déjà
 * avant de le passer. Le second passage est sans effet tant qu'aucune
 * traduction n'est elle-même une clé — sinon « Films » deviendrait « Movies »
 * puis autre chose encore.
 *
 *   pnpm --filter web i18n
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'de', 'es'];

const sources = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (/\.tsx?$/.test(f) && !/[\\/]locales[\\/]/.test(f)) sources.push(f);
  }
};
for (const dir of ['app', 'components', 'lib']) walk(join(ROOT, dir));

/*
 * Seuls `app/` et `components/` affichent du texte. `lib/` n'a que des types et
 * des appels — dont `Promise<void>` et `useAsync<T>(fn, deps)`, que la recherche
 * de « texte entre deux balises » prend pour des phrases faute de savoir lire
 * du TypeScript. Ses clés `t()` restent relevées, pas sa prose.
 */
const RENDERS_TEXT = /[\\/](?:app|components)[\\/]/;

/** Un commentaire ne s'affiche pas : un exemple de doc n'est pas une clé. */
const strip = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"\n]*?)\/\/.*$/gm, '$1');

const show = (f) => relative(ROOT, f).replace(/\\/g, '/');

/* ------------------------------------------------------------------------- *
 * 2. Les clés appelées, et celles qui manquent
 * ------------------------------------------------------------------------- */

const used = new Map();
/** Les clés par fichier, dont le relevé de texte se sert pour les ternaires. */
const fileKeys = new Map();
const note = (key, file) => {
  if (!key || /^[\s\d]*$/.test(key)) return;
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(file);
  if (!fileKeys.has(file)) fileKeys.set(file, new Set());
  fileKeys.get(file).add(key);
};

for (const file of sources) {
  const src = strip(readFileSync(file, 'utf8'));

  /*
   * Tout littéral du premier argument de `t(…)`.
   *
   * Chercher la seule chaîne collée à la parenthèse ratait les pluriels, qui
   * s'écrivent `t(n > 1 ? 'x' : 'y', …)` : deux clés bien réelles que le relevé
   * déclarait traduites parce qu'il ne les voyait pas. Et la virgule doit être
   * comptée hors chaîne, sans quoi « déconnectés, mais pas celui-ci » coupe la
   * clé en deux.
   */
  for (const m of src.matchAll(/\bt\(/g)) {
    let depth = 1;
    let quote = null;
    let arg = '';
    for (let i = m.index + m[0].length; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') { arg += c + src[++i]; continue; }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 1) break;
      if (depth > 0) arg += c;
    }
    for (const s of arg.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
      note((s[1] ?? s[2]).replace(/\\(['"])/g, '$1'), file);
    }
  }

  // Les props que les coquilles traduisent elles-mêmes.
  for (const m of src.matchAll(/\b(?:title|favoriteLabel)="([^"]+)"/g)) {
    if (!/^https?:/.test(m[1])) note(m[1], file);
  }

  /*
   * Les libellés rangés dans une table, traduits plus loin par `t(row.label)`.
   *
   * Le relevé ne voit passer qu'une variable à cet endroit-là : les modes de
   * cadrage, les tranches de l'historique et les groupes de « Ma liste » lui
   * échappaient tous. Ils sont donc relevés à la source, là où ils s'écrivent.
   */
  if (RENDERS_TEXT.test(file)) {
    /*
     * Sauf le bloc `metadata` de Next : il a la même forme — `title`,
     * `description` — mais part dans le `<head>` au moment du rendu serveur,
     * avant même qu'un profil soit choisi. Il n'y a pas de langue à ce
     * moment-là, et le nom du produit n'en change pas.
     */
    const withoutMeta = src.replace(/export const metadata[\s\S]*?\n\};/, '');
    for (const m of withoutMeta.matchAll(
      /\b(?:label|note|title|description)\s*:\s*'((?:[^'\\]|\\.)*)'/g,
    )) {
      const text = m[1].replace(/\\(['"])/g, '$1');
      if (/^[a-z][a-z0-9-]*$/.test(text)) continue; // une clé technique, pas un libellé
      note(text, file);
    }
  }
  // `ResultCount` traduit le singulier et le pluriel séparément.
  for (const m of src.matchAll(/\bnoun="([^"]+)"/g)) {
    note(m[1], file);
    note(`${m[1]}s`, file);
  }
}

/* ------------------------------------------------------------------------- *
 * 1. Le texte affiché qui ne passe pas par `t()`
 * ------------------------------------------------------------------------- */

/*
 * Les attributs que l'utilisateur lit. `title`, `favoriteLabel` et `noun` sont
 * traduits par la coquille qui les reçoit : leur valeur française **est** la
 * clé, ils sont donc légitimes en littéral et vérifiés en 2 plutôt qu'ici.
 */
const TRANSLATED_BY_SHELL = /^(?:title|favoriteLabel|noun)$/;
const READABLE_ATTR =
  /\b(placeholder|title|aria-label|label|alt|description|linkLabel|favoriteLabel|noun)="([^"]{2,})"/g;
const HAS_LETTERS = /[A-Za-zÀ-ÿ]{3,}/;

/*
 * Du code, pas une phrase.
 *
 * `Promise<void>`, `>= start && now <`, `{Boolean(item.isFavorite)}` : la
 * recherche de texte entre deux chevrons les attrape tous, faute de savoir
 * lire du TypeScript. Aucun de ces caractères n'apparaît dans une phrase
 * affichée — `.` compris, tant qu'il colle à une lettre comme dans `api.get`.
 */
const LOOKS_LIKE_CODE = /[=&|;()[\]<>_]|\.\w|=>/;

/*
 * Un identifiant, pas un libellé.
 *
 * `cond ? 'card-poster wide' : 'card-poster'` a la forme d'un ternaire de
 * libellés mais choisit une classe CSS. Un texte affiché commence par une
 * majuscule ou porte un accent ; `stream`, `password` et `currentColor` n'ont
 * ni l'un ni l'autre.
 */
const looksLikeLabel = (text) => /^[A-ZÀ-Ý«]/.test(text) || /[À-ÿ]/.test(text);

/** Le nom du produit ne se traduit pas. */
const BRAND = 'LCR TV';

const untranslated = [];
for (const file of sources) {
  if (!RENDERS_TEXT.test(file)) continue;
  const src = strip(readFileSync(file, 'utf8'));
  // Les clés déjà relevées pour ce fichier : un ternaire dont les deux
  // branches en sont vient d'un `t(cond ? … : …)` sur plusieurs lignes.
  const known = fileKeys.get(file) ?? new Set();

  /** Le numéro de ligne d'une position dans le fichier. */
  const lineAt = (index) => src.slice(0, index).split('\n').length;

  /*
   * Le texte entre deux balises, sur autant de lignes qu'il en faut.
   *
   * La version précédente lisait ligne par ligne, et cherchait soit une ligne
   * entièrement faite de texte, soit un `>texte<` complet sur la même ligne.
   * `<i /> En direct` suivi de `</span>` à la ligne d'après n'est ni l'un ni
   * l'autre : le badge du direct est resté en français sur toutes les langues,
   * et le relevé annonçait « aucun manque ».
   *
   * Un texte qui passe par `t()` s'écrit `{t('…')}` : les accolades le sortent
   * de la capture d'elles-mêmes. Tout ce qui est attrapé ici est donc, par
   * construction, un littéral affiché tel quel.
   */
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{3,}[^<>{}]*)</gs)) {
    const text = m[1].trim().replace(/\s+/g, ' ');
    if (!text || text === BRAND) continue;
    if (/[,;]$/.test(text) || LOOKS_LIKE_CODE.test(text)) continue;
    // Un fragment de code qui traverse plusieurs lignes n'est pas une phrase.
    if (m[1].split('\n').length > 3) continue;
    untranslated.push({ file, n: lineAt(m.index), text });
  }

  src.split('\n').forEach((line, i) => {
    const n = i + 1;
    const already = line.includes("t('") || line.includes('t("');

    for (const m of line.matchAll(READABLE_ATTR)) {
      if (TRANSLATED_BY_SHELL.test(m[1])) continue;
      if (/^https?:/.test(m[2])) continue;
      untranslated.push({ file, n, text: `${m[1]}="${m[2]}"` });
    }

  });

  /*
   * Un ternaire de libellés, sur autant de lignes qu'il en faut.
   *
   * Il était cherché ligne à ligne. Or dès qu'un ternaire dépasse la largeur
   * d'une ligne, le formateur le coupe :
   *
   *     {categoryId === 'favorites'
   *       ? "Aucune chaîne dans vos favoris…"
   *       : 'Aucun résultat pour ce filtre.'}
   *
   * Les deux phrases sont restées françaises dans les quatre langues, et le
   * relevé annonçait « aucun manque ». C'est le troisième trou de la même
   * famille : une règle qui lit une ligne rate ce que le formateur en fait.
   */
  for (const m of src.matchAll(/\?\s*'((?:[^'\\]|\\.){3,}?)'\s*:\s*'((?:[^'\\]|\\.){3,}?)'/gs)) {
    if (known.has(m[1]) && known.has(m[2])) continue;
    if (!looksLikeLabel(m[1]) && !looksLikeLabel(m[2])) continue;
    untranslated.push({ file, n: lineAt(m.index), text: `'${m[1]}' / '${m[2]}'` });
  }
  // Le même, quand l'une des branches est entre guillemets doubles — ce que le
  // formateur fait de lui-même dès qu'une phrase contient une apostrophe.
  for (const m of src.matchAll(/\?\s*"([^"]{3,}?)"\s*:\s*'((?:[^'\\]|\\.){3,}?)'/gs)) {
    if (known.has(m[1]) && known.has(m[2])) continue;
    if (!looksLikeLabel(m[1]) && !looksLikeLabel(m[2])) continue;
    untranslated.push({ file, n: lineAt(m.index), text: `"${m[1]}" / '${m[2]}'` });
  }
}

/* ------------------------------------------------------------------------- *
 * 3 et 4. Les dictionnaires
 * ------------------------------------------------------------------------- */

const ENTRY =
  /^ {2}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)): *\n? *(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm;

const dicts = {};
const duplicates = [];
for (const l of LOCALES) {
  const src = readFileSync(join(ROOT, 'lib', 'locales', `${l}.ts`), 'utf8');
  const dict = new Map();
  for (const m of src.matchAll(ENTRY)) {
    const key = (m[1] ?? m[2] ?? m[3]).replace(/\\(['"])/g, '$1');
    const value = (m[4] ?? m[5]).replace(/\\(['"])/g, '$1');
    if (dict.has(key)) duplicates.push({ locale: l, key });
    dict.set(key, value);
  }
  dicts[l] = dict;
}

const missing = [...used.keys()]
  .filter((k) => LOCALES.some((l) => !dicts[l].has(k)))
  .sort();

const unstable = [];
for (const l of LOCALES) {
  for (const [key, value] of dicts[l]) {
    const twice = dicts[l].get(value);
    if (twice !== undefined && twice !== value) unstable.push({ locale: l, key, value, twice });
  }
}

/* ------------------------------------------------------------------------- */

const sizes = LOCALES.map((l) => dicts[l].size).join('/');
console.log(`${used.size} clés appelées · ${sizes} traduites (${LOCALES.join('/')})`);

/* Soixante lignes par relevé, sauf `--all` : pour recopier tous les manques d'un coup. */
const LIMIT = process.argv.includes('--all') ? Infinity : 60;

let failed = false;
const report = (title, items, render) => {
  if (items.length === 0) return;
  failed = true;
  console.log(`\n${title} (${items.length})`);
  for (const it of items.slice(0, LIMIT)) console.log(`  ${render(it)}`);
  if (items.length > LIMIT) console.log(`  … et ${items.length - LIMIT} de plus`);
};

report('Texte affiché sans traduction', untranslated, (f) => `${show(f.file)}:${f.n}  ${f.text}`);
report('Clés sans traduction complète', missing, (k) => {
  const gaps = LOCALES.filter((l) => !dicts[l].has(k)).join(',');
  return `[${gaps}] ${JSON.stringify(k)} — ${show([...used.get(k)][0])}`;
});
report('Clés déclarées deux fois', duplicates, (d) => `${d.locale} : ${JSON.stringify(d.key)}`);
report(
  'Traduction instable au second passage',
  unstable,
  (u) => `${u.locale} : ${JSON.stringify(u.key)} → ${JSON.stringify(u.value)} → ${JSON.stringify(u.twice)}`,
);

if (failed) process.exit(1);
console.log('Aucun manque.');
