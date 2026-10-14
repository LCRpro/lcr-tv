import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tag } from '@iptv/shared';
import { api } from '../lib/api';
import { colors, radius, styles } from '../lib/theme';
import { Focusable } from './Focusable';

/**
 * Ranger un contenu dans des étiquettes.
 *
 * Une feuille qui liste les étiquettes du profil, cochées pour celles qui
 * contiennent déjà ce film, cette série ou cette chaîne. On en coche, on en
 * décoche, on en crée une au passage — et le serveur suit chaque geste, sans
 * qu'on ait à valider.
 */
export function TagPicker({
  itemType,
  itemId,
  onClose,
}: {
  itemType: 'stream' | 'series';
  itemId: number;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<{ items: Tag[] }>(
        `/api/me/tags?itemType=${itemType}&itemId=${itemId}`,
      );
      setTags(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On bascule a l'ecran avant la reponse : une case qui attend l'aller-retour
  // donne l'impression de ne pas repondre. En cas d'echec, on relit.
  const toggle = async (tag: Tag) => {
    const next = !tag.contains;
    setTags((prev) =>
      prev.map((t) =>
        t.id === tag.id ? { ...t, contains: next, count: t.count + (next ? 1 : -1) } : t,
      ),
    );
    try {
      if (next) await api.post(`/api/me/tags/${tag.id}/items`, { itemType, itemId });
      else await api.del(`/api/me/tags/${tag.id}/items/${itemType}/${itemId}`);
    } catch {
      void load();
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const tag = await api.post<Tag>('/api/me/tags', { name: trimmed });
      await api.post(`/api/me/tags/${tag.id}/items`, { itemType, itemId });
      setName('');
      await load();
    } catch {
      // On laisse le champ : l'utilisateur voit que rien n'a pris.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={tp.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={tp.sheet}>
          <View style={tp.handle} />
          <Text style={tp.title}>Étiquettes</Text>

          <View style={tp.createRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Nouvelle étiquette…"
              placeholderTextColor={colors.dim}
              autoCapitalize="sentences"
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => void create()}
              returnKeyType="done"
              maxLength={40}
            />
            <Focusable
              onPress={() => void create()}
              disabled={busy || name.trim().length === 0}
              style={[tp.createBtn, name.trim().length === 0 && { opacity: 0.4 }]}
            >
              <Ionicons name="add" size={22} color={colors.onAccent} />
            </Focusable>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {loading ? (
              <Text style={tp.empty}>Chargement…</Text>
            ) : tags.length === 0 ? (
              <Text style={tp.empty}>Créez une étiquette pour y ranger ce contenu.</Text>
            ) : (
              tags.map((tag) => (
                <Focusable
                  key={tag.id}
                  onPress={() => void toggle(tag)}
                  style={({ pressed }) => [
                    tp.row,
                    tag.contains && tp.rowOn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[tp.check, tag.contains && tp.checkOn]}>
                    {tag.contains ? (
                      <Ionicons name="checkmark" size={15} color={colors.onAccent} />
                    ) : null}
                  </View>
                  <Text style={[tp.rowText, tag.contains && tp.rowTextOn]} numberOfLines={1}>
                    {tag.name}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={tp.count}>{tag.count}</Text>
                </Focusable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const tp = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.accentSoft },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  rowText: { color: colors.dim, fontSize: 14.5, fontWeight: '600' },
  rowTextOn: { color: colors.text, fontWeight: '700' },
  count: { color: colors.faint, fontSize: 13, fontVariant: ['tabular-nums'] },
  empty: { color: colors.faint, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});
