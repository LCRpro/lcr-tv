import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { DeviceSession, HistoryEntry, ProviderView } from '@iptv/shared';
import { api, API_URL } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { colors, radius, styles } from '../lib/theme';
import { Button, Empty, ErrorNotice, Loading } from '../components/ui';
import { Avatar } from '../components/ProfileAvatar';
import { Focusable } from '../components/Focusable';

/**
 * Le compte — qui regarde, avec quoi, sur quels appareils.
 *
 * On y change de profil, on y voit et on y bascule les connecteurs, et on y
 * ferme les sessions ouvertes ailleurs. La creation d'un connecteur et la
 * synchronisation restent au web : elles demandent un clavier et des reglages
 * fins qu'on ne fait pas a la telecommande. Mais **voir** ses sources et les
 * (de)activer, ca, c'est ici — c'est le geste courant.
 */
export default function CompteScreen() {
  const router = useRouter();
  const { user, profile, leaveProfile, logout } = useSession();

  const providers = useAsync<{ items: ProviderView[] }>(() => api.get('/api/providers'), []);
  const history = useAsync<{ items: HistoryEntry[] }>(() => api.get('/api/me/history?limit=20'), []);
  const sessions = useAsync<{ items: DeviceSession[] }>(() => api.get('/api/me/sessions'), []);

  const switchProfile = async () => {
    await leaveProfile();
    router.replace('/profils');
  };

  const revoke = (id: number) => {
    Alert.alert('Déconnecter cet appareil ?', 'Sa session sera immédiatement révoquée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnecter',
        style: 'destructive',
        onPress: () => void api.del(`/api/me/sessions/${id}`).then(() => sessions.reload()),
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Qui regarde, et le compte du foyer derriere. */}
      {profile ? (
        <View style={cs.head}>
          <Avatar avatar={profile.avatar} color={profile.color} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={cs.name}>{profile.name}</Text>
            <Text style={styles.dim} numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Associer un téléviseur : on recopie le code qu'il affiche. */}
      <Focusable onPress={() => router.push('/associer-tv')} style={cs.pairTv}>
        <Ionicons name="tv-outline" size={20} color={colors.accent} />
        <Text style={cs.pairTvText}>Associer une TV</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Focusable>

      <View style={cs.headActions}>
        <Focusable onPress={() => void switchProfile()} style={[cs.action, { flex: 1 }]}>
          <Text style={cs.actionText}>Changer de profil</Text>
        </Focusable>
        <Focusable onPress={() => void logout()} style={[cs.action, { flex: 1 }]}>
          <Text style={cs.actionText}>Se déconnecter</Text>
        </Focusable>
      </View>

      {/* ------------------------------------------------------- Sources */}
      <Text style={styles.h2}>Sources</Text>
      <Text style={[styles.dim, { marginBottom: 12, marginTop: -4 }]}>
        Les connecteurs remplissent le catalogue. Ils se créent et se synchronisent depuis le web.
      </Text>
      <ErrorNotice error={providers.error} />
      {providers.loading && !providers.data ? (
        <Loading />
      ) : !providers.data?.items.length ? (
        <Empty>Aucun connecteur. Ajoutez-en un depuis l&apos;interface web.</Empty>
      ) : (
        providers.data.items.map((p) => (
          <SourceCard key={p.id} provider={p} onChanged={() => providers.reload()} />
        ))
      )}

      <View style={styles.separator} />

      {/* ----------------------------------------------------- Historique */}
      <Text style={styles.h2}>Historique</Text>
      {history.loading ? (
        <Loading />
      ) : !history.data?.items.length ? (
        <Empty>Rien encore.</Empty>
      ) : (
        history.data.items.map((entry) => (
          <View key={`${entry.itemType}-${entry.itemId}`} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              {entry.parentLabel ? <Text style={styles.dim}>{entry.parentLabel}</Text> : null}
              <Text style={styles.text}>{entry.label}</Text>
              <Text style={styles.dim}>
                {entry.completed
                  ? 'Terminé'
                  : entry.durationSec
                    ? `${Math.round((entry.positionSec / entry.durationSec) * 100)} %`
                    : '—'}
              </Text>
            </View>
            <Button
              label="Oublier"
              onPress={() =>
                void api
                  .del(`/api/me/history/${entry.itemType}/${entry.itemId}`)
                  .then(() => history.reload())
              }
            />
          </View>
        ))
      )}

      {/* --------------------------------------------------- Appareils */}
      <Text style={styles.h2}>Appareils connectés</Text>
      {sessions.loading ? (
        <Loading />
      ) : (
        sessions.data?.items.map((s) => (
          <View key={s.id} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>
                {s.deviceLabel ?? 'Appareil'}
                {s.current ? ' · celui-ci' : ''}
              </Text>
              <Text style={styles.dim} numberOfLines={1}>
                {new Date(s.lastSeenAt).toLocaleString('fr-FR')}
              </Text>
            </View>
            {!s.current && <Button label="Déconnecter" onPress={() => revoke(s.id)} />}
          </View>
        ))
      )}

      <View style={{ height: 20 }} />
      <Text style={[styles.faint, { textAlign: 'center' }]}>Serveur · {API_URL}</Text>
      <Text style={[styles.faint, { textAlign: 'center', marginTop: 4 }]}>
        Le jeton de session vit dans le trousseau sécurisé de l&apos;appareil.
      </Text>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

/**
 * Une source, avec son interrupteur.
 *
 * L'interrupteur bascule aussitot a l'ecran, avant la reponse du serveur :
 * attendre un aller-retour donnerait l'impression qu'il ne repond pas. En cas
 * d'echec, on recharge — l'etat affiche redevient celui de la base.
 */
function SourceCard({ provider, onChanged }: { provider: ProviderView; onChanged: () => void }) {
  const [active, setActive] = useState(provider.isActive);
  const [busy, setBusy] = useState(false);
  const total = provider.catalogue.live + provider.catalogue.vod + provider.catalogue.series;

  const toggle = async () => {
    if (busy) return;
    const next = !active;
    setActive(next);
    setBusy(true);
    try {
      await api.post(`/api/providers/${provider.id}/activate`, { isActive: next });
      onChanged();
    } catch {
      setActive(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={cs.src}>
      <View style={cs.srcTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
          <Text style={cs.srcName} numberOfLines={1}>
            {provider.name}
          </Text>
          <Text style={cs.kind}>{provider.kind === 'm3u' ? 'M3U' : 'PANEL'}</Text>
        </View>
        <Focusable onPress={() => void toggle()} disabled={busy}>
          <View style={[cs.toggle, active && cs.toggleOn]}>
            <View style={[cs.knob, active && cs.knobOn]} />
          </View>
        </Focusable>
      </View>
      <Text style={cs.host} numberOfLines={1}>
        {maskHost(provider.baseUrl)}
      </Text>
      <View style={cs.facts}>
        <Fact k="Catalogue" v={total > 0 ? `${total.toLocaleString('fr-FR')} flux` : '—'} />
        <Fact
          k="État"
          v={provider.status ?? (provider.kind === 'm3u' ? 'playlist' : 'non testé')}
          tone={provider.status ? 'ok' : undefined}
        />
        {provider.sameAs.length > 0 ? <Fact k="Note" v="même fournisseur" /> : null}
      </View>
    </View>
  );
}

function Fact({ k, v, tone }: { k: string; v: string; tone?: 'ok' }) {
  return (
    <View>
      <Text style={cs.factK}>{k.toUpperCase()}</Text>
      <Text style={[cs.factV, tone === 'ok' && { color: colors.ok }]}>{v}</Text>
    </View>
  );
}

/** On garde le schéma et le début de l'hôte, on masque le reste : l'adresse
 *  identifie le fournisseur, elle n'a pas à rester lisible en entier. */
function maskHost(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname;
    const shown = h.slice(0, 2);
    return `${u.protocol}//${shown}${'•'.repeat(Math.max(3, h.length - 4))}${h.slice(-2)}`;
  } catch {
    return '—';
  }
}

const cs = {
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginBottom: 16 },
  name: { color: colors.text, fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.4 },
  pairTv: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    marginBottom: 12,
  },
  pairTvText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  headActions: { flexDirection: 'row' as const, gap: 10, marginBottom: 24 },
  action: {
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
  src: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSoft,
    padding: 15,
    marginBottom: 11,
  },
  srcTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  srcName: { color: colors.text, fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.2 },
  kind: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.dim,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    letterSpacing: 0.4,
  },
  host: { color: colors.faint, fontSize: 12, fontFamily: 'monospace', marginBottom: 12 },
  facts: { flexDirection: 'row' as const, gap: 22 },
  factK: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.5, color: colors.faint },
  factV: { fontSize: 13, fontWeight: '600' as const, color: colors.text, marginTop: 2 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.border,
    justifyContent: 'center' as const,
    padding: 2,
  },
  toggleOn: { backgroundColor: colors.ok },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' as const },
};
