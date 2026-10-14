import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { resolveToken, type AuthContext } from '../services/auth.js';
import type { Viewer } from '../services/catalog.js';

export const SESSION_COOKIE = 'iptv_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** preHandler : exige une session valide, quel que soit le transport. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler : exige une session valide avec le role admin. */
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Un seul middleware pour deux transports :
 *  - web    : cookie httpOnly / Secure / SameSite=Lax
 *  - mobile : header Authorization: Bearer
 * Le reste de l'application ne sait pas d'ou vient le token.
 */
function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const value = header.slice(7).trim();
    if (value) return value;
  }
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie ? cookie : null;
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('auth', null);

  fastify.addHook('onRequest', async (req) => {
    const token = extractToken(req);
    req.auth = token ? await resolveToken(token) : null;
  });

  fastify.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentification requise.');
    }
  });

  fastify.decorate('requireAdmin', async (req: FastifyRequest) => {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentification requise.');
    }
    if (req.auth.user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Reserve aux administrateurs.');
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth' });

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Raccourci pour les handlers proteges : la session est garantie par le preHandler. */
export function ctx(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentification requise.');
  return req.auth;
}

/**
 * Qui regarde, du point de vue du catalogue.
 *
 * Le compte et le profil ne repondent pas a la meme question : le compte dit de
 * quel abonnement viennent les flux et combien de connexions restent, le profil
 * dit a qui appartiennent les favoris et la progression. Les deux voyagent
 * ensemble, sans quoi chaque appelant devrait s'en souvenir.
 *
 * L'acces adulte est l'intersection des deux : le compte pose le plafond
 * (l'administrateur le controle), le profil ne peut qu'en retirer. Un profil
 * enfant est ferme quoi qu'autorise le compte.
 */
export function viewerOf(req: FastifyRequest): Viewer {
  const { user, profile } = ctx(req);
  if (!profile) {
    throw new AppError(409, 'NO_PROFILE', 'Choisissez un profil avant de continuer.');
  }
  return {
    id: user.id,
    profileId: profile.id,
    canWatchAdult: user.canWatchAdult && profile.canWatchAdult && !profile.isKid,
    languages: profile.languages,
    langFilters: {
      vod: profile.langFilterVod,
      series: profile.langFilterSeries,
      live: profile.langFilterLive,
    },
    uiLanguage: profile.uiLanguage,
  };
}
