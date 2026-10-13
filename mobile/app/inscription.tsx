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
import { AuthBackdrop } from '../components/AuthBackdrop';

/** La même exigence qu'au changement de mot de passe, et que sur le web. */
const MIN_PASSWORD = 10;

/**
 * Création de compte.
 *
 * C'est l'autre porte d'entrée, à côté de la connexion. Le serveur décide si
 * elle est ouverte, fermée, ou gardée par un code (`SIGNUP_MODE`) : l'écran se
 * règle sur sa réponse. Les champs, leur ordre et leurs mots sont ceux du web,
 * à l'identique — un même produit ne doit pas poser deux fois la même question
 * de deux façons différentes selon l'écran.
 */
export default function InscriptionScreen() {
  const router = useRouter();
  const { signup } = useSession();
  const policy = useAsync<SignupPolicy>(() => api.get('/api/auth/signup-policy'), []);

  const [email, setEmail] = useState('');
  const [profileName, setProfileName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mode = policy.data?.mode;
  const longEnough = password.length >= MIN_PASSWORD;
  const same = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async () => {
    if (mismatch || !longEnough) return;
    setBusy(true);
    setError(null);
    try {
      await signup(email.trim(), password, profileName.trim() || undefined, code.trim() || undefined);
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
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AuthBackdrop />
        <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
          <Text style={styles.h1}>Inscriptions fermées</Text>
          <Text style={[styles.dim, { marginTop: 8 }]}>
            Cette installation ne crée pas de compte en libre-service. Demandez-en un à
            l&apos;administrateur, puis connectez-vous.
          </Text>
          <View style={{ height: 18 }} />
          <Button label="Retour à la connexion" onPress={() => router.replace('/login')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
          <Text style={styles.h1}>Créer un compte</Text>
          <Text style={[styles.dim, { marginBottom: 22 }]}>
            Juste un compte pour votre foyer. Vous ajouterez vos chaînes et vos profils une fois à
            l&apos;intérieur.
          </Text>

          {error ? (
            <View style={[styles.notice, styles.noticeError]}>
              <Text style={styles.text}>{error}</Text>
            </View>
          ) : null}

          <Field
            label="Adresse e-mail"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
          />
          <Field
            label="Prénom du premier profil"
            value={profileName}
            onChange={setProfileName}
            placeholder="Facultatif — sinon tiré de l’adresse"
            maxLength={24}
          />
          <Field
            label="Mot de passe"
            value={password}
            onChange={setPassword}
            secure={!reveal}
            onToggleReveal={() => setReveal((r) => !r)}
            revealed={reveal}
            note={
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                <Text style={[cs.check, longEnough && cs.checkOk]}>
                  {longEnough ? '✓' : '·'} {MIN_PASSWORD} caractères
                </Text>
                <Text style={[cs.check, same && cs.checkOk]}>
                  {same ? '✓' : '·'} les deux identiques
                </Text>
              </View>
            }
          />
          <Field
            label="Confirmation"
            value={confirm}
            onChange={setConfirm}
            secure={!reveal}
            error={mismatch ? 'Les deux mots de passe diffèrent.' : undefined}
          />
          {mode === 'code' ? (
            <Field
              label="Code d'invitation"
              value={code}
              onChange={setCode}
              note={
                <Text style={[cs.check, { marginTop: 6 }]}>
                  Cette installation demande un code : votre administrateur vous l’a donné.
                </Text>
              }
            />
          ) : null}

          <View style={{ height: 8 }} />
          <Button
            primary
            label={busy ? 'Création…' : 'Créer mon compte'}
            disabled={busy || mismatch || !longEnough || email.trim().length < 3}
            onPress={() => void submit()}
          />

          <Focusable onPress={() => router.replace('/login')} style={{ marginTop: 18 }}>
            <Text style={{ color: colors.accent, textAlign: 'center', fontWeight: '600' }}>
              J&apos;ai déjà un compte · Se connecter
            </Text>
          </Focusable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
  placeholder,
  maxLength,
  note,
  error,
  onToggleReveal,
  revealed,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'email-address';
  placeholder?: string;
  maxLength?: number;
  note?: React.ReactNode;
  error?: string;
  onToggleReveal?: () => void;
  revealed?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={styles.dim}>{label}</Text>
        {onToggleReveal ? (
          <Focusable onPress={onToggleReveal} hitSlop={8}>
            <Text style={[styles.dim, { color: colors.accent }]}>
              {revealed ? 'Masquer' : 'Afficher'}
            </Text>
          </Focusable>
        ) : null}
      </View>
      <TextInput
        style={[styles.input, error ? { borderColor: colors.live } : null]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        placeholder={placeholder}
        maxLength={maxLength}
        placeholderTextColor={colors.faint}
        value={value}
        onChangeText={onChange}
      />
      {error ? <Text style={[cs.check, { color: colors.live, marginTop: 6 }]}>{error}</Text> : null}
      {note}
    </View>
  );
}

const cs = {
  check: { color: colors.faint, fontSize: 12 },
  checkOk: { color: colors.ok },
};
