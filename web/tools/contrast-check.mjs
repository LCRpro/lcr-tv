/*
 * Le controle de contraste de la palette.
 *
 * Une refonte se juge aussi en chiffres. WCAG demande 4,5:1 pour du texte
 * courant, 3:1 pour du grand texte et pour ce qui porte du sens sans etre du
 * texte — une bordure de champ, un anneau de focus, un point de direct.
 *
 * Les couleurs sont lues dans la feuille, jamais recopiees ici : un jeton
 * qui change doit faire bouger ce releve, sinon il ne sert a rien.
 *
 *   pnpm --filter web contrast
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Les jetons vivent dans la premiere tranche depuis le decoupage de la feuille.
const css = readFileSync(resolve(ROOT, 'app/styles/01-socle.css'), 'utf8');

/** Les jetons d'un bloc, lus entre son accolade ouvrante et la fermante. */
function tokensOf(startPattern) {
  const i = css.indexOf(startPattern);
  if (i < 0) throw new Error(`bloc introuvable : ${startPattern}`);
  const open = css.indexOf('{', i);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}' && --depth === 0) break;
  }
  const out = {};
  for (const m of css.slice(open, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const LIGHT = tokensOf(':root {');
const DARK = tokensOf(":root[data-theme='dark']");

/** `#rgb`, `#rrggbb` ou `rgba(r, g, b, a)` → canaux 0-255 plus alpha. */
function parse(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb) {
    const parts = rgb[1].split(',').map((n) => Number(n));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  return null;
}

/** Une couleur translucide se juge sur le fond qu'elle recouvre, pas dans le vide. */
function flatten(fg, bg) {
  const [r, g, b, a] = fg;
  if (a >= 1) return [r, g, b];
  return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function ratio(fgValue, bgValue) {
  const fg = parse(fgValue);
  const bg = parse(bgValue);
  if (!fg || !bg) return null;
  const base = flatten(bg, [255, 255, 255]);
  const l1 = luminance(flatten(fg, base));
  const l2 = luminance(base);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/*
 * Les paires qui comptent : ce que l'utilisateur lit, et sur quoi.
 * `min` est l'exigence WCAG applicable — 4,5 pour du texte, 3 pour le reste.
 */
const PAIRS = [
  ['texte courant', 'text', 'bg', 4.5],
  ['texte sur panneau', 'text', 'elevated', 4.5],
  ['texte attenue', 'dim', 'bg', 4.5],
  ['texte attenue sur panneau', 'dim', 'elevated', 4.5],
  ['libelle discret', 'faint', 'bg', 3],
  ['libelle discret sur panneau', 'faint', 'bg-soft', 3],
  ['encre sur accent', 'on-accent', 'accent', 4.5],
  ['direct', 'live', 'bg', 3],
  ['direct sur panneau', 'live', 'elevated', 3],
  ['note', 'gold', 'bg', 3],
  ['note sur panneau', 'gold', 'elevated', 3],
  ['disponible', 'ok', 'bg', 3],
  ['avertissement', 'warn', 'bg', 3],
  ['bordure de champ', 'border-strong', 'bg', 3],
  ['bordure de champ sur panneau', 'border-strong', 'elevated', 3],
  ['anneau de focus', 'gold', 'bg', 3],
];

let echecs = 0;
for (const [nom, tokens] of [
  ['CLAIR', LIGHT],
  ['SOMBRE', DARK],
]) {
  console.log(`\n── ${nom}`);
  for (const [label, fg, bg, min] of PAIRS) {
    const r = ratio(tokens[fg], tokens[bg]);
    if (r === null) {
      console.log(`  ?      ${label} (jeton illisible)`);
      continue;
    }
    const ok = r >= min;
    if (!ok) echecs++;
    console.log(
      `  ${ok ? 'ok  ' : 'ECHEC'} ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}`,
    );
  }
}

console.log(`\n${echecs} paire(s) sous le seuil.`);
process.exit(echecs ? 1 : 0);
