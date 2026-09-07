import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Chargement de .env sans dépendance : on remonte depuis backend/ vers la racine
 * du monorepo. Les variables déjà présentes dans l'environnement gagnent toujours.
 */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../.env'),
    resolve(here, '../../../.env'),
    resolve(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadDotEnv();

/** 32 bytes attendus, acceptés en hex, base64 ou texte brut. */
function decodeKey(label: string, value: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  const b64 = Buffer.from(value, 'base64');
  if (b64.length === 32) return b64;
  const utf8 = Buffer.from(value, 'utf8');
  if (utf8.length >= 32) return utf8.subarray(0, 32);
  throw new Error(
    `${label} doit faire 32 bytes (64 caractères hex, ou base64, ou >= 32 caractères).`,
  );
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  MASTER_KEY: z.string().min(16),
  TICKET_SECRET: z.string().min(16),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** URL publique du backend, utilisée pour construire les URLs de manifest. */
  PUBLIC_URL: z.string().optional(),
  TMDB_API_KEY: z.string().optional(),
  /*
   * Les langues dans lesquelles on conserve les textes TMDB.
   *
   * Elles arrivent toutes dans le meme appel que la fiche — 55 pour un film
   * courant — et n'y coutent donc rien de plus. Ce qu'elles coutent, c'est du
   * stockage : environ 340 octets par oeuvre et par langue, soit 40 Mo pour les
   * 125 000 oeuvres du catalogue. Six langues tiennent dans 250 Mo, et
   * couvrent ce que le fournisseur publie vraiment.
   *
   * La liste est fixee ici et non deduite des profils : une langue ajoutee plus
   * tard a un profil trouve ses textes deja en base, au lieu de reclamer un
   * second passage de 250 000 requetes.
   */
  TMDB_LANGUAGES: z
    .string()
    .default('fr,en,de,es,it,pt')
    .transform((v) =>
      [...new Set(v.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean))],
    ),
  /*
   * Qui peut se créer un compte.
   *
   * `open`   — n'importe qui, depuis la page d'inscription.
   * `code`   — il faut connaître `SIGNUP_CODE`.
   * `closed` — seul l'administrateur crée les comptes.
   *
   * Le choix n'est pas cosmétique : chaque abonnement n'a qu'une connexion
   * simultanée, donc tout compte supplémentaire peut prendre la place de la
   * maison. `code` est le bon réglage dès que l'application est joignable
   * depuis l'extérieur.
   */
  SIGNUP_MODE: z.enum(['open', 'code', 'closed']).default('open'),
  /*
   * `SIGNUP_CODE=` vide vaut « pas de code ».
   *
   * Un `.env` recopie depuis l'exemple porte la ligne sans valeur ; sans ce
   * pretraitement, la chaine vide echouerait le `min(4)` et le backend
   * refuserait de demarrer pour un reglage que personne n'a voulu activer.
   */
  SIGNUP_CODE: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(4).optional(),
  ),
}).superRefine((v, ctx) => {
  if (v.SIGNUP_MODE === 'code' && !v.SIGNUP_CODE) {
    ctx.addIssue({
      code: 'custom',
      path: ['SIGNUP_CODE'],
      message: "requis quand SIGNUP_MODE vaut 'code'",
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Configuration invalide (.env) :\n${details}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  masterKey: decodeKey('MASTER_KEY', raw.MASTER_KEY),
  ticketSecret: Buffer.from(raw.TICKET_SECRET, 'utf8'),
  isProd: raw.NODE_ENV === 'production',
  webOrigins: raw.WEB_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  publicUrl: (raw.PUBLIC_URL ?? `http://localhost:${raw.PORT}`).replace(/\/+$/, ''),
} as const;

/** Durée de vie d'un ticket de lecture. */
export const TICKET_TTL_SEC = 15 * 60;
/** Rythme de heartbeat demandé au client. */
export const HEARTBEAT_INTERVAL_SEC = 30;
/** Au-delà, le slot est considéré abandonné et récupérable. */
export const SLOT_STALE_SEC = 90;
