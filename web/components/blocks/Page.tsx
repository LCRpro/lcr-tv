'use client';

import type { ReactNode } from 'react';
import type { ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { Button } from '../kit';

/**
 * La coquille d'un écran, et ses trois états.
 *
 * Toute page du catalogue dit la même chose dans le même ordre : un titre, ce
 * qu'on compte, ce qu'on peut faire ; puis une erreur éventuelle ; puis, selon
 * ce qui est arrivé, un squelette, un vide ou du contenu.
 *
 * Ces trois états étaient réécrits page par page — treize fois — et chaque
 * réécriture les traitait un peu autrement : l'une enveloppait le squelette
 * dans un panneau, l'autre non ; l'une distinguait « rien du tout » de « rien
 * qui corresponde au filtre », l'autre renvoyait la même phrase aux deux. Le
 * résultat n'était pas faux, il était inégal — et l'inégalité se voit plus
 * qu'une faute.
 *
 * Ici la page décrit ce qu'elle a, pas ce qu'elle doit afficher :
 *
 *     <Page title={t('Ma liste')} count={all.length} noun="favori"
 *           loading={loading} error={error} empty={all.length === 0}
 *           emptyTitle={…} emptyHint={…} skeleton={<SkeletonGrid />}>
 *       {…}
 *     </Page>
 */
interface Props {
  title: string;
  /** À côté du titre : « 23 445 résultats ». Voir `ResultCount`. */
  meta?: ReactNode;
  /** Boutons du haut, à droite du titre. */
  actions?: ReactNode;
  /** Filtres et choix d'affichage, sous le titre et au-dessus du contenu. */
  toolbar?: ReactNode;
  error?: ApiError | null;
  /** Vrai tant que rien n'est encore arrivé : le squelette prend la place. */
  loading?: boolean;
  skeleton?: ReactNode;
  /** Vrai quand la requête a répondu, mais qu'il n'y a rien à montrer. */
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: ReactNode;
  /** L'issue proposée depuis un écran vide : « Parcourir le direct ». */
  emptyAction?: ReactNode;
  children?: ReactNode;
}

export function Page({
  title,
  meta,
  actions,
  toolbar,
  error,
  loading = false,
  skeleton,
  empty = false,
  emptyTitle,
  emptyHint,
  emptyAction,
  children,
}: Props) {
  const t = useT();
  return (
    <>
      <div className="bar">
        <div className="bar-id">
          <h1>{t(title)}</h1>
          {meta}
        </div>
        {actions && <div className="bar-actions">{actions}</div>}
      </div>

      {toolbar && <div className="toolbar">{toolbar}</div>}

      <ErrorBand error={error ?? null} />

      {loading ? (
        skeleton
      ) : empty ? (
        <EmptyState title={emptyTitle ?? t('Rien à afficher')} hint={emptyHint} action={emptyAction} />
      ) : (
        children
      )}
    </>
  );
}

/**
 * L'erreur, dite en clair.
 *
 * Elle s'affichait « SLOT_LIMIT_REACHED — Toutes les connexions… » : le code
 * d'abord, en gras, alors qu'il ne veut rien dire pour qui lit. Le message
 * passe devant ; le code reste, discret, parce qu'il sert à en parler.
 */
export function ErrorBand({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <span>{error.message}</span>
      <code>{error.code}</code>
    </div>
  );
}

/**
 * Un écran vide qui propose quelque chose.
 *
 * Le vide se disait en une phrase grise au milieu de rien. C'est le moment où
 * l'on a le plus besoin d'aide — on est arrivé quelque part et il n'y a rien —
 * et c'est celui où l'application en donnait le moins. Un titre, une phrase, et
 * quand il y en a une, la sortie.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/**
 * Une barre d'outils : ce qui agit sur les résultats, juste au-dessus d'eux.
 *
 * Filtres de langue, choix d'affichage, tri. Ils vivaient dans la barre de
 * rubrique, où ils pesaient autant que le titre de la page alors qu'ils ne
 * changent pas de page — ils changent ce qu'on voit dessous.
 */
export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <>
      {left}
      <span className="spacer" />
      {right}
    </>
  );
}

/** Le bouton d'une action proposée depuis un écran vide. */
export function EmptyAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="primary" onClick={onClick}>
      {children}
    </Button>
  );
}
