import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CurrentUser, HomePayload, LoginResponse, Profile, SyncStatus } from '@iptv/shared';
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
  /**
   * Le catalogue du profil qu'on vient de choisir est en cours de chargement.
   *
   * Vrai depuis l'instant du choix jusqu'à ce que l'accueil ait de quoi
   * s'afficher : le Gate montre alors l'écran de marque, pour ne pas révéler
   * une grille vide qui se remplit ensuite par à-coups.
   */
  warming: boolean;
  /** Le message affiché pendant l'attente — progression de la synchronisation. */
  warmupMessage: string;
  login: (email: string, password: string) => Promise<void>;
  /** Crée un compte et ouvre la session dans la foulée (transport bearer). */
  signup: (email: string, password: string, profileName?: string, code?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SYNC_PHASE: Record<string, string> = {
  idle: 'préparation',
  categories: 'catégories',
  live: 'chaînes',
  vod: 'films',
  series: 'séries',
  done: 'presque prêt',
  failed: 'échec',
};

/** Le message d'attente, tiré de l'état de la synchronisation en cours. */
function syncWaitMessage(s: SyncStatus): string {
  const got = s.counts.vod + s.counts.series + s.counts.live;
  const phase = SYNC_PHASE[s.phase] ?? s.phase;
  return got > 0
    ? `Synchronisation du catalogue… ${phase} · ${got} reçus`
    : `Synchronisation du catalogue… ${phase}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [warming, setWarming] = useState(false);
  const [warmupMessage, setWarmupMessage] = useState('Préparation de votre catalogue…');

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
    setWarming(true);
    setWarmupMessage('Préparation de votre catalogue…');
    try {
      setProfile(await api.post<Profile>(`/api/profiles/${id}/select`));

      /*
       * On ne révèle l'app que lorsqu'il y a de quoi la remplir.
       *
       * Si le catalogue n'est pas encore synchronisé, on reste sur l'écran de
       * marque : on lance la synchronisation si rien ne tourne, puis on suit sa
       * progression jusqu'à ce qu'il y ait du contenu. On ne bloque pas pour
       * rien — un compte sans abonnement, une erreur réseau ou une synchro qui
       * échoue rendent la main à l'accueil, qui affiche alors l'état adéquat.
       */
      let kicked = false;
      for (let i = 0; i < 240; i++) {
        const home = await api.get<HomePayload>('/api/home').catch(() => null);
        if (!home) break; // réseau : l'accueil reprendra
        if (home.noProvider || !home.catalogEmpty) break; // rien à attendre, ou prêt

        if (!home.sync?.running) {
          if (!kicked) {
            // Rien ne tourne et le catalogue est vide : on déclenche la synchro.
            kicked = true;
            setWarmupMessage('Démarrage de la synchronisation…');
            await api.post('/api/providers/sync').catch(() => {});
            await wait(1500);
            continue;
          }
          break; // relancée une fois sans succès : on rend la main à l'accueil
        }

        setWarmupMessage(syncWaitMessage(home.sync));
        await wait(2500);
      }
    } finally {
      setWarming(false);
      setWarmupMessage('Préparation de votre catalogue…');
    }
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
    () => ({ user, profile, profiles, loading, warming, warmupMessage, login, signup, logout, refresh, selectProfile, leaveProfile }),
    [user, profile, profiles, loading, warming, warmupMessage, login, signup, logout, refresh, selectProfile, leaveProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit etre utilise sous <SessionProvider>.');
  return ctx;
}
