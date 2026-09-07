import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { profileInputSchema } from '@iptv/shared';
import {
  clearProfile,
  createProfile,
  deleteProfile,
  listProfiles,
  selectProfile,
  updateProfile,
} from '../services/profiles.js';
import { ctx } from '../plugins/auth.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Profils du compte connecte.
 *
 * Ces routes exigent une session mais **pas** un profil choisi : c'est ici
 * qu'on le choisit. Elles sont les seules dans ce cas — tout le catalogue passe
 * par `viewerOf`, qui refuse tant que la question « qui regarde ? » n'a pas de
 * reponse.
 */
export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const { user } = ctx(req);
    return { items: await listProfiles(user.id, user.canWatchAdult) };
  });

  app.post('/', async (req) => {
    const { user } = ctx(req);
    const input = profileInputSchema.parse(req.body);
    return createProfile(user.id, user.canWatchAdult, input);
  });

  app.patch('/:id', async (req) => {
    const { user } = ctx(req);
    const { id } = idParams.parse(req.params);
    const input = profileInputSchema.parse(req.body);
    return updateProfile(user.id, user.canWatchAdult, id, input);
  });

  app.delete('/:id', async (req) => {
    const { user } = ctx(req);
    const { id } = idParams.parse(req.params);
    await deleteProfile(user.id, id);
    return { ok: true };
  });

  /** Attache le profil a la session : le choix survit au rechargement. */
  app.post('/:id/select', async (req) => {
    const { user, session } = ctx(req);
    const { id } = idParams.parse(req.params);
    return selectProfile(user.id, user.canWatchAdult, session.id, id);
  });

  /** Repasse par le selecteur sans se deconnecter. */
  app.post('/leave', async (req) => {
    await clearProfile(ctx(req).session.id);
    return { ok: true };
  });
};
