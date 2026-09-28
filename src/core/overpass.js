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
  const areas = new Set();
  for (const m of modules) for (const s of m.query) (m.geometry === 'line' ? lines : m.geometry === 'area' ? areas : pts).add(s);
  let q = '[out:json][timeout:120];';
  if (pts.size) q += `(${[...pts].map((s) => `nwr${s}(${b});`).join('')})->.p;.p out tags center;`;
  if (lines.size) q += `(${[...lines].map((s) => `way${s}(${b});`).join('')})->.l;.l out tags geom;`;
  // Flächen inkl. Multipolygon-Relationen; Geometrie auf das Gebiet zugeschnitten (riesige Wälder!)
  if (areas.size) q += `(${[...areas].map((s) => `way${s}(${b});relation${s}(${b});`).join('')})->.a;.a out tags geom(${b});`;
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
    const hasGeom = Array.isArray(el.geometry);
    const hasMembers = Array.isArray(el.members);
    for (const [m, match] of matchers) {
      const fits = m.geometry === 'area' ? hasGeom || hasMembers : m.geometry === 'line' ? hasGeom && el.type === 'way' : !hasGeom && !hasMembers;
      if (fits && match(el.tags)) out.get(m.id).push(el);
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
      for (const p of densify(el.geometry.filter(Boolean), 25)) pts.push({ ...base, lat: p.lat, lon: p.lon });
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

/** Overpass antwortet bei Überlast mit HTML/XML statt JSON – daraus eine verständliche Meldung machen. */
export function explainOverpassError(body) {
  if (/rate_limited|too many requests/i.test(body)) return 'Rate-Limit – kurz warten und erneut versuchen';
  if (/timeout|timed out/i.test(body)) return 'Zeitüberschreitung – kleineres Gebiet wählen oder später erneut';
  if (/out of memory/i.test(body)) return 'Abfrage zu groß – kleineres Gebiet wählen';
  const remark = body.match(/<strong[^>]*>\s*Error\s*<\/strong>\s*:?\s*([^<]{3,160})/i)?.[1];
  return remark ? `Serverfehler: ${remark.trim()}` : 'unerwartete Antwort (kein JSON)';
}

/** Stand der OSM-Daten der letzten Antwort (osm3s.timestamp_osm_base) – für die Anzeige. */
export let lastDataTimestamp = null;

let customEndpoints = null;
/** Eigene Overpass-Instanz(en) setzen (null = Standardliste). */
export function setEndpoints(list) {
  customEndpoints = list?.length ? list : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Führt eine Abfrage aus. Bei Fehlern / Rate-Limit wird die nächste Instanz probiert,
 * nach einer vollen Runde mit Backoff noch einmal.
 */
export async function runQuery(query, { signal, endpoints = customEndpoints || ENDPOINTS, timeoutMs = 60_000, rounds = 2, fetchImpl = globalThis.fetch, onAttempt } = {}) {
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
        const host = new URL(url).host;
        if (!res.ok) throw new Error(`${host}: ${res.status === 429 ? 'Rate-Limit (zu viele Anfragen)' : res.status === 504 ? 'Zeitüberschreitung (Server ausgelastet)' : `HTTP ${res.status}`}`);
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`${host}: ${explainOverpassError(text)}`);
        }
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
          throw new Error(`${new URL(url).host}: ${json.remark}`);
        }
        const elements = json.elements || [];
        if (json.osm3s?.timestamp_osm_base) lastDataTimestamp = json.osm3s.timestamp_osm_base;
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
