import { useRouter } from 'expo-router';
import { CatalogList } from '../../components/CatalogList';

export default function FilmsScreen() {
  const router = useRouter();
  return (
    <CatalogList
      favoriteLabel="Mes films"
      watchedLabel="Vus récemment"
      endpoint="/api/films"
      categoryType="vod"
      cardWidth={130}
      onSelect={(item) => router.push(`/film/${item.id}`)}
    />
  );
}
