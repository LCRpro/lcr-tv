import { StyleSheet } from 'react-native';
import { colors, onArt, radius } from '../lib/theme';

/**
 * Les styles d'une fiche — film comme serie.
 *
 * Une fiche s'ouvre sur son backdrop, qui la tient ; dessous, l'affiche et le
 * titre se chevauchent le bas du visuel, puis les actions, le synopsis, et ce
 * que l'oeuvre a de plus (versions pour un film, saisons pour une serie). Les
 * deux ecrans partagent ce vocabulaire pour qu'on passe de l'un a l'autre sans
 * changer de grammaire.
 */
export const fiche = StyleSheet.create({
  hero: {
    position: 'relative',
    width: '100%',
    backgroundColor: colors.elevated,
  },
  heroBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /* Le corps remonte sur le backdrop : l'affiche chevauche le bas du visuel. */
  body: {
    paddingHorizontal: 18,
    marginTop: -72,
  },
  posterRow: {
    flexDirection: 'row',
    gap: 15,
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  poster: {
    width: 108,
    aspectRatio: 2 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontFamily: 'Outfit',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  meta: {
    color: colors.dim,
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '500',
  },
  rating: {
    color: colors.gold,
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 14,
  },
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  playText: {
    color: colors.onAccent,
    fontFamily: 'Outfit',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  round: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plot: {
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 18,
  },
  credit: {
    color: colors.dim,
    fontSize: 13,
    marginTop: 10,
  },
  // utilisé par la fiche série pour le voile des plaques de saison
  onArtScrim: {
    backgroundColor: onArt.scrim,
  },
});
