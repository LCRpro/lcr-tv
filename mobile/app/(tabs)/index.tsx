import { useEffect, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { workTitle, type FavoriteEntry, type HomePayload, type Spotlight } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, styles } from '../../lib/theme';
import { Card, ErrorNotice, RailTitle, Row } from '../../components/ui';
import { Focusable } from '../../components/Focusable';
import { BrandSplash } from '../../components/BrandSplash';

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
  const { data, error, loading, reload } = useAsync<HomePayload>(() => api.get('/api/home'), []);

  // Premier lancement : le catalogue se remplit, on suit sans que l'utilisateur
  // ait a tirer pour rafraichir.
  useEffect(() => {
    if (!data?.catalogEmpty && !data?.sync?.running) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [data?.catalogEmpty, data?.sync?.running, reload]);

  if (loading && !data) return <BrandSplash />;

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

  // L'accueil, dans l'ordre voulu : la mise en avant en diaporama, puis les
  // favoris du profil (films, séries), les dernières nouveautés, et ses chaînes.
  const favMovies = (data?.favorites ?? []).filter((f) => f.target.kind === 'movie');
  const favSeries = (data?.favorites ?? []).filter((f) => f.target.kind === 'series');
  const favLive = (data?.favorites ?? []).filter((f) => f.target.kind === 'live');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.text} />
      }
    >
      <ErrorNotice error={error} />

      {/* 1. La mise en avant, en diaporama : elle défile seule et se touche. */}
      {data?.spotlight.length ? (
        <HeroSlider
          picks={data.spotlight}
          onOpen={(p) => router.push(p.kind === 'series' ? `/serie/${p.id}` : `/film/${p.id}`)}
        />
      ) : null}

      {/* 2. Les favoris du profil : ses films, puis ses séries. */}
      {favMovies.length ? (
        <Row title="Mes films">
          {favMovies.map((fav) => (
            <Card
              key={`fm-${fav.itemId}`}
              title={fav.label}
              imageUrl={fav.imageUrl}
              onPress={() => openFavorite(fav)}
            />
          ))}
        </Row>
      ) : null}

      {favSeries.length ? (
        <Row title="Mes séries">
          {favSeries.map((fav) => (
            <Card
              key={`fs-${fav.itemId}`}
              title={fav.label}
              imageUrl={fav.imageUrl}
              onPress={() => openFavorite(fav)}
            />
          ))}
        </Row>
      ) : null}

      {/* 3. Les dernières nouveautés — films, puis séries. */}
      {data?.recentMovies.length ? (
        <>
          <SectionHeader title="Derniers films" onSeeAll={() => router.push('/films')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
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
          <SectionHeader title="Dernières séries" onSeeAll={() => router.push('/series')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
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

      {/* 4. Les chaînes TV mises en favori. */}
      {favLive.length ? (
        <Row title="Chaînes favorites">
          {favLive.map((fav) => (
            <Card
              key={`fl-${fav.itemId}`}
              title={fav.label}
              imageUrl={fav.imageUrl}
              kind="channel"
              wide
              onPress={() => openFavorite(fav)}
            />
          ))}
        </Row>
      ) : null}

      <View style={{ height: 16 }} />
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
/**
 * Le diaporama de mise en avant.
 *
 * Plusieurs titres passent en grand, l'un après l'autre : le diaporama avance
 * seul toutes les six secondes, et répond au doigt qui le fait glisser. Des
 * points sous l'image disent où l'on en est. Il saigne hors du rembourrage de
 * la page pour toucher les bords, et chaque vue se touche pour ouvrir la fiche.
 */
function HeroSlider({ picks, onOpen }: { picks: Spotlight[]; onOpen: (p: Spotlight) => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (picks.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % picks.length;
        ref.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [picks.length, width]);

  return (
    <View style={{ marginHorizontal: -16, marginTop: -16, marginBottom: 2 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) setIndex(i);
        }}
      >
        {picks.map((p) => (
          <View key={`${p.kind}-${p.id}`} style={{ width }}>
            <HeroSlide pick={p} onOpen={() => onOpen(p)} />
          </View>
        ))}
      </ScrollView>
      {picks.length > 1 ? (
        <View style={hs.dots}>
          {picks.map((p, i) => (
            <View key={`${p.kind}-${p.id}`} style={[hs.dot, i === index && hs.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HeroSlide({ pick, onOpen }: { pick: Spotlight; onOpen: () => void }) {
  const [listed, setListed] = useState(pick.isFavorite);
  const itemType = pick.kind === 'series' ? 'series' : 'stream';

  const toggle = () => {
    const next = !listed;
    setListed(next);
    const call = next
      ? api.post('/api/me/favorites', { itemType, itemId: pick.id })
      : api.del(`/api/me/favorites/${itemType}/${pick.id}`);
    void call.catch(() => setListed(!next));
  };

  const genre = pick.genre ? pick.genre.split(/[,•]/)[0]?.trim() : null;

  return (
    <Focusable onPress={onOpen} style={{ width: '100%' }}>
      <View style={styles.heroWrap}>
        <Image source={{ uri: pick.backdropUrl }} style={styles.heroBg} resizeMode="cover" />
        <LinearGradient
          colors={[
            'rgba(13,14,22,0.1)',
            'rgba(13,14,22,0)',
            'rgba(13,14,22,0.55)',
            'rgba(13,14,22,0.92)',
            '#0d0e16',
          ]}
          locations={[0, 0.3, 0.62, 0.86, 1]}
          style={styles.heroVeil}
          pointerEvents="none"
        />
        <View style={styles.heroBody}>
          <View style={styles.heroEyebrow}>
            <View style={styles.heroEyebrowDot} />
            <Text style={styles.heroEyebrowText}>À LA UNE</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {workTitle(pick.name)}
          </Text>
          <View style={styles.heroMetaRow}>
            {pick.rating != null && pick.rating > 0 ? (
              <Text style={styles.heroStar}>★ {pick.rating.toFixed(1)}</Text>
            ) : null}
            {pick.year ? <Text style={styles.heroMeta}>{pick.year}</Text> : null}
            {genre ? <View style={styles.heroDot} /> : null}
            {genre ? (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {genre}
              </Text>
            ) : null}
          </View>
          {pick.plot ? (
            <Text style={styles.heroPlot} numberOfLines={2}>
              {pick.plot}
            </Text>
          ) : null}
          <View style={styles.heroActions}>
            <Focusable onPress={toggle} style={styles.heroRound}>
              <Ionicons
                name={listed ? 'checkmark' : 'add'}
                size={24}
                color={listed ? colors.accent : colors.text}
              />
            </Focusable>
            <Focusable onPress={onOpen} style={styles.heroPlay}>
              <Ionicons name="play" size={17} color={colors.onAccent} />
              <Text style={styles.heroPlayText}>Lecture</Text>
            </Focusable>
            <Focusable onPress={onOpen} style={styles.heroRound}>
              <Ionicons name="information-circle-outline" size={24} color={colors.text} />
            </Focusable>
          </View>
        </View>
      </View>
    </Focusable>
  );
}

const hs = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 11,
    paddingBottom: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotOn: { backgroundColor: colors.accent, width: 18 },
});

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <RailTitle
      title={title}
      right={
        <Focusable onPress={onSeeAll} hitSlop={10}>
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>Tout voir →</Text>
        </Focusable>
      }
    />
  );
}
