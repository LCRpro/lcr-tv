import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { BrandMark } from './BrandMark';

/**
 * L'écran d'attente de la marque.
 *
 * Il couvre le moment où l'on vient de choisir un profil et où son catalogue
 * descend, avant que l'accueil n'ait de quoi s'afficher : plutôt qu'une grille
 * vide qui se remplit par à-coups, la marque respire au centre, et le contenu
 * n'apparaît qu'une fois prêt. Le logo pulse doucement, un halo tourne derrière
 * lui — assez pour dire « ça travaille », sans agiter l'écran.
 */
export function BrandSplash({ message = 'Préparation de votre catalogue…' }: { message?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const s = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    p.start();
    s.start();
    return () => {
      p.stop();
      s.stop();
    };
  }, [pulse, spin]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.root}>
      <View style={styles.stack}>
        <Animated.View
          style={[styles.halo, { opacity: haloOpacity, transform: [{ rotate }, { scale }] }]}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <BrandMark size={76} />
        </Animated.View>
      </View>
      <Text style={styles.word}>LCR TV</Text>
      <Text style={styles.msg}>{message}</Text>
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 18,
  },
  stack: { width: 140, height: 140, alignItems: 'center' as const, justifyContent: 'center' as const },
  halo: {
    position: 'absolute' as const,
    width: 128,
    height: 128,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed' as const,
  },
  word: {
    color: colors.text,
    fontFamily: 'Outfit',
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  msg: { color: colors.dim, fontFamily: 'Inter', fontSize: 14 },
};
