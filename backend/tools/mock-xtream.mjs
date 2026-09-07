/**
 * Faux panel Xtream, pour developper et tester sans consommer une connexion
 * de l'abonnement reel.
 *
 *   node backend/tools/mock-xtream.mjs [port]
 *
 * Il imite volontairement les defauts des vrais panels : entiers renvoyes en
 * chaines, `false` a la place d'un tableau vide, champs absents, categorie
 * adulte melangee aux autres. C'est ce que le parsing Zod doit encaisser.
 */
import { createServer } from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.argv[2] ?? 9010);
const USER = 'demo';
const PASS = 'demo';

const categories = {
  live: [
    { category_id: '1', category_name: 'Généralistes FR', parent_id: 0 },
    { category_id: '2', category_name: 'Sport', parent_id: 0 },
    { category_id: '99', category_name: 'XXX Adultes', parent_id: 0 },
  ],
  vod: [
    { category_id: '10', category_name: 'Films — Nouveautés', parent_id: 0 },
    { category_id: '11', category_name: 'Films — Animation', parent_id: 0 },
    { category_id: '98', category_name: 'ADULT MOVIES', parent_id: 0 },
  ],
  series: [{ category_id: '20', category_name: 'Séries FR', parent_id: 0 }],
};

const liveStreams = [
  { num: 1, name: 'TF1 FHD', stream_type: 'live', stream_id: '101', stream_icon: 'http://img/tf1.png', epg_channel_id: 'tf1.fr', added: '1700000000', category_id: '1', tv_archive: '1' },
  { num: 2, name: 'France 2 HD', stream_type: 'live', stream_id: 102, stream_icon: '', epg_channel_id: 'france2.fr', added: '1700000100', category_id: '1', tv_archive: 0 },
  { num: 3, name: 'Canal+ Sport', stream_type: 'live', stream_id: '103', stream_icon: 'http://img/cs.png', epg_channel_id: 'canalsport.fr', category_id: '2', added: '1700000200' },
  { num: 4, name: 'Chaîne Adulte 1', stream_type: 'live', stream_id: '901', category_id: '99', added: '1700000300' },
];

const vodStreams = [
  { num: 1, name: 'Le Château Ambulant', stream_id: '201', stream_icon: 'http://img/chateau.jpg', category_id: '11', container_extension: 'mp4', rating: '8.4', added: '1700001000' },
  { num: 2, name: 'Les Évadés', stream_id: 202, stream_icon: 'http://img/evades.jpg', category_id: '10', container_extension: 'mkv', rating: 9.3, added: '1700002000' },
  { num: 3, name: 'Amélie Poulain', stream_id: '203', stream_icon: null, category_id: '10', container_extension: 'mp4', rating: '', added: '1700003000' },
  { num: 4, name: 'Film Adulte', stream_id: '902', category_id: '98', container_extension: 'mp4', added: '1700004000' },
  // Entree volontairement cassee : elle doit etre ignoree sans faire echouer le sync.
  { num: 5, name: null, stream_id: null, category_id: '10' },
];

const seriesList = [
  {
    num: 1, series_id: '301', name: 'Kaamelott', cover: 'http://img/kaamelott.jpg',
    plot: 'Les aventures du roi Arthur.', cast: 'Alexandre Astier', director: 'Alexandre Astier',
    genre: 'Comédie', releaseDate: '2005-01-03', rating: '8.9', category_id: '20',
    backdrop_path: ['http://img/kaamelott-bd.jpg'], last_modified: '1700005000',
  },
  {
    num: 2, series_id: 302, name: 'Le Bureau des Légendes', cover: null,
    plot: null, genre: 'Espionnage', releaseDate: '2015-04-27', rating: 8.7,
    category_id: '20', backdrop_path: [], last_modified: '1700006000',
  },
];

const seriesInfo = {
  301: {
    info: { name: 'Kaamelott', cover: 'http://img/kaamelott.jpg', plot: 'Les aventures du roi Arthur.', genre: 'Comédie', rating: '8.9' },
    seasons: [],
    episodes: {
      1: [
        { id: '4001', episode_num: '1', title: 'Heat', container_extension: 'mp4', season: '1', info: { plot: 'Premier épisode.', duration_secs: '210', movie_image: 'http://img/e1.jpg' } },
        { id: '4002', episode_num: 2, title: 'Le Sanglier de Cornouailles', container_extension: 'mp4', season: 1, info: { duration_secs: 215 } },
      ],
      2: [
        { id: '4003', episode_num: '1', title: 'Les Défis de Merlin', container_extension: 'mkv', season: '2', info: { plot: null, duration_secs: '220' } },
      ],
    },
  },
  // Serie sans episode : certains panels renvoient `false`.
  302: { info: { name: 'Le Bureau des Légendes' }, seasons: false, episodes: false },
};

const vodInfo = {
  201: {
    info: { movie_image: 'http://img/chateau.jpg', backdrop_path: ['http://img/chateau-bd.jpg'], plot: 'Sophie est transformée en vieille femme.', cast: 'Chieko Baishō', director: 'Hayao Miyazaki', genre: 'Animation', releasedate: '2004-11-20', rating: '8.4', duration_secs: '7139', tmdb_id: '4935' },
    movie_data: { stream_id: 201, name: 'Le Château Ambulant', container_extension: 'mp4', added: '1700001000', category_id: '11' },
  },
  202: {
    info: { plot: 'Deux détenus se lient d’amitié.', genre: 'Drame', releasedate: '1994-09-23', rating: 9.3, duration_secs: 8520 },
    movie_data: { stream_id: 202, name: 'Les Évadés', container_extension: 'mkv' },
  },
};

const json = (res, body, status = 200) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
};

/** Faux segment TS : de quoi verifier que le proxy relaie bien des octets. */
function fakeSegment(index) {
  const buf = Buffer.alloc(4096, 0);
  buf.write(`SEGMENT-${index}`, 0, 'ascii');
  buf[0] = 0x47; // octet de synchro d'un vrai paquet MPEG-TS
  return buf;
}

const EPG_CHANNELS = ['tf1.fr', 'france2.fr', 'canalsport.fr'];
const EPG_DAYS = 3;
const SLOTS_PER_DAY = 24;

function xmltvStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}00 +0000`
  );
}

function writeXmltv(res) {
  res.write('<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="mock">');
  for (const id of EPG_CHANNELS) {
    res.write(`<channel id="${id}"><display-name>${id}</display-name></channel>`);
  }

  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  base.setUTCHours(base.getUTCHours() - 2);

  for (let day = 0; day < EPG_DAYS; day += 1) {
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      for (const id of EPG_CHANNELS) {
        const start = new Date(base.getTime() + (day * 24 + slot) * 3600_000);
        const stop = new Date(start.getTime() + 3600_000);
        res.write(
          `<programme start="${xmltvStamp(start)}" stop="${xmltvStamp(stop)}" channel="${id}">` +
            `<title lang="fr">Émission ${slot}h &amp; suite — ${id}</title>` +
            `<desc lang="fr"><![CDATA[Description du programme ${day}-${slot} sur ${id}.]]></desc>` +
            `</programme>`,
        );
      }
    }
  }
  res.end('</tv>');
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/player_api.php') {
    const u = url.searchParams.get('username');
    const p = url.searchParams.get('password');
    // Comme certains panels : identifiants faux -> tableau vide, pas d'erreur HTTP.
    if (u !== USER || p !== PASS) return json(res, []);

    const action = url.searchParams.get('action');
    if (!action) {
      return json(res, {
        user_info: {
          username: USER, password: PASS, message: '', auth: 1, status: 'Active',
          exp_date: '1790000000', is_trial: '0', active_cons: '0',
          created_at: '1690000000', max_connections: '2',
          allowed_output_formats: ['m3u8', 'ts'],
        },
        server_info: {
          url: `localhost`, port: String(PORT), https_port: '443',
          server_protocol: 'http', timezone: 'Europe/Paris',
          timestamp_now: Math.floor(Date.now() / 1000), time_now: new Date().toISOString(),
        },
      });
    }

    const categoryId = url.searchParams.get('category_id');
    // MOCK_HIDE=201,301 retire des entrees du catalogue : sert a verifier que le
    // sync marque `removed_at` au lieu de supprimer.
    const hidden = new Set((process.env['MOCK_HIDE'] ?? '').split(',').filter(Boolean));
    const byCategory = (rows) =>
      (categoryId ? rows.filter((r) => String(r.category_id) === categoryId) : rows).filter(
        (r) => !hidden.has(String(r.stream_id ?? r.series_id)),
      );

    switch (action) {
      case 'get_live_categories': return json(res, categories.live);
      case 'get_vod_categories': return json(res, categories.vod);
      case 'get_series_categories': return json(res, categories.series);
      case 'get_live_streams': return json(res, byCategory(liveStreams));
      case 'get_vod_streams': return json(res, byCategory(vodStreams));
      case 'get_series': return json(res, byCategory(seriesList));
      case 'get_vod_info': {
        const id = url.searchParams.get('vod_id');
        return json(res, vodInfo[id] ?? { info: {}, movie_data: {} });
      }
      case 'get_series_info': {
        const id = url.searchParams.get('series_id');
        return json(res, seriesInfo[id] ?? { info: {}, episodes: false });
      }
      case 'get_short_epg':
        return json(res, {
          epg_listings: [
            { title: Buffer.from('Journal de 20h').toString('base64'), description: Buffer.from('Info').toString('base64'), start_timestamp: String(Math.floor(Date.now() / 1000) - 600), stop_timestamp: String(Math.floor(Date.now() / 1000) + 1800) },
          ],
        });
      default:
        return json(res, []);
    }
  }

  // Manifest HLS avec des URIs relatives : c'est le cas qui casse un proxy naif.
  const liveMatch = path.match(/^\/live\/([^/]+)\/([^/]+)\/(\d+)\.m3u8$/);
  if (liveMatch) {
    if (liveMatch[1] !== USER || liveMatch[2] !== PASS) { res.writeHead(403); return res.end('forbidden'); }
    const body = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXTINF:4.0,',
      'seg/0.ts',
      '#EXTINF:4.0,',
      'seg/1.ts',
      '#EXTINF:4.0,',
      `http://localhost:${PORT}/seg/2.ts`,
      '',
    ].join('\n');
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    return res.end(body);
  }

  // Les URIs relatives du manifest se resolvent sous /live/{u}/{p}/ : le proxy
  // doit les avoir reconstruites correctement pour tomber ici.
  const segMatch = path.match(/^(?:\/live\/[^/]+\/[^/]+)?\/seg\/(\d+)\.ts$/);
  if (segMatch) {
    const buf = fakeSegment(segMatch[1]);
    res.writeHead(200, { 'content-type': 'video/mp2t', 'content-length': buf.length });
    return res.end(buf);
  }

  const fileMatch = path.match(/^\/(movie|series)\/([^/]+)\/([^/]+)\/([^/]+)\.(\w+)$/);
  if (fileMatch) {
    if (fileMatch[2] !== USER || fileMatch[3] !== PASS) { res.writeHead(403); return res.end('forbidden'); }
    const total = 1024 * 64;
    const body = Buffer.alloc(total, 0x21);
    body.write(`FAKE-${fileMatch[1]}-${fileMatch[4]}`, 0, 'ascii');
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m?.[1] ?? 0);
      const end = m?.[2] ? Number(m[2]) : total - 1;
      const slice = body.subarray(start, end + 1);
      res.writeHead(206, {
        'content-type': 'video/mp4',
        'content-length': slice.length,
        'content-range': `bytes ${start}-${end}/${total}`,
        'accept-ranges': 'bytes',
      });
      return res.end(slice);
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': total, 'accept-ranges': 'bytes' });
    return res.end(body);
  }

  if (path === '/xmltv.php') {
    if (url.searchParams.get('username') !== USER || url.searchParams.get('password') !== PASS) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    writeXmltv(res);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Faux panel Xtream sur http://localhost:${PORT} (user ${USER} / pass ${PASS})`);
});
