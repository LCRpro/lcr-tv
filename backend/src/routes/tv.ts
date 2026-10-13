import type { FastifyPluginAsync } from 'fastify';
import { tvPairClaimSchema, tvPairPollSchema, tvPairStartSchema } from '@iptv/shared';
import { claimPairing, pollPairing, startPairing } from '../services/tv-pairing.js';
import { ctx } from '../plugins/auth.js';

/**
 * L'association d'un téléviseur.
 *
 * `start` et `poll` sont publics : le téléviseur n'a pas encore de session,
 * c'est justement ce qu'il vient chercher. `claim` exige une session — c'est
 * l'utilisateur, depuis le site ou son application, qui rattache la TV à son
 * compte. Le profil de la TV est celui que le réclamant a choisi, ou « qui
 * regarde ? » s'il n'en a pas.
 */
export const tvRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/start',
    // Un téléviseur ne démarre qu'une poignée de fois : on borne sans gêner.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const input = tvPairStartSchema.parse(req.body ?? {});
      return startPairing({
        deviceLabel: input.deviceLabel,
        userAgent: req.headers['user-agent'],
      });
    },
  );

  app.post(
    '/poll',
    // Le téléviseur sonde toutes les quelques secondes : la borne est large.
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const { deviceSecret } = tvPairPollSchema.parse(req.body);
      return pollPairing(deviceSecret);
    },
  );

  app.post(
    '/claim',
    {
      preHandler: [app.requireAuth],
      // Le code est court : on borne fort la réclamation pour couper l'énumération.
      config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { code } = tvPairClaimSchema.parse(req.body);
      const { user, profile } = ctx(req);
      return claimPairing(user.id, profile?.id ?? null, code);
    },
  );
};
