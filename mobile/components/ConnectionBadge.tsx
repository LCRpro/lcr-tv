import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import type { SlotUsage } from '@iptv/shared';
import { api } from '../lib/api';
import { colors } from '../lib/theme';

/**
 * Etat des connexions de chaque abonnement, dans l'en-tete.
 *
 * Avec des abonnements a une seule connexion, savoir avant de lancer une
 * lecture si une place est libre evite de decouvrir la saturation au moment ou
 * on appuie sur Lecture.
 */
const REFRESH_MS = 15_000;

export function ConnectionBadge({ compact }: { compact?: boolean } = {}) {
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
          // Indicateur decoratif : son echec ne doit pas gener la navigation.
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);

    // Au retour au premier plan : une lecture s'est peut-etre terminee ailleurs.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  if (!usage || usage.providers.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: colors.elevated,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: compact ? 0 : 12,
      }}
    >
      {usage.providers.map((p, index) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {index > 0 && (
            <View style={{ width: 1, height: 11, backgroundColor: colors.border }} />
          )}
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: p.used < p.max ? colors.ok : colors.live,
            }}
          />
          {!compact && (
            <Text style={{ color: colors.dim, fontSize: 11 }} numberOfLines={1}>
              {p.name}
            </Text>
          )}
          <Text style={{ color: colors.dim, fontSize: 11 }}>
            {p.used}/{p.max}
          </Text>
        </View>
      ))}
    </View>
  );
}
