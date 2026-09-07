import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, TICKET_TTL_SEC } from '../config/env.js';
import { AppError } from './errors.js';
import type { ItemType } from '@iptv/shared';

/**
 * Ticket de lecture signé.
 *
 * Raison d'être : `<video>` et hls.js n'envoient aucun header Authorization sur les
 * requêtes de segments. Le ticket voyage donc dans l'URL, et les routes de manifest
 * et de segments ne valident que lui — jamais la session.
 *
 * Il est scopé à un item précis et à un slot précis : le voler ne donne accès
 * qu'à ce flux-là, pour 15 minutes.
 */
export interface TicketPayload {
  /** user_id */
  u: number;
  /** item_type */
  t: ItemType;
  /** item_id */
  i: number;
  /** slot_id */
  s: number;
  /** expiration, epoch secondes */
  exp: number;
}

function sign(body: string): string {
  return createHmac('sha256', env.ticketSecret).update(body).digest('base64url');
}

export function issueTicket(
  payload: Omit<TicketPayload, 'exp'>,
  ttlSec = TICKET_TTL_SEC,
): { ticket: string; expiresAt: Date } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const full: TicketPayload = { ...payload, exp };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return { ticket: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyTicket(ticket: string | undefined): TicketPayload {
  if (!ticket) throw new AppError(401, 'TICKET_INVALID', 'Ticket de lecture absent.');
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0) throw new AppError(401, 'TICKET_INVALID', 'Ticket de lecture malformé.');

  const body = ticket.slice(0, dot);
  const provided = Buffer.from(ticket.slice(dot + 1), 'utf8');
  const expected = Buffer.from(sign(body), 'utf8');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new AppError(401, 'TICKET_INVALID', 'Signature de ticket invalide.');
  }

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(401, 'TICKET_INVALID', 'Ticket de lecture illisible.');
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    // Code distinct : le client doit renouveler silencieusement, pas rediriger vers /login.
    throw new AppError(401, 'TICKET_EXPIRED', 'Ticket de lecture expiré.');
  }
  return payload;
}

