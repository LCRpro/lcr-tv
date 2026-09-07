import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Profile } from '@iptv/shared';
import { useSession } from '../lib/session';
import { styles } from '../lib/theme';
import { Focusable } from '../components/Focusable';
import { Avatar } from '../components/ProfileAvatar';

/**
 * « Qui regarde ? », sur telephone et televiseur.
 *
 * Le compte est celui du foyer, le profil celui de la personne. L'ecran arrive
 * juste apres la connexion quand le compte a plusieurs profils — s'il n'en a
 * qu'un, la session le choisit seule et cet ecran n'apparait jamais : poser une
 * question a laquelle il n'existe qu'une reponse est un ecran de trop.
 */
export default function ProfilesScreen() {
  const router = useRouter();
  const { profiles, selectProfile } = useSession();
  const [busy, setBusy] = useState(false);

  const choose = async (p: Profile) => {
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
      <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
        <Text style={[styles.h1, { textAlign: 'center', marginBottom: 4 }]}>Qui regarde ?</Text>
        <Text style={[styles.dim, { textAlign: 'center', marginBottom: 30 }]}>
          Chaque profil garde sa liste, son historique et ses chaînes épinglées.
        </Text>

        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 22 }}
        >
          {profiles.map((p) => (
            <Focusable key={p.id} onPress={() => void choose(p)} disabled={busy}>
              <View style={{ alignItems: 'center', gap: 9, width: 104 }}>
                <Avatar avatar={p.avatar} color={p.color} size={88} />
                <Text style={[styles.text, { fontWeight: '600' }]} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.isKid ? <Text style={styles.faint}>ENFANT</Text> : null}
              </View>
            </Focusable>
          ))}
        </View>

        {/* La creation et la suppression restent sur le web : elles demandent un
            clavier et des reglages fins qu'on ne fait pas a la telecommande. */}
        <Text style={[styles.faint, { marginTop: 30, textAlign: 'center' }]}>
          Les profils se créent et se modifient depuis le navigateur.
        </Text>
      </ScrollView>
    </View>
  );
}
