import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Profile } from '@iptv/shared';
import { useSession } from '../lib/session';
import { colors, styles } from '../lib/theme';
import { Focusable } from '../components/Focusable';
import { Avatar } from '../components/ProfileAvatar';

/**
 * « Qui regarde ? », sur telephone et televiseur.
 *
 * Le compte est celui du foyer, le profil celui de la personne. L'ecran arrive
 * juste apres la connexion quand le compte a plusieurs profils — s'il n'en a
 * qu'un, la session le choisit seule et cet ecran n'apparait jamais : poser une
 * question a laquelle il n'existe qu'une reponse est un ecran de trop.
 *
 * C'est la premiere chose qu'on voit de l'application : de grandes vignettes en
 * degrade, deux par rangee, posees au centre de l'ecran de nuit. Rien d'autre.
 */
export default function ProfilesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, selectProfile } = useSession();
  const [busy, setBusy] = useState(false);

  const choose = async (p: Profile) => {
    if (busy) return;
    setBusy(true);
    try {
      await selectProfile(p.id);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { justifyContent: 'center' }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 28,
          alignItems: 'center',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <View style={styles.brandDot}>
          <Text style={styles.brandDotText}>L</Text>
        </View>
        <Text style={pickerStyles.title}>Qui regarde&nbsp;?</Text>
        <Text style={pickerStyles.sub}>
          Chaque profil garde sa liste, son historique et ses chaînes épinglées.
        </Text>

        <View style={pickerStyles.grid}>
          {profiles.map((p) => (
            <Focusable key={p.id} onPress={() => void choose(p)} disabled={busy}>
              <View style={pickerStyles.cell}>
                <Avatar avatar={p.avatar} color={p.color} size={112} />
                <Text style={pickerStyles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.isKid ? <Text style={styles.faint}>ENFANT</Text> : null}
              </View>
            </Focusable>
          ))}
        </View>

        {/* La creation et la suppression restent sur le web : elles demandent un
            clavier et des reglages fins qu'on ne fait pas a la telecommande. */}
        <Text style={pickerStyles.hint}>
          Les profils se créent et se modifient depuis le navigateur.
        </Text>
      </ScrollView>
    </View>
  );
}

const pickerStyles = {
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  sub: {
    color: colors.dim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center' as const,
    maxWidth: 320,
    marginBottom: 40,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 30,
    maxWidth: 420,
  },
  cell: {
    alignItems: 'center' as const,
    gap: 13,
    width: 128,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  hint: {
    color: colors.faint,
    fontSize: 13,
    marginTop: 40,
    textAlign: 'center' as const,
  },
};
