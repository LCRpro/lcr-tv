'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  channelTitle,
  splitLanguage,
  workTitle,
  type LiveChannel,
  type Movie,
  type SearchResults,
  type SeriesSummary,
} from '@iptv/shared';
import { api, qs } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { usePlayer } from '../lib/player';
import { useT } from '../lib/i18n';
import { NoImage, SearchIcon } from './ui';
import { LanguageMark } from './marks';

/**
 * Nombre de suggestions. Au-delà, la liste devient une page, pas un raccourci.
 *
 * Le champ de l'accueil en montre le double, sur deux colonnes : il occupe
 * toute la largeur de la page, et cinq lignes y flottaient dans un panneau
 * trois fois trop large pour elles.
 */
const MAX = { nav: 5, page: 10 } as const;
/*
 * On en demande plus qu'on n'en montre.
 *
 * Le surplus ne sert pas à l'affichage mais à savoir s'il *reste* quelque chose
 * derrière : sans lui, « Voir tous les résultats » promet une page qui peut ne
 * rien contenir de plus que les suggestions déjà visibles. Compter pour de vrai
 * coûterait trois requêtes d'agrégat à chaque frappe, pour une information qui
 * se résume à « oui » ou « non ».
 */
const SPARE = 4;

type Hit =
  | { kind: 'live'; item: LiveChannel }
  | { kind: 'vod'; item: Movie }
  | { kind: 'series'; item: SeriesSummary };

/**
 * Recherche instantanée.
 *
 * Elle remplace la page dédiée : chercher un titre est un geste de passage, pas
 * une destination — changer de page pour taper trois lettres puis revenir
 * coûtait plus que la recherche elle-même. Les cinq meilleures réponses
 * s'affichent sous le champ ; la page complète reste accessible par Entrée,
 * pour les fois où cinq ne suffisent pas.
 *
 * Deux tailles, un seul comportement. Le champ de la barre de navigation est
 * étroit et toujours là ; celui de l'accueil est large et se voit de loin.
 * Deux composants auraient divergé au premier correctif — l'alternance entre
 * familles, le décompte du « voir tous les résultats », le panneau qui garde sa
 * hauteur pendant le chargement : tout cela ne se réécrit pas deux fois.
 */
export function QuickSearch({
  variant = 'nav',
  placeholder,
  autoFocus,
}: {
  variant?: 'nav' | 'page';
  placeholder?: string;
  autoFocus?: boolean;
} = {}) {
  const router = useRouter();
  const { play } = usePlayer();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(term, 250);
  const boxRef = useRef<HTMLDivElement>(null);
  const max = MAX[variant];
  const t = useT();

  const query = debounced.trim();

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<SearchResults>(`/api/search${qs({ q: query, limit: max + SPARE })}`)
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, max]);

  // Un clic ailleurs referme : le panneau recouvre la page, il ne doit pas y
  // rester une fois qu'on regarde autre chose.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  /*
   * On alterne entre les trois familles, mais **palier par palier**.
   *
   * Prendre les premières d'une seule liste laisserait les deux autres
   * invisibles : chercher « joker » ne montrerait que des chaînes, jamais le
   * film. Alterner aveuglément était pire — « toy story » sortait *Boat Story*
   * en deuxième position, devant *Toy Story 2*, simplement parce que c'était le
   * tour des séries.
   *
   * On ne descend donc d'un palier que lorsque plus aucune famille n'a mieux à
   * proposer : les correspondances fortes passent toutes devant, dans l'ordre
   * d'alternance, et les ressemblances vagues ferment la marche.
   */
  const hits = useMemo<Hit[]>(() => {
    if (!results) return [];
    const lanes: Hit[][] = [
      results.movies.map((item) => ({ kind: 'vod' as const, item })),
      results.series.map((item) => ({ kind: 'series' as const, item })),
      results.live.map((item) => ({ kind: 'live' as const, item })),
    ];
    // Sans palier — une réponse d'une version d'API plus ancienne — on suppose
    // le pire : la réponse garde sa place dans son propre ordre de famille.
    const tierOf = (hit: Hit) => hit.item.matchTier ?? 3;

    const out: Hit[] = [];
    const cursor = [0, 0, 0];
    while (out.length < max) {
      let best = Infinity;
      for (let i = 0; i < lanes.length; i += 1) {
        const hit = lanes[i]![cursor[i]!];
        if (hit) best = Math.min(best, tierOf(hit));
      }
      if (best === Infinity) break;
      for (let i = 0; i < lanes.length && out.length < max; i += 1) {
        const hit = lanes[i]![cursor[i]!];
        if (hit && tierOf(hit) === best) {
          out.push(hit);
          cursor[i] += 1;
        }
      }
    }
    return out;
  }, [results, max]);

  const submit = () => {
    if (query.length < 2) return;
    setOpen(false);
    router.push(`/search${qs({ q: query })}`);
  };

  const choose = (hit: Hit) => {
    setOpen(false);
    setTerm('');
    if (hit.kind === 'live') {
      play({ itemType: 'stream', itemId: hit.item.id, label: hit.item.name });
      return;
    }
    router.push(hit.kind === 'vod' ? `/films/${hit.item.id}` : `/series/${hit.item.id}`);
  };

  const showPanel = open && query.length >= 2;
  // Ce qui n'a pas tenu dans les cinq. Plafonné à la demande, donc annoncé
  // comme un minimum : « 12+ » et jamais un total inventé.
  const rest =
    (results?.live.length ?? 0) +
    (results?.movies.length ?? 0) +
    (results?.series.length ?? 0) -
    hits.length;

  return (
    <div className={variant === 'page' ? 'quick quick-page' : 'quick'} ref={boxRef}>
      <div className="field">
        <SearchIcon />
        <input
          type="search"
          placeholder={placeholder ?? t('Rechercher un film, une série, une chaîne…')}
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label={t('Rechercher')}
        />
      </div>

      {showPanel && (
        <div className="quick-panel" role="listbox">
          {loading && hits.length === 0 ? (
            // Cinq lignes grises à la bonne hauteur : le panneau garde sa
            // taille finale au lieu de surgir puis de s'étirer sous le curseur.
            <div aria-busy className="quick-hits">
              {Array.from({ length: max }, (_, i) => (
                <div className="quick-hit" key={i} aria-hidden>
                  <span className="quick-thumb skel" />
                  <span className="quick-body">
                    <span className="skel skel-line" style={{ width: `${72 - i * 9}%` }} />
                    <span className="skel skel-line skel-sm" />
                  </span>
                </div>
              ))}
            </div>
          ) : hits.length === 0 ? (
            <div className="quick-empty">
              <span>
                {t('Rien pour')} <b>« {query} »</b>.
              </span>
              <span className="quick-hint">
                {t('Vérifiez l’orthographe ou cherchez un autre titre.')}
              </span>
            </div>
          ) : (
            <>
              <div className="quick-hits">
                {hits.map((hit) => (
                  <Suggestion key={`${hit.kind}-${hit.item.id}`} hit={hit} onChoose={choose} />
                ))}
              </div>
              {/*
                Une action, pas une phrase.

                Le lien en petits caractères gris se lisait comme une légende du
                panneau. C'est pourtant la seule sortie vers le reste des
                résultats : il prend la largeur, la couleur d'accent, une flèche,
                et annonce ce qu'il reste à voir.
              */}
              <Link
                className="quick-all"
                href={`/search${qs({ q: query })}`}
                onClick={() => setOpen(false)}
              >
                <span>
                  {t('Voir tous les résultats')}
                  {rest > 0 && <b> · {t('{n}+ autres', { n: rest })}</b>}
                </span>
                <IconArrow />
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function IconArrow() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h13M12.5 6l6 6-6 6" />
    </svg>
  );
}

const KIND_LABEL: Record<Hit['kind'], string> = {
  live: 'Chaîne',
  vod: 'Film',
  series: 'Série',
};

function Suggestion({ hit, onChoose }: { hit: Hit; onChoose: (hit: Hit) => void }) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const image = hit.kind === 'series' ? hit.item.coverUrl : hit.item.iconUrl;
  const { tag } = splitLanguage(hit.item.name);
  const title =
    hit.kind === 'live' ? channelTitle(hit.item.name) : workTitle(hit.item.name);

  return (
    <button className="quick-hit" role="option" onClick={() => onChoose(hit)}>
      <span className="quick-thumb" data-wide={hit.kind === 'live' || undefined}>
        {image && !broken ? (
          // Hôtes d'images inconnus à l'avance et souvent en http : <img> brut.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <NoImage label={title} />
        )}
      </span>
      <span className="quick-body">
        <span className="quick-title">
          <LanguageMark tag={tag} />
          <span className="clamp-1">{title}</span>
        </span>
        <span className="quick-kind">{t(KIND_LABEL[hit.kind])}</span>
      </span>
    </button>
  );
}
