import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  categoryIcon,
  languageRank,
  splitLanguage,
  type Category,
  type CategoryType,
  type LiveChannel,
  type Movie,
  type Paginated,
  type SeriesSummary,
} from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { colors, gridColumns, onArt, styles } from '../lib/theme';
import { cardTarget, TV_SAFE } from '../lib/tv';
import { Card, ChannelCard, Empty, ErrorNotice, Loading } from './ui';
import { Focusable } from './Focusable';
import { CategoryMark, IconClock, IconStar } from './marks';

type Item = Movie | SeriesSummary | LiveChannel;

interface Props {
  endpoint: '/api/live' | '/api/films' | '/api/series';
  categoryType: CategoryType;
  /** « Mes chaines », « Mes films »… selon ce que l'ecran liste. */
  favoriteLabel: string;
  /** «Chaines vues recemment», «Films vus recemment»… */
  watchedLabel: string;
  onSelect: (item: Item) => void;
  /** Largeur visee d'une carte ; le nombre de colonnes en decoule. */
  cardWidth?: number;
}

const PAGE_SIZE = 40;

export function CatalogList({
  endpoint,
  categoryType,
  favoriteLabel,
  watchedLabel,
  onSelect,
  cardWidth = 130,
}: Props) {
  const { width } = useWindowDimensions();
  // Sur TV on montre **moins** d'elements, pas plus : parcourir vingt colonnes
  // a la telecommande est interminable.
  const columns = gridColumns(width - TV_SAFE * 2, cardTarget(cardWidth));
  /*
   * Deux entrees qui ne sont pas des categories : ce qu'on a mis de cote, ce
   * qu'on a deja regarde. Elles filtrent la meme grille, ce qui est la raison
   * de les mettre au meme endroit, et une seule est retenue a la fois.
   */
  const [categoryId, setCategoryId] = useState<number | 'favorites' | 'watched' | null>(null);
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term);

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favoriteTick, setFavoriteTick] = useState(0);

  const categories = useAsync<{ items: Category[] }>(
    () => api.get(`/api/categories/${categoryType}`),
    [categoryType],
  );

  const query = useCallback(
    (nextOffset: number) =>
      api.get<Paginated<Item>>(
        `${endpoint}${qs({
          categoryId: typeof categoryId === 'number' ? categoryId : undefined,
          favorites: categoryId === 'favorites' ? true : undefined,
          watched: categoryId === 'watched' ? true : undefined,
          q: debounced.trim().length >= 2 ? debounced.trim() : undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        })}`,
      ),
    [endpoint, categoryId, debounced],
  );

  const first = useAsync<Paginated<Item>>(() => query(0), [query]);

  useEffect(() => {
    if (!first.data) return;
    setItems(first.data.items);
    setTotal(first.data.total);
    setOffset(first.data.items.length);
  }, [first.data]);

  /*
   * Bascules de favori, appliquees a l'ecran avant la reponse du serveur : une
   * etoile qui attend un aller-retour donne l'impression de ne pas repondre. En
   * cas d'echec on recharge, l'etat affiche redevient celui de la base.
   */
  const toggleChannel = async (channel: LiveChannel) => {
    const next = !channel.isFavorite;
    setItems((prev) =>
      prev.map((i) => (i.type === 'live' && i.id === channel.id ? { ...i, isFavorite: next } : i)),
    );
    try {
      if (next) await api.post('/api/me/favorites', { itemType: 'stream', itemId: channel.id });
      else await api.del(`/api/me/favorites/stream/${channel.id}`);
      setFavoriteTick((t) => t + 1);
    } catch {
      first.reload();
    }
  };

  const togglePin = async (category: Category) => {
    try {
      if (category.isFavorite) await api.del(`/api/me/favorites/categories/${category.id}`);
      else await api.post('/api/me/favorites/categories', { categoryId: category.id });
    } finally {
      // La rangee se reordonne : on relit plutot que de rejouer le tri serveur.
      categories.reload();
    }
  };

  /*
   * Compte des favoris : une requete d'un seul element dont seul le total sert.
   * Le listing sait deja compter avec la deduplication et les droits ; refaire
   * ce calcul ailleurs le ferait diverger.
   */
  const favoriteTotal = useAsync<Paginated<Item>>(
    () => api.get(`${endpoint}${qs({ favorites: true, limit: 1 })}`),
    [endpoint, favoriteTick],
  );
  const favoriteCount = favoriteTotal.data?.total ?? null;

  /* Meme mesure pour ce qu'on a deja regarde : le listing sait compter, on ne
     recalcule pas. */
  const watchedTotal = useAsync<Paginated<Item>>(
    () => api.get(`${endpoint}${qs({ watched: true, limit: 1 })}`),
    [endpoint],
  );
  const watchedCount = watchedTotal.data?.total ?? null;

  const loadMore = async () => {
    if (loadingMore || offset >= total) return;
    setLoadingMore(true);
    try {
      const page = await query(offset);
      setItems((prev) => [...prev, ...page.items]);
      setOffset((o) => o + page.items.length);
    } catch {
      // On reessaiera au prochain scroll : inutile d'interrompre la navigation.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={{ padding: 12, paddingBottom: 0 }}>
        <TextInput
          style={styles.input}
          placeholder="Filtrer…"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          value={term}
          onChangeText={setTerm}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ padding: 12, gap: 8 }}
      >
        <Chip
          label={`${favoriteLabel}${favoriteCount == null ? '' : ` (${favoriteCount})`}`}
          mark={<IconStar filled color={colors.gold} />}
          active={categoryId === 'favorites'}
          onPress={() => setCategoryId((c) => (c === 'favorites' ? null : 'favorites'))}
        />
        <Chip
          label={`${watchedLabel}${watchedCount == null ? '' : ` (${watchedCount})`}`}
          mark={<IconClock />}
          active={categoryId === 'watched'}
          onPress={() => setCategoryId((c) => (c === 'watched' ? null : 'watched'))}
        />
        <Chip label="Toutes" active={categoryId === null} onPress={() => setCategoryId(null)} />
        {/* Les categories arrivent triees « francais d'abord » par le serveur.
            Un simple repere marque la coupure : sans lui, la rangee repart a
            « Afrique » apres dix-sept entrees francaises sans qu'on comprenne. */}
        {categories.data?.items.map((c, i, all) => {
          // `categoryIcon` et non `splitLanguage` : une categorie sans langue —
          // « LA LIGA », « IMDB TOP 500 » — recoit un repere de theme plutot que
          // rien, sans quoi elle detonne au milieu d'une rangee a drapeaux.
          const mark = categoryIcon(c.name, c.languageCode);
          const startsOthers =
            i > 0 &&
            languageRank(all[i - 1]!.name, all[i - 1]!.languageCode) === 0 &&
            languageRank(c.name, c.languageCode) !== 0;
          return (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {startsOthers && <Text style={styles.faint}>AUTRES LANGUES</Text>}
              <Chip
                // Le serveur ne donne un logo que si les chaines de la categorie
                // le partagent vraiment : AHL, NHL, Apple TV. Sinon le drapeau.
                logoUrl={c.logoUrl ?? null}
                mark={<CategoryMark icon={mark} />}
                label={`${splitLanguage(c.name).title} (${c.count})`}
                active={categoryId === c.id}
                onPress={() => setCategoryId((cur) => (cur === c.id ? null : c.id))}
                pinned={c.isFavorite}
                onTogglePin={() => void togglePin(c)}
              />
            </View>
          );
        })}
      </ScrollView>

      <ErrorNotice error={first.error} />

      {first.loading && items.length === 0 ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>Aucun résultat pour ce filtre.</Empty>
      ) : (
        <FlatList
          data={items}
          key={columns}
          numColumns={columns}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={{
            padding: 12 + TV_SAFE,
            paddingBottom: 44 + TV_SAFE,
          }}
          columnWrapperStyle={columns > 1 ? { gap: 12, marginBottom: 14 } : undefined}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <Loading /> : null}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              {item.type === 'live' && (
                <Focusable
                  onPress={() => void toggleChannel(item)}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    zIndex: 3,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(27,26,24,0.72)',
                  }}
                >
                  <IconStar filled={Boolean(item.isFavorite)} color={item.isFavorite ? colors.gold : onArt.ink} />
                </Focusable>
              )}
              {item.type === 'live' ? (
                <ChannelCard channel={item} stretch onPress={() => onSelect(item)} />
              ) : (
                <Card
                  title={item.name}
                  imageUrl={item.type === 'series' ? item.coverUrl : item.iconUrl}
                  badge={item.isAdult ? '18+' : null}
                  rating={item.rating}
                  stretch
                  onPress={() => onSelect(item)}
                />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function Chip({
  label,
  mark,
  logoUrl,
  active,
  pinned,
  onPress,
  onTogglePin,
}: {
  label: string;
  /** Marque dessinee — drapeau, theme ou globe — affichee a defaut de logo. */
  mark?: ReactNode;
  logoUrl?: string | null;
  active: boolean;
  pinned?: boolean;
  onPress: () => void;
  /** Absent sur les puces qui ne sont pas des categories du fournisseur. */
  onTogglePin?: () => void;
}) {
  // Les logos du fournisseur meurent souvent : on retombe alors sur l'icone,
  // sinon la puce perdrait son repere et se desalignerait dans la rangee.
  const [broken, setBroken] = useState(false);
  const showLogo = Boolean(logoUrl) && !broken;

  return (
    <Focusable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { flexDirection: 'row', alignItems: 'center', gap: 6 },
        active && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      {showLogo ? (
        <Image
          source={{ uri: logoUrl! }}
          style={{ width: 16, height: 16 }}
          resizeMode="contain"
          onError={() => setBroken(true)}
        />
      ) : (
        mark ?? null
      )}
      <Text style={[styles.chipText, active && styles.chipActiveText]}>{label}</Text>
      {onTogglePin ? (
        <Focusable onPress={onTogglePin} hitSlop={8}>
          <IconStar filled={Boolean(pinned)} size={13} />
        </Focusable>
      ) : null}
    </Focusable>
  );
}
