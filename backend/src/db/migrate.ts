import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, db } from './client.js';
import { cliLog } from '../lib/logger.js';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

try {
  cliLog.info(`Migrations depuis ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  cliLog.info('Migrations appliquees.');
} catch (err) {
  cliLog.error('Echec des migrations :', err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
