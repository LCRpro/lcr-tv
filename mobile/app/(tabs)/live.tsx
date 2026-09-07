import { useRouter } from 'expo-router';
import { CatalogList } from '../../components/CatalogList';

export default function LiveScreen() {
  const router = useRouter();
  return (
    <CatalogList
      favoriteLabel="Mes chaines"
      watchedLabel="Vues récemment"
      endpoint="/api/live"
      categoryType="live"
      cardWidth={190}
      // Une chaine n'a pas de fiche : on ouvre directement le lecteur.
      onSelect={(item) =>
        router.push({
          pathname: '/player',
          params: { itemType: 'stream', itemId: String(item.id), label: item.name },
        })
      }
    />
  );
}
