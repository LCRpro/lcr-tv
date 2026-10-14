import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, styles } from '../lib/theme';
import { Focusable } from './Focusable';

/**
 * La barre du haut — présente partout, l'identité et les gestes de côté.
 *
 * Elle ne porte plus les sections (parties au bas de l'écran, sous le pouce) :
 * elle dit où l'on est — LCR TV — et garde à portée la recherche et le compte,
 * le profil actif reconnaissable à sa vignette. Sur un écran empilé (une fiche,
 * un réglage) une flèche de retour s'ajoute à gauche ; sur les onglets, non, car
 * la barre du bas y suffit. Sur téléviseur c'est `TopNav` qui reprend le rôle.
 */
export function BrandBar({ onSearch }: { onSearch?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();

  // Retour visible dès qu'on n'est pas sur un onglet (donc sur un écran empilé).
  const showBack = Boolean(segments[0]) && segments[0] !== '(tabs)';

  return (
    <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
      {showBack ? (
        <Focusable onPress={() => router.back()} hitSlop={8} style={{ marginRight: -3 }}>
          <Ionicons name="chevron-back" size={25} color={colors.text} />
        </Focusable>
      ) : null}
      <View style={styles.navLogo}>
        <Text style={styles.navLogoText}>L</Text>
      </View>
      <Text style={bs.wordmark}>LCR TV</Text>

      <View style={{ flex: 1 }} />

      <Focusable onPress={() => (onSearch ? onSearch() : router.push('/search'))} hitSlop={8}>
        <View style={{ padding: 4 }}>
          <Ionicons name="search" size={21} color={colors.dim} />
        </View>
      </Focusable>

      <Focusable onPress={() => router.push('/compte')} hitSlop={6}>
        <View style={[styles.navLogo, { backgroundColor: colors.elevated }]}>
          <Ionicons name="settings-outline" size={18} color={colors.dim} />
        </View>
      </Focusable>
    </View>
  );
}

const bs = StyleSheet.create({
  wordmark: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginLeft: 2,
  },
});
