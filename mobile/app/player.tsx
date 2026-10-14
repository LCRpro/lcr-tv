import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  channelTitle,
  splitChannelQuality,
  splitLanguage,
  workTitle,
  type ChannelDetail,
  type PlayResponse,
  type SlotConflictDetails,
  type Variant,
} from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { colors, radius, styles } from '../lib/theme';
import { Button, Loading, formatClock } from '../components/ui';
import { Focusable } from '../components/Focusable';

/** On renouvelle le ticket bien avant son expiration plutot que de la subir. */
const RENEW_MARGIN_MS = 2 * 60 * 1000;
const PROGRESS_INTERVAL_MS = 10_000;

export default function PlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    itemType: string;
    itemId: string;
    label?: string;
    localUri?: string;
  }>();
  const itemType = params.itemType === 'episode' ? 'episode' : 'stream';
  const itemId = Number(params.itemId);
  // Lecture hors-ligne : un fichier déjà sur l'appareil, sans serveur ni créneau.
  const localUri = typeof params.localUri === 'string' && params.localUri ? params.localUri : null;

  const [session, setSession] = useState<PlayResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const ticketRef = useRef<string | null>(null);
  const sessionRef = useRef<PlayResponse | null>(null);
  sessionRef.current = session;

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 1;
  });

  // ------------------------------------------------------------- ouverture

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSession(null);
    setChannel(null);

    /*
     * Mode `direct` : le backend repond une redirection 302 vers l'URL Xtream.
     * ExoPlayer et AVPlayer lisent .ts et .mkv nativement, et la bande passante
     * ne transite pas par le serveur.
     *
     * Compromis assume : cette redirection expose les identifiants du provider
     * a qui inspecte le trafic de l'application. Acceptable pour un cercle de
     * proches ; sinon passer `mode: 'proxy'` ici et perdre ce gain.
     */
    // Hors-ligne : pas de session serveur, pas de créneau — on lit le fichier.
    if (localUri) {
      return () => {
        cancelled = true;
      };
    }

    api
      .post<PlayResponse>(`/api/play/${itemType}/${itemId}`, { mode: 'direct' })
      .then((res) => {
        if (cancelled) return;
        ticketRef.current = res.ticket;
        setSession(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err : null);
      });

    return () => {
      cancelled = true;
    };
  }, [itemType, itemId, attempt, localUri]);

  // Lecture d'un fichier local : on le monte directement, sans attendre de session.
  useEffect(() => {
    if (!localUri) return;
    player.replace({ uri: localUri });
    player.play();
  }, [localUri, player]);

  // --------------------------------------------------------- fiche de chaine

  /*
   * Qualites disponibles et programme en cours : une chaine n'a pas de page a
   * elle, ces informations n'existent nulle part avant l'ouverture du lecteur.
   * Elles ne conditionnent pas la lecture, on les charge donc a cote.
   */
  useEffect(() => {
    if (session?.kind !== 'live') return;
    let cancelled = false;
    api
      .get<ChannelDetail>(`/api/live/${itemId}`)
      .then((res) => {
        if (!cancelled) setChannel(res);
      })
      .catch(() => {
        // Sans fiche, le lecteur reste utilisable : titre brut, pas de choix.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.kind, itemId]);

  // -------------------------------------------------------- montage du flux

  useEffect(() => {
    if (!session) return;
    player.replace({ uri: session.url });
    if (session.resumeAtSec > 0) player.currentTime = session.resumeAtSec;
    player.play();
  }, [session, player]);

  // -------------------------------------------------------------- heartbeat

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      api.post('/api/play/heartbeat', { slotId: session.slotId }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) setError(err);
      });
    }, session.heartbeatIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [session]);

  // ----------------------------------------------------- liberation du slot

  useEffect(() => {
    if (!session) return;
    const slotId = session.slotId;
    return () => {
      void api.post('/api/play/release', { slotId }).catch(() => {});
    };
  }, [session]);

  // --------------------------------------------- renouvellement silencieux

  const renew = useCallback(async () => {
    const ticket = ticketRef.current;
    if (!ticket) return;
    try {
      const res = await api.post<{ ticket: string; url: string }>('/api/play/renew', { ticket });
      ticketRef.current = res.ticket;
      const at = player.currentTime;
      const wasPlaying = player.playing;
      player.replace({ uri: res.url });
      player.currentTime = at;
      if (wasPlaying) player.play();
    } catch {
      // Echec du renouvellement : la lecture continue jusqu'a expiration reelle.
    }
  }, [player]);

  useEffect(() => {
    if (!session) return;
    const delay = Math.max(
      15_000,
      new Date(session.expiresAt).getTime() - Date.now() - RENEW_MARGIN_MS,
    );
    const timer = setTimeout(() => void renew(), delay);
    return () => clearTimeout(timer);
  }, [session, renew]);

  // ------------------------------------------------------------ progression

  useEffect(() => {
    if (!session || session.kind === 'live') return;
    const type = session.kind === 'episode' ? 'episode' : 'stream';

    const send = () => {
      const position = player.currentTime;
      const duration = player.duration;
      if (!position || !Number.isFinite(duration) || duration <= 0) return;
      void api
        .patch('/api/me/progress', {
          itemType: type,
          itemId,
          positionSec: Math.floor(position),
          durationSec: Math.floor(duration),
        })
        .catch(() => {});
    };

    const timer = setInterval(send, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      send();
    };
  }, [session, player, itemId]);

  // ------------------------------------------------------ changement de piste

  /**
   * Bascule vers une autre declinaison de la meme chaine.
   *
   * On libere le slot **avant** de redemander la lecture, et on attend la
   * reponse : avec un abonnement a une seule connexion, demander la nouvelle
   * qualite pendant que l'ancienne tient encore le slot echouerait sur sa
   * propre lecture.
   */
  const switchVariant = useCallback(
    async (variant: Variant) => {
      if (variant.id === itemId) return;
      const current = sessionRef.current;
      if (current) {
        await api.post('/api/play/release', { slotId: current.slotId }).catch(() => {});
      }
      router.replace({
        pathname: '/player',
        params: { itemType: 'stream', itemId: String(variant.id), label: variant.name },
      });
    },
    [itemId, router],
  );

  // -------------------------------------------------------- commandes maison

  /*
   * Les commandes ne sont plus celles du système : elles portent la charte.
   *
   * On suit l'état du lecteur à la volée (quelques fois par seconde, assez pour
   * une barre fluide sans peser), et les commandes s'effacent seules après un
   * court répit — sauf en pause, où l'on garde tout sous les yeux. Toucher
   * l'image les rappelle ou les cache.
   */
  const [controls, setControls] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [trackW, setTrackW] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (player.playing) setControls(false);
    }, 3800);
  }, [player]);

  useEffect(() => {
    poke();
    const id = setInterval(() => {
      setPlaying(player.playing);
      if (!scrubbing) setPosition(player.currentTime || 0);
      const d = player.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    }, 250);
    return () => {
      clearInterval(id);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [player, scrubbing, poke]);

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    poke();
  }, [player, poke]);

  const seekBy = useCallback(
    (delta: number) => {
      const d = player.duration || 0;
      const next = Math.max(0, Math.min(d || Infinity, (player.currentTime || 0) + delta));
      player.currentTime = next;
      setPosition(next);
      poke();
    },
    [player, poke],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      const d = player.duration || 0;
      if (d <= 0) return;
      const t = Math.max(0, Math.min(d, ratio * d));
      setPosition(t);
      player.currentTime = t;
    },
    [player],
  );

  const scrub = useCallback(
    (e: GestureResponderEvent) => {
      if (trackW <= 0) return;
      const x = e.nativeEvent.locationX;
      seekToRatio(x / trackW);
    },
    [trackW, seekToRatio],
  );

  // ----------------------------------------------------------------- rendu

  if (error) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
        <PlayerError error={error} />
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button label="Réessayer" primary onPress={() => setAttempt((a) => a + 1)} />
          <Button label="Fermer" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const isLive = session?.kind === 'live';
  const rawLabel = session?.label ?? params.label ?? '';
  const { tag, title: withoutLang } = splitLanguage(rawLabel);
  const heading = isLive ? channelTitle(rawLabel) : workTitle(rawLabel);
  const quality = isLive ? splitChannelQuality(withoutLang).quality : null;
  const variants = channel?.variants ?? [];
  const now = channel?.now ?? null;

  const pct = duration > 0 ? Math.min(1, position / duration) : 0;
  const remaining = duration > 0 ? Math.max(0, duration - position) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        style={{ flex: 1 }}
        player={player}
        nativeControls={false}
        allowsPictureInPicture
        contentFit="contain"
      />

      {/* Toucher l'image rappelle ou masque les commandes. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (controls ? setControls(false) : poke())}
      />

      {controls ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Haut : fermer, titre, qualité, direct, déclinaisons. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.72)', 'transparent']}
            style={cx.top}
            pointerEvents="box-none"
          >
            <View style={cx.topRow}>
              <Focusable onPress={() => router.back()} hitSlop={10} style={cx.round}>
                <Ionicons name="chevron-down" size={24} color="#fff" />
              </Focusable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cx.title} numberOfLines={1}>
                  {tag ? `${tag.flag} ` : ''}
                  {heading || 'Lecture'}
                </Text>
                {isLive && now ? (
                  <Text style={cx.sub} numberOfLines={1}>
                    {formatClock(now.startAt)} · {now.title}
                  </Text>
                ) : null}
              </View>
              {quality ? (
                <View style={overlay.tag}>
                  <Text style={overlay.tagText}>{quality}</Text>
                </View>
              ) : null}
              {isLive ? (
                <View style={overlay.live}>
                  <View style={overlay.liveDot} />
                  <Text style={overlay.liveText}>Direct</Text>
                </View>
              ) : null}
            </View>

            {variants.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingTop: 12 }}
              >
                {variants.map((variant) => {
                  const label =
                    variant.quality ?? splitChannelQuality(variant.name).quality ?? 'Standard';
                  const active = variant.id === itemId;
                  return (
                    <Focusable
                      key={variant.id}
                      onPress={() => void switchVariant(variant)}
                      style={[overlay.chip, active && overlay.chipActive]}
                    >
                      <Text style={[overlay.chipText, active && overlay.chipActiveText]}>
                        {label}
                      </Text>
                    </Focusable>
                  );
                })}
              </ScrollView>
            ) : null}
          </LinearGradient>

          {/* Centre : -10 s, lecture/pause, +10 s (le saut n'a de sens qu'en VOD). */}
          {session ? (
            <View style={cx.center} pointerEvents="box-none">
              {!isLive ? (
                <Focusable onPress={() => seekBy(-10)} style={cx.seek}>
                  <Ionicons name="play-back" size={22} color="#fff" />
                  <Text style={cx.seekN}>10</Text>
                </Focusable>
              ) : null}
              <Focusable onPress={togglePlay} style={cx.play}>
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={32}
                  color={colors.onAccent}
                  style={playing ? undefined : { marginLeft: 3 }}
                />
              </Focusable>
              {!isLive ? (
                <Focusable onPress={() => seekBy(10)} style={cx.seek}>
                  <Ionicons name="play-forward" size={22} color="#fff" />
                  <Text style={cx.seekN}>10</Text>
                </Focusable>
              ) : null}
            </View>
          ) : null}

          {/* Bas : barre de progression (VOD) ou mention directe. */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={cx.bottom}
            pointerEvents="box-none"
          >
            {!isLive && duration > 0 ? (
              <>
                <View style={cx.timeRow}>
                  <Text style={cx.time}>{fmt(position)}</Text>
                  <Text style={cx.time}>-{fmt(remaining)}</Text>
                </View>
                <View
                  style={cx.track}
                  onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => {
                    setScrubbing(true);
                    scrub(e);
                  }}
                  onResponderMove={scrub}
                  onResponderRelease={(e) => {
                    scrub(e);
                    setScrubbing(false);
                    poke();
                  }}
                  onResponderTerminate={() => {
                    setScrubbing(false);
                    poke();
                  }}
                >
                  <View style={cx.trackBg} />
                  <View style={[cx.trackFill, { width: `${pct * 100}%` }]} />
                  <View style={[cx.thumb, { left: `${pct * 100}%` }]} />
                </View>
              </>
            ) : isLive ? (
              <View style={cx.liveBar}>
                <View style={overlay.liveDot} />
                <Text style={cx.liveNow}>En direct</Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>
      ) : null}

      {!session && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
          <Loading label="Ouverture…" />
        </View>
      )}
    </View>
  );
}

/** mm:ss, ou h:mm:ss au-delà de l'heure. */
function fmt(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const overlay = {
  bar: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' as const },
  sub: { color: 'rgba(255,255,255,0.68)', fontSize: 12, marginTop: 2 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  tagText: { color: '#fff', fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.5 },
  live: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,77,90,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,90,0.45)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: '#ff8f97', fontSize: 10.5, fontWeight: '700' as const },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  // L'accent est l'inversion encre/papier : sur fond d'accent, le libelle
  // prend l'encre du fond de page.
  chipActiveText: { color: colors.onAccent },
  chipText: { color: '#fff', fontSize: 12.5, fontWeight: '600' as const },
};

/*
 * Les commandes maison, sobres : un voile en haut et en bas pour que le texte
 * tienne sur l'image, le bleu de la marque réservé au seul bouton de lecture
 * (l'action principale), le reste en blanc translucide. Pas de halo ni de néon.
 */
const cx = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 26 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontFamily: 'Outfit', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  sub: { color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter', fontSize: 12.5, marginTop: 2 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  seek: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekN: { color: '#fff', fontFamily: 'Outfit', fontSize: 10, fontWeight: '700', marginTop: 1 },
  play: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 34, paddingBottom: 22 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  time: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { height: 26, justifyContent: 'center' },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginLeft: -7, top: 6 },
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveNow: { color: '#fff', fontFamily: 'Outfit', fontSize: 13, fontWeight: '700' },
});

function PlayerError({ error }: { error: ApiError }) {
  if (error.code === 'SLOT_LIMIT_REACHED') {
    const details = error.details as SlotConflictDetails | undefined;
    return (
      <View>
        <Text style={styles.h1}>Connexions occupées</Text>
        <Text style={styles.dim}>
          L&apos;abonnement « {details?.providerName ?? '?'} » autorise{' '}
          {details?.maxConnections ?? '?'} lecture(s) en même temps.
        </Text>
        <View style={{ marginTop: 12, gap: 4 }}>
          {(details?.occupants ?? []).map((o) => (
            <Text key={`${o.userEmail}-${o.since}`} style={styles.text}>
              • {o.userEmail} regarde {o.itemLabel}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.h1}>Lecture impossible</Text>
      <Text style={[styles.dim, { color: colors.dim }]}>{error.message}</Text>
    </View>
  );
}
