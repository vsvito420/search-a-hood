import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleRings, outerRings, ShareField } from '../src/core/share.js';
import { padBbox } from '../src/core/geo.js';

const P = (lat, lon) => ({ lat, lon });

test('assembleRings setzt zerstückelte Ringe zusammen (auch umgedrehte Teile)', () => {
  const a = [P(0, 0), P(0, 1), P(1, 1)];
  const b = [P(0, 0), P(1, 0), P(1, 1)]; // läuft "falsch herum"
  const rings = assembleRings([a, b]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.deepEqual(rings[0][0], rings[0].at(-1));
  assert.equal(assembleRings([[P(0, 0), P(0, 1)]]).length, 0, 'offene Linie ist kein Ring');
});

test('outerRings ignoriert inner-Rollen', () => {
  const sq = (o, s) => [P(o, o), P(o, o + s), P(o + s, o + s), P(o + s, o), P(o, o)];
  const rel = { type: 'relation', members: [{ type: 'way', role: 'outer', geometry: sq(0, 1) }, { type: 'way', role: 'inner', geometry: sq(0.4, 0.2) }] };
  assert.equal(outerRings(rel).length, 1);
  assert.equal(outerRings({ type: 'way', geometry: sq(0, 1) }).length, 1);
});

test('ShareField: Park füllt die Hälfte des Umkreises', () => {
  const center = P(52.5, 13.4);
  const bbox = padBbox({ south: 52.5, west: 13.4, north: 52.5, east: 13.4 }, 1000);
  // Park = alles östlich des Mittelpunkts in ±600 m
  const box = padBbox({ south: 52.5, west: 13.4, north: 52.5, east: 13.4 }, 600);
  const park = { type: 'way', geometry: [P(box.south, 13.4), P(box.south, box.east), P(box.north, box.east), P(box.north, 13.4), P(box.south, 13.4)] };
  const f = new ShareField([park], bbox, 300, 25);
  const mid = f.shareAt(center.lat, center.lon);
  assert.ok(mid > 40 && mid < 60, `Mitte ${mid}`);
  assert.ok(f.shareAt(52.5, 13.4044) > 95, 'Fenster (±300 m) liegt komplett im Park');
  assert.ok(f.shareAt(52.5, 13.393) < 5, 'weit westlich');
  assert.equal(f.polygons, 1);
});

test('zugeschnittene Geometrie mit null-Knoten (out geom(bbox)) bricht nichts', () => {
  const g = [null, P(0, 0), P(0, 1), P(1, 1), P(1, 0), null];
  assert.equal(outerRings({ type: 'way', geometry: g }).length, 1);
  const rel = { type: 'relation', members: [{ type: 'way', role: 'outer', geometry: [P(0, 0), null, P(0, 1), P(1, 1), P(1, 0), P(0, 0)] }] };
  assert.equal(outerRings(rel).length, 1);
  assert.doesNotThrow(() => new ShareField([{ type: 'way', geometry: [null, null] }], { south: 0, west: 0, north: 1, east: 1 }));
});
