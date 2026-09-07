import { and, asc, eq, gt, inArray, lt, sql as raw } from 'drizzle-orm';
import type { EpgEntry } from '@iptv/shared';
import { db } from '../db/client.js';
import { epgProgrammes, epgRuns, streams, type Provider } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { safeUrl } from '../lib/redact.js';
import { describeFetchError } from '../lib/fetch-errors.js';
import { clientFor, listActiveProviders, listAllActiveProviders, getProvider } from './providers.js';
import { streamXmltv, type XmltvProgramme } from '../xtream/xmltv.js';

/** Fenetre conservee : hier pour le contexte, une semaine devant. */
const KEEP_PAST_HOURS = 12;
const KEEP_FUTURE_DAYS = 7;
const INSERT_CHUNK = 500;

interface EpgState {
  runId: number;
  programmes: number;
  channels: number;
  bytesRead: number;
  abort: AbortController;
}

let current: EpgState | null = null;

export function isEpgRunning(): boolean {
  return current !== null;
}

export function abortEpg(): boolean {
  if (!current) return false;
  current.abort.abort();
  return true;
}

export interface EpgOptions {
  onLog?: (message: string) => void;
}

/**
 * Import de la grille XMLTV.
 *
 * Le fichier est volumineux : il est consomme en flux, insere par lots, et rien
 * n'est charge integralement. Un echec en cours de route laisse la grille
 * partiellement a jour, ce qui est acceptable — elle est reconstruite a chaque
 * passage.
 */
/**
 * Importe la grille de chaque abonnement actif, l'une apres l'autre.
 *
 * `userId` fourni, seuls les siens — c'est ce que declenche un utilisateur
 * depuis « Mes abonnements ». Omis, toute la machine : le job nocturne.
 */
export async function importEpgAll(
  options: EpgOptions & { userId?: number } = {},
): Promise<{ programmes: number; channels: number }> {
  const log = options.onLog ?? (() => {});
  const active =
    options.userId === undefined
      ? await listAllActiveProviders()
      : await listActiveProviders(options.userId);
  let programmes = 0;
  let channels = 0;
  for (const provider of active) {
    if (active.length > 1) log(`--- Grille de "${provider.name}" ---`);
    const res = await importEpg(provider, options);
    programmes += res.programmes;
    channels += res.channels;
  }
  return { programmes, channels };
}

export async function importEpg(
  provider: Provider,
  options: EpgOptions = {},
): Promise<{ programmes: number; channels: number }> {
  if (current) {
    throw new AppError(409, 'CONFLICT', 'Un import EPG est deja en cours.');
  }
  const log = options.onLog ?? (() => {});
  const row = provider;
  /*
   * D'ou vient la grille selon la sorte de source.
   *
   * Un panel la sert lui-meme, a une adresse deduite des identifiants. Une
   * playlist ne dit rien de la sienne : c'est le fournisseur qui la donne a
   * part, et elle est facultative — beaucoup de listes n'en ont aucune.
   */
  const url = row.kind === 'm3u' ? row.epgUrl : clientFor(row).xmltvUrl();
  if (!url) {
    log(`« ${row.name} » n'a pas de grille : aucune adresse XMLTV renseignee.`);
    return { programmes: 0, channels: 0 };
  }

  const [run] = await db.insert(epgRuns).values({ providerId: row.id }).returning();
  const state: EpgState = {
    runId: run!.id,
    programmes: 0,
    channels: 0,
    bytesRead: 0,
    abort: new AbortController(),
  };
  current = state;

  const notBefore = new Date(Date.now() - KEEP_PAST_HOURS * 3600_000);
  const notAfter = new Date(Date.now() + KEEP_FUTURE_DAYS * 24 * 3600_000);
  const channels = new Set<string>();
  let batch: XmltvProgramme[] = [];
  let duplicates = 0;

  const flush = async () => {
    if (batch.length === 0) return;

    /*
     * Les grilles reelles contiennent des doublons : le meme programme, sur la
     * meme chaine, a la meme heure, liste deux fois. Postgres refuse alors
     * l'insertion entiere — « ON CONFLICT DO UPDATE command cannot affect row a
     * second time ». On dedoublonne donc dans le lot, en gardant la derniere
     * occurrence, qui est aussi celle que l'upsert aurait retenue.
     */
    const unique = new Map<string, (typeof batch)[number]>();
    for (const p of batch) {
      unique.set(`${p.channel}|${p.start.getTime()}`, p);
    }
    duplicates += batch.length - unique.size;

    await db
      .insert(epgProgrammes)
      .values(
        [...unique.values()].map((p) => ({
          providerId: row.id,
          channelXmltvId: p.channel,
          title: p.title.slice(0, 500),
          description: p.description?.slice(0, 4000) ?? null,
          startAt: p.start,
          endAt: p.stop,
        })),
      )
      // Une grille se recharge souvent : un programme deja connu est mis a jour,
      // pas duplique.
      .onConflictDoUpdate({
        target: [
          epgProgrammes.providerId,
          epgProgrammes.channelXmltvId,
          epgProgrammes.startAt,
        ],
        set: {
          title: raw`excluded.title`,
          description: raw`excluded.description`,
          endAt: raw`excluded.end_at`,
        },
      });
    state.programmes += unique.size;
    batch = [];
  };

  try {
    log(`Telechargement de la grille depuis ${safeUrl(url)}`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IPTV-Personal/1.0', 'Accept-Encoding': 'gzip' },
      signal: state.abort.signal,
    }).catch((err: unknown) => {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        `Grille injoignable (${describeFetchError(err)}) sur ${safeUrl(url)}.`,
      );
    });
    if (!res.ok || !res.body) {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        `Le panel a repondu ${res.status} sur xmltv.php.`,
      );
    }

    for await (const programme of streamXmltv(res.body, {
      notBefore,
      notAfter,
      signal: state.abort.signal,
      onProgress: (bytes, count) => {
        state.bytesRead = bytes;
        log(`  ${(bytes / 1_048_576).toFixed(0)} Mo lus, ${count} programmes retenus…`);
      },
    })) {
      channels.add(programme.channel);
      batch.push(programme);
      if (batch.length >= INSERT_CHUNK) await flush();
    }
    await flush();

    state.channels = channels.size;

    // Purge de ce qui sort de la fenetre : la grille passee n'a aucun usage.
    const purged = await db
      .delete(epgProgrammes)
      .where(and(eq(epgProgrammes.providerId, row.id), lt(epgProgrammes.endAt, notBefore)))
      .returning({ id: epgProgrammes.id });

    await db
      .update(epgRuns)
      .set({
        status: 'done',
        programmes: state.programmes,
        channels: state.channels,
        bytesRead: state.bytesRead,
        finishedAt: new Date(),
      })
      .where(eq(epgRuns.id, state.runId));

    log(
      `Grille importee : ${state.programmes} programmes sur ${state.channels} chaines, ` +
        `${purged.length} entrees perimees supprimees` +
        (duplicates > 0 ? `, ${duplicates} doublon(s) de la grille ecarte(s).` : '.'),
    );
    return { programmes: state.programmes, channels: state.channels };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(epgRuns)
      .set({
        status: 'failed',
        error: message,
        programmes: state.programmes,
        channels: channels.size,
        bytesRead: state.bytesRead,
        finishedAt: new Date(),
      })
      .where(eq(epgRuns.id, state.runId));
    throw err;
  } finally {
    current = null;
  }
}

// ----------------------------------------------------------------- lectures

function toEntry(row: {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
}): EpgEntry {
  return {
    title: row.title,
    description: row.description,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
  };
}

/** Programme en cours pour un lot de chaines, en une requete. */
export async function nowPlayingFor(
  streamIds: number[],
): Promise<Map<number, EpgEntry>> {
  if (streamIds.length === 0) return new Map();

  const rows = await db
    .select({
      streamId: streams.id,
      title: epgProgrammes.title,
      description: epgProgrammes.description,
      startAt: epgProgrammes.startAt,
      endAt: epgProgrammes.endAt,
    })
    .from(streams)
    .innerJoin(
      epgProgrammes,
      and(
        eq(epgProgrammes.channelXmltvId, streams.epgChannelId),
        eq(epgProgrammes.providerId, streams.providerId),
      ),
    )
    .where(
      and(
        inArray(streams.id, streamIds),
        raw`${epgProgrammes.startAt} <= now()`,
        raw`${epgProgrammes.endAt} > now()`,
      ),
    );

  const map = new Map<number, EpgEntry>();
  for (const row of rows) {
    if (!map.has(row.streamId)) map.set(row.streamId, toEntry(row));
  }
  return map;
}

/**
 * Grille horaire : ce que passent plusieurs chaines sur une plage de temps.
 *
 * Une seule requete pour toute la page affichee. Interroger chaine par chaine
 * ferait quarante allers-retours pour dessiner un ecran, et la grille ne se lit
 * que d'un bloc de toute facon.
 *
 * Les programmes retenus sont ceux qui **chevauchent** la fenetre, pas ceux qui
 * y commencent : une emission demarree avant l'heure de depart occupe pourtant
 * le debut de la grille, et l'omettre y laisserait un trou.
 */
export async function guideFor(
  streamIds: number[],
  from: Date,
  to: Date,
): Promise<Map<number, EpgEntry[]>> {
  if (streamIds.length === 0) return new Map();

  const rows = await db
    .select({
      streamId: streams.id,
      title: epgProgrammes.title,
      description: epgProgrammes.description,
      startAt: epgProgrammes.startAt,
      endAt: epgProgrammes.endAt,
    })
    .from(streams)
    .innerJoin(
      epgProgrammes,
      and(
        eq(epgProgrammes.channelXmltvId, streams.epgChannelId),
        eq(epgProgrammes.providerId, streams.providerId),
      ),
    )
    .where(
      and(
        inArray(streams.id, streamIds),
        /*
         * Operateurs typés et non un template `sql` brut.
         *
         * Une `Date` interpolée dans un template n'est pas liée comme un
         * timestamp : le pilote la refuse — « Received an instance of Date » —
         * et toute la grille remontait vide, chaîne par chaîne, alors que la
         * même donnée s'affichait bien en vue liste.
         */
        lt(epgProgrammes.startAt, to),
        gt(epgProgrammes.endAt, from),
      ),
    )
    .orderBy(asc(epgProgrammes.startAt));

  const map = new Map<number, EpgEntry[]>();
  for (const row of rows) {
    const list = map.get(row.streamId) ?? [];
    list.push(toEntry(row));
    map.set(row.streamId, list);
  }
  return map;
}

/** Grille d'une chaine : le programme en cours et les suivants. */
export async function channelSchedule(
  streamId: number,
  limit = 8,
): Promise<EpgEntry[]> {
  const [channel] = await db
    .select({ epgChannelId: streams.epgChannelId, providerId: streams.providerId })
    .from(streams)
    .where(eq(streams.id, streamId))
    .limit(1);

  if (!channel?.epgChannelId) return [];

  const rows = await db
    .select({
      title: epgProgrammes.title,
      description: epgProgrammes.description,
      startAt: epgProgrammes.startAt,
      endAt: epgProgrammes.endAt,
    })
    .from(epgProgrammes)
    .where(
      and(
        eq(epgProgrammes.providerId, channel.providerId),
        eq(epgProgrammes.channelXmltvId, channel.epgChannelId),
        gt(epgProgrammes.endAt, new Date()),
      ),
    )
    .orderBy(asc(epgProgrammes.startAt))
    .limit(limit);

  return rows.map(toEntry);
}

/**
 * Repli quand la grille XMLTV n'est pas importee : `get_short_epg` interroge le
 * panel pour une seule chaine. Les titres y sont encodes en base64.
 */
export async function shortEpgFromPanel(streamId: number, limit = 4): Promise<EpgEntry[]> {
  const [row] = await db
    .select({ xtreamId: streams.xtreamId, providerId: streams.providerId })
    .from(streams)
    .where(eq(streams.id, streamId))
    .limit(1);
  if (!row) return [];

  const listings = await clientFor(await getProvider(row.providerId)).getShortEpg(
    row.xtreamId,
    limit,
  );

  const decode = (value: string | null): string | null => {
    if (!value) return null;
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      // Certains panels n'encodent pas du tout : un decodage qui produit des
      // octets de controle signale une chaine deja lisible telle quelle.
      const looksBinary = [...decoded].some((ch) => {
        const code = ch.charCodeAt(0);
        return code < 9 || (code > 13 && code < 32);
      });
      return looksBinary || decoded.length === 0 ? value : decoded;
    } catch {
      return value;
    }
  };

  return listings
    .filter((l) => l.start_timestamp && l.stop_timestamp)
    .map((l) => ({
      title: decode(l.title) ?? 'Programme',
      description: decode(l.description),
      startAt: l.start_timestamp!.toISOString(),
      endAt: l.stop_timestamp!.toISOString(),
    }));
}

export async function getEpgStatus() {
  const [last] = await db
    .select()
    .from(epgRuns)
    .orderBy(raw`${epgRuns.startedAt} desc`)
    .limit(1);

  const totals = await db
    .select({ n: raw<number>`count(*)` })
    .from(epgProgrammes);

  const channels = await db
    .select({ n: raw<number>`count(distinct ${epgProgrammes.channelXmltvId})` })
    .from(epgProgrammes);

  return {
    running: current !== null,
    startedAt: last?.startedAt.toISOString() ?? null,
    finishedAt: last?.finishedAt?.toISOString() ?? null,
    status: last?.status ?? null,
    error: last?.error ?? null,
    lastRun: {
      programmes: current?.programmes ?? last?.programmes ?? 0,
      channels: current?.channels ?? last?.channels ?? 0,
      megabytes: Math.round(((current?.bytesRead ?? last?.bytesRead ?? 0) / 1_048_576) * 10) / 10,
    },
    totals: {
      programmes: Number(totals[0]?.n ?? 0),
      channels: Number(channels[0]?.n ?? 0),
    },
  };
}

export type EpgStatus = Awaited<ReturnType<typeof getEpgStatus>>;

/** Nombre de chaines effectivement rattachees a la grille, pour le diagnostic. */
/**
 * Part des chaines effectivement rattachees a la grille.
 *
 * Rapportee aux abonnements du compte quand il y en a un : une couverture
 * calculee sur toute la machine ne dirait rien de ce que *lui* verra.
 */
export async function epgCoverage(userId?: number): Promise<{ matched: number; total: number }> {
  const active =
    userId === undefined ? await listAllActiveProviders() : await listActiveProviders(userId);
  const ids = active.map((p) => p.id);

  const [total] = await db
    .select({ n: raw<number>`count(*)` })
    .from(streams)
    .where(and(inArray(streams.providerId, ids), eq(streams.type, 'live')));

  const [matched] = await db
    .select({ n: raw<number>`count(distinct ${streams.id})` })
    .from(streams)
    .innerJoin(
      epgProgrammes,
      and(
        eq(epgProgrammes.channelXmltvId, streams.epgChannelId),
        eq(epgProgrammes.providerId, streams.providerId),
      ),
    )
    .where(and(inArray(streams.providerId, ids), eq(streams.type, 'live')));

  return { matched: Number(matched?.n ?? 0), total: Number(total?.n ?? 0) };
}
