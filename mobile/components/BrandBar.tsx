import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, styles } from '../lib/theme';
import { useSession } from '../lib/session';
import { Avatar } from './ProfileAvatar';
import { Focusable } from './Focusable';

/**
 * La barre du haut — l'identité et les deux gestes de côté.
 *
 * Elle ne porte plus les sections (parties au bas de l'écran, sous le pouce) :
 * elle dit où l'on est — LCR TV — et garde à portée les deux actions qui ne
 * sont pas des destinations qu'on laisse ouvertes, la recherche et le compte.
 * Le profil actif se reconnaît à sa vignette dans le coin. Sur téléviseur c'est
 * `TopNav` qui reprend le rôle, sections comprises.
 */
export function BrandBar({ onSearch }: { onSearch?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useSession();

  return (
    <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
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
        {profile ? (
          <Avatar avatar={profile.avatar} color={profile.color} size={32} />
        ) : (
          <View style={[styles.navLogo, { backgroundColor: colors.elevated }]}>
            <Ionicons name="person" size={17} color={colors.dim} />
          </View>
        )}
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
