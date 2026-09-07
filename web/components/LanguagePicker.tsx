'use client';

import { useMemo, useState } from 'react';
import type { CatalogLanguage } from '@iptv/shared';
import { MAX_PROFILE_LANGUAGES, languageTag } from '@iptv/shared';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useIntlLocale, useT } from '../lib/i18n';
import { SearchField } from './ui';

/** Ce qu'on affiche d'un code dont le catalogue ne dit rien — un profil peut en
 *  porter un que le fournisseur a cessé de publier. */
function describe(
  t: (text: string) => string,
  code: string,
): { label: string; flag: string | null } {
  const tag = languageTag(code);
  // Les libellés de `CODES` sont écrits en français : traduits ici, ils suivent
  // la langue de l'interface comme le reste du formulaire.
  return { label: t(tag?.label ?? code), flag: tag?.flag ?? null };
}

/**
 * Le choix des langues d'un profil.
 *
 * Tout ce qui classe le catalogue disait « français d'abord » en dur — le bon
 * défaut pour ce foyer, mais un défaut écrit dans le code plutôt qu'un choix.
 *
 * La liste proposée est celle que le catalogue **contient**, avec son volume :
 * offrir « Coréen » à un abonnement qui n'en a pas une ligne serait une
 * promesse vide. L'ordre compte — la première langue passe devant la deuxième —
 * et se lit dans la numérotation des pastilles retenues.
 */
export function LanguagePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data, error, loading } = useAsync<{ items: CatalogLanguage[] }>(
    () => api.get('/api/languages'),
    [],
  );
  const [term, setTerm] = useState('');
  const t = useT();
  const intl = useIntlLocale();

  const available = useMemo(() => {
    const all = data?.items ?? [];
    const needle = term.trim().toLowerCase();
    return all
      .filter((l) => !value.includes(l.code))
      .filter(
        (l) =>
          !needle ||
          l.label.toLowerCase().includes(needle) ||
          l.code.toLowerCase().includes(needle),
      );
  }, [data, term, value]);

  const full = value.length >= MAX_PROFILE_LANGUAGES;

  return (
    <div className="langs">
      {/* Les langues retenues, dans l'ordre. La dernière ne peut pas être
          retirée : un profil sans langue n'aurait plus rien pour classer. */}
      <div className="langs-chosen">
        {value.map((code, i) => {
          const { label, flag } = describe(t, code);
          return (
            <span className="lang-chip" key={code}>
              <b>{i + 1}</b>
              <span className="flag">{flag ?? '·'}</span>
              {label}
              {value.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((c) => c !== code))}
                  aria-label={t('Retirer {label}', { label })}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>

      {full ? (
        <p className="field-note">
          {t('Trois langues au plus. Retirez-en une pour en choisir une autre.')}
        </p>
      ) : (
        <>
          <SearchField value={term} onChange={setTerm} placeholder={t('Chercher une langue…')} />
          <div className="langs-list">
            {/*
              Trois vides différents, trois phrases différentes.

              « Aucune langue pour «  » » s'affichait aussi bien pendant le
              chargement que sur un compte sans abonnement — et ne disait ni
              qu'il fallait attendre, ni qu'il n'y avait rien à attendre.
            */}
            {loading ? (
              <div className="sidebar-empty">{t('Lecture du catalogue…')}</div>
            ) : error || !data ? (
              <div className="sidebar-empty">{t('Langues indisponibles pour le moment.')}</div>
            ) : available.length === 0 ? (
              <div className="sidebar-empty">
                {term.trim()
                  ? t('Aucune langue ne correspond à « {term} ».', { term: term.trim() })
                  : t('Votre catalogue ne propose pas d’autre langue.')}
              </div>
            ) : (
              available.slice(0, 40).map((l) => (
                <button
                  type="button"
                  key={l.code}
                  className="lang-option"
                  onClick={() => onChange([...value, l.code])}
                >
                  <span className="flag">{l.flag ?? '·'}</span>
                  <span className="clamp-1">{t(l.label)}</span>
                  <em>{l.count.toLocaleString(intl)}</em>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
