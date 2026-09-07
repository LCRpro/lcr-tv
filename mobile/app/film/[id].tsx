import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { workTitle, type MovieDetail } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { styles } from '../../lib/theme';
import { Button, ErrorNotice, Loading, formatDuration } from '../../components/ui';
import { VariantPicker, VariantSummary } from '../../components/VariantPicker';

export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const movieId = Number(id);
  const router = useRouter();
  const { data, error, loading, reload } = useAsync<MovieDetail>(
    () => api.get(`/api/films/${movieId}`),
    [movieId],
  );
  const [busy, setBusy] = useState(false);

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
  const playedName = variant?.name ?? data.name;
  // Le titre de la fiche est celui de l'oeuvre, pas d'une de ses declinaisons.
  const title = workTitle(data.name);

  const resumeAt = data.progress && !data.progress.completed ? data.progress.positionSec : 0;

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title }} />

      <View style={{ flexDirection: 'row', gap: 14 }}>
        {data.iconUrl ? (
          <Image source={{ uri: data.iconUrl }} style={{ width: 120, aspectRatio: 2 / 3, borderRadius: 8 }} />
        ) : (
          <View style={{ width: 120, aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: '#14171c' }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{title}</Text>
          <Text style={styles.dim}>
            {[
              data.releaseDate,
              data.genre,
              formatDuration(data.durationSec),
              data.rating ? `${data.rating.toFixed(1)}/10` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      <VariantPicker
        variants={data.variants}
        selectedId={playedId}
        onSelect={setVariantId}
      />

      <VariantSummary name={playedName} />

      <View style={{ gap: 10, marginTop: 14 }}>
        <Button
          primary
          label={resumeAt > 0 ? `Reprendre à ${formatTime(resumeAt)}` : 'Lecture'}
          onPress={() =>
            router.push({
              pathname: '/player',
              params: { itemType: 'stream', itemId: String(playedId), label: title },
            })
          }
        />
        {resumeAt > 0 && (
          <Button
            label="Reprendre au début"
            onPress={() => {
              void api.del(`/api/me/history/stream/${movieId}`).then(reload);
            }}
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

      {data.director ? (
        <Text style={[styles.dim, { marginTop: 12 }]}>Réalisation : {data.director}</Text>
      ) : null}
      {data.cast ? <Text style={[styles.dim, { marginTop: 4 }]}>Avec {data.cast}</Text> : null}
      {variant?.containerExtension ? (
        <Text style={[styles.dim, { marginTop: 12 }]}>
          Format : .{variant.containerExtension}
        </Text>
      ) : null}
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
