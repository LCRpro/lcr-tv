/**
 * Cree le premier compte administrateur. Sans inscription publique, c'est le
 * seul moyen d'entrer dans l'application.
 *
 *   pnpm --filter backend seed:admin moi@exemple.fr "un-mot-de-passe-long"
 *
 * Sans mot de passe en argument, un mot de passe aleatoire est genere et
 * affiche une seule fois.
 */
import { randomBytes } from 'node:crypto';
import { closeDb } from '../db/client.js';
import { cliLog } from '../lib/logger.js';
import { seedAdmin } from '../services/auth.js';

const [emailArg, passwordArg] = process.argv.slice(2);

if (!emailArg) {
  cliLog.error('Usage : seed:admin <email> [mot-de-passe]');
  process.exit(1);
}

const password = passwordArg ?? randomBytes(12).toString('base64url');

try {
  const result = await seedAdmin(emailArg, password);
  if (!result.created) {
    cliLog.warn(
      'Des comptes existent deja : aucun admin cree. Passez par /admin/users pour en ajouter un.',
    );
  } else {
    cliLog.info(`Administrateur cree : ${result.email}`);
    if (!passwordArg) {
      cliLog.info(`Mot de passe genere (note-le, il ne sera plus affiche) : ${password}`);
    }
  }
} catch (err) {
  cliLog.error(`Echec : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
