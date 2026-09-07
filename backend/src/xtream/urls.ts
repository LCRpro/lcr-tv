/** Construction des URLs Xtream. Tout ce qui sort d'ici contient des credentials. */

export interface XtreamCredentials {
  baseUrl: string;
  username: string;
  password: string;
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Un utilisateur colle souvent l'URL complete du panel : on ne garde que l'origine.
  const url = new URL(withScheme);
  return `${url.protocol}//${url.host}`;
}

export function playerApiUrl(
  creds: XtreamCredentials,
  params: Record<string, string | number> = {},
): string {
  const url = new URL(`${creds.baseUrl}/player_api.php`);
  url.searchParams.set('username', creds.username);
  url.searchParams.set('password', creds.password);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function xmltvUrl(creds: XtreamCredentials): string {
  const url = new URL(`${creds.baseUrl}/xmltv.php`);
  url.searchParams.set('username', creds.username);
  url.searchParams.set('password', creds.password);
  return url.toString();
}

const enc = encodeURIComponent;

/**
 * Live : `.m3u8` quand on veut HLS (proxy web), `.ts` en flux continu.
 * Les panels servent les deux, mais seul le HLS est reecrit par le proxy.
 */
export function liveUrl(
  creds: XtreamCredentials,
  streamId: number,
  format: 'm3u8' | 'ts' = 'm3u8',
): string {
  return `${creds.baseUrl}/live/${enc(creds.username)}/${enc(creds.password)}/${streamId}.${format}`;
}

export function movieUrl(
  creds: XtreamCredentials,
  streamId: number,
  containerExtension: string,
): string {
  const ext = containerExtension.replace(/^\./, '') || 'mp4';
  return `${creds.baseUrl}/movie/${enc(creds.username)}/${enc(creds.password)}/${streamId}.${ext}`;
}

export function episodeUrl(
  creds: XtreamCredentials,
  episodeXtreamId: string,
  containerExtension: string,
): string {
  const ext = containerExtension.replace(/^\./, '') || 'mp4';
  return `${creds.baseUrl}/series/${enc(creds.username)}/${enc(creds.password)}/${enc(episodeXtreamId)}.${ext}`;
}

/** Containers que `<video>` ne sait pas lire : on previent au lieu de lancer un lecteur noir. */
const BROWSER_UNPLAYABLE = new Set(['mkv', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', 'divx']);

export function isBrowserPlayable(containerExtension: string | null): boolean {
  if (!containerExtension) return true;
  return !BROWSER_UNPLAYABLE.has(containerExtension.replace(/^\./, '').toLowerCase());
}
