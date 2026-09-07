import { StyleSheet } from 'react-native';
import { DARK, ON_ART, RADIUS } from '@iptv/shared';

/*
 * La palette vient de `packages/shared/src/theme.ts`, comme celle du web.
 *
 * Elle était recopiée ici à la main, sous un commentaire affirmant qu'elle
 * valait celle du web. Les deux ont dérivé : le mobile est resté sur un accent
 * cyan et un fond bleu froid que le web avait abandonnés depuis, si bien qu'un
 * même produit ressemblait à deux applications. Il n'y a plus de valeur écrite
 * ici — seulement le thème choisi.
 *
 * Le mobile est sombre, sans bascule : on regarde la télévision le soir, et le
 * catalogue est un mur d'affiches, qui se tient mieux sur du sombre.
 */
export const colors = DARK;

/** Ce qui se pose sur un visuel : indépendant du thème, par construction. */
export const onArt = ON_ART;

export const radius = RADIUS;

/**
 * Largeur d'une carte calculee a partir de la largeur d'ecran.
 *
 * Un nombre de colonnes fige irait mal d'un petit telephone a une tablette en
 * paysage : on vise une largeur cible et on repartit le reste.
 */
export function gridColumns(width: number, target = 130): number {
  return Math.max(2, Math.floor((width - 24) / target));
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  h1: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  h2: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 22,
    marginBottom: 10,
  },
  text: {
    color: colors.text,
    fontSize: 15,
  },
  dim: {
    color: colors.dim,
    fontSize: 13,
    lineHeight: 19,
  },
  faint: {
    color: colors.faint,
    fontSize: 11.5,
  },
  input: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  /* L'accent est l'inversion encre/papier : sur fond d'accent, l'encre est
     celle du fond de page. */
  buttonPrimaryText: {
    color: colors.onAccent,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  // ------------------------------------------------------------------ cartes

  card: {
    width: 124,
    marginRight: 12,
  },
  cardWide: {
    width: 168,
    marginRight: 12,
  },
  /** Le visuel porte l'ombre et le contour, pas le bloc de texte en dessous. */
  cardMedia: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: colors.elevated,
  },
  posterWide: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.elevated,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 7,
  },
  cardSub: {
    color: colors.faint,
    fontSize: 11.5,
    marginTop: 2,
  },
  /* L'age, a droite : il partageait le coin gauche avec la note. */
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  // ----------------------------------------------------------------- blocs

  notice: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 14,
  },
  noticeError: {
    borderColor: 'rgba(255,77,90,0.45)',
    backgroundColor: 'rgba(255,77,90,0.09)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  listItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 11,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 9,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipActiveText: {
    color: colors.onAccent,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  /** Avancement du programme en cours : c'est du direct, donc rouge. */
  elapsedFill: {
    height: '100%',
    backgroundColor: colors.live,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
  },
  posterFallbackText: {
    color: colors.faint,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  /*
   * Le titre, sur le visuel.
   *
   * Meme decision que sur le web : la carte fait la hauteur exacte de son
   * image, et une grille ne peut plus finir en dents de scie selon la
   * longueur des titres.
   */
  cardOverTitle: {
    flex: 1,
    color: onArt.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    letterSpacing: -0.1,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardOverSub: {
    color: onArt.ink,
    opacity: 0.78,
    fontSize: 11.5,
    marginTop: 2,
  },
  /* Une chaine n’a pas d’affiche : son logo se pose sur une plaque sombre,
     seule surface sur laquelle les logos blancs comme les noirs se lisent. */
  cardMediaPlaque: {
    backgroundColor: onArt.plaque,
  },
  /* La note, a gauche : centree ou a droite, elle coupait le titre imprime
     de la jaquette. */
  badgeRating: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeRatingText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '700',
  },

  // ------------------------------------------------- la carte d'une chaine

  /*
   * Une chaine ne se presente pas comme une oeuvre.
   *
   * Elle n'a pas d'affiche : elle a un logo, et ce logo tient dans un carre
   * au milieu d'une plaque 16/9. Le nom se pose dessus — trente-trois chaines
   * d'une meme ligue partagent le meme logo — et l'emission en cours s'ecrit
   * dessous, quand l'agenda la connait. Meme decoupage que sur le web.
   */
  chanMedia: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: onArt.plaque,
  },
  /*
   * Le fond : le meme logo, etale et flou.
   *
   * Il n'existe pas d'image d'emission, et cent plaques identiques ne
   * distinguent rien. Le logo porte les couleurs de la chaine : `blurRadius`
   * est une propriete du composant `Image` de React Native, donc disponible
   * sur telephone comme sur televiseur, sans module de flou en plus.
   */
  chanBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.72,
  },
  /* Un voile par-dessus le fond : sans lui, un logo clair pose sur son propre
     halo clair perd ses contours. */
  chanScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(27,26,24,0.55)',
  },
  chanLogo: {
    width: '62%',
    height: '58%',
  },
  /* Le numero puis la qualite, en colonne a gauche : la droite appartient a
     l'etoile, qui les recouvrirait. */
  chanTags: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
    alignItems: 'flex-start',
    gap: 3,
  },
  chanNum: {
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chanNumText: {
    color: onArt.ink,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  chanQ: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chanQText: {
    color: onArt.ink,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  /* Le nom, sur la plaque, centre : c'est la seule chose qui separe deux
     chaines au logo identique. */
  chanName: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 20,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  chanNameText: {
    flexShrink: 1,
    color: onArt.ink,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  /* L'emission sous le visuel, et rien quand l'agenda se tait. */
  chanProg: {
    marginTop: 7,
    gap: 1,
  },
  chanProgTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    /* Deux lignes reservees : sinon une rangee de cartes finit en dents de
       scie selon la longueur des titres d'emission. */
    minHeight: 34,
  },
  chanProgLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chanDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  chanProgText: {
    flexShrink: 1,
    color: colors.faint,
    fontSize: 11.5,
  },


  // ------------------------------------------------------- l'accueil

  /*
   * La mise en avant : une image large, et ce qu'elle annonce dessus.
   *
   * L'accueil s'ouvrait sur une rangee de vignettes de 124 px, identique a
   * celle des pages de parcours : rien n'y disait par ou commencer. La
   * selection passe donc devant l'historique, et en grand — le fournisseur
   * publie une image large pour presque toutes les oeuvres, elle ne servait
   * nulle part.
   */
  spot: {
    marginRight: 12,
  },
  spotMedia: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    justifyContent: 'flex-end',
  },
  spotVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 44,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  spotTitle: {
    color: onArt.ink,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  spotLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  spotMeta: {
    color: onArt.ink,
    opacity: 0.82,
    fontSize: 12,
    flexShrink: 1,
  },
  spotRating: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },

  /*
   * Le compte des nouveautes, en plaque.
   *
   * Le catalogue grossit sans arret et rien ne le disait : les rangees
   * « recemment ajoutes » repondent « voici du neuf », jamais « voici ce que
   * vous n'avez pas encore vu passer ». Encre et papier inverses, comme
   * partout ailleurs ou l'interface dit « regardez ceci » sans ajouter une
   * couleur.
   */
  news: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 22,
    marginBottom: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  newsN: {
    alignItems: 'center',
  },
  newsNum: {
    color: colors.onAccent,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  newsWord: {
    color: colors.onAccent,
    opacity: 0.72,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  newsTitle: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  newsSub: {
    color: colors.onAccent,
    opacity: 0.74,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  /* Une barre verticale separe le compte du texte : deux blocs d'encre sur le
     meme papier, sans seconde couleur. */
  newsBar: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.onAccent,
    opacity: 0.24,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
});

