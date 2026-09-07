/**
 * Lecture d'une playlist M3U.
 *
 * Le format tient en deux lignes par chaine : une de description, une
 * d'adresse. Tout ce qu'on saura d'une chaine doit donc tenir sur la premiere,
 * sous forme d'attributs — c'est la difference de fond avec un panel Xtream,
 * qui repond a des questions.
 *
 *     #EXTINF:-1 tvg-id="TF1.fr" tvg-logo="…" group-title="Generalistes",TF1
 *     http://serveur/live/…/12345.m3u8
 *
 * Le format n'a pas de norme : ce qui suit accepte ce qui circule reellement —
 * attributs dans n'importe quel ordre, guillemets simples ou doubles, lignes
 * `#EXTVLCOPT` intercalees, `#EXTGRP` a la place de `group-title`, et des
 * fichiers de plusieurs mega-octets.
 */

export interface M3uEntry {
  /** Le nom affiche, apres la virgule de `#EXTINF`. */
  name: string;
  url: string;
  /** Cle de rattachement au XMLTV. Sans elle, la chaine n'aura jamais de grille. */
  tvgId: string | null;
  logo: string | null;
  group: string | null;
}

/** `tvg-id="x"`, `tvg-logo='y'`, `group-title=z` — les trois s'ecrivent. */
const ATTR = /([\w-]+)=("([^"]*)"|'([^']*)'|([^\s,]+))/g;

const attrs = (line: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const m of line.matchAll(ATTR)) {
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    if (value) out.set(m[1]!.toLowerCase(), value);
  }
  return out;
};

/**
 * Le nom, c'est-a-dire tout ce qui suit la **premiere** virgule hors guillemets.
 *
 * L'en-tete se lit `#EXTINF:<duree> <attributs>,<nom>` : le nom court jusqu'a
 * la fin de la ligne, et peut donc contenir des virgules — « Canal+ Sport, le
 * direct ». Prendre la derniere le couperait en deux. Les attributs, eux, n'en
 * introduisent jamais hors guillemets : une valeur nue s'arrete au premier
 * espace ou a la premiere virgule.
 */
function nameOf(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ',') return line.slice(i + 1).trim();
  }
  return '';
}

export function parseM3u(text: string): M3uEntry[] {
  const lines = text.split(/\r?\n/);
  const out: M3uEntry[] = [];
  let pending: Omit<M3uEntry, 'url'> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const a = attrs(line);
      pending = {
        name: nameOf(line) || a.get('tvg-name') || '',
        tvgId: a.get('tvg-id') ?? null,
        logo: a.get('tvg-logo') ?? null,
        group: a.get('group-title') ?? null,
      };
      continue;
    }

    // `#EXTGRP` porte le groupe sur sa propre ligne, dans les listes anciennes.
    if (line.startsWith('#EXTGRP:') && pending) {
      pending.group ||= line.slice('#EXTGRP:'.length).trim() || null;
      continue;
    }

    /*
     * Les autres lignes de directive se sautent sans casser l'appariement.
     *
     * `#EXTVLCOPT:http-user-agent=…` s'intercale couramment entre l'en-tete et
     * l'adresse : la traiter comme une URL aurait donne une chaine dont le flux
     * est une option de VLC.
     */
    if (line.startsWith('#')) continue;

    if (pending && /^[a-z][\w+.-]*:\/\//i.test(line)) {
      if (pending.name) out.push({ ...pending, url: line });
      pending = null;
    }
  }
  return out;
}

/**
 * L'identifiant XMLTV, debarrasse de ce qui n'en fait pas partie.
 *
 * Les listes distinguent les declinaisons d'une meme chaine par un suffixe —
 * `TF1.fr@SD`, `TF1.fr@HD` — que la grille ne connait pas : elle n'a qu'un
 * `TF1.fr`, puisque les deux diffusent le meme programme. Garder le suffixe
 * revenait a n'apparier aucune chaine : mesure sur la liste France d'iptv-org,
 * 0 sur 215 telles quelles, 50 une fois le suffixe coupe.
 *
 * La casse est ramenee en minuscules pour la meme raison — les deux cotes ne
 * s'accordent pas dessus.
 */
export function xmltvId(tvgId: string | null): string | null {
  const bare = tvgId?.split('@')[0]?.trim().toLowerCase();
  return bare || null;
}

/**
 * Un identifiant stable, faute d'en recevoir un.
 *
 * Le catalogue rattache chaque ligne a `(provider, type, xtream_id)` : sans
 * numero, une meme chaine se dedoublerait a chaque synchronisation. On le
 * derive donc de ce qui ne bouge pas. Surtout pas de l'adresse : les hotes
 * tournent d'une semaine a l'autre, et la chaine serait comptee comme neuve a
 * chaque fois.
 *
 * Les trois champs comptent, pas seulement l'identifiant XMLTV. Beaucoup de
 * listes ecrivent un bouche-trou a la place — `tvg-id="(no tvg-id)"`,
 * `tvg-id="ext"` — et s'y fier seul faisait rentrer deux cents chaines sans
 * rapport dans la meme ligne : mesure sur une liste reelle, 169 groupes en
 * collision dont un de plus de deux cents entrees, toutes perdues sauf la
 * derniere.
 *
 * FNV-1a sur 32 bits, ramene a 31 pour tenir dans un `integer` Postgres signe.
 */
export function m3uStreamId(entry: M3uEntry): number {
  const key = `${entry.tvgId ?? ''}|${entry.group ?? ''}|${entry.name}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 1) || 1;
}
