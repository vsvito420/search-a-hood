// Fußwege-Routing direkt im Browser: Wegenetz aus OSM → Graph (CSR) → Dijkstra.
// Ein Multi-Source-Dijkstra pro Modul liefert für JEDEN Knoten die echte Gehdistanz
// zum nächsten POI. Damit wird die ganze Heatmap in Fußwegen statt Luftlinie berechnet.

import { haversine } from './geo.js';
import { SpatialIndex } from './spatial-index.js';

export const WALK_SPEED_M_PER_MIN = 80; // ≈ 4,8 km/h

export const WALK_SELECTOR =
  '[highway~"^(footway|path|pedestrian|living_street|residential|service|unclassified|road|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|steps|track|cycleway|corridor|platform|bridleway)$"]' +
  '[foot!~"^(no|private)$"][access!~"^(private|no)$"]';

export function buildWalkQuery(bbox) {
  const b = [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(5)).join(',');
  return `[out:json][timeout:180];way${WALK_SELECTOR}(${b});(._;>;);out skel qt;`;
}

/** Binärer Min-Heap auf parallelen Arrays (schnell, keine Objekte pro Eintrag). */
class MinHeap {
  constructor(cap = 1024) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
    this.size = 0;
  }
  push(key, val) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      k.set(this.keys);
      this.keys = k;
      const v = new Int32Array(this.size * 2);
      v.set(this.vals);
      this.vals = v;
    }
    let i = this.size++;
    const { keys, vals } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop() {
    const { keys, vals } = this;
    const topVal = vals[0];
    const topKey = keys[0];
    const lastKey = keys[--this.size];
    const lastVal = vals[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= lastKey) break;
      keys[i] = keys[c];
      vals[i] = vals[c];
      i = c;
    }
    keys[i] = lastKey;
    vals[i] = lastVal;
    this.lastKey = topKey;
    return topVal;
  }
}

export class WalkGraph {
  /**
   * @param {object[]} elements Overpass-Antwort von buildWalkQuery (Ways mit nodes[] + Nodes mit lat/lon)
   * @param {{minComponent?: number}} opts Kleine, isolierte Wegstücke (z. B. in Innenhöfen) verwerfen
   */
  constructor(elements, { minComponent = 25 } = {}) {
    const coords = new Map();
    for (const el of elements) if (el.type === 'node') coords.set(el.id, el);

    const idxOf = new Map();
    const lat = [];
    const lon = [];
    const edges = [];
    const idx = (id) => {
      let i = idxOf.get(id);
      if (i === undefined) {
        const n = coords.get(id);
        if (!n) return -1;
        i = lat.length;
        idxOf.set(id, i);
        lat.push(n.lat);
        lon.push(n.lon);
      }
      return i;
    };
    for (const el of elements) {
      if (el.type !== 'way' || !el.nodes) continue;
      for (let k = 1; k < el.nodes.length; k++) {
        const a = idx(el.nodes[k - 1]);
        const b = idx(el.nodes[k]);
        if (a < 0 || b < 0 || a === b) continue;
        edges.push(a, b);
      }
    }
    this.#build(lat, lon, edges);
    if (minComponent > 1) this.#pruneSmallComponents(minComponent);
    this.index = new SpatialIndex(
      Array.from({ length: this.n }, (_, i) => ({ lat: this.lat[i], lon: this.lon[i], i })).filter((p) => this.alive[p.i]),
      100,
    );
  }

  #build(lat, lon, edges) {
    const n = lat.length;
    this.n = n;
    this.lat = Float64Array.from(lat);
    this.lon = Float64Array.from(lon);
    const deg = new Int32Array(n + 1);
    for (let k = 0; k < edges.length; k += 2) {
      deg[edges[k]]++;
      deg[edges[k + 1]]++;
    }
    const off = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
    const fill = off.slice(0, n);
    const tgt = new Int32Array(off[n]);
    const w = new Float32Array(off[n]);
    for (let k = 0; k < edges.length; k += 2) {
      const a = edges[k];
      const b = edges[k + 1];
      const d = haversine(this.lat[a], this.lon[a], this.lat[b], this.lon[b]);
      tgt[fill[a]] = b;
      w[fill[a]++] = d;
      tgt[fill[b]] = a;
      w[fill[b]++] = d;
    }
    this.off = off;
    this.tgt = tgt;
    this.w = w;
    this.alive = new Uint8Array(n).fill(1);
    this.edgeCount = edges.length / 2;
  }

  #pruneSmallComponents(min) {
    const comp = new Int32Array(this.n).fill(-1);
    const stack = [];
    for (let s = 0; s < this.n; s++) {
      if (comp[s] !== -1) continue;
      const members = [s];
      comp[s] = s;
      stack.push(s);
      while (stack.length) {
        const u = stack.pop();
        for (let e = this.off[u]; e < this.off[u + 1]; e++) {
          const v = this.tgt[e];
          if (comp[v] === -1) {
            comp[v] = s;
            members.push(v);
            stack.push(v);
          }
        }
      }
      if (members.length < min) for (const m of members) this.alive[m] = 0;
    }
  }

  /** Nächster Graph-Knoten zu einer Koordinate. */
  snap(lat, lon, maxDist = 150) {
    const hit = this.index.nearest(lat, lon, maxDist);
    return hit ? { node: hit.item.i, dist: hit.dist } : null;
  }

  /**
   * Multi-Source-Dijkstra.
   * @param {{node:number, dist:number, origin:number}[]} sources
   * @param {number} cutoff maximale Distanz in Metern
   * @returns {{dist: Float64Array, origin: Int32Array}} Infinity / -1 = nicht erreicht
   */
  dijkstra(sources, cutoff = Infinity) {
    const dist = new Float64Array(this.n).fill(Infinity);
    const origin = new Int32Array(this.n).fill(-1);
    const heap = new MinHeap(Math.max(64, sources.length * 2));
    for (const s of sources) {
      if (s.dist < dist[s.node]) {
        dist[s.node] = s.dist;
        origin[s.node] = s.origin;
        heap.push(s.dist, s.node);
      }
    }
    const { off, tgt, w } = this;
    while (heap.size) {
      const u = heap.pop();
      const du = heap.lastKey;
      if (du > dist[u]) continue; // veralteter Eintrag
      if (du > cutoff) break;
      for (let e = off[u]; e < off[u + 1]; e++) {
        const v = tgt[e];
        const nd = du + w[e];
        if (nd < dist[v] && nd <= cutoff) {
          dist[v] = nd;
          origin[v] = origin[u];
          heap.push(nd, v);
        }
      }
    }
    return { dist, origin };
  }
}

/**
 * Distanzfeld mit derselben Schnittstelle wie SpatialIndex (nearest), aber in Fußwegen.
 * So kann der Analyzer unverändert zwischen Luftlinie und Fußweg wechseln.
 */
export class NetworkField {
  /**
   * @param {WalkGraph} graph
   * @param {{lat:number, lon:number}[]} pois
   * @param {number} cutoff Meter
   */
  constructor(graph, pois, cutoff, snapMax = 150) {
    this.graph = graph;
    this.pois = pois;
    this.snapMax = snapMax;
    const sources = [];
    pois.forEach((p, i) => {
      const s = graph.snap(p.lat, p.lon, snapMax);
      if (s) sources.push({ node: s.node, dist: s.dist, origin: i });
    });
    this.reachableSources = sources.length;
    const { dist, origin } = graph.dijkstra(sources, cutoff);
    this.dist = dist;
    this.origin = origin;
  }

  get size() {
    return this.pois.length;
  }

  nearest(lat, lon, maxDist = Infinity) {
    const s = this.graph.snap(lat, lon, this.snapMax);
    if (!s) return null;
    const d = this.dist[s.node] + s.dist;
    if (!Number.isFinite(d) || d > maxDist) return null;
    return { item: this.pois[this.origin[s.node]], dist: d };
  }
}

/**
 * Isochrone ab einem Punkt: liefert Kanten mit Ankunftszeit (Minuten) zum Zeichnen.
 * @returns {{segments: {a:[number,number], b:[number,number], min:number}[], reached:number} | null}
 */
export function isochrone(graph, lat, lon, maxMinutes = 15) {
  const s = graph.snap(lat, lon, 200);
  if (!s) return null;
  const cutoff = maxMinutes * WALK_SPEED_M_PER_MIN;
  const { dist } = graph.dijkstra([{ node: s.node, dist: s.dist, origin: 0 }], cutoff);
  const segments = [];
  let reached = 0;
  for (let u = 0; u < graph.n; u++) {
    if (!Number.isFinite(dist[u])) continue;
    reached++;
    for (let e = graph.off[u]; e < graph.off[u + 1]; e++) {
      const v = graph.tgt[e];
      if (v < u || !Number.isFinite(dist[v])) continue; // jede Kante nur einmal
      segments.push({
        a: [graph.lat[u], graph.lon[u]],
        b: [graph.lat[v], graph.lon[v]],
        min: Math.max(dist[u], dist[v]) / WALK_SPEED_M_PER_MIN,
      });
    }
  }
  return { segments, reached };
}
