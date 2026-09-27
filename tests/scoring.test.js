import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleScore, isSatisfied, combine, scoreColor } from '../src/core/scoring.js';
import { analyzeArea, evaluatePoint } from '../src/core/analyzer.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { buildQuery, elementsToPoints } from '../src/core/overpass.js';
import { isOpenAt } from '../src/core/hours.js';
import { BUILTIN_MODULES } from '../src/modules/index.js';

test('moduleScore near/far', () => {
  const near = { mode: 'near', distance: 500 };
  assert.equal(moduleScore(100, near), 1);
  assert.equal(moduleScore(750, near), 0.5);
  assert.equal(moduleScore(2000, near), 0);
  assert.equal(moduleScore(Infinity, near), 0);
  const far = { mode: 'far', distance: 100 };
  assert.equal(moduleScore(50, far), 0.5);
  assert.equal(moduleScore(Infinity, far), 1);
  assert.equal(isSatisfied(99, far), false);
  assert.equal(isSatisfied(101, far), true);
});

test('combine: Gewichtung und Pflichtkriterien', () => {
  assert.equal(combine([
    { score: 1, weight: 3, required: false, satisfied: true },
    { score: 0, weight: 1, required: false, satisfied: false },
  ]), 0.75);
  assert.equal(combine([{ score: 0.2, weight: 1, required: true, satisfied: false }]), null);
  assert.equal(combine([]), null);
});

test('scoreColor Endpunkte', () => {
  assert.deepEqual(scoreColor(0), [215, 48, 31]);
  assert.deepEqual(scoreColor(1), [26, 152, 80]);
});

test('analyzeArea findet die Zelle neben der Tankstelle als Top-Spot', () => {
  const fuel = { lat: 52.52, lon: 13.40 };
  const layers = [{
    module: { id: 'x' },
    settings: { mode: 'near', distance: 200, weight: 1, required: true },
    index: new SpatialIndex([fuel]),
  }];
  const bbox = { south: 52.51, west: 13.38, north: 52.53, east: 13.42 };
  const res = analyzeArea(bbox, layers, { cellMeters: 100 });
  assert.ok(res.top.length >= 1);
  assert.ok(res.coverage > 0 && res.coverage < 0.2);
  const p = evaluatePoint(res.top[0].lat, res.top[0].lon, layers);
  assert.equal(p.score, 1);
});

test('buildQuery und elementsToPoints', () => {
  const q = buildQuery(['[amenity=fuel]'], { south: 1, west: 2, north: 3, east: 4 });
  assert.equal(q, '[out:json][timeout:90];(nwr[amenity=fuel](1,2,3,4););out tags center;');
  assert.match(buildQuery(['[highway=primary]'], { south: 1, west: 2, north: 3, east: 4 }, 'line'), /way\[highway=primary\].*out tags geom;/);
  const pts = elementsToPoints([
    { type: 'node', id: 1, lat: 1, lon: 2, tags: { a: 'b' } },
    { type: 'way', id: 2, center: { lat: 3, lon: 4 } },
    { type: 'relation', id: 3 },
  ]);
  assert.equal(pts.length, 2);
  assert.equal(pts[1].id, 'way/2');
});

test('Öffnungszeiten-Fallback', () => {
  assert.equal(isOpenAt('24/7', new Date()), true);
  assert.equal(isOpenAt('off', new Date()), false);
  assert.equal(isOpenAt(undefined, new Date()), null);
});

test('alle Module haben eindeutige IDs und gültige Defaults', () => {
  const ids = new Set();
  for (const m of BUILTIN_MODULES) {
    assert.ok(!ids.has(m.id), `doppelte ID ${m.id}`);
    ids.add(m.id);
    assert.ok(['near', 'far'].includes(m.defaults.mode));
    assert.ok(m.defaults.distance > 0);
  }
});
