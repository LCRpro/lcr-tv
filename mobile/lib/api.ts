import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type { ApiErrorBody, ErrorCode } from '@iptv/shared';

/**
 * L'URL du backend n'est pas localhost cote telephone : elle est configuree
 * dans app.json (`extra.apiUrl`) et doit pointer vers l'IP de la machine hote
 * sur le reseau local.
 */
export const API_URL: string =
  (Constants.expoConfig?.extra?.['apiUrl'] as string | undefined) ?? 'http://localhost:3001';

const TOKEN_KEY = 'iptv_session_token';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

/**
 * Le token vit dans le trousseau du systeme, pas dans AsyncStorage : c'est un
 * secret de session, au meme titre qu'un mot de passe.
 *
 * Sur le web, il n'y a pas de trousseau : `expo-secure-store` y rejette tout
 * appel. On retombe donc sur `localStorage`, sans quoi *chaque* requete
 * echouerait avant meme le fetch — le token n'y est pas aussi bien garde que
 * dans un trousseau natif, mais le web est une prevision/secours, pas la cible.
 */
let cachedToken: string | null = null;
const onWeb = Platform.OS === 'web';

async function readToken(): Promise<string | null> {
  if (onWeb) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeToken(token: string | null): Promise<void> {
  if (onWeb) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Stockage indisponible (navigation privee) : le cache memoire suffit a
      // la session courante.
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken;
  cachedToken = await readToken();
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  await writeToken(token);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      // Mobile : transport par header, pas par cookie. Le backend accepte les deux.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const body = payload as ApiErrorBody | null;
    if (body?.error?.code) throw new ApiError(res.status, body);
    throw new ApiError(res.status, {
      error: { code: 'INTERNAL', message: `Erreur ${res.status}.` },
    });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
