import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  providerCreateSchema,
  providerUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '@iptv/shared';
import { ctx } from '../plugins/auth.js';
import { AppError } from '../lib/errors.js';
import { accountDetail, createUser, listUsers, updateUser } from '../services/auth.js';
import {
  createProvider,
  deleteProvider,
  listAllActiveProviders,
  listProviders,
  setProviderActive,
  testProvider,
  updateProvider,
} from '../services/providers.js';
import { abortSync, getSyncStatus, isSyncRunning, runSyncAll } from '../services/sync.js';
import { killSlot, listActiveSlots, slotUsage } from '../services/slots.js';
import { abortEpg, epgCoverage, getEpgStatus, importEpgAll, isEpgRunning } from '../services/epg.js';
import { abortTmdb, getTmdbStatus, runTmdbEnrichment } from '../services/tmdb.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Au moins un abonnement actif quelque part dans la maison.
 *
 * Les travaux d'administration — synchronisation nocturne, import EPG — ne
 * servent pas un compte mais la machine entiere. Ils n'ont donc rien a faire si
 * personne n'a d'abonnement, et le dire ici evite un 202 mensonger suivi d'un
 * echec qui se perdrait dans les logs.
 */
async function assertAnyActiveProvider(): Promise<void> {
  const active = await listAllActiveProviders();
  if (active.length === 0) {
    throw new AppError(
      409,
      'NO_ACTIVE_PROVIDER',
      "Aucun abonnement actif sur cette installation : personne n'en a encore ajoute.",
    );
  }
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin);

  /*
   * Les abonnements ont quitte l'administration.
   *
   * Chaque compte apporte les siens : ils vivent sous `/api/providers`, et la
   * spec §5.1 interdit de toute facon d'en exposer les identifiants « meme a un
   * admin ». Restent ici les comptes, la synchronisation de la maison entiere
   * et les travaux de fond.
   */

  // ----------------------------------------------------------------- users

  app.get('/users', async () => ({ items: await listUsers() }));

  app.post('/users', async (req, reply) => {
    const input = userCreateSchema.parse(req.body);
    const created = await createUser(input);
    return reply.code(201).send(created);
  });

  /** Detail d'un compte, deplie a la demande dans la liste. */
  app.get('/users/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return accountDetail(id);
  });

  app.patch('/users/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = userUpdateSchema.parse(req.body);
    await updateUser(id, patch, ctx(req).user.id);
    return { ok: true };
  });

  // ------------------------------------------------------------------ sync

  app.get('/sync', async () => getSyncStatus());

  app.post('/sync', async (req, reply) => {
    const { withEpisodes } = z
      .object({ withEpisodes: z.boolean().default(false) })
      .parse(req.body ?? {});

    await assertAnyActiveProvider();
    if (isSyncRunning()) {
      throw new AppError(409, 'SYNC_ALREADY_RUNNING', 'Une synchronisation est deja en cours.');
    }

    // Le sync dure plusieurs minutes : on repond immediatement et le front suit
    // la progression via GET /admin/sync.
    void runSyncAll({
      withEpisodes,
      onLog: (m) => req.log.info(m),
    }).catch((err) => req.log.error({ err }, 'Synchronisation echouee'));

    return reply.code(202).send(await getSyncStatus());
  });

  app.post('/sync/abort', async () => ({ aborted: abortSync() }));

  // ------------------------------------------------------------------- epg

  app.get('/epg', async () => {
    const status = await getEpgStatus();
    // La couverture est le seul indicateur utile : une grille enorme mais
    // rattachee a aucune chaine ne sert a rien.
    return { ...status, coverage: await epgCoverage().catch(() => undefined) };
  });

  app.post('/epg', async (req, reply) => {
    // Les conditions d'echec immediates (pas de provider actif, import deja en
    // cours) sont verifiees ici : lancees en tache de fond, elles se
    // perdraient dans les logs et le client recevrait un 202 mensonger.
    await assertAnyActiveProvider();
    if (isEpgRunning()) {
      throw new AppError(409, 'CONFLICT', 'Un import EPG est deja en cours.');
    }

    void importEpgAll({ onLog: (m) => req.log.info(m) }).catch((err) =>
      req.log.error({ err }, 'Import EPG echoue'),
    );
    return reply.code(202).send(await getEpgStatus());
  });

  app.post('/epg/abort', async () => ({ aborted: abortEpg() }));

  // ------------------------------------------------------------------ tmdb

  app.get('/tmdb', async () => getTmdbStatus());

  app.post('/tmdb', async (req, reply) => {
    const { limit, retryFailed } = z
      .object({
        limit: z.coerce.number().int().min(1).max(2000).default(200),
        retryFailed: z.boolean().default(false),
      })
      .parse(req.body ?? {});

    const status = await getTmdbStatus();
    if (!status.configured) {
      throw new AppError(
        409,
        'BAD_REQUEST',
        "TMDB_API_KEY n'est pas configuree : renseignez-la dans .env puis redemarrez le backend.",
      );
    }
    if (status.running) {
      throw new AppError(409, 'CONFLICT', 'Un enrichissement TMDB est deja en cours.');
    }

    void runTmdbEnrichment({ limit, retryFailed, onLog: (m) => req.log.info(m) }).catch(
      (err) => req.log.error({ err }, 'Enrichissement TMDB echoue'),
    );
    return reply.code(202).send(status);
  });

  app.post('/tmdb/abort', async () => ({ aborted: abortTmdb() }));

  // ----------------------------------------------------------------- slots

  app.get('/slots', async () => ({
    items: await listActiveSlots(),
    usage: await slotUsage(),
  }));

  app.delete('/slots/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    await killSlot(id);
    return { ok: true };
  });
};
