import { densify } from './geo.js';
import { compileSelectors } from './tagfilter.js';

// Öffentliche Overpass-Instanzen. Bitte fair nutzen (kleine Gebiete, Cache).
export const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const round = (v) => Math.round(v * 1e4) / 1e4;
const bboxStr = (b) => [b.south, b.west, b.north, b.east].map(round).join(',');

/** Einfache Abfrage für EIN Modul (wird von der CLI/Tests genutzt). */
export function buildQuery(selectors, bbox, geometry = 'point') {
  const type = geometry === 'line' ? 'way' : 'nwr';
  const parts = selectors.map((sel) => `${type}${sel}(${bboxStr(bbox)});`).join('');
  const out = geometry === 'line' ? 'out tags geom;' : 'out tags center;';
  return `[out:json][timeout:90];(${parts});${out}`;
}

/**
 * EINE Abfrage für beliebig viele Module: Punkt-Module bekommen Mittelpunkte,
 * Linien-Module die komplette Geometrie. Doppelte Selektoren werden zusammengefasst.
 */
export function buildCombinedQuery(modules, bbox) {
  const b = bboxStr(bbox);
  const pts = new Set();
  const lines = new Set();
  for (const m of modules) for (const s of m.query) (m.geometry === 'line' ? lines : pts).add(s);
  let q = '[out:json][timeout:120];';
  if (pts.size) q += `(${[...pts].map((s) => `nwr${s}(${b});`).join('')})->.p;.p out tags center;`;
  if (lines.size) q += `(${[...lines].map((s) => `way${s}(${b});`).join('')})->.l;.l out tags geom;`;
  return q;
}

/**
 * Verteilt die Elemente einer kombinierten Abfrage auf die Module.
 * @returns {Map<string, object[]>} moduleId -> Elemente
 */
export function classify(elements, modules) {
  const out = new Map(modules.map((m) => [m.id, []]));
  const matchers = modules.map((m) => [m, compileSelectors(m.query)]);
  for (const el of elements) {
    const isLine = Array.isArray(el.geometry);
    for (const [m, match] of matchers) {
      if ((m.geometry === 'line') !== isLine) continue;
      if (match(el.tags)) out.get(m.id).push(el);
    }
  }
  return out;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Führt eine Abfrage aus. Bei Fehlern / Rate-Limit wird die nächste Instanz probiert,
 * nach einer vollen Runde mit Backoff noch einmal.
 */
export async function runQuery(query, { signal, endpoints = ENDPOINTS, timeoutMs = 60_000, rounds = 2, fetchImpl = globalThis.fetch, onAttempt } = {}) {
  if (memCache.has(query)) return memCache.get(query);
  let lastErr;
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(2000 * round);
    for (const url of endpoints) {
      onAttempt?.(url, round);
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          // Eigenes Timeout pro Instanz, damit eine hängende Instanz nicht alles blockiert.
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
        const json = await res.json();
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
          throw new Error(`${new URL(url).host}: ${json.remark}`);
        }
        const elements = json.elements || [];
        memCache.set(query, elements);
        return elements;
      } catch (e) {
        if (signal?.aborted) throw e;
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('Keine Overpass-Instanz erreichbar');
}
