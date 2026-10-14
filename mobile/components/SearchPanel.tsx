import { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { LiveChannel, Movie, SearchResults, SeriesSummary } from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { colors, gridColumns, radius, styles } from '../lib/theme';
import { Card, ChannelCard, ErrorNotice, Loading } from './ui';
import { Focusable } from './Focusable';

type Tab = 'movies' | 'series' | 'live';
type Result = Movie | SeriesSummary | LiveChannel;

/**
 * La recherche, affichée là où on la demande.
 *
 * Elle ne vit pas dans un écran à part : la loupe de la barre l'ouvre sur
 * place, juste en dessous, et « Annuler » la referme. On tape, les résultats
 * paraissent sous le champ, rangés par films, séries et chaînes. Le même
 * panneau sert de repli au téléviseur, où il occupe un écran empilé.
 */
export function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<Tab>('movies');
  const debounced = useDebounced(term);

  const { data, error, loading } = useAsync<SearchResults | null>(
    async () =>
      debounced.trim().length >= 2
        ? api.get<SearchResults>(`/api/search${qs({ q: debounced.trim(), limit: 40 })}`)
        : null,
    [debounced],
  );

  const results: Result[] =
    tab === 'movies'
      ? (data?.movies ?? [])
      : tab === 'series'
        ? (data?.series ?? [])
        : (data?.live ?? []);

  const columns = gridColumns(width, tab === 'live' ? 190 : 130);

  // Toutes les affiches à la même largeur : on comble la dernière rangée de
  // cases vides, sinon un résultat seul s'étire sur toute la ligne.
  const gridData = useMemo<Array<Result | { spacer: string }>>(() => {
    if (columns <= 1) return results;
    const fill = (columns - (results.length % columns)) % columns;
    if (fill === 0) return results;
    return [...results, ...Array.from({ length: fill }, (_, k) => ({ spacer: `s${k}` }))];
  }, [results, columns]);

  const open = (item: Result) => {
    if (item.type === 'live') {
      router.push({
        pathname: '/player',
        params: { itemType: 'stream', itemId: String(item.id), label: item.name },
      });
    } else if (item.type === 'series') {
      router.push(`/serie/${item.id}`);
    } else {
      router.push(`/film/${item.id}`);
    }
  };

  // En deçà de deux caractères, on ne cherche pas : l'écran invite plutôt qu'il
  // ne montre des onglets vides. Les onglets n'apparaissent qu'une fois la
  // recherche lancée, pour ne pas afficher « Films (0) » avant toute frappe.
  const active = debounced.trim().length >= 2;

  return (
    <View style={[styles.screen, { flex: 1 }]}>
      <View style={sp.head}>
        <View style={sp.field}>
          <Ionicons name="search" size={18} color={colors.dim} />
          <TextInput
            style={sp.input}
            placeholder="Films, séries, chaînes…"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            value={term}
            onChangeText={setTerm}
            returnKeyType="search"
          />
          {term ? (
            <Focusable onPress={() => setTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Focusable>
          ) : null}
        </View>
        <Focusable onPress={onClose} hitSlop={8} style={sp.cancel}>
          <Text style={sp.cancelText}>Annuler</Text>
        </Focusable>
      </View>

      {active ? (
        <View style={sp.tabs}>
          {(
            [
              ['movies', 'Films', data?.movies.length ?? 0],
              ['series', 'Séries', data?.series.length ?? 0],
              ['live', 'Chaînes', data?.live.length ?? 0],
            ] as const
          ).map(([key, label, n]) => {
            const on = tab === key;
            return (
              <Focusable key={key} onPress={() => setTab(key)} style={sp.tab}>
                <Text style={[sp.tabText, on && sp.tabTextOn]}>{label}</Text>
                <View style={[sp.tabCount, on && sp.tabCountOn]}>
                  <Text style={[sp.tabCountText, on && sp.tabCountTextOn]}>{n}</Text>
                </View>
                {on ? <View style={sp.tabBar} /> : null}
              </Focusable>
            );
          })}
        </View>
      ) : null}

      <ErrorNotice error={error} />

      {!active ? (
        <EmptyState
          icon="search"
          title="Rechercher"
          sub="Films, séries et chaînes. Les accents et les fautes de frappe sont tolérés."
        />
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title="Aucun résultat"
          sub={`Rien ne correspond à « ${debounced.trim()} » dans cet onglet.`}
        />
      ) : (
        <FlatList
          data={gridData}
          key={`${tab}-${columns}`}
          numColumns={columns}
          keyExtractor={(item) => ('spacer' in item ? item.spacer : `${item.type}-${item.id}`)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          columnWrapperStyle={columns > 1 ? { gap: 12, marginBottom: 12 } : undefined}
          renderItem={({ item }) =>
            'spacer' in item ? (
              <View style={{ flex: 1 }} />
            ) : (
              <View style={{ flex: 1 }}>
                {item.type === 'live' ? (
                  <ChannelCard channel={item} stretch onPress={() => open(item)} />
                ) : (
                  <Card
                    title={item.name}
                    imageUrl={item.type === 'series' ? item.coverUrl : item.iconUrl}
                    badge={item.isAdult ? '18+' : null}
                    rating={item.rating}
                    stretch
                    onPress={() => open(item)}
                  />
                )}
              </View>
            )
          }
        />
      )}
    </View>
  );
}

/** L'état d'attente ou de vide : une petite icône, un titre, une phrase. */
function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
}) {
  return (
    <View style={sp.empty}>
      <Ionicons name={icon} size={22} color={colors.faint} />
      <Text style={sp.emptyTitle}>{title}</Text>
      <Text style={sp.emptySub}>{sub}</Text>
    </View>
  );
}

const sp = {
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: 12,
  },
  field: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 9,
    height: 44,
    paddingHorizontal: 13,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  input: { flex: 1, color: colors.text, fontFamily: 'Inter', fontSize: 15 },
  cancel: { paddingHorizontal: 2, paddingVertical: 6 },
  cancelText: { color: colors.accent, fontFamily: 'Outfit', fontSize: 14, fontWeight: '600' as const },

  tabs: { flexDirection: 'row' as const, gap: 22, paddingHorizontal: 16, marginBottom: 8 },
  tab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, paddingBottom: 9 },
  tabText: { color: colors.dim, fontFamily: 'Outfit', fontSize: 15, fontWeight: '600' as const },
  tabTextOn: { color: colors.text },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSoft,
    alignItems: 'center' as const,
  },
  tabCountOn: { backgroundColor: colors.accentSoft },
  tabCountText: { color: colors.dim, fontFamily: 'Inter', fontSize: 11, fontWeight: '700' as const },
  tabCountTextOn: { color: colors.accent },
  tabBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },

  // L'état vide respire sans s'imposer : une petite icône, pas de gros bloc
  // décoratif, et l'ensemble posé un peu au-dessus du centre optique.
  empty: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 9,
    paddingHorizontal: 40,
    paddingBottom: 96,
  },
  emptyTitle: { color: colors.text, fontFamily: 'Outfit', fontSize: 17, fontWeight: '700' as const, marginTop: 2 },
  emptySub: {
    color: colors.dim,
    fontFamily: 'Inter',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center' as const,
    maxWidth: 300,
  },
};
