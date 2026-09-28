import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkGraph, NetworkField, isochrone, buildWalkQuery } from '../src/core/routing.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { haversine } from '../src/core/geo.js';

// Zwei Uferstraßen (Nord/Süd), ~111 m auseinander, nur im Osten per Brücke verbunden.
function riverTown() {
  const els = [];
  let id = 1;
  const street = (lat) => {
    const ids = [];
    for (let k = 0; k <= 10; k++) {
      els.push({ type: 'node', id, lat, lon: 13.4 + k * 0.001 });
      ids.push(id++);
    }
    els.push({ type: 'way', id: id++, nodes: ids });
    return ids;
  };
  const south = street(52.5);
  const north = street(52.501);
  els.push({ type: 'way', id: id++, nodes: [south.at(-1), north.at(-1)] }); // Brücke
  // isolierter Innenhof-Weg, soll wegfallen
  els.push({ type: 'node', id: 9001, lat: 52.5005, lon: 13.4 }, { type: 'node', id: 9002, lat: 52.5005, lon: 13.4001 });
  els.push({ type: 'way', id: 9003, nodes: [9001, 9002] });
  return els;
}

test('Graph: Knoten, Kanten, kleine Komponenten werden verworfen', () => {
  const g = new WalkGraph(riverTown(), { minComponent: 5 });
  assert.equal(g.n, 24);
  assert.equal(g.edgeCount, 10 + 10 + 1 + 1);
  // Innenhof-Knoten liegt exakt zwischen den Ufern, darf aber nicht gesnappt werden
  const s = g.snap(52.5005, 13.4, 200);
  assert.ok(s && Math.abs(g.lat[s.node] - 52.5005) > 1e-6);
});

test('Fußweg über die Brücke ist viel länger als die Luftlinie über den Fluss', () => {
  const g = new WalkGraph(riverTown(), { minComponent: 5 });
  const poi = [{ lat: 52.5, lon: 13.4, tags: { name: 'Späti Süd' } }];
  const field = new NetworkField(g, poi, 5000);
  const hit = field.nearest(52.501, 13.4);
  const air = new SpatialIndex(poi).nearest(52.501, 13.4);
  const bridge = haversine(52.5, 13.4, 52.5, 13.41);
  assert.ok(air.dist < 120, `Luftlinie ${air.dist}`);
  assert.ok(Math.abs(hit.dist - (2 * bridge + air.dist)) < 5, `Netz ${hit.dist}`);
  assert.equal(hit.item.tags.name, 'Späti Süd');
  // Cutoff respektiert
  assert.equal(new NetworkField(g, poi, 500).nearest(52.501, 13.4), null);
});

test('Multi-Source: jeder Knoten bekommt den nächsten POI', () => {
  const g = new WalkGraph(riverTown(), { minComponent: 5 });
  const pois = [
    { lat: 52.5, lon: 13.4, tags: { name: 'West' } },
    { lat: 52.5, lon: 13.41, tags: { name: 'Ost' } },
  ];
  const f = new NetworkField(g, pois, 5000);
  assert.equal(f.nearest(52.5, 13.402).item.tags.name, 'West');
  assert.equal(f.nearest(52.5, 13.408).item.tags.name, 'Ost');
  assert.equal(f.nearest(52.501, 13.401).item.tags.name, 'Ost', 'Nordufer erreicht nur über die Brücke');
});

test('Isochrone', () => {
  const g = new WalkGraph(riverTown(), { minComponent: 5 });
  const iso = isochrone(g, 52.5, 13.4, 5); // 400 m
  assert.ok(iso.reached >= 5 && iso.reached <= 7, `reached ${iso.reached}`);
  assert.ok(iso.segments.every((s) => s.min <= 5));
  assert.match(buildWalkQuery({ south: 1, west: 2, north: 3, east: 4 }), /out skel qt;$/);
});
