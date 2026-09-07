/**
 * `fetch` de Node enveloppe toutes les pannes reseau dans un unique
 * `TypeError: fetch failed`, et range la cause reelle dans `err.cause`. Sans
 * derouler cette chaine, un DNS introuvable, un port ferme et une connexion
 * coupee par un intermediaire donnent exactement le meme message — et il n'y a
 * plus rien a diagnostiquer.
 */

interface CauseLike {
  message?: unknown;
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
}

/** Traduction des codes systeme les plus courants, en clair. */
const HINTS: Record<string, string> = {
  ENOTFOUND: "nom d'hote introuvable (DNS)",
  EAI_AGAIN: 'resolution DNS temporairement impossible',
  ECONNREFUSED: 'connexion refusee : rien ne repond sur ce port',
  ECONNRESET: 'connexion etablie puis coupee par le serveur ou un intermediaire',
  ETIMEDOUT: 'delai depasse : aucune reponse',
  EHOSTUNREACH: 'hote inatteignable',
  ENETUNREACH: 'reseau inatteignable',
  EPIPE: 'connexion interrompue en cours d envoi',
  UND_ERR_CONNECT_TIMEOUT: 'delai depasse a la connexion',
  UND_ERR_HEADERS_TIMEOUT: "delai depasse en attendant les en-tetes",
  UND_ERR_SOCKET: 'socket fermee prematurement',
  CERT_HAS_EXPIRED: 'certificat TLS expire',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'certificat TLS auto-signe',
  ERR_TLS_CERT_ALTNAME_INVALID: "le certificat TLS ne correspond pas a l'hote",
};

/**
 * Deroule `cause` et renvoie une description exploitable.
 * Exemple : `fetch failed` devient
 * `ECONNRESET — connexion etablie puis coupee par le serveur ou un intermediaire`.
 */
export function describeFetchError(err: unknown): string {
  const seen = new Set<unknown>();
  let node: unknown = err;
  let code: string | null = null;
  let deepest: string | null = null;

  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    const current = node as CauseLike;

    if (typeof current.code === 'string' && !code) code = current.code;
    if (typeof current.message === 'string' && current.message !== 'fetch failed') {
      deepest = current.message;
    }

    // `AggregateError` : plusieurs adresses tentees (IPv6 puis IPv4, round-robin).
    if (Array.isArray(current.errors) && current.errors.length > 0) {
      node = current.errors[0];
      continue;
    }
    node = current.cause;
  }

  const hint = code ? HINTS[code] : undefined;
  if (code && hint) return `${code} — ${hint}`;
  if (code && deepest) return `${code} — ${deepest}`;
  if (code) return code;
  if (deepest) return deepest;
  return err instanceof Error ? err.message : String(err);
}
