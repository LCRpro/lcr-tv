import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { safeUrl } from '../lib/redact.js';
import { describeFetchError } from '../lib/fetch-errors.js';
import {
  accountInfoSchema,
  categoryListSchema,
  liveStreamListSchema,
  seriesInfoSchema,
  seriesListSchema,
  shortEpgSchema,
  vodInfoSchema,
  vodStreamListSchema,
} from './schemas.js';
import {
  episodeUrl,
  liveUrl,
  movieUrl,
  normalizeBaseUrl,
  playerApiUrl,
  xmltvUrl,
  type XtreamCredentials,
} from './urls.js';

export interface XtreamClientOptions {
  timeoutMs?: number;
  retries?: number;
  onWarn?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

/**
 * Client Xtream. Deux regles :
 *  - toute reponse passe par Zod avant d'etre utilisee ;
 *  - aucune URL brute ne remonte dans une erreur ou un log (elles portent les credentials).
 */
export class XtreamClient {
  readonly creds: XtreamCredentials;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly onWarn: (message: string) => void;

  constructor(creds: XtreamCredentials, options: XtreamClientOptions = {}) {
    this.creds = { ...creds, baseUrl: normalizeBaseUrl(creds.baseUrl) };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.onWarn = options.onWarn ?? (() => {});
  }

  // --------------------------------------------------------------- transport

  private async fetchJson(params: Record<string, string | number>): Promise<unknown> {
    const url = playerApiUrl(this.creds, params);
    let lastError: unknown;

    // Certains panels legacy ferment les connexions persistantes. Force HTTP
    // à fermer la connexion après chaque réponse plutôt que de réutiliser un socket.
    // Un User-Agent stable évite de masquer un problème de transport par des essais
    // qui changent simultanément plusieurs paramètres.
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            Connection: 'close',
          },
        });
        if (!res.ok) {
          // 4xx cote panel : inutile de reessayer.
          if (res.status >= 400 && res.status < 500) {
            throw new AppError(
              502,
              'PROVIDER_UNREACHABLE',
              `Le panel a repondu ${res.status} sur ${safeUrl(url)}.`,
            );
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        if (!text.trim()) return null;
        try {
          return JSON.parse(text);
        } catch {
          throw new AppError(
            502,
            'PROVIDER_UNREACHABLE',
            `Reponse non JSON du panel sur ${safeUrl(url)}.`,
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        lastError = err;
        if (attempt < this.retries) {
          const backoff = 500 * 2 ** attempt;
          this.onWarn(
            `Xtream ${String(params['action'] ?? 'account')} : tentative ${attempt + 1} echouee, nouvel essai dans ${backoff}ms.`,
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      } finally {
        clearTimeout(timer);
      }
    }

    const reason = describeFetchError(lastError);
    throw new AppError(
      502,
      'PROVIDER_UNREACHABLE',
      `Panel injoignable (${reason}) sur ${safeUrl(playerApiUrl(this.creds, params))}.`,
    );
  }

  private async parsed<T extends z.ZodTypeAny>(
    schema: T,
    params: Record<string, string | number>,
    label: string,
  ): Promise<z.infer<T>> {
    const raw = await this.fetchJson(params);
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        `Reponse ${label} inexploitable : ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '<racine>'} ${i.message}`)
          .join(' ; ')}`,
      );
    }
    return result.data;
  }

  private warnSkipped(label: string, skipped: number): void {
    if (skipped > 0) this.onWarn(`${label} : ${skipped} entree(s) illisible(s) ignoree(s).`);
  }

  // ------------------------------------------------------------- metadonnees

  /**
   * Verifie le compte. Certains panels renvoient `[]` ou `false` au lieu d'une
   * erreur quand les identifiants sont mauvais : on traite ces cas comme un echec
   * d'authentification explicite.
   */
  async getAccountInfo() {
    const raw = await this.fetchJson({});
    if (raw === null || raw === false || Array.isArray(raw)) {
      throw new AppError(
        401,
        'PROVIDER_AUTH_FAILED',
        'Le panel a repondu une valeur vide : identifiants probablement invalides.',
      );
    }
    const parsed = accountInfoSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.user_info) {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        'Reponse user_info inexploitable.',
      );
    }
    const info = parsed.data.user_info;
    if (info.auth === 0) {
      throw new AppError(
        401,
        'PROVIDER_AUTH_FAILED',
        info.message ?? 'Identifiants provider refuses par le panel.',
      );
    }
    return { userInfo: info, serverInfo: parsed.data.server_info ?? {} };
  }

  async getCategories(type: 'live' | 'vod' | 'series') {
    const action = { live: 'get_live_categories', vod: 'get_vod_categories', series: 'get_series_categories' }[type];
    const { items, skipped } = await this.parsed(categoryListSchema, { action }, action);
    this.warnSkipped(action, skipped);
    return items;
  }

  async getLiveStreams(categoryId?: string) {
    const params: Record<string, string> = { action: 'get_live_streams' };
    if (categoryId) params['category_id'] = categoryId;
    const { items, skipped } = await this.parsed(liveStreamListSchema, params, 'get_live_streams');
    this.warnSkipped('get_live_streams', skipped);
    return items;
  }

  async getVodStreams(categoryId?: string) {
    const params: Record<string, string> = { action: 'get_vod_streams' };
    if (categoryId) params['category_id'] = categoryId;
    const { items, skipped } = await this.parsed(vodStreamListSchema, params, 'get_vod_streams');
    this.warnSkipped('get_vod_streams', skipped);
    return items;
  }

  async getVodInfo(vodId: number) {
    return this.parsed(vodInfoSchema, { action: 'get_vod_info', vod_id: vodId }, 'get_vod_info');
  }

  async getSeries(categoryId?: string) {
    const params: Record<string, string> = { action: 'get_series' };
    if (categoryId) params['category_id'] = categoryId;
    const { items, skipped } = await this.parsed(seriesListSchema, params, 'get_series');
    this.warnSkipped('get_series', skipped);
    return items;
  }

  async getSeriesInfo(seriesId: number) {
    const info = await this.parsed(
      seriesInfoSchema,
      { action: 'get_series_info', series_id: seriesId },
      'get_series_info',
    );
    this.warnSkipped(`get_series_info(${seriesId})`, info.episodes.skipped);
    return info;
  }

  async getShortEpg(streamId: number, limit = 4) {
    const res = await this.parsed(
      shortEpgSchema,
      { action: 'get_short_epg', stream_id: streamId, limit },
      'get_short_epg',
    );
    return res.epg_listings.items;
  }

  // ------------------------------------------------------------ URLs de flux

  liveUrl(streamId: number, format: 'm3u8' | 'ts' = 'm3u8') {
    return liveUrl(this.creds, streamId, format);
  }

  movieUrl(streamId: number, containerExtension: string) {
    return movieUrl(this.creds, streamId, containerExtension);
  }

  episodeUrl(episodeXtreamId: string, containerExtension: string) {
    return episodeUrl(this.creds, episodeXtreamId, containerExtension);
  }

  xmltvUrl() {
    return xmltvUrl(this.creds);
  }
}

/**
 * Les categories adultes sont melangees aux autres : le seul signal disponible
 * est le nom de la categorie.
 */
const ADULT_PATTERNS = [
  /\bxxx\b/i,
  /\badult(e|es|s)?\b/i,
  /\+\s*18\b/,
  /\b18\s*\+/,
  /\bporn/i,
  /\berotic/i,
  /\bhot\s*tv\b/i,
];

export function isAdultCategoryName(name: string | null): boolean {
  if (!name) return false;
  return ADULT_PATTERNS.some((re) => re.test(name));
}
