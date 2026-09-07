'use client';

import type { ReactNode } from 'react';

/**
 * Une ligne de réglage : ce que c'est, ce que ça vaut, ce qu'on peut en faire.
 *
 * Sept lignes de HTML pour dire trois choses, recopiées à l'identique sur les
 * pages de compte et d'administration. Ce n'est pas la longueur qui gêne, c'est
 * qu'elle laisse dériver : ici le titre est un `<div className="trow-title">`,
 * là un `<span>`, et l'ordre des deux dernières colonnes s'inverse d'un écran à
 * l'autre sans que personne l'ait décidé.
 *
 * `media` sert quand la ligne porte une vignette — un profil, un appareil.
 */
export function SettingRow({
  media,
  title,
  badges,
  detail,
  actions,
  muted,
}: {
  media?: ReactNode;
  title: ReactNode;
  /** Étiquettes d'état, à droite du titre. */
  badges?: ReactNode;
  /** La ligne discrète sous le titre : une valeur, une date, un décompte. */
  detail?: ReactNode;
  actions?: ReactNode;
  /** Grisée : le réglage existe mais ne s'applique pas en ce moment. */
  muted?: boolean;
}) {
  return (
    <div className="trow" data-off={muted || undefined}>
      {media}
      <div className="trow-body">
        <div className="trow-title">
          {title}
          {badges}
        </div>
        {detail && <div className="trow-sub">{detail}</div>}
      </div>
      {actions && <div className="trow-actions">{actions}</div>}
    </div>
  );
}
