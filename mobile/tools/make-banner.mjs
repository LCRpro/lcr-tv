/*
 * La banniere du lanceur Android TV.
 *
 * Le lanceur « leanback » ne montre pas l'icone d'une application : il montre
 * une banniere 320x180, et une application qui n'en declare pas n'apparait pas
 * sur l'ecran d'accueil du televiseur. Elle est donc obligatoire, au meme titre
 * que le filtre d'intention.
 *
 * Elle est dessinee ici plutot que posee en binaire pour qu'on puisse la
 * relire : c'est le nom du produit en lettres, dans les couleurs de
 * l'application — l'encre et le papier du theme sombre, et le rouge du direct
 * pour le seul trait de couleur, comme partout ailleurs dans l'interface.
 *
 *   node tools/make-banner.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'tv-banner.png');

const W = 320;
const H = 180;

/* Les couleurs viennent du theme sombre partage — voir packages/shared/src/theme.ts.
   Elles sont recopiees ici parce qu'un script de generation d'image ne peut pas
   importer un module TypeScript ; ce sont les trois seules du fichier. */
const FOND = [0x12, 0x11, 0x10]; // DARK.bg
const ENCRE = [0xf2, 0xef, 0xe9]; // DARK.text
const DIRECT = [0xf0, 0x55, 0x4f]; // DARK.live

/*
 * Des glyphes en 5x7, agrandis.
 *
 * Six lettres suffisent, et une police embarquee pour six lettres serait plus
 * lourde que l'image. Chaque ligne est lue de gauche a droite, un caractere
 * plein par pixel allume.
 */
const GLYPHES = {
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
};

const ECHELLE = 8;
const LARGEUR_GLYPHE = 5 * ECHELLE;
const HAUTEUR_GLYPHE = 7 * ECHELLE;
const CHASSE = ECHELLE; // entre deux lettres d'un meme mot
const ESPACE = 3 * ECHELLE; // entre les deux mots

const MOTS = ['LCR', 'TV'];

/** La toile : trois octets par pixel, remplis du fond. */
const toile = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i += 1) {
  toile[i * 3] = FOND[0];
  toile[i * 3 + 1] = FOND[1];
  toile[i * 3 + 2] = FOND[2];
}

function pixel(x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  toile[i] = r;
  toile[i + 1] = g;
  toile[i + 2] = b;
}

function rectangle(x0, y0, largeur, hauteur, couleur) {
  for (let y = y0; y < y0 + hauteur; y += 1) {
    for (let x = x0; x < x0 + largeur; x += 1) pixel(x, y, couleur);
  }
}

function lettre(caractere, x0, y0, couleur) {
  const lignes = GLYPHES[caractere];
  if (!lignes) throw new Error(`glyphe absent : ${caractere}`);
  lignes.forEach((ligne, ly) => {
    [...ligne].forEach((c, lx) => {
      if (c === '#') rectangle(x0 + lx * ECHELLE, y0 + ly * ECHELLE, ECHELLE, ECHELLE, couleur);
    });
  });
}

const largeurMot = (mot) => mot.length * LARGEUR_GLYPHE + (mot.length - 1) * CHASSE;
const largeurTotale = MOTS.reduce((n, m) => n + largeurMot(m), 0) + ESPACE * (MOTS.length - 1);

let x = Math.round((W - largeurTotale) / 2);
const y = Math.round((H - HAUTEUR_GLYPHE) / 2) - 8;
for (const mot of MOTS) {
  for (const c of mot) {
    lettre(c, x, y, ENCRE);
    x += LARGEUR_GLYPHE + CHASSE;
  }
  x += ESPACE - CHASSE;
}

/* Le trait du direct sous le nom : le seul rouge de l'image, comme le point
   rouge des cartes de chaine. */
rectangle(Math.round((W - largeurTotale) / 2), y + HAUTEUR_GLYPHE + 14, largeurTotale, 4, DIRECT);

// ------------------------------------------------------------------- le PNG

const TABLE_CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const octet of buf) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bloc(type, donnees) {
  const nom = Buffer.from(type, 'ascii');
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(donnees.length);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(Buffer.concat([nom, donnees])));
  return Buffer.concat([taille, nom, donnees, somme]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // 8 bits par canal
ihdr[9] = 2; // vraies couleurs, sans canal alpha
// compression, filtre et entrelacement : les trois valeurs standard, a zero.

/* Chaque ligne est prefixee de son octet de filtre. Zero — « aucun » : l'image
   est faite d'aplats, un filtre differentiel n'y gagnerait rien. */
const brut = Buffer.alloc(H * (W * 3 + 1));
for (let y2 = 0; y2 < H; y2 += 1) {
  brut[y2 * (W * 3 + 1)] = 0;
  toile.copy(brut, y2 * (W * 3 + 1) + 1, y2 * W * 3, (y2 + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloc('IHDR', ihdr),
  bloc('IDAT', deflateSync(brut, { level: 9 })),
  bloc('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`${OUT} — ${W}x${H}, ${(png.length / 1024).toFixed(1)} Ko`);
