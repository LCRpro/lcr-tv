/**
 * Codes d'erreur stables — consommés tels quels par le web et le mobile.
 * Ne jamais renommer un code existant : les deux fronts s'appuient dessus.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'SESSION_EXPIRED',
  'ADULT_CONTENT_FORBIDDEN',
  'SLOT_LIMIT_REACHED',
  'TICKET_INVALID',
  'TICKET_EXPIRED',
  'NO_ACTIVE_PROVIDER',
  'PROVIDER_UNREACHABLE',
  'PROVIDER_AUTH_FAILED',
  'CATALOG_EMPTY',
  /** Session valide, mais personne n'a encore repondu a « qui regarde ? ». */
  'NO_PROFILE',
  'UNPLAYABLE_IN_BROWSER',
  'SYNC_ALREADY_RUNNING',
  'RATE_LIMITED',
  /** Association d'un téléviseur : code inconnu/expiré, déjà réclamé, déjà consommé. */
  'PAIRING_NOT_FOUND',
  'PAIRING_USED',
  'PAIRING_CONSUMED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Détail structuré optionnel, dépendant du code (ex. occupants d'un slot). */
    details?: unknown;
  };
}

/** details de SLOT_LIMIT_REACHED — à afficher tel quel côté client. */
export interface SlotConflictDetails {
  /** Abonnement sature — celui dont provient le contenu demande. */
  providerName: string;
  maxConnections: number;
  occupants: Array<{
    userEmail: string;
    itemLabel: string;
    since: string;
  }>;
  /**
   * Etat de tous les abonnements actifs. Sans cette vue d'ensemble, l'utilisateur
   * ne peut pas savoir si une autre source reste disponible pour le meme contenu.
   */
  allProviders: Array<{ name: string; used: number; max: number }>;
}

/** details de UNPLAYABLE_IN_BROWSER */
export interface UnplayableDetails {
  containerExtension: string;
}
