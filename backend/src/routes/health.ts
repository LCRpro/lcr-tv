import type { FastifyPluginAsync } from 'fastify';
import { sql as raw } from 'drizzle-orm';
import { db } from '../db/client.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    try {
      await db.execute(raw`select 1`);
      return { status: 'ok', db: 'up', uptimeSec: Math.round(process.uptime()) };
    } catch (err) {
      app.log.error({ err }, 'Health : base injoignable');
      return reply
        .code(503)
        .send({ status: 'degraded', db: 'down', uptimeSec: Math.round(process.uptime()) });
    }
  });
};
