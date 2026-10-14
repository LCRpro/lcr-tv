import { useRouter } from 'expo-router';
import { SearchPanel } from '../components/SearchPanel';

/**
 * La recherche en écran empilé — le repli du téléviseur.
 *
 * Au téléphone et à la tablette, la loupe de la barre ouvre la recherche sur
 * place (voir `SearchPanel` dans la disposition des onglets). Ici, sur un
 * téléviseur piloté à la télécommande, elle reste un écran à part entière, que
 * « Annuler » referme en revenant en arrière.
 */
export default function SearchScreen() {
  const router = useRouter();
  return <SearchPanel onClose={() => router.back()} />;
}
