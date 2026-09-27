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
  assert.deepEqual(dec.view, { center: [52.5, 13.4], zoom: 15 });
});

test('Fuzzy-Suche', () => {
  assert.ok(fuzzyScore('bub', 'Bubatz-Zone') > fuzzyScore('bub', 'Club-Mate Bus'));
  assert.equal(fuzzyScore('xyz', 'Späti'), 0);
  assert.ok(fuzzyScore('24 tank', '24/7 Tankstelle') > 0);
});
