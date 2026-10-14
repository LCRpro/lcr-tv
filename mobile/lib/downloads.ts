import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import type { PlayResponse } from '@iptv/shared';
import { api } from './api';

/**
 * Les téléchargements — regarder hors-ligne.
 *
 * On récupère l'URL directe du fichier par le même chemin que la lecture
 * (`/api/play`, mode direct), puis on l'enregistre sur l'appareil. Un manifeste
 * JSON garde ce qu'on a pris : titre, affiche, chemin local, avancement. Tout
 * vit sur l'appareil — rien ne part au serveur, et le web (sans système de
 * fichiers) ne fait rien : `DOWNLOADS_OK` est faux, les boutons s'effacent.
 */
export const DOWNLOADS_OK = Platform.OS !== 'web' && Boolean(FS.documentDirectory);

export type DownloadKind = 'movie' | 'episode';
export type DownloadStatus = 'downloading' | 'done' | 'error';

export interface DownloadItem {
  key: string;
  kind: DownloadKind;
  id: number;
  title: string;
  parentTitle: string | null;
  posterUrl: string | null;
  localUri: string;
  status: DownloadStatus;
  progress: number;
  totalBytes: number;
  createdAt: string;
}

const DIR = `${FS.documentDirectory ?? ''}downloads/`;
const MANIFEST = `${DIR}manifest.json`;

let cache: Record<string, DownloadItem> | null = null;
const listeners = new Set<() => void>();
const resumables = new Map<string, FS.DownloadResumable>();

const notify = () => {
  for (const l of listeners) l();
};

export const keyOf = (kind: DownloadKind, id: number) => `${kind}-${id}`;

async function ensureDir(): Promise<void> {
  const info = await FS.getInfoAsync(DIR);
  if (!info.exists) await FS.makeDirectoryAsync(DIR, { intermediates: true });
}

async function load(): Promise<Record<string, DownloadItem>> {
  if (cache) return cache;
  if (!DOWNLOADS_OK) {
    cache = {};
    return cache;
  }
  try {
    await ensureDir();
    const info = await FS.getInfoAsync(MANIFEST);
    cache = info.exists ? (JSON.parse(await FS.readAsStringAsync(MANIFEST)) as typeof cache) : {};
  } catch {
    cache = {};
  }
  return cache ?? {};
}

async function persist(): Promise<void> {
  if (!DOWNLOADS_OK || !cache) return;
  try {
    await ensureDir();
    await FS.writeAsStringAsync(MANIFEST, JSON.stringify(cache));
  } catch {
    // Un échec d'écriture du manifeste ne doit pas interrompre le reste.
  }
}

interface Meta {
  kind: DownloadKind;
  id: number;
  title: string;
  parentTitle?: string | null;
  posterUrl?: string | null;
}

const baseItem = (meta: Meta, key: string, localUri: string): DownloadItem => ({
  key,
  kind: meta.kind,
  id: meta.id,
  title: meta.title,
  parentTitle: meta.parentTitle ?? null,
  posterUrl: meta.posterUrl ?? null,
  localUri,
  status: 'downloading',
  progress: 0,
  totalBytes: 0,
  createdAt: new Date().toISOString(),
});

export async function startDownload(meta: Meta): Promise<void> {
  if (!DOWNLOADS_OK) return;
  const map = await load();
  const key = keyOf(meta.kind, meta.id);
  if (map[key] && map[key]!.status !== 'error') return;

  // L'URL directe du fichier et son extension, via le chemin de la lecture.
  const playType = meta.kind === 'movie' ? 'stream' : 'episode';
  let url = '';
  let ext = 'mp4';
  try {
    const res = await api.post<PlayResponse>(`/api/play/${playType}/${meta.id}`, { mode: 'direct' });
    url = res.url;
    ext = res.containerExtension || 'mp4';
    // Un téléchargement ne doit pas occuper une connexion de lecture : on
    // libère le créneau aussitôt l'URL obtenue.
    void api.post('/api/play/release', { slotId: res.slotId }).catch(() => {});
  } catch {
    map[key] = { ...baseItem(meta, key, ''), status: 'error' };
    cache = map;
    await persist();
    notify();
    return;
  }

  const localUri = `${DIR}${key}.${ext}`;
  map[key] = baseItem(meta, key, localUri);
  cache = map;
  await persist();
  notify();

  const resumable = FS.createDownloadResumable(url, localUri, {}, (p) => {
    const total = p.totalBytesExpectedToWrite || 0;
    const item = cache?.[key];
    if (!item) return;
    item.totalBytes = total;
    item.progress = total > 0 ? p.totalBytesWritten / total : 0;
    notify();
  });
  resumables.set(key, resumable);

  try {
    await resumable.downloadAsync();
    const item = cache?.[key];
    if (item) {
      item.status = 'done';
      item.progress = 1;
    }
  } catch {
    const item = cache?.[key];
    if (item) item.status = 'error';
  } finally {
    resumables.delete(key);
    await persist();
    notify();
  }
}

export async function removeDownload(key: string): Promise<void> {
  if (!DOWNLOADS_OK) return;
  const map = await load();
  const resumable = resumables.get(key);
  if (resumable) {
    try {
      await resumable.pauseAsync();
    } catch {
      // déjà arrêté
    }
    resumables.delete(key);
  }
  const item = map[key];
  if (item) {
    try {
      await FS.deleteAsync(item.localUri, { idempotent: true });
    } catch {
      // le fichier a pu ne jamais exister
    }
    delete map[key];
  }
  cache = map;
  await persist();
  notify();
}

/** Le chemin local d'un contenu téléchargé, ou `null` s'il ne l'est pas (encore). */
export function localUriFor(kind: DownloadKind, id: number): string | null {
  const item = cache?.[keyOf(kind, id)];
  return item && item.status === 'done' ? item.localUri : null;
}

function snapshot(): DownloadItem[] {
  return cache
    ? Object.values(cache).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
}

export function useDownloads(): DownloadItem[] {
  const [items, setItems] = useState<DownloadItem[]>(snapshot());
  useEffect(() => {
    let active = true;
    const sync = () => {
      if (active) setItems(snapshot());
    };
    listeners.add(sync);
    void load().then(sync);
    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, []);
  return items;
}

export function useDownload(kind: DownloadKind, id: number): DownloadItem | null {
  const items = useDownloads();
  return items.find((i) => i.key === keyOf(kind, id)) ?? null;
}
