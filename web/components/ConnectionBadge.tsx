'use client';

import { useEffect, useState } from 'react';
import type { SlotUsage } from '@iptv/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';

/**
 * Etat des connexions de chaque abonnement, dans la barre de navigation.
 *
 * Avec des abonnements a une seule connexion, savoir *avant* de cliquer si une
 * place est libre change tout : sans cet indicateur, on decouvre la saturation
 * au moment de lancer une lecture, et on ne sait pas si l'autre abonnement
 * pourrait prendre le relais.
 */
const REFRESH_MS = 15_000;

export function ConnectionBadge() {
  const t = useT();
  const [usage, setUsage] = useState<SlotUsage | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      api
        .get<SlotUsage>('/api/connections')
        .then((res) => {
          if (!cancelled) setUsage(res);
        })
        .catch(() => {
          // Indicateur decoratif : son echec ne doit jamais gener la navigation.
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);

    // Relire en revenant sur l'onglet : c'est souvent la qu'une lecture vient
    // de se terminer ailleurs dans la maison.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!usage || usage.providers.length === 0) return null;

  const free = usage.max - usage.used;
  const available = free > 0;

  /*
   * Un mot, pas un décompte.
   *
   * « 0/1 · 0/1 » demandait de connaître le nombre de connexions de chaque
   * abonnement pour être lu. La seule question à laquelle cet indicateur doit
   * répondre est : « est-ce que je peux lancer une lecture ? ». Le détail par
   * abonnement reste dans l'infobulle, pour qui veut savoir lequel est pris.
   */
  const detail = usage.providers
    .map((p) => `${p.name} — ${p.used}/${p.max}`)
    .join(' · ');
  const label = available
    ? `${t(
        free > 1 ? '{free} connexions libres sur {max}.' : '{free} connexion libre sur {max}.',
        { free, max: usage.max },
      )} ${detail}`
    : `${t('Toutes les connexions sont occupées.')} ${detail}`;

  return (
    <div className="conn" data-free={available} title={label} aria-label={label}>
      <span className="conn-dot" data-free={available} />
      <span className="conn-name">{available ? t('Disponible') : t('Occupé')}</span>
    </div>
  );
}
