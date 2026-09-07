'use client';

import { Button, ButtonLink } from './kit';

import type { SyncStatus } from '@iptv/shared';
import { useSession } from '../lib/session';
import { useT } from '../lib/i18n';

const PHASE_LABELS: Record<string, string> = {
  idle: 'en attente',
  categories: 'catégories',
  live: 'chaînes en direct',
  vod: 'films',
  series: 'séries',
  done: 'terminée',
  failed: 'échouée',
};

/**
 * Ecran de premier lancement. Une grille vide laisserait croire a un bug ;
 * on montre ce qui se passe et ce qu'il reste a faire.
 */
export function SyncWaiting({
  status,
  onRefresh,
}: {
  status: SyncStatus | null;
  onRefresh: () => void;
}) {
  const { user } = useSession();
  const t = useT();
  const isAdmin = user?.role === 'admin';
  const running = status?.running ?? false;
  const failed = status?.phase === 'failed';

  return (
    <div className="empty" style={{ maxWidth: 560, margin: '60px auto' }}>
      {running ? (
        <>
          <span className="spin" />
          <h1 style={{ marginTop: 16 }}>{t('Première synchronisation en cours')}</h1>
          <p className="muted">
            Étape : {PHASE_LABELS[status?.phase ?? 'idle'] ?? status?.phase}. Le catalogue
            apparaîtra ici automatiquement.
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            {status?.counts.live ?? 0} chaînes · {status?.counts.vod ?? 0} films ·{' '}
            {status?.counts.series ?? 0} séries récupérées.
          </p>
        </>
      ) : failed ? (
        <>
          <h1>{t('La synchronisation a échoué')}</h1>
          <p className="muted">{status?.error}</p>
        </>
      ) : (
        <>
          <h1>{t('Catalogue vide')}</h1>
          <p className="muted">
            {t('Aucune synchronisation n’a encore rempli le catalogue.')}{' '}
            {isAdmin ? t('Lancez-en une depuis l’administration.') : t('Prévenez l’administrateur.')}
          </p>
        </>
      )}

      <div className="inline" style={{ justifyContent: 'center', marginTop: 20 }}>
        <Button onClick={onRefresh}>
          {t('Actualiser')}
        </Button>
        {isAdmin && (
          <ButtonLink variant="primary" href="/admin/sync">
            {t('Administration → Synchronisation')}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
