// Pendel-Check: Reisezeit von jeder Rasterzelle zu einem persönlichen Ziel (Arbeit, Uni, …).
//
// 🚶 🚲 🚗  FOSSGIS-OSRM (routing.openstreetmap.de) – Table-Service auf einem groben Stützraster,
//          dazwischen bilinear interpoliert (Reisezeit ist räumlich glatt genug).
// 🚆       Transitous/MOTIS one-to-all mit arriveBy: alle Haltestellen, von denen man rechtzeitig
//          ankommt, plus Fußweg zur Haltestelle.
// Beide Dienste sind frei, ohne API-Key und CORS-fähig. Bitte fair nutzen (Ergebnisse werden gecacht).

import { haversine } from './geo.js';
import { SpatialIndex } from './spatial-index.js';

export const COMMUTE_MODES = {
  foot: { label: 'zu Fuß', icon: '🚶', profile: 'routed-foot' },
  bike: { label: 'Fahrrad', icon: '🚲', profile: 'routed-bike' },
  car: { label: 'Auto', icon: '🚗', profile: 'routed-car' },
  transit: { label: 'ÖPNV', icon: '🚆' },
};

const OSRM = 'https://routing.openstreetmap.de';
const MOTIS = 'https://api.transitous.org/api/v1/one-to-all';
const WALK_M_PER_MIN = 80;
const DETOUR = 1.3; // Luftlinie → Fußweg

/**
 * Reisezeitfeld auf Stützraster, bilinear interpoliert.
 * values[r][c] = Minuten (Infinity = nicht erreichbar)
 */
export class GridField {
  constructor(bbox, n, values) {
    this.bbox = bbox;
    this.n = n;
    this.values = values;
  }

  minutesAt(lat, lon) {
    const { south, west, north, east } = this.bbox;
    const n = this.n;
    const fy = ((north - lat) / (north - south)) * (n - 1);
    const fx = ((lon - west) / (east - west)) * (n - 1);
    const r0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
    const c0 = Math.max(0, Math.min(n - 2, Math.floor(fx)));
    const ty = Math.max(0, Math.min(1, fy - r0));
    const tx = Math.max(0, Math.min(1, fx - c0));
    const v = this.values;
    const q = [v[r0][c0], v[r0][c0 + 1], v[r0 + 1][c0], v[r0 + 1][c0 + 1]];
    if (q.some((x) => !Number.isFinite(x))) {
      // Rand eines unerreichbaren Bereichs: nächster Stützpunkt statt Interpolation
      return v[Math.round(fy)]?.[Math.round(fx)] ?? Infinity;
    }
    return (q[0] * (1 - tx) + q[1] * tx) * (1 - ty) + (q[2] * (1 - tx) + q[3] * tx) * ty;
  }
}

/** Stützpunkte eines n×n-Rasters (Zeile 0 = Norden). */
export function supportPoints(bbox, n) {
  const pts = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      pts.push({
        lat: bbox.north - (r / (n - 1)) * (bbox.north - bbox.south),
        lon: bbox.west + (c / (n - 1)) * (bbox.east - bbox.west),
      });
    }
  }
  return pts;
}

/** Straßenrouting (Fuß/Rad/Auto) über OSRM-Table: 1 Anfrage für n² Punkte (n ≤ 9). */
export async function osrmField(mode, target, bbox, { n = 9, fetchImpl = globalThis.fetch, signal } = {}) {
  const profile = COMMUTE_MODES[mode]?.profile;
  if (!profile) throw new Error(`Unbekannter Modus ${mode}`);
  const pts = supportPoints(bbox, n);
  const coords = [target, ...pts].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const res = await fetchImpl(`${OSRM}/${profile}/table/v1/driving/${coords}?sources=0`, { signal });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM: ${json.message || json.code}`);
  const row = json.durations[0];
  const values = [];
  for (let r = 0; r < n; r++) values.push(row.slice(1 + r * n, 1 + (r + 1) * n).map((s) => (s == null ? Infinity : s / 60)));
  return new GridField(bbox, n, values);
}

/**
 * Transitous one-to-all: alle Haltestellen, die ab (bzw. mit arriveBy: bis) `time` in ≤ maxMinutes erreichbar sind.
 * @returns {Promise<{lat:number, lon:number, name:string, minutes:number}[]>}
 */
export async function transitReach(point, { time, maxMinutes = 30, arriveBy = false, fetchImpl = globalThis.fetch, signal } = {}) {
  const params = new URLSearchParams({
    one: `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`,
    time: time.toISOString(),
    arriveBy: String(arriveBy),
    maxTravelTime: String(Math.min(90, Math.max(5, Math.round(maxMinutes)))),
  });
  const res = await fetchImpl(`${MOTIS}?${params}`, { signal });
  if (!res.ok) throw new Error(`Transitous HTTP ${res.status}`);
  const json = await res.json();
  // Pro Haltestelle (Name + Position) nur die schnellste Variante
  const best = new Map();
  for (const r of json.all || []) {
    if (!r.place || !Number.isFinite(r.duration)) continue;
    const key = `${r.place.name}|${r.place.lat.toFixed(4)},${r.place.lon.toFixed(4)}`;
    const cur = best.get(key);
    if (!cur || r.duration < cur.minutes) best.set(key, { lat: r.place.lat, lon: r.place.lon, name: r.place.name, minutes: r.duration });
  }
  return [...best.values()];
}

/**
 * ÖPNV: Haltestellen, von denen man bis `time` am Ziel ist (arriveBy), + Fußweg dorthin.
 * @returns {{minutesAt(lat, lon): number, stops: number}}
 */
export async function transitField(target, { time, maxMinutes = 45, fetchImpl, signal } = {}) {
  const stops = await transitReach(target, { time, maxMinutes, arriveBy: true, fetchImpl, signal });
  return stopsField(target, stops.map((s) => ({ place: s, duration: s.minutes })), maxMinutes);
}

/** Aus erreichbaren Haltestellen ein Zeitfeld bauen (auch für Tests ohne Netz). */
export function stopsField(target, reachable, maxMinutes) {
  const stops = reachable
    .filter((r) => Number.isFinite(r.duration) && r.place)
    .map((r) => ({ lat: r.place.lat, lon: r.place.lon, minutes: r.duration, name: r.place.name }));
  const index = new SpatialIndex(stops, 250);
  const walkLimit = 15 * WALK_M_PER_MIN; // max. 15 min zur Haltestelle
  return {
    stops: stops.length,
    minutesAt(lat, lon) {
      // Direkt zu Fuß ist auch eine Option
      let best = (haversine(lat, lon, target.lat, target.lon) * DETOUR) / WALK_M_PER_MIN;
      for (const { item, dist } of index.within(lat, lon, walkLimit / DETOUR)) {
        const t = item.minutes + (dist * DETOUR) / WALK_M_PER_MIN;
        if (t < best) best = t;
      }
      return best <= maxMinutes * 2 ? best : Infinity;
    },
  };
}

/**
 * Adapter mit der Schnittstelle von SpatialIndex (nearest), Einheit = Minuten.
 * So läuft ein Ziel wie jedes andere Modul durch Analyzer, Report, Tabelle und CLI.
 */
export class CommuteIndex {
  constructor(field, target) {
    this.field = field;
    this.item = { lat: target.lat, lon: target.lon, id: `target/${target.id}`, tags: { name: target.name } };
  }

  get size() {
    return 1;
  }

  nearest(lat, lon, maxMinutes = Infinity) {
    const m = this.field.minutesAt(lat, lon);
    return Number.isFinite(m) && m <= maxMinutes ? { item: this.item, dist: m } : null;
  }
}
