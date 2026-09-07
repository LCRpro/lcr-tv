import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { colors, styles } from '../lib/theme';
import { Button } from '../components/ui';

export default function LoginScreen() {
  const { login } = useSession();
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
    <KeyboardAvoidingView
      style={[styles.screen, { justifyContent: 'center', padding: 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.h1}>Connexion</Text>
      <Text style={[styles.dim, { marginBottom: 20 }]}>
        Accès réservé. Les comptes sont créés par l&apos;administrateur.
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
    </KeyboardAvoidingView>
  );
}
