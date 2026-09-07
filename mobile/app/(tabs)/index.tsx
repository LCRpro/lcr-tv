import { useEffect } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { workTitle, type FavoriteEntry, type HomePayload, type Spotlight } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, styles } from '../../lib/theme';
import { Card, ChannelCard, ErrorNotice, Loading, Row } from '../../components/ui';
import { Focusable } from '../../components/Focusable';

/**
 * L'accueil.
 *
 * L'ordre est celui du web, et il n'est pas anodin : la selection d'abord,
 * l'historique ensuite. La page s'ouvrait sur « Reprendre », c'est-a-dire sur
 * ce qu'on avait deja vu — un accueil qui regarde en arriere. Ce soir vient
 * donc en premier, en grand ; les reprises restent, juste en dessous.
 *
 * Puis ce qui est arrive depuis la derniere visite, avec son compte : le
 * catalogue grossit de plusieurs dizaines de titres par semaine et rien ne le
 * disait. Enfin « Ma liste », rangee par films, series et chaines — une
 * affiche en 2/3 et un logo en 16/9 ne se rangent pas dans la meme rangee.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data, error, loading, reload } = useAsync<HomePayload>(() => api.get('/api/home'), []);

  // Premier lancement : le catalogue se remplit, on suit sans que l'utilisateur
  // ait a tirer pour rafraichir.
  useEffect(() => {
    if (!data?.catalogEmpty && !data?.sync?.running) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [data?.catalogEmpty, data?.sync?.running, reload]);

  if (loading && !data) return <Loading />;

  if (data?.catalogEmpty) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <Text style={[styles.h1, { textAlign: 'center' }]}>
          {data.sync?.running ? 'Synchronisation en cours' : 'Catalogue vide'}
        </Text>
        <Text style={[styles.dim, { textAlign: 'center' }]}>
          {data.sync?.running
            ? `Étape : ${data.sync.phase}. ${data.sync.counts.vod} films récupérés jusqu’ici.`
            : "Aucune synchronisation n'a encore rempli le catalogue. Prévenez l'administrateur."}
        </Text>
      </View>
    );
  }

  const openFavorite = (fav: FavoriteEntry) => {
    if (fav.target.kind === 'series') router.push(`/serie/${fav.target.id}`);
    else if (fav.target.kind === 'movie') router.push(`/film/${fav.target.id}`);
    else
      router.push({
        pathname: '/player',
        params: { itemType: 'stream', itemId: String(fav.itemId), label: fav.label },
      });
  };

  const arrivals = (data?.arrivals.movies ?? 0) + (data?.arrivals.series ?? 0);

  /*
   * « Ma liste », en trois rangees.
   *
   * Elle etait une rangee unique ou un logo de chaine en 16/9 voisinait avec
   * des affiches en 2/3 : la rangee ondulait, et on ne savait pas ce qu'on
   * cherchait. Trois groupes, dans l'ordre de la page : films, series,
   * chaines.
   */
  const listGroups: Array<[string, FavoriteEntry[]]> = [
    ['Films', (data?.favorites ?? []).filter((f) => f.target.kind === 'movie')],
    ['Séries', (data?.favorites ?? []).filter((f) => f.target.kind === 'series')],
    ['Chaînes', (data?.favorites ?? []).filter((f) => f.target.kind === 'live')],
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.text} />
      }
    >
      <ErrorNotice error={error} />

      {/* 1. Ce soir : la selection du jour, en grand. */}
      {data?.spotlight.length ? (
        <Row title="Ce soir">
          {data.spotlight.map((pick) => (
            <SpotCard
              key={`${pick.kind}-${pick.id}`}
              pick={pick}
              width={Math.min(340, width - 76)}
              onPress={() =>
                router.push(pick.kind === 'series' ? `/serie/${pick.id}` : `/film/${pick.id}`)
              }
            />
          ))}
        </Row>
      ) : null}

      {/* 2. Les reprises, juste en dessous : elles restent, sans ouvrir la page. */}
      {data?.resume.length ? (
        <Row title="Reprendre">
          {data.resume.map((entry) => (
            <Card
              key={`${entry.itemType}-${entry.itemId}`}
              title={entry.parentLabel ?? entry.label}
              subtitle={entry.parentLabel ? entry.label : undefined}
              imageUrl={entry.imageUrl}
              progressRatio={entry.durationSec ? entry.positionSec / entry.durationSec : null}
              onPress={() => {
                if (entry.target.kind === 'series') {
                  router.push(`/serie/${entry.target.id}`);
                } else {
                  router.push({
                    pathname: '/player',
                    params: {
                      itemType: 'stream',
                      itemId: String(entry.itemId),
                      label: entry.label,
                    },
                  });
                }
              }}
            />
          ))}
        </Row>
      ) : null}

      {/* 3. Ce qui est arrive depuis la derniere visite. */}
      {data?.arrivals.since && arrivals > 0 ? (
        <View style={styles.news}>
          <View style={styles.newsN}>
            <Text style={styles.newsNum}>{arrivals.toLocaleString('fr-FR')}</Text>
            <Text style={styles.newsWord}>{arrivals > 1 ? 'nouveautés' : 'nouveauté'}</Text>
          </View>
          <View style={styles.newsBar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.newsTitle}>Nouveau depuis votre dernière visite</Text>
            <Text style={styles.newsSub}>
              {`${data.arrivals.movies} films et ${data.arrivals.series} séries depuis le ${new Date(
                data.arrivals.since,
              ).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
            </Text>
          </View>
        </View>
      ) : null}

      {data?.recentMovies.length ? (
        <>
          <SectionHeader title="Films" onSeeAll={() => router.push('/films')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {data.recentMovies.map((m) => (
              <Card
                key={m.id}
                title={m.name}
                imageUrl={m.iconUrl}
                rating={m.rating}
                badge={m.isAdult ? '18+' : null}
                onPress={() => router.push(`/film/${m.id}`)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {data?.recentSeries.length ? (
        <>
          <SectionHeader title="Séries" onSeeAll={() => router.push('/series')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {data.recentSeries.map((s) => (
              <Card
                key={s.id}
                title={s.name}
                imageUrl={s.coverUrl}
                rating={s.rating}
                onPress={() => router.push(`/serie/${s.id}`)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* 4. Ma liste, par type. */}
      {listGroups.map(([label, entries]) =>
        entries.length ? (
          <Row key={label} title={`Ma liste · ${label}`}>
            {entries.map((fav) => (
              <Card
                key={`${fav.itemType}-${fav.itemId}`}
                title={fav.label}
                imageUrl={fav.imageUrl}
                kind={fav.target.kind === 'live' ? 'channel' : 'work'}
                wide={fav.target.kind === 'live'}
                onPress={() => openFavorite(fav)}
              />
            ))}
          </Row>
        ) : null,
      )}

      {/* 5. Les rangees par categorie, telles que le serveur les compose. */}
      {data?.rows.map((row) => (
        <Row key={row.category.id} title={row.category.name}>
          {row.items.map((item) =>
            item.type === 'live' ? (
              <ChannelCard
                key={`live-${item.id}`}
                channel={item}
                onPress={() =>
                  router.push({
                    pathname: '/player',
                    params: { itemType: 'stream', itemId: String(item.id), label: item.name },
                  })
                }
              />
            ) : (
              <Card
                key={`${item.type}-${item.id}`}
                title={item.name}
                imageUrl={item.type === 'series' ? item.coverUrl : item.iconUrl}
                rating={item.rating}
                onPress={() =>
                  item.type === 'series'
                    ? router.push(`/serie/${item.id}`)
                    : router.push(`/film/${item.id}`)
                }
              />
            ),
          )}
        </Row>
      ))}
    </ScrollView>
  );
}

/**
 * Une carte de la mise en avant.
 *
 * Elle porte l'image large du fournisseur — presque toutes les oeuvres en ont
 * une, et elle ne servait nulle part. Le titre se pose dessus, sur son propre
 * degrade, comme sur toutes les autres cartes depuis la refonte.
 */
function SpotCard({
  pick,
  width,
  onPress,
}: {
  pick: Spotlight;
  width: number;
  onPress: () => void;
}) {
  const parts = [pick.genre, pick.year].filter(Boolean).join(' · ');
  return (
    <Focusable onPress={onPress} style={[styles.spot, { width }]}>
      <View style={styles.spotMedia}>
        <Image
          source={{ uri: pick.backdropUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.45, 1]}
          style={styles.spotVeil}
          pointerEvents="none"
        >
          <Text style={styles.spotTitle} numberOfLines={2}>
            {workTitle(pick.name)}
          </Text>
          <View style={styles.spotLine}>
            {pick.rating != null && pick.rating > 0 ? (
              <Text style={styles.spotRating}>{pick.rating.toFixed(1)}</Text>
            ) : null}
            {parts ? (
              <Text style={styles.spotMeta} numberOfLines={1}>
                {parts}
              </Text>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    </Focusable>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.h2, { marginTop: 0, marginBottom: 0 }]}>{title}</Text>
      <Focusable onPress={onSeeAll} hitSlop={10}>
        <Text style={styles.dim}>Tout voir →</Text>
      </Focusable>
    </View>
  );
}
