import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelector, matchClauses, compileSelectors, isValidSelector } from '../src/core/tagfilter.js';
import { buildCombinedQuery, classify } from '../src/core/overpass.js';
import { DataStore } from '../src/core/datastore.js';
import { BUILTIN_MODULES } from '../src/modules/index.js';

const m = (sel, tags) => matchClauses(tags, parseSelector(sel));

test('Grundoperatoren', () => {
  assert.ok(m('[amenity=fuel]', { amenity: 'fuel' }));
  assert.ok(!m('[amenity=fuel]', { amenity: 'bar' }));
  assert.ok(m('[amenity]', { amenity: 'x' }));
  assert.ok(m('[!amenity]', {}));
  assert.ok(!m('[!amenity]', { amenity: 'x' }));
  assert.ok(m('[access!=private]', {}), '!= matcht fehlende Keys (Overpass-Semantik)');
  assert.ok(!m('[access!=private]', { access: 'private' }));
});

test('Regex, Quotes, Case-Insensitive, Verkettung', () => {
  assert.ok(m('[highway~"^(motorway|trunk|primary)$"]', { highway: 'trunk' }));
  assert.ok(!m('[highway~"^(motorway|trunk|primary)$"]', { highway: 'primary_link' }));
  assert.ok(m('["social_facility:for"~"juvenile|child"]', { 'social_facility:for': 'child' }));
  assert.ok(m('[name~"späti",i]', { name: 'Mein SPÄTI' }));
  assert.ok(m('[railway~"^(rail|light_rail)$"][service!~"."]', { railway: 'rail' }));
  assert.ok(!m('[railway~"^(rail|light_rail)$"][service!~"."]', { railway: 'rail', service: 'yard' }));
  assert.ok(m('[amenity=fast_food][cuisine~"kebab"]', { amenity: 'fast_food', cuisine: 'kebab;pizza' }));
  assert.ok(m('["name"="A B"]', { name: 'A B' }));
});

test('ungültige Filter werden erkannt', () => {
  assert.ok(!isValidSelector('amenity=fuel'));
  assert.ok(!isValidSelector('[amenity=fuel'));
  assert.ok(!isValidSelector(''));
  assert.ok(!isValidSelector('[!a=b]'));
  assert.ok(isValidSelector('[a=b] [c]'));
});

test('alle mitgelieferten Modul-Filter sind parsebar', () => {
  for (const mod of BUILTIN_MODULES) for (const s of mod.query) assert.ok(isValidSelector(s), `${mod.id}: ${s}`);
});

test('kombinierte Abfrage + Klassifizierung', () => {
  const mods = [
    { id: 'a', query: ['[amenity=fuel]'], geometry: 'point' },
    { id: 'b', query: ['[amenity=fuel]', '[shop=kiosk]'], geometry: 'point' },
    { id: 'r', query: ['[highway=primary]'], geometry: 'line' },
  ];
  const q = buildCombinedQuery(mods, { south: 1, west: 2, north: 3, east: 4 });
  assert.equal((q.match(/amenity=fuel/g) || []).length, 1, 'dedupliziert');
  assert.match(q, /->\.p;\.p out tags center;/);
  assert.match(q, /way\[highway=primary\]\(1,2,3,4\);\)->\.l;\.l out tags geom;/);
  const els = [
    { type: 'node', id: 1, tags: { amenity: 'fuel' } },
    { type: 'node', id: 2, tags: { shop: 'kiosk' } },
    { type: 'way', id: 3, tags: { highway: 'primary' }, geometry: [{ lat: 0, lon: 0 }] },
  ];
  const c = classify(els, mods);
  assert.deepEqual(c.get('a').map((e) => e.id), [1]);
  assert.deepEqual(c.get('b').map((e) => e.id), [1, 2]);
  assert.deepEqual(c.get('r').map((e) => e.id), [3]);
});

test('DataStore: Sammelabfrage, Fallback auf Einzelabfragen, Gebietswechsel', async () => {
  const calls = [];
  const run = async (q) => {
    calls.push(q);
    if (q.includes('shop=kiosk') && q.includes('amenity=fuel')) throw new Error('zu groß');
    if (q.includes('shop=kiosk')) throw new Error('kaputt');
    return [{ type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'fuel' } }];
  };
  const ds = new DataStore({ run });
  ds.setArea({ south: 1, west: 1, north: 2, east: 2 });
  const mods = [
    { id: 'fuel', name: 'F', query: ['[amenity=fuel]'] },
    { id: 'kiosk', name: 'K', query: ['[shop=kiosk]'] },
  ];
  await ds.ensure(mods);
  assert.equal(calls.length, 3);
  assert.equal(ds.get('fuel').elements.length, 1);
  assert.match(ds.get('kiosk').error, /kaputt/);
  await ds.ensure([mods[0]]);
  assert.equal(calls.length, 3, 'gecacht');
  ds.setArea({ south: 5, west: 1, north: 6, east: 2 });
  assert.equal(ds.get('fuel'), undefined);
});
