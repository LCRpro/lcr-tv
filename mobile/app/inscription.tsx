import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SignupPolicy } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { colors, styles } from '../lib/theme';
import { Button, Loading } from '../components/ui';
import { Focusable } from '../components/Focusable';

/**
 * Création de compte.
 *
 * C'est l'autre porte d'entrée, à côté de la connexion. Le serveur décide si
 * elle est ouverte, fermée, ou gardée par un code (`SIGNUP_MODE`) : l'écran se
 * règle sur sa réponse plutôt que de promettre une inscription que la base
 * refuserait. Un compte, c'est le foyer ; les gens du foyer, eux, se créent
 * ensuite en profils, pas en comptes.
 */
export default function InscriptionScreen() {
  const router = useRouter();
  const { signup } = useSession();
  const policy = useAsync<SignupPolicy>(() => api.get('/api/auth/signup-policy'), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mode = policy.data?.mode;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signup(email.trim(), password, name.trim() || undefined, code.trim() || undefined);
      // Le Gate prend le relais : compte neuf -> profil unique -> accueil.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Inscription impossible. Le serveur est-il joignable depuis ce réseau ?",
      );
    } finally {
      setBusy(false);
    }
  };

  if (policy.loading && !policy.data) return <Loading />;

  if (mode === 'closed') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 28 }]}>
        <Text style={styles.h1}>Inscriptions fermées</Text>
        <Text style={[styles.dim, { marginTop: 8 }]}>
          Les comptes sont créés par l&apos;administrateur sur cette installation. Demandez-lui un
          accès, puis connectez-vous.
        </Text>
        <View style={{ height: 18 }} />
        <Button label="Retour à la connexion" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
        <View style={styles.brandDot}>
          <Text style={styles.brandDotText}>L</Text>
        </View>
        <Text style={[styles.h1, { marginTop: 18 }]}>Créer un compte</Text>
        <Text style={[styles.dim, { marginBottom: 22 }]}>
          Un compte par foyer. Vous ajouterez vos sources et vos profils ensuite.
        </Text>

        {error ? (
          <View style={[styles.notice, styles.noticeError]}>
            <Text style={styles.text}>{error}</Text>
          </View>
        ) : null}

        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
        <Field
          label="Mot de passe (10 caractères minimum)"
          value={password}
          onChange={setPassword}
          secure
        />
        <Field label="Nom du premier profil (facultatif)" value={name} onChange={setName} />
        {mode === 'code' ? (
          <Field label="Code d'invitation" value={code} onChange={setCode} />
        ) : null}

        <View style={{ height: 8 }} />
        <Button
          primary
          label={busy ? 'Création…' : 'Créer mon compte'}
          disabled={busy || email.length < 3 || password.length < 10}
          onPress={() => void submit()}
        />

        <Focusable onPress={() => router.replace('/login')} style={{ marginTop: 18 }}>
          <Text style={{ color: colors.accent, textAlign: 'center', fontWeight: '600' }}>
            J&apos;ai déjà un compte · Se connecter
          </Text>
        </Focusable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'email-address';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.dim, { marginBottom: 5 }]}>{label}</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        placeholderTextColor={colors.dim}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}
