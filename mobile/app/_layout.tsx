import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';
import { IS_TV } from '../lib/tv';
import { Loading } from '../components/ui';
import { BrandBar } from '../components/BrandBar';
import { AppBottomBar } from '../components/AppBottomBar';
import { SearchPanel } from '../components/SearchPanel';

function Gate() {
  const { user, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

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
     * « qui regarde ? », l'API repond 409 sur chaque ecran.
     */
    if (!profile) {
      if (!onPicker) router.replace('/profils');
      return;
    }
    if (onAuth || onPair || onPicker) router.replace('/');
  }, [user, profile, loading, segments, router]);

  // La recherche se ferme dès qu'on change d'écran (ouvrir un résultat, par ex.).
  const path = segments.join('/');
  useEffect(() => {
    setSearchOpen(false);
  }, [path]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  /*
   * Les deux barres, persistantes et globales.
   *
   * On ne les perd plus en entrant dans une fiche ou un réglage : elles vivent
   * ici, autour de la pile, et suivent toutes les pages de contenu. La barre du
   * haut ajoute un retour sur un écran empilé ; la recherche s'ouvre sur place,
   * par-dessus le contenu. On les cache là où elles n'ont pas leur place —
   * connexion, sélecteur de profil, lecteur plein écran — et sur téléviseur,
   * piloté par le haut (`TopNav`).
   */
  const seg = segments[0] ?? '';
  const fullscreen =
    seg === 'login' ||
    seg === 'inscription' ||
    seg === 'tv-pair' ||
    seg === 'profils' ||
    seg === 'player';
  const chrome = Boolean(user && profile) && !fullscreen && !IS_TV;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {chrome ? <BrandBar onSearch={() => setSearchOpen(true)} /> : null}
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="inscription" />
          <Stack.Screen name="tv-pair" />
          <Stack.Screen name="profils" />
          <Stack.Screen name="compte" />
          <Stack.Screen name="profil/[id]" />
          <Stack.Screen name="source/[id]" />
          <Stack.Screen name="associer-tv" />
          <Stack.Screen name="search" />
          <Stack.Screen name="film/[id]" />
          <Stack.Screen name="serie/[id]" />
          <Stack.Screen name="tag/[id]" />
          <Stack.Screen
            name="player"
            options={{ presentation: 'fullScreenModal', animation: 'fade' }}
          />
        </Stack>

        {chrome && searchOpen ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
            <SearchPanel onClose={() => setSearchOpen(false)} />
          </View>
        ) : null}
      </View>
      {chrome ? <AppBottomBar /> : null}
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
