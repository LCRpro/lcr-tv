import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { providerCreateSchema, providerUpdateSchema } from '@iptv/shared';
import {
  createProvider,
  deleteProvider,
  getActiveProviders,
  listProviders,
  providerCredentials,
  providerMutedProfiles,
  setProviderActive,
  setProviderEnabledForProfile,
  testProvider,
  updateProvider,
} from '../services/providers.js';
import { getSyncStatus, runSyncAll } from '../services/sync.js';
import { epgCoverage, getEpgStatus, importEpgAll, isEpgRunning } from '../services/epg.js';
import { AppError } from '../lib/errors.js';
import { ctx, viewerOf } from '../plugins/auth.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Les abonnements du compte connecte.
 *
 * Ils vivaient sous `/api/admin` du temps ou le catalogue etait unique et
 * partage. Chaque compte apportant desormais les siens, ce n'est plus une
 * affaire d'administration : la spec §5.1 dit d'ailleurs que les identifiants
 * du provider ne sont « jamais renvoyes par l'API meme a un admin ». Un
 * abonnement d'autrui repond « introuvable » — son existence meme ne regarde
 * pas celui qui demande.
 *
 * Ces routes n'exigent qu'une session, pas un profil : ajouter son abonnement
 * est ce qu'on fait juste apres s'etre inscrit, avant meme d'avoir un
 * catalogue a regarder.
 */
export const providerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', async (req) => {
    const v = viewerOf(req);
    return { items: await listProviders(v.id, v.profileId) };
  });

  app.post('/', async (req, reply) => {
    const input = providerCreateSchema.parse(req.body);
    const created = await createProvider({ ...input, userId: ctx(req).user.id });
    return reply.code(201).send(created);
  });

  app.patch('/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    // Seuls les champs presents sont pris en compte : l'UI n'envoie jamais les
    // identifiants qu'elle n'a pas, puisqu'elle ne les recoit jamais.
    const patch = providerUpdateSchema.parse(req.body);
    return updateProvider(id, ctx(req).user.id, patch);
  });

  /**
   * Les identifiants d'un abonnement, en clair, a son proprietaire.
   *
   * Route a part et non un champ du listing : ils ne partent que sur un geste
   * explicite — l'oeil du formulaire de modification — et jamais avec la liste
   * qu'on recharge a chaque visite de la page.
   */
  app.get('/:id/credentials', async (req) => {
    const { id } = idParams.parse(req.params);
    return providerCredentials(id, ctx(req).user.id);
  });

  app.post('/:id/test', async (req) => {
    const { id } = idParams.parse(req.params);
    return testProvider(id, ctx(req).user.id);
  });

  app.delete('/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    await deleteProvider(id, ctx(req).user.id);
    return { ok: true };
  });

  /**
   * Bascule d'activation. Plusieurs abonnements peuvent etre actifs : leurs
   * connexions simultanees s'additionnent.
   */
  app.post('/:id/activate', async (req) => {
    const { id } = idParams.parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean().default(true) }).parse(req.body ?? {});
    return setProviderActive(id, ctx(req).user.id, isActive);
  });

  // Le profil courant (dés)active une source partagée, pour lui seul.
  app.post('/:id/profile-enable', async (req) => {
    const { id } = idParams.parse(req.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body ?? {});
    const v = viewerOf(req);
    await setProviderEnabledForProfile(v.id, v.profileId, id, enabled);
    return { ok: true };
  });

  // Quels profils du foyer ont éteint cette source (pour l'éditeur de source).
  app.get('/:id/profile-access', async (req) => {
    const { id } = idParams.parse(req.params);
    return { mutedProfileIds: await providerMutedProfiles(ctx(req).user.id, id) };
  });

  // Régler l'accès d'un profil précis à une source, depuis l'éditeur.
  app.post('/:id/profile-access', async (req) => {
    const { id } = idParams.parse(req.params);
    const { profileId, enabled } = z
      .object({ profileId: z.coerce.number().int().positive(), enabled: z.boolean() })
      .parse(req.body ?? {});
    await setProviderEnabledForProfile(ctx(req).user.id, profileId, id, enabled);
    return { ok: true };
  });

  // -------------------------------------------------------------- sync

  app.get('/sync', async (req) => getSyncStatus(ctx(req).user.id));

  /**
   * Synchronise **ses** abonnements.
   *
   * La synchronisation reste un travail unique pour toute la machine : elle
   * ecrit dans les memes tables et sature la meme connexion sortante. Deux
   * comptes qui la lancent en meme temps se marchent dessus, d'ou le verrou
   * partage — le second recoit un 409 explicite plutot qu'un catalogue a
   * moitie ecrit.
   */
  app.post('/sync', async (req, reply) => {
    const { withEpisodes } = z
      .object({ withEpisodes: z.boolean().default(false) })
      .parse(req.body ?? {});
    const userId = ctx(req).user.id;

    // Verifie ici et pas dans la tache de fond : lancee en arriere-plan,
    // l'erreur se perdrait dans les logs et le client recevrait un 202 menteur.
    await getActiveProviders(userId);

    // Le sync dure plusieurs minutes : on repond immediatement et le front
    // suit la progression via GET /api/providers/sync.
    void runSyncAll({ userId, withEpisodes, onLog: (m) => req.log.info(m) }).catch((err) =>
      req.log.error({ err }, 'Synchronisation echouee'),
    );

    return reply.code(202).send(await getSyncStatus(userId));
  });

  // --------------------------------------------------------------- epg

  /**
   * Grille de **ses** abonnements.
   *
   * La couverture est rapportee a ses chaines a lui : un pourcentage calcule
   * sur toute la machine ne dirait rien de ce que cet ecran-ci affichera.
   */
  app.get('/epg', async (req) => {
    const status = await getEpgStatus();
    return {
      ...status,
      coverage: await epgCoverage(ctx(req).user.id).catch(() => undefined),
    };
  });

  app.post('/epg', async (req, reply) => {
    const userId = ctx(req).user.id;
    // Verifie ici et pas dans la tache de fond, pour la meme raison que le sync.
    await getActiveProviders(userId);
    if (isEpgRunning()) {
      throw new AppError(409, 'CONFLICT', 'Un import EPG est deja en cours.');
    }
    void importEpgAll({ userId, onLog: (m) => req.log.info(m) }).catch((err) =>
      req.log.error({ err }, 'Import EPG echoue'),
    );
    return reply.code(202).send(await getEpgStatus());
  });
};
