import { SkeletonCatalogue } from '../../../components/ui';

/**
 * Repli instantané pendant que la route se charge.
 *
 * Sans lui, cliquer sur un onglet ne produisait rien pendant une à trois
 * secondes — le temps que Next charge le segment, puis que la page aille
 * chercher ses données. Ce fichier s'affiche dès le clic, avant même que le
 * code de la page n'existe.
 */
export default function Loading() {
  return <SkeletonCatalogue kind="work" />;
}
