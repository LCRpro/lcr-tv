import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';
import { IS_TV } from '../../lib/tv';
import { TopNav } from '../../components/TopNav';

/**
 * Quatre sections : Accueil, Films, Séries, Direct.
 *
 * Les deux barres — identité en haut, sections en bas — sont désormais globales
 * (voir le layout racine) et suivent toutes les pages. Ici on ne dessine donc
 * que les écrans : la barre d'onglets propre est vide, pour ne pas la doubler.
 *
 * Le téléviseur fait exception : la télécommande descend mal vers une barre du
 * bas, alors on garde tout en haut, sections comprises, avec `TopNav`.
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
  );
}
