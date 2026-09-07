'use client';

import { Suspense } from 'react';
import { Catalogue } from '../../../components/Catalogue';
import { SkeletonCatalogue } from '../../../components/ui';

/**
 * Les films.
 *
 * Le catalogue est riche depuis l'enrichissement — quatre-vingt-dix mille
 * œuvres appariées à TMDB, avec une note, un genre et un synopsis en quatre
 * langues — et la page ne s'en servait pas : elle filtrait par catégorie du
 * fournisseur, « 4K », « NETFLIX », « LATEST ».
 *
 * Elle n'a rien au-dessus de sa grille. Une bande de rappel y a vécu — ce
 * qu'on avait commencé, ce qu'on avait mis de côté — puis a disparu quand la
 * colonne s'est mise à porter les mêmes entrées : « Mes films » et « Films vus
 * récemment » y filtrent la grille elle-même, à un clic, sans repousser le
 * catalogue vers le bas.
 */
export default function FilmsPage() {
  return (
    <Suspense fallback={<SkeletonCatalogue kind="work" />}>
      <Catalogue kind="vod" title="Films" />
    </Suspense>
  );
}
