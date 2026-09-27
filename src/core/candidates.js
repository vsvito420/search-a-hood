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
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, { headers: { 'Accept-Language': 'de' } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const [hit] = await res.json();
    const r = hit ? { lat: +hit.lat, lon: +hit.lon, display: hit.display_name } : null;
    cache.set(key, r);
    return r;
  };
  // Serialisieren, damit das Intervall auch bei parallelen Aufrufen gilt
  return (q) => (chain = chain.then(() => geocode(q), () => geocode(q)));
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
