/**
 * Import de la grille XMLTV en ligne de commande.
 *
 *   pnpm --filter backend epg
 *
 * Le fichier fait couramment plusieurs centaines de megaoctets : il est lu en
 * flux et insere par lots, jamais charge en memoire.
 */
import { closeDb } from '../db/client.js';
import { cliLog } from '../lib/logger.js';
import { abortEpg, getEpgStatus, importEpgAll } from '../services/epg.js';

process.on('SIGINT', () => {
  cliLog.warn('Interruption demandee...');
  abortEpg();
});

const started = Date.now();
try {
  await importEpgAll({ onLog: (m) => cliLog.info(m) });
  const status = await getEpgStatus();
  cliLog.info(
    `En base : ${status.totals.programmes} programmes sur ${status.totals.channels} chaines.`,
  );
  cliLog.info(`Duree : ${Math.round((Date.now() - started) / 1000)}s.`);
} catch (err) {
  cliLog.error(`Import EPG echoue : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
