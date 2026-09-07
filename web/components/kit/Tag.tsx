'use client';

import type { ReactNode } from 'react';

/**
 * Une étiquette d'état.
 *
 * `tone` dit ce que l'étiquette **signifie**, pas de quelle couleur elle est :
 * `live` est réservé à ce qui passe en ce moment, `on` à ce qui fonctionne,
 * `accent` à ce qui est mis en avant. Écrire la couleur à l'appel — ce que
 * permettait `data-tone` posé à la main — laissait dériver le sens : un rouge
 * finissait par vouloir dire « attention » ici et « direct » là.
 */
export type Tone = 'neutral' | 'on' | 'live' | 'accent' | 'warn';

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="tag" data-tone={tone === 'neutral' ? undefined : tone}>
      {children}
    </span>
  );
}

/**
 * L'interrupteur.
 *
 * Un interrupteur et non une case : le geste est une bascule, et l'état se lit
 * de loin sans avoir à chercher la coche. `role="switch"` le dit aussi aux
 * lecteurs d'écran, qui annoncent alors « activé » plutôt que « coché ».
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
