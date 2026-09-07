'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Category,
  FavoriteEntry,
  HomePayload,
  LiveChannel,
  Movie,
  SeriesSummary,
} from '@iptv/shared';
import { categoryIcon, languageRank, languageTag, splitLanguage, workTitle } from '@iptv/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { usePlayer } from '../../lib/player';
import { useSession } from '../../lib/session';
import { useIntlLocale, useT, type Translate } from '../../lib/i18n';
import { Keypad } from '../../components/Keypad';
import { EmptyState, Rail, TonightBlock } from '../../components/blocks';
import { Button } from '../../components/kit';
import { CategoryMark } from '../../components/marks';
import { Card, FavoriteStar, PageHead, SkeletonDashboard, WorkCard } from '../../components/ui';
import { SyncWaiting } from '../../components/SyncWaiting';
import { NoProvider } from '../../components/NoProvider';

type Work = Movie | SeriesSummary;

/**
 * L'heure de la journée, dite comme on la dirait.
 *
 * « Accueil » tout seul ne s'adresse à personne. Sur un écran partagé par
 * plusieurs profils, savoir d'un coup d'œil pour qui l'application affiche ses
 * suggestions vaut mieux qu'un titre générique.
 */
function greeting(t: Translate, name: string): string {
  const h = new Date().getHours();
  if (h < 6) return t('Bonne nuit, {name}', { name });
  if (h < 12) return t('Bonjour, {name}', { name });
  if (h < 18) return t('Bon après-midi, {name}', { name });
  return t('Bonsoir, {name}', { name });
}

/** Combien de catégories de la première langue sur l'accueil, épinglées comprises. */
const HOME_CATEGORIES = 12;
/** Et combien pour chacune des autres langues du profil. */
const PER_OTHER_LANGUAGE = 4;

/**
 * Les catégories du direct qui méritent l'accueil.
 *
 * Les épinglées d'abord — c'est ce qu'on ouvre tous les soirs — puis celles
 * de la première langue du profil, dans l'ordre où le serveur les range :
 * généralistes, sport, cinéma, enfants. Les autres langues du profil en ont
 * quelques-unes chacune, marquées de leur langue, pour que l'anglais d'un
 * profil « français, anglais » ne soit pas à trois clics.
 */
function pickCategories(
  all: Category[],
  languages: string[],
): Array<{ category: Category; language: string | null }> {
  const rank = (c: Category) => languageRank(c.name, c.languageCode, languages);
  const pinned = all.filter((c) => c.isFavorite);
  const rest = all.filter((c) => !c.isFavorite);
  const first = rest.filter((c) => rank(c) === 0).slice(0, Math.max(4, HOME_CATEGORIES - pinned.length));
  const others = languages.slice(1).flatMap((code, i) =>
    rest
      .filter((c) => rank(c) === i + 1)
      .slice(0, PER_OTHER_LANGUAGE)
      .map((category) => ({ category, language: code })),
  );
  const own = [...pinned, ...first].map((category) => ({ category, language: null as string | null }));
  return own.concat(others);
}

/**
 * L'accueil : un tableau de bord, pas une vitrine.
 *
 * Une application de télévision se rouvre dix fois par semaine par les mêmes
 * personnes. Elles savent ce qu'elles possèdent ; ce qu'elles ne savent pas,
 * c'est ce qu'on leur propose ce soir, où elles en étaient, et ce qui est
 * arrivé depuis. La page répond dans cet ordre : la sélection du jour et les
 * reprises, le direct par catégorie, les nouveautés qui défilent, la liste.
 *
 * Le catalogue entier reste à un clic dans la barre. Il n'a pas besoin de la
 * première page, et les six rangées de catégories du fournisseur qui
 * l'annonçaient — « LATEST MOVIES », « NETFLIX » — ne disaient rien à
 * personne.
 */
export default function HomePage() {
  const { profile } = useSession();
  const t = useT();
  const intl = useIntlLocale();
  const { play } = usePlayer();
  const { data, error, loading, reload } = useAsync<HomePayload>(
    () => api.get<HomePayload>('/api/home'),
    [],
  );
  const cats = useAsync<{ items: Category[] }>(() => api.get('/api/categories/live'), []);

  /*
   * L'étoile répond au clic, sans recharger la page.
   *
   * Les vignettes viennent du serveur et n'en bougent plus ; attendre un
   * aller-retour laissait l'étoile inerte une demi-seconde, assez pour qu'on
   * reclique en croyant avoir manqué la cible. Cette table couvre l'état reçu,
   * et un échec la rend à ce que dit la base.
   */
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const keyOf = (kind: 'stream' | 'series', id: number) => `${kind}-${id}`;
  const toggle = useCallback((kind: 'stream' | 'series', id: number, on: boolean) => {
    const key = keyOf(kind, id);
    setStarred((prev) => ({ ...prev, [key]: !on }));
    const call = on
      ? api.del(`/api/me/favorites/${kind}/${id}`)
      : api.post('/api/me/favorites', { itemType: kind, itemId: id });
    void call.catch(() => setStarred((prev) => ({ ...prev, [key]: on })));
  }, []);
  const isStarred = (item: Work) => {
    const kind = item.type === 'series' ? 'series' : 'stream';
    return starred[keyOf(kind, item.id)] ?? Boolean(item.isFavorite);
  };
  const toggleWork = useCallback(
    (item: Work) => {
      const kind = item.type === 'series' ? 'series' : 'stream';
      toggle(kind, item.id, starred[keyOf(kind, item.id)] ?? Boolean(item.isFavorite));
    },
    [starred, toggle],
  );

  // Un sync en cours fait apparaître du contenu au fil de l'eau : on rafraîchit.
  useEffect(() => {
    if (!data?.sync?.running && !data?.catalogEmpty) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [data?.sync?.running, data?.catalogEmpty, reload]);

  /*
   * Le pavé numérique de l'accueil : les épinglées et le début du direct.
   *
   * Rien ne les affiche ici — le direct se présente par catégorie — mais il
   * faut la liste pour que la touche 6 trouve M6 depuis la première page.
   */
  const strip = useMemo(() => {
    const seen = new Set<number>();
    const out: LiveChannel[] = [];
    for (const c of [...(data?.livePinned ?? []), ...(data?.liveBrowse ?? [])]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [data]);
  const zap = (c: LiveChannel) => play({ itemType: 'stream', itemId: c.id, label: c.name });

  const languages = profile?.languages?.length ? profile.languages : ['FR'];
  const categories = pickCategories(cats.data?.items ?? [], languages);

  if (loading && !data) return <SkeletonDashboard />;
  if (error) {
    return (
      <EmptyState
        title={t('L’accueil n’a pas pu se charger')}
        hint={error.message}
        action={<Button variant="primary" onClick={reload}>{t('Réessayer')}</Button>}
      />
    );
  }
  if (!data) return null;

  // Deux vides distincts : sans abonnement il n'y a rien à attendre, avec un
  // abonnement mais sans catalogue la synchronisation est en route.
  if (data.noProvider) return <NoProvider />;
  if (data.catalogEmpty) return <SyncWaiting status={data.sync} onRefresh={reload} />;

  /*
   * Les chaînes sortent de « Ma liste » sur l'accueil : le direct a son bloc
   * juste au-dessus, et une œuvre se présente en 2/3 quand un logo se
   * présente en 16/9.
   */
  const listed = data.favorites
    .filter((f) => f.target.kind !== 'live')
    .filter((f) => starred[keyOf(f.itemType, f.itemId)] !== false)
    .slice(0, 8);

  const arrivals = data.arrivals.movies + data.arrivals.series;
  const nothingPersonal = data.resume.length === 0 && listed.length === 0;

  const today = new Date().toLocaleDateString(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      {/* Le pavé numérique écoute l'accueil aussi : « fais 6 » depuis la
          première page, sans passer par le direct. */}
      <Keypad channels={strip} onPlay={zap} />

      {/*
        Le salut fait le titre.

        La barre annonçait « Accueil » — le seul mot que celui qui vient
        d'arriver sur l'accueil n'a pas besoin de lire. Le titre dit maintenant
        à qui on parle et quand, ce qu'aucun autre écran ne dit.
      */}
      <PageHead
        title={profile ? greeting(t, profile.name) : t('Accueil')}
        meta={
          <span className="page-hello">
            {today}
            {profile && profile.languages.length > 0 && (
              /* Les langues mises en avant, dites une fois : tout l'écran en
                 dépend, et rien ne disait d'où ça venait ni où le changer. */
              <Link
                className="page-langs"
                href={`/profils?edit=${profile.id}`}
                title={t('Changer les langues mises en avant')}
              >
                {profile.languages.map((code) => {
                  const tag = languageTag(code);
                  return (
                    <span key={code} title={tag?.label ?? code}>
                      {tag?.flag ?? code}
                    </span>
                  );
                })}
              </Link>
            )}
          </span>
        }
      />

      {data.sync?.running && (
        <div className="notice notice-warn">
          {t('Synchronisation en cours ({phase}) — le catalogue se complète.', {
            phase: data.sync.phase,
          })}
        </div>
      )}

      {/*
        1. Ce soir : la sélection du jour en grand, les reprises à côté.

        Deux blocs séparés laissaient une colonne aux deux tiers vide dès qu'on
        n'avait qu'une ou deux lectures en cours, et rien du tout quand on n'en
        avait aucune. Réunis, le bloc est toujours plein.
      */}
      <TonightBlock
        resume={data.resume}
        picks={data.spotlight}
        onPlay={(entry) =>
          play({
            itemType: entry.itemType === 'episode' ? 'episode' : 'stream',
            itemId: entry.itemId,
            label: entry.label,
          })
        }
        hrefOf={(entry) =>
          entry.target.kind === 'series'
            ? `/series/${entry.target.id}`
            : entry.target.kind === 'movie'
              ? `/films/${entry.target.id}`
              : undefined
        }
      />

      {/*
        2. Mets la télé — par catégorie.

        Une rangée de touches numérotées montrait vingt-trois logos en petit ;
        les entrées qu'on cherche vraiment sont « les généralistes », « le
        sport », « Ligue 1+ ». Chaque carte ouvre le direct sur sa catégorie ;
        le clavier zappe toujours par numéro.
      */}
      {categories.length > 0 && (
        <section className="blk">
          <div className="blk-head">
            <h2>{t('Le direct')}</h2>
            <span className="blk-note">{t('par catégorie · tapez un numéro pour zapper')}</span>
            <Link className="blk-more" href="/live">
              {t('Toutes les chaînes')} <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="cats">
            {categories.map(({ category, language }) => (
              <CategoryCard key={category.id} category={category} language={language} />
            ))}
          </div>
        </section>
      )}

      {/*
        3. Ce qui est arrivé depuis la dernière visite.

        Le catalogue grossit sans arrêt — quatre-vingt-quatre films et
        cinquante-huit séries sur une semaine, mesuré. Le vrai compte le dit,
        et les rangées défilent : les plus récents d'abord, la suite en
        glissant, sans que la page s'allonge.
      */}
      {(data.recentMovies.length > 0 || data.recentSeries.length > 0) && (
        <section className="blk">
          {data.arrivals.since && arrivals > 0 ? (
            /*
              Le compte est l'information, et il se perdait sur la ligne des
              autres titres. Il devient une plaque à part, encre et papier
              inversés : c'est ainsi que tout le reste de l'interface dit
              « regardez ceci », sans ajouter une couleur.
            */
            <div className="news">
              <span className="news-n">
                <b>{arrivals.toLocaleString(intl)}</b>
                <span>{t(arrivals > 1 ? 'nouveautés' : 'nouveauté')}</span>
              </span>
              <div className="news-t">
                <h2>{t('Nouveau depuis votre dernière visite')}</h2>
                <p>
                  {t('{movies} films et {series} séries depuis le {date}', {
                    movies: data.arrivals.movies.toLocaleString(intl),
                    series: data.arrivals.series.toLocaleString(intl),
                    date: new Date(data.arrivals.since).toLocaleDateString(intl, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="blk-head">
              <h2>{t('Récemment ajoutés')}</h2>
            </div>
          )}

          {data.recentMovies.length > 0 && (
            <NewRail
              title={t('Films')}
              href="/films?sort=added"
              items={data.recentMovies}
              isStarred={isStarred}
              onToggle={toggleWork}
            />
          )}
          {data.recentSeries.length > 0 && (
            <NewRail
              title={t('Séries')}
              href="/series?sort=added"
              items={data.recentSeries}
              isStarred={isStarred}
              onToggle={toggleWork}
            />
          )}
        </section>
      )}

      {/* 4. Ma liste, en aperçu. */}
      {listed.length > 0 && (
        <section className="blk">
          <div className="blk-head">
            <h2>{t('Ma liste')}</h2>
            <Link className="blk-more" href="/ma-liste">
              {t('Gérer ma liste')} <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="grid" data-kind="work">
            {listed.map((fav) => (
              <ListedCard key={`${fav.itemType}-${fav.itemId}`} fav={fav} onRemove={() => toggle(fav.itemType, fav.itemId, true)} />
            ))}
          </div>
        </section>
      )}

      {nothingPersonal && (
        <div className="notice">
          {t(
            'Rien encore dans votre liste. L’étoile posée sur une affiche ou une chaîne la range ici, et ce que vous laissez en cours revient tout seul en haut de cette page.',
          )}
        </div>
      )}
    </>
  );
}

/**
 * Une catégorie du direct, en carte.
 *
 * Le logo du fournisseur quand il en a un et qu'il se charge, sinon son
 * thème : sport, football, cinéma. Le drapeau ne vient qu'en dernier — sur
 * cette page toutes les catégories sont déjà dans les langues du profil, et
 * celles des autres langues le disent en toutes lettres à côté du compte.
 */
function CategoryCard({ category, language }: { category: Category; language: string | null }) {
  const t = useT();
  const intl = useIntlLocale();
  const [broken, setBroken] = useState(false);
  const title = splitLanguage(category.name).title || category.name;
  const n = category.count ?? 0;
  const count = t(n > 1 ? '{n} chaînes' : '{n} chaîne', { n: n.toLocaleString(intl) });
  const note = language ? `${count} · ${t(languageTag(language)?.label ?? language)}` : count;
  const logo = Boolean(category.logoUrl) && !broken;
  return (
    <Link className="cat" href={`/live?category=${category.id}`} title={title}>
      <span className="cat-mark" data-logo={logo || undefined} aria-hidden>
        {logo ? (
          // Hôtes d'images inconnus à l'avance et souvent en http : <img> brut.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={category.logoUrl!} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <CategoryMark icon={categoryIcon(category.name, category.languageCode, { topicFirst: true })} />
        )}
      </span>
      <span className="cat-text">
        <b>{title}</b>
        <span>{note}</span>
      </span>
    </Link>
  );
}

/** Une rangée de nouveautés qui défile, avec son sous-titre et sa sortie. */
function NewRail({
  title,
  href,
  items,
  isStarred,
  onToggle,
}: {
  title: string;
  href: string;
  items: Work[];
  isStarred: (item: Work) => boolean;
  onToggle: (item: Work) => void;
}) {
  const t = useT();
  return (
    <div className="blk-sub">
      <div className="blk-subhead">
        <h3>{title}</h3>
        <Link className="blk-more" href={href}>
          {t('Tout voir')} <span aria-hidden>→</span>
        </Link>
      </div>
      <Rail label={title}>
        {items.map((item) => (
          <WorkCard
            key={`${item.type}-${item.id}`}
            item={{ ...item, isFavorite: isStarred(item) } as Work}
            onToggleFavorite={onToggle}
          />
        ))}
      </Rail>
    </div>
  );
}

/**
 * Une entrée de « Ma liste » sur l'accueil.
 *
 * L'étoile retire, et la vignette part avec elle : une vignette qui reste
 * dans « Ma liste » avec une étoile éteinte dirait deux choses contraires.
 */
function ListedCard({ fav, onRemove }: { fav: FavoriteEntry; onRemove: () => void }) {
  const t = useT();
  const genre = fav.genre?.split(',')[0]?.trim() || null;
  const meta =
    fav.progress?.episode && !fav.progress.completed
      ? t('Continuer · {ep}', { ep: fav.progress.episode })
      : [fav.year, genre].filter(Boolean).join(' · ') || null;
  return (
    <div className="card-wrap">
      <Card
        title={fav.label}
        meta={meta}
        imageUrl={fav.imageUrl}
        href={fav.target.kind === 'series' ? `/series/${fav.target.id}` : `/films/${fav.target.id}`}
        seen={fav.progress?.completed}
        progressRatio={fav.progress && !fav.progress.completed ? fav.progress.ratio : null}
      />
      <FavoriteStar on label={workTitle(fav.label)} onToggle={onRemove} />
    </div>
  );
}
