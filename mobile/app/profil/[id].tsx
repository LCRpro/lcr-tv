import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  PROFILE_AVATARS,
  PROFILE_COLORS,
  type ProfileAvatar,
  type ProfileColor,
} from '@iptv/shared';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { confirmAction } from '../../lib/confirm';
import { colors, radius, styles } from '../../lib/theme';
import { Avatar, ColorSwatch, avatarGlyph } from '../../components/ProfileAvatar';
import { Focusable } from '../../components/Focusable';

/**
 * L'éditeur de profil — créer, renommer, choisir sa vignette, supprimer.
 *
 * Le compte est celui du foyer ; chaque personne a son profil, avec sa liste,
 * son historique et ses étiquettes. On arrive ici depuis le compte, pour un
 * profil existant ou un nouveau (`/profil/new`). La vignette se choisit dans une
 * grille d'icônes et une teinte — pas de fichier à téléverser, rien à modérer.
 */
export default function ProfileEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profiles, profile: active, refresh } = useSession();

  const isNew = id === 'new';
  const existing = isNew ? null : (profiles.find((p) => p.id === Number(id)) ?? null);

  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState<ProfileAvatar>(existing?.avatar ?? 'wave');
  const [color, setColor] = useState<ProfileColor>(existing?.color ?? 'cyan');
  const [isKid, setIsKid] = useState(existing?.isKid ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), avatar, color, isKid };
    try {
      if (isNew) await api.post('/api/profiles', body);
      else if (existing) await api.patch(`/api/profiles/${existing.id}`, body);
      await refresh();
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
      title: 'Supprimer ce profil ?',
      message: `« ${existing.name} », sa liste et son historique seront effacés.`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        try {
          await api.del(`/api/profiles/${existing.id}`);
          await refresh();
          router.back();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
        }
      },
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 96 }}>
      <Stack.Screen options={{ title: isNew ? 'Nouveau profil' : 'Modifier le profil' }} />

      {/* L'aperçu : l'avatar tel qu'il sera, et le nom en direct. */}
      <View style={ps.preview}>
        <Avatar avatar={avatar} color={color} size={88} />
        <Text style={ps.previewName} numberOfLines={1}>
          {name.trim() || 'Nouveau profil'}
        </Text>
      </View>

      {error ? (
        <View style={[styles.notice, styles.noticeError]}>
          <Text style={styles.text}>{error}</Text>
        </View>
      ) : null}

      <Text style={ps.label}>Nom</Text>
      <TextInput
        style={[styles.input, { fontFamily: 'Inter' }]}
        placeholder="Prénom"
        placeholderTextColor={colors.faint}
        value={name}
        onChangeText={setName}
        maxLength={24}
        autoCapitalize="words"
      />

      {/* Vignette : des tuiles neutres ; seule la sélection prend l'accent. */}
      <Text style={ps.label}>Vignette</Text>
      <View style={ps.grid}>
        {PROFILE_AVATARS.map((a) => {
          const on = avatar === a;
          return (
            <Focusable
              key={a}
              onPress={() => setAvatar(a)}
              style={[ps.tile, on && ps.tileOn]}
            >
              <Ionicons
                name={avatarGlyph(a)}
                size={24}
                color={on ? colors.accent : colors.dim}
              />
            </Focusable>
          );
        })}
      </View>

      {/* Couleur : des pastilles rondes ; la sélection porte un anneau net. */}
      <Text style={ps.label}>Couleur</Text>
      <View style={ps.swatches}>
        {PROFILE_COLORS.map((c) => {
          const on = color === c;
          return (
            <Focusable
              key={c}
              onPress={() => setColor(c)}
              style={[ps.swatchRing, on && ps.swatchRingOn]}
            >
              <ColorSwatch color={c} size={30} />
              {on ? (
                <View style={ps.swatchCheck}>
                  <Ionicons name="checkmark" size={13} color={colors.onAccent} />
                </View>
              ) : null}
            </Focusable>
          );
        })}
      </View>

      <View style={ps.divider} />

      <View style={ps.kidRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ps.kidTitle}>Profil enfant</Text>
          <Text style={styles.dim}>Masque les chaînes et films réservés aux adultes.</Text>
        </View>
        <Switch
          value={isKid}
          onValueChange={setIsKid}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor="#fff"
        />
      </View>

      <Focusable
        onPress={() => void save()}
        disabled={!canSave}
        style={[ps.save, !canSave && { opacity: 0.5 }]}
      >
        <Text style={ps.saveText}>{busy ? 'Enregistrement…' : isNew ? 'Créer le profil' : 'Enregistrer'}</Text>
      </Focusable>

      {existing && profiles.length > 1 && existing.id !== active?.id ? (
        <Focusable onPress={remove} style={ps.delete}>
          <Text style={ps.deleteText}>Supprimer ce profil</Text>
        </Focusable>
      ) : existing && existing.id === active?.id ? (
        <Text style={[styles.faint, { textAlign: 'center', marginTop: 16 }]}>
          Le profil en cours d’utilisation ne peut pas être supprimé d’ici.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const ps = {
  preview: { alignItems: 'center' as const, gap: 12, marginTop: 4, marginBottom: 12 },
  previewName: {
    color: colors.text,
    fontFamily: 'Outfit' as const,
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  label: {
    color: colors.dim,
    fontFamily: 'Inter' as const,
    fontSize: 11.5,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    marginTop: 22,
    marginBottom: 11,
  },

  // Les vignettes : tuiles neutres, l'icône en sourdine ; la sélection s'allume.
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tileOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },

  // Les couleurs : pastilles rondes, anneau net sur la sélection, sans halo.
  swatches: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14 },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  swatchRingOn: { borderColor: colors.text },
  swatchCheck: {
    position: 'absolute' as const,
    right: -1,
    bottom: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  divider: { height: 1, backgroundColor: colors.border, marginTop: 24 },
  kidRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginTop: 18,
    paddingVertical: 6,
  },
  kidTitle: {
    color: colors.text,
    fontFamily: 'Outfit' as const,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  save: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center' as const,
    marginTop: 26,
  },
  saveText: {
    color: colors.onAccent,
    fontFamily: 'Outfit' as const,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  delete: { paddingVertical: 14, alignItems: 'center' as const, marginTop: 8 },
  deleteText: {
    color: colors.live,
    fontFamily: 'Outfit' as const,
    fontSize: 14,
    fontWeight: '700' as const,
  },
};
