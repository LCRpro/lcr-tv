import { z } from 'zod';

/**
 * Les panels Xtream sont faiblement types : entiers renvoyes en chaines, chaines
 * vides la ou on attend null, champs absents, `false` a la place d'un tableau.
 * Tout ce qui suit part du principe que rien n'est garanti.
 */

/** number | "123" | "" | null | undefined -> number | null */
export const looseInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

/** Comme looseInt mais conserve les decimales (notes). */
export const looseFloat = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  });

/** Toute valeur scalaire -> string non vide, ou null. */
export const looseStr = z
  .union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === false) return null;
    const s = String(v).trim();
    return s === '' || s === 'null' || s === 'undefined' ? null : s;
  });

/** 1 | "1" | true | "true" -> true */
export const looseBool = z
  .union([z.boolean(), z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => v === true || v === 1 || v === '1' || v === 'true');

/** Epoch secondes (souvent en chaine) -> Date | null. */
export const looseEpoch = looseInt.transform((n) =>
  n === null || n <= 0 ? null : new Date(n * 1000),
);

/**
 * Une seule image, quelle que soit la facon dont le panel la publie.
 *
 * Trois formes rencontrees : un tableau, une chaine, et une chaine qui contient
 * **plusieurs** URLs collees par des espaces —
 * `http://.../285380_tv_backdrop_0.jpg http://.../285380_tv_backdrop_1.jpg`.
 * La troisieme passait telle quelle en base : 3 458 series portaient une valeur
 * qu'aucun navigateur ne pouvait charger.
 *
 * La coupure ne se fait que devant un `http`. Le fournisseur heberge aussi des
 * fichiers dont le nom contient une espace — `.../images (30).jpg`, 4 374
 * lignes — et couper sur toute espace les aurait tous casses.
 */
const JOINED_URLS = /\s+(?=https?:\/\/)/;

export const looseFirstUrl = z
  .union([z.array(z.unknown()), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (typeof v === 'string') return v.trim().split(JOINED_URLS)[0]?.trim() || null;
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === 'string' && x.trim());
      return typeof first === 'string' ? first.trim().split(JOINED_URLS)[0]!.trim() : null;
    }
    return null;
  });

/**
 * Liste tolerante : `false`, `null`, un objet vide ou une entree invalide ne doivent
 * pas faire echouer tout le sync. Les entrees illisibles sont ecartees silencieusement,
 * l'appelant recoit aussi le compte des rejets pour pouvoir le journaliser.
 */
export function looseArray<T extends z.ZodTypeAny>(item: T) {
  return z
    .union([z.array(z.unknown()), z.literal(false), z.null(), z.undefined(), z.object({})])
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((rows) => {
      const items: z.infer<T>[] = [];
      let skipped = 0;
      for (const row of rows) {
        const parsed = item.safeParse(row);
        if (parsed.success) items.push(parsed.data);
        else skipped += 1;
      }
      return { items, skipped };
    });
}

// ------------------------------------------------------------------ user_info

export const userInfoSchema = z.object({
  username: looseStr,
  status: looseStr,
  auth: looseInt,
  message: looseStr,
  exp_date: looseEpoch,
  is_trial: looseStr,
  active_cons: looseInt,
  max_connections: looseInt,
  allowed_output_formats: z
    .union([z.array(z.string()), z.null(), z.undefined(), z.literal(false)])
    .transform((v) => (Array.isArray(v) ? v : [])),
});

export const serverInfoSchema = z.object({
  url: looseStr,
  port: looseStr,
  https_port: looseStr,
  server_protocol: looseStr,
  timezone: looseStr,
});

export const accountInfoSchema = z.object({
  user_info: userInfoSchema.optional(),
  server_info: serverInfoSchema.partial().optional(),
});

// ----------------------------------------------------------------- categories

export const categorySchema = z.object({
  category_id: looseStr,
  category_name: looseStr,
});

export const categoryListSchema = looseArray(
  categorySchema.refine((c) => c.category_id !== null, 'category_id manquant'),
);

// ---------------------------------------------------------------- live / vod

export const liveStreamSchema = z.object({
  stream_id: looseInt,
  name: looseStr,
  stream_icon: looseStr,
  category_id: looseStr,
  epg_channel_id: looseStr,
  added: looseEpoch,
  tv_archive: looseInt,
});

export const liveStreamListSchema = looseArray(
  liveStreamSchema.refine((s) => s.stream_id !== null && s.name !== null, 'entree live vide'),
);

export const vodStreamSchema = z.object({
  stream_id: looseInt,
  name: looseStr,
  stream_icon: looseStr,
  category_id: looseStr,
  container_extension: looseStr,
  rating: looseFloat,
  added: looseEpoch,
});

export const vodStreamListSchema = looseArray(
  vodStreamSchema.refine((s) => s.stream_id !== null && s.name !== null, 'entree vod vide'),
);

export const vodInfoSchema = z.object({
  info: z
    .object({
      movie_image: looseStr,
      backdrop_path: looseFirstUrl,
      plot: looseStr,
      description: looseStr,
      cast: looseStr,
      director: looseStr,
      genre: looseStr,
      releasedate: looseStr,
      releaseDate: looseStr,
      rating: looseFloat,
      duration_secs: looseInt,
      tmdb_id: looseStr,
    })
    .partial()
    .optional(),
  movie_data: z
    .object({
      stream_id: looseInt,
      name: looseStr,
      container_extension: looseStr,
      added: looseEpoch,
      category_id: looseStr,
    })
    .partial()
    .optional(),
});

// ---------------------------------------------------------------------- series

export const seriesSchema = z.object({
  series_id: looseInt,
  name: looseStr,
  cover: looseStr,
  backdrop_path: looseFirstUrl,
  plot: looseStr,
  cast: looseStr,
  director: looseStr,
  genre: looseStr,
  releaseDate: looseStr,
  release_date: looseStr,
  rating: looseFloat,
  category_id: looseStr,
  last_modified: looseEpoch,
});

export const seriesListSchema = looseArray(
  seriesSchema.refine((s) => s.series_id !== null && s.name !== null, 'entree serie vide'),
);

const episodeSchema = z.object({
  id: looseStr,
  episode_num: looseInt,
  season: looseInt,
  title: looseStr,
  container_extension: looseStr,
  info: z
    .object({
      plot: looseStr,
      duration_secs: looseInt,
      movie_image: looseStr,
    })
    .partial()
    .optional(),
});

/**
 * `episodes` arrive habituellement en objet indexe par saison
 * (`{"1": [...], "2": [...]}`), mais certains panels renvoient un tableau plat,
 * et un `false` quand la serie est vide.
 */
const episodesContainerSchema = z
  .union([
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
    z.literal(false),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => {
    if (!v) return [] as unknown[];
    if (Array.isArray(v)) return v;
    return Object.values(v).flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
  })
  .transform((rows) => {
    const items: z.infer<typeof episodeSchema>[] = [];
    let skipped = 0;
    for (const row of rows) {
      const parsed = episodeSchema.safeParse(row);
      if (parsed.success && parsed.data.id !== null) items.push(parsed.data);
      else skipped += 1;
    }
    return { items, skipped };
  });

export const seriesInfoSchema = z.object({
  info: z
    .object({
      name: looseStr,
      cover: looseStr,
      backdrop_path: looseFirstUrl,
      plot: looseStr,
      cast: looseStr,
      director: looseStr,
      genre: looseStr,
      releaseDate: looseStr,
      release_date: looseStr,
      rating: looseFloat,
    })
    .partial()
    .optional(),
  seasons: z.unknown().optional(),
  episodes: episodesContainerSchema,
});

// ------------------------------------------------------------------------ epg

const epgListingSchema = z.object({
  title: looseStr,
  description: looseStr,
  start_timestamp: looseEpoch,
  stop_timestamp: looseEpoch,
});

export const shortEpgSchema = z.object({
  epg_listings: looseArray(epgListingSchema),
});

export type XtreamUserInfo = z.infer<typeof userInfoSchema>;
export type XtreamCategory = z.infer<typeof categorySchema>;
export type XtreamLiveStream = z.infer<typeof liveStreamSchema>;
export type XtreamVodStream = z.infer<typeof vodStreamSchema>;
export type XtreamSeries = z.infer<typeof seriesSchema>;
export type XtreamSeriesInfo = z.infer<typeof seriesInfoSchema>;
export type XtreamVodInfo = z.infer<typeof vodInfoSchema>;
