'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useIntlLocale, useT } from '../../lib/i18n';

/**
 * Une puce : ce qu'on filtre, et combien il y a derrière.
 *
 * `text` est le libellé en clair, pour le filtre et l'infobulle — `label` peut
 * porter une icône, et on ne cherche pas dans une icône.
 */
export interface ChipItem {
  key: string;
  label: ReactNode;
  text: string;
  count?: number | null;
}

/**
 * Les puces, à la place de la colonne.
 *
 * La colonne de catégories prenait un quart de la largeur sur chaque page de
 * parcours, pour une liste de trois cent quatre-vingt-huit entrées qu'on
 * lisait de haut en bas sans jamais voir la grille à côté. En puces, les
 * filtres tiennent sur une ou deux lignes au-dessus des résultats, et le
 * compte dit avant de cliquer s'il y a quelque chose à voir.
 *
 * Ce qui ne tient pas dans la première ligne passe derrière « + N autres » :
 * un panneau qui se déplie, avec un champ pour y chercher. La puce choisie
 * dans ce panneau remonte en première ligne quand il se referme — sinon on ne
 * saurait plus ce qui filtre la grille.
 */
export function Chips({
  items,
  more = [],
  value,
  onChange,
  label,
  filterPlaceholder,
}: {
  items: ChipItem[];
  /** Les puces repliées derrière « + N autres ». */
  more?: ChipItem[];
  value: string;
  onChange: (key: string) => void;
  /** Le nom du groupe, pour les lecteurs d'écran : « Genres », « Catégories ». */
  label: string;
  filterPlaceholder?: string;
}) {
  const t = useT();
  const intl = useIntlLocale();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');

  const chosenFromMore = useMemo(() => more.find((c) => c.key === value), [more, value]);
  const shown = chosenFromMore && !open ? [...items, chosenFromMore] : items;

  const needle = term.trim().toLowerCase();
  const folded = useMemo(
    () => (needle ? more.filter((c) => c.text.toLowerCase().includes(needle)) : more),
    [more, needle],
  );

  const chip = (c: ChipItem) => (
    <button
      key={c.key}
      type="button"
      className="chip"
      role="radio"
      aria-checked={c.key === value}
      data-active={c.key === value ? 'true' : undefined}
      onClick={() => {
        onChange(c.key);
        setOpen(false);
      }}
      title={c.text}
    >
      {c.label}
      {c.count != null && <span className="chip-count">{c.count.toLocaleString(intl)}</span>}
    </button>
  );

  return (
    <div className="chips-wrap">
      <div className="chips" role="radiogroup" aria-label={label}>
        {shown.map(chip)}
        {more.length > 0 && (
          <button
            type="button"
            className="chip chip-more"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? t('Réduire') : t('+ {n} autres', { n: more.length })}
          </button>
        )}
      </div>

      {open && (
        <div className="chips-more">
          {more.length > 12 && (
            <input
              className="chips-filter"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={filterPlaceholder ?? t('Filtrer…')}
              aria-label={filterPlaceholder ?? t('Filtrer…')}
            />
          )}
          {folded.length === 0 ? (
            <p className="chips-empty">{t('Rien pour « {term} ».', { term: term.trim() })}</p>
          ) : (
            <div className="chips" data-wrap role="radiogroup" aria-label={label}>
              {folded.map(chip)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
