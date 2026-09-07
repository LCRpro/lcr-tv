/**
 * Enrichissement TMDB en ligne de commande.
 *
 *   pnpm --filter backend tmdb -- --limit 500
 *   pnpm --filter backend tmdb -- --retry-failed
 *
 * Job separe du sync : les metadonnees Xtream sont mauvaises, mais un echec ici
 * ne doit jamais empecher le catalogue de se remplir.
 */
import { closeDb } from '../db/client.js';
import { cliLog } from '../lib/logger.js';
import { abortTmdb, getTmdbStatus, runTmdbEnrichment } from '../services/tmdb.js';

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
const retryFailed = args.includes('--retry-failed');

process.on('SIGINT', () => {
  cliLog.warn('Interruption demandee...');
  abortTmdb();
});

try {
  await runTmdbEnrichment({
    ...(Number.isFinite(limit) ? { limit: limit! } : {}),
    retryFailed,
    onLog: (m) => cliLog.info(m),
  });
  const status = await getTmdbStatus();
  cliLog.info(
    `Films enrichis : ${status.movies.enriched}/${status.movies.total} — ` +
      `series : ${status.series.enriched}/${status.series.total}.`,
  );
} catch (err) {
  cliLog.error(`Enrichissement echoue : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
