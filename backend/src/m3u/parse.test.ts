import assert from 'node:assert/strict';
import { test } from 'node:test';
import { m3uStreamId, parseM3u, xmltvId } from './parse.ts';

test('lit une entree ordinaire', () => {
  const [e] = parseM3u(
    '#EXTM3U\n' +
      '#EXTINF:-1 tvg-id="TF1.fr" tvg-logo="http://x/l.png" group-title="Generalistes",TF1\n' +
      'http://serveur/live/a/b/1.m3u8\n',
  );
  assert.deepEqual(e, {
    name: 'TF1',
    url: 'http://serveur/live/a/b/1.m3u8',
    tvgId: 'TF1.fr',
    logo: 'http://x/l.png',
    group: 'Generalistes',
  });
});

test('saute les directives intercalees sans desapparier', () => {
  const list = parseM3u(
    '#EXTINF:-1,A\n' +
      '#EXTVLCOPT:http-user-agent=Mozilla/5.0\n' +
      'http://a/1.ts\n' +
      '#EXTINF:-1,B\n' +
      'http://b/2.ts\n',
  );
  assert.deepEqual(
    list.map((e) => [e.name, e.url]),
    [
      ['A', 'http://a/1.ts'],
      ['B', 'http://b/2.ts'],
    ],
  );
});

test('coupe au dernier separateur, pas au premier', () => {
  // La virgule est dans le nom : une coupe naive rendrait « Sport ».
  const [e] = parseM3u('#EXTINF:-1 group-title="Sport",Canal+ Sport, le direct\nhttp://a/1.ts\n');
  assert.equal(e!.name, 'Canal+ Sport, le direct');
  assert.equal(e!.group, 'Sport');
});

test('accepte les guillemets simples et les valeurs nues', () => {
  const [e] = parseM3u("#EXTINF:-1 tvg-id='X.fr' group-title=News,Titre\nhttp://a/1.ts\n");
  assert.equal(e!.tvgId, 'X.fr');
  assert.equal(e!.group, 'News');
});

test('#EXTGRP tient lieu de group-title', () => {
  const [e] = parseM3u('#EXTINF:-1,Titre\n#EXTGRP:Documentaires\nhttp://a/1.ts\n');
  assert.equal(e!.group, 'Documentaires');
});

test('ignore une entete sans adresse', () => {
  assert.equal(parseM3u('#EXTINF:-1,Orpheline\n#EXTINF:-1,Vraie\nhttp://a/1.ts\n').length, 1);
});

test('ignore une entete sans nom', () => {
  assert.equal(parseM3u('#EXTINF:-1 tvg-id="x",\nhttp://a/1.ts\n').length, 0);
});

test('l identifiant est stable quand l adresse change', () => {
  const a = { name: 'TF1', tvgId: 'TF1.fr', logo: null, group: 'G', url: 'http://un/1.ts' };
  const b = { ...a, url: 'http://deux/9.ts' };
  assert.equal(m3uStreamId(a), m3uStreamId(b));
});

test('l identifiant separe deux chaines de meme nom dans des groupes differents', () => {
  const a = { name: 'Sport', tvgId: null, logo: null, group: 'FR', url: 'http://a/1.ts' };
  const b = { ...a, group: 'BE' };
  assert.notEqual(m3uStreamId(a), m3uStreamId(b));
});

test('l identifiant tient dans un integer Postgres signe', () => {
  for (const name of ['a', 'TF1', 'x'.repeat(300), 'Ünïcødé ✦']) {
    const id = m3uStreamId({ name, tvgId: null, logo: null, group: null, url: 'http://a' });
    assert.ok(Number.isInteger(id) && id > 0 && id <= 2_147_483_647, `${name} → ${id}`);
  }
});

test('un tvg-id bouche-trou ne fait pas fusionner des chaines differentes', () => {
  // Vu tel quel dans une liste publique : la valeur est litteralement ce texte.
  const base = { tvgId: '(no tvg-id)', logo: null, group: 'Divers', url: 'http://a/1.ts' };
  const ids = new Set(
    ['Contract', 'Kuhok', 'Wrong Turn'].map((name) => m3uStreamId({ ...base, name })),
  );
  assert.equal(ids.size, 3);
});

test('deux qualites de la meme chaine restent distinctes', () => {
  const a = { name: 'TF1', tvgId: 'TF1.fr', logo: null, group: 'FR', url: 'http://a/1.ts' };
  const b = { ...a, name: 'TF1 HD' };
  assert.notEqual(m3uStreamId(a), m3uStreamId(b));
});

test('l identifiant XMLTV perd son suffixe de declinaison', () => {
  assert.equal(xmltvId('TF1.fr@SD'), 'tf1.fr');
  assert.equal(xmltvId('TF1.fr@HD'), 'tf1.fr');
  assert.equal(xmltvId('France3.fr'), 'france3.fr');
  assert.equal(xmltvId(null), null);
  assert.equal(xmltvId(''), null);
  assert.equal(xmltvId('  @SD'), null);
});
