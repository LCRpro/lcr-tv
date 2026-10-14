import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { Focusable } from './Focusable';

/**
 * La barre du bas — les cinq sections, sous le pouce.
 *
 * Au téléphone et à la tablette, on tient l'appareil en bas : c'est là qu'on
 * met ce qu'on touche souvent. Chaque section a son icône, pleine quand elle est
 * active, et son nom dessous. Fournie comme `tabBar` au navigateur d'onglets,
 * elle lit l'onglet courant dans `state` et bascule par `navigation`. Sur
 * téléviseur on ne l'affiche pas : la télécommande va vers le haut, pas en bas.
 */
const TABS: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; iconOn: keyof typeof Ionicons.glyphMap }
> = {
  index: { label: 'Accueil', icon: 'home-outline', iconOn: 'home' },
  films: { label: 'Films', icon: 'film-outline', iconOn: 'film' },
  series: { label: 'Séries', icon: 'albums-outline', iconOn: 'albums' },
  live: { label: 'Direct', icon: 'tv-outline', iconOn: 'tv' },
  guide: { label: 'Guide', icon: 'calendar-outline', iconOn: 'calendar' },
};

interface TabBarProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

export function BottomNav({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[bn.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const on = state.index === i;
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
            style={bn.item}
          >
            <Ionicons
              name={on ? meta.iconOn : meta.icon}
              size={23}
              color={on ? colors.accent : colors.faint}
            />
            <Text style={[bn.label, on && bn.labelOn]} numberOfLines={1}>
              {meta.label}
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
    backgroundColor: colors.bgSoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
    paddingHorizontal: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.faint,
    letterSpacing: -0.1,
  },
  labelOn: {
    color: colors.accent,
    fontWeight: '700',
  },
});
