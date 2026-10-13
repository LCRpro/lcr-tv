import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';
import { TopNav } from '../../components/TopNav';

/**
 * Cinq sections, en onglets hauts : Accueil, Films, Séries, Direct, Guide.
 *
 * La barre vit en haut, pas en bas — c'est `TopNav` qui la dessine, fournie
 * comme `tabBar`. Recherche et compte ne sont pas des onglets : on les empile
 * par-dessus depuis la barre, car ce ne sont pas des destinations qu'on garde
 * ouvertes en parallele. Aucune administration sur mobile — elle reste au web.
 */
export default function TabsLayout() {
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
      <Tabs.Screen name="guide" options={{ title: 'Guide' }} />
    </Tabs>
  );
}
