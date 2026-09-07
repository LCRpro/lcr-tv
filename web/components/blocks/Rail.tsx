'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../lib/i18n';

/**
 * Une rangée qui défile.
 *
 * Les nouveautés se lisent en glissant : vingt affiches sur une ligne qu'on
 * fait avancer, pas une grille figée à huit. La barre de défilement est
 * masquée — elle coupait le bas des vignettes — et deux choses la remplacent :
 * les flèches, du côté où il reste quelque chose, et le glissement à la souris.
 * Le doigt et le pavé tactile glissent déjà tout seuls.
 */
export function Rail({ label, children }: { label: string; children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Une marge d'un pixel : les largeurs sont fractionnaires, et `scrollLeft`
    // n'atteint jamais exactement le maximum théorique.
    setEdges({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    // Les vignettes arrivent avec leurs images : la largeur du rail change
    // après le premier rendu, et une mesure unique se tromperait.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const slide = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    // Un peu moins d'un écran : la dernière vignette visible reste en vue et
    // sert de repère, au lieu de disparaître d'un coup.
    el.scrollBy({ left: direction * el.clientWidth * 0.82, behavior: 'smooth' });
  };

  /*
   * Le glissement à la souris. Le pointeur est capturé pour que le geste
   * survive à la sortie du rail ; un vrai clic reste un clic — le blocage des
   * liens ne s'arme qu'au-delà de quelques pixels parcourus.
   *
   * Le `dragstart` est refusé, et c'est **lui** qui empêchait tout : une
   * affiche est une image dans un lien, deux choses que le navigateur sait
   * déjà faire glisser. Au quatrième pixel il ouvrait son propre
   * glisser-déposer, envoyait `pointercancel`, et la rangée ne bougeait
   * jamais — seules les flèches marchaient.
   */
  const drag = useRef<{ id: number; x: number; from: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { id: e.pointerId, x: e.clientX, from: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const el = ref.current;
    if (!state || !el || e.pointerId !== state.id) return;
    const dx = e.clientX - state.x;
    if (!state.moved) {
      if (Math.abs(dx) < 4) return;
      state.moved = true;
      setDragging(true);
      el.setPointerCapture(state.id);
    }
    el.scrollLeft = state.from - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || e.pointerId !== state.id) return;
    const el = ref.current;
    if (state.moved && el?.hasPointerCapture(state.id)) el.releasePointerCapture(state.id);
    drag.current = null;
    // Le relâchement précède le clic : on garde l'état un tour de boucle pour
    // que le `onClickCapture` sache qu'il vient d'un glissement.
    if (state.moved) setTimeout(() => setDragging(false), 0);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="rail">
      <div
        className="rail-track"
        ref={ref}
        onScroll={measure}
        data-scrollable={edges.left || edges.right || undefined}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
      {edges.left && (
        <button
          className="rail-arrow"
          data-side="left"
          onClick={() => slide(-1)}
          aria-label={t('{title} : voir les précédents', { title: label })}
        >
          <Chevron />
        </button>
      )}
      {edges.right && (
        <button
          className="rail-arrow"
          data-side="right"
          onClick={() => slide(1)}
          aria-label={t('{title} : voir la suite', { title: label })}
        >
          <Chevron />
        </button>
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
