import { useState } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../lib/theme';
import { IS_TV } from '../../lib/tv';
import { TopNav } from '../../components/TopNav';
import { BrandBar } from '../../components/BrandBar';
import { SearchPanel } from '../../components/SearchPanel';

/**
 * Quatre sections : Accueil, Films, Séries, Direct.
 *
 * Deux barres encadrent les écrans. En haut, l'identité et les deux gestes de
 * côté — recherche et compte — portés par `BrandBar`. En bas, les sections
 * elles-mêmes, sous le pouce, portées par `AppBottomBar` fournie comme `tabBar`.
 *
 * La recherche ne part pas sur un autre écran : la loupe ouvre `SearchPanel`
 * sur place, juste sous la barre, par-dessus la section en cours.
 *
 * Le téléviseur fait exception : la télécommande descend mal vers une barre du
 * bas, alors on garde tout en haut, sections comprises, avec `TopNav`, et la
 * recherche y reste un écran empilé. Aucune administration sur mobile : elle
 * reste au web.
 */
export default function TabsLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  if (IS_TV) {
    return (
      <Tabs
        tabBar={(props) => <TopNav {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: 'top',
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="films" options={{ title: 'Films' }} />
        <Tabs.Screen name="series" options={{ title: 'Séries' }} />
        <Tabs.Screen name="live" options={{ title: 'Direct' }} />
      </Tabs>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <BrandBar onSearch={() => setSearchOpen(true)} />
      <View style={{ flex: 1 }}>
        {/* La barre du bas est globale (voir le layout racine) : ici on
            n'en met pas, pour ne pas la doubler. */}
        <Tabs
          tabBar={() => null}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
          <Tabs.Screen name="films" options={{ title: 'Films' }} />
          <Tabs.Screen name="series" options={{ title: 'Séries' }} />
          <Tabs.Screen name="live" options={{ title: 'Direct' }} />
        </Tabs>

        {searchOpen ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
            <SearchPanel onClose={() => setSearchOpen(false)} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
