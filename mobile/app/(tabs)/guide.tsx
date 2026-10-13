import { FlatList, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LiveChannel, Paginated } from '@iptv/shared';
import { channelTitle } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { colors, onArt, radius, styles } from '../../lib/theme';
import { Empty, ErrorNotice, Loading, formatClock } from '../../components/ui';
import { Focusable } from '../../components/Focusable';

/**
 * La grille — ce qui passe, chaine par chaine.
 *
 * Le guide XMLTV du fournisseur peut se taire (le notre est muet depuis des
 * semaines) : l'ecran ne promet donc rien qu'il ne tienne. Quand une emission
 * est connue, elle s'affiche ; sinon la ligne le dit, et l'on peut toujours
 * ouvrir la chaine. Rien a voir avec « Direct », qui est un mur de vignettes :
 * ici c'est une liste, lue de haut en bas, l'heure a gauche.
 */
export default function GuideScreen() {
  const router = useRouter();
  const { data, loading, error } = useAsync<Paginated<LiveChannel>>(
    () => api.get('/api/live?limit=120'),
    [],
  );

  const items = data?.items ?? [];
  const withProg = items.filter((c) => c.now).length;

  return (
    <View style={styles.screen}>
      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={styles.h1}>Guide</Text>
        <Text style={styles.dim}>
          {withProg > 0
            ? `${withProg} chaîne(s) avec un programme en cours.`
            : 'La grille du fournisseur est indisponible pour le moment.'}
        </Text>
      </View>

      <ErrorNotice error={error} />

      {loading && items.length === 0 ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>Aucune chaîne à afficher.</Empty>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => `g-${c.id}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const name = channelTitle(item.name);
            return (
              <Focusable
                onPress={() =>
                  router.push({
                    pathname: '/player',
                    params: { itemType: 'stream', itemId: String(item.id), label: item.name },
                  })
                }
                style={guide.row}
              >
                <View style={guide.plaque}>
                  {item.iconUrl ? (
                    <Image source={{ uri: item.iconUrl }} style={guide.logo} resizeMode="contain" />
                  ) : (
                    <Text style={guide.initials}>{name.slice(0, 2).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={guide.name} numberOfLines={1}>
                    {item.number != null ? `${item.number} · ` : ''}
                    {name}
                  </Text>
                  {item.now ? (
                    <Text style={guide.prog} numberOfLines={1}>
                      <Text style={guide.time}>{formatClock(item.now.startAt)} </Text>
                      {item.now.title}
                    </Text>
                  ) : (
                    <Text style={guide.none} numberOfLines={1}>
                      Programme indisponible
                    </Text>
                  )}
                </View>
              </Focusable>
            );
          }}
        />
      )}
    </View>
  );
}

const guide = {
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  plaque: {
    width: 58,
    height: 40,
    borderRadius: 8,
    backgroundColor: onArt.plaque,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  logo: { width: '72%' as const, height: '72%' as const },
  initials: { color: colors.faint, fontSize: 13, fontWeight: '800' as const },
  name: { color: colors.text, fontSize: 14.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  prog: { color: colors.dim, fontSize: 12.5, marginTop: 3 },
  time: { color: colors.text, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  none: { color: colors.faint, fontSize: 12, marginTop: 3 },
};
