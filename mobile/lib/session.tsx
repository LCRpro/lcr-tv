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
  /** Crée un compte et ouvre la session dans la foulée (transport bearer). */
  signup: (email: string, password: string, profileName?: string, code?: string) => Promise<void>;
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
       * On demande toujours « qui regarde ? » a la connexion, meme s'il n'y a
       * qu'un profil : c'est l'entree du foyer, et un repere clair sur qui est
       * actif. On ne choisit donc rien d'office — `profile === null` laisse le
       * Gate afficher le selecteur, jusqu'a ce que l'utilisateur choisisse.
       */
      setProfile(res.profile);
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

  const signup = useCallback(
    async (email: string, password: string, profileName?: string, code?: string) => {
      const res = await api.post<LoginResponse>('/api/auth/signup', {
        email,
        password,
        profileName,
        code,
        transport: 'bearer',
        deviceLabel: 'Application mobile',
      });
      if (res.token) await setToken(res.token);
      setUser(res.user);
      // Un compte neuf n'a qu'un profil : /me le choisit seul, et l'app ouvre
      // directement sur l'accueil plutot que sur « qui regarde ? ».
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
    () => ({ user, profile, profiles, loading, login, signup, logout, refresh, selectProfile, leaveProfile }),
    [user, profile, profiles, loading, login, signup, logout, refresh, selectProfile, leaveProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit etre utilise sous <SessionProvider>.');
  return ctx;
}
