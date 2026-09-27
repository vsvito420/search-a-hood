import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, densify, makeGrid, bboxAreaKm2 } from '../src/core/geo.js';
import { SpatialIndex } from '../src/core/spatial-index.js';

test('haversine: Berlin Hbf → Alexanderplatz ≈ 2,9 km', () => {
  const d = haversine(52.5251, 13.3694, 52.5219, 13.4132);
  assert.ok(d > 2900 && d < 3100, `got ${d}`);
});

test('densify hält Maximalabstand ein', () => {
  const line = [
    { lat: 52.5, lon: 13.4 },
    { lat: 52.5, lon: 13.41 },
  ];
  const out = densify(line, 25);
  for (let i = 1; i < out.length; i++) {
    assert.ok(haversine(out[i - 1].lat, out[i - 1].lon, out[i].lat, out[i].lon) <= 25.01);
  }
  assert.deepEqual(out.at(-1), line[1]);
});

test('makeGrid begrenzt Zellen und liefert Mittelpunkte in der Box', () => {
  const bbox = { south: 52.5, west: 13.3, north: 52.6, east: 13.5 };
  const g = makeGrid(bbox, 10, 100);
  assert.equal(g.rows, 100);
  assert.equal(g.cols, 100);
  const c = g.center(0, 0);
  assert.ok(c.lat < bbox.north && c.lat > bbox.south);
  assert.ok(c.lon > bbox.west && c.lon < bbox.east);
  assert.ok(bboxAreaKm2(bbox) > 100);
});

test('SpatialIndex.nearest stimmt mit Brute Force überein', () => {
  const pts = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    lat: 52.5 + ((i * 7919) % 1000) / 10000,
    lon: 13.3 + ((i * 104729) % 1000) / 5000,
  }));
  const idx = new SpatialIndex(pts, 150);
  for (let k = 0; k < 50; k++) {
    const lat = 52.5 + (k % 10) / 100;
    const lon = 13.3 + Math.floor(k / 10) / 25;
    const brute = Math.min(...pts.map((p) => haversine(lat, lon, p.lat, p.lon)));
    const hit = idx.nearest(lat, lon, 100_000);
    assert.ok(Math.abs(hit.dist - brute) < 1e-6, `k=${k}: ${hit.dist} vs ${brute}`);
  }
});

test('SpatialIndex respektiert maxDist und within()', () => {
  const idx = new SpatialIndex([{ lat: 52.5, lon: 13.4 }]);
  assert.equal(idx.nearest(52.51, 13.4, 500), null); // ~1,1 km entfernt
  assert.ok(idx.nearest(52.51, 13.4, 2000));
  assert.equal(idx.within(52.5001, 13.4, 50).length, 1);
  assert.equal(new SpatialIndex([]).nearest(0, 0), null);
});
