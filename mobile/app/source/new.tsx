import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { api, ApiError } from '../../lib/api';
import { colors, radius, styles } from '../../lib/theme';
import { Focusable } from '../../components/Focusable';

type Kind = 'xtream' | 'm3u';

/**
 * Ajouter une source — son propre abonnement, saisi à la main.
 *
 * Deux sortes : un panel Xtream (serveur + identifiants) ou une playlist M3U
 * (une URL, et une grille XMLTV en option). Les identifiants partent chiffrés
 * au serveur du foyer et n'en ressortent jamais en clair. Une fois créée, la
 * source se synchronise en tâche de fond ; le catalogue se remplit tout seul.
 */
export default function AddSourceScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('xtream');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const credsOk = kind === 'm3u' || (username.trim().length > 0 && password.length > 0);
  const canSave = name.trim().length > 0 && baseUrl.trim().length > 0 && credsOk && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        kind === 'xtream'
          ? {
              kind,
              name: name.trim(),
              baseUrl: baseUrl.trim(),
              username: username.trim(),
              password,
              isActive: true,
            }
          : {
              kind,
              name: name.trim(),
              baseUrl: baseUrl.trim(),
              epgUrl: epgUrl.trim() || undefined,
              isActive: true,
            };
      await api.post('/api/providers', body);
      // On lance la synchronisation : le catalogue se remplit en tâche de fond.
      void api.post('/api/providers/sync').catch(() => {});
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajout impossible. Vérifiez les informations.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: 'Ajouter une source' }} />

      <Text style={ss.label}>Type de source</Text>
      <View style={ss.seg}>
        <Focusable
          onPress={() => setKind('xtream')}
          style={[ss.segBtn, kind === 'xtream' && ss.segBtnOn]}
        >
          <Text style={[ss.segText, kind === 'xtream' && ss.segTextOn]}>Panel Xtream</Text>
        </Focusable>
        <Focusable onPress={() => setKind('m3u')} style={[ss.segBtn, kind === 'm3u' && ss.segBtnOn]}>
          <Text style={[ss.segText, kind === 'm3u' && ss.segTextOn]}>Playlist M3U</Text>
        </Focusable>
      </View>

      {error ? (
        <View style={[styles.notice, styles.noticeError, { marginTop: 16 }]}>
          <Text style={styles.text}>{error}</Text>
        </View>
      ) : null}

      <Text style={ss.label}>Nom</Text>
      <TextInput
        style={styles.input}
        placeholder="Mon abonnement"
        placeholderTextColor={colors.dim}
        value={name}
        onChangeText={setName}
        maxLength={120}
      />

      <Text style={ss.label}>{kind === 'xtream' ? 'URL du serveur' : 'URL de la playlist M3U'}</Text>
      <TextInput
        style={styles.input}
        placeholder={kind === 'xtream' ? 'http://serveur.exemple:8080' : 'http://…/get.php?…'}
        placeholderTextColor={colors.dim}
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={500}
      />

      {kind === 'xtream' ? (
        <>
          <Text style={ss.label}>Nom d’utilisateur</Text>
          <TextInput
            style={styles.input}
            placeholder="Identifiant"
            placeholderTextColor={colors.dim}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
          />
          <Text style={ss.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor={colors.dim}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
          />
        </>
      ) : (
        <>
          <Text style={ss.label}>Grille XMLTV (facultatif)</Text>
          <TextInput
            style={styles.input}
            placeholder="http://…/xmltv.php (optionnel)"
            placeholderTextColor={colors.dim}
            value={epgUrl}
            onChangeText={setEpgUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={500}
          />
        </>
      )}

      <Focusable
        onPress={() => void save()}
        disabled={!canSave}
        style={[ss.save, !canSave && { opacity: 0.5 }]}
      >
        <Text style={ss.saveText}>{busy ? 'Ajout…' : 'Ajouter la source'}</Text>
      </Focusable>

      <Text style={[styles.faint, { marginTop: 16, lineHeight: 18 }]}>
        Vos identifiants partent chiffrés sur votre serveur et n’en ressortent jamais en clair. La
        source se synchronise ensuite toute seule.
      </Text>
    </ScrollView>
  );
}

const ss = {
  label: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    marginTop: 20,
    marginBottom: 9,
  },
  seg: {
    flexDirection: 'row' as const,
    gap: 8,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center' as const,
  },
  segBtnOn: { backgroundColor: colors.accent },
  segText: { color: colors.dim, fontSize: 14, fontWeight: '700' as const },
  segTextOn: { color: colors.onAccent },
  save: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center' as const,
    marginTop: 28,
  },
  saveText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' as const },
};
