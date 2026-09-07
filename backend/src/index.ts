import { env } from './config/env.js';
import { closeDb } from './db/client.js';
import { buildServer } from './server.js';
import { purgeExpiredSessions } from './services/auth.js';
import { releaseStaleSlots } from './services/slots.js';
import { startDailySync } from './services/scheduler.js';

const app = await buildServer();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error({ err }, 'Demarrage impossible');
  process.exit(1);
}

const purged = await purgeExpiredSessions();
if (purged > 0) app.log.info(`${purged} session(s) expiree(s) purgee(s).`);

/**
 * Les slots abandonnes (onglet ferme brutalement, mobile tue) ne se liberent
 * qu'au balayage : sans lui, un slot fantome bloque tout le monde.
 */
const slotSweeper = setInterval(() => {
  releaseStaleSlots().catch((err) => app.log.error({ err }, 'Balayage des slots'));
}, 30_000);
slotSweeper.unref();

const stopScheduler = startDailySync(app.log);

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} recu, arret.`);
  clearInterval(slotSweeper);
  stopScheduler();
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
