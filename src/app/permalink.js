// Kompletter App-Zustand als URL-Hash – zum Teilen ("schau mal, diese Lagen") oder Bookmarken.

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
export function encodeState({ view, modules, settings, customDefs, distMode, time, candidates }) {
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
    settings[id] = Object.fromEntries(Object.entries(diff).map(([k, v]) => [short[k], v]));
  }
  return {
    view: { center: [p.c[0], p.c[1]], zoom: p.c[2] },
    settings,
    customDefs: p.x || [],
    distMode: p.d || 'air',
    time: p.t || null,
    candidates: (p.k || []).map(([label, lat, lon, rent, size, url]) => ({ label, lat, lon, rent, size, url })),
    modules,
  };
}
