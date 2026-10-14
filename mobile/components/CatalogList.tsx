import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { colors, gridColumns, onArt, radius, styles } from '../lib/theme';
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
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Choisir une categorie ferme le panneau : un deuxieme geste pour fermer
  // serait un geste de trop.
  const pick = (value: number | 'favorites' | 'watched' | null) => {
    setCategoryId(value);
    setPickerOpen(false);
  };

  // La categorie du fournisseur en cours, s'il y en a une — sert a etiqueter le
  // bouton qui ouvre le menu.
  const activeCategory =
    typeof categoryId === 'number'
      ? categories.data?.items.find((c) => c.id === categoryId) ?? null
      : null;

  const triggerLabel =
    categoryId === 'favorites'
      ? favoriteLabel
      : categoryId === 'watched'
        ? watchedLabel
        : activeCategory
          ? splitLanguage(activeCategory.name).title
          : 'Toutes les catégories';

  const triggerMark =
    categoryId === 'favorites' ? (
      <IconStar filled color={colors.gold} />
    ) : categoryId === 'watched' ? (
      <IconClock />
    ) : activeCategory ? (
      <CategoryMark icon={categoryIcon(activeCategory.name, activeCategory.languageCode)} />
    ) : (
      <Ionicons name="apps" size={16} color={colors.dim} />
    );

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

      {/* Un seul bouton plutot qu'une rangee qui fuit hors de l'ecran : il dit
          la categorie en cours et ouvre la liste entiere d'un geste. */}
      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <Focusable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [cat.trigger, pressed && { opacity: 0.8 }]}
        >
          <View style={cat.triggerMark}>{triggerMark}</View>
          <Text style={cat.triggerText} numberOfLines={1}>
            {triggerLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.dim} />
        </Focusable>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        {/* Le voile ferme ; la feuille, posee par-dessus, retient les touches. */}
        <View style={cat.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} />
          <View style={cat.sheet}>
            <View style={cat.handle} />
            <Text style={cat.sheetTitle}>Catégorie</Text>
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <OptionRow
                label={`${favoriteLabel}${favoriteCount == null ? '' : ` (${favoriteCount})`}`}
                mark={<IconStar filled color={colors.gold} />}
                active={categoryId === 'favorites'}
                onPress={() => pick('favorites')}
              />
              <OptionRow
                label={`${watchedLabel}${watchedCount == null ? '' : ` (${watchedCount})`}`}
                mark={<IconClock />}
                active={categoryId === 'watched'}
                onPress={() => pick('watched')}
              />
              <OptionRow
                label="Toutes les catégories"
                mark={<Ionicons name="apps" size={16} color={colors.dim} />}
                active={categoryId === null}
                onPress={() => pick(null)}
              />
              {/* Les categories arrivent triees « francais d'abord » par le serveur ;
                  un intitule marque la bascule vers les autres langues. */}
              {categories.data?.items.map((c, i, all) => {
                const startsOthers =
                  i > 0 &&
                  languageRank(all[i - 1]!.name, all[i - 1]!.languageCode) === 0 &&
                  languageRank(c.name, c.languageCode) !== 0;
                return (
                  <View key={c.id}>
                    {startsOthers ? <Text style={cat.divider}>AUTRES LANGUES</Text> : null}
                    <OptionRow
                      label={`${splitLanguage(c.name).title} (${c.count})`}
                      mark={<CategoryMark icon={categoryIcon(c.name, c.languageCode)} />}
                      active={categoryId === c.id}
                      onPress={() => pick(c.id)}
                      pinned={c.isFavorite}
                      onTogglePin={() => void togglePin(c)}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

/**
 * Une ligne du menu des categories.
 *
 * L'icone a gauche — drapeau, theme ou globe — puis le nom ; a droite, l'etoile
 * qui epingle (sur les categories du fournisseur seulement) et la coche de la
 * selection courante. La ligne active se teinte d'accent, pour qu'on la retrouve
 * d'un coup d'oeil en rouvrant le menu.
 */
function OptionRow({
  label,
  mark,
  active,
  pinned,
  onPress,
  onTogglePin,
}: {
  label: string;
  mark?: ReactNode;
  active: boolean;
  pinned?: boolean;
  onPress: () => void;
  onTogglePin?: () => void;
}) {
  return (
    <Focusable
      onPress={onPress}
      style={({ pressed }) => [cat.row, active && cat.rowActive, pressed && { opacity: 0.7 }]}
    >
      <View style={cat.rowMark}>{mark ?? null}</View>
      <Text style={[cat.rowText, active && cat.rowTextActive]} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {onTogglePin ? (
        <Focusable onPress={onTogglePin} hitSlop={8} style={{ padding: 4 }}>
          <IconStar filled={Boolean(pinned)} size={15} color={pinned ? colors.gold : colors.faint} />
        </Focusable>
      ) : null}
      {active ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
    </Focusable>
  );
}

const cat = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerMark: { width: 18, alignItems: 'center' },
  triggerText: { flex: 1, color: colors.text, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  rowMark: { width: 20, alignItems: 'center' },
  rowText: { color: colors.dim, fontSize: 14.5, fontWeight: '600' },
  rowTextActive: { color: colors.text, fontWeight: '700' },
  divider: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
  },
});
