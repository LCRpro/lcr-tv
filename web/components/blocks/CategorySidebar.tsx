'use client';

import { useState, type ReactNode } from 'react';
import {
  categoryIcon,
  languageRank,
  languageTag,
  splitLanguage,
  type Category,
  type GenreCount,
} from '@iptv/shared';
import { useSession } from '../../lib/session';
import { useT } from '../../lib/i18n';
import { CategoryMark, IconClock, IconLibrary, IconStar } from '../marks';
import { SearchField } from '../ui';

/**
 * Ce que la colonne peut avoir de sélectionné.
 *
 * Une catégorie du fournisseur, ou l'une des deux entrées qui n'en sont pas :
 * ce qu'on a mis de côté, ce qu'on a déjà regardé. Toutes trois filtrent la
 * même grille, ce qui est la raison de les mettre au même endroit.
 */
export type CategorySelection = number | 'favorites' | 'watched' | null;

/**
 * Une coupure de la liste : son titre, puis ses catégories.
 *
 * Chaque groupe a son propre bloc, et c'est ce qui fait tenir le titre collant.
 * Les groupes étaient auparavant des frères à plat : « Épinglées » restait alors
 * accroché en haut pendant qu'on parcourait le français, deux titres se
 * superposant au même endroit. Enfermé dans son bloc, un titre ne colle que
 * tant que sa propre section est à l'écran, puis le suivant prend sa place.
 */
function Section({
  label,
  items,
  render,
}: {
  label: string;
  items: Category[];
  render: (category: Category) => ReactNode;
}) {
  return (
    <div className="sidebar-sect">
      <div className="sidebar-group">
        <span>{label}</span>
      </div>
      {items.map(render)}
    </div>
  );
}

/**
 * Logo de catégorie, avec repli sur l'icône.
 *
 * Ces images viennent du fournisseur et meurent souvent : sans repli, la ligne
 * perdrait son repère et se désalignerait au milieu d'une liste à drapeaux.
 */
function CategoryLogo({ url, fallback, label }: { url: string; fallback: ReactNode; label: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  return (
    // Hôtes d'images inconnus à l'avance et souvent en http : <img> brut.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="sidebar-logo" src={url} alt="" title={label} onError={() => setBroken(true)} />
  );
}

/**
 * La colonne des filtres.
 *
 * Elle avait été remplacée par des puces ; elle revient, parce qu'elle est le
 * repère principal d'une page de parcours : trois cent quatre-vingt-huit
 * entrées se lisent de haut en bas, groupées par langue, avec un champ pour
 * les filtrer et une étoile pour épingler celles qu'on ouvre tous les soirs.
 *
 * Les genres l'ont rejointe. Ils formaient une rangée de puces au-dessus de la
 * grille, qui prenait la place du seul bloc que la page des films méritait —
 * ce qu'on a commencé, ce qu'on a mis de côté. Ils sont de même nature qu'une
 * catégorie : ils vivent maintenant au même endroit, en deux sections.
 *
 * Une seule entrée est retenue à la fois, quelle que soit la section. La
 * colonne se lit comme une liste de destinations, pas comme un formulaire à
 * cocher : c'est `onSelect` et `onGenre` qui s'en chargent, chacun effaçant le
 * choix de l'autre.
 */
export function CategorySidebar({
  categories,
  selected,
  onSelect,
  onTogglePin,
  favoriteLabel,
  favoriteCount,
  watchedLabel,
  watchedCount,
  genres,
  genre,
  onGenre,
}: {
  categories: Category[];
  selected: CategorySelection;
  onSelect: (id: CategorySelection) => void;
  onTogglePin: (category: Category) => void;
  /** « Mes chaînes », « Mes films »… selon ce que la page liste. */
  favoriteLabel: string;
  /** Absent tant que le compte n'est pas connu : mieux vide qu'un zéro faux. */
  favoriteCount?: number | null;
  /** « Chaînes vues récemment », « Films vus récemment »… */
  watchedLabel: string;
  /** Absent tant que le compte n'est pas connu : mieux vide qu'un zéro faux. */
  watchedCount?: number | null;
  /** Les genres TMDB, sur les films et les séries. Le direct n'en a pas. */
  genres?: GenreCount[];
  genre?: string | null;
  onGenre?: (genre: string | null) => void;
}) {
  /*
   * Filtre local. La colonne porte 388 entrées : sans champ, trouver « Ligue 1 »
   * demande de parcourir la liste à l'œil. Le filtre porte sur le libellé
   * affiché, celui qu'on lit, et non sur le nom brut préfixé du fournisseur.
   */
  const [term, setTerm] = useState('');
  const needle = term.trim().toLowerCase();
  const { profile } = useSession();
  const t = useT();
  const shown = needle
    ? categories.filter((c) => splitLanguage(c.name).title.toLowerCase().includes(needle))
    : categories;
  // Le champ filtre la colonne entière, genres compris : deux listes dans un
  // même panneau, un seul champ au-dessus — il serait étrange qu'il n'en voie
  // qu'une.
  const shownGenres = needle
    ? (genres ?? []).filter((g) => g.genre.toLowerCase().includes(needle))
    : (genres ?? []);

  /*
   * Le serveur trie déjà : épinglées, puis les langues du profil dans son
   * ordre, puis le reste. Ici on ne fait qu'en rendre les coupures visibles —
   * sans les titres, une liste qui enchaîne trois entrées épinglées puis repart
   * à « 24/7 Français » ressemble à un tri cassé.
   */
  const languages = profile?.languages?.length ? profile.languages : ['FR'];
  const pinned = shown.filter((c) => c.isFavorite);
  const rest = shown.filter((c) => !c.isFavorite);
  const groups = languages.map((code, i) => ({
    key: code,
    label: t(languageTag(code)?.label ?? code),
    items: rest.filter((c) => languageRank(c.name, c.languageCode, languages) === i),
  }));
  const others = rest.filter(
    (c) => languageRank(c.name, c.languageCode, languages) >= languages.length,
  );

  const item = (c: Category) => {
    const mark = categoryIcon(c.name, c.languageCode);
    const title = splitLanguage(c.name).title;
    return (
      // Deux boutons côte à côte plutôt qu'un bouton dans un bouton : imbriquer
      // les commandes est invalide, et le clavier n'y atteindrait jamais l'étoile.
      <div className="sidebar-row" key={c.id} data-active={selected === c.id}>
        <button className="sidebar-pick" onClick={() => onSelect(c.id)} title={title}>
          {c.logoUrl ? (
            <CategoryLogo url={c.logoUrl} label={mark.label} fallback={<CategoryMark icon={mark} />} />
          ) : (
            <CategoryMark icon={mark} />
          )}
          <span>{title}</span>
          <span className="sidebar-count">{c.count}</span>
        </button>
        <button
          className="sidebar-star"
          data-on={c.isFavorite || undefined}
          onClick={() => onTogglePin(c)}
          aria-pressed={Boolean(c.isFavorite)}
          title={c.isFavorite ? t('Désépingler {title}', { title }) : t('Épingler {title}', { title })}
        >
          <IconStar filled={Boolean(c.isFavorite)} />
        </button>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <SearchField value={term} onChange={setTerm} placeholder={t('Filtrer les catégories…')} />
        {/* Les favoris ne sont pas une catégorie du fournisseur mais se
            choisissent au même endroit : c'est là qu'on filtre la grille. */}
        <button
          className="sidebar-pick sidebar-fav"
          data-active={selected === 'favorites'}
          onClick={() => onSelect('favorites')}
        >
          <span className="mark">
            <IconStar filled />
          </span>
          <span>{favoriteLabel}</span>
          {favoriteCount != null && <span className="sidebar-count">{favoriteCount}</span>}
        </button>
        {/*
          Ce qu'on a déjà ouvert, du plus récent au plus ancien.

          L'historique existait, mais comme une page à part : on y allait pour
          effacer, pas pour reprendre. Ici c'est un filtre du catalogue comme
          un autre, et il se combine avec un genre ou une recherche.
        */}
        <button
          className="sidebar-pick"
          data-active={selected === 'watched'}
          onClick={() => onSelect('watched')}
        >
          <span className="mark">
            <IconClock />
          </span>
          <span>{watchedLabel}</span>
          {watchedCount != null && <span className="sidebar-count">{watchedCount}</span>}
        </button>
        <button className="sidebar-pick" data-active={selected === null} onClick={() => onSelect(null)}>
          <span className="mark">
            <IconLibrary />
          </span>
          <span>{t('Toutes les catégories')}</span>
        </button>
      </div>

      <div className="sidebar-list">
        {/*
          Les genres d'abord : ils disent de quoi parle un film, quand la
          catégorie du fournisseur ne dit que d'où il vient — « LATEST MOVIES »,
          « NETFLIX ». C'est par eux qu'on cherche.
        */}
        {shownGenres.length > 0 && onGenre && (
          <div className="sidebar-sect">
            <div className="sidebar-group">
              <span>{t('Genres')}</span>
            </div>
            <div className="sidebar-row" data-active={!genre}>
              <button className="sidebar-pick" onClick={() => onGenre(null)}>
                <span>{t('Tous les genres')}</span>
              </button>
            </div>
            {shownGenres.map((g) => (
              <div className="sidebar-row" key={g.genre} data-active={genre === g.genre}>
                <button className="sidebar-pick" onClick={() => onGenre(g.genre)} title={g.genre}>
                  <span>{g.genre}</span>
                  <span className="sidebar-count">{g.count}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {shown.length === 0 && shownGenres.length === 0 ? (
          <div className="sidebar-empty">{t('Aucune catégorie pour « {term} ».', { term })}</div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section label={t('Épinglées')} items={pinned} render={item} />
            )}
            {groups.map((g) =>
              g.items.length === 0 ? null : (
                <Section key={g.key} label={g.label} items={g.items} render={item} />
              ),
            )}
            {others.length > 0 && (
              <Section
                label={rest.length === others.length ? t('Catégories') : t('Autres langues')}
                items={others}
                render={item}
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
