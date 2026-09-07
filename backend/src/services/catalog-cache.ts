/**
 * Ce que le catalogue derive de lui-meme, garde en memoire entre deux syncs.
 *
 * Trois cartes accompagnent chaque liste de categories : le nombre d'oeuvres
 * visibles, le logo commun quand il y en a un, et la langue reellement portee
 * par le contenu. Toutes trois se calculent en parcourant le catalogue entier —
 * 311 908 lignes de films chez un seul abonnement — et toutes trois ne changent
 * qu'a la synchronisation.
 *
 * Elles etaient pourtant recalculees a chaque ouverture de page. Mesure sur le
 * catalogue reel : `listCategories('vod')` prenait 3,4 s, dont 5 s pour la
 * seule detection de langue quand elle tournait seule. C'est le « trois
 * secondes ou il ne se passe rien » constate au changement de page — l'accueil
 * en payait deux d'affilee, une pour les films et une pour le direct.
 *
 * Le cache porte donc sur ces trois calculs, pas sur la liste rendue :
 * l'epinglage et le filtre adulte dependent du profil qui regarde, et restent
 * calcules a chaque appel.
 *
 * La cle porte le compte **et les langues du profil**. Le compte, parce que
 * deux comptes n'ont ni les memes abonnements ni le meme catalogue. Les
 * langues, parce que le nombre d'oeuvres visibles en depend : le representant
 * d'une oeuvre est sa version dans la langue preferee, et une categorie
 * allemande ne compte pas le meme nombre de lignes selon qu'on regarde en
 * allemand ou en francais.
 *
 * La promesse est stockee telle quelle plutot que sa valeur — deux pages
 * ouvertes en meme temps partagent alors la meme requete au lieu d'en lancer
 * deux.
 */

/** Filet de securite : une invalidation manquee se repare toute seule. */
const TTL_MS = 10 * 60_000;

const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function memoByUser<T>(
  kind: string,
  userId: number,
  languages: readonly string[],
  load: () => Promise<T>,
): Promise<T> {
  const key = `${kind}|${userId}|${languages.join('+')}`;
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;

  // L'echec ne se garde pas : une erreur reseau ou un verrou momentane ne doit
  // pas condamner la page pendant dix minutes.
  const value = load().catch((err: unknown) => {
    if (entries.get(key)?.value === value) entries.delete(key);
    throw err;
  });
  entries.set(key, { at: Date.now(), value });
  return value;
}

/**
 * A appeler des que le catalogue d'un compte a bouge : fin de synchronisation,
 * ajout, modification ou retrait d'un abonnement.
 *
 * Sans argument, tout est oublie — utile aux outils en ligne de commande, qui
 * ecrivent en base sans passer par ces chemins.
 */
export function forgetCatalogCache(userId?: number): void {
  if (userId == null) {
    entries.clear();
    return;
  }
  const owner = `|${userId}|`;
  for (const key of [...entries.keys()]) {
    if (key.includes(owner)) entries.delete(key);
  }
}
