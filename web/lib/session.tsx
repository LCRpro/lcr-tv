'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CurrentUser, Profile } from '@iptv/shared';
import { api, ApiError } from './api';

interface MeResponse {
  user: CurrentUser;
  profile: Profile | null;
  profiles: Profile[];
  sessionId: number;
}

interface SessionState {
  user: CurrentUser | null;
  /** Le profil choisi pour cette session. Nul tant que personne n'a répondu
   *  à « qui regarde ? » — l'application mène alors au sélecteur. */
  profile: Profile | null;
  profiles: Profile[];
  sessionId: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
  selectProfile: (id: number) => Promise<void>;
  leaveProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      // Compte, profil courant et liste des profils arrivent ensemble : en
      // deux requêtes, l'écran clignotait du sélecteur au catalogue.
      const res = await api.get<MeResponse>('/api/auth/me');
      setUser(res.user);
      setProfile(res.profile);
      setProfiles(res.profiles);
      setSessionId(res.sessionId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setProfile(null);
        setProfiles([]);
        setSessionId(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectProfile = useCallback(async (id: number) => {
    const chosen = await api.post<Profile>(`/api/profiles/${id}/select`);
    setProfile(chosen);
  }, []);

  /*
   * Changer de profil sans se déconnecter.
   *
   * La session reste ouverte : on ne redemande pas le mot de passe pour passer
   * la télécommande à quelqu'un d'autre du foyer.
   */
  const leaveProfile = useCallback(async () => {
    await api.post('/api/profiles/leave');
    setProfile(null);
    router.replace('/profils');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      setProfile(null);
      setProfiles([]);
      setSessionId(null);
      router.replace('/login');
    }
  }, [router]);

  return (
    <SessionContext.Provider
      value={{
        user,
        profile,
        profiles,
        sessionId,
        loading,
        refresh,
        selectProfile,
        leaveProfile,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit etre utilise sous <SessionProvider>.');
  return ctx;
}
