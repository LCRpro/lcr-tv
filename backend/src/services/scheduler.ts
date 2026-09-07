import type { FastifyBaseLogger } from 'fastify';
import { listAllActiveProviders } from './providers.js';
import { primeCatalogCache } from './catalog.js';
import { runSyncAll } from './sync.js';
import { purgeExpiredSessions } from './auth.js';
import { importEpgAll } from './epg.js';
import { runTmdbEnrichment } from './tmdb.js';
import { env } from '../config/env.js';

/** Heure locale du sync quotidien : la nuit, quand personne ne regarde. */
const SYNC_HOUR = 4;

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(SYNC_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Job quotidien. Volontairement un simple minuteur plutot qu'un cron externe :
 * il n'y a qu'un backend, et le sync est idempotent — le rater une nuit
 * n'a pas de consequence.
 */
export function startDailySync(log: FastifyBaseLogger): () => void {
  let timer: NodeJS.Timeout;

  const schedule = () => {
    const delay = msUntilNextRun();
    log.info(`Prochaine synchronisation dans ${Math.round(delay / 60000)} minute(s).`);
    timer = setTimeout(async () => {
      try {
        const active = await listAllActiveProviders();
        if (active.length > 0) {
          await runSyncAll({ onLog: (m) => log.info(m) });

          // Le sync vient de vider le cache de catalogue. Le remplir tout de
          // suite evite que la premiere visite du matin paye les quatre
          // secondes de recalcul.
          await warmCatalogCache(log);

          // EPG et TMDB sont des jobs de confort : leur echec ne doit pas
          // remonter comme un echec de synchronisation du catalogue.
          await importEpgAll({ onLog: (m) => log.debug(m) }).catch((err) =>
            log.warn({ err }, 'Import EPG quotidien echoue'),
          );
          if (env.TMDB_API_KEY) {
            await runTmdbEnrichment({ limit: 500, onLog: (m) => log.debug(m) }).catch(
              (err) => log.warn({ err }, 'Enrichissement TMDB quotidien echoue'),
            );
          }
        } else {
          log.warn('Synchronisation quotidienne ignoree : aucun abonnement actif.');
        }
        const purged = await purgeExpiredSessions();
        if (purged > 0) log.info(`${purged} session(s) expiree(s) purgee(s).`);
      } catch (err) {
        log.error({ err }, 'Synchronisation quotidienne echouee');
      } finally {
        schedule();
      }
    }, delay);
    timer.unref();
  };

  schedule();
  // Au demarrage aussi : un redemarrage laisse le cache vide, et c'est
  // justement le moment ou quelqu'un ouvre l'application.
  void warmCatalogCache(log);
  return () => clearTimeout(timer);
}

/**
 * Prepare le catalogue de chaque compte qui en a un.
 *
 * En tache de fond et sans jamais faire echouer l'appelant : un cache froid
 * ralentit une page, il n'empeche rien.
 */
async function warmCatalogCache(log: FastifyBaseLogger): Promise<void> {
  try {
    const active = await listAllActiveProviders();
    const owners = [...new Set(active.map((p) => p.userId))];
    await Promise.all(
      owners.map((id) =>
        primeCatalogCache(id).catch((err) =>
          log.warn({ err, userId: id }, 'Prechauffage du catalogue echoue'),
        ),
      ),
    );
    if (owners.length > 0) log.info(`Catalogue prechauffe pour ${owners.length} compte(s).`);
  } catch (err) {
    log.warn({ err }, 'Prechauffage du catalogue echoue');
  }
}
