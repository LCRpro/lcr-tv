'use client';

import { useEffect, useState } from 'react';
import type { EpgEntry } from '@iptv/shared';
import { api, qs } from './api';

/** Rythme de la barre d'avancement : la minute ne se voit pas, la demie si. */
const ELAPSED_TICK_MS = 30_000;
/** Une relecture serveur tous les quatre battements, soit deux minutes. */
const NOW_EVERY_TICKS = 4;

/**
 * Le programme en cours des chaînes affichées, tenu à jour.
 *
 * Il arrive avec la page et n'en bougeait plus : à 21 h les vignettes
 * annonçaient encore celui de 20 h, et la barre d'avancement restait immobile.
 * Deux rythmes se superposent — un battement qui fait avancer les barres sans
 * rien demander au serveur, et une relecture toutes les deux minutes, parce que
 * le titre ne change qu'aux frontières de programme.
 *
 * Rien ne tourne quand l'onglet est masqué : c'est du réseau et du rendu pour un
 * écran que personne ne regarde, et le retour de visibilité rattrape tout.
 *
 * Le hook renvoie ce qu'il sait ; l'appelant garde ce que le serveur lui avait
 * donné au chargement pour les chaînes non encore relues. Une relecture ratée
 * ne vide rien — le programme d'avant vaut mieux qu'une grille blanche.
 */
export function useNowPlaying(ids: number[]): Map<number, EpgEntry | null> {
  const [now, setNow] = useState<Map<number, EpgEntry | null>>(() => new Map());
  const [tick, setTick] = useState(0);

  // Une chaîne de caractères plutôt que le tableau : une dépendance de
  // `useEffect` se compare par référence, et un tableau reconstruit à chaque
  // rendu relancerait la relecture sans fin.
  const key = ids.join(',');

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => setTick((t) => t + 1), ELAPSED_TICK_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        setTick((t) => t + 1);
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [key]);

  const refreshAt = Math.floor(tick / NOW_EVERY_TICKS);
  useEffect(() => {
    if (!key || refreshAt === 0) return;
    let cancelled = false;
    api
      .get<{ items: Record<string, EpgEntry> }>('/api/live/now' + qs({ ids: key }))
      .then((res) => {
        if (cancelled) return;
        const next = new Map<number, EpgEntry | null>();
        for (const id of key.split(',')) next.set(Number(id), res.items[id] ?? null);
        setNow(next);
      })
      .catch(() => {
        // Le programme affiché reste celui d'avant : mieux qu'une grille vidée.
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshAt]);

  return now;
}
