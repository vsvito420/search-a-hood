// Wohnungs-Kandidaten: Eingabe parsen, geocodieren, vergleichen, exportieren.

const COORD = /^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/;
const num = (s) => {
  if (!s) return null;
  const v = Number(String(s).replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.').replace(/m²|qm|m2/i, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * "Adresse | Kaltmiete | m² | Link" pro Zeile. Adresse darf auch "lat, lon" sein.
 * @returns {{label:string, query?:string, lat?:number, lon?:number, rent:number|null, size:number|null, url:string|null}[]}
 */
export function parseCandidateLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((s) => s.trim());
    const [addr, rent, size, url] = parts;
    const c = { label: addr, rent: num(rent), size: num(size), url: /^https?:\/\//.test(url || '') ? url : null };
    const m = addr.match(COORD);
    if (m) Object.assign(c, { lat: +m[1], lon: +m[2] });
    else c.query = addr;
    out.push(c);
  }
  return out;
}

/** "Wiener Straße 10, Kreuzberg, Berlin" statt der langen Nominatim-Kette. */
export function shortAddress(hit) {
  const a = hit.address;
  if (!a) return hit.display_name;
  const street = [a.road || a.pedestrian || a.footway || a.square, a.house_number].filter(Boolean).join(' ');
  const area = a.suburb || a.city_district || a.quarter || a.neighbourhood;
  const city = a.city || a.town || a.village || a.municipality;
  const parts = [street || hit.name, area, city].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : hit.display_name;
}

/** Nominatim mit 1 Anfrage/Sekunde (Nutzungsrichtlinie) und Cache. */
export function createGeocoder({ fetchImpl = globalThis.fetch, cache = new Map(), minInterval = 1100 } = {}) {
  let last = 0;
  let chain = Promise.resolve();
  const geocode = async (q) => {
    const key = q.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const wait = Math.max(0, last + minInterval - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, { headers: { 'Accept-Language': 'de' } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const [hit] = await res.json();
    const r = hit ? { lat: +hit.lat, lon: +hit.lon, display: shortAddress(hit), full: hit.display_name } : null;
    cache.set(key, r);
    return r;
  };
  /** Rückwärts: Koordinate → kurze Adresse (gleiche Drossel und gleicher Cache wie die Suche). */
  const reverse = async (lat, lon) => {
    const key = `@${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (cache.has(key)) return cache.get(key);
    const wait = Math.max(0, last + minInterval - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lon}`, {
      headers: { 'Accept-Language': 'de' },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const hit = await res.json();
    const r = hit && !hit.error ? shortAddress(hit) : null;
    cache.set(key, r);
    return r;
  };
  // Serialisieren, damit das Intervall auch bei parallelen Aufrufen gilt
  const fn = (q) => (chain = chain.then(() => geocode(q), () => geocode(q)));
  fn.reverse = (lat, lon) => (chain = chain.then(() => reverse(lat, lon), () => reverse(lat, lon)));
  return fn;
}

export const pricePerSqm = (c) => (c.rent && c.size ? c.rent / c.size : null);

/** CSV mit korrektem Quoting (Excel-kompatibel mit ; als Trenner). */
export function toCSV(rows, sep = ';') {
  const q = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v);
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(q).join(sep)).join('\r\n');
}
