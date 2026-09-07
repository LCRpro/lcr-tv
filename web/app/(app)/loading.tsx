import { SkeletonDashboard } from '../../components/ui';

/**
 * Repli instantané pendant que l'accueil se charge.
 *
 * Toutes les autres rubriques en avaient un ; l'accueil, qui est pourtant la
 * page vers laquelle ramène le logo, restait la seule à ne rien afficher entre
 * le clic et l'arrivée des données.
 */
export default function Loading() {
  return <SkeletonDashboard />;
}
