'use client';

import { Suspense } from 'react';
import { Catalogue } from '../../../components/Catalogue';
import { SkeletonCatalogue } from '../../../components/ui';

/**
 * Les séries.
 *
 * La même page que les films. Elle commençait par un bloc « Continuer » —
 * les séries en cours, l'épisode où reprendre — qui poussait le catalogue de
 * trois cents pixels pour trois vignettes. La colonne dit la même chose sans
 * rien pousser : « Séries vues récemment » range en tête celles qu'on vient
 * de regarder, et leur fiche sait déjà quel épisode reprendre.
 */
export default function SeriesPage() {
  return (
    <Suspense fallback={<SkeletonCatalogue kind="work" />}>
      <Catalogue kind="series" title="Séries" />
    </Suspense>
  );
}
