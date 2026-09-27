import { haversine, metersPerDegree } from './geo.js';

/**
 * Einfacher Hash-Grid-Index für Nächster-Nachbar-Abfragen.
 * Reicht für einige zehntausend Punkte auf Stadtteil-/Stadtebene völlig aus.
 */
export class SpatialIndex {
  /**
   * @param {{lat:number, lon:number}[]} items
   * @param {number} bucketMeters Kantenlänge eines Buckets
   */
  constructor(items, bucketMeters = 200) {
    this.items = items;
    this.bucket = bucketMeters;
    const refLat = items.length ? items.reduce((s, p) => s + p.lat, 0) / items.length : 50;
    this.m = metersPerDegree(refLat);
    this.cells = new Map();
    for (const it of items) {
      const k = this.#key(...this.#cell(it.lat, it.lon));
      let arr = this.cells.get(k);
      if (!arr) this.cells.set(k, (arr = []));
      arr.push(it);
    }
  }

  get size() {
    return this.items.length;
  }

  #cell(lat, lon) {
    return [Math.floor((lon * this.m.lon) / this.bucket), Math.floor((lat * this.m.lat) / this.bucket)];
  }

  #key(x, y) {
    return `${x}:${y}`;
  }

  /**
   * Nächster Punkt innerhalb von `maxDist` Metern.
   * @returns {{item: any, dist: number} | null}
   */
  nearest(lat, lon, maxDist = 5000) {
    if (!this.items.length) return null;
    const [cx, cy] = this.#cell(lat, lon);
    const maxRing = Math.ceil(maxDist / this.bucket) + 1;
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      // Ring r absuchen
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const arr = this.cells.get(this.#key(x, y));
          if (!arr) continue;
          for (const it of arr) {
            const d = haversine(lat, lon, it.lat, it.lon);
            if (d < bestD) {
              bestD = d;
              best = it;
            }
          }
        }
      }
      // Alles außerhalb von Ring r ist mindestens (r * bucket) entfernt.
      if (best && bestD <= r * this.bucket) break;
    }
    return best && bestD <= maxDist ? { item: best, dist: bestD } : null;
  }

  /** Alle Punkte im Umkreis (für Zählungen wie "3 Supermärkte in 500 m"). */
  within(lat, lon, radius) {
    const [cx, cy] = this.#cell(lat, lon);
    const r = Math.ceil(radius / this.bucket);
    const out = [];
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        const arr = this.cells.get(this.#key(x, y));
        if (!arr) continue;
        for (const it of arr) {
          const d = haversine(lat, lon, it.lat, it.lon);
          if (d <= radius) out.push({ item: it, dist: d });
        }
      }
    }
    return out.sort((a, b) => a.dist - b.dist);
  }
}
