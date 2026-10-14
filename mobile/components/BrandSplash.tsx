import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { BrandMark } from './BrandMark';

/**
 * L'écran d'attente de la marque.
 *
 * Il couvre le moment où l'on vient de choisir un profil et où son catalogue
 * descend, avant que l'accueil n'ait de quoi s'afficher : plutôt qu'une grille
 * vide qui se remplit par à-coups, la marque tient la place au centre. Sobre,
 * sans halo ni néon — juste une respiration lente du logo et un fin indicateur,
 * parce qu'une attente a besoin d'un signe de vie, pas d'un spectacle.
 */
export function BrandSplash({ message = 'Préparation de votre catalogue…' }: { message?: string }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const opacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity }}>
        <BrandMark size={64} />
      </Animated.View>
      <Text style={styles.word}>LCR TV</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: 2 }} />
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
    gap: 16,
  },
  word: {
    color: colors.text,
    fontFamily: 'Outfit',
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  msg: { color: colors.dim, fontFamily: 'Inter', fontSize: 13.5 },
};
