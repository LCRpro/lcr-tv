import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
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
          <Stack.Screen name="favoris" />
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
  /*
   * Les polices de la charte.
   *
   * Sur le web, on injecte la feuille Google Fonts (toutes les graisses d'Outfit
   * et d'Inter), et `useFonts({})` est prêt d'emblée : on laisse le navigateur
   * choisir la graisse exacte depuis `fontWeight`, sans fausse graisse. Sur
   * mobile natif, `expo-font` fournit Outfit et Inter sous les mêmes noms de
   * famille, et l'app attend qu'elles soient prêtes avant de s'afficher, pour
   * ne pas montrer un premier rendu dans la police système.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('lcrtv-fonts')) return;
    const link = document.createElement('link');
    link.id = 'lcrtv-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap';
    document.head.appendChild(link);
    // Inter devient la famille héritée par défaut : tout texte sans police
    // explicite la prend (react-native-web laisse hériter la cascade CSS), les
    // titres et boutons demandant Outfit à la main. `defaultProps` ne marche
    // plus sous React 19, d'où cette règle au lieu d'un défaut sur <Text>.
    const base = document.createElement('style');
    base.id = 'lcrtv-font-base';
    base.textContent =
      ":root,body,#root{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}";
    document.head.appendChild(base);
  }, []);

  const [fontsReady] = useFonts(
    Platform.OS === 'web'
      ? {}
      : {
          Inter: Inter_400Regular,
          'Inter-Semi': Inter_600SemiBold,
          'Inter-Bold': Inter_700Bold,
          Outfit: Outfit_700Bold,
          'Outfit-Semi': Outfit_600SemiBold,
          'Outfit-Black': Outfit_800ExtraBold,
        },
  );

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
