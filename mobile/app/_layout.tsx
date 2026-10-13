import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';
import { Loading } from '../components/ui';

function Gate() {
  const { user, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuth = segments[0] === 'login' || segments[0] === 'inscription';
    const onPicker = segments[0] === 'profils';
    if (!user) {
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
    if (onAuth || onPicker) router.replace('/');
  }, [user, profile, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  return (
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
      <Stack.Screen name="profils" options={{ headerShown: false }} />
      <Stack.Screen name="compte" options={{ title: 'Compte' }} />
      <Stack.Screen name="search" options={{ title: 'Recherche' }} />
      <Stack.Screen name="film/[id]" options={{ title: '' }} />
      <Stack.Screen name="serie/[id]" options={{ title: '' }} />
      {/* Le lecteur est une modale plein ecran : fermer rend la pile intacte. */}
      <Stack.Screen
        name="player"
        options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }}
      />
    </Stack>
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
