// Flächenanteil im Umkreis ("Wie grün ist es hier?"):
// Polygone (Ways + Multipolygon-Relationen) → Raster (25 m) → Summed-Area-Table.
// Danach ist der Anteil in einem Quadrat beliebiger Größe eine O(1)-Abfrage.

import { metersPerDegree } from './geo.js';

/** Setzt Ringe aus (teils zerstückelten) Linien zusammen – nötig für Multipolygon-Relationen. */
export function assembleRings(lines) {
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const open = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings = [];
  while (open.length) {
    let ring = open.pop();
    let grown = true;
    while (key(ring[0]) !== key(ring.at(-1)) && grown) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const l = open[i];
        const end = key(ring.at(-1));
        if (key(l[0]) === end) ring = ring.concat(l.slice(1));
        else if (key(l.at(-1)) === end) ring = ring.concat(l.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring.at(-1))) rings.push(ring);
  }
  return rings;
}

/**
 * Mit `out geom(bbox)` liefert Overpass für Knoten außerhalb des Gebiets `null`
 * (der erste Knoten jenseits der Grenze bleibt erhalten). Lücken werden per Sehne geschlossen –
 * die liegt außerhalb des Gebiets und verfälscht den Anteil darin nicht.
 */
const clean = (g) => g.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));

/** Äußere Ringe eines Overpass-Elements (Way mit geometry oder Relation mit members). */
export function outerRings(el) {
  if (Array.isArray(el.geometry)) {
    const g = clean(el.geometry);
    // zugeschnittener, geschlossener Way: Anfang/Ende können fehlen → wieder schließen
    if (g.length >= 3 && el.geometry.length && (el.geometry[0] === null || el.geometry.at(-1) === null)) g.push(g[0]);
    return assembleRings([g]);
  }
  if (Array.isArray(el.members)) {
    return assembleRings(el.members.filter((m) => m.type === 'way' && m.role !== 'inner' && Array.isArray(m.geometry)).map((m) => clean(m.geometry)));
  }
  return [];
}

export class ShareField {
  /**
   * @param {object[]} elements Overpass-Elemente (Flächen)
   * @param {{south,west,north,east}} bbox Gebiet (inkl. Rand)
   * @param {number} radius Umkreis in Metern (als Quadrat mit Kantenlänge 2·radius)
   */
  constructor(elements, bbox, radius = 300, cell = 25) {
    this.bbox = bbox;
    this.radius = radius;
    const m = metersPerDegree((bbox.south + bbox.north) / 2);
    this.m = m;
    this.cols = Math.max(1, Math.min(600, Math.round(((bbox.east - bbox.west) * m.lon) / cell)));
    this.rows = Math.max(1, Math.min(600, Math.round(((bbox.north - bbox.south) * m.lat) / cell)));
    this.dLat = (bbox.north - bbox.south) / this.rows;
    this.dLon = (bbox.east - bbox.west) / this.cols;
    const grid = new Uint8Array(this.rows * this.cols);
    this.polygons = 0;
    for (const el of elements) {
      for (const ring of outerRings(el)) {
        this.polygons++;
        this.#fill(grid, ring);
      }
    }
    // Summed-Area-Table (rows+1 × cols+1)
    const W = this.cols + 1;
    const sat = new Uint32Array((this.rows + 1) * W);
    for (let r = 0; r < this.rows; r++) {
      let rowSum = 0;
      for (let c = 0; c < this.cols; c++) {
        rowSum += grid[r * this.cols + c];
        sat[(r + 1) * W + c + 1] = sat[r * W + c + 1] + rowSum;
      }
    }
    this.sat = sat;
  }

  /** Scanline-Füllung eines Rings (Zellmittelpunkte, Even-Odd). */
  #fill(grid, ring) {
    const { south, west } = this.bbox;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of ring) (minLat = Math.min(minLat, p.lat)), (maxLat = Math.max(maxLat, p.lat));
    const r0 = Math.max(0, Math.floor((this.bbox.north - maxLat) / this.dLat));
    const r1 = Math.min(this.rows - 1, Math.floor((this.bbox.north - minLat) / this.dLat));
    for (let r = r0; r <= r1; r++) {
      const lat = this.bbox.north - (r + 0.5) * this.dLat;
      const xs = [];
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1];
        const b = ring[i];
        if (a.lat > lat !== b.lat > lat) xs.push(a.lon + ((lat - a.lat) / (b.lat - a.lat)) * (b.lon - a.lon));
      }
      xs.sort((x, y) => x - y);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - west) / this.dLon - 0.5));
        const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - west) / this.dLon - 0.5));
        for (let c = c0; c <= c1; c++) grid[r * this.cols + c] = 1;
      }
    }
    void south;
  }

  /** Anteil (0–100 %) der Fläche im Quadrat um den Punkt. */
  shareAt(lat, lon) {
    const rr = Math.round(this.radius / (this.dLat * this.m.lat));
    const rc = Math.round(this.radius / (this.dLon * this.m.lon));
    const r = Math.floor((this.bbox.north - lat) / this.dLat);
    const c = Math.floor((lon - this.bbox.west) / this.dLon);
    const r0 = Math.max(0, r - rr);
    const r1 = Math.min(this.rows, r + rr + 1);
    const c0 = Math.max(0, c - rc);
    const c1 = Math.min(this.cols, c + rc + 1);
    if (r1 <= r0 || c1 <= c0) return 0;
    const W = this.cols + 1;
    const s = this.sat;
    const sum = s[r1 * W + c1] - s[r0 * W + c1] - s[r1 * W + c0] + s[r0 * W + c0];
    return (100 * sum) / ((r1 - r0) * (c1 - c0));
  }
}

/** Adapter mit nearest()-Schnittstelle: "Distanz" = Anteil in %, gewertet als „weit weg ≥ Ziel-%“. */
export class ShareIndex {
  constructor(field, label) {
    this.field = field;
    this.item = { tags: { name: label } };
  }

  get size() {
    return this.field.polygons;
  }

  nearest(lat, lon) {
    return { item: this.item, dist: this.field.shareAt(lat, lon) };
  }
}
