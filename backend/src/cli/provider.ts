/**
 * Gestion des providers en ligne de commande, avant toute interface.
 *
 *   pnpm --filter backend provider list
 *   pnpm --filter backend provider add "Mon abo" http://host:port USER PASS --activate
 *   pnpm --filter backend provider test 1
 *   pnpm --filter backend provider activate 1
 *
 * Un abonnement appartient a un compte. Sans `--user`, c'est celui du premier
 * administrateur : sur une installation familiale il n'y en a souvent qu'un, et
 * demander l'adresse a chaque commande serait du ceremonial.
 */
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { users } from '../db/schema.js';
import { cliLog } from '../lib/logger.js';
import {
  createProvider,
  deleteProvider,
  listProviders,
  setProviderActive,
  testProvider,
} from '../services/providers.js';

const [command, ...args] = process.argv.slice(2);

function usage(): never {
  cliLog.info(
    [
      'Usage :',
      '  provider list                        [--user <email>]',
      '  provider add <nom> <base-url> <username> <password> [--activate] [--user <email>]',
      '  provider test <id>                   [--user <email>]',
      '  provider activate <id>               [--user <email>]',
      '  provider deactivate <id>             [--user <email>]',
      '  provider remove <id>                 [--user <email>]',
      '',
      "Sans --user, le compte du premier administrateur.",
    ].join('\n'),
  );
  process.exit(1);
}

/** Le compte proprietaire : `--user <email>`, sinon le premier administrateur. */
async function ownerId(): Promise<number> {
  const at = args.indexOf('--user');
  const email = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && !email) usage();

  const [row] = email
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1)
    : await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(users.id)
        .limit(1);

  if (!row) {
    cliLog.error(
      email ? `Aucun compte pour ${email}.` : 'Aucun administrateur : creez-en un dabord.',
    );
    process.exit(1);
  }
  return row.id;
}

try {
  switch (command) {
    case 'list': {
      const rows = await listProviders(await ownerId());
      if (rows.length === 0) cliLog.info('Aucun provider enregistre.');
      for (const p of rows) {
        cliLog.info(
          `#${p.id} ${p.isActive ? '[actif]  ' : '[inactif]'} ${p.name} — ${p.baseUrl} ` +
            `— user ${p.usernameMasked} — max ${p.maxConnections ?? '?'} ` +
            `— dernier sync ${p.lastSyncAt ?? 'jamais'}`,
        );
      }
      break;
    }
    case 'add': {
      const [name, baseUrl, username, password] = args;
      if (!name || !baseUrl || !username || !password) usage();
      const owner = await ownerId();
      const created = await createProvider({
        userId: owner,
        name,
        baseUrl,
        username,
        password,
        isActive: args.includes('--activate'),
      });
      cliLog.info(`Provider #${created.id} cree${created.isActive ? ' et active' : ''}.`);
      const result = await testProvider(created.id, owner);
      cliLog.info(`Test : ${result.ok ? 'OK' : 'ECHEC'} — ${result.message}`);
      break;
    }
    case 'test': {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) usage();
      const result = await testProvider(id, await ownerId());
      cliLog.info(`${result.ok ? 'OK' : 'ECHEC'} — ${result.message}`);
      if (result.expiresAt) cliLog.info(`Expiration de l'abonnement : ${result.expiresAt}`);
      break;
    }
    case 'activate':
    case 'deactivate': {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) usage();
      const active = command === 'activate';
      const p = await setProviderActive(id, await ownerId(), active);
      cliLog.info(
        `Abonnement #${p.id} "${p.name}" est desormais ${active ? 'actif' : 'inactif'}.`,
      );
      break;
    }
    case 'remove': {
      const id = Number(args[0]);
      if (!Number.isInteger(id)) usage();
      await deleteProvider(id, await ownerId());
      cliLog.info(`Provider #${id} supprime.`);
      break;
    }
    default:
      usage();
  }
} catch (err) {
  cliLog.error(`Echec : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
