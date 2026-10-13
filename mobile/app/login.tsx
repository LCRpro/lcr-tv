import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SignupPolicy } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { colors, styles } from '../lib/theme';
import { Button } from '../components/ui';
import { Focusable } from '../components/Focusable';
import { AuthBackdrop } from '../components/AuthBackdrop';

export default function LoginScreen() {
  const { login } = useSession();
  const router = useRouter();
  // La porte d'inscription ne s'affiche que si le serveur l'ouvre.
  const policy = useAsync<SignupPolicy>(() => api.get('/api/auth/signup-policy'), []);
  const canSignup = policy.data ? policy.data.mode !== 'closed' : false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Connexion impossible. Le serveur est-il joignable depuis ce reseau ?",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'center', padding: 24 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.h1}>Connexion</Text>
      <Text style={[styles.dim, { marginBottom: 20 }]}>
        Avec l&apos;adresse et le mot de passe du compte.
      </Text>

      {error ? (
        <View style={[styles.notice, styles.noticeError]}>
          <Text style={styles.text}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.dim, { marginBottom: 4 }]}>Email</Text>
      <TextInput
        style={[styles.input, { marginBottom: 14 }]}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        placeholderTextColor={colors.dim}
        value={email}
        onChangeText={setEmail}
      />

      <Text style={[styles.dim, { marginBottom: 4 }]}>Mot de passe</Text>
      <TextInput
        style={[styles.input, { marginBottom: 20 }]}
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
        placeholderTextColor={colors.dim}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
      />

      <Button
        label={busy ? 'Connexion…' : 'Se connecter'}
        primary
        disabled={busy}
        onPress={() => void submit()}
      />

      {canSignup ? (
        <Focusable onPress={() => router.push('/inscription')} style={{ marginTop: 18 }}>
          <Text style={{ textAlign: 'center' }}>
            <Text style={styles.dim}>Pas encore de compte ? </Text>
            <Text style={{ color: colors.accent, fontWeight: '600' }}>Créer un compte</Text>
          </Text>
        </Focusable>
      ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
