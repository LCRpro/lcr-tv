import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ProviderView } from '@iptv/shared';
import { api, ApiError } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { confirmAction } from '../../lib/confirm';
import { colors, radius, styles } from '../../lib/theme';
import { Focusable } from '../../components/Focusable';

type Kind = 'xtream' | 'm3u';

/**
 * Ajouter ou modifier une source — son propre abonnement, saisi à la main.
 *
 * Un panel Xtream (serveur + identifiants) ou une playlist M3U (une URL, une
 * grille XMLTV en option). En modification, les identifiants ne se relisent
 * jamais en clair : on laisse les champs vides pour garder les actuels. Les
 * identifiants partent chiffrés au serveur du foyer, et la source se
 * synchronise ensuite toute seule.
 */
export default function SourceEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  // En modification, on retrouve la source dans la liste du compte.
  const providers = useAsync<{ items: ProviderView[] }>(
    () => (isNew ? Promise.resolve({ items: [] }) : api.get('/api/providers')),
    [isNew],
  );
  const existing = isNew ? null : (providers.data?.items.find((p) => p.id === Number(id)) ?? null);

  const [kind, setKind] = useState<Kind>('xtream');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Préremplir quand la source existante est chargée.
  useEffect(() => {
    if (!existing) return;
    setKind(existing.kind);
    setName(existing.name);
    setBaseUrl(existing.baseUrl);
    setEpgUrl(existing.epgUrl ?? '');
    setActive(existing.isActive);
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const credsOk = isNew ? kind === 'm3u' || (username.trim().length > 0 && password.length > 0) : true;
  const canSave = name.trim().length > 0 && baseUrl.trim().length > 0 && credsOk && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        const body =
          kind === 'xtream'
            ? {
                kind,
                name: name.trim(),
                baseUrl: baseUrl.trim(),
                username: username.trim(),
                password,
                isActive: active,
              }
            : {
                kind,
                name: name.trim(),
                baseUrl: baseUrl.trim(),
                epgUrl: epgUrl.trim() || undefined,
                isActive: active,
              };
        await api.post('/api/providers', body);
      } else {
        // Seuls les champs renseignés changent ; les identifiants vides gardent les actuels.
        const patch: Record<string, unknown> = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          isActive: active,
        };
        if (kind === 'xtream') {
          if (username.trim()) patch.username = username.trim();
          if (password) patch.password = password;
        } else {
          patch.epgUrl = epgUrl.trim();
        }
        await api.patch(`/api/providers/${existing!.id}`, patch);
      }
      void api.post('/api/providers/sync').catch(() => {});
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    confirmAction({
      title: 'Supprimer cette source ?',
      message: `« ${existing.name} » et son catalogue seront retirés.`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        try {
          await api.del(`/api/providers/${existing.id}`);
          router.back();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
        }
      },
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: isNew ? 'Ajouter une source' : 'Modifier la source' }} />

      <Text style={ss.label}>Type de source</Text>
      {isNew ? (
        <View style={ss.seg}>
          <Focusable
            onPress={() => setKind('xtream')}
            style={[ss.segBtn, kind === 'xtream' && ss.segBtnOn]}
          >
            <Text style={[ss.segText, kind === 'xtream' && ss.segTextOn]}>Panel Xtream</Text>
          </Focusable>
          <Focusable
            onPress={() => setKind('m3u')}
            style={[ss.segBtn, kind === 'm3u' && ss.segBtnOn]}
          >
            <Text style={[ss.segText, kind === 'm3u' && ss.segTextOn]}>Playlist M3U</Text>
          </Focusable>
        </View>
      ) : (
        <Text style={ss.fixed}>{kind === 'm3u' ? 'Playlist M3U' : 'Panel Xtream'}</Text>
      )}

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
            placeholder={isNew ? 'Identifiant' : 'Laisser vide pour garder l’actuel'}
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
            placeholder={isNew ? 'Mot de passe' : 'Laisser vide pour garder l’actuel'}
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

      <View style={ss.activeRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ss.activeTitle}>Active sur le compte</Text>
          <Text style={styles.dim}>Éteinte, aucune profil ne peut l’utiliser.</Text>
        </View>
        <Switch
          value={active}
          onValueChange={setActive}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor="#fff"
        />
      </View>

      <Focusable
        onPress={() => void save()}
        disabled={!canSave}
        style={[ss.save, !canSave && { opacity: 0.5 }]}
      >
        <Text style={ss.saveText}>
          {busy ? 'Enregistrement…' : isNew ? 'Ajouter la source' : 'Enregistrer'}
        </Text>
      </Focusable>

      {existing ? (
        <Focusable onPress={remove} style={ss.delete}>
          <Text style={ss.deleteText}>Supprimer cette source</Text>
        </Focusable>
      ) : (
        <Text style={[styles.faint, { marginTop: 16, lineHeight: 18 }]}>
          Vos identifiants partent chiffrés sur votre serveur et n’en ressortent jamais en clair.
        </Text>
      )}
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
  fixed: { color: colors.text, fontSize: 15, fontWeight: '700' as const },
  seg: {
    flexDirection: 'row' as const,
    gap: 8,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' as const },
  segBtnOn: { backgroundColor: colors.accent },
  segText: { color: colors.dim, fontSize: 14, fontWeight: '700' as const },
  segTextOn: { color: colors.onAccent },
  activeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 24,
    paddingVertical: 4,
  },
  activeTitle: { color: colors.text, fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.2 },
  save: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center' as const,
    marginTop: 24,
  },
  saveText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' as const },
  delete: { paddingVertical: 14, alignItems: 'center' as const, marginTop: 8 },
  deleteText: { color: colors.live, fontSize: 14, fontWeight: '700' as const },
};
