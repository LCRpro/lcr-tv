import { useState } from 'react';
import { Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AVATAR_GROUPS,
  PROFILE_COLORS,
  isPhotoAvatar,
  languageTag,
  type AvatarId,
  type CatalogLanguage,
  type ProfileAvatar,
  type ProfileColor,
} from '@iptv/shared';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { confirmAction } from '../../lib/confirm';
import { toastError, toastOk } from '../../lib/toast';
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
  const [avatar, setAvatar] = useState<AvatarId>(existing?.avatar ?? 'wave');
  const [color, setColor] = useState<ProfileColor>(existing?.color ?? 'cyan');
  // On ouvre la grille sur la famille de la vignette actuelle (une photo d'animal
  // ramène sur sa catégorie, une icône sur « Icônes »).
  const [group, setGroup] = useState<string>(() => {
    const a = existing?.avatar;
    if (a && isPhotoAvatar(a)) return AVATAR_GROUPS.find((g) => g.ids.includes(a))?.key ?? 'icons';
    return 'icons';
  });
  const currentGroup = AVATAR_GROUPS.find((g) => g.key === group) ?? AVATAR_GROUPS[0]!;
  const [isKid, setIsKid] = useState(existing?.isKid ?? false);

  // Les filtres de langue, un par type. Vides = aucun filtre (tout remonte).
  const [langFilters, setLangFilters] = useState<{ vod: string[]; series: string[]; live: string[] }>(
    () => ({
      vod: existing?.languageFilters?.vod ?? [],
      series: existing?.languageFilters?.series ?? [],
      live: existing?.languageFilters?.live ?? [],
    }),
  );
  const langs = useAsync<{ items: CatalogLanguage[] }>(() => api.get('/api/languages'), []);
  // Les langues du catalogue si le fournisseur en a assez ; sinon un socle
  // courant, pour que le réglage reste utilisable même sur un petit catalogue.
  const langOptions = ((): { code: string; label: string; flag: string | null }[] => {
    const fromCatalog = langs.data?.items ?? [];
    const base =
      fromCatalog.length > 0
        ? fromCatalog.map((l) => ({ code: l.code, label: l.label, flag: l.flag }))
        : ['FR', 'EN', 'ES', 'DE', 'IT', 'PT', 'AR', 'NL'].map((c) => {
            const t = languageTag(c);
            return { code: c, label: t?.label ?? c, flag: t?.flag ?? null };
          });
    // On ajoute les langues déjà choisies qui ne seraient pas dans la liste.
    const chosen = [...langFilters.vod, ...langFilters.series, ...langFilters.live];
    for (const c of chosen) {
      if (!base.some((b) => b.code === c)) {
        const t = languageTag(c);
        base.push({ code: c, label: t?.label ?? c, flag: t?.flag ?? null });
      }
    }
    return base;
  })();

  const toggleLang = (kind: 'vod' | 'series' | 'live', code: string) => {
    setLangFilters((prev) => {
      const on = prev[kind].includes(code);
      return { ...prev, [kind]: on ? prev[kind].filter((c) => c !== code) : [...prev[kind], code] };
    });
  };

  // « Mêmes langues pour les trois » : on recopie le réglage des films partout.
  const syncAll = () => setLangFilters((prev) => ({ vod: prev.vod, series: [...prev.vod], live: [...prev.vod] }));

  const [busy, setBusy] = useState(false);

  const canSave = name.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const body = { name: name.trim(), avatar, color, isKid, languageFilters: langFilters };
    try {
      if (isNew) await api.post('/api/profiles', body);
      else if (existing) await api.patch(`/api/profiles/${existing.id}`, body);
      await refresh();
      toastOk(isNew ? 'Profil créé' : 'Profil enregistré');
      router.back();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
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
          toastOk('Profil supprimé');
          router.back();
        } catch (err) {
          toastError(err instanceof ApiError ? err.message : 'Suppression impossible.');
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

      {/* Vignette : des familles (icônes, chats, chiens, sauvages). Les icônes
          restent des tuiles neutres ; les photos s'affichent telles quelles. */}
      <Text style={ps.label}>Vignette</Text>
      <View style={ps.cats}>
        {AVATAR_GROUPS.map((g) => {
          const on = g.key === group;
          return (
            <Focusable key={g.key} onPress={() => setGroup(g.key)} style={[ps.cat, on && ps.catOn]}>
              <Text style={[ps.catText, on && ps.catTextOn]}>{g.label}</Text>
            </Focusable>
          );
        })}
      </View>
      <View style={ps.grid}>
        {currentGroup.ids.map((a) => {
          const on = avatar === a;
          if (group === 'icons') {
            return (
              <Focusable
                key={a}
                onPress={() => setAvatar(a as AvatarId)}
                style={[ps.tile, on && ps.tileOn]}
              >
                <Ionicons
                  name={avatarGlyph(a as ProfileAvatar)}
                  size={24}
                  color={on ? colors.accent : colors.dim}
                />
              </Focusable>
            );
          }
          return (
            <Focusable
              key={a}
              onPress={() => setAvatar(a as AvatarId)}
              style={[ps.photo, on && ps.photoOn]}
            >
              <Avatar avatar={a as AvatarId} color={color} size={52} />
              {on ? (
                <View style={ps.photoCheck}>
                  <Ionicons name="checkmark" size={12} color={colors.onAccent} />
                </View>
              ) : null}
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

      {/* Filtres de langue, un par type. Vide = tout ; sinon, on ne montre que
          ce qui existe dans l'une des langues choisies. */}
      <Text style={ps.label}>Langues du catalogue</Text>
      <Text style={[styles.dim, { marginTop: -4, marginBottom: 12, lineHeight: 18 }]}>
        Laissez vide pour tout voir. Sinon, chaque type ne montre que ce qui est disponible dans
        ces langues.
      </Text>
      <LangFilterRow
        title="Films"
        options={langOptions}
        selected={langFilters.vod}
        onToggle={(c) => toggleLang('vod', c)}
      />
      <LangFilterRow
        title="Séries"
        options={langOptions}
        selected={langFilters.series}
        onToggle={(c) => toggleLang('series', c)}
      />
      <LangFilterRow
        title="Direct"
        options={langOptions}
        selected={langFilters.live}
        onToggle={(c) => toggleLang('live', c)}
      />
      <Focusable onPress={syncAll} style={({ pressed }) => [ps.syncBtn, pressed && { opacity: 0.7 }]}>
        <Ionicons name="copy-outline" size={16} color={colors.accent} />
        <Text style={ps.syncText}>Mêmes langues pour les trois (celles des films)</Text>
      </Focusable>

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

/** Un type (Films, Séries, Direct) et ses langues en puces à cocher. */
function LangFilterRow({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { code: string; label: string; flag: string | null }[];
  selected: string[];
  onToggle: (code: string) => void;
}) {
  return (
    <View style={ps.langBlock}>
      <View style={ps.langHead}>
        <Text style={ps.langTitle}>{title}</Text>
        {selected.length > 0 ? (
          <Text style={ps.langCount}>{selected.length}</Text>
        ) : (
          <Text style={ps.langAll}>Toutes</Text>
        )}
      </View>
      <View style={ps.langChips}>
        {options.map((o) => {
          const on = selected.includes(o.code);
          return (
            <Focusable
              key={o.code}
              onPress={() => onToggle(o.code)}
              style={[ps.langChip, on && ps.langChipOn]}
            >
              <Text style={[ps.langChipText, on && ps.langChipTextOn]}>
                {o.flag ? `${o.flag} ` : ''}
                {o.label}
              </Text>
            </Focusable>
          );
        })}
      </View>
    </View>
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

  // Les familles de vignettes, en onglets sobres.
  cats: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginBottom: 14 },
  cat: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  catText: { color: colors.dim, fontFamily: 'Inter' as const, fontSize: 13, fontWeight: '600' as const },
  catTextOn: { color: colors.accent },

  // Les vignettes : tuiles neutres pour les icônes, photos telles quelles ;
  // la sélection s'allume (bordure accent + coche sur les photos).
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
  photo: {
    padding: 2,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  photoOn: { borderColor: colors.accent },
  photoCheck: {
    position: 'absolute' as const,
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

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

  // Filtres de langue, par type.
  langBlock: { marginBottom: 14 },
  langHead: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  langTitle: { color: colors.text, fontFamily: 'Outfit' as const, fontSize: 14, fontWeight: '700' as const },
  langCount: { color: colors.accent, fontFamily: 'Inter' as const, fontSize: 12, fontWeight: '700' as const },
  langAll: { color: colors.faint, fontFamily: 'Inter' as const, fontSize: 12 },
  langChips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  langChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  langChipText: {
    color: colors.dim,
    // Sur le web (Windows surtout), Inter n'a pas les drapeaux : on ajoute la
    // police emoji couleur en repli pour que 🇫🇷 s'affiche au lieu de « FR ».
    fontFamily: Platform.select({ web: "Inter, 'Noto Color Emoji'", default: 'Inter' }),
    fontSize: 13,
    fontWeight: '600' as const,
  },
  langChipTextOn: { color: colors.accent },
  syncBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 10,
    marginTop: 2,
  },
  syncText: { color: colors.accent, fontFamily: 'Inter' as const, fontSize: 13, fontWeight: '600' as const },

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
