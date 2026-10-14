import { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { LiveChannel, Movie, SearchResults, SeriesSummary } from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { colors, gridColumns, styles } from '../lib/theme';
import { Card, ChannelCard, Empty, ErrorNotice, Loading } from './ui';
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

  return (
    <View style={[styles.screen, { flex: 1 }]}>
      <View style={sp.head}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Titre de film, série ou chaîne…"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          value={term}
          onChangeText={setTerm}
        />
        <Focusable onPress={onClose} hitSlop={8} style={sp.cancel}>
          <Text style={sp.cancelText}>Annuler</Text>
        </Focusable>
      </View>

      <View style={[styles.row, { paddingHorizontal: 12, marginBottom: 8 }]}>
        {(
          [
            ['movies', `Films (${data?.movies.length ?? 0})`],
            ['series', `Séries (${data?.series.length ?? 0})`],
            ['live', `Live (${data?.live.length ?? 0})`],
          ] as const
        ).map(([key, label]) => (
          <Focusable key={key} onPress={() => setTab(key)}>
            <Text
              style={{
                color: tab === key ? colors.text : colors.dim,
                borderBottomWidth: 2,
                borderBottomColor: tab === key ? colors.accent : 'transparent',
                paddingBottom: 7,
                paddingHorizontal: 2,
                fontSize: 14,
                fontWeight: tab === key ? '600' : '400',
              }}
            >
              {label}
            </Text>
          </Focusable>
        ))}
      </View>

      <ErrorNotice error={error} />

      {debounced.trim().length < 2 ? (
        <View style={sp.hint}>
          <Ionicons name="search" size={30} color={colors.faint} />
          <Empty>
            Tapez au moins deux caractères. Les accents et les fautes de frappe sont tolérés.
          </Empty>
        </View>
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <Empty>Aucun résultat dans cet onglet.</Empty>
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

const sp = {
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    padding: 12,
  },
  cancel: { paddingHorizontal: 4, paddingVertical: 6 },
  cancelText: { color: colors.accent, fontSize: 14, fontWeight: '600' as const },
  hint: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingBottom: 40 },
};
