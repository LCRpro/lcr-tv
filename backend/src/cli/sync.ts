/**
 * Synchronisation du catalogue en ligne de commande — phase 1, sans HTTP ni auth.
 *
 *   pnpm --filter backend sync
 *   pnpm --filter backend sync --with-episodes --episode-limit 50
 *
 * Le job est idempotent : deux executions consecutives ne doivent rien dupliquer.
 */
import { closeDb } from '../db/client.js';
import { cliLog } from '../lib/logger.js';
import { abortSync, getSyncStatus, runSyncAll } from '../services/sync.js';

const args = process.argv.slice(2);
const withEpisodes = args.includes('--with-episodes');
const limitIndex = args.indexOf('--episode-limit');
const episodeLimit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;

// Ctrl+C doit interrompre proprement, pas laisser une transaction en vol.
process.on('SIGINT', () => {
  cliLog.warn('Interruption demandee, arret a la prochaine etape...');
  abortSync();
});

const started = Date.now();
try {
  await runSyncAll({
    withEpisodes,
    ...(Number.isFinite(episodeLimit) ? { episodeLimit: episodeLimit! } : {}),
    onLog: (m) => cliLog.info(m),
  });
  const status = await getSyncStatus();
  cliLog.info(
    `Volumetrie : ${status.totals?.live ?? 0} chaines, ${status.totals?.vod ?? 0} films, ` +
      `${status.totals?.series ?? 0} series, ${status.totals?.episodes ?? 0} episodes.`,
  );
  cliLog.info(`Duree : ${Math.round((Date.now() - started) / 1000)}s.`);
} catch (err) {
  cliLog.error(`Synchronisation echouee : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
