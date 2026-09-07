'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

/**
 * Un champ de saisie, avec son libellé.
 *
 * Vingt-deux `<input>` de l'application n'avaient **aucune classe** : ils
 * n'étaient stylés que par héritage, `.form-field input`. Un champ posé hors de
 * ce conteneur perdait tout, en silence — et l'appariement du `<label>` avec
 * son champ reposait sur des `id` écrits à la main, `p-name`, `c-conf`, `u-role`,
 * dont rien ne garantissait l'unicité.
 *
 * Ici l'identifiant est engendré, le libellé lui est lié, et la note ou
 * l'erreur sont rattachées par `aria-describedby` : un lecteur d'écran les lit
 * avec le champ au lieu de les découvrir plus loin.
 */
interface FieldShell {
  label: string;
  /** Explication sous le champ. Disparaît si une erreur la remplace. */
  note?: ReactNode;
  /** Le message qui prend la place de la note, et marque le champ en faute. */
  error?: string | undefined;
  children?: ReactNode;
}

function Shell({
  label,
  note,
  error,
  id,
  describedBy,
  children,
}: FieldShell & { id: string; describedBy: string | undefined }) {
  return (
    <div className="form-field" data-invalid={error ? true : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="field-note" id={describedBy} data-bad role="alert">
          {error}
        </span>
      ) : note ? (
        <span className="field-note" id={describedBy}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

type InputProps = FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export function Field({ label, note, error, ...input }: InputProps) {
  const id = useId();
  const describedBy = note || error ? `${id}-note` : undefined;
  return (
    <Shell label={label} note={note} error={error} id={id} describedBy={describedBy}>
      <input
        {...input}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
    </Shell>
  );
}

type SelectProps = FieldShell & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'>;

export function SelectField({ label, note, error, children, ...select }: SelectProps) {
  const id = useId();
  const describedBy = note || error ? `${id}-note` : undefined;
  return (
    <Shell label={label} note={note} error={error} id={id} describedBy={describedBy}>
      <select {...select} id={id} aria-describedby={describedBy}>
        {children}
      </select>
    </Shell>
  );
}

/**
 * Le mot de passe, avec son œil.
 *
 * Le montrer d'emblée l'expose à qui passe derrière l'écran ; le cacher sans
 * recours oblige à le retaper de mémoire pour vérifier une faute de frappe.
 * Le motif était recopié à l'identique dans deux formulaires — d'où ce champ.
 */
export function PasswordField(props: InputProps & { reveal: boolean; onReveal: () => void; revealLabels: [string, string] }) {
  const { reveal, onReveal, revealLabels, label, note, error, ...input } = props;
  const id = useId();
  const describedBy = note || error ? `${id}-note` : undefined;
  return (
    <Shell label={label} note={note} error={error} id={id} describedBy={describedBy}>
      <div className="input-reveal">
        <input
          {...input}
          id={id}
          type={reveal ? 'text' : 'password'}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
        <button type="button" onClick={onReveal} aria-label={revealLabels[reveal ? 0 : 1]}>
          <EyeIcon off={reveal} />
        </button>
      </div>
    </Shell>
  );
}

/** Barré quand le texte est visible : l'icône annonce ce que le clic va faire. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12z" />
      <circle cx="12" cy="12" r="3.2" />
      {off && <path d="M4 20L20 4" />}
    </svg>
  );
}
