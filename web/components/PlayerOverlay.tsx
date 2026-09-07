'use client';

import { Button } from './kit';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type Hls from 'hls.js';
import {
  channelTitle,
  splitChannelQuality,
  splitLanguage,
  workTitle,
  type ChannelDetail,
  type EpgEntry,
  type PlayResponse,
  type SlotConflictDetails,
  type UnplayableDetails,
  type Variant,
} from '@iptv/shared';
import { api, ApiError, API_URL } from '../lib/api';
import { usePlayer, type PlayTarget } from '../lib/player';
import { useIntlLocale, useT, type Translate } from '../lib/i18n';
import { formatTime, useVideoControls } from '../lib/video';
import { LanguageMark } from './marks';
import {
  IconBack,
  IconCheck,
  IconForward,
  IconFullscreen,
  IconPause,
  IconAspect,
  IconPip,
  IconPlay,
  IconRewind,
  IconSettings,
  IconVolume,
} from './icons';

interface Props {
  target: PlayTarget;
  session: PlayResponse | null;
  onSession: (session: PlayResponse | null) => void;
  onClose: () => void;
}

/** On renouvelle le ticket bien avant son expiration, pour ne jamais la subir. */
const RENEW_MARGIN_MS = 2 * 60 * 1000;
/** Rythme d'envoi de la progression pendant la lecture. */
const PROGRESS_INTERVAL_MS = 10_000;
/** Délai avant que l'habillage s'efface, quand rien ne bouge et que ça joue. */
const IDLE_MS = 2800;

export function PlayerOverlay({ target, session, onSession, onClose }: Props) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ticketRef = useRef<string | null>(null);
  const sessionRef = useRef<PlayResponse | null>(null);
  sessionRef.current = session;

  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  /*
   * Un seul menu ouvert à la fois : deux panneaux superposés au même endroit se
   * recouvriraient, et fermer le premier pour ouvrir le second est un clic de
   * trop.
   */
  const [menu, setMenu] = useState<'quality' | 'fit' | null>(null);
  const [fit, setFit] = useState<Fit>('contain');
  /*
   * Panne de lecture, par opposition a une erreur d'API.
   *
   * Le flux peut etre accorde par le panel et refuser de se decoder — codec que
   * le navigateur ignore, segment corrompu, source morte. Sans ce message, il ne
   * restait qu'un ecran noir muet, ce qui est indiscernable d'un bug.
   */
  const [mediaError, setMediaError] = useState<string | null>(null);

  const { play } = usePlayer();
  const video = useVideoControls(videoRef, shellRef);

  // ------------------------------------------------------------- ouverture

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setChannel(null);
    setMenu(null);
    setMediaError(null);

    api
      .post<PlayResponse>(`/api/play/${target.itemType}/${target.itemId}`, { mode: 'proxy' })
      .then((res) => {
        if (cancelled) return;
        ticketRef.current = res.ticket;
        onSession(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // onSession est stable (setState), target identifie la lecture demandee.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.itemType, target.itemId, retryKey]);

  // --------------------------------------------------------- fiche de chaine

  /*
   * Qualites disponibles et programme en cours. Une chaine n'a pas de page a
   * elle : ces informations n'existent nulle part avant l'ouverture du lecteur,
   * et elles ne conditionnent pas la lecture — on les charge donc a cote.
   */
  useEffect(() => {
    if (session?.kind !== 'live') return;
    let cancelled = false;
    api
      .get<ChannelDetail>(`/api/live/${target.itemId}`)
      .then((res) => {
        if (!cancelled) setChannel(res);
      })
      .catch(() => {
        // Sans fiche, le lecteur reste utilisable : titre brut, pas de choix.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.kind, target.itemId]);

  // ------------------------------------------------------- liberation du slot

  useEffect(() => {
    if (!session) return;
    const slotId = session.slotId;

    // Fermeture brutale de l'onglet : sendBeacon part meme pendant l'unload.
    const releaseBeacon = () => {
      navigator.sendBeacon?.(
        `${API_URL}/api/play/release`,
        new Blob([JSON.stringify({ slotId })], { type: 'application/json' }),
      );
    };
    window.addEventListener('pagehide', releaseBeacon);

    return () => {
      window.removeEventListener('pagehide', releaseBeacon);
      void api.post('/api/play/release', { slotId }).catch(() => {});
    };
  }, [session]);

  // ------------------------------------------------------------- heartbeat

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      api.post('/api/play/heartbeat', { slotId: session.slotId }).catch((err) => {
        // Slot recycle cote serveur : mieux vaut le dire que jouer dans le vide.
        if (err instanceof ApiError && err.status === 404) {
          setError(err);
        }
      });
    }, session.heartbeatIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [session]);

  // ------------------------------------------------- renouvellement du ticket

  const renew = useCallback(async (): Promise<string | null> => {
    const ticket = ticketRef.current;
    if (!ticket) return null;
    try {
      const res = await api.post<{ ticket: string; url: string; expiresAt: string }>(
        '/api/play/renew',
        { ticket },
      );
      ticketRef.current = res.ticket;
      return res.url;
    } catch {
      return null;
    }
  }, []);

  /**
   * Reprise silencieuse : on remet la meme position apres avoir change d'URL.
   * Le spec est explicite — une expiration en cours de film ne doit pas ejecter
   * vers le login.
   */
  const swapSource = useCallback(async () => {
    const url = await renew();
    const el = videoRef.current;
    if (!url || !el) return;

    if (hlsRef.current) {
      hlsRef.current.loadSource(url);
      return;
    }
    const at = el.currentTime;
    const wasPlaying = !el.paused;
    el.src = url;
    el.addEventListener(
      'loadedmetadata',
      () => {
        el.currentTime = at;
        if (wasPlaying) void el.play().catch(() => {});
      },
      { once: true },
    );
  }, [renew]);

  useEffect(() => {
    if (!session) return;
    const delay = Math.max(
      15_000,
      new Date(session.expiresAt).getTime() - Date.now() - RENEW_MARGIN_MS,
    );
    const timer = setTimeout(() => void swapSource(), delay);
    return () => clearTimeout(timer);
  }, [session, swapSource]);

  // -------------------------------------------------------- montage du flux

  useEffect(() => {
    const el = videoRef.current;
    if (!session || !el) return;

    let disposed = false;

    const attach = async () => {
      if (session.kind === 'live') {
        /*
         * hls.js d'abord, lecture native ensuite — et pas l'inverse.
         *
         * `canPlayType('application/vnd.apple.mpegurl')` repond « maybe » sur
         * plusieurs navigateurs qui ne savent en realite pas demuxer un flux
         * MPEG-TS : leur faire confiance donnait un ecran noir et un
         * DEMUXER_ERROR_COULD_NOT_PARSE. hls.js, lui, marche partout ou
         * Media Source Extensions existe, c'est-a-dire partout sauf iOS —
         * ou la lecture native est justement la bonne reponse.
         */
        const { default: HlsCtor } = await import('hls.js');
        if (disposed) return;
        if (HlsCtor.isSupported()) {
          const hls = new HlsCtor({ enableWorker: true, lowLatencyMode: false });
          hlsRef.current = hls;
          let networkRetries = 0;
          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return;
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
              // Un 401 sur un segment signifie presque toujours un ticket expire.
              // Au-dela de trois tentatives, c'est le flux qui ne repond pas :
              // le dire vaut mieux qu'un ecran noir qui tourne indefiniment.
              if (++networkRetries > 3) {
                setMediaError('Le flux ne répond pas.');
                hls.stopLoad();
                return;
              }
              void swapSource().then(() => hls.startLoad());
            } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setMediaError("Ce flux n'est pas lisible ici.");
            }
          });
          hls.loadSource(session.url);
          hls.attachMedia(el);
        } else {
          el.src = session.url;
        }
      } else {
        el.src = session.url;
        if (session.resumeAtSec > 0) {
          el.addEventListener(
            'loadedmetadata',
            () => {
              el.currentTime = session.resumeAtSec;
            },
            { once: true },
          );
        }
      }
      void el.play().catch(() => {
        // Autoplay refuse : l'utilisateur clique, les controles sont visibles.
      });
    };

    void attach();

    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute('src');
      el.load();
    };
  }, [session, swapSource]);

  // ------------------------------------------------------------ progression

  useEffect(() => {
    if (!session || session.kind === 'live') return;
    const itemType = session.kind === 'episode' ? 'episode' : 'stream';

    const send = () => {
      const el = videoRef.current;
      if (!el || el.paused || !Number.isFinite(el.duration)) return;
      void api
        .patch('/api/me/progress', {
          itemType,
          itemId: target.itemId,
          positionSec: Math.floor(el.currentTime),
          durationSec: Math.floor(el.duration),
        })
        .catch(() => {});
    };

    const interval = setInterval(send, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      // Un dernier envoi a la fermeture : c'est celui qui compte pour « Reprendre ».
      send();
    };
  }, [session, target.itemId]);

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
      setMenu(null);
      if (variant.id === target.itemId) return;
      const current = sessionRef.current;
      if (current) {
        await api.post('/api/play/release', { slotId: current.slotId }).catch(() => {});
      }
      play({ itemType: 'stream', itemId: variant.id, label: variant.name });
    },
    [play, target.itemId],
  );

  // ------------------------------------------------------------- habillage

  const [idle, setIdle] = useState(false);

  /*
   * Le cadrage se retient d'une lecture à l'autre.
   *
   * Qui préfère remplir son écran le préfère toujours : le redemander à chaque
   * chaîne ferait du réglage une corvée. C'est un confort propre à cet écran-ci,
   * donc le stockage local plutôt que le profil.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FIT_KEY);
      if (isFit(saved)) setFit(saved);
    } catch {
      // Navigation privée ou stockage refusé : `contain` fait très bien l'affaire.
    }
  }, []);

  const chooseFit = (value: Fit) => {
    setFit(value);
    setMenu(null);
    try {
      window.localStorage.setItem(FIT_KEY, value);
    } catch {
      // Le choix vaut pour cette lecture, faute de pouvoir l'écrire.
    }
  };
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  // L'habillage ne s'efface qu'en lecture, menu ferme et sans erreur affichee :
  // sur une pause ou un message, il doit rester sous la main.
  const canHide = video.playing && !menu && !error && !mediaError;
  useEffect(() => {
    if (!canHide) {
      setIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [canHide, wake]);

  // ------------------------------------------------------------- raccourcis

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
      if (inField) return;

      switch (e.key) {
        case 'Escape':
          // En plein ecran, Echap sort du plein ecran : le navigateur s'en
          // charge, fermer le lecteur en plus ferait perdre la lecture.
          if (!document.fullscreenElement) onClose();
          return;
        case ' ':
        case 'k':
          e.preventDefault();
          video.toggle();
          break;
        case 'ArrowLeft':
          if (session?.kind !== 'live') video.skip(-10);
          break;
        case 'ArrowRight':
          if (session?.kind !== 'live') video.skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.setVolume(video.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.setVolume(video.volume - 0.05);
          break;
        case 'm':
          video.toggleMute();
          break;
        case 'f':
          video.toggleFullscreen();
          break;
        default:
          return;
      }
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, session?.kind, video, wake]);

  // ----------------------------------------------------------------- rendu

  const isLive = session?.kind === 'live';
  const rawLabel = session?.label ?? target.label ?? '';
  const { tag, title: withoutLang } = splitLanguage(rawLabel);
  const heading = isLive ? channelTitle(rawLabel) : workTitle(rawLabel);
  const quality = isLive ? splitChannelQuality(withoutLang).quality : null;
  const busy = (loading || video.waiting) && !error && !mediaError;

  const variants = channel?.variants ?? [];
  const now = channel?.now ?? null;
  const next = channel?.next ?? null;

  return (
    <div
      className="pl"
      ref={shellRef}
      data-idle={idle || undefined}
      onMouseMove={wake}
      onPointerDown={wake}
    >
      <video
        ref={videoRef}
        className="pl-video"
        data-fit={fit}
        playsInline
        autoPlay
        onClick={video.toggle}
        onDoubleClick={video.toggleFullscreen}
        onError={() => {
          // hls.js pilote l'element par MSE : ses pannes passent par son propre
          // canal, et l'evenement natif ne concerne alors que la lecture directe.
          if (!hlsRef.current) setMediaError("Ce flux n'est pas lisible ici.");
        }}
      />

      <header className="pl-top">
        <button className="pl-icon" onClick={onClose} aria-label={t('Fermer le lecteur')}>
          <IconBack />
        </button>

        {channel?.iconUrl && (
          // Hote d'images inconnu a l'avance et souvent en http : <img> brut.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pl-logo" src={channel.iconUrl} alt="" />
        )}

        <div className="pl-heading">
          <h1 className="pl-title">
            <LanguageMark tag={tag} />
            {heading || t('Lecture')}
            {quality && <span className="pl-tag">{quality}</span>}
          </h1>
          {isLive && !now && channel?.categoryName && (
            <p className="pl-sub">{splitLanguage(channel.categoryName).title}</p>
          )}
        </div>

        {isLive && (
          <span className="pl-live">
            <i /> {t('En direct')}
          </span>
        )}
      </header>

      {busy && (
        <div className="pl-center">
          <span className="pl-spinner" />
        </div>
      )}

      {!busy && !video.playing && !error && !mediaError && (
        <div className="pl-center">
          <button className="pl-big" onClick={video.toggle} aria-label={t('Lire')}>
            <IconPlay size={30} />
          </button>
        </div>
      )}

      <footer className="pl-bottom">
        {isLive ? (
          <ProgrammeBar now={now} next={next} />
        ) : (
          <SeekBar
            currentTime={video.currentTime}
            duration={video.duration}
            buffered={video.buffered}
            onSeek={video.seek}
          />
        )}

        <div className="pl-controls">
          <button
            className="pl-icon"
            onClick={video.toggle}
            aria-label={video.playing ? t('Pause') : t('Lire')}
          >
            {video.playing ? <IconPause /> : <IconPlay />}
          </button>

          {!isLive && (
            <>
              <button
                className="pl-icon"
                onClick={() => video.skip(-10)}
                aria-label={t('Reculer de 10 secondes')}
              >
                <IconRewind />
              </button>
              <button
                className="pl-icon"
                onClick={() => video.skip(10)}
                aria-label={t('Avancer de 10 secondes')}
              >
                <IconForward />
              </button>
            </>
          )}

          <div className="pl-volume">
            <button
              className="pl-icon"
              onClick={video.toggleMute}
              aria-label={video.muted ? t('Rétablir le son') : t('Couper le son')}
            >
              <IconVolume
                level={
                  video.muted || video.volume === 0
                    ? 'muted'
                    : video.volume > 0.5
                      ? 'high'
                      : 'low'
                }
              />
            </button>
            <input
              className="pl-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={video.muted ? 0 : video.volume}
              onChange={(e) => video.setVolume(Number(e.target.value))}
              aria-label={t('Volume')}
            />
          </div>

          {!isLive && video.duration > 0 && (
            <span className="pl-time">
              {formatTime(video.currentTime)} <span>/ {formatTime(video.duration)}</span>
            </span>
          )}

          <span className="pl-spacer" />

          {variants.length > 1 && (
            <div className="pl-menu-wrap">
              <button
                className="pl-icon"
                data-open={menu === 'quality' || undefined}
                onClick={() => setMenu((m) => (m === 'quality' ? null : 'quality'))}
                aria-label={t('Qualité')}
                aria-expanded={menu === 'quality'}
              >
                <IconSettings />
              </button>
              {menu === 'quality' && (
                <QualityMenu
                  variants={variants}
                  selectedId={target.itemId}
                  onSelect={switchVariant}
                />
              )}
            </div>
          )}

          <div className="pl-menu-wrap">
            <button
              className="pl-icon"
              data-open={menu === 'fit' || undefined}
              onClick={() => setMenu((m) => (m === 'fit' ? null : 'fit'))}
              aria-label={t('Proportions')}
              aria-expanded={menu === 'fit'}
            >
              <IconAspect />
            </button>
            {menu === 'fit' && <FitMenu value={fit} onSelect={chooseFit} />}
          </div>

          <button className="pl-icon" onClick={video.togglePip} aria-label={t('Picture-in-picture')}>
            <IconPip />
          </button>
          <button
            className="pl-icon"
            onClick={video.toggleFullscreen}
            aria-label={video.fullscreen ? t('Quitter le plein écran') : t('Plein écran')}
          >
            <IconFullscreen exit={video.fullscreen} />
          </button>
        </div>
      </footer>

      {(error || mediaError) && (
        <div className="pl-message">
          <div>
            {error ? (
              <PlayerError error={error} />
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{t('Flux indisponible')}</h2>
                <p className="muted">
                  {mediaError}{' '}
                  {variants.length > 1
                    ? t('Une autre qualité de cette chaîne fonctionne peut-être.')
                    : t('Le fournisseur ne le sert pas en ce moment ; réessayez dans un instant.')}
                </p>
                {variants.length > 1 && (
                  <div className="variants-chips" style={{ justifyContent: 'center', marginTop: 14 }}>
                    {variants.map((variant) => (
                      <button
                        key={variant.id}
                        className="chip"
                        data-active={variant.id === target.itemId}
                        onClick={() => void switchVariant(variant)}
                      >
                        {variant.quality ?? splitChannelQuality(variant.name).quality ?? 'Standard'}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="inline" style={{ justifyContent: 'center', marginTop: 18 }}>
              <Button onClick={onClose}>
                {t('Fermer')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  setMediaError(null);
                  setRetryKey((k) => k + 1);
                }}
              >
                {t('Réessayer')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ barres

/**
 * Barre de progression scrubbable.
 *
 * Le pointeur est capture des l'appui : le curseur peut sortir de la barre en
 * cours de glissement sans que la lecture ne se decale n'importe ou.
 */
function SeekBar({
  currentTime,
  duration,
  buffered,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
}) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const ratioAt = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(ratioAt(e.clientX) * duration);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ratio = ratioAt(e.clientX);
    setHover(ratio);
    if (duration > 0 && e.currentTarget.hasPointerCapture(e.pointerId)) {
      onSeek(ratio * duration);
    }
  };

  const played = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className="pl-track"
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      role="slider"
      aria-label={t('Position')}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
    >
      <span
        className="pl-track-buffer"
        style={{ width: pct(duration > 0 ? buffered / duration : 0) }}
      />
      <span className="pl-track-played" style={{ width: pct(played) }}>
        <i />
      </span>
      {hover != null && duration > 0 && (
        <span className="pl-track-hint" style={{ left: pct(hover) }}>
          {formatTime(hover * duration)}
        </span>
      )}
    </div>
  );
}

/**
 * Avancement du programme en cours.
 *
 * Sur une chaine il n'y a rien a chercher — la barre n'est donc pas cliquable :
 * elle dit ou on en est dans l'emission, et ce qui suit.
 */
function ProgrammeBar({ now, next }: { now: EpgEntry | null; next: EpgEntry | null }) {
  const t = useT();
  const intl = useIntlLocale();
  const elapsed = useElapsed(now);
  const left = remaining(t, now);

  if (!now) {
    return (
      <div className="pl-programme pl-programme-empty">
        <span className="pl-programme-next">
          {next ? t('À suivre · {title}', { title: next.title }) : t('Programme non communiqué')}
        </span>
      </div>
    );
  }

  return (
    <div className="pl-programme">
      <div className="pl-track pl-track-static">
        <span className="pl-track-played" style={{ width: pct(elapsed) }} />
      </div>
      <div className="pl-programme-line">
        <span className="pl-programme-time">
          {clock(now.startAt, intl)} – {clock(now.endAt, intl)}
        </span>
        <strong>{now.title}</strong>
        {next && (
          <span className="pl-programme-next">
            <span className="pl-dot">·</span>
            <span className="pl-ellipsis">{t('Puis {title}', { title: next.title })}</span>
          </span>
        )}
        {left !== null && <span className="pl-programme-left">{left}</span>}
      </div>
    </div>
  );
}

/**
 * Ce qu'il reste du programme, en toutes lettres.
 *
 * La barre disait « on en est là » sans jamais dire « pendant combien de temps
 * encore » — c'est pourtant le chiffre qui décide si on reste. `null` quand le
 * programme est fini ou que la grille ment sur ses horaires.
 */
function remaining(t: Translate, now: EpgEntry | null): string | null {
  if (!now) return null;
  const min = Math.round((new Date(now.endAt).getTime() - Date.now()) / 60_000);
  if (min <= 0 || min > 24 * 60) return null;
  if (min < 60) return t('{m} min restantes', { m: min });
  return t('{h} h {m} restantes', { h: Math.floor(min / 60), m: min % 60 });
}

/**
 * Le cadrage de l'image.
 *
 * `contain` est le seul choix honnête par défaut : il montre l'image entière,
 * quitte à border de noir quand la fenêtre n'a pas les proportions du flux.
 * Mais « honnête » n'est pas « ce que je veux » — sur un écran large, les
 * bandes gênent plus que le recadrage, et un vieux flux 4:3 arrive parfois avec
 * ses bandes déjà incrustées dans l'image, que `cover` ne peut pas enlever
 * puisqu'elles font partie du signal. D'où le zoom, qui coupe dedans.
 */
export type Fit = 'contain' | 'cover' | 'zoom' | 'fill';

const FIT_KEY = 'lcr.fit';

const FITS: { value: Fit; label: string; note: string }[] = [
  { value: 'contain', label: 'Adapté', note: 'Image entière' },
  { value: 'cover', label: 'Remplir', note: 'Les bords sont coupés' },
  { value: 'zoom', label: 'Zoom', note: 'Coupe les bandes incrustées' },
  { value: 'fill', label: 'Étiré', note: 'Les proportions changent' },
];

function isFit(value: unknown): value is Fit {
  return FITS.some((f) => f.value === value);
}

/** Part écoulée du programme, rafraîchie à la minute — la seconde ne se voit pas. */
function useElapsed(now: EpgEntry | null): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!now) return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [now]);

  if (!now) return 0;
  const start = new Date(now.startAt).getTime();
  const end = new Date(now.endAt).getTime();
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

function QualityMenu({
  variants,
  selectedId,
  onSelect,
}: {
  variants: Variant[];
  selectedId: number;
  onSelect: (variant: Variant) => void;
}) {
  const t = useT();
  const rows = useMemo(
    () =>
      variants.map((variant) => ({
        variant,
        label: variant.quality ?? splitChannelQuality(variant.name).quality ?? 'Standard',
      })),
    [variants],
  );

  return (
    <div className="pl-menu" role="menu">
      <div className="pl-menu-title">{t('Qualité')}</div>
      {rows.map(({ variant, label }) => (
        <button
          key={variant.id}
          className="pl-menu-item"
          role="menuitemradio"
          aria-checked={variant.id === selectedId}
          onClick={() => onSelect(variant)}
          title={variant.name}
        >
          <span className="pl-menu-check">{variant.id === selectedId && <IconCheck />}</span>
          {label}
          {/* Les navigateurs ne decodent pas le H.265 : autant le dire avant le clic. */}
          {label === 'HEVC' && <span className="pl-menu-note">H.265</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Le choix du cadrage.
 *
 * Chaque ligne dit ce qu'elle fait plutôt que comment : « les bords sont
 * coupés » se décide sans savoir ce qu'est `object-fit`.
 */
function FitMenu({ value, onSelect }: { value: Fit; onSelect: (fit: Fit) => void }) {
  const t = useT();
  return (
    <div className="pl-menu" role="menu">
      <div className="pl-menu-title">{t('Proportions')}</div>
      {FITS.map((option) => (
        <button
          key={option.value}
          className="pl-menu-item"
          role="menuitemradio"
          aria-checked={option.value === value}
          onClick={() => onSelect(option.value)}
        >
          <span className="pl-menu-check">{option.value === value && <IconCheck />}</span>
          {t(option.label)}
          <span className="pl-menu-note">{t(option.note)}</span>
        </button>
      ))}
    </div>
  );
}

function pct(ratio: number): string {
  return `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function clock(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Les trois cas du spec qui arrivent en usage normal, formules pour un humain. */
function PlayerError({ error }: { error: ApiError }) {
  const t = useT();
  if (error.code === 'SLOT_LIMIT_REACHED') {
    const details = error.details as SlotConflictDetails | undefined;
    return (
      <>
        <h2 style={{ marginTop: 0 }}>{t('Connexions occupées')}</h2>
        <p className="muted">
          {t(
            'L’abonnement « {provider} » autorise {max} lecture(s) en même temps. Un autre abonnement est peut-être libre : essayez le même contenu depuis une autre source.',
            { provider: details?.providerName ?? '?', max: details?.maxConnections ?? '?' },
          )}
        </p>
        <ul style={{ textAlign: 'left', display: 'inline-block' }}>
          {(details?.occupants ?? []).map((o) => (
            <li key={`${o.userEmail}-${o.since}`}>
              <strong>{o.userEmail}</strong> {t('regarde')} {o.itemLabel}
            </li>
          ))}
        </ul>

        {(details?.allProviders?.length ?? 0) > 1 && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              {t('État des abonnements :')}
            </div>
            {details!.allProviders.map((p) => (
              <div key={p.name}>
                {p.name} — {p.used} / {p.max}
                {p.used < p.max ? (
                  <span style={{ color: 'var(--ok)' }}> · {t('disponible')}</span>
                ) : (
                  <span className="muted"> · {t('saturé')}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (error.code === 'UNPLAYABLE_IN_BROWSER') {
    const details = error.details as UnplayableDetails | undefined;
    return (
      <>
        <h2 style={{ marginTop: 0 }}>{t('Pas lisible dans le navigateur')}</h2>
        <p className="muted">
          {t('Ce contenu est en')} <code>.{details?.containerExtension}</code>
          {t(
            ', un format que les navigateurs ne savent pas décoder. Ouvrez-le depuis l’application mobile.',
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>{t('Lecture impossible')}</h2>
      <p className="muted">{error.message}</p>
    </>
  );
}
