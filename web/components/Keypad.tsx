'use client';

import { useEffect, useRef, useState } from 'react';
import { channelTitle, type LiveChannel } from '@iptv/shared';
import { useT } from '../lib/i18n';

/**
 * Le pavé numérique : on tape le numéro, la chaîne se lance.
 *
 * C'est le geste que tout le monde fait devant un téléviseur depuis quarante
 * ans — « fais 6 » — et qu'aucune application de ce genre ne propose. On y
 * cherche une chaîne dans une liste, on fait défiler, on clique. Ici on tape
 * **6**, et M6 démarre.
 *
 * Le chiffre s'accumule pendant une seconde et demie, comme sur une
 * télécommande : taper « 2 » puis « 6 » donne la chaîne 26 et non la 2 puis la
 * 6. Le retour visuel montre en direct ce que le numéro désigne, de sorte
 * qu'on voit ce qui va se lancer avant que ça se lance.
 *
 * Entrée valide tout de suite, Retour arrière corrige, Échap annule.
 */

/** Le délai d'un vrai téléviseur : assez pour un second chiffre, pas plus. */
const COMPOSE_MS = 1500;

export function Keypad({
  channels,
  onPlay,
}: {
  channels: LiveChannel[];
  onPlay: (channel: LiveChannel) => void;
}) {
  const t = useT();
  const [digits, setDigits] = useState('');
  const timer = useRef<number | null>(null);

  /*
   * Une entrée par numéro, la meilleure déclinaison en tête.
   *
   * La liste arrive triée par qualité : la première rencontrée pour un numéro
   * est donc la FHD, pas la SD. Taper « 1 » doit lancer la meilleure TF1
   * disponible, pas celle qui traîne en fin de liste.
   */
  const byNumber = new Map<number, LiveChannel>();
  for (const c of channels) {
    if (c.number == null) continue;
    if (!byNumber.has(c.number)) byNumber.set(c.number, c);
  }

  const cible = digits ? (byNumber.get(Number(digits)) ?? null) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Un chiffre tapé dans un champ de recherche reste un chiffre de recherche.
      const dans =
        e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
      if (dans || e.metaKey || e.ctrlKey || e.altKey) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        // Trois chiffres suffisent : aucune numérotation ne va au-delà.
        setDigits((d) => (d.length >= 3 ? e.key : d + e.key));
        return;
      }
      if (e.key === 'Backspace') {
        setDigits((d) => d.slice(0, -1));
        return;
      }
      if (e.key === 'Escape') setDigits('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * La validation, différée puis effacée.
   *
   * Le `useEffect` se rejoue à chaque chiffre : le compte à rebours repart de
   * zéro, ce qui est exactement le comportement attendu — on a le temps de
   * taper le second chiffre. Entrée court-circuite l'attente.
   */
  useEffect(() => {
    if (!digits) return;

    const lancer = () => {
      const c = byNumber.get(Number(digits));
      setDigits('');
      if (c) onPlay(c);
    };

    const onEnter = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (timer.current) window.clearTimeout(timer.current);
      lancer();
    };
    window.addEventListener('keydown', onEnter);

    timer.current = window.setTimeout(lancer, COMPOSE_MS);
    return () => {
      window.removeEventListener('keydown', onEnter);
      if (timer.current) window.clearTimeout(timer.current);
    };
    // `byNumber` se reconstruit à chaque rendu : le suivre relancerait le
    // compte à rebours sans arrêt. Seuls les chiffres tapés le déclenchent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  if (!digits) return null;

  return (
    <div className="keypad" role="status" aria-live="polite">
      <span className="keypad-digits">{digits}</span>
      <span className="keypad-name">
        {cible ? channelTitle(cible.name) : t('Aucune chaîne à ce numéro')}
      </span>
      {cible?.iconUrl && (
        // Hôtes d'images inconnus à l'avance : <img> brut.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cible.iconUrl} alt="" />
      )}
    </div>
  );
}
