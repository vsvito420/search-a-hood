import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidateLines, toCSV, pricePerSqm, createGeocoder } from '../src/core/candidates.js';
import { encodeState, decodeState } from '../src/app/permalink.js';
import { fuzzyScore } from '../src/ui/palette.js';
import { BUILTIN_MODULES } from '../src/modules/index.js';

test('Kandidaten-Zeilen parsen', () => {
  const c = parseCandidateLines(`
# Kommentar
Wiener Str. 10, Berlin | 1.150 € | 62,5 m² | https://example.org/expose/1
52.5012, 13.4201 | 900
Oranienstr. 185`);
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { label: 'Wiener Str. 10, Berlin', query: 'Wiener Str. 10, Berlin', rent: 1150, size: 62.5, url: 'https://example.org/expose/1' });
  assert.equal(c[1].lat, 52.5012);
  assert.equal(c[1].query, undefined);
  assert.equal(c[1].rent, 900);
  assert.equal(c[2].rent, null);
  assert.equal(pricePerSqm(c[0]).toFixed(2), '18.40');
});

test('CSV-Quoting', () => {
  assert.equal(toCSV([['a;b', 'x"y', 1.5, null]]), '"a;b";"x""y";1,5;');
});

test('Geocoder cacht und hält Intervall ein', async () => {
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => [{ lat: '1', lon: '2', display_name: 'X' }] });
  const geo = createGeocoder({ fetchImpl: (...a) => (calls++, fetchImpl(...a)), minInterval: 50 });
  const t0 = Date.now();
  const [a, b, c] = await Promise.all([geo('A'), geo('B'), geo('a')]);
  assert.equal(calls, 2);
  assert.deepEqual(a, c);
  assert.equal(b.lat, 1);
  assert.ok(Date.now() - t0 >= 45);
});

test('Permalink Roundtrip', () => {
  const settings = Object.fromEntries(BUILTIN_MODULES.map((m) => [m.id, { ...m.defaults }]));
  settings.bubatz.enabled = true;
  settings.bubatz.required = true;
  settings.spaeti.distance = 250;
  const enc = encodeState({
    view: { lat: 52.5, lng: 13.4, zoom: 15 },
    modules: BUILTIN_MODULES,
    settings,
    customDefs: [{ id: 'custom-x', name: 'Döner', query: ['[cuisine~"kebab"]'] }],
    targets: [{ id: 't1', name: 'Arbeit', lat: 52.5219, lon: 13.4132, mode: 'transit', minutes: 25, arrive: '08:30' }],
    distMode: 'walk',
    time: '2026-09-27T23:00',
    candidates: [{ label: 'Ä-Straße 1', lat: 52.1, lon: 13.2, rent: 900, size: 50, url: null }, { label: 'ungeocodet' }],
  });
  assert.ok(enc.length < 600, `Link zu lang: ${enc.length}`);
  const dec = decodeState(`#s=${enc}`, BUILTIN_MODULES);
  assert.deepEqual(dec.settings.bubatz, { enabled: true, required: true });
  assert.deepEqual(dec.settings.spaeti, { distance: 250 });
  assert.equal(dec.distMode, 'walk');
  assert.equal(dec.candidates.length, 1);
  assert.equal(dec.candidates[0].label, 'Ä-Straße 1');
  assert.equal(dec.customDefs[0].name, 'Döner');
  assert.deepEqual(dec.targets[0], { id: 't1', name: 'Arbeit', lat: 52.5219, lon: 13.4132, mode: 'transit', minutes: 25, arrive: '08:30' });
  assert.deepEqual(dec.view, { center: [52.5, 13.4], zoom: 15 });
});

test('Fuzzy-Suche', () => {
  assert.ok(fuzzyScore('bub', 'Bubatz-Zone') > fuzzyScore('bub', 'Club-Mate Bus'));
  assert.equal(fuzzyScore('xyz', 'Späti'), 0);
  assert.ok(fuzzyScore('24 tank', '24/7 Tankstelle') > 0);
});

test('shortAddress baut kompakte Adresse', async () => {
  const { shortAddress } = await import('../src/core/candidates.js');
  assert.equal(
    shortAddress({ display_name: 'lang', address: { road: 'Wiener Straße', house_number: '10', suburb: 'Kreuzberg', city: 'Berlin' } }),
    'Wiener Straße 10, Kreuzberg, Berlin',
  );
  assert.equal(shortAddress({ display_name: 'Nur Name' }), 'Nur Name');
});

test('Permalink/Config: manipulierte Daten werden verworfen statt die App zu crashen', async () => {
  const { sanitize } = await import('../src/app/permalink.js');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const evil = {
    v: 1,
    c: [52.5, 13.4, 15],
    m: { spaeti: { de: 300, xx: 'böse', ed: { nested: 1 } } },
    x: [{ id: 'c1', name: 'kaputt', query: ['amenity=fuel'] }, { id: 'c2', name: 'ok', query: ['[shop=bakery]'], color: 'red;background:url(x)' }],
    g: [['t', 'X', 'nan', 13, 'bike', 20], ['t2', 'Arbeit', 52.5, 13.4, 'teleport', 20], ['t3', 'Uni', 52.5, 13.3, 'bike', 9999, 'x']],
    k: [['<img src=x onerror=alert(1)>', 52.5, 13.4, null, null, 'javascript:alert(1)'], 'kein array'],
    d: 'hyperspace',
    t: 'gestern',
  };
  const dec = decodeState(`#s=${b64(evil)}`, BUILTIN_MODULES);
  assert.deepEqual(dec.settings.spaeti, { distance: 300 });
  assert.deepEqual(dec.customDefs.map((d) => d.id), ['c2']);
  assert.equal(dec.customDefs[0].color, '#34495e');
  assert.deepEqual(dec.targets.map((t) => [t.id, t.minutes, t.arrive]), [['t3', 180, '08:30']]);
  assert.equal(dec.candidates.length, 1, 'Label wird später escaped, URL später gefiltert');
  assert.equal(dec.distMode, 'air');
  assert.equal(dec.time, null);
  assert.deepEqual(sanitize({ customDefs: 'x', targets: null, candidates: 5 }), { customDefs: [], targets: [], candidates: [], settings: {} });
});

test('Geocoder.reverse: kurze Adresse, Cache, gemeinsame Drossel', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.match(url, /reverse\?format=jsonv2&zoom=18/);
    return { ok: true, json: async () => ({ display_name: 'lang', address: { road: 'Wiener Straße', house_number: '10', suburb: 'Kreuzberg', city: 'Berlin' } }) };
  };
  const geo = createGeocoder({ fetchImpl, minInterval: 10 });
  assert.equal(await geo.reverse(52.5, 13.4), 'Wiener Straße 10, Kreuzberg, Berlin');
  await geo.reverse(52.5, 13.4);
  assert.equal(calls, 1);
});
