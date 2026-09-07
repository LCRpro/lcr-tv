import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { parseVariant, type Variant } from '@iptv/shared';
import { styles } from '../lib/theme';
import { Focusable } from './Focusable';

/**
 * Choix d'une déclinaison : langue d'abord, version ensuite.
 *
 * Le fournisseur publie le même film une vingtaine de fois. La langue est le
 * critère qui décide vraiment ; les versions disponibles dans cette langue
 * s'affichent en dessous, et disparaissent s'il n'y en a qu'une.
 */
interface Props {
  variants: Variant[];
  selectedId: number;
  onSelect: (id: number) => void;
}

interface Group {
  key: string;
  flag: string | null;
  label: string;
  items: Variant[];
}

export function VariantPicker({ variants, selectedId, onSelect }: Props) {
  const groups = useMemo<Group[]>(() => {
    const byLanguage = new Map<string, Group>();
    for (const variant of variants) {
      const { tag } = parseVariant(variant.name);
      const key = tag?.code ?? '?';
      if (!byLanguage.has(key)) {
        byLanguage.set(key, {
          key,
          flag: tag?.flag ?? null,
          label: tag?.label ?? 'Autre langue',
          items: [],
        });
      }
      byLanguage.get(key)!.items.push(variant);
    }
    return [...byLanguage.values()];
  }, [variants]);

  if (variants.length <= 1) return null;

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]!;
  const selectedKey = parseVariant(selected.name).tag?.code ?? '?';
  const current = groups.find((g) => g.key === selectedKey) ?? groups[0]!;

  return (
    <View style={{ gap: 10, marginTop: 16 }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.faint}>LANGUE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {groups.map((group) => (
              <Focusable
                key={group.key}
                // Changer de langue retombe sur sa première déclinaison, déjà
                // triée par préférence côté serveur.
                onPress={() => onSelect(group.items[0]!.id)}
                style={({ pressed }) => [
                  styles.chip,
                  group.key === current.key && styles.chipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.chipText, group.key === current.key && styles.chipActiveText]}>
                  {group.flag ? `${group.flag} ` : ''}
                  {group.label}
                  {group.items.length > 1 ? ` (${group.items.length})` : ''}
                </Text>
              </Focusable>
            ))}
          </View>
        </ScrollView>
      </View>

      {current.items.length > 1 && (
        <View style={{ gap: 6 }}>
          <Text style={styles.faint}>VERSION</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {current.items.map((variant) => {
                const parsed = parseVariant(variant.name);
                const bits = [parsed.quality, ...parsed.tags].filter(Boolean);
                return (
                  <Focusable
                    key={variant.id}
                    onPress={() => onSelect(variant.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      variant.id === selected.id && styles.chipActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.chipText, variant.id === selected.id && styles.chipActiveText]}>
                      {bits.length > 0 ? bits.join(' · ') : 'Standard'}
                    </Text>
                  </Focusable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/** Résumé de la déclinaison en cours, affiché sous les boutons de lecture. */
export function VariantSummary({ name }: { name: string }) {
  const parsed = parseVariant(name);
  const bits = [parsed.quality, ...parsed.tags].filter(Boolean);
  return (
    <Text style={[styles.dim, { marginTop: 10 }]}>
      Lecture : {parsed.tag?.flag ?? ''} {parsed.tag?.label ?? 'langue inconnue'}
      {bits.length > 0 ? ` · ${bits.join(' · ')}` : ''}
    </Text>
  );
}
