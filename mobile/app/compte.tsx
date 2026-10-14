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
            <ProviderRow provider={p} />
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
              <Avatar avatar={profile.avatar} color={profile.color} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={cs.name} numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text style={cs.heroEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
              <Focusable
                onPress={() => router.push(`/profil/${profile.id}`)}
                hitSlop={8}
                style={cs.heroEdit}
              >
                <Ionicons name="create-outline" size={20} color={colors.dim} />
              </Focusable>
            </View>
          ) : null}

          {wide ? (
            <View style={cs.columns}>
              <View style={cs.column}>
                <Group items={left} />
              </View>
              <View style={cs.column}>
                <Group items={right} />
              </View>
            </View>
          ) : (
            <Group items={stacked} />
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
    <View>
      <Focusable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [cs.accHeader, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={icon} size={20} color={open ? colors.accent : colors.dim} />
        <Text style={cs.accTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        {count != null ? <Text style={cs.accCount}>{count}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.faint} />
      </Focusable>
      {open ? (
        <View style={cs.accBody}>
          {subtitle ? <Text style={cs.sectionSub}>{subtitle}</Text> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Un groupe de sections, dans une seule surface discrète.
 *
 * Plutôt que sept cartes identiques empilées, un conteneur unique où les
 * sections se séparent d'un filet : la page redevient une liste de réglages,
 * pas une collection de blocs.
 */
function Group({ items }: { items: ReactNode[] }) {
  const list = items.filter(Boolean);
  return (
    <View style={cs.group}>
      {list.map((node, i) => (
        <View key={i}>
          {i > 0 ? <View style={cs.groupLine} /> : null}
          {node}
        </View>
      ))}
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
/**
 * Une source, en ligne nette — comme un profil.
 *
 * Plus de carte dense : juste l'icône, le nom et la flèche qui ouvre l'éditeur,
 * où vivent l'activation du compte et le choix des profils. On ne pose un mot à
 * droite que pour signaler une exception — éteinte au compte, ou ignorée par ce
 * profil-ci — sinon la ligne reste aussi sobre que celle d'un profil utilisé.
 */
function ProviderRow({ provider }: { provider: ProviderView }) {
  const router = useRouter();
  const state = !provider.isActive ? 'éteinte' : !provider.enabledHere ? 'ignorée ici' : null;

  return (
    <Focusable
      onPress={() => router.push(`/source/${provider.id}`)}
      style={({ pressed }) => [cs.row, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="server-outline" size={20} color={colors.dim} />
      <Text style={cs.rowLabel} numberOfLines={1}>
        {provider.name}
      </Text>
      <Text style={cs.kind}>{provider.kind === 'm3u' ? 'M3U' : 'PANEL'}</Text>
      <View style={{ flex: 1 }} />
      {state ? <Text style={cs.rowValue}>{state}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Focusable>
  );
}

const cs = {
  content: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%' as const, maxWidth: 900, alignSelf: 'center' as const },
  // Le profil, posé à même le fond : pas de carte autour, elle n'apportait rien.
  hero: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    marginTop: 4,
    marginBottom: 22,
    paddingHorizontal: 2,
  },
  name: { color: colors.text, fontFamily: 'Outfit', fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  heroEmail: { color: colors.dim, fontFamily: 'Inter', fontSize: 13.5, marginTop: 2 },
  heroEdit: { padding: 8 },

  columns: { flexDirection: 'row' as const, gap: 14, alignItems: 'flex-start' as const },
  column: { flex: 1, minWidth: 0 },

  sectionSub: {
    color: colors.faint,
    fontFamily: 'Inter' as const,
    fontSize: 12.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    lineHeight: 17,
  },
  // Une seule surface pour toute la liste ; les sections se séparent d'un filet.
  group: {
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  groupLine: { height: 1, backgroundColor: colors.border },
  accHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accTitle: { color: colors.text, fontFamily: 'Outfit', fontSize: 15.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  accCount: {
    color: colors.faint,
    fontFamily: 'Inter' as const,
    fontSize: 13,
    marginRight: 6,
    fontVariant: ['tabular-nums' as const],
  },
  accBody: { paddingBottom: 6 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },

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
};
