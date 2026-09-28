// Mikro-Benchmark für den Hot Path (Raster × Module × Nächster-Nachbar): `npm run bench`
import { analyzeArea } from '../src/core/analyzer.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { WalkGraph, NetworkField } from '../src/core/routing.js';

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const bbox = { south: 52.45, west: 13.3, north: 52.55, east: 13.5 };
const time = (label, fn, runs = 3) => {
  fn(); // Aufwärmen (JIT)
  const t = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  console.log(`${label.padEnd(58)} ${Math.round(Math.min(...t))} ms`);
};

const layers = Array.from({ length: 12 }, (_, i) => ({
  module: { id: `m${i}` },
  settings: { mode: i % 4 === 0 ? 'far' : 'near', distance: 300 + i * 50, weight: 1, required: i === 1, minCount: i === 2 ? 3 : 1 },
  index: new SpatialIndex(Array.from({ length: 5000 }, () => ({ lat: 52.45 + rnd() * 0.1, lon: 13.3 + rnd() * 0.2 }))),
}));
time('analyzeArea 160×160 Zellen, 12 Module à 5.000 POIs', () => analyzeArea(bbox, layers));

// Gitter-Straßennetz ~ 200×200 Knoten (40.000) als Stand-in für eine Innenstadt
const N = 200;
const els = [];
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) els.push({ type: 'node', id: r * N + c + 1, lat: 52.45 + (r / N) * 0.1, lon: 13.3 + (c / N) * 0.2 });
for (let r = 0; r < N; r++) els.push({ type: 'way', id: 1e6 + r, nodes: Array.from({ length: N }, (_, c) => r * N + c + 1) });
for (let c = 0; c < N; c++) els.push({ type: 'way', id: 2e6 + c, nodes: Array.from({ length: N }, (_, r) => r * N + c + 1) });
let graph;
time(`WalkGraph bauen (${(N * N).toLocaleString('de')} Knoten)`, () => (graph = new WalkGraph(els)), 1);
const pois = Array.from({ length: 300 }, () => ({ lat: 52.45 + rnd() * 0.1, lon: 13.3 + rnd() * 0.2 }));
time('NetworkField: Multi-Source-Dijkstra von 300 POIs', () => new NetworkField(graph, pois, 1500));
