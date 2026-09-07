import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Une seule pool pour tout le process. `max: 10` est large pour 3-5 utilisateurs
 * mais laisse de la marge au proxy de segments, qui peut ouvrir plusieurs
 * requetes courtes en parallele pendant une lecture.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema, casing: 'snake_case' });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
