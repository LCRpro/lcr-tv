import { createContext, useContext, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { channelTitle, workTitle } from '@iptv/shared';
import { api } from '../lib/api';
import { confirmAction } from '../lib/confirm';
import { colors, radius } from '../lib/theme';
import {
  DOWNLOADS_OK,
  removeDownload,
  startDownload,
  useDownload,
} from '../lib/downloads';
import { Focusable } from './Focusable';
import { TagPicker } from './TagPicker';

/**
 * Le menu d'appui long — les gestes d'un contenu, sans ouvrir sa fiche.
 *
 * On reste appuyé sur une affiche (au doigt, ou select maintenu sur téléviseur)
 * et une feuille monte du bas : ajouter à ma liste, étiqueter, télécharger un
 * film, ou simplement l'ouvrir. Une chaîne a les mêmes gestes, sans le
 * téléchargement — un direct ne se garde pas hors-ligne.
 *
 * Le fournisseur est global : n'importe quelle vignette l'ouvre via
 * `useQuickActions().open(item)`, et la feuille vit une seule fois, autour de
 * l'app, plutôt qu'une par écran.
 */
export type QuickItem = {
  kind: 'movie' | 'series' | 'live';
  id: number;
  title: string;
  posterUrl?: string | null;
  isFavorite?: boolean;
};

const Ctx = createContext<{ open: (item: QuickItem) => void }>({ open: () => {} });
export const useQuickActions = () => useContext(Ctx);

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<QuickItem | null>(null);
  return (
    <Ctx.Provider value={{ open: setItem }}>
      {children}
      {item ? <Sheet item={item} onClose={() => setItem(null)} /> : null}
    </Ctx.Provider>
  );
}

function Sheet({ item, onClose }: { item: QuickItem; onClose: () => void }) {
  const router = useRouter();
  const itemType = item.kind === 'series' ? 'series' : 'stream';
  const [fav, setFav] = useState(Boolean(item.isFavorite));
  const [tagOpen, setTagOpen] = useState(false);
  const dl = useDownload('movie', item.id);

  const title = item.kind === 'live' ? channelTitle(item.title) : workTitle(item.title);

  const toggleFav = () => {
    const next = !fav;
    setFav(next);
    const call = next
      ? api.post('/api/me/favorites', { itemType, itemId: item.id })
      : api.del(`/api/me/favorites/${itemType}/${item.id}`);
    void call.catch(() => setFav(!next));
  };

  const open = () => {
    onClose();
    if (item.kind === 'series') router.push(`/serie/${item.id}`);
    else if (item.kind === 'movie') router.push(`/film/${item.id}`);
    else
      router.push({
        pathname: '/player',
        params: { itemType: 'stream', itemId: String(item.id), label: item.title },
      });
  };

  const download = () => {
    if (!DOWNLOADS_OK) {
      confirmAction({
        title: 'Téléchargement hors-ligne',
        message: 'À regarder sans connexion : disponible depuis l’app mobile LCR TV.',
        confirmLabel: 'Compris',
        destructive: false,
        onConfirm: () => {},
      });
      return;
    }
    if (!dl || dl.status === 'error') {
      void startDownload({ kind: 'movie', id: item.id, title, posterUrl: item.posterUrl ?? null });
      onClose();
    } else if (dl.status === 'done') {
      confirmAction({
        title: 'Retirer le téléchargement ?',
        message: `« ${title} » sera effacé de l’appareil.`,
        confirmLabel: 'Retirer',
        onConfirm: () => {
          void removeDownload(dl.key);
          onClose();
        },
      });
    }
  };

  // L'étiquetage a sa propre feuille : on ferme la nôtre quand il se termine.
  if (tagOpen) {
    return (
      <TagPicker
        itemType={itemType}
        itemId={item.id}
        onClose={() => {
          setTagOpen(false);
          onClose();
        }}
      />
    );
  }

  const dlLabel =
    dl?.status === 'done'
      ? 'Téléchargé'
      : dl?.status === 'downloading'
        ? `Téléchargement · ${Math.round((dl.progress || 0) * 100)} %`
        : 'Télécharger';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={qa.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={qa.sheet}>
          <View style={qa.handle} />

          <View style={qa.head}>
            {item.posterUrl ? (
              <Image source={{ uri: item.posterUrl }} style={qa.poster} resizeMode="cover" />
            ) : (
              <View style={[qa.poster, qa.posterEmpty]}>
                <Ionicons name={item.kind === 'live' ? 'tv' : 'film'} size={20} color={colors.faint} />
              </View>
            )}
            <Text style={qa.title} numberOfLines={2}>
              {title}
            </Text>
          </View>

          <View style={qa.sep} />

          <ActionRow
            icon={item.kind === 'live' ? 'play' : item.kind === 'movie' ? 'play' : 'open-outline'}
            label={item.kind === 'movie' ? 'Lecture' : item.kind === 'live' ? 'Regarder' : 'Ouvrir la fiche'}
            onPress={open}
          />
          <ActionRow
            icon={fav ? 'checkmark-circle' : 'add-circle-outline'}
            iconColor={fav ? colors.accent : colors.text}
            label={fav ? 'Dans ma liste' : 'Ajouter à ma liste'}
            onPress={toggleFav}
          />
          <ActionRow icon="pricetag-outline" label="Ajouter une étiquette" onPress={() => setTagOpen(true)} />
          {item.kind === 'movie' ? (
            <ActionRow
              icon={dl?.status === 'done' ? 'checkmark-circle' : 'download-outline'}
              iconColor={dl?.status === 'done' ? colors.ok : colors.text}
              label={dlLabel}
              onPress={download}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  iconColor,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Focusable onPress={onPress} style={({ pressed }) => [qa.row, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={iconColor ?? colors.text} />
      <Text style={qa.rowLabel}>{label}</Text>
    </Focusable>
  );
}

const qa = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 30,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  poster: { width: 44, height: 62, borderRadius: radius.sm, backgroundColor: colors.bgSoft },
  posterEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { flex: 1, color: colors.text, fontFamily: 'Outfit', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  sep: { height: 1, backgroundColor: colors.border, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowLabel: { color: colors.text, fontFamily: 'Inter', fontSize: 15, fontWeight: '600' },
});
