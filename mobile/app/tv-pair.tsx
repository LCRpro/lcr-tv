import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import type { TvPairPollResponse, TvPairStartResponse } from '@iptv/shared';
import { api, ApiError, setToken } from '../lib/api';
import { useSession } from '../lib/session';
import { colors, radius } from '../lib/theme';
import { IS_TV, tv, TV_SAFE } from '../lib/tv';
import { Focusable } from '../components/Focusable';

/**
 * Associer ce téléviseur.
 *
 * Un téléviseur ne se connecte pas au clavier. Il demande un code au serveur,
 * l'affiche en grand — en clair et en QR — et sonde en attendant. L'utilisateur
 * scanne le QR (ou tape le code sur lcrtv…/tv depuis son téléphone), et dès que
 * c'est réclamé, le téléviseur reçoit sa session et s'ouvre tout seul.
 *
 * C'est l'écran d'accueil du téléviseur tant que personne n'est connecté : le
 * Gate y envoie quand `IS_TV` et qu'il n'y a pas de session.
 */
export default function TvPairScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [pairing, setPairing] = useState<TvPairStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const res = await api.post<TvPairStartResponse>('/api/tv/start', {
        deviceLabel: IS_TV ? 'Téléviseur' : 'Grand écran',
      });
      setPairing(res);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez la connexion du téléviseur.');
    }
  }, []);

  useEffect(() => {
    void start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [start]);

  // La sonde : on interroge le serveur jusqu'à ce que le code soit réclamé.
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await api.post<TvPairPollResponse>('/api/tv/poll', {
          deviceSecret: pairing.deviceSecret,
        });
        if (cancelled) return;
        if (res.status === 'approved') {
          await setToken(res.token);
          await refresh(); // Le Gate prend le relais : profil, puis accueil.
          return;
        }
        if (res.status === 'expired') {
          void start(); // Le code a expiré : on en demande un neuf.
          return;
        }
      } catch (err) {
        // Un code consommé ou introuvable : on repart sur un code neuf.
        if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
          void start();
          return;
        }
        // Erreur réseau passagère : on retentera au prochain tour.
      }
      if (!cancelled) timer.current = setTimeout(poll, pairing.pollIntervalSec * 1000);
    };

    timer.current = setTimeout(poll, pairing.pollIntervalSec * 1000);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pairing, refresh, start]);

  const pad = TV_SAFE + tv(24);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: pad }}>
      <View style={{ width: tv(44), height: tv(44), borderRadius: tv(13), backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: tv(18) }}>
        <Text style={{ color: colors.onAccent, fontSize: tv(24), fontWeight: '800' }}>L</Text>
      </View>

      <Text style={{ color: colors.text, fontSize: tv(30), fontWeight: '800', letterSpacing: -0.5, marginBottom: tv(8) }}>
        Connectez ce téléviseur
      </Text>
      <Text style={{ color: colors.dim, fontSize: tv(15), textAlign: 'center', maxWidth: tv(460), marginBottom: tv(30), lineHeight: tv(22) }}>
        Scannez le QR code avec votre téléphone, ou ouvrez le site LCR TV et entrez le code ci-dessous.
      </Text>

      {error ? (
        <Text style={{ color: colors.live, fontSize: tv(15), textAlign: 'center', maxWidth: tv(460) }}>{error}</Text>
      ) : !pairing ? (
        <ActivityIndicator color={colors.accent} size="large" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tv(40), flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Le QR sur une plaque blanche : un QR se lit sur du clair. */}
          <View style={{ padding: tv(16), borderRadius: radius.lg, backgroundColor: '#ffffff' }}>
            <QRCode value={pairing.verificationUrl} size={tv(200)} backgroundColor="#ffffff" color="#080a12" />
          </View>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.faint, fontSize: tv(12), fontWeight: '700', letterSpacing: tv(1.5), textTransform: 'uppercase', marginBottom: tv(10) }}>
              Votre code
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: tv(44),
                fontWeight: '800',
                letterSpacing: tv(4),
                fontVariant: ['tabular-nums'],
              }}
            >
              {pairing.code}
            </Text>
            <Text style={{ color: colors.dim, fontSize: tv(14), marginTop: tv(14) }}>
              sur lcrtv — « Associer une TV »
            </Text>
          </View>
        </View>
      )}

      {/* Repli : les rares téléviseurs à clavier peuvent se connecter à l'ancienne. */}
      <Focusable onPress={() => router.replace('/login')} style={{ marginTop: tv(36) }}>
        <Text style={{ color: colors.accent, fontSize: tv(14), fontWeight: '600' }}>
          Se connecter avec un mot de passe
        </Text>
      </Focusable>
    </View>
  );
}
