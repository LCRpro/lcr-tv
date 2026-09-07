'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type {
  ActiveSlotView,
  EpgStatus,
  ProviderKind,
  ProviderTestResult,
  ProviderView,
  SlotUsage,
  SyncStatus,
} from '@iptv/shared';
import { api, ApiError } from '../../../lib/api';
import { useAsync } from '../../../lib/hooks';
import { ErrorBand } from '../../../components/blocks';
import { Button, Dialog, Field, PasswordField, Switch, Tag } from '../../../components/kit';
import { Empty, PageHead, SkeletonList } from '../../../components/ui';
import { useIntlLocale, useT, type Translate } from '../../../lib/i18n';

/**
 * Les deux portes d'un même abonnement, ou deux sources différentes.
 *
 * Beaucoup de fournisseurs servent les deux : le panel donne les fiches, la
 * playlist donne les mêmes chaînes à plat. Le dire ici évite d'avoir à choisir
 * au hasard.
 */
const KINDS: { value: ProviderKind; label: string; note: string }[] = [
  { value: 'xtream', label: 'Panel Xtream', note: 'Identifiants — films, séries, connexions' },
  { value: 'm3u', label: 'Playlist M3U', note: 'Une adresse — chaînes seulement' },
];

interface SlotPayload {
  items: ActiveSlotView[];
  usage: SlotUsage;
}

const time = (iso: string, locale: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

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
 * L'adresse du panel, masquée.
 *
 * Elle identifie le fournisseur : elle n'a rien à faire en clair sur un écran
 * qu'on peut montrer ou capturer. Il en reste assez pour reconnaître la
 * sienne — le début, la fin, le port — et rien qui se recopie.
 */
function maskHost(url: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname;
    const hidden = '•'.repeat(Math.max(3, h.length - 6));
    return `${u.protocol}//${h.slice(0, 2)}${hidden}${h.slice(-4)}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '•••';
  }
}

/**
 * Mes abonnements.
 *
 * Cette page répond à une question par jour : « est-ce que ça marche, et
 * jusqu'à quand ». Chaque carte dit ce qui compte ce soir — connexions
 * libres, expiration, taille du catalogue — et le bloc Catalogue dit ce que
 * les sources ont donné, et quand. Le reste — adresses, identifiants — se
 * règle une fois, dans la boîte de modification.
 */
export default function AbonnementsPage() {
  const t = useT();
  const intl = useIntlLocale();
  const { data, error, loading, reload } = useAsync<{ items: ProviderView[] }>(
    () => api.get('/api/providers'),
    [],
  );
  const slots = useAsync<SlotPayload>(() => api.get('/api/me/slots'), []);
  const sync = useAsync<SyncStatus>(() => api.get('/api/providers/sync'), []);
  const epg = useAsync<EpgStatus>(() => api.get('/api/providers/epg'), []);

  const [results, setResults] = useState<Record<number, ProviderTestResult>>({});
  const [testing, setTesting] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ProviderView | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [job, setJob] = useState<'sync' | 'epg' | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);

  /*
   * Les lectures se rafraîchissent seules, pas les abonnements : une lecture
   * peut démarrer dans une autre pièce à tout moment, un abonnement ne change
   * que quand on le change ici.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      slots.reload();
      sync.reload();
      epg.reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [slots, sync, epg]);

  const test = async (id: number) => {
    setTesting(id);
    try {
      const result = await api.post<ProviderTestResult>(`/api/providers/${id}/test`);
      setResults((prev) => ({ ...prev, [id]: result }));
      reload();
    } finally {
      setTesting(null);
    }
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    setFormError(null);
    try {
      await api.post(`/api/providers/${id}/activate`, { isActive });
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('Modification impossible.'));
    }
  };

  /* Le travail est lancé puis relâché : le serveur répond 202 et continue en fond. */
  const runJob = async (kind: 'sync' | 'epg') => {
    setJob(kind);
    setJobMessage(null);
    try {
      await api.post(kind === 'sync' ? '/api/providers/sync' : '/api/providers/epg');
      setJobMessage(
        kind === 'sync'
          ? t('Synchronisation lancée. Elle dure plusieurs minutes ; le catalogue se remplit au fur et à mesure.')
          : t('Import de la grille lancé. Les programmes apparaîtront dans le Live une fois terminé.'),
      );
      sync.reload();
      epg.reload();
    } catch (err) {
      setJobMessage(err instanceof ApiError ? err.message : t('Lancement impossible.'));
    } finally {
      setJob(null);
    }
  };

  const items = data?.items ?? [];
  const nameOf = (id: number) => items.find((p) => p.id === id)?.name ?? `#${id}`;
  const usage = slots.data?.usage;
  const free = usage ? usage.max - usage.used : 0;
  const byProvider = new Map(usage?.providers.map((p) => [p.id, p]) ?? []);
  const playingOn = (id: number) => slots.data?.items.filter((s) => s.providerId === id) ?? [];
  const nf = (n: number) => n.toLocaleString(intl);
  const days = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

  const lastSync = sync.data;
  const syncDuration =
    lastSync?.startedAt && lastSync.finishedAt
      ? Math.round((new Date(lastSync.finishedAt).getTime() - new Date(lastSync.startedAt).getTime()) / 1000)
      : null;
  const busyJobs = job !== null || Boolean(sync.data?.running) || Boolean(epg.data?.running);

  return (
    <>
      <PageHead
        title="Mes abonnements"
        meta={
          data ? (
            <span className="page-count">
              <b>{items.filter((p) => p.isActive).length}</b>{' '}
              {t('actifs sur {n}', { n: items.length })}
            </span>
          ) : null
        }
        actions={
          <>
            {usage && usage.max > 0 && (
              <Tag tone={free > 0 ? 'on' : 'live'}>
                {free > 0
                  ? t(free > 1 ? '{free} connexions libres sur {max}' : '{free} connexion libre sur {max}', {
                      free,
                      max: usage.max,
                    })
                  : t('Tout occupé')}
              </Tag>
            )}
            <Button variant="primary" size="sm" onClick={() => setDialog('new')}>
              {t('Ajouter une source')}
            </Button>
          </>
        }
      />

      <ErrorBand error={error} />
      {formError && <div className="notice notice-error">{formError}</div>}

      {loading && !data ? (
        <SkeletonList count={2} />
      ) : items.length === 0 ? (
        <Empty>{t('Aucun abonnement. Ajoutez-en un pour voir apparaître vos chaînes, films et séries.')}</Empty>
      ) : (
        <div className="abos">
          {items.map((p) => {
            const slot = byProvider.get(p.id);
            const playing = playingOn(p.id);
            const result = results[p.id];
            const left = p.expiresAt ? days(p.expiresAt) : null;
            const answers = p.status == null ? null : /active/i.test(p.status);
            return (
              <article className="abo" key={p.id} data-off={!p.isActive || undefined}>
                <header className="abo-head">
                  <h2>{p.name}</h2>
                  <Tag>{p.kind === 'm3u' ? t('Playlist') : t('Panel')}</Tag>
                  <Switch
                    checked={p.isActive}
                    onChange={(next) => void toggleActive(p.id, next)}
                    label={p.isActive ? t('Désactiver {name}', { name: p.name }) : t('Activer {name}', { name: p.name })}
                  />
                </header>
                <span className="abo-host" title={t('L’adresse complète se lit dans « Modifier ».')}>
                  {maskHost(p.baseUrl)}
                </span>
                {p.sameAs.length > 0 && (
                  <Tag tone="accent">
                    {t('même fournisseur que {names}', { names: p.sameAs.map(nameOf).join(', ') })}
                  </Tag>
                )}

                {/* La jauge en cases : une par connexion, celles qui sont
                    prises en encre. C'est la seule chose qui change d'une
                    minute à l'autre. */}
                {p.isActive && slot && p.kind !== 'm3u' && (
                  <div className="gauge">
                    <div className="gauge-bar" aria-hidden>
                      {Array.from({ length: Math.max(1, slot.max) }, (_, i) => (
                        <i key={i} data-used={i < slot.used || undefined} />
                      ))}
                    </div>
                    <span>
                      {t(slot.max > 1 ? '{used} / {max} connexions' : '{used} / {max} connexion', {
                        used: slot.used,
                        max: slot.max,
                      })}
                      {' · '}
                      {slot.used >= slot.max
                        ? t('saturé')
                        : playing.length > 0
                          ? t('en cours : {what}', { what: playing.map((s) => s.itemLabel).join(', ') })
                          : t('libre')}
                    </span>
                  </div>
                )}

                {playing.length > 0 && (
                  <ul className="abo-playing">
                    {playing.map((s) => (
                      <li key={s.id}>
                        <span className="dot-live" />
                        <span className="clamp-1">{s.itemLabel}</span>
                        <button
                          className="link-btn"
                          onClick={async () => {
                            await api.del(`/api/me/slots/${s.id}`);
                            slots.reload();
                          }}
                        >
                          {t('Couper')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="abo-kv">
                  {p.kind !== 'm3u' && (
                    <div>
                      <dt>{t('Expire')}</dt>
                      <dd>
                        {left == null ? (
                          t('jamais testé')
                        ) : left < 0 ? (
                          <b className="abo-bad">{t('expiré')}</b>
                        ) : (
                          <>
                            <b>{t(left > 1 ? 'dans {n} jours' : 'dans {n} jour', { n: left })}</b> ·{' '}
                            {new Date(p.expiresAt!).toLocaleDateString(intl)}
                          </>
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('Dernière synchro')}</dt>
                    <dd>
                      {p.lastSyncAt ? `${ago(t, intl, p.lastSyncAt)} · ${time(p.lastSyncAt, intl)}` : t('jamais')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Catalogue')}</dt>
                    <dd>
                      {t('{vod} films · {live} chaînes · {series} séries', {
                        vod: nf(p.catalogue.vod),
                        live: nf(p.catalogue.live),
                        series: nf(p.catalogue.series),
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('État')}</dt>
                    <dd>
                      {answers == null ? (
                        <Tag>{t('jamais testé')}</Tag>
                      ) : answers ? (
                        <Tag tone="on">{t('répond')}</Tag>
                      ) : (
                        <Tag tone="live">{p.status}</Tag>
                      )}
                    </dd>
                  </div>
                </dl>

                {result && (
                  <p className="abo-result" data-ok={result.ok || undefined}>
                    {result.message}
                  </p>
                )}

                <footer className="abo-actions">
                  <Button size="sm" onClick={() => void test(p.id)} busy={testing === p.id} busyLabel={t('Test…')}>
                    {t('Tester')}
                  </Button>
                  <Button size="sm" onClick={() => setDialog(p)}>
                    {t('Modifier')}
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/*
        Le catalogue : ce que les sources ont donné, et quand.

        Un travail en cours se voit tant qu'il tourne — l'état vient du
        serveur, il survit au rafraîchissement comme au changement d'onglet.
      */}
      {items.length > 0 && (
        <section className="blk">
          <div className="blk-head">
            <h2>{t('Catalogue')}</h2>
            <span className="blk-note">{t('ce que les sources ont donné, et quand')}</span>
          </div>
          <div className="jobs">
            <div className="job" data-running={sync.data?.running || undefined}>
              {sync.data?.running ? <span className="spin" /> : (
                <b className="job-big">
                  {lastSync ? nf(lastSync.counts.live + lastSync.counts.vod + lastSync.counts.series) : '—'}
                </b>
              )}
              <span className="job-t">
                <b>
                  {sync.data?.running
                    ? t('Synchronisation en cours · étape « {phase} »', { phase: sync.data.phase })
                    : lastSync?.finishedAt
                      ? t('Dernière synchronisation · {when}', { when: ago(t, intl, lastSync.finishedAt) })
                      : t('Jamais synchronisé')}
                </b>
                <span>
                  {lastSync
                    ? t('{vod} films · {live} chaînes · {series} séries · {cats} catégories', {
                        vod: nf(lastSync.counts.vod),
                        live: nf(lastSync.counts.live),
                        series: nf(lastSync.counts.series),
                        cats: lastSync.counts.categories,
                      })
                    : ''}
                  {syncDuration != null && !sync.data?.running
                    ? ` · ${t('en {m} min {s} s', { m: Math.floor(syncDuration / 60), s: syncDuration % 60 })}`
                    : ''}
                  {lastSync?.error ? ` · ${lastSync.error}` : ''}
                </span>
              </span>
              <Button size="sm" onClick={() => void runJob('sync')} disabled={busyJobs} busy={job === 'sync'}>
                {t('Synchroniser')}
              </Button>
            </div>

            <div className="job" data-running={epg.data?.running || undefined}>
              {epg.data?.running ? <span className="spin" /> : (
                <b className="job-big">{epg.data ? nf(epg.data.totals.programmes) : '—'}</b>
              )}
              <span className="job-t">
                <b>
                  {epg.data?.running
                    ? t('Import de la grille TV en cours')
                    : epg.data?.finishedAt
                      ? t('Grille TV · {when}', { when: ago(t, intl, epg.data.finishedAt) })
                      : t('Grille TV jamais importée')}
                </b>
                <span>
                  {epg.data
                    ? t('{programmes} programmes sur {channels} chaînes', {
                        programmes: nf(epg.data.totals.programmes),
                        channels: nf(epg.data.totals.channels),
                      })
                    : ''}
                  {epg.data?.coverage
                    ? ` · ${t('{matched} de vos {total} chaînes ont un programme', {
                        matched: nf(epg.data.coverage.matched),
                        total: nf(epg.data.coverage.total),
                      })}`
                    : ''}
                </span>
              </span>
              <Button size="sm" onClick={() => void runJob('epg')} disabled={busyJobs} busy={job === 'epg'}>
                {t('Mettre à jour')}
              </Button>
            </div>
          </div>
          {jobMessage && !sync.data?.running && !epg.data?.running && (
            <div className="notice" style={{ marginTop: 'var(--space-3)' }}>
              {jobMessage}
            </div>
          )}
        </section>
      )}

      {dialog && (
        <ProviderDialog
          provider={dialog === 'new' ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/**
 * Ajout et modification dans la même boîte.
 *
 * Les deux posent les mêmes questions ; en séparer les écrans dupliquait le
 * formulaire pour la seule différence du verbe sur le bouton. À la
 * modification, les identifiants sont redemandés à leur propre route — ils ne
 * voyagent jamais avec la liste.
 */
function ProviderDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  /*
   * La sorte de source ne se change pas après coup : passer un panel en
   * playlist reviendrait à en créer une autre, et le catalogue déjà rattaché
   * ne se rattacherait plus à rien.
   */
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? 'xtream');
  const isM3u = kind === 'm3u';
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [epgUrl, setEpgUrl] = useState(provider?.epgUrl ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Une playlist n'a pas d'identifiants à redemander.
    if (!provider || provider.kind !== 'xtream') return;
    let cancelled = false;
    api
      .get<{ username: string; password: string }>(`/api/providers/${provider.id}/credentials`)
      .then((c) => {
        if (cancelled) return;
        setUsername(c.username);
        setPassword(c.password);
      })
      .catch(() => {
        // Déchiffrement impossible (MASTER_KEY changée) : les champs restent
        // vides et le formulaire redevient une saisie complète.
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (provider) {
        // Seuls les champs remplis partent : laisser les identifiants vides
        // veut dire « ne change pas ceux qui sont déjà en base ».
        const patch: Record<string, string> = { name, baseUrl };
        if (isM3u) patch.epgUrl = epgUrl;
        if (!isM3u && username) patch.username = username;
        if (!isM3u && password) patch.password = password;
        await api.patch(`/api/providers/${provider.id}`, patch);
      } else {
        await api.post('/api/providers', {
          kind,
          name,
          baseUrl,
          // Un abonnement qu'on ajoute est fait pour servir : actif d'emblée.
          isActive: true,
          ...(isM3u ? { epgUrl: epgUrl || undefined } : { username, password }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Enregistrement impossible.'));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      // Le serveur refuse de supprimer un abonnement actif ; la question vient
      // d'être posée en toutes lettres, alors on désactive d'abord.
      if (provider.isActive) {
        await api.post(`/api/providers/${provider.id}/activate`, { isActive: false });
      }
      await api.del(`/api/providers/${provider.id}`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Suppression impossible.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={provider ? t('Modifier la source') : t('Ajouter une source')}
      onClose={onClose}
      onSubmit={submit}
      lede={
        isM3u
          ? t('Une playlist est un simple fichier de chaînes : pas de compte, pas de connexions à partager, et pas de films ni de séries.')
          : t('Les identifiants sont chiffrés en AES-256-GCM avant d’être stockés et ne ressortent jamais — pas même pour un administrateur.')
      }
      actions={
        <>
          {provider &&
            (confirming ? (
              <Button variant="danger" onClick={remove} busy={busy} busyLabel={t('Suppression…')}>
                {t('Confirmer la suppression')}
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
                {t('Supprimer')}
              </Button>
            ))}
          <span className="spacer" />
          <Button onClick={confirming ? () => setConfirming(false) : onClose} disabled={busy}>
            {t('Annuler')}
          </Button>
          {!confirming && (
            <Button
              type="submit"
              variant="primary"
              disabled={!name || !baseUrl}
              busy={busy}
              busyLabel={t('Enregistrement…')}
            >
              {provider ? t('Enregistrer') : t('Ajouter')}
            </Button>
          )}
        </>
      }
    >
      {!provider && (
        <div className="kinds" role="radiogroup" aria-label={t('Type de source')}>
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              data-on={kind === option.value || undefined}
              onClick={() => setKind(option.value)}
            >
              <b>{t(option.label)}</b>
              <span>{t(option.note)}</span>
            </button>
          ))}
        </div>
      )}

      <Field
        label={t('Nom')}
        required
        autoFocus
        placeholder={isM3u ? t('Ma playlist') : t('Mon abonnement')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label={isM3u ? t('Adresse de la playlist') : t('URL du panel')}
        required
        type="url"
        placeholder={isM3u ? 'https://exemple.com/playlist.m3u' : 'http://exemple.tv:8080'}
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
      />
      {isM3u ? (
        <Field
          label={t('Grille TV (facultatif)')}
          type="url"
          placeholder="https://exemple.com/guide.xml"
          note={t('Une playlist ne dit pas où est sa grille : le fournisseur la donne à part.')}
          value={epgUrl}
          onChange={(e) => setEpgUrl(e.target.value)}
        />
      ) : (
        <>
          <Field
            label={t('Nom d’utilisateur')}
            required
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <PasswordField
            label={t('Mot de passe')}
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            reveal={reveal}
            onReveal={() => setReveal((r) => !r)}
            revealLabels={[t('Masquer le mot de passe'), t('Afficher le mot de passe')]}
          />
        </>
      )}

      {error && <div className="notice notice-error">{error}</div>}

      {confirming && (
        <div className="notice notice-warn">
          {t(
            'Supprimer « {name} » efface aussi son catalogue : chaînes, films, séries et les favoris qui pointaient dessus. Cette action est irréversible.',
            { name: provider?.name ?? '' },
          )}
        </div>
      )}
    </Dialog>
  );
}
