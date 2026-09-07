'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';

/**
 * Une boîte de dialogue.
 *
 * Chaque modale de l'application réécrivait la même chose : le voile, l'arrêt
 * de propagation pour que le clic dedans ne ferme pas, et un `useEffect` qui
 * écoute Échap. Trois fois le même code, et trois occasions d'en oublier un
 * morceau.
 *
 * Ce qu'aucune ne faisait, et qui manquait vraiment : **rendre le focus**. On
 * ouvrait la boîte depuis un bouton, on la fermait, et le focus repartait au
 * début du document — au clavier, il fallait retraverser toute la page pour
 * revenir où l'on était. Il est ici mémorisé à l'ouverture et rendu à la
 * fermeture.
 */
interface Props {
  title: string;
  /** Une phrase sous le titre, quand la boîte demande une explication. */
  lede?: ReactNode;
  onClose: () => void;
  /** Présent, la boîte est un formulaire et la touche Entrée le soumet. */
  onSubmit?: (e: FormEvent) => void;
  /** Les boutons du bas, alignés à droite. */
  actions?: ReactNode;
  children?: ReactNode;
}

export function Dialog({ title, lede, onClose, onSubmit, actions, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Le premier champ prend le focus : sans quoi il reste sur le bouton qui a
    // ouvert la boîte, derrière le voile.
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      returnTo?.focus?.();
    };
  }, [onClose]);

  const body = (
    <>
      <h2 className="modal-title">{title}</h2>
      {lede && <p className="modal-lede">{lede}</p>}
      {children}
      {actions && <div className="modal-actions">{actions}</div>}
    </>
  );

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {onSubmit ? (
          <form className="modal" onSubmit={onSubmit}>
            {body}
          </form>
        ) : (
          <div className="modal">{body}</div>
        )}
      </div>
    </div>
  );
}
