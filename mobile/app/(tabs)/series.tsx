import { useRouter } from 'expo-router';
import { CatalogList } from '../../components/CatalogList';

export default function SeriesScreen() {
  const router = useRouter();
  return (
    <CatalogList
      favoriteLabel="Mes séries"
      watchedLabel="Vues récemment"
      endpoint="/api/series"
      categoryType="series"
      cardWidth={130}
      onSelect={(item) => router.push(`/serie/${item.id}`)}
    />
  );
}
