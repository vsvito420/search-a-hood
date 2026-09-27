import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridField, supportPoints, osrmField, stopsField, CommuteIndex } from '../src/core/commute.js';
import { evaluatePoint } from '../src/core/analyzer.js';

const bbox = { south: 52.49, west: 13.40, north: 52.51, east: 13.44 };

test('Stützraster: Ecken und Reihenfolge', () => {
  const pts = supportPoints(bbox, 3);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { lat: 52.51, lon: 13.4 });
  assert.deepEqual(pts[8], { lat: 52.49, lon: 13.44 });
});

test('GridField interpoliert bilinear und fällt bei Lücken auf den nächsten Stützpunkt zurück', () => {
  const f = new GridField(bbox, 2, [
    [0, 10],
    [20, 30],
  ]);
  assert.equal(f.minutesAt(52.51, 13.40), 0);
  assert.equal(f.minutesAt(52.49, 13.44), 30);
  assert.equal(f.minutesAt(52.50, 13.42), 15);
  const g = new GridField(bbox, 2, [
    [0, Infinity],
    [20, 30],
  ]);
  assert.equal(g.minutesAt(52.509, 13.401), 0);
});

test('osrmField baut Anfrage und Raster korrekt', async () => {
  let url;
  const fetchImpl = async (u) => {
    url = u;
    return { ok: true, json: async () => ({ code: 'Ok', durations: [[0, 60, 120, 180, null]] }) };
  };
  const f = await osrmField('bike', { lat: 52.52, lon: 13.41 }, bbox, { n: 2, fetchImpl });
  assert.match(url, /routed-bike\/table\/v1\/driving\/13\.41000,52\.52000;13\.40000,52\.51000;/);
  assert.match(url, /\?sources=0$/);
  assert.deepEqual(f.values, [
    [1, 2],
    [3, Infinity],
  ]);
});

test('ÖPNV-Feld: Haltestelle + Fußweg, direkte Option, Obergrenze', () => {
  const target = { lat: 52.52, lon: 13.41 };
  const f = stopsField(target, [{ place: { lat: 52.50, lon: 13.42, name: 'Kotti' }, duration: 10 }], 30);
  const atStop = f.minutesAt(52.50, 13.42);
  assert.ok(Math.abs(atStop - 10) < 0.01);
  const near = f.minutesAt(52.5036, 13.42); // ~400 m von der Haltestelle
  assert.ok(near > 15 && near < 18, `near ${near}`);
  assert.ok(f.minutesAt(52.5199, 13.41) < 1, 'direkt neben dem Ziel');
  assert.equal(f.minutesAt(52.40, 13.20), Infinity);
});

test('CommuteIndex fügt sich in evaluatePoint ein (Einheit Minuten)', () => {
  const field = { minutesAt: () => 25 };
  const idx = new CommuteIndex(field, { id: 'a', name: 'Arbeit', lat: 0, lon: 0 });
  const r = evaluatePoint(0, 0, [{ module: { id: 't' }, settings: { mode: 'near', distance: 20, weight: 1, required: false }, index: idx }]);
  assert.equal(r.parts[0].dist, 25);
  assert.equal(r.parts[0].score, 0.75);
  assert.equal(r.parts[0].hit.item.tags.name, 'Arbeit');
});
