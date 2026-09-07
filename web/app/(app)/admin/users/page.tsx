'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AdminUserView, SignupPolicy } from '@iptv/shared';
import { api, ApiError } from '../../../../lib/api';
import { useAsync } from '../../../../lib/hooks';
import { useSession } from '../../../../lib/session';
import { ErrorBand } from '../../../../components/blocks';
import { Button, Dialog, Field, SelectField, Tag } from '../../../../components/kit';
import { Empty, PageHead, SkeletonList } from '../../../../components/ui';
import { useIntlLocale, useT, type Translate } from '../../../../lib/i18n';

/** Même exigence qu'à l'inscription. */
const MIN_PASSWORD = 10;

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

const POLICIES: Array<{ mode: SignupPolicy['mode']; label: string; text: string }> = [
  {
    mode: 'open',
    label: 'Ouverte',
    text: 'Toute personne qui arrive sur la page de connexion peut créer un compte.',
  },
  {
    mode: 'code',
    label: 'Sur code',
    text: 'Il faut un code d’invitation, donné par vous.',
  },
  {
    mode: 'closed',
    label: 'Fermée',
    text: 'Seul un administrateur crée des comptes, depuis cette page.',
  },
];

/**
 * Comptes.
 *
 * L'administration ne garde que ce qui n'appartient à personne : ouvrir un
 * accès, le fermer, décider qui d'autre peut le faire. Un tableau, cinq
 * colonnes — deux comptes aujourd'hui, peut-être dix demain, et un tableau se
 * lit à dix lignes là où une liste de blocs dépliables non. La question qu'un
 * administrateur se pose — « qui peut entrer ? » — inclut ceux qui ne sont pas
 * encore là : l'inscription est au même endroit.
 */
export default function UsersPage() {
  const t = useT();
  const intl = useIntlLocale();
  const { user: me } = useSession();
  const { data, error, loading, reload } = useAsync<{ items: AdminUserView[] }>(
    () => api.get('/api/admin/users'),
    [],
  );
  const policy = useAsync<SignupPolicy>(() => api.get('/api/auth/signup-policy'), []);
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const patch = async (id: number, body: Record<string, unknown>) => {
    setFormError(null);
    try {
      await api.patch(`/api/admin/users/${id}`, body);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('Modification impossible.'));
    }
  };

  const items = data?.items ?? [];
  const active = items.filter((u) => u.isActive).length;

  return (
    <>
      <PageHead
        title="Comptes"
        meta={
          data ? (
            <span className="page-count">
              <b>{items.length}</b> {t(items.length > 1 ? 'comptes' : 'compte')} ·{' '}
              {t(active > 1 ? '{n} actifs' : '{n} actif', { n: active })}
            </span>
          ) : null
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            {t('Créer un compte')}
          </Button>
        }
      />

      <ErrorBand error={error} />
      {formError && <div className="notice notice-error">{formError}</div>}

      {loading && !data ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <Empty>{t('Aucun compte.')}</Empty>
      ) : (
        <div className="tbl" role="table">
          <div className="tbl-row tbl-head" role="row">
            <span>{t('Compte')}</span>
            <span>{t('État')}</span>
            <span>{t('Sessions')}</span>
            <span>{t('Abonnements')}</span>
            <span>{t('Dernier accès')}</span>
            <span />
          </div>
          {items.map((u) => {
            const self = u.id === me?.id;
            return (
              <div className="tbl-row" role="row" key={u.id} data-off={!u.isActive || undefined}>
                <span className="tbl-who">
                  <span className="tbl-av" aria-hidden>
                    {u.email[0]?.toUpperCase()}
                  </span>
                  <span>
                    <b>{u.email}</b>
                    <span>
                      {u.role === 'admin' ? t('administrateur') : t('utilisateur')} ·{' '}
                      {t('créé le {date}', { date: new Date(u.createdAt).toLocaleDateString(intl) })}
                    </span>
                  </span>
                </span>
                <span>
                  {u.isActive ? <Tag tone="on">{t('actif')}</Tag> : <Tag>{t('désactivé')}</Tag>}
                  {self && <Tag>{t('vous')}</Tag>}
                </span>
                <span>
                  {u.sessionCount}
                  {u.sessionCount > 5 && <Tag tone="warn">{t('beaucoup')}</Tag>}
                </span>
                <span>
                  {t(u.activeProviders > 1 ? '{n} actifs' : '{n} actif', { n: u.activeProviders })}
                </span>
                <span>{u.lastSeenAt ? ago(t, intl, u.lastSeenAt) : <span className="tbl-sub">{t('jamais')}</span>}</span>
                <span>
                  {/* Rien sur son propre compte : se retirer l'administration ou
                      se désactiver ferme la porte de l'intérieur. */}
                  {self ? (
                    <span className="tbl-sub">{t('Votre compte')}</span>
                  ) : (
                    <RowMenu
                      items={[
                        {
                          label: u.role === 'admin' ? t('Retirer l’admin') : t('Passer admin'),
                          onPick: () => void patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }),
                        },
                        {
                          label: u.isActive ? t('Désactiver') : t('Réactiver'),
                          onPick: () => void patch(u.id, { isActive: !u.isActive }),
                          danger: u.isActive,
                        },
                      ]}
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/*
        La politique d'inscription, lue depuis le serveur.

        Elle vit dans une variable d'environnement : la page la montre et dit
        où elle se règle, elle ne la change pas — la changer d'ici est un
        réglage côté serveur qui n'existe pas encore.
      */}
      <section className="blk">
        <div className="blk-head">
          <h2>{t('Inscription')}</h2>
          <span className="blk-note">{t('qui peut créer un compte sur cette installation')}</span>
        </div>
        <div className="policy">
          {POLICIES.map((p) => (
            <div className="pol" key={p.mode} data-on={policy.data?.mode === p.mode || undefined}>
              <b>{t(p.label)}</b>
              <span>
                {t(p.text)}
                {policy.data?.mode === p.mode ? ` ${t('C’est le réglage actuel.')}` : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="blk-note">{t('Se règle côté serveur, par la variable SIGNUP_MODE.')}</p>
      </section>

      {adding && (
        <NewUserDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </>
  );
}

/**
 * Les actions d'une ligne, dans un menu.
 *
 * Deux boutons pleins par ligne pesaient autant que le compte lui-même. Le
 * menu s'ouvre au clic et se ferme au clic ailleurs ou à Échap.
 */
function RowMenu({
  items,
}: {
  items: Array<{ label: string; onPick: () => void; danger?: boolean }>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('Actions')}>
        ···
      </Button>
      {open && (
        <div className="menu-panel" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              data-danger={item.danger || undefined}
              onClick={() => {
                setOpen(false);
                item.onPick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Création d'un compte par l'administration.
 *
 * Utile quand l'inscription est fermée ou pour ouvrir un accès à quelqu'un qui
 * n'a pas encore d'adresse à donner. Le compte créé est ordinaire et fermé aux
 * catégories adultes : il posera son propre plafond.
 */
function NewUserDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/admin/users', { email, password, role });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Création impossible.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('Créer un compte')}
      onClose={onClose}
      onSubmit={submit}
      lede={t(
        'Le compte devra ajouter son propre abonnement : il n’hérite ni du catalogue ni des connexions de qui que ce soit.',
      )}
      actions={
        <>
          <span className="spacer" />
          <Button onClick={onClose} disabled={busy}>
            {t('Annuler')}
          </Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel={t('Création…')}>
            {t('Créer')}
          </Button>
        </>
      }
    >
      <Field
        label={t('Adresse e-mail')}
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label={t('Mot de passe provisoire')}
        type="password"
        required
        minLength={MIN_PASSWORD}
        autoComplete="new-password"
        note={t('{min} caractères minimum. À transmettre en main propre : il ne sera plus lisible ensuite.', {
          min: MIN_PASSWORD,
        })}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <SelectField
        label={t('Rôle')}
        value={role}
        onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
      >
        <option value="user">{t('Utilisateur')}</option>
        <option value="admin">{t('Administrateur')}</option>
      </SelectField>
      {error && <div className="notice notice-error">{error}</div>}
    </Dialog>
  );
}
