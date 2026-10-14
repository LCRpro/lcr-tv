import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { colors } from '../../lib/theme';
import { IS_TV } from '../../lib/tv';
import { TopNav } from '../../components/TopNav';
import { BrandBar } from '../../components/BrandBar';
import { BottomNav } from '../../components/BottomNav';

/**
 * Quatre sections : Accueil, Films, Séries, Direct.
 *
 * Deux barres encadrent les écrans. En haut, l'identité et les deux gestes de
 * côté — recherche et compte — portés par `BrandBar`. En bas, les sections
 * elles-mêmes, sous le pouce, portées par `BottomNav` fournie comme `tabBar`.
 *
 * Le téléviseur fait exception : la télécommande descend mal vers une barre du
 * bas, alors on garde tout en haut, sections comprises, avec `TopNav`.
 * Recherche et compte ne sont pas des onglets — on les empile par-dessus. Aucune
 * administration sur mobile : elle reste au web.
 */
export default function TabsLayout() {
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
      <BrandBar />
      <Tabs
        tabBar={(props) => <BottomNav {...props} />}
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
    </View>
  );
}
