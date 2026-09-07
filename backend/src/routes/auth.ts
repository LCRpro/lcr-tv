import type { FastifyPluginAsync } from 'fastify';
import {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  signupSchema,
  type LoginResponse,
  type SignupPolicy,
} from '@iptv/shared';
import {
  changeEmail,
  changePassword,
  login,
  revokeSession,
  signup,
  toCurrentUser,
} from '../services/auth.js';
import { clearSessionCookie, ctx, setSessionCookie } from '../plugins/auth.js';
import { ensureProfile, listProfiles, toProfile } from '../services/profiles.js';
import { mosaicPosters } from '../services/catalog.js';
import { env } from '../config/env.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    {
      // Le seul endpoint ou une force brute a un sens : on le borne.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const { user, session, token } = await login({
        email: input.email,
        password: input.password,
        deviceLabel: input.deviceLabel,
        userAgent: req.headers['user-agent'],
      });

      const body: LoginResponse = {
        user: toCurrentUser(user),
        expiresAt: session.expiresAt.toISOString(),
      };

      if (input.transport === 'bearer') {
        // Mobile : le token est stocke dans expo-secure-store, pas dans un cookie.
        body.token = token;
      } else {
        setSessionCookie(reply, token, session.expiresAt);
      }
      return body;
    },
  );

  /**
   * Ce que la page de connexion doit savoir avant d'afficher quoi que ce soit.
   *
   * Public : il n'y a rien a proteger dans « les inscriptions sont ouvertes »,
   * et le cacher obligerait le front a deviner. Le code lui-meme, lui, ne sort
   * evidemment jamais.
   */
  app.get('/signup-policy', async (): Promise<SignupPolicy> => ({ mode: env.SIGNUP_MODE }));

  /**
   * Les affiches de la page de connexion.
   *
   * Public, comme la page : c'est le seul ecran que voit quelqu'un qui n'a pas
   * de compte, et il doit montrer ce qu'il y a derriere. Rien d'identifiant
   * n'en sort — des adresses d'images TMDB, jamais celles du fournisseur.
   */
  app.get('/mosaic', async () => ({ items: await mosaicPosters() }));

  app.post(
    '/signup',
    {
      // Meme borne que la connexion : c'est l'autre porte d'entree, et creer
      // des comptes en rafale remplirait la base aussi vite qu'une force brute.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const input = signupSchema.parse(req.body);
      const { user, session, token } = await signup({
        email: input.email,
        password: input.password,
        profileName: input.profileName,
        code: input.code,
        deviceLabel: input.deviceLabel,
        userAgent: req.headers['user-agent'],
      });

      const body: LoginResponse = {
        user: toCurrentUser(user),
        expiresAt: session.expiresAt.toISOString(),
      };
      if (input.transport === 'bearer') body.token = token;
      else setSessionCookie(reply, token, session.expiresAt);

      return reply.code(201).send(body);
    },
  );

  app.post('/logout', { preHandler: [app.requireAuth] }, async (req, reply) => {
    await revokeSession(ctx(req).session.id);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: [app.requireAuth] }, async (req) => {
    const { user, session, profile } = ctx(req);
    /*
     * La liste des profils voyage avec la session.
     *
     * Le front doit savoir des le premier appel s'il montre le selecteur ou le
     * catalogue ; en deux requetes, l'ecran clignotait de l'un a l'autre.
     */
    await ensureProfile(user.id);
    return {
      user: toCurrentUser(user),
      profile: profile ? toProfile(profile, user.canWatchAdult) : null,
      profiles: await listProfiles(user.id, user.canWatchAdult),
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    };
  });

  app.post('/email', { preHandler: [app.requireAuth] }, async (req) => {
    const input = changeEmailSchema.parse(req.body);
    const { user } = ctx(req);
    return { email: await changeEmail(user.id, input.password, input.email) };
  });

  app.post('/password', { preHandler: [app.requireAuth] }, async (req) => {
    const input = changePasswordSchema.parse(req.body);
    const { user, session } = ctx(req);
    await changePassword(user.id, input.currentPassword, input.newPassword, session.id);
    return { ok: true };
  });
};
