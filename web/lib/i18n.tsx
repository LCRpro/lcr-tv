'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { canonicalLanguage, UI_LOCALES, type UiLocale } from '@iptv/shared';
import { useSession } from './session';
import { EN } from './locales/en';
import { DE } from './locales/de';
import { ES } from './locales/es';

/**
 * La langue de l'interface.
 *
 * Deux réglages et non un seul. Le profil choisit d'un côté les langues de son
 * **catalogue** — celles qui ordonnent des dizaines de milliers d'entrées parmi
 * les 127 que publie le fournisseur — et de l'autre celle de l'**interface**,
 * qui n'existe qu'en quatre. Classer son catalogue en italien ne veut pas dire
 * vouloir des boutons en italien ; c'est même impossible, faute de traduction.
 *
 * Sans choix explicite, l'interface suit la première langue du catalogue qui
 * est traduite, et le français sinon : le défaut évident reste le défaut.
 *
 * Le français n'a pas de dictionnaire : c'est la langue source, celle qui est
 * écrite dans le code. Un texte sans traduction ressort donc en français —
 * visible, mais jamais cassé.
 */

/** Étiquette de langue HTML, pour la césure et les correcteurs du navigateur. */
export { UI_LOCALES };
export type { UiLocale };

const HTML_LANG: Record<UiLocale, string> = { FR: 'fr', EN: 'en', DE: 'de', ES: 'es' };

const DICTS: Partial<Record<UiLocale, Record<string, string>>> = { EN, DE, ES };

const LocaleContext = createContext<UiLocale>('FR');

/**
 * La langue d'interface d'un profil.
 *
 * Le choix explicite d'abord ; à défaut, la première langue de catalogue qui
 * soit traduite ; le français en dernier recours.
 */
export function localeFor(
  languages: readonly string[] | undefined,
  uiLanguage?: string | null,
): UiLocale {
  if (uiLanguage && (UI_LOCALES as readonly string[]).includes(uiLanguage)) {
    return uiLanguage as UiLocale;
  }
  for (const code of languages ?? []) {
    const canon = canonicalLanguage(code) as UiLocale;
    if ((UI_LOCALES as readonly string[]).includes(canon)) return canon;
  }
  return 'FR';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const locale = localeFor(profile?.languages, profile?.uiLanguage);

  // L'attribut `lang` du document suit : il commande la césure, la sélection de
  // police et les correcteurs du navigateur.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * Traduit un texte français.
 *
 * La clé **est** le texte source, comme dans gettext : le code reste lisible,
 * un texte sans traduction s'affiche tel quel, et il n'y a pas deux cents
 * identifiants à inventer puis à retrouver. Le prix est qu'une même phrase ne
 * peut pas se traduire de deux façons — pour deux cents libellés d'interface,
 * ce n'est jamais arrivé.
 *
 * Les valeurs s'insèrent par nom : `t('{n} résultats', { n: 12 })`. Le pluriel
 * se choisit chez l'appelant, avec deux textes source distincts — les règles de
 * pluriel varient trop d'une langue à l'autre pour tenir dans une convention.
 */
export function translate(
  locale: UiLocale,
  text: string,
  vars?: Record<string, string | number>,
): string {
  const out = DICTS[locale]?.[text] ?? text;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

export function useT(): (text: string, vars?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return useMemo(() => (text, vars) => translate(locale, text, vars), [locale]);
}

/** La locale courante, pour ce qui se formate plutôt que se traduit : dates, nombres. */
export function useLocale(): UiLocale {
  return useContext(LocaleContext);
}

/** Étiquette BCP-47, pour `toLocaleDateString` et consorts. */
export function useIntlLocale(): string {
  return HTML_LANG[useContext(LocaleContext)];
}

/** La fonction de traduction, pour les aides qui la reçoivent en argument. */
export type Translate = (text: string, vars?: Record<string, string | number>) => string;
