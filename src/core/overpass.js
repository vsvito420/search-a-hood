import { densify } from './geo.js';

// Öffentliche Overpass-Instanzen. Bitte fair nutzen (kleine Gebiete, Cache).
export const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const round = (v) => Math.round(v * 1e4) / 1e4;

/** Baut eine Overpass-QL-Abfrage aus Tag-Filtern wie `[amenity=fuel]`. */
export function buildQuery(selectors, bbox, geometry = 'point') {
  const b = [bbox.south, bbox.west, bbox.north, bbox.east].map(round).join(',');
  const type = geometry === 'line' ? 'way' : 'nwr';
  const parts = selectors.map((sel) => `${type}${sel}(${b});`).join('');
  const out = geometry === 'line' ? 'out tags geom;' : 'out tags center;';
  return `[out:json][timeout:90];(${parts});${out}`;
}

/**
 * Wandelt Overpass-Elemente in Punkte um. Linien werden verdichtet,
 * damit der Nächster-Nachbar-Index Abstände zu Straßen/Gleisen annähern kann.
 */
export function elementsToPoints(elements, geometry = 'point') {
  const pts = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const base = { id: `${el.type}/${el.id}`, tags };
    if (geometry === 'line' && el.geometry) {
      for (const p of densify(el.geometry, 25)) pts.push({ ...base, lat: p.lat, lon: p.lon });
      continue;
    }
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    pts.push({ ...base, lat, lon });
  }
  return pts;
}

const memCache = new Map();

/** Führt eine Abfrage aus und probiert bei Fehlern die nächste Instanz. */
export async function runQuery(query, { signal, endpoints = ENDPOINTS, timeoutMs = 45_000 } = {}) {
  if (memCache.has(query)) return memCache.get(query);
  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        // Eigenes Timeout pro Instanz, damit eine hängende Instanz nicht alles blockiert.
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const json = await res.json();
      const elements = json.elements || [];
      memCache.set(query, elements);
      return elements;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Keine Overpass-Instanz erreichbar');
}
