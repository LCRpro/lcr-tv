/*
 * Le relevé des dérives de palette.
 *
 * La palette existait deux fois : en propriétés CSS ici, et recopiée à la main
 * dans `mobile/lib/theme.ts` sous un commentaire affirmant que les deux jeux
 * étaient identiques. Ils ne l'étaient plus depuis longtemps — le mobile portait
 * encore l'accent cyan et le fond bleu froid que le web avait abandonnés. Rien
 * n'a signalé l'écart, parce que rien ne le regardait.
 *
 * `packages/shared/src/theme.ts` est désormais la source. Le mobile l'importe ;
 * le web garde ses propriétés CSS, parce qu'une feuille de style ne peut pas
 * importer du TypeScript — et ce relevé vérifie qu'elles disent la même chose.
 *
 *   pnpm --filter web theme
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DARK, LIGHT, ON_ART } from '@iptv/shared';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOCLE = join(ROOT, 'app', 'styles', '01-socle.css');

/** La propriété CSS, et la clé de la palette partagée qu'elle doit valoir. */
const MAP = {
  '--bg': 'bg',
  '--bg-soft': 'bgSoft',
  '--elevated': 'elevated',
  '--hover': 'hover',
  '--border': 'border',
  '--border-strong': 'borderStrong',
  '--text': 'text',
  '--dim': 'dim',
  '--faint': 'faint',
  '--accent': 'accent',
  '--accent-hover': 'accentHover',
  '--accent-soft': 'accentSoft',
  '--accent-line': 'accentLine',
  '--on-accent': 'onAccent',
  '--live': 'live',
  '--live-soft': 'liveSoft',
  '--gold': 'gold',
  '--ok': 'ok',
  '--warn': 'warn',
};

/** Ce qui se pose sur un visuel : les mêmes valeurs dans les deux thèmes. */
const FIXED = {
  '--on-art': ON_ART.ink,
  '--scrim': ON_ART.scrim,
  '--plaque': ON_ART.plaque,
};

const css = readFileSync(SOCLE, 'utf8');

/**
 * Les déclarations d'un bloc, repéré par son sélecteur.
 *
 * On lit jusqu'à l'accolade fermante de premier niveau : les blocs de thème ne
 * contiennent que des déclarations, jamais de règle imbriquée.
 */
function blockOf(selector) {
  const start = css.indexOf(selector);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  if (open < 0 || close < 0) return null;
  const body = css.slice(open + 1, close);
  const found = {};
  for (const line of body.split('\n')) {
    const m = /^\s*(--[a-z-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) found[m[1]] = m[2].trim();
  }
  return found;
}

/** Deux couleurs égales à l'écriture près : les espaces d'un `rgba` varient. */
const same = (a, b) => String(a).replace(/\s+/g, '').toLowerCase() === String(b).replace(/\s+/g, '').toLowerCase();

const blocks = [
  { nom: 'clair (:root)', selector: ':root {', palette: LIGHT, fixed: true },
  {
    nom: 'sombre (prefers-color-scheme)',
    selector: ":root:not([data-theme='light'])",
    palette: DARK,
    fixed: false,
  },
  { nom: "sombre (data-theme='dark')", selector: ":root[data-theme='dark']", palette: DARK, fixed: false },
];

const ecarts = [];
let lus = 0;

for (const { nom, selector, palette, fixed } of blocks) {
  const found = blockOf(selector);
  if (!found) {
    ecarts.push(`bloc « ${nom} » introuvable dans 01-socle.css`);
    continue;
  }
  for (const [prop, key] of Object.entries(MAP)) {
    const attendu = palette[key];
    const trouve = found[prop];
    lus += 1;
    if (trouve === undefined) {
      ecarts.push(`${nom} : ${prop} absent (attendu ${attendu})`);
    } else if (!same(trouve, attendu)) {
      ecarts.push(`${nom} : ${prop} vaut ${trouve}, la source dit ${attendu}`);
    }
  }
  /* Les valeurs indépendantes du thème ne sont déclarées qu'une fois, dans le
     bloc clair : les chercher dans les blocs sombres serait les exiger deux
     fois de plus. */
  if (fixed) {
    for (const [prop, attendu] of Object.entries(FIXED)) {
      const trouve = found[prop];
      lus += 1;
      if (trouve === undefined) {
        ecarts.push(`${nom} : ${prop} absent (attendu ${attendu})`);
      } else if (!same(trouve, attendu)) {
        ecarts.push(`${nom} : ${prop} vaut ${trouve}, la source dit ${attendu}`);
      }
    }
  }
}

console.log(`${lus} valeurs relues dans 01-socle.css`);

if (ecarts.length === 0) {
  console.log('Le web et la source partagée disent la même chose.');
  process.exit(0);
}

console.log(`\nÉcarts avec packages/shared/src/theme.ts (${ecarts.length})`);
for (const e of ecarts) console.log(`  ${e}`);
process.exit(1);
