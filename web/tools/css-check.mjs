/*
 * Le relevé des collisions de classes.
 *
 * Deux fois pendant la refonte, j'ai donné à un composant neuf le nom d'une
 * classe qui existait déjà ailleurs dans la feuille : `.field`, qui désignait
 * le champ de recherche, puis `.resume`, qui désignait la reprise en tête de
 * l'historique. Dans les deux cas rien n'a échoué — les règles se sont
 * additionnées, et la mise en page est partie de travers d'une façon qui ne
 * ressemblait à aucune erreur : un libellé à côté de son champ, un titre à
 * côté de son bloc.
 *
 * Une classe déclarée à deux endroits éloignés est presque toujours ça. Le
 * relevé les liste, avec les lignes, pour qu'on choisisse : fusionner les deux
 * blocs, ou renommer le nouveau venu.
 *
 *   pnpm --filter web css
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'app', 'styles');

/** Une déclaration : le nom de la classe, son fichier, sa ligne. */
const declarations = new Map();

for (const nom of readdirSync(DIR).sort()) {
  if (!nom.endsWith('.css')) continue;
  const chemin = join(DIR, nom);
  const lignes = readFileSync(chemin, 'utf8').split('\n');

  lignes.forEach((ligne, i) => {
    /*
     * Seules les déclarations de premier niveau comptent.
     *
     * `.card-title` en tête de ligne déclare la classe ; `.panel .card-title`
     * ou `.card:hover` la qualifient, et se répéter n'y est pas une faute — au
     * contraire, c'est comme ça qu'on écrit un état ou une variante.
     */
    const m = /^(\.[a-z][a-z0-9-]*)(,|\s*\{)/.exec(ligne);
    if (!m) return;
    /*
     * Un sélecteur groupé n'est pas une déclaration à lui seul.
     *
     * Une règle de police partagée entre `h1`, `h2` et `.brand` fait participer
     * la classe, elle ne la définit pas. La ligne précédente finit alors par
     * une virgule.
     */
    if (/,\s*$/.test(lignes[i - 1] ?? '')) return;
    const nomClasse = m[1];
    if (!declarations.has(nomClasse)) declarations.set(nomClasse, []);
    declarations.get(nomClasse).push({
      fichier: relative(ROOT, chemin).replace(/\\/g, '/'),
      ligne: i + 1,
    });
  });
}

/*
 * Deux déclarations voisines dans le même fichier ne sont pas une collision :
 * c'est un bloc écrit en deux temps, qu'on lit d'un coup d'œil. Le problème
 * commence quand elles s'ignorent — fichiers différents, ou cent lignes
 * d'écart.
 */
const ECART = 60;

const collisions = [...declarations]
  .map(([nom, lieux]) => {
    const eloignes = lieux.filter((l, i) => {
      if (i === 0) return false;
      const p = lieux[i - 1];
      return l.fichier !== p.fichier || l.ligne - p.ligne > ECART;
    });
    return eloignes.length > 0 ? { nom, lieux } : null;
  })
  .filter(Boolean);

console.log(`${declarations.size} classes déclarées`);

if (collisions.length === 0) {
  console.log('Aucune collision.');
  process.exit(0);
}

console.log(`\n${collisions.length} classe(s) déclarées à des endroits qui s'ignorent :\n`);
for (const { nom, lieux } of collisions) {
  console.log(`  ${nom}`);
  for (const l of lieux) console.log(`      ${l.fichier}:${l.ligne}`);
}
process.exit(1);
