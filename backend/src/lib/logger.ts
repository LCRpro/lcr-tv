import { env } from '../config/env.js';
import { redact } from './redact.js';

/**
 * Configuration pino partagée entre Fastify et les CLI.
 * `redact` de pino ne couvre que des chemins connus : on ajoute une passe
 * texte sur les messages, qui est là où les URLs de flux se glissent.
 */
export const loggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.usernameEnc',
      '*.passwordEnc',
      '*.token',
      '*.ticket',
    ],
    censor: '***',
  },
  formatters: {
    log(object: Record<string, unknown>) {
      if (typeof object['msg'] === 'string') object['msg'] = redact(object['msg']);
      if (typeof object['url'] === 'string') object['url'] = redact(object['url']);
      return object;
    },
  },
  ...(env.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
};

/** Logger minimal pour les CLI, sans dépendre de Fastify. */
export const cliLog = {
  info: (msg: string, ...rest: unknown[]) => console.log(redact(msg), ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(redact(msg), ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(redact(msg), ...rest),
};
