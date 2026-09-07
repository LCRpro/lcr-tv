import { and, eq, isNull, lt, sql as raw } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, providers, streams, type Provider } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { isAdultCategoryName } from '../xtream/client.js';
import { m3uStreamId, parseM3u, xmltvId, type M3uEntry } from './parse.js';

/**
 * Synchronisation d'une playlist.
 *
 * Rien a voir avec un panel, qui repond a des questions : ici on telecharge un
 * fichier, on le lit, on ecrit ce qu'on a compris. Pas de compte a interroger,
 * pas de connexions a compter, pas de VOD ni de series — une playlist ne decrit
 * que des flux, et rien ne dit lesquels sont des films.
 *
 * Le catalogue est le meme que celui du panel : les chaines rejoignent
 * `streams`, avec leur provider pour les distinguer. C'est ce qui leur donne la
 * recherche, les favoris, la grille et les vignettes sans une ligne de plus.
 */

/** Au-dela, ce n'est plus une playlist mais une erreur de saisie. */
const MAX_BYTES = 64 * 1024 * 1024;
const CHUNK = 500;

const chunked = <T>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export interface M3uSyncResult {
  categories: number;
  live: number;
  removed: number;
}

/**
 * Telecharge la playlist.
 *
 * Le `User-Agent` est explicite : beaucoup d'hotes repondent 403 a un client
 * qui n'en annonce pas, et l'erreur ressemble alors a une adresse fausse.
 */
async function download(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', Accept: '*/*' },
      redirect: 'follow',
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    throw new AppError(
      502,
      'PROVIDER_UNREACHABLE',
      `Playlist injoignable : ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new AppError(
      502,
      'PROVIDER_UNREACHABLE',
      `La playlist repond ${res.status}. L'adresse est-elle correcte, et toujours valide ?`,
    );
  }
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_BYTES) {
    throw new AppError(400, 'BAD_REQUEST', `Playlist trop volumineuse (${Math.round(size / 1e6)} Mo).`);
  }
  const text = await res.text();
  if (!/^\s*#EXTM3U/i.test(text) && !/#EXTINF/i.test(text)) {
    throw new AppError(
      422,
      'BAD_REQUEST',
      "Ce n'est pas une playlist M3U : aucune ligne #EXTINF trouvee.",
    );
  }
  return text;
}

/** Sans groupe, tout tombe dans un fourre-tout plutot que nulle part. */
const SANS_GROUPE = 'Sans categorie';

export async function runM3uSync(
  provider: Provider,
  options: { onLog?: (m: string) => void; signal?: AbortSignal } = {},
): Promise<M3uSyncResult> {
  const log = options.onLog ?? (() => {});
  const startedAt = new Date();

  log(`Telechargement de la playlist…`);
  const text = await download(provider.baseUrl, options.signal);
  const entries = parseM3u(text);
  log(`${entries.length} entree(s) lue(s) dans ${Math.round(text.length / 1024)} Ko.`);
  if (entries.length === 0) {
    throw new AppError(422, 'BAD_REQUEST', 'La playlist ne contient aucune chaine lisible.');
  }

  /* --------------------------------------------------------------- categories
   *
   * Le groupe fait la categorie, et son nom lui sert d'identifiant.
   *
   * Un panel numerote les siennes ; une playlist n'a que des noms. Comme la
   * colonne est du texte, le nom fait un identifiant a la fois stable et
   * lisible — la colonne de gauche ne se reconstruit donc pas d'une
   * synchronisation a l'autre, et les categories epinglees survivent.
   */
  const groups = new Set<string>();
  for (const e of entries) groups.add(e.group?.trim() || SANS_GROUPE);

  const catValues = [...groups].map((name) => ({
    providerId: provider.id,
    xtreamId: name,
    type: 'live' as const,
    name,
    isAdult: isAdultCategoryName(name),
    removedAt: null,
  }));
  for (const batch of chunked(catValues)) {
    await db
      .insert(categories)
      .values(batch)
      .onConflictDoUpdate({
        target: [categories.providerId, categories.type, categories.xtreamId],
        set: { name: raw`excluded.name`, isAdult: raw`excluded.is_adult`, removedAt: null },
      });
  }
  const catRows = await db
    .select({ id: categories.id, xtreamId: categories.xtreamId })
    .from(categories)
    .where(and(eq(categories.providerId, provider.id), eq(categories.type, 'live')));
  const catMap = new Map(catRows.map((r) => [r.xtreamId, r.id]));
  log(`${groups.size} categorie(s).`);

  // ------------------------------------------------------------------ chaines
  /*
   * Une entree par identifiant.
   *
   * Les listes publiques repetent la meme chaine — 248 doublons exacts sur
   * 12 434 entrees, mesure sur une liste reelle. Sans ce filtre, le meme lot
   * contiendrait deux fois la meme cle et Postgres refuserait l'insertion
   * entiere : « ON CONFLICT DO UPDATE ne peut pas mettre a jour une ligne deux
   * fois ».
   */
  const seen = new Map<number, M3uEntry>();
  for (const e of entries) seen.set(m3uStreamId(e), e);
  if (seen.size < entries.length) {
    log(`${entries.length - seen.size} doublon(s) exact(s) ecarte(s).`);
  }

  const values = [...seen].map(([id, e]) => ({
    providerId: provider.id,
    xtreamId: id,
    type: 'live' as const,
    name: e.name,
    sourceUrl: e.url,
    iconUrl: e.logo,
    categoryId: catMap.get(e.group?.trim() || SANS_GROUPE) ?? null,
    containerExtension: null,
    epgChannelId: xmltvId(e.tvgId),
    addedAt: null,
    removedAt: null,
    syncedAt: new Date(),
  }));

  for (const batch of chunked(values)) {
    if (options.signal?.aborted) throw new AppError(409, 'CONFLICT', 'Synchronisation interrompue.');
    await db
      .insert(streams)
      .values(batch)
      .onConflictDoUpdate({
        target: [streams.providerId, streams.type, streams.xtreamId],
        set: {
          name: raw`excluded.name`,
          sourceUrl: raw`excluded.source_url`,
          iconUrl: raw`excluded.icon_url`,
          categoryId: raw`excluded.category_id`,
          epgChannelId: raw`excluded.epg_channel_id`,
          removedAt: null,
          syncedAt: raw`excluded.synced_at`,
        },
      });
  }
  log(`${values.length} chaine(s) enregistree(s).`);

  // Ce que la playlist ne contient plus a disparu de chez le fournisseur.
  const removed = await db
    .update(streams)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(streams.providerId, provider.id),
        lt(streams.syncedAt, startedAt),
        isNull(streams.removedAt),
      ),
    )
    .returning({ id: streams.id });
  if (removed.length > 0) log(`${removed.length} chaine(s) disparue(s) de la playlist.`);

  await db.update(providers).set({ lastSyncAt: new Date() }).where(eq(providers.id, provider.id));

  return { categories: groups.size, live: values.length, removed: removed.length };
}

/**
 * Lit une playlist sans rien ecrire, pour repondre a « cette adresse marche ? ».
 *
 * Le test d'un panel interroge son compte ; une playlist n'en a pas, alors on
 * la telecharge et on compte. C'est le seul moyen de distinguer une adresse
 * valide d'une page d'erreur servie en 200 — cas courant chez les hebergeurs
 * qui repondent une page HTML plutot qu'un 404.
 */
export async function probeM3u(url: string): Promise<{ count: number }> {
  return { count: parseM3u(await download(url)).length };
}
