import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Chiffre une valeur avec la clé maître. Format stocké : `v1.<iv>.<tag>.<payload>`
 * en base64url — versionné pour permettre une rotation de clé plus tard.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, env.masterKey, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Format de secret chiffré inconnu.');
  }
  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const data = Buffer.from(parts[3]!, 'base64url');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Secret chiffré corrompu.');
  }
  const decipher = createDecipheriv(ALGO, env.masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Token de session opaque : 32 bytes aléatoires, seul le hash est stocké. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash du token de session. SHA-256 suffit : le token a déjà 256 bits d'entropie,
 * il n'y a rien à ralentir (contrairement à un mot de passe choisi par un humain).
 */
export function hashToken(token: string): string {
  return createHmac('sha256', env.masterKey).update(token).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
