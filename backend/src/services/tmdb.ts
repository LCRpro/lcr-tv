import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import { splitLanguage } from '@iptv/shared';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { series, streams, tmdbTexts } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

/**
 * Enrichissement TMDB.
 *
 * Les metadonnees Xtream sont de tres mauvaise qualite : titres bruites,
 * synopsis absents, affiches manquantes. TMDB sert de source de reference, dans
 * un job separe du sync — un echec ici ne doit jamais empecher le catalogue de
 * se remplir.
 */

const API = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';
/** TMDB tolere ~50 requetes/seconde ; on reste tres en dessous. */
const CONCURRENCY = 4;
const DELAY_MS = 120;

const searchResultSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  name: z.string().optional(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  vote_average: z.number().nullish(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  genre_ids: z.array(z.number()).nullish(),
});

const searchSchema = z.object({
  results: z.array(searchResultSchema).default([]),
});

const detailSchema = z.object({
  id: z.number(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  vote_average: z.number().nullish(),
  runtime: z.number().nullish(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  genres: z.array(z.object({ name: z.string() })).default([]),
  credits: z
    .object({
      cast: z.array(z.object({ name: z.string() })).default([]),
      crew: z.array(z.object({ name: z.string(), job: z.string() })).default([]),
    })
    .optional(),
  /*
   * Les traductions, livrees dans le meme appel que la fiche.
   *
   * `append_to_response=translations` en ramene 55 pour un film courant, sans
   * requete supplementaire : le multilingue ne coute que du stockage. Le champ
   * du titre change de nom selon le type — `title` pour un film, `name` pour
   * une serie —, comme partout ailleurs dans cette API.
   */
  translations: z
    .object({
      translations: z
        .array(
          z.object({
            iso_639_1: z.string(),
            data: z.object({
              title: z.string().nullish(),
              name: z.string().nullish(),
              overview: z.string().nullish(),
            }),
          }),
        )
        .default([]),
    })
    .optional(),
});

/**
 * Les titres des panels sont truffes de marqueurs de qualite et de langue.
 * Les retirer double le taux de correspondance.
 */
export function cleanTitle(raw: string): { title: string; year: number | null } {
  const yearMatch = /\b(19\d{2}|20\d{2})\b/.exec(raw);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  /*
   * Le prefixe de langue est retire par le paquet partage, pas par une liste
   * maison.
   *
   * Elle en connaissait treize — FR, EN, IT, PT… — et le fournisseur en publie
   * bien davantage. « PL - Fifty Shades of Grey - 2015 » partait donc a TMDB
   * avec son « PL - » : mesure sur un lot de cent, 44 correspondances, et les
   * echecs commencaient tous par un code absent de la liste (PL, EAR, GR, AS)
   * quand les reussites commencaient toutes par un code present.
   *
   * `splitLanguage` en connait 76, gere les segments empiles (« AM | CA | ... »)
   * et retire les decorations avant d'analyser. C'est deja lui qui donne son
   * titre a chaque vignette du catalogue : les deux ne peuvent plus diverger.
   */
  let title = splitLanguage(raw).title;

  title = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /\b(4K|UHD|FHD|HD|SD|1080p?|720p?|2160p?|HDR|H265|H264|X265|X264|WEB[-\s]?DL|WEBRIP|BLURAY|BRRIP|DVDRIP|HDRIP|REMUX|MULTI|VF{1,2}|VOSTFR|VOST|TRUEFRENCH|FRENCH|SUBFRENCH|DUAL|AAC|AC3|DTS)\b/gi,
      ' ',
    )
    .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-|]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title: title || raw.trim(), year };
}

async function tmdbFetch<T extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string>,
  schema: T,
): Promise<z.infer<T> | null> {
  if (!env.TMDB_API_KEY) {
    throw new AppError(
      409,
      'BAD_REQUEST',
      "TMDB_API_KEY n'est pas configuree : l'enrichissement est desactive.",
    );
  }
  const url = new URL(`${API}${path}`);
  url.searchParams.set('api_key', env.TMDB_API_KEY);
  url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (res.status === 429) {
    // Quota atteint : on laisse le job reessayer plus tard plutot que d'insister.
    throw new AppError(429, 'RATE_LIMITED', 'TMDB limite le debit, reessayez plus tard.');
  }
  if (!res.ok) return null;

  const parsed = schema.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
}

const image = (path: string | null | undefined, size: string): string | null =>
  path ? `${IMAGE}/${size}${path}` : null;

/** Un texte traduit, tel qu'on le conserve. */
export interface TmdbText {
  lang: string;
  title: string | null;
  plot: string | null;
}

interface Enrichment {
  tmdbId: string;
  /** Les langues retenues qui ont une traduction. Vide si TMDB n'en a aucune. */
  texts: TmdbText[];
  plot: string | null;
  rating: number | null;
  releaseDate: string | null;
  genre: string | null;
  castList: string | null;
  director: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  durationSec: number | null;
}

async function lookup(
  kind: 'movie' | 'tv',
  rawTitle: string,
): Promise<Enrichment | null> {
  const { title, year } = cleanTitle(rawTitle);
  if (title.length < 2) return null;

  const params: Record<string, string> = { query: title, include_adult: 'false' };
  if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);

  let search = await tmdbFetch(`/search/${kind}`, params, searchSchema);
  // Sans resultat avec l'annee, on retente sans : elle est souvent fausse.
  if (year && (!search || search.results.length === 0)) {
    search = await tmdbFetch(
      `/search/${kind}`,
      { query: title, include_adult: 'false' },
      searchSchema,
    );
  }
  const best = search?.results[0];
  if (!best) return null;

  const detail = await tmdbFetch(
    `/${kind}/${best.id}`,
    { append_to_response: 'credits,translations' },
    detailSchema,
  );
  if (!detail) return null;

  const director = detail.credits?.crew.find((c) => c.job === 'Director')?.name ?? null;
  const cast = detail.credits?.cast.slice(0, 8).map((c) => c.name).join(', ') || null;

  /*
   * On ne garde que les langues configurees, et seulement celles qui disent
   * quelque chose : TMDB renvoie une entree pour chaque langue qu'il connait,
   * y compris vide. Une ligne vide en base ne ferait que masquer le repli sur
   * la langue de base.
   *
   * Une meme langue peut arriver plusieurs fois — `fr-FR` et `fr-CA`. La
   * premiere qui porte un synopsis l'emporte : elles sont ordonnees par TMDB,
   * la variante principale d'abord.
   */
  const texts: TmdbText[] = [];
  for (const t of detail.translations?.translations ?? []) {
    const lang = t.iso_639_1.toUpperCase();
    if (!env.TMDB_LANGUAGES.includes(lang)) continue;
    if (texts.some((x) => x.lang === lang)) continue;
    const title = (t.data.title ?? t.data.name)?.trim() || null;
    const plot = t.data.overview?.trim() || null;
    if (!title && !plot) continue;
    texts.push({ lang, title, plot });
  }

  return {
    tmdbId: String(detail.id),
    texts,
    plot: detail.overview?.trim() || null,
    rating: detail.vote_average ?? null,
    releaseDate: detail.release_date ?? detail.first_air_date ?? null,
    genre: detail.genres.map((g) => g.name).join(', ') || null,
    castList: cast,
    director,
    posterUrl: image(detail.poster_path, 'w500'),
    backdropUrl: image(detail.backdrop_path, 'w1280'),
    durationSec: detail.runtime ? detail.runtime * 60 : null,
  };
}

/**
 * Enregistre les traductions d'une oeuvre.
 *
 * La cle est l'identifiant TMDB : le fournisseur publie la meme oeuvre 3,26
 * fois en moyenne, et deux abonnements doublent encore le tout — une seule
 * ligne par langue les sert toutes. Un second passage ecrase, il n'accumule
 * pas : TMDB corrige ses fiches, et une traduction perimee ne vaut pas mieux
 * qu'une absente.
 */
async function saveTexts(
  kind: 'movie' | 'tv',
  tmdbId: string,
  texts: TmdbText[],
): Promise<void> {
  if (texts.length === 0) return;
  await db
    .insert(tmdbTexts)
    .values(texts.map((t) => ({ kind, tmdbId, lang: t.lang, title: t.title, plot: t.plot })))
    .onConflictDoUpdate({
      target: [tmdbTexts.kind, tmdbTexts.tmdbId, tmdbTexts.lang],
      set: {
        title: raw`excluded.title`,
        plot: raw`excluded.plot`,
        fetchedAt: new Date(),
      },
    });
}

export interface TmdbOptions {
  limit?: number;
  onLog?: (message: string) => void;
  /** Reprend aussi les titres deja tentes sans succes. */
  retryFailed?: boolean;
}

interface TmdbState {
  running: boolean;
  processed: number;
  matched: number;
  total: number;
  abort: AbortController;
}

let current: TmdbState | null = null;

export function isTmdbRunning(): boolean {
  return current !== null;
}

export function abortTmdb(): boolean {
  if (!current) return false;
  current.abort.abort();
  return true;
}

/** Traite les elements par petits paquets concurrents, avec un temps de repos. */
async function pooled<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      if (signal.aborted) return;
      const i = index++;
      const item = items[i];
      if (item === undefined) return;
      await worker(item);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  });
  await Promise.all(runners);
}

/**
 * Recopie l'enrichissement sur les lignes neuves d'une oeuvre deja connue.
 *
 * La grosse passe ne se fait qu'une fois, mais le catalogue se resynchronise
 * chaque nuit et le fournisseur ajoute des titres : une declinaison nouvelle
 * d'un film deja enrichi arrivait vierge, et repartait interroger TMDB pour une
 * reponse qu'on avait deja en base sur ses jumelles.
 *
 * Une requete SQL, aucun appel reseau, quelques dizaines de millisecondes. Elle
 * tourne avant la boucle d'appels, qui ne voit donc plus que ce qui est
 * vraiment inconnu.
 *
 * `distinct on` choisit une source par oeuvre — la premiere par identifiant,
 * n'importe laquelle fait l'affaire puisqu'elles decrivent la meme chose.
 */
async function inheritFromTwins(): Promise<number> {
  const movies = await db.execute(raw`
    update streams t set
      tmdb_id = s.tmdb_id,
      plot = s.plot,
      rating = s.rating,
      release_date = s.release_date,
      genre = s.genre,
      cast_list = s.cast_list,
      director = s.director,
      backdrop_url = s.backdrop_url,
      icon_url = coalesce(s.icon_url, t.icon_url),
      duration_sec = coalesce(s.duration_sec, t.duration_sec),
      tmdb_fetched_at = now()
    from (
      select distinct on (work_key)
        work_key, tmdb_id, plot, rating, release_date, genre,
        cast_list, director, backdrop_url, icon_url, duration_sec
      from streams
      where type = 'vod' and tmdb_id is not null and work_key is not null
      order by work_key, id
    ) s
    where t.type = 'vod'
      and t.work_key = s.work_key
      and t.tmdb_fetched_at is null
  `);

  const shows = await db.execute(raw`
    update series t set
      tmdb_id = s.tmdb_id,
      plot = s.plot,
      rating = s.rating,
      release_date = s.release_date,
      genre = s.genre,
      cast_list = s.cast_list,
      director = s.director,
      backdrop_url = s.backdrop_url,
      cover_url = coalesce(s.cover_url, t.cover_url),
      tmdb_fetched_at = now()
    from (
      select distinct on (work_key)
        work_key, tmdb_id, plot, rating, release_date, genre,
        cast_list, director, backdrop_url, cover_url
      from series
      where tmdb_id is not null and work_key is not null
      order by work_key, id
    ) s
    where t.work_key = s.work_key
      and t.tmdb_fetched_at is null
  `);

  return (movies.count ?? 0) + (shows.count ?? 0);
}

export async function runTmdbEnrichment(
  options: TmdbOptions = {},
): Promise<{ processed: number; matched: number }> {
  if (!env.TMDB_API_KEY) {
    throw new AppError(
      409,
      'BAD_REQUEST',
      "TMDB_API_KEY n'est pas configuree : l'enrichissement est desactive.",
    );
  }
  if (current) {
    throw new AppError(409, 'CONFLICT', 'Un enrichissement TMDB est deja en cours.');
  }

  const log = options.onLog ?? (() => {});
  const limit = options.limit ?? 200;
  const notTried = options.retryFailed ? undefined : isNull(streams.tmdbFetchedAt);

  // Gratuit, et fait avant tout appel : voir `inheritFromTwins`.
  const inherited = await inheritFromTwins();
  if (inherited > 0) {
    log(`${inherited} ligne(s) heritee(s) d'une jumelle deja enrichie, sans appel a TMDB.`);
  }

  /*
   * Un appel par oeuvre, pas par ligne.
   *
   * Le fournisseur publie le meme film une vingtaine de fois — une ligne par
   * langue et par qualite — et l'interface n'en montre qu'un representant.
   * Interroger chaque ligne revenait a payer vingt fois la meme reponse :
   * 311 904 lignes de films pour 95 586 oeuvres distinctes, mesure sur le
   * catalogue. Le resultat est ensuite recopie sur les jumelles, qui decrivent
   * la meme oeuvre — meme synopsis, meme affiche, meme duree.
   *
   * `distinct on (work_key)` avec un tri par `lang_rank` retient le
   * representant francais quand il existe : c'est celui dont le titre a le plus
   * de chances d'etre reconnu, puisque la recherche est faite en `fr-FR`.
   *
   * ---
   *
   * Est candidate une oeuvre **sans identifiant TMDB**, et non plus seulement
   * une oeuvre sans synopsis ni fond.
   *
   * L'ancienne regle — `plot is null or backdrop_url is null` — visait « ce qui
   * est vraiment pauvre », et c'etait le bon critere tant que le but etait de
   * boucher des trous. Il est devenu faux le jour ou le catalogue s'est mis a se
   * lire en quatre langues : le fournisseur livre un synopsis et une jaquette
   * pour 83 % des series (24 003 oeuvres sur 28 942), qui paraissaient donc
   * completes et n'etaient jamais interrogees. Completes, elles le sont — en
   * francais. Un lecteur anglophone tombait sur du francais, sans que rien ne
   * puisse le traduire faute d'identifiant TMDB.
   *
   * L'ecart se voyait dans les chiffres sans que la cause s'y lise : 89 %
   * d'oeuvres appariees cote films contre 19 % cote series. Ce n'etait pas
   * l'appariement qui echouait — sur les series reellement tentees, il donnait
   * 77 % — c'etait la selection qui n'en tentait qu'un quart.
   */
  const movies = await db
    .selectDistinctOn([streams.workKey], {
      id: streams.id,
      name: streams.name,
      workKey: streams.workKey,
    })
    .from(streams)
    .where(
      and(
        eq(streams.type, 'vod'),
        isNull(streams.removedAt),
        notTried,
        isNull(streams.tmdbId),
      ),
    )
    .orderBy(streams.workKey, streams.langRank, streams.id)
    .limit(limit);

  const shows = await db
    .selectDistinctOn([series.workKey], {
      id: series.id,
      name: series.name,
      workKey: series.workKey,
    })
    .from(series)
    .where(
      and(
        isNull(series.removedAt),
        options.retryFailed ? undefined : isNull(series.tmdbFetchedAt),
        isNull(series.tmdbId),
      ),
    )
    .orderBy(series.workKey, series.langRank, series.id)
    .limit(limit);

  const state: TmdbState = {
    running: true,
    processed: 0,
    matched: 0,
    total: movies.length + shows.length,
    abort: new AbortController(),
  };
  current = state;

  log(`${movies.length} film(s) et ${shows.length} serie(s) a enrichir.`);

  try {
    await pooled(
      movies,
      async (row) => {
        state.processed += 1;
        try {
          const found = await lookup('movie', row.name);
          if (found) await saveTexts('movie', found.tmdbId, found.texts);
          // Marquer la tentative dans tous les cas : sinon le job repasse
          // eternellement sur les memes titres introuvables.
          await db
            .update(streams)
            .set({
              tmdbFetchedAt: new Date(),
              ...(found
                ? {
                    tmdbId: found.tmdbId,
                    plot: found.plot,
                    rating: found.rating,
                    releaseDate: found.releaseDate,
                    genre: found.genre,
                    castList: found.castList,
                    director: found.director,
                    backdropUrl: found.backdropUrl,
                    ...(found.posterUrl ? { iconUrl: found.posterUrl } : {}),
                    ...(found.durationSec ? { durationSec: found.durationSec } : {}),
                  }
                : {}),
            })
            /*
             * Toutes les lignes de l'oeuvre, pas seulement celle interrogee.
             *
             * C'est ce qui rend l'operation tenable : une reponse TMDB couvre
             * les vingt declinaisons du meme film. La cle de regroupement est
             * calculee par la base a partir du nom, elle ne peut donc pas
             * diverger de celle qu'utilise la deduplication du catalogue.
             *
             * Repli sur l'identifiant si la cle est vide : mieux vaut enrichir
             * une seule ligne que d'ecraser tout ce qui partage le vide.
             */
            .where(
              row.workKey
                ? and(eq(streams.type, 'vod'), eq(streams.workKey, row.workKey))
                : eq(streams.id, row.id),
            );
          if (found) state.matched += 1;
        } catch (err) {
          log(`  ! "${row.name}" : ${(err as Error).message}`);
        }
        if (state.processed % 25 === 0) {
          log(`  ${state.processed}/${state.total} traites, ${state.matched} trouves.`);
        }
      },
      state.abort.signal,
    );

    await pooled(
      shows,
      async (row) => {
        state.processed += 1;
        try {
          const found = await lookup('tv', row.name);
          if (found) await saveTexts('tv', found.tmdbId, found.texts);
          await db
            .update(series)
            .set({
              tmdbFetchedAt: new Date(),
              ...(found
                ? {
                    tmdbId: found.tmdbId,
                    plot: found.plot,
                    rating: found.rating,
                    releaseDate: found.releaseDate,
                    genre: found.genre,
                    castList: found.castList,
                    director: found.director,
                    backdropUrl: found.backdropUrl,
                    ...(found.posterUrl ? { coverUrl: found.posterUrl } : {}),
                  }
                : {}),
            })
            // Meme regle qu'en films : la reponse couvre toute l'oeuvre.
            .where(
              row.workKey ? eq(series.workKey, row.workKey) : eq(series.id, row.id),
            );
          if (found) state.matched += 1;
        } catch (err) {
          log(`  ! "${row.name}" : ${(err as Error).message}`);
        }
      },
      state.abort.signal,
    );

    log(`Enrichissement termine : ${state.matched}/${state.total} correspondances.`);
    return { processed: state.processed, matched: state.matched };
  } finally {
    current = null;
  }
}

export async function getTmdbStatus() {
  const [movies] = await db
    .select({
      enriched: raw<number>`count(*) filter (where streams.tmdb_id is not null)`,
      tried: raw<number>`count(*) filter (where streams.tmdb_fetched_at is not null)`,
      total: raw<number>`count(*)`,
    })
    .from(streams)
    .where(and(eq(streams.type, 'vod'), isNull(streams.removedAt)));

  const [shows] = await db
    .select({
      enriched: raw<number>`count(*) filter (where series.tmdb_id is not null)`,
      tried: raw<number>`count(*) filter (where series.tmdb_fetched_at is not null)`,
      total: raw<number>`count(*)`,
    })
    .from(series)
    .where(isNull(series.removedAt));

  return {
    configured: Boolean(env.TMDB_API_KEY),
    running: current !== null,
    progress: current ? { processed: current.processed, total: current.total } : null,
    movies: {
      enriched: Number(movies?.enriched ?? 0),
      tried: Number(movies?.tried ?? 0),
      total: Number(movies?.total ?? 0),
    },
    series: {
      enriched: Number(shows?.enriched ?? 0),
      tried: Number(shows?.tried ?? 0),
      total: Number(shows?.total ?? 0),
    },
  };
}

export type TmdbStatus = Awaited<ReturnType<typeof getTmdbStatus>>;
