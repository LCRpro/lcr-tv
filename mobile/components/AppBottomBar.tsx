import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { Focusable } from './Focusable';

/**
 * La barre du bas — les quatre sections, sous le pouce.
 *
 * Elle se pilote par l'URL plutôt que par l'état d'un navigateur d'onglets :
 * ainsi la même barre sert aux onglets **et** aux écrans empilés par-dessus,
 * comme le compte, qui gardent ainsi leurs deux barres. La section active se
 * lit dans le chemin ; une fiche de film garde « Films » en surbrillance.
 */
const TABS: Array<{
  path: string;
  match: string[];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
}> = [
  { path: '/', match: [], label: 'Accueil', icon: 'home-outline', iconOn: 'home' },
  { path: '/films', match: ['/films', '/film'], label: 'Films', icon: 'film-outline', iconOn: 'film' },
  {
    path: '/series',
    match: ['/series', '/serie'],
    label: 'Séries',
    icon: 'albums-outline',
    iconOn: 'albums',
  },
  { path: '/live', match: ['/live'], label: 'Direct', icon: 'tv-outline', iconOn: 'tv' },
];

export function AppBottomBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[bn.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on =
          t.path === '/'
            ? pathname === '/'
            : t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <Focusable
            key={t.path}
            onPress={() => {
              if (!on) router.navigate(t.path);
            }}
            style={bn.item}
          >
            <Ionicons
              name={on ? t.iconOn : t.icon}
              size={23}
              color={on ? colors.accent : colors.faint}
            />
            <Text style={[bn.label, on && bn.labelOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </Focusable>
        );
      })}
    </View>
  );
}

const bn = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    // Même fond que les écrans : la barre ne doit pas trancher. Un filet suffit
    // à la séparer du contenu qui défile dessous.
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.faint, letterSpacing: -0.1 },
  labelOn: { color: colors.accent, fontWeight: '700' },
});
