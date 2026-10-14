import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { workTitle, type MovieDetail } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, styles } from '../../lib/theme';
import { Button, ErrorNotice, Loading, formatDuration } from '../../components/ui';
import { VariantPicker, VariantSummary } from '../../components/VariantPicker';
import { Focusable } from '../../components/Focusable';
import { fiche } from '../../components/fiche';
import { TagPicker } from '../../components/TagPicker';
import { DownloadButton } from '../../components/DownloadButton';

export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const movieId = Number(id);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data, error, loading, reload } = useAsync<MovieDetail>(
    () => api.get(`/api/films/${movieId}`),
    [movieId],
  );
  const [busy, setBusy] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  // Declinaison choisie. On repart de celle de l'URL a chaque changement de
  // fiche, sinon on garderait le choix fait sur le film precedent.
  const [variantId, setVariantId] = useState(movieId);
  useEffect(() => setVariantId(movieId), [movieId]);

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <View style={styles.content}>
        <ErrorNotice error={error} />
      </View>
    );
  }
  if (!data) return null;

  const variant = data.variants.find((v) => v.id === variantId) ?? null;
  const playedId = variant?.id ?? movieId;
  const title = workTitle(data.name);
  const resumeAt = data.progress && !data.progress.completed ? data.progress.positionSec : 0;

  const meta = [data.releaseDate?.slice(0, 4), data.genre, formatDuration(data.durationSec)]
    .filter(Boolean)
    .join('  ·  ');

  const toggleFavorite = async () => {
    setBusy(true);
    try {
      if (data.isFavorite) await api.del(`/api/me/favorites/stream/${movieId}`);
      else await api.post('/api/me/favorites', { itemType: 'stream', itemId: movieId });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen
        options={{ title: '', headerTransparent: true, headerTintColor: '#fff' }}
      />

      {/* Le hero : le backdrop tient la fiche. A defaut, l'affiche agrandie. */}
      <View style={[fiche.hero, { height: Math.min(width * 0.62, 420) }]}>
        <Image
          source={{ uri: data.backdropUrl ?? data.iconUrl ?? undefined }}
          style={fiche.heroBg}
          resizeMode="cover"
          blurRadius={data.backdropUrl ? 0 : 30}
        />
        <LinearGradient
          colors={['rgba(13,14,22,0.2)', 'rgba(13,14,22,0)', 'rgba(13,14,22,0.7)', colors.bg]}
          locations={[0, 0.35, 0.78, 1]}
          style={fiche.heroVeil}
          pointerEvents="none"
        />
      </View>

      <View style={fiche.body}>
        <View style={fiche.posterRow}>
          {data.iconUrl ? (
            <Image source={{ uri: data.iconUrl }} style={fiche.poster} />
          ) : (
            <View style={[fiche.poster, { backgroundColor: colors.elevated }]} />
          )}
          <View style={{ flex: 1, paddingTop: 6 }}>
            <Text style={fiche.title}>{title}</Text>
            <Text style={fiche.meta}>{meta}</Text>
            {data.rating ? (
              <Text style={fiche.rating}>★ {data.rating.toFixed(1)}</Text>
            ) : null}
          </View>
        </View>

        <View style={fiche.actions}>
          <Focusable
            onPress={() =>
              router.push({
                pathname: '/player',
                params: { itemType: 'stream', itemId: String(playedId), label: title },
              })
            }
            style={fiche.play}
          >
            <Ionicons name="play" size={18} color={colors.onAccent} />
            <Text style={fiche.playText}>
              {resumeAt > 0 ? `Reprendre ${formatTime(resumeAt)}` : 'Lecture'}
            </Text>
          </Focusable>
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
          <DownloadButton
            kind="movie"
            id={movieId}
            title={title}
            posterUrl={data.iconUrl ?? null}
            style={fiche.round}
          />
        </View>

        {tagOpen ? (
          <TagPicker itemType="stream" itemId={movieId} onClose={() => setTagOpen(false)} />
        ) : null}

        {resumeAt > 0 ? (
          <Button
            label="Reprendre au début"
            onPress={() => void api.del(`/api/me/history/stream/${movieId}`).then(reload)}
          />
        ) : null}

        <VariantPicker variants={data.variants} selectedId={playedId} onSelect={setVariantId} />
        <VariantSummary name={variant?.name ?? data.name} />

        {data.plot ? <Text style={fiche.plot}>{data.plot}</Text> : null}
        {data.director ? (
          <Text style={fiche.credit}>Réalisation · {data.director}</Text>
        ) : null}
        {data.cast ? <Text style={fiche.credit}>Avec · {data.cast}</Text> : null}
      </View>
    </ScrollView>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
