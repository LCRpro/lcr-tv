import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CurrentUser, LoginResponse, Profile } from '@iptv/shared';
import { api, ApiError, setToken } from './api';

interface SessionState {
  user: CurrentUser | null;
  /** Profil actif. Le catalogue y rattache favoris, liste et progression. */
  profile: Profile | null;
  profiles: Profile[];
  selectProfile: (id: number) => Promise<void>;
  /** Repose « qui regarde ? » : on quitte le profil sans se deconnecter. */
  leaveProfile: () => Promise<void>;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{
        user: CurrentUser;
        profile: Profile | null;
        profiles: Profile[];
      }>('/api/auth/me');
      setUser(res.user);
      setProfiles(res.profiles);
      /*
       * Un seul profil : on le choisit sans rien demander.
       *
       * Poser « qui regarde ? » a quelqu'un qui n'a qu'une reponse possible est
       * un ecran de trop. Des qu'il y en a plusieurs, l'application affiche le
       * selecteur — c'est `profile === null` qui le declenche.
       */
      let active = res.profile;
      if (!active && res.profiles.length === 1) {
        active = await api.post<Profile>(`/api/profiles/${res.profiles[0]!.id}/select`);
      }
      setProfile(active);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<LoginResponse>('/api/auth/login', {
        email,
        password,
        transport: 'bearer',
        deviceLabel: 'Application mobile',
      });
      if (res.token) await setToken(res.token);
      setUser(res.user);
      // Le token vient d'etre pose : /me dit quels profils existent et en
      // choisit un si le compte n'en a qu'un.
      await refresh();
    },
    [refresh],
  );

  const selectProfile = useCallback(async (id: number) => {
    setProfile(await api.post<Profile>(`/api/profiles/${id}/select`));
  }, []);

  const leaveProfile = useCallback(async () => {
    try {
      await api.post('/api/profiles/leave');
    } finally {
      // Meme si l'appel echoue, on repose la question cote app : c'est `profile
      // === null` qui ramene le selecteur via le Gate.
      setProfile(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Session deja invalide cote serveur : on nettoie quand meme le trousseau.
    }
    await setToken(null);
    setUser(null);
    setProfile(null);
    setProfiles([]);
  }, []);

  const value = useMemo(
    () => ({ user, profile, profiles, loading, login, logout, refresh, selectProfile, leaveProfile }),
    [user, profile, profiles, loading, login, logout, refresh, selectProfile, leaveProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit etre utilise sous <SessionProvider>.');
  return ctx;
}
