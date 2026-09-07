import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DeviceSession, FavoriteEntry, HistoryEntry } from '@iptv/shared';
import { api, API_URL } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { colors, styles } from '../../lib/theme';
import { Button, Card, Empty, ErrorNotice, Loading, Row } from '../../components/ui';

export default function AccountScreen() {
  const { user, logout } = useSession();
  const router = useRouter();

  const favorites = useAsync<{ items: FavoriteEntry[] }>(
    () => api.get('/api/me/favorites'),
    [],
  );
  const history = useAsync<{ items: HistoryEntry[] }>(
    () => api.get('/api/me/history?limit=30'),
    [],
  );
  const sessions = useAsync<{ items: DeviceSession[] }>(
    () => api.get('/api/me/sessions'),
    [],
  );

  const revoke = (id: number) => {
    Alert.alert('Déconnecter cet appareil ?', 'Sa session sera immédiatement révoquée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnecter',
        style: 'destructive',
        onPress: () => {
          void api.del(`/api/me/sessions/${id}`).then(() => sessions.reload());
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>{user?.email}</Text>
      <Text style={styles.dim}>
        Rôle {user?.role}
        {user?.canWatchAdult ? ' — accès aux catégories adultes' : ''}
      </Text>
      <Text style={[styles.dim, { marginTop: 4 }]}>Serveur : {API_URL}</Text>

      <View style={styles.separator} />

      <Text style={styles.h2}>Ma liste</Text>
      <ErrorNotice error={favorites.error} />
      {favorites.loading ? (
        <Loading />
      ) : !favorites.data?.items.length ? (
        <Empty>Rien dans votre liste pour l&apos;instant.</Empty>
      ) : (
        <Row title="">
          {favorites.data.items.map((fav) => (
            <Card
              key={`${fav.itemType}-${fav.itemId}`}
              title={fav.label}
              imageUrl={fav.imageUrl}
              onPress={() =>
                fav.target.kind === 'series'
                  ? router.push(`/serie/${fav.target.id}`)
                  : fav.target.kind === 'movie'
                    ? router.push(`/film/${fav.target.id}`)
                    : router.push({
                        pathname: '/player',
                        params: {
                          itemType: 'stream',
                          itemId: String(fav.itemId),
                          label: fav.label,
                        },
                      })
              }
            />
          ))}
        </Row>
      )}

      <Text style={styles.h2}>Historique</Text>
      {history.loading ? (
        <Loading />
      ) : !history.data?.items.length ? (
        <Empty>Rien encore.</Empty>
      ) : (
        history.data.items.map((entry) => (
          <View key={`${entry.itemType}-${entry.itemId}`} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              {entry.parentLabel ? <Text style={styles.dim}>{entry.parentLabel}</Text> : null}
              <Text style={styles.text}>{entry.label}</Text>
              <Text style={styles.dim}>
                {entry.completed
                  ? 'Terminé'
                  : entry.durationSec
                    ? `${Math.round((entry.positionSec / entry.durationSec) * 100)} %`
                    : '—'}
              </Text>
            </View>
            <Button
              label="Oublier"
              onPress={() => {
                void api
                  .del(`/api/me/history/${entry.itemType}/${entry.itemId}`)
                  .then(() => history.reload());
              }}
            />
          </View>
        ))
      )}

      <Text style={styles.h2}>Appareils connectés</Text>
      {sessions.loading ? (
        <Loading />
      ) : (
        sessions.data?.items.map((s) => (
          <View key={s.id} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>
                {s.deviceLabel ?? 'Appareil'}
                {s.current ? ' · celui-ci' : ''}
              </Text>
              <Text style={styles.dim} numberOfLines={1}>
                {new Date(s.lastSeenAt).toLocaleString('fr-FR')}
              </Text>
            </View>
            {!s.current && <Button label="Déconnecter" onPress={() => revoke(s.id)} />}
          </View>
        ))
      )}

      <View style={styles.separator} />

      <Text style={[styles.dim, { marginBottom: 12 }]}>
        L&apos;administration (providers, comptes, synchronisation) se fait depuis
        l&apos;interface web.
      </Text>

      <Button label="Se déconnecter" onPress={() => void logout()} />
      <View style={{ height: 12 }} />
      <Text style={[styles.dim, { color: colors.dim, fontSize: 11 }]}>
        Le token de session est stocké dans le trousseau sécurisé de l&apos;appareil.
      </Text>
    </ScrollView>
  );
}
