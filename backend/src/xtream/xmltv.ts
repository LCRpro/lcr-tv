/**
 * Parseur XMLTV incremental.
 *
 * Le fichier fait plusieurs centaines de megaoctets : il est lu par morceaux et
 * jamais materialise en memoire. On ne construit pas d'arbre DOM, on avance dans
 * un tampon en cherchant les blocs `<programme>…</programme>`, qu'on decoupe un
 * par un et qu'on oublie aussitot.
 *
 * XMLTV est assez regulier pour se passer d'un vrai parseur XML : les
 * programmes ne s'imbriquent pas, et les seuls champs utiles sont des elements
 * plats a un niveau de profondeur.
 */

export interface XmltvProgramme {
  channel: string;
  title: string;
  description: string | null;
  start: Date;
  stop: Date;
}

/**
 * `20240131203000 +0100` — les deux formes (avec ou sans decalage) existent.
 * Sans decalage, on prend UTC : mieux vaut une heure decalee qu'un rejet.
 */
export function parseXmltvDate(raw: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s, offset] = match;
  const iso =
    `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}` +
    (offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : 'Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity] ?? whole;
  });
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/** Premier element `<tag …>contenu</tag>` du bloc, en texte decode. */
function firstChildText(block: string, tag: string): string | null {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i');
  const match = open.exec(block);
  if (!match) return null;
  const start = match.index + match[0].length;
  const close = block.indexOf(`</${tag}>`, start);
  if (close === -1) return null;
  const raw = stripCdata(block.slice(start, close));
  const text = decodeEntities(raw.replace(/<[^>]*>/g, '')).trim();
  return text || null;
}

function attribute(openTag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(openTag);
  return match?.[1] ?? null;
}

export function parseProgrammeBlock(block: string): XmltvProgramme | null {
  const openEnd = block.indexOf('>');
  if (openEnd === -1) return null;
  const openTag = block.slice(0, openEnd + 1);

  const channel = attribute(openTag, 'channel');
  const startRaw = attribute(openTag, 'start');
  const stopRaw = attribute(openTag, 'stop');
  if (!channel || !startRaw) return null;

  const start = parseXmltvDate(startRaw);
  if (!start) return null;
  // Un programme sans `stop` est frequent : on lui donne une heure par defaut,
  // le suivant le tronquera de fait a l'affichage.
  const stop = stopRaw ? parseXmltvDate(stopRaw) : null;

  const title = firstChildText(block, 'title');
  if (!title) return null;

  return {
    channel,
    title,
    description: firstChildText(block, 'desc'),
    start,
    stop: stop ?? new Date(start.getTime() + 3600_000),
  };
}

export interface XmltvStreamOptions {
  /** Ignorer les programmes deja termines : la grille passee n'interesse personne. */
  notBefore?: Date;
  /** Ignorer ce qui est trop loin dans le futur, pour borner la volumetrie. */
  notAfter?: Date;
  onProgress?: (bytesRead: number, programmes: number) => void;
  signal?: AbortSignal;
}

/**
 * Parcourt le flux et emet les programmes au fil de l'eau. Le tampon ne conserve
 * jamais plus qu'un programme incomplet.
 */
export async function* streamXmltv(
  body: ReadableStream<Uint8Array>,
  options: XmltvStreamOptions = {},
): AsyncGenerator<XmltvProgramme> {
  const decoder = new TextDecoder('utf-8');
  const reader = body.getReader();
  let buffer = '';
  let bytesRead = 0;
  let emitted = 0;

  try {
    for (;;) {
      if (options.signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const open = buffer.indexOf('<programme');
        if (open === -1) {
          // Rien d'exploitable : on ne garde que la fin, au cas ou une balise
          // soit coupee entre deux morceaux.
          if (buffer.length > 64) buffer = buffer.slice(-32);
          break;
        }
        const close = buffer.indexOf('</programme>', open);
        if (close === -1) {
          buffer = buffer.slice(open);
          break;
        }

        const block = buffer.slice(open, close);
        buffer = buffer.slice(close + '</programme>'.length);

        const programme = parseProgrammeBlock(block);
        if (!programme) continue;
        if (options.notBefore && programme.stop < options.notBefore) continue;
        if (options.notAfter && programme.start > options.notAfter) continue;

        emitted += 1;
        if (emitted % 2000 === 0) options.onProgress?.(bytesRead, emitted);
        yield programme;
      }
    }
  } finally {
    options.onProgress?.(bytesRead, emitted);
    await reader.cancel().catch(() => {});
  }
}
