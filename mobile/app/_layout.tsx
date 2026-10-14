import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';
import { IS_TV } from '../lib/tv';
import { Loading } from '../components/ui';
import { AppBottomBar } from '../components/AppBottomBar';

function Gate() {
  const { user, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuth = segments[0] === 'login' || segments[0] === 'inscription';
    const onPair = segments[0] === 'tv-pair';
    const onPicker = segments[0] === 'profils';
    if (!user) {
      // Sur un téléviseur, pas de clavier : on s'associe par QR plutôt que de
      // taper un mot de passe. La connexion classique reste joignable en repli.
      if (IS_TV) {
        if (!onPair && !onAuth) router.replace('/tv-pair');
        return;
      }
      // Connexion et inscription sont les deux portes ouvertes sans session.
      if (!onAuth) router.replace('/login');
      return;
    }
    /*
     * Connecte mais sans profil : on passe par le selecteur.
     *
     * Favoris, liste et progression sont rattaches a un profil ; sans reponse a
     * « qui regarde ? », l'API repond 409 sur chaque ecran. Un compte a profil
     * unique ne voit jamais cet ecran — la session le choisit seule.
     */
    if (!profile) {
      if (!onPicker) router.replace('/profils');
      return;
    }
    if (onAuth || onPair || onPicker) router.replace('/');
  }, [user, profile, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  /*
   * La barre du bas, persistante.
   *
   * On ne la perd plus en entrant dans une fiche ou un réglage : elle vit ici,
   * sous la pile, et suit toutes les pages de contenu. On la cache là où elle
   * n'a pas sa place — connexion, sélecteur de profil, lecteur plein écran — et
   * sur téléviseur, piloté par le haut.
   */
  const seg = segments[0] ?? '';
  const fullscreen =
    seg === 'login' ||
    seg === 'inscription' ||
    seg === 'tv-pair' ||
    seg === 'profils' ||
    seg === 'player';
  const showBar = Boolean(user && profile) && !fullscreen && !IS_TV;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="inscription" options={{ headerShown: false }} />
          <Stack.Screen name="tv-pair" options={{ headerShown: false }} />
          <Stack.Screen name="profils" options={{ headerShown: false }} />
          <Stack.Screen name="compte" options={{ headerShown: false }} />
          <Stack.Screen name="profil/[id]" options={{ title: 'Profil' }} />
          <Stack.Screen name="source/[id]" options={{ title: 'Source' }} />
          <Stack.Screen name="associer-tv" options={{ title: 'Associer une TV' }} />
          <Stack.Screen name="search" options={{ title: 'Recherche' }} />
          <Stack.Screen name="film/[id]" options={{ title: '' }} />
          <Stack.Screen name="serie/[id]" options={{ title: '' }} />
          <Stack.Screen name="tag/[id]" options={{ title: 'Étiquette' }} />
          {/* Le lecteur est une modale plein ecran : fermer rend la pile intacte. */}
          <Stack.Screen
            name="player"
            options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
          />
        </Stack>
      </View>
      {showBar ? <AppBottomBar /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
