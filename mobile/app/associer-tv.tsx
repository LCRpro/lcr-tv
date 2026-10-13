import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '../lib/api';
import { colors, radius, styles } from '../lib/theme';
import { Button } from '../components/ui';

/**
 * Associer une TV depuis le téléphone.
 *
 * On est déjà connecté : il suffit de recopier le code affiché par le
 * téléviseur. La TV, qui sonde, s'ouvre alors sur ce compte et le profil
 * actif. Pas de scan ici — une saisie de huit caractères va plus vite que
 * d'allumer l'appareil photo, et marche même sans permission caméra.
 */
export default function AssocierTvScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ deviceLabel: string | null }>('/api/tv/claim', {
        code: code.trim(),
      });
      setDoneLabel(res.deviceLabel ?? 'Téléviseur');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Association impossible. Réessayez dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (doneLabel) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center', padding: 28 }]}>
        <Stack.Screen options={{ title: 'Associer une TV' }} />
        <View style={done.badge}>
          <Ionicons name="checkmark" size={38} color={colors.onAccent} />
        </View>
        <Text style={[styles.h1, { textAlign: 'center', marginTop: 18 }]}>Téléviseur associé</Text>
        <Text style={[styles.dim, { textAlign: 'center', marginTop: 6 }]}>
          « {doneLabel} » s’ouvre sur votre compte. Revenez-y, c’est prêt.
        </Text>
        <View style={{ height: 22 }} />
        <Button label="Terminé" primary onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Associer une TV' }} />
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={styles.h1}>Associer une TV</Text>
        <Text style={[styles.dim, { marginTop: 6, marginBottom: 24, lineHeight: 20 }]}>
          Ouvrez LCR TV sur votre téléviseur : il affiche un code. Recopiez-le ici pour le connecter
          à votre compte.
        </Text>

        {error ? (
          <View style={[styles.notice, styles.noticeError]}>
            <Text style={styles.text}>{error}</Text>
          </View>
        ) : null}

        <Text style={[styles.dim, { marginBottom: 6 }]}>Code du téléviseur</Text>
        <TextInput
          style={[styles.input, { fontSize: 22, letterSpacing: 4, textAlign: 'center' }]}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="K7P2-9QMX"
          placeholderTextColor={colors.faint}
          value={code}
          onChangeText={setCode}
          maxLength={12}
        />

        <View style={{ height: 14 }} />
        <Button
          primary
          label={busy ? 'Association…' : 'Associer'}
          disabled={busy || code.trim().replace(/[^A-Za-z0-9]/g, '').length < 8}
          onPress={() => void submit()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const done = {
  badge: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
