import { and, eq, inArray, isNull, lt, sql as raw } from 'drizzle-orm';
import type { SyncPhase, SyncStatus } from '@iptv/shared';
import { db } from '../db/client.js';
import { forgetCatalogCache } from './catalog-cache.js';
import {
  categories,
  episodes,
  providers,
  series,
  streams,
  syncRuns,
  type Provider,
} from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { isAdultCategoryName, XtreamClient } from '../xtream/client.js';
import { runM3uSync } from '../m3u/sync.js';
import { clientFor, listActiveProviders, listAllActiveProviders } from './providers.js';

type Counts = { categories: number; live: number; vod: number; series: number; removed: number };

interface RunState {
  runId: number;
  providerId: number;
  phase: SyncPhase;
  startedAt: Date;
  counts: Counts;
  abort: AbortController;
}

/**
 * Un verrou par abonnement, et non un pour la machine.
 *
 * Il etait unique : deux comptes qui lancaient leur synchronisation en meme
 * temps se marchaient dessus, et le second recevait « deja en cours » alors
 * qu'ils ne touchaient pas une seule ligne commune — les tables sont
 * partitionnees par `provider_id`. Ce qu'il fallait empecher, c'est qu'un
 * *meme* abonnement soit synchronise deux fois a la fois, ce qui doublerait les
 * ecritures sur ses lignes.
 *
 * Le verrou est en memoire parce qu'il n'y a qu'un backend : le doubler d'un
 * verrou base serait du decor.
 */
const running = new Map<number, RunState>();

/**
 * Plafond de synchronisations simultanees.
 *
 * Les lignes ne se recouvrent pas, mais la connexion sortante et la base sont
 * communes : au-dela, on sature le lien et les panels repondent en timeout.
 * Trois laisse passer un foyer entier sans transformer la machine en robinet.
 */
const MAX_CONCURRENT = 3;

const CHUNK = 400;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sans argument : une synchronisation quelconque tourne. Avec : celle-ci. */
export function isSyncRunning(providerId?: number): boolean {
  return providerId === undefined ? running.size > 0 : running.has(providerId);
}

/** Interrompt un abonnement, ou tous si aucun n'est designe. */
export function abortSync(providerId?: number): boolean {
  if (providerId !== undefined) {
    const state = running.get(providerId);
    if (!state) return false;
    state.abort.abort();
    return true;
  }
  if (running.size === 0) return false;
  for (const state of running.values()) state.abort.abort();
  return true;
}

function checkAborted(state: RunState): void {
  if (state.abort.signal.aborted) {
    throw new AppError(499 as number, 'INTERNAL', 'Synchronisation interrompue.');
  }
}

async function setPhase(state: RunState, phase: SyncPhase): Promise<void> {
  state.phase = phase;
  await db
    .update(syncRuns)
    .set({ phase, counts: state.counts })
    .where(eq(syncRuns.id, state.runId));
}

export interface SyncOptions {
  /** Log de progression, branche sur la CLI ou sur le logger Fastify. */
  onLog?: (message: string) => void;
  /** Recharge aussi les episodes des series deja connues (long : un appel par serie). */
  withEpisodes?: boolean;
  /** Borne le nombre de series dont les episodes sont charges dans ce run. */
  episodeLimit?: number;
}

/**
 * Synchronise les abonnements actifs, l'un apres l'autre. Sequentiel et non
 * parallele : les panels supportent mal les rafales, et rien ne presse.
 *
 * `userId` fourni, seuls ceux de ce compte — c'est ce que declenche un
 * utilisateur depuis « Mes abonnements ». Omis, tous comptes confondus : c'est
 * le travail nocturne du planificateur, qui sert la maison entiere.
 */
export async function runSyncAll(
  options: SyncOptions & { userId?: number } = {},
): Promise<SyncStatus> {
  const log = options.onLog ?? (() => {});
  const active =
    options.userId === undefined
      ? await listAllActiveProviders()
      : await listActiveProviders(options.userId);
  for (const provider of active) {
    if (active.length > 1) log(`--- Abonnement "${provider.name}" ---`);
    /*
     * Une playlist se synchronise autrement : pas d'API a interroger, un
     * fichier a telecharger. L'aiguillage est ici plutot que dans `runSync`,
     * qui n'existe que pour un panel — depuis son verrou par abonnement jusqu'a
     * ses phases (categories, live, vod, series) dont trois n'ont pas de sens
     * pour un fichier de chaines.
     */
    if (provider.kind === 'm3u') {
      try {
        const result = await runM3uSync(provider, { onLog: log });
        log(
          `Playlist "${provider.name}" : ${result.live} chaine(s), ` +
            `${result.categories} categorie(s), ${result.removed} disparue(s).`,
        );
      } catch (err) {
        // Une playlist injoignable ne doit pas empecher les autres sources de
        // se synchroniser : le catalogue se remplit avec ce qui repond.
        log(`Playlist "${provider.name}" : ${(err as Error).message}`);
      }
      continue;
    }
    await runSync(provider, options);
  }
  return getSyncStatus();
}

export async function runSync(
  provider: Provider,
  options: SyncOptions = {},
): Promise<SyncStatus> {
  if (running.has(provider.id)) {
    throw new AppError(
      409,
      'SYNC_ALREADY_RUNNING',
      `« ${provider.name} » est deja en cours de synchronisation.`,
    );
  }
  if (running.size >= MAX_CONCURRENT) {
    throw new AppError(
      409,
      'SYNC_ALREADY_RUNNING',
      `${MAX_CONCURRENT} synchronisations tournent deja : reessayez dans quelques minutes.`,
    );
  }
  const log = options.onLog ?? (() => {});
  const row = provider;

  /*
   * La place est reservee avant le premier `await`.
   *
   * Le verrou etait pose apres l'insertion en base : entre le test ci-dessus et
   * cette pose, l'execution rendait la main, et un second appel traversait le
   * test sur une table encore vide. Deux synchronisations du meme abonnement
   * partaient alors ensemble — mesure : deux fois deux lancements simultanes,
   * zero refus. En JavaScript, un test suivi d'un `await` puis d'une ecriture
   * n'est pas atomique ; ici il l'est, parce que rien ne s'intercale.
   */
  const state: RunState = {
    runId: 0,
    providerId: row.id,
    phase: 'categories',
    startedAt: new Date(),
    counts: { categories: 0, live: 0, vod: 0, series: 0, removed: 0 },
    abort: new AbortController(),
  };
  running.set(row.id, state);

  const [run] = await db
    .insert(syncRuns)
    .values({ providerId: row.id, status: 'running', phase: 'categories' })
    .returning()
    .catch((err) => {
      // L'insertion a echoue : la place reservee doit repartir, sinon
      // l'abonnement resterait verrouille jusqu'au redemarrage.
      running.delete(row.id);
      throw err;
    });
  state.runId = run!.id;
  state.startedAt = run!.startedAt;

  const client = clientFor(row, (msg) => log(`  ! ${msg}`));

  try {
    // max_connections vient du panel, jamais d'une constante.
    const { userInfo, serverInfo } = await client.getAccountInfo();
    await db
      .update(providers)
      .set({
        maxConnections: userInfo.max_connections,
        activeConnections: userInfo.active_cons,
        status: userInfo.status,
        expiresAt: userInfo.exp_date,
        serverName: serverInfo.url ?? null,
      })
      .where(eq(providers.id, row.id));
    log(
      `Compte "${userInfo.username ?? '?'}" — statut ${userInfo.status ?? '?'}, ` +
        `${userInfo.max_connections ?? '?'} connexion(s) simultanee(s).`,
    );

    const categoryMap = await syncCategories(state, client, log);
    checkAborted(state);

    await setPhase(state, 'live');
    await syncLive(state, client, categoryMap, log);
    checkAborted(state);

    await setPhase(state, 'vod');
    await syncVod(state, client, categoryMap, log);
    checkAborted(state);

    await setPhase(state, 'series');
    await syncSeries(state, client, categoryMap, log);
    checkAborted(state);

    // Marquage logique de ce qui n'est plus servi par le panel.
    state.counts.removed = await markRemoved(state);
    log(`${state.counts.removed} entree(s) marquee(s) comme retiree(s).`);

    if (options.withEpisodes) {
      await syncEpisodes(state, client, log, options.episodeLimit ?? 200);
    }

    await db
      .update(syncRuns)
      .set({
        status: 'done',
        phase: 'done',
        counts: state.counts,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, state.runId));
    await db
      .update(providers)
      .set({ lastSyncAt: new Date() })
      .where(eq(providers.id, row.id));

    log('Synchronisation terminee.');
    return await getSyncStatus();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(syncRuns)
      .set({
        status: 'failed',
        phase: 'failed',
        error: message,
        counts: state.counts,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, state.runId));
    throw err;
  } finally {
    running.delete(row.id);
    /*
     * Le catalogue vient de bouger : les comptes par categorie, les logos et
     * les langues gardes en memoire ne valent plus rien. Dans le `finally`
     * plutot qu'apres le succes — un sync interrompu a deja ecrit des lignes.
     */
    forgetCatalogCache(row.userId);
  }
}

// ------------------------------------------------------------------ etapes

type CategoryMap = Map<string, { id: number; isAdult: boolean }>;

async function syncCategories(
  state: RunState,
  client: XtreamClient,
  log: (m: string) => void,
): Promise<CategoryMap> {
  const map: CategoryMap = new Map();
  for (const type of ['live', 'vod', 'series'] as const) {
    checkAborted(state);
    const list = await client.getCategories(type);
    if (list.length === 0) {
      log(`Categories ${type} : aucune.`);
      continue;
    }
    const values = list.map((c) => ({
      providerId: state.providerId,
      xtreamId: c.category_id!,
      type,
      name: c.category_name ?? `Categorie ${c.category_id}`,
      isAdult: isAdultCategoryName(c.category_name),
      removedAt: null,
    }));

    for (const batch of chunked(values)) {
      await db
        .insert(categories)
        .values(batch)
        .onConflictDoUpdate({
          target: [categories.providerId, categories.type, categories.xtreamId],
          set: {
            name: raw`excluded.name`,
            isAdult: raw`excluded.is_adult`,
            removedAt: null,
          },
        });
    }

    const rows = await db
      .select({ id: categories.id, xtreamId: categories.xtreamId, isAdult: categories.isAdult })
      .from(categories)
      .where(and(eq(categories.providerId, state.providerId), eq(categories.type, type)));
    for (const r of rows) map.set(`${type}:${r.xtreamId}`, { id: r.id, isAdult: r.isAdult });

    state.counts.categories += list.length;
    log(`Categories ${type} : ${list.length}.`);
  }
  await setPhase(state, 'categories');
  return map;
}

async function syncLive(
  state: RunState,
  client: XtreamClient,
  categoryMap: CategoryMap,
  log: (m: string) => void,
): Promise<void> {
  const list = await client.getLiveStreams();
  log(`Chaines live : ${list.length}.`);
  const values = list.map((s) => ({
    providerId: state.providerId,
    xtreamId: s.stream_id!,
    type: 'live' as const,
    name: s.name!,
    iconUrl: s.stream_icon,
    categoryId: categoryMap.get(`live:${s.category_id}`)?.id ?? null,
    containerExtension: null,
    // Cle de rattachement au XMLTV ; sans elle, la chaine n'aura jamais de grille.
    epgChannelId: s.epg_channel_id,
    addedAt: s.added,
    removedAt: null,
    syncedAt: new Date(),
  }));

  for (const batch of chunked(values)) {
    checkAborted(state);
    await db
      .insert(streams)
      .values(batch)
      .onConflictDoUpdate({
        target: [streams.providerId, streams.type, streams.xtreamId],
        set: {
          name: raw`excluded.name`,
          iconUrl: raw`excluded.icon_url`,
          categoryId: raw`excluded.category_id`,
          epgChannelId: raw`excluded.epg_channel_id`,
          addedAt: raw`excluded.added_at`,
          removedAt: null,
          syncedAt: raw`excluded.synced_at`,
        },
      });
    state.counts.live += batch.length;
  }
  await setPhase(state, 'live');
}

async function syncVod(
  state: RunState,
  client: XtreamClient,
  categoryMap: CategoryMap,
  log: (m: string) => void,
): Promise<void> {
  const list = await client.getVodStreams();
  log(`Films : ${list.length}.`);
  const values = list.map((s) => ({
    providerId: state.providerId,
    xtreamId: s.stream_id!,
    type: 'vod' as const,
    name: s.name!,
    iconUrl: s.stream_icon,
    categoryId: categoryMap.get(`vod:${s.category_id}`)?.id ?? null,
    containerExtension: s.container_extension,
    rating: s.rating,
    addedAt: s.added,
    removedAt: null,
    syncedAt: new Date(),
  }));

  for (const batch of chunked(values)) {
    checkAborted(state);
    await db
      .insert(streams)
      .values(batch)
      .onConflictDoUpdate({
        target: [streams.providerId, streams.type, streams.xtreamId],
        set: {
          name: raw`excluded.name`,
          iconUrl: raw`excluded.icon_url`,
          categoryId: raw`excluded.category_id`,
          containerExtension: raw`excluded.container_extension`,
          rating: raw`excluded.rating`,
          addedAt: raw`excluded.added_at`,
          removedAt: null,
          syncedAt: raw`excluded.synced_at`,
        },
      });
    state.counts.vod += batch.length;
  }
  await setPhase(state, 'vod');
}

async function syncSeries(
  state: RunState,
  client: XtreamClient,
  categoryMap: CategoryMap,
  log: (m: string) => void,
): Promise<void> {
  const list = await client.getSeries();
  log(`Series : ${list.length}.`);
  const values = list.map((s) => ({
    providerId: state.providerId,
    xtreamId: s.series_id!,
    name: s.name!,
    coverUrl: s.cover,
    backdropUrl: s.backdrop_path,
    plot: s.plot,
    rating: s.rating,
    releaseDate: s.releaseDate ?? s.release_date,
    genre: s.genre,
    castList: s.cast,
    director: s.director,
    categoryId: categoryMap.get(`series:${s.category_id}`)?.id ?? null,
    addedAt: s.last_modified,
    removedAt: null,
    syncedAt: new Date(),
  }));

  for (const batch of chunked(values)) {
    checkAborted(state);
    await db
      .insert(series)
      .values(batch)
      .onConflictDoUpdate({
        target: [series.providerId, series.xtreamId],
        set: {
          name: raw`excluded.name`,
          coverUrl: raw`excluded.cover_url`,
          backdropUrl: raw`excluded.backdrop_url`,
          plot: raw`excluded.plot`,
          rating: raw`excluded.rating`,
          releaseDate: raw`excluded.release_date`,
          genre: raw`excluded.genre`,
          castList: raw`excluded.cast_list`,
          director: raw`excluded.director`,
          categoryId: raw`excluded.category_id`,
          addedAt: raw`excluded.added_at`,
          removedAt: null,
          syncedAt: raw`excluded.synced_at`,
        },
      });
    state.counts.series += batch.length;
  }
  await setPhase(state, 'series');
}

/**
 * Jamais de DELETE. Tout ce que le panel n'a pas renvoye pendant ce run
 * (donc dont `synced_at` est anterieur au debut du run) est marque retire.
 */
async function markRemoved(state: RunState): Promise<number> {
  const removedStreams = await db
    .update(streams)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(streams.providerId, state.providerId),
        lt(streams.syncedAt, state.startedAt),
        isNull(streams.removedAt),
      ),
    )
    .returning({ id: streams.id });

  const removedSeries = await db
    .update(series)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(series.providerId, state.providerId),
        lt(series.syncedAt, state.startedAt),
        isNull(series.removedAt),
      ),
    )
    .returning({ id: series.id });

  return removedStreams.length + removedSeries.length;
}

/**
 * Les episodes ne sont pas recuperables en masse : `get_series_info` coute un
 * appel par serie. On les charge a la demande (fiche serie), et ce passage
 * optionnel ne sert qu'a preremplir un lot borne.
 */
async function syncEpisodes(
  state: RunState,
  client: XtreamClient,
  log: (m: string) => void,
  limit: number,
): Promise<void> {
  const targets = await db
    .select({ id: series.id, xtreamId: series.xtreamId, name: series.name })
    .from(series)
    .where(and(eq(series.providerId, state.providerId), isNull(series.removedAt)))
    .orderBy(series.episodesFetchedAt)
    .limit(limit);

  let done = 0;
  for (const s of targets) {
    checkAborted(state);
    try {
      await fetchAndStoreEpisodes(client, s.id, s.xtreamId);
      done += 1;
    } catch (err) {
      log(`  ! Episodes de "${s.name}" indisponibles : ${(err as Error).message}`);
    }
  }
  log(`Episodes charges pour ${done}/${targets.length} serie(s).`);
}

/** Charge les episodes d'une serie et les upsert. Utilise par le sync et a la demande. */
export async function fetchAndStoreEpisodes(
  client: XtreamClient,
  seriesRowId: number,
  seriesXtreamId: number,
): Promise<number> {
  const info = await client.getSeriesInfo(seriesXtreamId);
  const list = info.episodes.items;

  if (list.length > 0) {
    const values = list.map((e) => ({
      seriesId: seriesRowId,
      xtreamId: e.id!,
      season: e.season ?? 1,
      episodeNum: e.episode_num ?? 0,
      title: e.title ?? `Episode ${e.episode_num ?? '?'}`,
      containerExtension: e.container_extension,
      durationSec: e.info?.duration_secs ?? null,
      plot: e.info?.plot ?? null,
      stillUrl: e.info?.movie_image ?? null,
      removedAt: null,
    }));
    for (const batch of chunked(values)) {
      await db
        .insert(episodes)
        .values(batch)
        .onConflictDoUpdate({
          target: [episodes.seriesId, episodes.xtreamId],
          set: {
            season: raw`excluded.season`,
            episodeNum: raw`excluded.episode_num`,
            title: raw`excluded.title`,
            containerExtension: raw`excluded.container_extension`,
            durationSec: raw`excluded.duration_sec`,
            plot: raw`excluded.plot`,
            stillUrl: raw`excluded.still_url`,
            removedAt: null,
          },
        });
    }
  }

  // Les metadonnees de get_series_info sont souvent plus completes que get_series.
  const meta = info.info ?? {};
  await db
    .update(series)
    .set({
      episodesFetchedAt: new Date(),
      ...(meta.plot ? { plot: meta.plot } : {}),
      ...(meta.cover ? { coverUrl: meta.cover } : {}),
      ...(meta.backdrop_path ? { backdropUrl: meta.backdrop_path } : {}),
      ...(meta.cast ? { castList: meta.cast } : {}),
      ...(meta.director ? { director: meta.director } : {}),
      ...(meta.genre ? { genre: meta.genre } : {}),
      ...(meta.rating !== null && meta.rating !== undefined ? { rating: meta.rating } : {}),
      ...(meta.releaseDate ?? meta.release_date
        ? { releaseDate: meta.releaseDate ?? meta.release_date }
        : {}),
    })
    .where(eq(series.id, seriesRowId));

  return list.length;
}

// ------------------------------------------------------------------- statut

/**
 * Etat de la synchronisation, du point de vue d'un compte.
 *
 * Il etait global : un compte lisait la derniere execution de l'abonnement d'un
 * autre, et une volumetrie calculee sur toute la machine. Depuis que les
 * abonnements appartiennent au compte, « ma derniere synchro » et « la taille
 * de mon catalogue » ne veulent dire quelque chose que rapportees aux siens.
 *
 * Sans `userId`, la vue machine : c'est celle du planificateur nocturne.
 */
export async function getSyncStatus(userId?: number): Promise<SyncStatus> {
  const mine =
    userId === undefined
      ? undefined
      : (await listActiveProviders(userId)).map((p) => p.id);

  /*
   * Aucun abonnement actif : rien a dire, et surtout rien a agreger. Sans ce
   * court-circuit, `inArray(..., [])` produirait un `in ()` que Postgres
   * refuse, et les totaux porteraient sur le catalogue de tout le monde.
   */
  if (mine && mine.length === 0) {
    return {
      running: false,
      phase: 'idle',
      startedAt: null,
      finishedAt: null,
      error: null,
      counts: { categories: 0, live: 0, vod: 0, series: 0, removed: 0 },
      totals: { live: 0, vod: 0, series: 0, episodes: 0 },
    };
  }

  const [last] = await db
    .select()
    .from(syncRuns)
    .where(mine ? inArray(syncRuns.providerId, mine) : undefined)
    .orderBy(raw`${syncRuns.startedAt} desc`)
    .limit(1);

  const [totals] = await db
    .select({
      live: raw<number>`count(*) filter (where ${streams.type} = 'live' and ${streams.removedAt} is null)`,
      vod: raw<number>`count(*) filter (where ${streams.type} = 'vod' and ${streams.removedAt} is null)`,
    })
    .from(streams)
    .where(mine ? inArray(streams.providerId, mine) : undefined);

  const [seriesTotals] = await db
    .select({
      series: raw<number>`count(*) filter (where ${series.removedAt} is null)`,
    })
    .from(series)
    .where(mine ? inArray(series.providerId, mine) : undefined);

  const [episodeTotals] = await db
    .select({ episodes: raw<number>`count(*)` })
    .from(episodes)
    .where(
      mine
        ? raw`${episodes.seriesId} in (select id from series where provider_id in ${mine})`
        : undefined,
    );

  /*
   * L'execution en cours qui concerne ce compte, s'il y en a une.
   *
   * Avec un verrou par abonnement, plusieurs peuvent tourner a la fois : on
   * remonte la premiere des siennes. Annoncer « en cours » a cause de la
   * synchronisation d'un autre compte ferait attendre un catalogue qui ne se
   * remplit pas.
   */
  const active = mine
    ? [...running.values()].find((s) => mine.includes(s.providerId))
    : [...running.values()][0];

  return {
    running: Boolean(active),
    phase: active ? active.phase : ((last?.phase ?? 'idle') as SyncPhase),
    startedAt: last?.startedAt.toISOString() ?? null,
    finishedAt: last?.finishedAt?.toISOString() ?? null,
    error: last?.error ?? null,
    counts: active
      ? active.counts
      : (last?.counts ?? {
          categories: 0,
          live: 0,
          vod: 0,
          series: 0,
          removed: 0,
        }),
    totals: {
      live: Number(totals?.live ?? 0),
      vod: Number(totals?.vod ?? 0),
      series: Number(seriesTotals?.series ?? 0),
      episodes: Number(episodeTotals?.episodes ?? 0),
    },
  };
}

/**
 * Le catalogue de ce compte est-il exploitable ?
 *
 * Pose sur ses abonnements a lui : depuis que chaque compte apporte les siens,
 * un catalogue plein ailleurs sur la machine ne lui sert a rien.
 */
export async function isCatalogEmpty(userId: number): Promise<boolean> {
  const active = await listActiveProviders(userId);
  if (active.length === 0) return true;
  const [row] = await db
    .select({ n: raw<number>`count(*)` })
    .from(streams)
    .where(and(isNull(streams.removedAt), inArray(streams.providerId, active.map((p) => p.id))))
    .limit(1);
  return Number(row?.n ?? 0) === 0;
}
