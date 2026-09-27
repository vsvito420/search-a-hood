/* global L */
import { BUILTIN_MODULES, customModule } from './modules/index.js';
import { PRESETS } from './presets.js';
import { SpatialIndex } from './core/spatial-index.js';
import { buildQuery, elementsToPoints, runQuery } from './core/overpass.js';
import { analyzeArea, evaluatePoint } from './core/analyzer.js';
import { scoreColor } from './core/scoring.js';
import { bboxAreaKm2 } from './core/geo.js';
import { loadHoursLib, isOpenAt } from './core/hours.js';
import { renderModules, renderPresets, updateCounts } from './ui/panel.js';
import { poiPopup, reportPopup, formatDist } from './ui/popups.js';

const MAX_AREA_KM2 = 60;

// ---------- Persistenz (optional, darf fehlschlagen) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`sah:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`sah:${key}`, JSON.stringify(value));
    } catch {
      /* egal */
    }
  },
};

// ---------- Zustand ----------
const state = {
  customDefs: store.get('custom', []),
  modules: [],
  settings: {},
  time: new Date(),
  bbox: null, // analysiertes Gebiet
  data: new Map(), // moduleId -> {key, elements} | {key, error}
  layers: new Map(), // moduleId -> ActiveLayer
  counts: {},
};

function loadModules() {
  state.modules = [...BUILTIN_MODULES, ...state.customDefs.map(customModule)];
  const saved = store.get('settings', {});
  for (const m of state.modules) {
    state.settings[m.id] = { ...m.defaults, ...state.settings[m.id], ...saved[m.id] };
  }
}
loadModules();

const saveSettings = () => store.set('settings', state.settings);

// ---------- Karte ----------
const view = store.get('view', { center: [52.52, 13.405], zoom: 14 });
const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(view.center, view.zoom);
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: '© OpenStreetMap, © CARTO',
});
L.control.layers({ 'OSM Standard': osm, 'Hell (CARTO)': light }, {}, { position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
map.on('moveend', () => store.set('view', { center: map.getCenter(), zoom: map.getZoom() }));

const markerGroups = new Map(); // moduleId -> L.LayerGroup
let heatLayer = null;
let areaOutline = null;
let pin = null;

// ---------- UI-Elemente ----------
const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
const setStatus = (msg, isError = false) => {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
};

const timeInput = $('#time-input');
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
timeInput.value = toLocalInput(state.time);
timeInput.addEventListener('change', () => {
  state.time = timeInput.value ? new Date(timeInput.value) : new Date();
  scheduleRebuild();
});

function refreshPanel() {
  renderModules($('#modules'), state.modules, state.settings, state.counts, {
    onChange(id, patch) {
      Object.assign(state.settings[id], patch);
      saveSettings();
      if ('enabled' in patch) refreshPanel();
      onSettingsChanged();
    },
    onDelete(id) {
      state.customDefs = state.customDefs.filter((d) => d.id !== id);
      store.set('custom', state.customDefs);
      delete state.settings[id];
      state.data.delete(id);
      clearMarkers(id);
      loadModules();
      refreshPanel();
      onSettingsChanged();
    },
  });
}

renderPresets($('#presets'), PRESETS, (preset) => {
  for (const m of state.modules) state.settings[m.id] = { ...m.defaults, enabled: false };
  for (const [id, patch] of Object.entries(preset.modules)) {
    if (state.settings[id]) Object.assign(state.settings[id], patch);
  }
  saveSettings();
  refreshPanel();
  onSettingsChanged();
  setStatus(`Preset „${preset.name}“ geladen. ${preset.description}`);
});

$('#reset-btn').addEventListener('click', () => {
  for (const m of state.modules) state.settings[m.id] = { ...m.defaults };
  saveSettings();
  refreshPanel();
  onSettingsChanged();
});

$('#custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const query = String(f.get('query'))
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!query.length || !query.every((q) => /^\[.+\]$/.test(q))) {
    setStatus('Filter müssen die Form [key=value] haben, z. B. [shop=bakery].', true);
    return;
  }
  const def = {
    id: `custom-${Date.now().toString(36)}`,
    name: String(f.get('name')).trim(),
    query,
    color: String(f.get('color')),
    supportsHours: f.get('hours') === 'on',
  };
  state.customDefs.push(def);
  store.set('custom', state.customDefs);
  loadModules();
  refreshPanel();
  e.target.reset();
  onSettingsChanged();
});

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  setStatus('Suche…');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
    const [hit] = await res.json();
    if (!hit) return setStatus(`Nichts gefunden für „${q}“.`, true);
    map.setView([+hit.lat, +hit.lon], 15);
    setStatus(hit.display_name);
    if (state.bbox) showReport(L.latLng(+hit.lat, +hit.lon));
  } catch (err) {
    setStatus(`Suche fehlgeschlagen: ${err.message}`, true);
  }
});

$('#opacity').addEventListener('input', (e) => heatLayer?.setOpacity(+e.target.value));
$('#analyze-btn').addEventListener('click', analyze);
map.on('click', (e) => showReport(e.latlng));

// ---------- Daten laden ----------
const enabledModules = () => state.modules.filter((m) => state.settings[m.id]?.enabled);
const bboxKey = (b) => [b.south, b.west, b.north, b.east].map((v) => v.toFixed(4)).join(',');

async function fetchModule(module) {
  const key = bboxKey(state.bbox);
  const cached = state.data.get(module.id);
  if (cached?.key === key && !cached.error) return;
  try {
    const elements = await runQuery(buildQuery(module.query, state.bbox, module.geometry));
    state.data.set(module.id, { key, elements });
  } catch (err) {
    state.data.set(module.id, { key, error: err.message });
  }
}

let fetching = false;
async function fetchMissing() {
  if (fetching || !state.bbox) return;
  fetching = true;
  try {
    const key = bboxKey(state.bbox);
    const todo = enabledModules().filter((m) => {
      const d = state.data.get(m.id);
      return !d || d.key !== key || d.error;
    });
    for (let i = 0; i < todo.length; i++) {
      setStatus(`Lade ${todo[i].name} (${i + 1}/${todo.length}) …`);
      await fetchModule(todo[i]);
    }
  } finally {
    fetching = false;
  }
}

async function analyze() {
  const b = map.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const area = bboxAreaKm2(bbox);
  if (area > MAX_AREA_KM2) {
    setStatus(`Gebiet zu groß (${area.toFixed(0)} km²). Bitte auf max. ${MAX_AREA_KM2} km² reinzoomen – schont die Overpass-Server.`, true);
    return;
  }
  if (!enabledModules().length) {
    setStatus('Aktiviere mindestens ein Modul.', true);
    return;
  }
  state.bbox = bbox;
  await fetchMissing();
  rebuild();
}

let pending = null;
async function onSettingsChanged() {
  if (!state.bbox) return;
  await fetchMissing();
  scheduleRebuild();
}
function scheduleRebuild() {
  if (!state.bbox) return;
  clearTimeout(pending);
  pending = setTimeout(rebuild, 150);
}

// ---------- Auswertung & Zeichnen ----------
function filterElements(module, settings, elements) {
  const ctx = { time: state.time, isOpenAt };
  return elements.filter((el) => {
    el.tags ||= {};
    if (module.filter && !module.filter(el, ctx)) return false;
    if (module.supportsHours && settings.openAtTime) return isOpenAt(el.tags.opening_hours, state.time) === true;
    return true;
  });
}

function rebuild() {
  if (!state.bbox) return;
  const key = bboxKey(state.bbox);
  state.layers.clear();
  state.counts = {};
  const errors = [];

  for (const m of state.modules) {
    const s = state.settings[m.id];
    const d = state.data.get(m.id);
    clearMarkers(m.id);
    if (!s?.enabled || !d || d.key !== key) continue;
    if (d.error) {
      state.counts[m.id] = { error: d.error };
      errors.push(m.name);
      continue;
    }
    const elements = filterElements(m, s, d.elements);
    state.counts[m.id] = { n: elements.length };
    const points = elementsToPoints(elements, m.geometry);
    state.layers.set(m.id, { module: m, settings: s, index: new SpatialIndex(points), elements });
    if (s.showMarkers) drawMarkers(m, s, elements);
  }
  updateCounts($('#modules'), state.counts);

  if (!state.layers.size) {
    setStatus(errors.length ? `Laden fehlgeschlagen: ${errors.join(', ')}` : 'Keine Daten.', !!errors.length);
    return;
  }

  const t0 = performance.now();
  const res = analyzeArea(state.bbox, [...state.layers.values()]);
  drawHeatmap(res);
  drawTop(res.top);
  const ms = Math.round(performance.now() - t0);
  const pct = Math.round(res.coverage * 100);
  setStatus(
    `${res.grid.rows}×${res.grid.cols} Zellen in ${ms} ms bewertet · ${pct} % erfüllen alle Pflichtkriterien` +
      (errors.length ? ` · Fehler bei: ${errors.join(', ')}` : ''),
    !!errors.length,
  );
}

function clearMarkers(id) {
  markerGroups.get(id)?.remove();
  markerGroups.delete(id);
}

function drawMarkers(m, s, elements) {
  const group = L.layerGroup();
  for (const el of elements) {
    if (m.geometry === 'line' && el.geometry) {
      L.polyline(el.geometry.map((p) => [p.lat, p.lon]), { color: m.color, weight: 3, opacity: 0.7, interactive: false }).addTo(group);
      continue;
    }
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    if (m.zone) {
      L.circle([lat, lon], { radius: s.distance, color: '#d7301f', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(group);
    }
    L.circleMarker([lat, lon], { radius: 5, color: '#fff', weight: 1, fillColor: m.color, fillOpacity: 0.95 })
      .bindPopup(() => poiPopup(m, el, state.time))
      .addTo(group);
  }
  group.addTo(map);
  markerGroups.set(m.id, group);
}

function drawHeatmap({ grid, scores }) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const o = i * 4;
    if (Number.isNaN(s)) {
      img.data.set([60, 60, 60, 170], o);
    } else {
      const [r, g, b] = scoreColor(s);
      img.data.set([r, g, b, 255], o);
    }
  }
  ctx.putImageData(img, 0, 0);
  const { south, west, north, east } = grid.bbox;
  const bounds = [[south, west], [north, east]];
  heatLayer?.remove();
  areaOutline?.remove();
  heatLayer = L.imageOverlay(canvas.toDataURL(), bounds, {
    opacity: +$('#opacity').value,
    className: 'heatmap',
    interactive: false,
  }).addTo(map);
  heatLayer.bringToBack();
  areaOutline = L.rectangle(bounds, { color: '#555', weight: 1, fill: false, dashArray: '4 4', interactive: false }).addTo(map);
}

function drawTop(top) {
  const list = $('#top-list');
  list.innerHTML = '';
  for (const t of top) {
    const li = document.createElement('li');
    li.textContent = `${Math.round(t.score * 100)} % · ${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`;
    li.addEventListener('click', () => {
      map.setView([t.lat, t.lon], Math.max(map.getZoom(), 16));
      showReport(L.latLng(t.lat, t.lon));
    });
    list.append(li);
  }
  if (!top.length) list.innerHTML = '<li>Keine Lage erfüllt alle Pflichtkriterien.</li>';
  $('#results').hidden = false;
}

function showReport(latlng) {
  if (!state.layers.size) {
    setStatus('Erst „Sichtbares Gebiet analysieren“ klicken.');
    return;
  }
  const r = evaluatePoint(latlng.lat, latlng.lng, [...state.layers.values()]);
  pin?.remove();
  pin = L.popup({ maxWidth: 360 }).setLatLng(latlng).setContent(reportPopup(r, latlng)).openOn(map);
}

// ---------- Start ----------
refreshPanel();
setStatus('Karte auf ein Viertel zoomen, Module wählen, dann „analysieren“.');
loadHoursLib().then((ok) => {
  if (ok) scheduleRebuild();
});

// Für Debugging / eigene Skripte in der Konsole
window.searchAHood = { state, map, formatDist };
