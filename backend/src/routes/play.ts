import { Readable } from 'node:stream';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { playBodySchema, playParamsSchema } from '@iptv/shared';
import { ctx, viewerOf } from '../plugins/auth.js';
import { AppError } from '../lib/errors.js';
import { safeUrl } from '../lib/redact.js';
import { describeFetchError } from '../lib/fetch-errors.js';
import { verifyTicket, type TicketPayload } from '../lib/tickets.js';
import {
  decodeUpstream,
  renewTicket,
  rewriteManifest,
  startPlayback,
  upstreamUrlFor,
} from '../services/playback.js';
import { heartbeatSlot, isSlotAlive, releaseSlot } from '../services/slots.js';
import type { Viewer } from '../services/catalog.js';

const ticketQuery = z.object({
  ticket: z.string().min(10),
  s: z.string().optional(),
  sig: z.string().optional(),
});

const slotBody = z.object({ slotId: z.coerce.number().int().positive() });

/**
 * Les routes de flux ne voient jamais de session : `<video>` et hls.js
 * n'envoient pas de header Authorization sur les segments. Elles ne valident
 * donc que le ticket, et verifient que le slot correspondant est toujours vivant.
 */
async function requireTicket(req: FastifyRequest): Promise<TicketPayload> {
  const { ticket } = ticketQuery.parse(req.query);
  const payload = verifyTicket(ticket);
  if (!(await isSlotAlive(payload.s, payload.u))) {
    throw new AppError(
      409,
      'CONFLICT',
      'La lecture a ete liberee. Relancez le contenu.',
    );
  }
  return payload;
}

/** Relais en flux : jamais de bufferisation complete, et on coupe si le client part. */
async function pipeUpstream(
  req: FastifyRequest,
  reply: FastifyReply,
  url: string,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.raw.on('close', abort);

  const headers: Record<string, string> = { 'User-Agent': 'IPTV-Personal/1.0' };
  const range = req.headers.range;
  if (typeof range === 'string') headers['Range'] = range;

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
  } catch (err) {
    req.raw.off('close', abort);
    if (controller.signal.aborted) {
      // Le client a ferme l'onglet : ce n'est pas une erreur a journaliser.
      return;
    }
    throw new AppError(
      502,
      'PROVIDER_UNREACHABLE',
      `Flux injoignable (${describeFetchError(err)}) : ${safeUrl(url)}.`,
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    req.raw.off('close', abort);
    throw new AppError(
      502,
      'PROVIDER_UNREACHABLE',
      `Le fournisseur a repondu ${upstream.status} sur ${safeUrl(url)}.`,
    );
  }

  for (const header of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
  ]) {
    const value = upstream.headers.get(header);
    if (value) reply.header(header, value);
  }
  reply.code(upstream.status);

  if (!upstream.body) {
    req.raw.off('close', abort);
    return reply.send();
  }
  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
  stream.on('close', () => req.raw.off('close', abort));
  return reply.send(stream);
}

export const playRoutes: FastifyPluginAsync = async (app) => {
  // --------------------------------------------------- ouverture (session)

  app.post('/:type/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const { type, id } = playParamsSchema.parse(req.params);
    const { mode } = playBodySchema.parse(req.body ?? {});
    const { session } = ctx(req);
    const viewer: Viewer = viewerOf(req);
    return startPlayback({
      viewer,
      sessionId: session.id,
      itemType: type,
      itemId: id,
      mode,
    });
  });

  /**
   * Renouvellement de ticket en cours de lecture. Le ticket vit 15 minutes,
   * un film dure plus : on renouvelle sans toucher a la session ni au slot.
   */
  app.post('/renew', { preHandler: [app.requireAuth] }, async (req) => {
    const { ticket } = z.object({ ticket: z.string().min(10) }).parse(req.body);
    const { user } = ctx(req);
    let payload: TicketPayload;
    try {
      payload = verifyTicket(ticket);
    } catch (err) {
      // Un ticket expire est precisement le cas a renouveler : on l'accepte,
      // la session (verifiee juste au-dessus) fait foi.
      if (err instanceof AppError && err.code === 'TICKET_EXPIRED') {
        payload = JSON.parse(
          Buffer.from(ticket.slice(0, ticket.lastIndexOf('.')), 'base64url').toString('utf8'),
        ) as TicketPayload;
      } else {
        throw err;
      }
    }
    return renewTicket(payload, viewerOf(req));
  });

  app.post('/heartbeat', { preHandler: [app.requireAuth] }, async (req) => {
    const { slotId } = slotBody.parse(req.body);
    await heartbeatSlot(slotId, ctx(req).user.id);
    return { ok: true };
  });

  app.post('/release', { preHandler: [app.requireAuth] }, async (req) => {
    const { slotId } = slotBody.parse(req.body);
    await releaseSlot(slotId, ctx(req).user.id);
    return { ok: true };
  });

  // ------------------------------------------------------- flux (ticket seul)

  /**
   * Manifest HLS. Sert aussi bien le manifest racine (resolu depuis le ticket)
   * que les playlists de variante rencontrees dedans (parametre `s` signe).
   */
  app.get('/manifest.m3u8', async (req, reply) => {
    const payload = await requireTicket(req);
    const { ticket, s, sig } = ticketQuery.parse(req.query);
    const url = s ? decodeUpstream(s, sig) : await upstreamUrlFor(payload);

    const controller = new AbortController();
    req.raw.on('close', () => controller.abort());
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'IPTV-Personal/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    }).catch((err: Error) => {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        `Manifest injoignable (${describeFetchError(err)}) : ${safeUrl(url)}.`,
      );
    });

    if (!upstream.ok) {
      throw new AppError(
        502,
        'PROVIDER_UNREACHABLE',
        `Le fournisseur a repondu ${upstream.status} sur le manifest.`,
      );
    }

    // Un manifest fait quelques kilo-octets : le lire entierement est sans risque,
    // contrairement aux segments.
    const body = await upstream.text();
    // `upstream.url` tient compte des redirections : les URIs relatives doivent
    // etre resolues par rapport a l'emplacement final, pas a celui demande.
    const rewritten = rewriteManifest(body, upstream.url || url, ticket);

    return reply
      .header('content-type', 'application/vnd.apple.mpegurl')
      .header('cache-control', 'no-store')
      .send(rewritten);
  });

  /** Segments : streames tels quels, aucune transformation. */
  app.get('/segment', async (req, reply) => {
    await requireTicket(req);
    const { s, sig } = ticketQuery.parse(req.query);
    const url = decodeUpstream(s, sig);
    return pipeUpstream(req, reply, url);
  });

  /** Film ou episode en proxy : relais progressif, avec support des Range. */
  app.get('/file', async (req, reply) => {
    const payload = await requireTicket(req);
    const url = await upstreamUrlFor(payload);
    return pipeUpstream(req, reply, url);
  });

  /**
   * Mobile : redirection vers l'URL Xtream reelle.
   *
   * Compromis assume — cette redirection expose les identifiants du provider a
   * qui inspecte le trafic de l'application. Acceptable pour un cercle de
   * proches ; sinon, passer le mobile en mode `proxy` et perdre l'economie de
   * bande passante.
   */
  app.get('/direct', async (req, reply) => {
    const payload = await requireTicket(req);
    const url = await upstreamUrlFor(payload);
    return reply.header('cache-control', 'no-store').redirect(url, 302);
  });

};
