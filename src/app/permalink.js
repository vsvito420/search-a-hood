// Kompletter App-Zustand als URL-Hash – zum Teilen ("schau mal, diese Lagen") oder Bookmarken.
import { isValidSelector } from '../core/tagfilter.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const MODES = ['foot', 'bike', 'car', 'transit'];

/**
 * Fremddaten (Permalink, Config-Datei) prüfen, bevor sie in den Zustand wandern.
 * Ungültiges wird verworfen statt die App beim Laden abstürzen zu lassen.
 */
export function sanitize({ customDefs = [], targets = [], candidates = [], settings = {} } = {}) {
  const arr = (a) => (Array.isArray(a) ? a : []);
  return {
    customDefs: arr(customDefs)
      .filter((d) => d && typeof d.id === 'string' && Array.isArray(d.query) && d.query.length && d.query.every((q) => typeof q === 'string' && isValidSelector(q)))
      .map((d) => ({
        id: str(d.id, 60),
        name: str(d.name, 80) || 'Eigenes Modul',
        query: d.query.slice(0, 20),
        color: /^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : '#34495e',
        supportsHours: !!d.supportsHours,
        geometry: d.geometry === 'line' ? 'line' : 'point',
      })),
    targets: arr(targets)
      .filter((t) => t && num(t.lat) != null && num(t.lon) != null && MODES.includes(t.mode))
      .map((t) => ({
        id: str(String(t.id), 40),
        name: str(t.name, 80) || 'Ziel',
        lat: t.lat,
        lon: t.lon,
        mode: t.mode,
        minutes: Math.min(180, Math.max(1, num(t.minutes) ?? 25)),
        arrive: /^\d{2}:\d{2}$/.test(t.arrive) ? t.arrive : '08:30',
      })),
    candidates: arr(candidates)
      .filter((c) => c && typeof c.label === 'string')
      .map((c) => ({
        label: str(c.label, 200),
        lat: num(c.lat),
        lon: num(c.lon),
        rent: num(c.rent),
        size: num(c.size),
        url: typeof c.url === 'string' ? str(c.url, 500) : null,
        ...(c.display && { display: str(c.display, 200) }),
        ...(c.error && { error: str(c.error, 200) }),
      })),
    settings: settings && typeof settings === 'object' ? settings : {},
  };
}

const b64url = {
  encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

const KEYS = ['enabled', 'mode', 'distance', 'weight', 'required', 'openAtTime', 'showMarkers', 'minCount'];

/** Nur Abweichungen von den Modul-Defaults speichern → kurze Links. */
export function encodeState({ view, modules, settings, customDefs, targets = [], distMode, time, candidates }) {
  const m = {};
  for (const mod of modules) {
    const s = settings[mod.id];
    const diff = {};
    for (const k of KEYS) if (s[k] !== mod.defaults[k]) diff[k[0] + k.slice(-1)] = s[k];
    if (Object.keys(diff).length) m[mod.id] = diff;
  }
  const payload = {
    v: 1,
    c: [+view.lat.toFixed(5), +view.lng.toFixed(5), view.zoom],
    m,
    ...(customDefs.length && { x: customDefs }),
    ...(targets.length && { g: targets.map((t) => [t.id, t.name, +t.lat.toFixed(5), +t.lon.toFixed(5), t.mode, t.minutes, t.arrive]) }),
    ...(distMode !== 'air' && { d: distMode }),
    ...(time && { t: time }),
    ...(candidates?.length && {
      k: candidates.filter((c) => c.lat != null).map((c) => [c.label, +c.lat.toFixed(6), +c.lon.toFixed(6), c.rent, c.size, c.url]),
    }),
  };
  return b64url.encode(JSON.stringify(payload));
}

export function decodeState(hash, modules) {
  const raw = hash.replace(/^#/, '');
  const s = new URLSearchParams(raw).get('s');
  if (!s) return null;
  const p = JSON.parse(b64url.decode(s));
  if (p.v !== 1) return null;
  const short = Object.fromEntries(KEYS.map((k) => [k[0] + k.slice(-1), k]));
  const settings = {};
  for (const [id, diff] of Object.entries(p.m || {})) {
    if (!diff || typeof diff !== 'object') continue;
    // nur bekannte Schlüssel mit passendem Typ übernehmen
    settings[id] = Object.fromEntries(
      Object.entries(diff)
        .filter(([k, v]) => short[k] && ['boolean', 'number', 'string'].includes(typeof v))
        .map(([k, v]) => [short[k], v]),
    );
  }
  const clean = sanitize({
    customDefs: p.x,
    targets: (Array.isArray(p.g) ? p.g : []).map((g) => (Array.isArray(g) ? { id: g[0], name: g[1], lat: g[2], lon: g[3], mode: g[4], minutes: g[5], arrive: g[6] } : null)),
    candidates: (Array.isArray(p.k) ? p.k : []).map((k) => (Array.isArray(k) ? { label: k[0], lat: k[1], lon: k[2], rent: k[3], size: k[4], url: k[5] } : null)),
  });
  const c = Array.isArray(p.c) && p.c.every((v) => Number.isFinite(v)) ? p.c : null;
  return {
    view: c ? { center: [c[0], c[1]], zoom: c[2] } : null,
    settings,
    customDefs: clean.customDefs,
    targets: clean.targets,
    distMode: p.d === 'walk' ? 'walk' : 'air',
    time: typeof p.t === 'string' && !Number.isNaN(new Date(p.t).getTime()) ? p.t : null,
    candidates: clean.candidates.filter((x) => x.lat != null && x.lon != null),
    modules,
  };
}
