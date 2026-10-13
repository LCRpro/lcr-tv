import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, styles } from '../lib/theme';
import { useSession } from '../lib/session';
import { Avatar } from './ProfileAvatar';
import { Focusable } from './Focusable';

/**
 * La barre haute — logo, onglets, recherche, profil.
 *
 * C'est la signature de la refonte : on pilote l'application par le haut, comme
 * au salon, et le profil actif se reconnait a sa vignette dans le coin. Elle
 * remplace la barre du bas, qui tombait sous le pouce mais ne disait rien de
 * qui regarde.
 *
 * Fournie comme `tabBar` au navigateur : elle lit l'onglet actif dans `state`
 * et change de section avec `navigation`. La recherche et le compte ne sont pas
 * des onglets — ce sont des ecrans qu'on empile par-dessus, d'ou le `router`.
 */
const LABELS: Record<string, string> = {
  index: 'Accueil',
  films: 'Films',
  series: 'Séries',
  live: 'Direct',
  guide: 'Guide',
};

/**
 * Les seules parties des props du navigateur dont la barre se sert. On les type
 * ici plutot que de dependre de `@react-navigation/bottom-tabs`, qui n'est pas
 * une dependance directe du projet (expo-router l'embarque en transitif).
 */
interface TabBarProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

export function TopNav({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useSession();

  return (
    <View style={[styles.navBar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.navLogo}>
        <Text style={styles.navLogoText}>L</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', gap: 16, paddingRight: 4 }}
      >
        {state.routes.map((route, i) => {
          const on = state.index === i;
          const label = LABELS[route.name] ?? route.name;
          return (
            <Focusable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!on && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <Text style={[styles.navTab, on && styles.navTabOn]}>{label}</Text>
            </Focusable>
          );
        })}
      </ScrollView>

      <Focusable onPress={() => router.push('/search')} hitSlop={8}>
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
