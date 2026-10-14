import { useMemo, useState } from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LiveChannel, Movie, Paginated, SeriesSummary } from '@iptv/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { colors, gridColumns, styles } from '../lib/theme';
import { Card, ChannelCard, Empty, ErrorNotice, Loading } from '../components/ui';
import { Focusable } from '../components/Focusable';

type Tab = 'movies' | 'series' | 'live';
type Result = Movie | SeriesSummary | LiveChannel;

/**
 * Mes favoris — tout ce que le profil a mis de côté, réuni.
 *
 * Même vue d'ensemble qu'une étiquette, mais pour l'étoile : ses films, ses
 * séries, ses chaînes, rangés par onglet. On y arrive depuis le compte.
 */
export default function FavorisScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('movies');

  const { data, error, loading } = useAsync<{
    movies: Movie[];
    series: SeriesSummary[];
    live: LiveChannel[];
  }>(async () => {
    const [m, s, l] = await Promise.all([
      api.get<Paginated<Movie>>('/api/films?favorites=true&limit=100'),
      api.get<Paginated<SeriesSummary>>('/api/series?favorites=true&limit=100'),
      api.get<Paginated<LiveChannel>>('/api/live?favorites=true&limit=100'),
    ]);
    return { movies: m.items, series: s.items, live: l.items };
  }, []);

  const results: Result[] =
    tab === 'movies'
      ? (data?.movies ?? [])
      : tab === 'series'
        ? (data?.series ?? [])
        : (data?.live ?? []);

  const columns = gridColumns(width, tab === 'live' ? 190 : 130);

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

  const counts = {
    movies: data?.movies.length ?? 0,
    series: data?.series.length ?? 0,
    live: data?.live.length ?? 0,
  };

  return (
    <View style={styles.screen}>
      <Text style={[styles.h1, { paddingHorizontal: 14, paddingTop: 14, marginBottom: 6 }]}>
        Mes favoris
      </Text>

      <View style={[styles.row, { paddingHorizontal: 12, marginBottom: 8 }]}>
        {(
          [
            ['movies', `Films (${counts.movies})`],
            ['series', `Séries (${counts.series})`],
            ['live', `Direct (${counts.live})`],
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

      {loading && !data ? (
        <Loading />
      ) : results.length === 0 ? (
        <Empty>
          Rien en favori dans cet onglet. Touchez l’étoile sur un film, une série ou une chaîne.
        </Empty>
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
