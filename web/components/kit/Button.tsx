'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Le bouton.
 *
 * Il n'existait pas : on écrivait `<button className="btn btn-sm">`, et sept
 * combinaisons de classes différentes s'étaient installées sur cinquante et un
 * appels — sans compter les vingt-six `btn` posés à la main ailleurs. Rien
 * n'empêchait d'en oublier une, ni d'en inventer une huitième.
 *
 * Les variantes sont donc un type, pas une convention de nommage : `variant`
 * dit ce que le bouton **est** — l'action principale d'un écran, une action
 * ordinaire, une destruction — et non de quoi il a l'air. Le style suit.
 */
export type ButtonVariant = 'primary' | 'default' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Placée avant le libellé, alignée dessus. */
  icon?: ReactNode;
  /**
   * Une action en cours désactive le bouton et le dit.
   *
   * Sans elle, chaque appelant réinventait le couple « libellé qui change +
   * `disabled` » — d'où des boutons qui restaient cliquables pendant leur
   * propre requête, et des doubles envois.
   */
  busy?: boolean;
  /** Le libellé de remplacement pendant l'action : « Enregistrement… ». */
  busyLabel?: string;
  /** Occupe toute la largeur de son conteneur. */
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  busy = false,
  busyLabel,
  block = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      className="btn"
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      data-busy={busy || undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="btn-spin" aria-hidden /> : icon}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/**
 * Un lien qui a l'apparence d'un bouton.
 *
 * Neuf endroits écrivaient `<Link className="btn btn-primary">`. C'est bien un
 * lien — il navigue, il s'ouvre dans un onglet, il se copie — et le transformer
 * en `<button>` aurait retiré tout cela. Mais son apparence doit suivre les
 * mêmes variantes, sinon les deux dérivent : c'est déjà arrivé une fois, un
 * `btn-lg` sur un lien n'existant nulle part ailleurs.
 */
export function ButtonLink({
  variant = 'default',
  size = 'md',
  icon,
  block = false,
  href,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
  href: string;
  children?: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'>) {
  return (
    <Link
      {...rest}
      href={href}
      className="btn"
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
    >
      {icon}
      {children}
    </Link>
  );
}
