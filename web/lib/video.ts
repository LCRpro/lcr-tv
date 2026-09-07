'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface VideoState {
  playing: boolean;
  /** Le flux se remplit : c'est ce qui justifie d'afficher un indicateur. */
  waiting: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  /** Fin de la plage déjà téléchargée, pour la doubler sur la barre. */
  buffered: number;
  fullscreen: boolean;
  pip: boolean;
}

export interface VideoControls extends VideoState {
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
}

/** Mémorise le volume entre deux lectures — le régler à chaque fois est agaçant. */
const VOLUME_KEY = 'iptv.volume';

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 1;
  const raw = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
}

/**
 * État d'un `<video>` et actions associées.
 *
 * L'élément vidéo est la source de vérité : on s'abonne à ses événements plutôt
 * que de tenir un état parallèle, sinon la moindre action venant d'ailleurs
 * (raccourci système, Picture-in-Picture, fin de flux) désynchroniserait
 * l'interface.
 */
export function useVideoControls(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
): VideoControls {
  const [state, setState] = useState<VideoState>({
    playing: false,
    waiting: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    fullscreen: false,
    pip: false,
  });

  // Le volume restauré n'est lu qu'au montage, jamais réécrit dans l'état par
  // la suite : c'est l'élément vidéo qui le porte ensuite.
  const restored = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!restored.current) {
      restored.current = true;
      video.volume = readStoredVolume();
    }

    const sync = () => {
      setState((prev) => ({
        ...prev,
        playing: !video.paused && !video.ended,
        muted: video.muted,
        volume: video.volume,
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        buffered: video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0,
        pip: document.pictureInPictureElement === video,
      }));
    };

    const waiting = (value: boolean) => () => setState((prev) => ({ ...prev, waiting: value }));

    const events: Array<[string, EventListener]> = [
      ['play', sync],
      ['pause', sync],
      ['ended', sync],
      ['timeupdate', sync],
      ['durationchange', sync],
      ['progress', sync],
      ['volumechange', sync],
      ['loadedmetadata', sync],
      ['enterpictureinpicture', sync],
      ['leavepictureinpicture', sync],
      ['waiting', waiting(true)],
      ['stalled', waiting(true)],
      ['playing', waiting(false)],
      ['canplay', waiting(false)],
    ];
    for (const [name, handler] of events) video.addEventListener(name, handler);
    sync();

    return () => {
      for (const [name, handler] of events) video.removeEventListener(name, handler);
    };
  }, [videoRef]);

  // Le plein écran peut être quitté par la touche Échap du navigateur, sans
  // passer par nos boutons : seul l'événement du document fait foi.
  useEffect(() => {
    const onChange = () =>
      setState((prev) => ({ ...prev, fullscreen: document.fullscreenElement != null }));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, [videoRef]);

  const seek = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.min(Math.max(0, seconds), video.duration);
    },
    [videoRef],
  );

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seek(video.currentTime + delta);
    },
    [seek, videoRef],
  );

  const setVolume = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video) return;
      const next = Math.min(1, Math.max(0, value));
      video.volume = next;
      // Monter le volume alors qu'on est coupé doit rétablir le son.
      if (next > 0 && video.muted) video.muted = false;
      window.localStorage.setItem(VOLUME_KEY, String(next));
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void node.requestFullscreen().catch(() => {});
  }, [containerRef]);

  const togglePip = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void video.requestPictureInPicture?.().catch(() => {});
  }, [videoRef]);

  return { ...state, toggle, seek, skip, setVolume, toggleMute, toggleFullscreen, togglePip };
}

/** `1:04:12` au-delà d'une heure, `04:12` sinon. Vide si la durée est inconnue. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
