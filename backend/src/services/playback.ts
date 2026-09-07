import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { PlayResponse } from '@iptv/shared';
import { env, HEARTBEAT_INTERVAL_SEC, TICKET_TTL_SEC } from '../config/env.js';
import { db } from '../db/client.js';
import { watchProgress } from '../db/schema.js';
import { AppError, notFound } from '../lib/errors.js';
import { issueTicket, type TicketPayload } from '../lib/tickets.js';
import { clientFor, getProvider } from './providers.js';
import { acquireSlot } from './slots.js';
import { playbackCandidates, resolvePlayable, type Viewer } from './catalog.js';
import { isBrowserPlayable } from '../xtream/urls.js';

/**
 * Signature des URLs amont reecrites dans un manifest.
 *
 * Sans elle, la route de segment accepterait n'importe quelle URL fournie par le
 * client et servirait de relais ouvert. La signature garantit que l'URL vient
 * bien d'un manifest que nous avons nous-memes reecrit.
 */
function signUpstream(encoded: string): string {
  return createHmac('sha256', env.ticketSecret).update(`upstream:${encoded}`).digest('base64url');
}

export function encodeUpstream(url: string): { s: string; sig: string } {
  const s = Buffer.from(url, 'utf8').toString('base64url');
  return { s, sig: signUpstream(s) };
}

export function decodeUpstream(s: string | undefined, sig: string | undefined): string {
  if (!s || !sig) throw new AppError(400, 'BAD_REQUEST', 'Segment sans reference.');
  const provided = Buffer.from(sig, 'utf8');
  const expected = Buffer.from(signUpstream(s), 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new AppError(403, 'TICKET_INVALID', 'Reference de segment non signee par le serveur.');
  }
  return Buffer.from(s, 'base64url').toString('utf8');
}

// ---------------------------------------------------------------- ouverture

export interface StartInput {
  viewer: Viewer;
  sessionId: number;
  itemType: 'stream' | 'episode';
  itemId: number;
  mode: 'proxy' | 'direct';
}

export async function startPlayback(input: StartInput): Promise<PlayResponse> {
  const candidates = await playbackCandidates(input.itemType, input.itemId, input.viewer);
  const target = candidates[0]!;

  // `<video>` ne lit pas le mkv : mieux vaut le dire que servir un lecteur noir.
  if (
    input.mode === 'proxy' &&
    target.kind !== 'live' &&
    !isBrowserPlayable(target.containerExtension)
  ) {
    throw new AppError(
      415,
      'UNPLAYABLE_IN_BROWSER',
      `Ce contenu est en .${target.containerExtension} et n'est pas lisible dans un navigateur. Utilisez l'application mobile.`,
      { containerExtension: target.containerExtension },
    );
  }

  /*
   * Le slot est acquis avant toute chose : refuser tot vaut mieux que faire
   * couper le panel.
   *
   * Avec plusieurs abonnements, le meme contenu existe souvent chez plusieurs
   * d'entre eux. Si celui d'ou vient la ligne affichee est sature, on bascule
   * sur un exemplaire equivalent plutot que de refuser — c'est tout l'interet
   * d'avoir deux abonnements a une connexion.
   *
   * Le slot et la progression restent rattaches a l'item **demande** : changer
   * de source ne doit pas creer un second historique pour le meme film. Seul le
   * ticket porte la source reelle, puisque c'est lui qui construit l'URL.
   */
  let slot: Awaited<ReturnType<typeof acquireSlot>> | null = null;
  let source = target;
  let lastConflict: unknown = null;

  for (const candidate of candidates) {
    try {
      slot = await acquireSlot({
        userId: input.viewer.id,
        sessionId: input.sessionId,
        providerId: candidate.providerId,
        itemType: target.itemType,
        itemId: target.itemId,
        itemLabel: target.label,
      });
      source = candidate;
      break;
    } catch (err) {
      // Seule une saturation justifie d'essayer ailleurs ; une erreur d'acces
      // ou un contenu retire se reproduirait a l'identique.
      if (err instanceof AppError && err.code === 'SLOT_LIMIT_REACHED') {
        lastConflict = err;
        continue;
      }
      throw err;
    }
  }
  if (!slot) throw lastConflict;

  const { ticket, expiresAt } = issueTicket({
    u: input.viewer.id,
    t: target.itemType,
    i: source.itemId,
    s: slot.id,
  });

  const base = env.publicUrl;
  const url =
    input.mode === 'direct'
      ? `${base}/api/play/direct?ticket=${encodeURIComponent(ticket)}`
      : target.kind === 'live'
        ? `${base}/api/play/manifest.m3u8?ticket=${encodeURIComponent(ticket)}`
        : `${base}/api/play/file?ticket=${encodeURIComponent(ticket)}`;

  const [progress] = await db
    .select({ positionSec: watchProgress.positionSec, completed: watchProgress.completed })
    .from(watchProgress)
    .where(
      and(
        eq(watchProgress.profileId, input.viewer.profileId),
        eq(watchProgress.itemType, target.itemType),
        eq(watchProgress.itemId, target.itemId),
      ),
    )
    .limit(1);

  return {
    url,
    ticket,
    expiresAt: expiresAt.toISOString(),
    mode: input.mode,
    kind: target.kind,
    containerExtension: target.containerExtension,
    slotId: slot.id,
    heartbeatIntervalSec: HEARTBEAT_INTERVAL_SEC,
    label: target.label,
    resumeAtSec:
      target.kind === 'live' || !progress || progress.completed ? 0 : progress.positionSec,
  };
}

/**
 * Renouvellement silencieux. Un film dure plus que les 15 minutes du ticket :
 * ejecter vers /login a ce moment-la serait absurde.
 */
export async function renewTicket(
  payload: TicketPayload,
  viewer: Viewer,
): Promise<{ ticket: string; expiresAt: string; url: string }> {
  if (payload.u !== viewer.id) {
    throw new AppError(403, 'TICKET_INVALID', 'Ticket emis pour un autre compte.');
  }
  const target = await resolvePlayable(
    payload.t === 'episode' ? 'episode' : 'stream',
    payload.i,
    viewer,
  );
  const { ticket, expiresAt } = issueTicket({
    u: payload.u,
    t: payload.t,
    i: payload.i,
    s: payload.s,
  });
  const base = env.publicUrl;
  const url =
    target.kind === 'live'
      ? `${base}/api/play/manifest.m3u8?ticket=${encodeURIComponent(ticket)}`
      : `${base}/api/play/file?ticket=${encodeURIComponent(ticket)}`;
  return { ticket, expiresAt: expiresAt.toISOString(), url };
}

// ------------------------------------------------------------- URLs upstream

/** URL Xtream reelle d'un item. Ne jamais renvoyer telle quelle a un client web. */
export async function upstreamUrlFor(payload: TicketPayload): Promise<string> {
  const target = await resolvePlayable(
    payload.t === 'episode' ? 'episode' : 'stream',
    payload.i,
    // Le controle d'acces a deja eu lieu a l'emission du ticket ; ici on ne fait
    // que reconstruire l'URL. On garde malgre tout le garde-fou adulte.
    // Aucune donnee de profil n'est lue lors de la reconstruction d'URL :
    // seul le compte compte pour retrouver l'abonnement d'origine.
    // `languages` vide : rien ici n'ordonne, on reconstruit une URL.
    { id: payload.u, profileId: 0, canWatchAdult: true, languages: [], uiLanguage: null },
  );

  /*
   * Une chaine de playlist porte deja son adresse : rien a reconstruire.
   *
   * Passer par `clientFor` ici leverait une erreur — une playlist n'a pas
   * d'identifiants — et surtout n'aurait aucun sens : l'adresse ne se deduit
   * pas d'un compte, elle etait ecrite dans le fichier.
   */
  if (target.kind === 'live' && target.sourceUrl) return target.sourceUrl;

  // Avec plusieurs abonnements, les identifiants a utiliser sont ceux de
  // l'abonnement d'ou vient le contenu. Prendre « le » provider actif
  // fabriquerait une URL valide en apparence, pointant sur le mauvais compte.
  const client = clientFor(await getProvider(target.providerId));

  switch (target.kind) {
    case 'live':
      return client.liveUrl(target.xtreamId, 'm3u8');
    case 'vod':
      return client.movieUrl(target.xtreamId, target.containerExtension);
    case 'episode':
      return client.episodeUrl(target.xtreamId, target.containerExtension);
    default:
      throw notFound('Contenu introuvable.');
  }
}

// ------------------------------------------------------- reecriture manifest

const ABSOLUTE = /^https?:\/\//i;

/**
 * Reecriture d'un manifest HLS.
 *
 * Chaque URI (variante, segment, cle de chiffrement) est resolue en absolu par
 * rapport au manifest amont, puis remplacee par une URL de notre proxy portant
 * le meme ticket. Le navigateur ne voit jamais l'hote du fournisseur.
 */
export function rewriteManifest(body: string, manifestUrl: string, ticket: string): string {
  const baseUrl = new URL(manifestUrl);
  const q = encodeURIComponent(ticket);

  const proxyFor = (rawUri: string): string => {
    const absolute = ABSOLUTE.test(rawUri) ? rawUri : new URL(rawUri, baseUrl).toString();
    const { s, sig } = encodeUpstream(absolute);
    const isPlaylist = /\.m3u8(\?|$)/i.test(absolute);
    const route = isPlaylist ? 'manifest.m3u8' : 'segment';
    return `${env.publicUrl}/api/play/${route}?ticket=${q}&s=${s}&sig=${sig}`;
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        // Cles AES et playlists de rendu declarees en attribut URI="...".
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${proxyFor(uri)}"`);
      }
      return proxyFor(trimmed);
    })
    .join('\n');
}

/*
 * Pas de liste blanche d'hotes sur les segments, volontairement : beaucoup de
 * panels renvoient les segments depuis un CDN tiers, et filtrer sur l'hote du
 * provider casserait la lecture. La protection contre le relais ouvert est la
 * signature `sig` — une URL de segment n'est acceptee que si elle provient d'un
 * manifest que ce serveur a lui-meme recupere et reecrit.
 */

export const TICKET_TTL = TICKET_TTL_SEC;
