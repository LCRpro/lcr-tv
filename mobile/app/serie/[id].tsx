import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { episodeTitle, workTitle, type SeriesDetail } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, styles } from '../../lib/theme';
import { Button, Empty, ErrorNotice, Loading, formatDuration, pad } from '../../components/ui';
import { VariantPicker } from '../../components/VariantPicker';
import { Focusable } from '../../components/Focusable';

export default function SerieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const seriesId = Number(id);
  const router = useRouter();
  /*
   * Declinaison affichee. Changer de langue change la liste des episodes : on
   * recharge la fiche de cette declinaison sans empiler un ecran de plus.
   */
  const [activeId, setActiveId] = useState(seriesId);
  useEffect(() => setActiveId(seriesId), [seriesId]);

  const { data, error, loading, reload } = useAsync<SeriesDetail>(
    () => api.get(`/api/series/${activeId}`),
    [activeId],
  );
  const [season, setSeason] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || season !== null) return;
    setSeason(data.nextEpisode?.seasonNum ?? data.seasons[0]?.season ?? null);
  }, [data, season]);

  // Une autre declinaison a sa propre numerotation de saisons.
  useEffect(() => setSeason(null), [activeId]);

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <View style={styles.content}>
        <ErrorNotice error={error} />
      </View>
    );
  }
  if (!data) return null;

  const current = data.seasons.find((s) => s.season === season) ?? data.seasons[0];

  const toggleFavorite = async () => {
    setBusy(true);
    try {
      if (data.isFavorite) await api.del(`/api/me/favorites/series/${activeId}`);
      else await api.post('/api/me/favorites', { itemType: 'series', itemId: activeId });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: workTitle(data.name) }} />

      <View style={{ flexDirection: 'row', gap: 14 }}>
        {data.coverUrl ? (
          <Image
            source={{ uri: data.coverUrl }}
            style={{ width: 120, aspectRatio: 2 / 3, borderRadius: 8 }}
          />
        ) : (
          <View
            style={{ width: 120, aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: '#14171c' }}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{workTitle(data.name)}</Text>
          <Text style={styles.dim}>
            {[
              data.releaseDate,
              data.genre,
              `${data.seasons.length} saison${data.seasons.length > 1 ? 's' : ''}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      <VariantPicker
        variants={data.variants}
        selectedId={activeId}
        onSelect={setActiveId}
      />

      <View style={{ gap: 10, marginTop: 14 }}>
        {data.nextEpisode && (
          <Button
            primary
            label={`Reprendre S${pad(data.nextEpisode.seasonNum)}E${pad(data.nextEpisode.episodeNum)}`}
            onPress={() =>
              router.push({
                pathname: '/player',
                params: {
                  itemType: 'episode',
                  itemId: String(data.nextEpisode!.episodeId),
                  label: workTitle(data.name),
                },
              })
            }
          />
        )}
        <Button
          label={data.isFavorite ? '✓ Dans ma liste' : '+ Ma liste'}
          disabled={busy}
          onPress={() => void toggleFavorite()}
        />
      </View>

      {data.plot ? (
        <Text style={[styles.text, { marginTop: 18, lineHeight: 21 }]}>{data.plot}</Text>
      ) : null}

      <Text style={styles.h2}>Épisodes</Text>

      {data.seasons.length === 0 ? (
        <Empty>Aucun épisode remonté par le fournisseur pour cette série.</Empty>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={[styles.row, { gap: 8, marginBottom: 12 }]}>
              {data.seasons.map((s) => (
                <Focusable
                  key={s.season}
                  onPress={() => setSeason(s.season)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor:
                      s.season === current?.season ? colors.accent : colors.elevated,
                    borderWidth: 1,
                    borderColor: s.season === current?.season ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 13 }}>Saison {s.season}</Text>
                </Focusable>
              ))}
            </View>
          </ScrollView>

          {current?.episodes.map((ep) => {
            const ratio =
              ep.progress?.durationSec && ep.progress.positionSec
                ? ep.progress.positionSec / ep.progress.durationSec
                : 0;
            return (
              <Focusable
                key={ep.id}
                style={styles.listItem}
                onPress={() =>
                  router.push({
                    pathname: '/player',
                    params: {
                      itemType: 'episode',
                      itemId: String(ep.id),
                      label: `${workTitle(data.name)} — ${episodeTitle(ep.title, data.name)}`,
                    },
                  })
                }
              >
                {ep.stillUrl ? (
                  <Image
                    source={{ uri: ep.stillUrl }}
                    style={{ width: 110, aspectRatio: 16 / 9, borderRadius: 4 }}
                  />
                ) : (
                  <View
                    style={{
                      width: 110,
                      aspectRatio: 16 / 9,
                      borderRadius: 4,
                      backgroundColor: colors.hover,
                    }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.text} numberOfLines={2}>
                    E{pad(ep.episodeNum)} — {episodeTitle(ep.title, data.name)}
                    {ep.progress?.completed ? ' · vu' : ''}
                  </Text>
                  <Text style={styles.dim}>
                    {formatDuration(ep.durationSec)}
                    {ep.containerExtension ? ` · .${ep.containerExtension}` : ''}
                  </Text>
                  {ratio > 0 && !ep.progress?.completed && (
                    <View style={styles.progressTrack}>
                      <View
                        style={[styles.progressFill, { width: `${Math.min(100, ratio * 100)}%` }]}
                      />
                    </View>
                  )}
                </View>
              </Focusable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
