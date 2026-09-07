'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DeviceSession, ProviderView } from '@iptv/shared';
import { languageTag } from '@iptv/shared';
import { api, ApiError } from '../../../lib/api';
import { useAsync } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import { useIntlLocale, useT, type Translate } from '../../../lib/i18n';
import { Avatar } from '../../../components/Avatar';
import { ErrorBand, SettingRow } from '../../../components/blocks';
import { Button, ButtonLink, Dialog, Field, Switch, Tag } from '../../../components/kit';
import { Empty, PageHead, SkeletonList } from '../../../components/ui';

/** Même exigence qu'à l'inscription. */
const MIN_PASSWORD = 10;

/** Depuis quand, en une expression — l'horodatage exact reste dans l'infobulle. */
function ago(t: Translate, intl: string, iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return t("à l'instant");
  if (min < 60) return t('il y a {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('il y a {n} h', { n: h });
  const d = Math.round(h / 24);
  if (d === 1) return t('hier');
  if (d < 30) return t('il y a {n} jours', { n: d });
  return new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'long' });
}

/**
 * Un appareil, deviné de son agent utilisateur.
 *
 * « Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 … » ne se lit
 * pas ; « Chrome sur Windows » si. Les outils en ligne de commande — curl,
 * scripts — vont ensemble : ce sont des tests, pas des personnes.
 */
type Device = { key: string; label: string; icon: 'desktop' | 'phone' | 'tool' };

function deviceOf(t: Translate, ua: string | null): Device {
  const s = ua ?? '';
  if (!s || /curl|wget|node|python|okhttp|postman|insomnia|httpie/i.test(s)) {
    return { key: 'tool', label: t('Outils en ligne de commande'), icon: 'tool' };
  }
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\//.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : t('Navigateur');
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Android/.test(s)
      ? 'Android'
      : /iPhone|iPad/.test(s)
        ? 'iOS'
        : /Mac OS/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : '';
  const mobile = /Android|iPhone|iPad|Mobile/.test(s);
  return {
    key: `${browser}|${os}`,
    label: os ? t('{browser} sur {os}', { browser, os }) : browser,
    icon: mobile ? 'phone' : 'desktop',
  };
}

/**
 * Mon compte.
 *
 * Qui je suis à gauche, ce que je règle à droite. On ouvre son compte pour une
 * chose précise — changer un mot de passe, couper un appareil, ajouter un
 * profil — et on doit la trouver sans lire : les groupes et la carte à gauche
 * donnent des repères. Les appareils sont regroupés par type : dix-sept
 * sessions dont quinze viennent d'un outil de test ne font pas dix-sept lignes.
 */
export default function ComptePage() {
  const t = useT();
  const intl = useIntlLocale();
  const { user, profile, profiles, refresh, sessionId } = useSession();
  const sessions = useAsync<{ items: DeviceSession[] }>(() => api.get('/api/me/sessions'), []);
  const providers = useAsync<{ items: ProviderView[] }>(() => api.get('/api/providers'), []);

  const [adult, setAdult] = useState(user?.canWatchAdult ?? false);
  const [adultBusy, setAdultBusy] = useState(false);
  const [dialog, setDialog] = useState<'email' | 'password' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (user) setAdult(user.canWatchAdult);
  }, [user]);

  /*
   * Bascule optimiste, remise en place si le serveur refuse ; `refresh()`
   * remet ensuite la session d'accord avec la base — c'est elle qui décide.
   */
  const setAdultSetting = async (value: boolean) => {
    setAdult(value);
    setAdultBusy(true);
    try {
      await api.patch('/api/me/settings', { canWatchAdult: value });
      await refresh();
    } catch {
      setAdult(!value);
    } finally {
      setAdultBusy(false);
    }
  };

  /* Les appareils, regroupés : celui-ci d'abord, puis les autres par type. */
  const groups = useMemo(() => {
    const items = sessions.data?.items ?? [];
    const map = new Map<string, { device: Device; items: DeviceSession[] }>();
    for (const s of items) {
      const device = deviceOf(t, s.userAgent);
      const key = s.current ? 'current' : device.key;
      const g = map.get(key) ?? { device, items: [] };
      g.items.push(s);
      map.set(key, g);
    }
    return [...map.entries()]
      .map(([key, g]) => ({ key, ...g, last: g.items[0]!.lastSeenAt }))
      .sort((a, b) => (a.key === 'current' ? -1 : b.key === 'current' ? 1 : b.last.localeCompare(a.last)));
  }, [sessions.data, t]);
  const others = (sessions.data?.items ?? []).filter((s) => !s.current).length;

  const revokeMany = async (key: string, ids: number[]) => {
    setBusyKey(key);
    try {
      await Promise.all(ids.map((id) => api.del(`/api/me/sessions/${id}`)));
      sessions.reload();
    } finally {
      setBusyKey(null);
    }
  };

  const revokeOthers = async () => {
    setBusyKey('all');
    try {
      await api.del('/api/me/sessions');
      sessions.reload();
    } finally {
      setBusyKey(null);
    }
  };

  if (!user || !profile) return null;
  const activeProviders = providers.data?.items.filter((p) => p.isActive).length ?? null;

  return (
    <>
      <PageHead
        title="Mon compte"
        actions={
          <ButtonLink size="sm" href="/abonnements">
            {t('Mes abonnements')}
          </ButtonLink>
        }
      />

      {message && <div className="notice">{message}</div>}

      <div className="acct">
        {/* La carte d'identité : qui, avec quoi, depuis quand. */}
        <aside className="acct-side">
          <Avatar avatar={profile.avatar} color={profile.color} size={96} />
          <h2>{profile.name}</h2>
          <span className="acct-mail">{user.email}</span>
          <div className="acct-tags">
            {user.role === 'admin' && <Tag tone="accent">{t('Administrateur')}</Tag>}
            <Tag>{t(profiles.length > 1 ? '{n} profils' : '{n} profil', { n: profiles.length })}</Tag>
          </div>
          <span className="acct-since">
            {activeProviders != null
              ? t(activeProviders > 1 ? '{n} abonnements actifs' : '{n} abonnement actif', {
                  n: activeProviders,
                })
              : ''}
          </span>
        </aside>

        <div className="acct-rows">
          <section className="rowset">
            <header className="rowset-head">
              <b>{t('Accès')}</b>
              <span>{t('ce qui sert à se connecter')}</span>
            </header>
            <div className="rowset-body">
              <SettingRow
                media={<span className="rowset-ic">@</span>}
                title={t('Adresse e-mail')}
                detail={user.email}
                actions={
                  <Button size="sm" onClick={() => setDialog('email')}>
                    {t('Modifier')}
                  </Button>
                }
              />
              <SettingRow
                media={<span className="rowset-ic">••</span>}
                title={t('Mot de passe')}
                detail={t('{min} caractères minimum. Le changer déconnecte vos autres appareils.', {
                  min: MIN_PASSWORD,
                })}
                actions={
                  <Button size="sm" onClick={() => setDialog('password')}>
                    {t('Modifier')}
                  </Button>
                }
              />
            </div>
          </section>

          {/*
            Les profils en pastilles, avec leurs langues : c'est ce qui
            distingue vraiment deux profils du même foyer. Le lien porte
            l'identifiant, le sélecteur ouvre directement la bonne fiche.
          */}
          <section className="rowset">
            <header className="rowset-head">
              <b>{t('Profils')}</b>
              <span>
                {t('{n} sur 6 · chaque profil garde sa liste, son historique et ses chaînes', {
                  n: profiles.length,
                })}
              </span>
            </header>
            <div className="rowset-body profs">
              {profiles.map((p) => (
                <Link className="prof" key={p.id} href={`/profils?edit=${p.id}`}>
                  <Avatar avatar={p.avatar} color={p.color} size={34} />
                  <span className="prof-t">
                    <b>
                      {p.name}
                      {p.id === profile.id ? ` · ${t('actif')}` : ''}
                    </b>
                    <span>
                      {p.languages.map((code) => languageTag(code)?.flag ?? code).join(' ')}
                      {' · '}
                      {p.isKid ? t('enfant') : p.canWatchAdult ? t('adulte autorisé') : t('tout public')}
                    </span>
                  </span>
                </Link>
              ))}
              {profiles.length < 6 && (
                <Link className="prof" data-add href="/profils?nouveau=1">
                  <span className="prof-plus">+</span>
                  <span className="prof-t">
                    <b>{t('Ajouter un profil')}</b>
                  </span>
                </Link>
              )}
            </div>
          </section>

          <section className="rowset">
            <header className="rowset-head">
              <b>{t('Contenu')}</b>
            </header>
            <div className="rowset-body">
              <SettingRow
                media={<span className="rowset-ic">18</span>}
                title={t('Catégories adultes')}
                detail={t(
                  'Le plafond du compte. Chaque profil doit ensuite l’activer pour lui-même, et un profil enfant reste fermé quoi qu’il arrive.',
                )}
                actions={
                  <Switch
                    checked={adult}
                    onChange={(next) => void setAdultSetting(next)}
                    label={t('Autoriser les catégories adultes')}
                    disabled={adultBusy}
                  />
                }
              />
            </div>
          </section>

          <section className="rowset">
            <header className="rowset-head">
              <b>{t('Appareils')}</b>
              <span>
                {sessions.data
                  ? `${t(sessions.data.items.length > 1 ? '{n} sessions' : '{n} session', {
                      n: sessions.data.items.length,
                    })} · ${t(groups.length > 1 ? '{n} groupes' : '{n} groupe', { n: groups.length })}`
                  : ''}
              </span>
              <span className="spacer" />
              {others > 0 && (
                <Button size="sm" onClick={() => void revokeOthers()} busy={busyKey === 'all'}>
                  {t('Déconnecter tout sauf celui-ci')}
                </Button>
              )}
            </header>
            <div className="rowset-body">
              <ErrorBand error={sessions.error} />
              {sessions.loading && !sessions.data ? (
                <SkeletonList count={3} />
              ) : groups.length === 0 ? (
                <Empty>{t('Aucune session active.')}</Empty>
              ) : (
                groups.map((g) => {
                  const labels = [...new Set(g.items.map((s) => s.deviceLabel).filter(Boolean))];
                  const current = g.key === 'current';
                  return (
                    <SettingRow
                      key={g.key}
                      media={<span className="rowset-ic"><DeviceIcon kind={g.device.icon} /></span>}
                      title={g.device.label}
                      badges={
                        <>
                          {current && <Tag tone="on">{t('cet appareil')}</Tag>}
                          {g.items.length > 1 && (
                            <Tag>{t('{n} sessions', { n: g.items.length })}</Tag>
                          )}
                        </>
                      }
                      detail={
                        <>
                          {labels.length > 0 ? `${labels.join(', ')} · ` : ''}
                          {current ? t("à l'instant") : ago(t, intl, g.last)}
                          {g.items.length === 1
                            ? ` · ${t('expire le {date}', {
                                date: new Date(g.items[0]!.expiresAt).toLocaleDateString(intl),
                              })}`
                            : ''}
                        </>
                      }
                      actions={
                        /* Se déconnecter soi-même se fait par le menu du compte :
                           le bouton ici ferait perdre la page sous les pieds. */
                        current && g.items.length === 1 ? null : (
                          <Button
                            size="sm"
                            busy={busyKey === g.key}
                            onClick={() =>
                              void revokeMany(
                                g.key,
                                g.items.filter((s) => !s.current).map((s) => s.id),
                              )
                            }
                          >
                            {g.items.filter((s) => !s.current).length > 1
                              ? t('Déconnecter les {n}', {
                                  n: g.items.filter((s) => !s.current).length,
                                })
                              : t('Déconnecter')}
                          </Button>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {dialog && (
        <CredentialDialog
          kind={dialog}
          currentEmail={user.email}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null);
            setMessage(text);
            await refresh();
            sessions.reload();
          }}
        />
      )}
    </>
  );
}

function DeviceIcon({ kind }: { kind: Device['icon'] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'phone') {
    return (
      <svg {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
        <path d="M11 18h2" />
      </svg>
    );
  }
  if (kind === 'tool') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2.2" />
        <path d="M7 9l3 3-3 3M12 15h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

/**
 * Adresse et mot de passe dans la même boîte.
 *
 * Les deux exigent le mot de passe actuel — l'adresse est l'identifiant de
 * connexion, et un navigateur laissé ouvert suffirait sinon à se faire remettre
 * le compte.
 */
function CredentialDialog({
  kind,
  currentEmail,
  onClose,
  onDone,
}: {
  kind: 'email' | 'password';
  currentEmail: string;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(currentEmail);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'email') {
        await api.post('/api/auth/email', { password, email });
        await onDone(t('Adresse changée. C’est elle qui sert désormais à se connecter.'));
      } else {
        await api.post('/api/auth/password', { currentPassword: password, newPassword: next });
        await onDone(t('Mot de passe changé. Vos autres appareils ont été déconnectés.'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Changement impossible.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={kind === 'email' ? t('Changer d’adresse') : t('Changer de mot de passe')}
      onClose={onClose}
      onSubmit={submit}
      lede={
        kind === 'email'
          ? t('L’adresse sert à se connecter : votre mot de passe actuel est demandé pour la modifier.')
          : t('{min} caractères minimum. Vos autres appareils seront déconnectés, mais pas celui-ci.', {
              min: MIN_PASSWORD,
            })
      }
      actions={
        <>
          <span className="spacer" />
          <Button onClick={onClose} disabled={busy}>
            {t('Annuler')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={mismatch}
            busy={busy}
            busyLabel={t('Enregistrement…')}
          >
            {t('Enregistrer')}
          </Button>
        </>
      }
    >
      {kind === 'email' && (
        <Field
          label={t('Nouvelle adresse')}
          type="email"
          required
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      <Field
        label={t('Mot de passe actuel')}
        type="password"
        required
        autoFocus={kind === 'password'}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {kind === 'password' && (
        <>
          <Field
            label={t('Nouveau mot de passe')}
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Field
            label={t('Confirmation')}
            type="password"
            required
            autoComplete="new-password"
            error={mismatch ? t('Les deux mots de passe diffèrent.') : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </>
      )}
      {error && <div className="notice notice-error">{error}</div>}
    </Dialog>
  );
}
