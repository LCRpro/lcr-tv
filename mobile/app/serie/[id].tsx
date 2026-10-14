import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { episodeTitle, workTitle, type SeriesDetail } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, radius, styles } from '../../lib/theme';
import { Empty, ErrorNotice, Loading, formatDuration, pad } from '../../components/ui';
import { VariantPicker } from '../../components/VariantPicker';
import { Focusable } from '../../components/Focusable';
import { fiche } from '../../components/fiche';
import { TagPicker } from '../../components/TagPicker';
import { DownloadButton } from '../../components/DownloadButton';

export default function SerieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const seriesId = Number(id);
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const [tagOpen, setTagOpen] = useState(false);

  useEffect(() => {
    if (!data || season !== null) return;
    setSeason(data.nextEpisode?.seasonNum ?? data.seasons[0]?.season ?? null);
  }, [data, season]);

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

  const title = workTitle(data.name);
  const current = data.seasons.find((s) => s.season === season) ?? data.seasons[0];
  const firstEp = current?.episodes[0];
  const meta = [
    data.releaseDate?.slice(0, 4),
    data.genre,
    `${data.seasons.length} saison${data.seasons.length > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

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

  const playEpisode = (episodeId: number, label: string) =>
    router.push({ pathname: '/player', params: { itemType: 'episode', itemId: String(episodeId), label } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: '', headerTransparent: true, headerTintColor: '#fff' }} />

      <View style={[fiche.hero, { height: Math.min(width * 0.62, 420) }]}>
        <Image
          source={{ uri: data.backdropUrl ?? data.coverUrl ?? undefined }}
          style={fiche.heroBg}
          resizeMode="cover"
          blurRadius={data.backdropUrl ? 0 : 30}
        />
        <LinearGradient
          colors={['rgba(8,10,18,0.2)', 'rgba(8,10,18,0)', 'rgba(8,10,18,0.7)', colors.bg]}
          locations={[0, 0.35, 0.78, 1]}
          style={fiche.heroVeil}
          pointerEvents="none"
        />
      </View>

      <View style={fiche.body}>
        <View style={fiche.posterRow}>
          {data.coverUrl ? (
            <Image source={{ uri: data.coverUrl }} style={fiche.poster} />
          ) : (
            <View style={[fiche.poster, { backgroundColor: colors.elevated }]} />
          )}
          <View style={{ flex: 1, paddingTop: 6 }}>
            <Text style={fiche.title}>{title}</Text>
            <Text style={fiche.meta}>{meta}</Text>
            {data.rating ? <Text style={fiche.rating}>★ {data.rating.toFixed(1)}</Text> : null}
          </View>
        </View>

        <View style={fiche.actions}>
          {data.nextEpisode ? (
            <Focusable
              onPress={() => playEpisode(data.nextEpisode!.episodeId, title)}
              style={fiche.play}
            >
              <Ionicons name="play" size={18} color={colors.onAccent} />
              <Text style={fiche.playText}>
                Reprendre S{pad(data.nextEpisode.seasonNum)}E{pad(data.nextEpisode.episodeNum)}
              </Text>
            </Focusable>
          ) : firstEp ? (
            <Focusable
              onPress={() =>
                playEpisode(firstEp.id, `${title} — ${episodeTitle(firstEp.title, data.name)}`)
              }
              style={fiche.play}
            >
              <Ionicons name="play" size={18} color={colors.onAccent} />
              <Text style={fiche.playText}>Regarder</Text>
            </Focusable>
          ) : (
            <View style={[fiche.play, { opacity: 0.4 }]}>
              <Text style={fiche.playText}>Indisponible</Text>
            </View>
          )}
          <Focusable onPress={() => void toggleFavorite()} disabled={busy} style={fiche.round}>
            <Ionicons
              name={data.isFavorite ? 'checkmark' : 'add'}
              size={24}
              color={data.isFavorite ? colors.accent : colors.text}
            />
          </Focusable>
          <Focusable onPress={() => setTagOpen(true)} style={fiche.round}>
            <Ionicons name="pricetag-outline" size={22} color={colors.text} />
          </Focusable>
        </View>

        {tagOpen ? (
          <TagPicker itemType="series" itemId={activeId} onClose={() => setTagOpen(false)} />
        ) : null}

        <VariantPicker variants={data.variants} selectedId={activeId} onSelect={setActiveId} />

        {data.plot ? <Text style={fiche.plot}>{data.plot}</Text> : null}

        <Text style={styles.h2}>Épisodes</Text>

        {data.seasons.length === 0 ? (
          <Empty>Aucun épisode remonté par le fournisseur pour cette série.</Empty>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={[styles.row, { gap: 8, marginBottom: 14 }]}>
                {data.seasons.map((s) => {
                  const on = s.season === current?.season;
                  return (
                    <Focusable
                      key={s.season}
                      onPress={() => setSeason(s.season)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.accent : colors.bgSoft,
                        borderWidth: 1,
                        borderColor: on ? colors.accent : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: on ? colors.onAccent : colors.text,
                          fontSize: 13,
                          fontWeight: on ? '700' : '500',
                        }}
                      >
                        Saison {s.season}
                      </Text>
                    </Focusable>
                  );
                })}
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
                    playEpisode(ep.id, `${title} — ${episodeTitle(ep.title, data.name)}`)
                  }
                >
                  {ep.stillUrl ? (
                    <Image
                      source={{ uri: ep.stillUrl }}
                      style={{ width: 112, aspectRatio: 16 / 9, borderRadius: 6 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 112,
                        aspectRatio: 16 / 9,
                        borderRadius: 6,
                        backgroundColor: colors.hover,
                      }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.text} numberOfLines={2}>
                      E{pad(ep.episodeNum)} — {episodeTitle(ep.title, data.name)}
                      {ep.progress?.completed ? ' · vu' : ''}
                    </Text>
                    <Text style={styles.dim}>{formatDuration(ep.durationSec)}</Text>
                    {ratio > 0 && !ep.progress?.completed && (
                      <View style={styles.progressTrack}>
                        <View
                          style={[styles.progressFill, { width: `${Math.min(100, ratio * 100)}%` }]}
                        />
                      </View>
                    )}
                  </View>
                  <DownloadButton
                    kind="episode"
                    id={ep.id}
                    title={`${title} — E${pad(ep.episodeNum)}`}
                    parentTitle={title}
                    posterUrl={ep.stillUrl ?? null}
                    size={20}
                    style={{ padding: 8, alignSelf: 'center' }}
                  />
                </Focusable>
              );
            })}
          </>
        )}
      </View>
    </ScrollView>
  );
}
