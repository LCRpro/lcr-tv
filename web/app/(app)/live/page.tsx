'use client';

import { Suspense, useMemo } from 'react';
import type { LiveChannel, Paginated } from '@iptv/shared';
import { api, qs } from '../../../lib/api';
import { useAsync } from '../../../lib/hooks';
import { usePlayer } from '../../../lib/player';
import { Catalogue } from '../../../components/Catalogue';
import { Keypad } from '../../../components/Keypad';
import { SkeletonCatalogue } from '../../../components/ui';

/**
 * Le direct : le catalogue, et la colonne pour s'y retrouver.
 *
 * La page a porté tour à tour une grille de logos triée par catégorie, une
 * télécommande de chaînes numérotées, puis une bande d'épinglées — trois
 * façons d'occuper le haut de l'écran avant d'arriver au sujet. Tout est
 * maintenant dans la colonne : « Mes chaînes » pour les épinglées, « Chaînes
 * vues récemment » pour ce qu'on a ouvert, les catégories du fournisseur pour
 * le reste. Un clic filtre la grille au lieu d'ajouter un bloc au-dessus.
 *
 * Ne reste que le pavé numérique, qui n'occupe rien : il n'apparaît qu'au
 * moment où l'on tape un numéro.
 */
export default function LivePage() {
  return (
    <Suspense fallback={<SkeletonCatalogue kind="channel" />}>
      <LiveScreen />
    </Suspense>
  );
}

function LiveScreen() {
  const { play } = usePlayer();

  /*
   * Les soixante premières, dans l'ordre du pays.
   *
   * Rien ne les affiche : c'est le pavé numérique qui en a besoin, pour savoir
   * quelle chaîne porte le 6. `sort=fr` met les langues du profil devant, puis
   * `channel_rank` — les chaînes numérotées arrivent donc en tête, et soixante
   * suffisent : aucune numérotation nationale ne va au-delà de la trentaine,
   * le reste sert de marge pour les déclinaisons de qualité.
   */
  const head = useAsync<Paginated<LiveChannel>>(
    () => api.get(`/api/live${qs({ sort: 'fr', limit: 60 })}`),
    [],
  );
  const channels = useMemo(() => head.data?.items ?? [], [head.data]);

  return (
    <>
      {/* Le pavé écoute la page entière : « fais 6 » doit marcher partout. */}
      <Keypad
        channels={channels}
        onPlay={(c) => play({ itemType: 'stream', itemId: c.id, label: c.name })}
      />
      <Catalogue kind="live" title="Live" />
    </>
  );
}
