import Fastify, { LogController, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@iptv/shared';
import { env } from './config/env.js';
import { loggerOptions } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { redact } from './lib/redact.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { meRoutes } from './routes/me.js';
import { profileRoutes } from './routes/profiles.js';
import { providerRoutes } from './routes/providers.js';
import { playRoutes } from './routes/play.js';
import { adminRoutes } from './routes/admin.js';
import { tvRoutes } from './routes/tv.js';

/**
 * Une lecture genere des dizaines de requetes de segments par minute. Les
 * journaliser noierait tout le reste, alors qu'on veut garder la trace des
 * appels d'API. On coupe donc le log de requete pour les seules routes de flux.
 */
class StreamQuietLogController extends LogController {
  override isLogDisabled(request: FastifyRequest): boolean {
    if (super.isLogDisabled(request)) return true;
    if (env.LOG_LEVEL === 'debug') return false;
    return (
      request.url.startsWith('/api/play/segment') ||
      request.url.startsWith('/api/play/manifest') ||
      request.url.startsWith('/api/play/file')
    );
  }
}

export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    // Le proxy de segments renvoie des flux : pas de limite de taille de reponse,
    // mais on borne les corps entrants, qui sont tous petits.
    bodyLimit: 1024 * 512,
    logController: new StreamQuietLogController(),
  });

  await app.register(cors, {
    origin: env.webOrigins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    max: 10,
    timeWindow: '1 minute',
  });
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.error({ err }, redact(err.message));
      else req.log.debug({ code: err.code }, redact(err.message));
      return reply.code(err.statusCode).send(err.toBody());
    }
    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'BAD_REQUEST',
          message: 'Requete invalide.',
          details: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      };
      return reply.code(400).send(body);
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      const body: ApiErrorBody = {
        error: { code: 'RATE_LIMITED', message: 'Trop de tentatives, reessayez plus tard.' },
      };
      return reply.code(429).send(body);
    }

    req.log.error({ err }, 'Erreur non geree');
    const body: ApiErrorBody = {
      error: { code: 'INTERNAL', message: 'Erreur interne.' },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: 'Route inconnue.' },
    };
    return reply.code(404).send(body);
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(meRoutes, { prefix: '/api/me' });
  await app.register(profileRoutes, { prefix: '/api/profiles' });
  await app.register(providerRoutes, { prefix: '/api/providers' });
  await app.register(playRoutes, { prefix: '/api/play' });
  await app.register(tvRoutes, { prefix: '/api/tv' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}
