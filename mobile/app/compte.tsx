import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import type { DeviceSession, HistoryEntry, Profile, ProviderView, Tag } from '@iptv/shared';
import { api, API_URL } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useSession } from '../lib/session';
import { confirmAction } from '../lib/confirm';
import { DOWNLOADS_OK, removeDownload, useDownloads } from '../lib/downloads';
import { colors, radius, styles } from '../lib/theme';
import { Empty, ErrorNotice, Loading } from '../components/ui';
import { Avatar } from '../components/ProfileAvatar';
import { Focusable } from '../components/Focusable';

/**
 * Le compte — qui regarde, avec quoi, sur quels appareils.
 *
 * Rangé par catégories, chacune dans sa carte : le compte, les étiquettes, les
 * sources, les appareils, l'historique. Sur un large écran, les cartes se
 * répartissent en deux colonnes ; au téléphone, elles s'empilent. La création
 * d'un connecteur reste au web — ici c'est voir et basculer, le geste courant.
 */
export default function CompteScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, profile, profiles, leaveProfile, logout } = useSession();

  const providers = useAsync<{ items: ProviderView[] }>(() => api.get('/api/providers'), []);
  const history = useAsync<{ items: HistoryEntry[] }>(() => api.get('/api/me/history?limit=20'), []);
  const sessions = useAsync<{ items: DeviceSession[] }>(() => api.get('/api/me/sessions'), []);
  const downloads = useDownloads();

  // Au retour sur le compte — après avoir ajouté une source, par exemple — on
  // relit la liste pour qu'elle reflète ce qui vient de changer.
  useFocusEffect(
    useCallback(() => {
      providers.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const switchProfile = async () => {
    await leaveProfile();
    router.replace('/profils');
  };

  const confirmLogout = () =>
    confirmAction({
      title: 'Se déconnecter ?',
      message: 'Vous reviendrez à l’écran de connexion.',
      confirmLabel: 'Se déconnecter',
      onConfirm: () => void logout(),
    });

  const revoke = (id: number) =>
    confirmAction({
      title: 'Déconnecter cet appareil ?',
      message: 'Sa session sera immédiatement révoquée.',
      confirmLabel: 'Déconnecter',
      onConfirm: () => void api.del(`/api/me/sessions/${id}`).then(() => sessions.reload()),
    });

  // ------------------------------------------------------------- les cartes

  const compteCard = (
    <Section title="Compte" icon="person-outline" defaultOpen>
      <LinkRow icon="people-outline" label="Changer de profil" onPress={() => void switchProfile()} />
      <Divider />
      <LinkRow
        icon="log-out-outline"
        label="Se déconnecter"
        tone="danger"
        chevron={false}
        onPress={confirmLogout}
      />
    </Section>
  );

  const profilesCard = (
    <Section title="Profils" icon="people-outline" count={profiles.length}>
      {profiles.map((p, i) => (
        <View key={p.id}>
          {i > 0 ? <Divider /> : null}
          <Focusable
            onPress={() => router.push(`/profil/${p.id}`)}
            style={({ pressed }) => [cs.row, pressed && { opacity: 0.7 }]}
          >
            <Avatar avatar={p.avatar} color={p.color} size={30} />
            <Text style={cs.rowLabel} numberOfLines={1}>
              {p.name}
            </Text>
            {p.isKid ? <Text style={cs.kidBadge}>ENFANT</Text> : null}
            <View style={{ flex: 1 }} />
            {p.id === profile?.id ? <Text style={cs.rowValue}>actif</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Focusable>
        </View>
      ))}
      <Divider />
      <LinkRow
        icon="add-circle-outline"
        iconColor={colors.accent}
        tone="accent"
        label="Créer un profil"
        onPress={() => router.push('/profil/new')}
      />
    </Section>
  );

  const tagsCard = (
    <Section
      title="Étiquettes"
      icon="pricetag-outline"
      subtitle="Vos rayons perso : films, séries et chaînes mêlés."
    >
      <TagsManager />
    </Section>
  );

  const sourcesCard = (
    <Section
      title="Sources"
      icon="server-outline"
      count={providers.data?.items.length}
      subtitle="Partagées par le foyer, créées au web. Chaque profil choisit lesquelles il utilise."
    >
      <ErrorNotice error={providers.error} />
      {providers.loading && !providers.data ? (
        <Loading />
      ) : !providers.data?.items.length ? (
        <Empty>Aucune source. Ajoutez-en une ci-dessous.</Empty>
      ) : (
        providers.data.items.map((p, i) => (
          <View key={p.id}>
            {i > 0 ? <Divider /> : null}
            <ProviderRow provider={p} onChanged={() => providers.reload()} />
          </View>
        ))
      )}
      <Divider />
      <LinkRow
        icon="add-circle-outline"
        iconColor={colors.accent}
        tone="accent"
        label="Ajouter une source"
        onPress={() => router.push('/source/new')}
      />
    </Section>
  );

  const devicesCard = (
    <Section title="Appareils" icon="tv-outline" count={sessions.data?.items.length}>
      <LinkRow
        icon="tv-outline"
        iconColor={colors.accent}
        label="Associer une TV"
        tone="accent"
        onPress={() => router.push('/associer-tv')}
      />
      {sessions.loading ? (
        <>
          <Divider />
          <Loading />
        </>
      ) : (
        sessions.data?.items.map((s) => (
          <View key={s.id}>
            <Divider />
            <View style={cs.deviceRow}>
              <Ionicons
                name={s.current ? 'phone-portrait-outline' : 'hardware-chip-outline'}
                size={20}
                color={colors.dim}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cs.rowLabel} numberOfLines={1}>
                  {s.deviceLabel ?? 'Appareil'}
                  {s.current ? ' · celui-ci' : ''}
                </Text>
                <Text style={styles.dim} numberOfLines={1}>
                  {new Date(s.lastSeenAt).toLocaleString('fr-FR')}
                </Text>
              </View>
              {!s.current ? (
                <Focusable onPress={() => revoke(s.id)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.faint} />
                </Focusable>
              ) : null}
            </View>
          </View>
        ))
      )}
    </Section>
  );

  const downloadsCard = (
    <Section
      title="Téléchargements"
      icon="download-outline"
      count={DOWNLOADS_OK ? downloads.length : undefined}
      subtitle="À regarder hors-ligne. Touchez la flèche sur un film ou un épisode pour le prendre."
    >
      {!DOWNLOADS_OK ? (
        <View style={{ paddingVertical: 14 }}>
          <Text style={styles.dim}>Le téléchargement hors-ligne se fait depuis l’app mobile.</Text>
        </View>
      ) : downloads.length === 0 ? (
        <Empty>Rien de téléchargé pour l’instant.</Empty>
      ) : (
        downloads.map((d, i) => (
          <View key={d.key}>
            {i > 0 ? <Divider /> : null}
            <View style={cs.deviceRow}>
              <Ionicons
                name={d.kind === 'episode' ? 'tv-outline' : 'film-outline'}
                size={20}
                color={colors.dim}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cs.rowLabel} numberOfLines={1}>
                  {d.title}
                </Text>
                <Text style={styles.dim} numberOfLines={1}>
                  {d.status === 'downloading'
                    ? `Téléchargement · ${Math.round((d.progress || 0) * 100)} %`
                    : d.status === 'error'
                      ? 'Échec du téléchargement'
                      : 'Prêt · disponible hors-ligne'}
                </Text>
              </View>
              {d.status === 'done' ? (
                <Focusable
                  onPress={() =>
                    router.push({
                      pathname: '/player',
                      params: {
                        itemType: d.kind === 'movie' ? 'stream' : 'episode',
                        itemId: String(d.id),
                        label: d.title,
                        localUri: d.localUri,
                      },
                    })
                  }
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="play-circle" size={24} color={colors.accent} />
                </Focusable>
              ) : null}
              <Focusable onPress={() => void removeDownload(d.key)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color={colors.faint} />
              </Focusable>
            </View>
          </View>
        ))
      )}
    </Section>
  );

  const historyCard = (
    <Section
      title="Historique"
      icon="time-outline"
      count={history.data?.items.length}
      subtitle="Ce que ce profil a commencé à regarder, pour reprendre où il s’était arrêté."
    >
      {history.loading ? (
        <Loading />
      ) : !history.data?.items.length ? (
        <Empty>Rien encore.</Empty>
      ) : (
        history.data.items.map((entry, i) => (
          <View key={`${entry.itemType}-${entry.itemId}`}>
            {i > 0 ? <Divider /> : null}
            <View style={cs.deviceRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {entry.parentLabel ? (
                  <Text style={styles.dim} numberOfLines={1}>
                    {entry.parentLabel}
                  </Text>
                ) : null}
                <Text style={cs.rowLabel} numberOfLines={1}>
                  {entry.label}
                </Text>
                <Text style={styles.dim}>
                  {entry.completed
                    ? 'Terminé'
                    : entry.durationSec
                      ? `${Math.round((entry.positionSec / entry.durationSec) * 100)} %`
                      : '—'}
                </Text>
              </View>
              <Focusable
                onPress={() =>
                  void api
                    .del(`/api/me/history/${entry.itemType}/${entry.itemId}`)
                    .then(() => history.reload())
                }
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.faint} />
              </Focusable>
            </View>
          </View>
        ))
      )}
    </Section>
  );

  // Deux colonnes dès qu'il y a la place ; sinon une seule, dans l'ordre utile.
  const wide = width >= 760;
  const left = [compteCard, profilesCard, tagsCard, historyCard];
  const right = [downloadsCard, devicesCard, sourcesCard];
  const stacked = [
    compteCard,
    profilesCard,
    tagsCard,
    downloadsCard,
    sourcesCard,
    devicesCard,
    historyCard,
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={cs.content}>
        <View style={cs.inner}>
          {profile ? (
            <View style={cs.hero}>
              <Avatar avatar={profile.avatar} color={profile.color} size={56} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cs.name}>{profile.name}</Text>
                <Text style={styles.dim} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
            </View>
          ) : null}

          {wide ? (
            <View style={cs.columns}>
              <View style={cs.column}>{left.map((c, i) => wrap(c, `l${i}`))}</View>
              <View style={cs.column}>{right.map((c, i) => wrap(c, `r${i}`))}</View>
            </View>
          ) : (
            <View>{stacked.map((c, i) => wrap(c, `s${i}`))}</View>
          )}

          <Text style={[styles.faint, { textAlign: 'center', marginTop: 8 }]}>Serveur · {API_URL}</Text>
          <Text style={[styles.faint, { textAlign: 'center', marginTop: 4 }]}>
            Le jeton de session vit dans le trousseau sécurisé de l&apos;appareil.
          </Text>
          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
  );
}

/** Une clé stable sur un élément déjà construit, sans le reconstruire. */
function wrap(node: ReactNode, key: string): ReactNode {
  return <View key={key}>{node}</View>;
}

// --------------------------------------------------------- briques d'interface

/**
 * Une catégorie repliable — un dropdown.
 *
 * On ne voit que l'en-tête : son icône, son nom, un compteur, et le chevron. Le
 * contenu n'apparaît qu'au clic, pour que la page reste une courte liste de
 * rayons qu'on ouvre à la demande.
 */
function Section({
  title,
  subtitle,
  icon,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <View style={cs.section}>
      <View style={cs.card}>
        <Focusable
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [cs.accHeader, pressed && { opacity: 0.7 }]}
        >
          <View style={cs.accIcon}>
            <Ionicons name={icon} size={18} color={colors.accent} />
          </View>
          <Text style={cs.accTitle}>{title}</Text>
          <View style={{ flex: 1 }} />
          {count != null ? <Text style={cs.accCount}>{count}</Text> : null}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
        </Focusable>
        {open ? (
          <>
            <Divider />
            <View style={cs.accBody}>
              {subtitle ? <Text style={cs.sectionSub}>{subtitle}</Text> : null}
              {children}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Un filet entre deux rangées d'une même carte. */
function Divider() {
  return <View style={cs.divider} />;
}

/** Une rangée-lien : icône, libellé, valeur facultative, chevron. */
function LinkRow({
  icon,
  iconColor,
  label,
  value,
  tone,
  chevron = true,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  value?: string;
  tone?: 'accent' | 'danger';
  chevron?: boolean;
  onPress: () => void;
}) {
  const labelColor =
    tone === 'danger' ? colors.live : tone === 'accent' ? colors.text : colors.text;
  return (
    <Focusable onPress={onPress} style={({ pressed }) => [cs.row, pressed && { opacity: 0.7 }]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={20}
          color={iconColor ?? (tone === 'danger' ? colors.live : colors.dim)}
        />
      ) : null}
      <Text style={[cs.rowLabel, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {value ? <Text style={cs.rowValue}>{value}</Text> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Focusable>
  );
}

/**
 * Le gestionnaire d'étiquettes, posé dans la carte « Étiquettes ».
 *
 * On y crée ses rayons, on les supprime, et on ouvre chacun pour voir tout ce
 * qu'il range — films, séries et chaînes mêlés. Les étiquettes elles-mêmes se
 * posent sur les contenus, depuis leur fiche ou leur vignette.
 */
function TagsManager() {
  const router = useRouter();
  const tags = useAsync<{ items: Tag[] }>(() => api.get('/api/me/tags'), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await api.post('/api/me/tags', { name: trimmed });
      setName('');
      tags.reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = (tag: Tag) =>
    confirmAction({
      title: 'Supprimer cette étiquette ?',
      message: `« ${tag.name} » et son contenu seront retirés.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => void api.del(`/api/me/tags/${tag.id}`).then(() => tags.reload()),
    });

  return (
    <View>
      {/* Mes favoris : le rayon de l'étoile, au même endroit que les étiquettes. */}
      <Focusable
        onPress={() => router.push('/favoris')}
        style={({ pressed }) => [cs.row, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="star" size={18} color={colors.gold} />
        <Text style={cs.rowLabel} numberOfLines={1}>
          Mes favoris
        </Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Focusable>
      <Divider />

      <View style={cs.tagCreate}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Nouvelle étiquette…"
          placeholderTextColor={colors.dim}
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void create()}
          returnKeyType="done"
          maxLength={40}
        />
        <Focusable
          onPress={() => void create()}
          disabled={busy || name.trim().length === 0}
          style={[cs.tagAdd, name.trim().length === 0 && { opacity: 0.4 }]}
        >
          <Ionicons name="add" size={24} color={colors.onAccent} />
        </Focusable>
      </View>

      <ErrorNotice error={tags.error} />
      {tags.loading && !tags.data ? (
        <Loading />
      ) : !tags.data?.items.length ? (
        <Empty>Aucune étiquette. Créez-en une ci-dessus.</Empty>
      ) : (
        tags.data.items.map((tag, i) => (
          <View key={tag.id}>
            {i > 0 ? <Divider /> : null}
            <Focusable
              onPress={() => router.push(`/tag/${tag.id}?name=${encodeURIComponent(tag.name)}`)}
              style={({ pressed }) => [cs.row, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="pricetag" size={18} color={colors.accent} />
              <Text style={cs.rowLabel} numberOfLines={1}>
                {tag.name}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={cs.rowValue}>
                {tag.count} {tag.count > 1 ? 'éléments' : 'élément'}
              </Text>
              <Focusable onPress={() => remove(tag)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color={colors.faint} />
              </Focusable>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Focusable>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * Une source et son interrupteur, en rangée d'une carte.
 *
 * L'interrupteur bascule aussitot a l'ecran, avant la reponse du serveur :
 * attendre un aller-retour donnerait l'impression qu'il ne repond pas. En cas
 * d'echec, on recharge — l'etat affiche redevient celui de la base.
 */
function ProviderRow({ provider, onChanged }: { provider: ProviderView; onChanged: () => void }) {
  const router = useRouter();
  // La source peut être éteinte au niveau du compte (réglé au web) : alors le
  // profil ne peut rien y faire. Sinon, il choisit de l'utiliser ou non.
  const accountOff = !provider.isActive;
  const [active, setActive] = useState(provider.enabledHere);
  const [busy, setBusy] = useState(false);
  const total = provider.catalogue.live + provider.catalogue.vod + provider.catalogue.series;

  const toggle = async () => {
    if (busy || accountOff) return;
    const next = !active;
    setActive(next);
    setBusy(true);
    try {
      await api.post(`/api/providers/${provider.id}/profile-enable`, { enabled: next });
      onChanged();
    } catch {
      setActive(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={cs.provRow}>
      <View style={cs.srcTop}>
        <Focusable
          onPress={() => router.push(`/source/${provider.id}`)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}
        >
          <Text style={cs.srcName} numberOfLines={1}>
            {provider.name}
          </Text>
          <Text style={cs.kind}>{provider.kind === 'm3u' ? 'M3U' : 'PANEL'}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.faint} />
        </Focusable>
        <Focusable onPress={() => void toggle()} disabled={busy || accountOff}>
          <View style={[cs.toggle, active && cs.toggleOn, accountOff && { opacity: 0.4 }]}>
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
          k="Ce profil"
          v={accountOff ? 'désactivée au compte' : active ? 'utilise' : 'ignorée'}
          tone={!accountOff && active ? 'ok' : undefined}
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
  content: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%' as const, maxWidth: 900, alignSelf: 'center' as const },
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginBottom: 20 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },

  columns: { flexDirection: 'row' as const, gap: 14, alignItems: 'flex-start' as const },
  column: { flex: 1, minWidth: 0 },

  section: { marginBottom: 12 },
  sectionSub: {
    color: colors.faint,
    fontSize: 12.5,
    paddingHorizontal: 14,
    paddingTop: 11,
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  accHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  accIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  accTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  accCount: {
    color: colors.faint,
    fontSize: 13,
    marginRight: 4,
    fontVariant: ['tabular-nums' as const],
  },
  accBody: { paddingBottom: 6 },
  divider: { height: 1, backgroundColor: colors.border },

  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.2 },
  rowValue: { color: colors.faint, fontSize: 13 },
  kidBadge: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: colors.gold,
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  deviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  tagCreate: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tagAdd: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  provRow: { paddingVertical: 13, paddingHorizontal: 14 },
  srcTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 9,
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
  host: { color: colors.faint, fontSize: 12, fontFamily: 'monospace', marginBottom: 11 },
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
