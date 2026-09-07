import type { ErrorCode } from '@iptv/shared';

/** Erreur applicative : toujours sérialisée en `{ error: { code, message, details? } }`. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = "Authentification requise.") =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = "Accès refusé.") =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = "Ressource introuvable.") =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const internal = (message = "Erreur interne.") =>
  new AppError(500, 'INTERNAL', message);
