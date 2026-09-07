import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
  const params = useLocalSearchParams<{ itemType: string; itemId: string; label?: string }>();
  const itemType = params.itemType === 'episode' ? 'episode' : 'stream';
  const itemId = Number(params.itemId);

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
  }, [itemType, itemId, attempt]);

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

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        style={{ flex: 1 }}
        player={player}
        nativeControls
        allowsPictureInPicture
        fullscreenOptions={{ enable: true }}
        contentFit="contain"
      />

      {/* Bandeau d'information. Les commandes de lecture restent celles du
          systeme : elles sont deja au bon endroit et repondent au doigt. */}
      <View style={overlay.bar} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Focusable onPress={() => router.back()} hitSlop={14}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Retour</Text>
          </Focusable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={overlay.title} numberOfLines={1}>
              {tag ? `${tag.flag} ` : ''}
              {heading || 'Lecture'}
            </Text>
            {isLive && now ? (
              <Text style={overlay.sub} numberOfLines={1}>
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
            contentContainerStyle={{ gap: 8, paddingTop: 10 }}
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
                  <Text style={[overlay.chipText, active && overlay.chipActiveText]}>{label}</Text>
                </Focusable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {!session && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            justifyContent: 'center',
          }}
        >
          <Loading label="Ouverture…" />
        </View>
      )}
    </View>
  );
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
