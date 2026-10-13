import { useState } from 'react';
import { FlatList, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LiveChannel, Movie, SearchResults, SeriesSummary } from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { colors, gridColumns, styles } from '../lib/theme';
import { Card, ChannelCard, Empty, ErrorNotice, Loading } from '../components/ui';
import { Focusable } from '../components/Focusable';

type Tab = 'movies' | 'series' | 'live';

export default function SearchScreen() {
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

  const results: Array<Movie | SeriesSummary | LiveChannel> =
    tab === 'movies'
      ? (data?.movies ?? [])
      : tab === 'series'
        ? (data?.series ?? [])
        : (data?.live ?? []);

  return (
    <View style={styles.screen}>
      <View style={{ padding: 12 }}>
        <TextInput
          style={styles.input}
          placeholder="Titre de film, série ou chaîne…"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          autoCorrect={false}
          value={term}
          onChangeText={setTerm}
        />
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
        <Empty>
          Tapez au moins deux caractères. Les accents et les fautes de frappe sont tolérés.
        </Empty>
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <Empty>Aucun résultat dans cet onglet.</Empty>
      ) : (
        <FlatList
          data={results}
          key={`${tab}-${gridColumns(width, tab === 'live' ? 190 : 130)}`}
          numColumns={gridColumns(width, tab === 'live' ? 190 : 130)}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              {item.type === 'live' ? (
                <ChannelCard
                  channel={item}
                  stretch
                  onPress={() =>
                    router.push({
                      pathname: '/player',
                      params: { itemType: 'stream', itemId: String(item.id), label: item.name },
                    })
                  }
                />
              ) : (
                <Card
                  title={item.name}
                  imageUrl={item.type === 'series' ? item.coverUrl : item.iconUrl}
                  badge={item.isAdult ? '18+' : null}
                  rating={item.rating}
                  stretch
                  onPress={() =>
                    item.type === 'series'
                      ? router.push(`/serie/${item.id}`)
                      : router.push(`/film/${item.id}`)
                  }
                />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}
