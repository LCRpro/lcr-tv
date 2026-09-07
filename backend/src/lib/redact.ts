/**
 * Les URLs de flux Xtream contiennent `/live/{user}/{pass}/...` et
 * `player_api.php?username=...&password=...`. Rien de tout cela ne doit atteindre
 * un log, une trace d'erreur ou une réponse HTTP.
 */
const QUERY_SECRET = /([?&](?:username|password|pass|user|token|ticket)=)([^&\s]*)/gi;
const PATH_CREDENTIALS = /\/(live|movie|series)\/[^/\s]+\/[^/\s]+\//gi;

export function redact(input: string): string {
  return input
    .replace(QUERY_SECRET, '$1***')
    .replace(PATH_CREDENTIALS, '/$1/***/***/');
}

/** Version sûre d'une URL pour le logging : hôte + chemin masqué, sans query secrète. */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['username', 'password', 'pass', 'user', 'token', 'ticket']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '***');
    }
    return redact(u.toString());
  } catch {
    return redact(url);
  }
}

/** Masque une valeur pour affichage UI : `abcdef` -> `ab***ef`. */
export function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
