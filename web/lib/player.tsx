'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PlayResponse } from '@iptv/shared';
import { PlayerOverlay } from '../components/PlayerOverlay';

export interface PlayTarget {
  itemType: 'stream' | 'episode';
  itemId: number;
  /** Titre affiche pendant le chargement, avant que le backend ne reponde. */
  label?: string;
}

interface PlayerState {
  play: (target: PlayTarget) => void;
  close: () => void;
  current: PlayTarget | null;
}

const PlayerContext = createContext<PlayerState | null>(null);

/**
 * Le lecteur est un overlay, pas une route : revenir en arriere doit rendre la
 * page exactement dans l'etat ou on l'a quittee (position de scroll, filtres).
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PlayTarget | null>(null);
  const [lastSession, setLastSession] = useState<PlayResponse | null>(null);

  const play = useCallback((target: PlayTarget) => {
    setLastSession(null);
    setCurrent(target);
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setLastSession(null);
  }, []);

  const value = useMemo(() => ({ play, close, current }), [play, close, current]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {current && (
        <PlayerOverlay
          target={current}
          onClose={close}
          onSession={setLastSession}
          session={lastSession}
        />
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer doit etre utilise sous <PlayerProvider>.');
  return ctx;
}
