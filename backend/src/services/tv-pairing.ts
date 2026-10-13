import { randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { TvPairClaimResponse, TvPairPollResponse, TvPairStartResponse } from '@iptv/shared';
import { db } from '../db/client.js';
import { sessions, tvPairings } from '../db/schema.js';
import { generateSessionToken, hashToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

/**
 * L'association d'un téléviseur, en trois temps.
 *
 * 1. Le téléviseur `start` : il reçoit un code à afficher et un secret à garder.
 * 2. L'utilisateur `claim` le code depuis le site ou son application — déjà
 *    connecté, il rattache ainsi la TV à son compte.
 * 3. Le téléviseur `poll` avec son secret : dès que le code est réclamé, il
 *    reçoit sa propre session et s'ouvre.
 *
 * Le jeton de session du téléviseur n'est jamais stocké : il n'est créé qu'à
 * l'étape 3, et remis sur-le-champ. La table ne garde que le code, le haché du
 * secret, et — une fois réclamé — à qui rattacher la TV.
 */

/* Un alphabet sans ambiguïté : ni 0/O, ni 1/I/L. Lu à l'écran d'un téléviseur
   et recopié sur un téléphone, chaque caractère doit être sûr. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;
const TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_SEC = 3;

const sessionExpiry = () => new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 3600 * 1000);

/** Un code tiré au hasard, sans biais de modulo (on rejette les octets en trop). */
function makeCode(): string {
  const max = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < CODE_LEN) {
    for (const b of randomBytes(CODE_LEN)) {
      if (b >= max) continue;
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === CODE_LEN) break;
    }
  }
  return out;
}

/** Ce que l'utilisateur tape : on retire les séparateurs et on met en majuscules. */
const normalize = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
/** Ce qu'on affiche : deux groupes de quatre, plus lisibles. */
const prettify = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export async function startPairing(input: {
  deviceLabel?: string | undefined;
  userAgent?: string | undefined;
}): Promise<TvPairStartResponse> {
  // On profite de chaque demande pour balayer les codes périmés : la table
  // reste petite, et un code expiré ne bloque pas sa propre réémission.
  await db.delete(tvPairings).where(lt(tvPairings.expiresAt, new Date()));

  // Un code unique. La collision est improbable (31^8), mais on la gère.
  let code = makeCode();
  for (let tries = 0; tries < 5; tries += 1) {
    const [clash] = await db
      .select({ id: tvPairings.id })
      .from(tvPairings)
      .where(eq(tvPairings.code, code))
      .limit(1);
    if (!clash) break;
    code = makeCode();
  }

  const deviceSecret = generateSessionToken();
  await db.insert(tvPairings).values({
    code,
    deviceSecretHash: hashToken(deviceSecret),
    status: 'pending',
    deviceLabel: input.deviceLabel ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  const base = env.webOrigins[0] ?? '';
  return {
    code: prettify(code),
    deviceSecret,
    verificationUrl: `${base}/tv?code=${code}`,
    expiresInSec: TTL_MS / 1000,
    pollIntervalSec: POLL_INTERVAL_SEC,
  };
}

/**
 * L'utilisateur réclame un code. Il doit être connecté : la TV héritera de son
 * compte, et du profil actif s'il en a choisi un.
 */
export async function claimPairing(
  userId: number,
  profileId: number | null,
  codeInput: string,
): Promise<TvPairClaimResponse> {
  const code = normalize(codeInput);
  const [row] = await db
    .select()
    .from(tvPairings)
    .where(eq(tvPairings.code, code))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new AppError(404, 'PAIRING_NOT_FOUND', 'Code inconnu ou expiré. Vérifiez l’écran du téléviseur.');
  }
  if (row.status !== 'pending') {
    throw new AppError(409, 'PAIRING_USED', 'Ce code a déjà été utilisé.');
  }

  await db
    .update(tvPairings)
    .set({ userId, profileId, status: 'claimed' })
    .where(eq(tvPairings.id, row.id));

  return { deviceLabel: row.deviceLabel };
}

/**
 * Le téléviseur sonde. Tant que le code n'est pas réclamé, « patiente » ; une
 * fois réclamé, on crée sa session et on la lui remet, une seule fois.
 */
export async function pollPairing(deviceSecret: string): Promise<TvPairPollResponse> {
  const [row] = await db
    .select()
    .from(tvPairings)
    .where(eq(tvPairings.deviceSecretHash, hashToken(deviceSecret)))
    .limit(1);

  if (!row) {
    throw new AppError(404, 'PAIRING_NOT_FOUND', 'Association introuvable. Rafraîchissez le code.');
  }
  if (row.status === 'consumed') {
    // Déjà remis : rien de plus à donner. Le téléviseur a sa session ailleurs.
    throw new AppError(410, 'PAIRING_CONSUMED', 'Cette association a déjà été utilisée.');
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' };
  }
  if (row.status === 'pending') {
    return { status: 'pending' };
  }

  // status === 'claimed' : on crée la session du téléviseur et on la consomme.
  const token = generateSessionToken();
  await db.insert(sessions).values({
    userId: row.userId!,
    profileId: row.profileId ?? null,
    tokenHash: hashToken(token),
    deviceLabel: row.deviceLabel ?? 'Téléviseur',
    userAgent: row.userAgent ?? null,
    expiresAt: sessionExpiry(),
  });
  await db.update(tvPairings).set({ status: 'consumed' }).where(eq(tvPairings.id, row.id));

  return { status: 'approved', token };
}
