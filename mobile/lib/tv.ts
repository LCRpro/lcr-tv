import { Platform } from 'react-native';

/**
 * Adaptation « 10 pieds ».
 *
 * Une TV se regarde a trois metres, pas a trente centimetres, et se pilote a la
 * telecommande, pas au doigt. Trois consequences qui traversent toute
 * l'interface : tout grossit, tout s'espace, et **rien** ne se declenche sans
 * avoir d'abord le focus.
 *
 * `Platform.isTV` est vrai sur Android TV, Fire TV et tvOS. Sur telephone il est
 * faux et l'application ne change pas d'un pixel : la couche TV s'ajoute, elle
 * ne remplace rien.
 */
export const IS_TV = Platform.isTV;

/**
 * Facteur d'echelle des tailles.
 *
 * Les recommandations d'Apple et de Google convergent : viser environ 1,5 fois
 * les tailles mobiles pour rester lisible a distance de canape. On l'applique
 * par cette fonction plutot qu'en dupliquant une feuille de styles, pour que les
 * deux plateformes ne puissent pas diverger.
 */
export function tv(size: number): number {
  return IS_TV ? Math.round(size * 1.5) : size;
}

/**
 * Marge de securite.
 *
 * Les televiseurs rognent les bords de l'image — l'« overscan ». Apple demande
 * 60 px de marge horizontale sur une interface 1920, Google environ 5 % de
 * chaque cote. Sans cette marge, la premiere colonne d'une grille est coupee sur
 * certains ecrans, et l'utilisateur n'a aucun moyen de le savoir.
 */
export const TV_SAFE = IS_TV ? 48 : 0;

/**
 * Largeur cible d'une carte.
 *
 * Sur une TV on montre **moins** d'elements, pas plus : parcourir vingt colonnes
 * a la telecommande est interminable, et les vignettes doivent rester lisibles
 * de loin.
 */
export function cardTarget(base: number): number {
  return IS_TV ? Math.round(base * 2.1) : base;
}
