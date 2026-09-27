/* global L */
import { BUILTIN_MODULES, customModule } from './modules/index.js';
import { PRESETS } from './presets.js';
import { store } from './app/store.js';
import { encodeState, decodeState } from './app/permalink.js';
import { SpatialIndex } from './core/spatial-index.js';
import { elementsToPoints, runQuery } from './core/overpass.js';
import { DataStore, bboxKey } from './core/datastore.js';
import { isValidSelector } from './core/tagfilter.js';
import { analyzeArea, evaluatePoint, searchRadius } from './core/analyzer.js';
import { scoreColor } from './core/scoring.js';
import { bboxAreaKm2, padBbox } from './core/geo.js';
import { loadHoursLib, isOpenAt, hoursEngine } from './core/hours.js';
import { WalkGraph, NetworkField, isochrone, buildWalkQuery, WALK_SPEED_M_PER_MIN } from './core/routing.js';
import { parseCandidateLines, createGeocoder, toCSV, pricePerSqm } from './core/candidates.js';
import { renderModules, renderPresets, updateCounts } from './ui/panel.js';
import { poiPopup, reportPopup, formatDist, esc } from './ui/popups.js';
import { OverlayManager } from './ui/overlays.js';
import { renderCandidateTable, sortValue } from './ui/candidates.js';
import { createPalette } from './ui/palette.js';

const MAX_AREA_KM2 = 60;
const MAX_WALK_AREA_KM2 = 30;

// =====================================================================
// Zustand
// =====================================================================
const state = {
  customDefs: store.get('custom', []),
  modules: [],
  settings: {},
  time: new Date(),
  distMode: store.get('distMode', 'air'), // 'air' | 'walk'
  bbox: null, // analysiertes (sichtbares) Gebiet
  data: new DataStore(),
  graph: null, // {key, graph} | {key, error}
  layers: new Map(), // moduleId -> ActiveLayer
  counts: {},
  lastResult: null,
  lastClick: null,
  candidates: store.get('candidates', []),
  candSort: { key: 'score', dir: -1 },
  focusModule: null, // Heatmap nur für ein Kriterium
  relative: store.get('relative', false),
};

function loadModules() {
  state.modules = [...BUILTIN_MODULES, ...state.customDefs.map(customModule)];
  const saved = store.get('settings', {});
  for (const m of state.modules) {
    state.settings[m.id] = { ...m.defaults, ...saved[m.id], ...state.settings[m.id] };
  }
}

// Permalink hat Vorrang vor gespeicherten Einstellungen
let fromLink = null;
try {
  fromLink = decodeState(location.hash, []);
} catch (e) {
  console.warn('Permalink ungültig', e);
}
if (fromLink) {
  state.customDefs = fromLink.customDefs;
  state.distMode = fromLink.distMode;
  if (fromLink.time) state.time = new Date(fromLink.time);
  if (fromLink.candidates.length) state.candidates = fromLink.candidates;
  state.modules = [...BUILTIN_MODULES, ...state.customDefs.map(customModule)];
  for (const m of state.modules) state.settings[m.id] = { ...m.defaults, ...fromLink.settings[m.id] };
}
loadModules();

const saveSettings = () => store.set('settings', state.settings);
const saveCandidates = () => store.set('candidates', state.candidates);
const enabledModules = () => state.modules.filter((m) => state.settings[m.id]?.enabled);

// =====================================================================
// Karte
// =====================================================================
const view = fromLink?.view || store.get('view', { center: [52.52, 13.405], zoom: 14 });
const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(view.center, view.zoom);
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: '© OpenStreetMap, © CARTO',
});
const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 20,
  attribution: '© OpenStreetMap, © CARTO',
});
L.control.layers({ 'OSM Standard': osm, 'Hell (CARTO)': light, 'Dunkel (CARTO)': dark }, {}, { position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
map.on('moveend', () => store.set('view', { center: map.getCenter(), zoom: map.getZoom() }));
if (fromLink) history.replaceState(null, '', location.pathname + location.search);

const markerGroups = new Map(); // moduleId -> L.LayerGroup
const candLayer = L.layerGroup().addTo(map);
let heatLayer = null;
let areaOutline = null;
let isoLayer = null;

// =====================================================================
// UI-Grundlagen
// =====================================================================
const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

// Tabs
const tabs = [...document.querySelectorAll('[data-tab]')];
function showTab(name) {
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  store.set('tab', name);
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
showTab(store.get('tab', 'criteria'));

// Zeitpunkt
const timeInput = $('#time-input');
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function setTime(d) {
  state.time = d;
  timeInput.value = toLocalInput(d);
  scheduleRebuild();
}
timeInput.value = toLocalInput(state.time);
timeInput.addEventListener('change', () => setTime(timeInput.value ? new Date(timeInput.value) : new Date()));
/** Nächster Wochentag (0=So) zur Stunde h, ab jetzt. */
function nextAt(weekday, h) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  const add = weekday == null ? (d < new Date() ? 1 : 0) : (weekday - d.getDay() + 7) % 7 || (d < new Date() ? 7 : 0);
  d.setDate(d.getDate() + add);
  return d;
}
const TIME_PRESETS = { now: () => new Date(), fri23: () => nextAt(5, 23), sat22: () => nextAt(6, 22), sun11: () => nextAt(0, 11), night3: () => nextAt(null, 3) };
document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => setTime(TIME_PRESETS[b.dataset.time]())));

// Distanzmodus
function setDistMode(mode) {
  state.distMode = mode;
  store.set('distMode', mode);
  document.querySelectorAll('#dist-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  if (state.bbox) onSettingsChanged();
}
document.querySelectorAll('#dist-mode [data-mode]').forEach((b) => b.addEventListener('click', () => setDistMode(b.dataset.mode)));
setDistMode(state.distMode);

// Module
function refreshPanel() {
  renderModules($('#modules'), state.modules, state.settings, state.counts, {
    onChange(id, patch) {
      Object.assign(state.settings[id], patch);
      saveSettings();
      if ('enabled' in patch) refreshPanel();
      onSettingsChanged();
    },
    onFocus(id) {
      state.focusModule = state.focusModule === id ? null : id;
      refreshPanel();
      scheduleRebuild();
    },
    focusId: state.focusModule,
    onDelete(id) {
      state.customDefs = state.customDefs.filter((d) => d.id !== id);
      store.set('custom', state.customDefs);
      delete state.settings[id];
      state.data.drop(id);
      clearMarkers(id);
      loadModules();
      refreshPanel();
      onSettingsChanged();
    },
  });
  applyModuleFilter();
}
const moduleFilter = $('#module-filter');
function applyModuleFilter() {
  const q = moduleFilter.value.trim().toLowerCase();
  document.querySelectorAll('#modules .module').forEach((el) => {
    el.hidden = !!q && !el.textContent.toLowerCase().includes(q);
  });
  document.querySelectorAll('#modules .category').forEach((c) => {
    c.hidden = ![...c.querySelectorAll('.module')].some((m) => !m.hidden);
  });
}
moduleFilter.addEventListener('input', applyModuleFilter);

function applyPreset(preset) {
  for (const m of state.modules) state.settings[m.id] = { ...m.defaults, enabled: false };
  for (const [id, patch] of Object.entries(preset.modules)) {
    if (state.settings[id]) Object.assign(state.settings[id], patch);
  }
  for (const ov of preset.overlays || []) overlays.enable(ov, true);
  if (preset.overlays) overlays.render($('#overlays'));
  saveSettings();
  refreshPanel();
  onSettingsChanged();
  setStatus(`Preset „${preset.name}“ geladen. ${preset.description}`);
}
renderPresets($('#presets'), PRESETS, applyPreset);

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
  if (!query.length || !query.every(isValidSelector)) {
    setStatus('Ungültiger Filter. Erlaubt: [key], [key=value], [key!=value], [key~"regex"], mehrere mit ; trennen.', true);
    return;
  }
  state.customDefs.push({
    id: `custom-${Date.now().toString(36)}`,
    name: String(f.get('name')).trim(),
    query,
    color: String(f.get('color')),
    supportsHours: f.get('hours') === 'on',
    geometry: f.get('line') === 'on' ? 'line' : 'point',
  });
  store.set('custom', state.customDefs);
  loadModules();
  refreshPanel();
  e.target.reset();
  onSettingsChanged();
});

// Adresssuche
const geocode = createGeocoder({ cache: new Map(Object.entries(store.get('geocache', {}))) });
async function geocodeCached(q) {
  const r = await geocode(q);
  const cache = store.get('geocache', {});
  cache[q.toLowerCase()] = r;
  const keys = Object.keys(cache);
  if (keys.length > 300) delete cache[keys[0]];
  store.set('geocache', cache);
  return r;
}
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  setStatus('Suche…');
  try {
    const hit = await geocodeCached(q);
    if (!hit) return setStatus(`Nichts gefunden für „${q}“.`, true);
    map.setView([hit.lat, hit.lon], 16);
    setStatus(hit.display);
    if (state.layers.size) showReport(L.latLng(hit.lat, hit.lon));
  } catch (err) {
    setStatus(`Suche fehlgeschlagen: ${err.message}`, true);
  }
});

$('#opacity').addEventListener('input', (e) => heatLayer?.setOpacity(+e.target.value));
const relBox = $('#relative');
relBox.checked = state.relative;
relBox.addEventListener('change', () => {
  state.relative = relBox.checked;
  store.set('relative', state.relative);
  if (state.lastResult) drawHeatmap(state.lastResult);
});
$('#analyze-btn').addEventListener('click', () => analyze());
$('#results-close').addEventListener('click', () => ($('#results').hidden = true));
$('#iso-btn').addEventListener('click', () => drawIsochrone());
map.on('click', (e) => {
  if (e.originalEvent.shiftKey) return addCandidateAt(e.latlng);
  state.lastClick = e.latlng;
  showReport(e.latlng);
});

// Overlays
const overlays = new OverlayManager(map, store, setStatus);
overlays.render($('#overlays'));
overlays.applyAll();
$('#overlay-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const url = String(f.get('url')).trim();
  try {
    new URL(url.replace('{s}', 'a'));
  } catch {
    return setStatus('Ungültige URL.', true);
  }
  overlays.addCustom({ name: String(f.get('name')).trim(), url, layers: String(f.get('layers') || '').trim(), type: /\{z\}/.test(url) ? 'xyz' : 'wms' });
  overlays.render($('#overlays'));
  overlays.applyAll();
  e.target.reset();
});

// =====================================================================
// Daten laden
// =====================================================================
let queue = Promise.resolve();
let loading = 0;
function fetchMissing() {
  loading++;
  queue = queue
    .then(async () => {
      await state.data.ensure(enabledModules(), { onProgress: (msg) => setStatus(msg) });
      if (state.distMode === 'walk' && state.data.bbox) await ensureGraph();
    })
    .catch((err) => setStatus(`Laden fehlgeschlagen: ${err.message}`, true))
    .finally(() => loading--);
  return queue;
}

/** Lädt das Fußwegenetz für `bbox` (Standard: das Analyse-Gebiet inkl. Rand). */
async function ensureGraph(bbox = state.data.bbox) {
  const key = bboxKey(bbox);
  if (state.graph?.key === key && state.graph.graph) return;
  if (bboxAreaKm2(bbox) > MAX_WALK_AREA_KM2) {
    state.graph = { key, error: `Gebiet zu groß für Fußweg-Routing (max. ${MAX_WALK_AREA_KM2} km² inkl. Rand)` };
    return;
  }
  setStatus('Lade Fußwegenetz …');
  try {
    const t0 = performance.now();
    const els = await runQuery(buildWalkQuery(bbox), { timeoutMs: 120_000 });
    const graph = new WalkGraph(els);
    state.graph = { key, bbox, graph, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    state.graph = { key, error: e.message };
  }
}

async function analyze(bbox) {
  if (!bbox) {
    const b = map.getBounds();
    bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }
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
  // Daten mit Rand laden, sonst wirken Lagen am Rand besser als sie sind (POIs knapp außerhalb fehlen).
  const pad = Math.min(1000, Math.max(...enabledModules().map((m) => searchRadius(state.settings[m.id]))));
  state.data.setArea(padBbox(bbox, pad));
  $('#analyze-btn').disabled = true;
  try {
    await fetchMissing();
  } finally {
    $('#analyze-btn').disabled = false;
  }
  rebuild();
}

let pending = null;
async function onSettingsChanged() {
  if (!state.bbox) return renderCandidates();
  await fetchMissing();
  scheduleRebuild();
}
function scheduleRebuild() {
  if (!state.bbox) return;
  clearTimeout(pending);
  pending = setTimeout(rebuild, 150);
}

// =====================================================================
// Auswertung & Zeichnen
// =====================================================================
function filterElements(module, settings, elements) {
  const ctx = { time: state.time, isOpenAt };
  return elements.filter((el) => {
    el.tags ||= {};
    if (module.filter && !module.filter(el, ctx)) return false;
    if (module.supportsHours && settings.openAtTime) return isOpenAt(el.tags.opening_hours, state.time) === true;
    return true;
  });
}

// Netzwerk-Distanzfelder sind teuer → Cache nach allem, was sie beeinflusst
const fieldCache = new Map();
function distanceSource(m, s, points) {
  const g = state.graph?.key === state.data.key ? state.graph.graph : null;
  if (state.distMode !== 'walk' || !g || m.geometry === 'line' || s.mode === 'far') return new SpatialIndex(points);
  const key = [state.data.key, m.id, s.openAtTime ? state.time.getTime() : 0, searchRadius(s), points.length].join('|');
  let f = fieldCache.get(key);
  if (!f) {
    f = new NetworkField(g, points, searchRadius(s));
    if (fieldCache.size > 60) fieldCache.clear();
    fieldCache.set(key, f);
  }
  return f;
}

function rebuild() {
  if (!state.bbox || loading) return;
  state.layers.clear();
  state.counts = {};
  const errors = [];

  for (const m of state.modules) {
    const s = state.settings[m.id];
    const d = state.data.get(m.id);
    clearMarkers(m.id);
    if (!s?.enabled || !d) continue;
    if (d.error) {
      state.counts[m.id] = { error: d.error };
      errors.push(m);
      continue;
    }
    const elements = filterElements(m, s, d.elements);
    const withHours = m.supportsHours ? d.elements.filter((el) => el.tags?.opening_hours).length : null;
    state.counts[m.id] = {
      n: elements.length,
      total: d.elements.length,
      hoursShare: withHours != null && d.elements.length ? withHours / d.elements.length : null,
    };
    const points = elementsToPoints(elements, m.geometry);
    state.layers.set(m.id, { module: m, settings: s, index: distanceSource(m, s, points), elements });
    if (s.showMarkers) drawMarkers(m, s, elements);
  }
  updateCounts($('#modules'), state.counts);
  $('#last-query').textContent = state.data.lastQuery || '–';

  // Ein Pflichtmodul ohne Daten würde die Bewertung verfälschen → lieber gar keine Heatmap.
  const brokenRequired = errors.filter((m) => state.settings[m.id].required);
  if (brokenRequired.length || !state.layers.size) {
    heatLayer?.remove();
    $('#results').hidden = true;
    setStatus(
      errors.length
        ? `Laden fehlgeschlagen: ${errors.map((m) => m.name).join(', ')}. ${brokenRequired.length ? 'Pflichtkriterium fehlt – keine Bewertung. ' : ''}Nochmal „analysieren“ klicken.`
        : 'Keine Daten.',
      true,
    );
    return;
  }

  const t0 = performance.now();
  // Einzelansicht: nur ein Kriterium, ohne Pflicht-Ausschluss – zeigt, wo genau es hakt.
  const focus = state.focusModule && state.layers.get(state.focusModule);
  if (state.focusModule && !focus) state.focusModule = null;
  const layers = focus ? [{ ...focus, settings: { ...focus.settings, required: false, weight: 1 } }] : [...state.layers.values()];
  const res = analyzeArea(state.bbox, layers);
  state.lastResult = res;
  drawHeatmap(res);
  drawTop(res.top);
  renderCandidates();
  const ms = Math.round(performance.now() - t0);
  const pct = Math.round(res.coverage * 100);
  const walk =
    state.distMode === 'walk'
      ? state.graph?.graph
        ? ` · 🚶 Fußwege (${state.graph.graph.n.toLocaleString('de')} Knoten)`
        : ` · ⚠ Fußwege nicht verfügbar (${state.graph?.error || '?'}) – Luftlinie`
      : '';
  setStatus(
    (focus ? `◉ Einzelansicht „${focus.module.name}“ · ` : '') +
      `${res.grid.rows}×${res.grid.cols} Zellen in ${ms} ms · ${pct} % erfüllen alle Pflichtkriterien${walk}` +
      (errors.length ? ` · ⚠ nicht geladen (ignoriert): ${errors.map((m) => m.name).join(', ')}` : ''),
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
      L.polyline(
        el.geometry.map((p) => [p.lat, p.lon]),
        { color: m.color, weight: 3, opacity: 0.7, interactive: false },
      ).addTo(group);
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
  // Relative Skala: schlechteste sichtbare Zelle = rot, beste = grün. Hilft, wenn alles „gut“ ist.
  let lo = 0;
  let hi = 1;
  if (state.relative) {
    lo = Infinity;
    hi = -Infinity;
    for (const s of scores) if (!Number.isNaN(s)) (lo = Math.min(lo, s)), (hi = Math.max(hi, s));
    if (!(hi > lo)) (lo = 0), (hi = 1);
  }
  $('#legend-lo').textContent = `${Math.round(lo * 100)} %`;
  $('#legend-hi').textContent = `${Math.round(hi * 100)} %`;
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols;
  canvas.height = grid.rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(grid.cols, grid.rows);
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (Number.isNaN(s)) img.data.set([60, 60, 60, 170], i * 4);
    else img.data.set([...scoreColor((s - lo) / (hi - lo)), 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const { south, west, north, east } = grid.bbox;
  const bounds = [
    [south, west],
    [north, east],
  ];
  heatLayer?.remove();
  areaOutline?.remove();
  heatLayer = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: +$('#opacity').value, className: 'heatmap', interactive: false }).addTo(map);
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

const inBbox = (b, lat, lon) => b && lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;

function evaluate(lat, lon) {
  return evaluatePoint(lat, lon, [...state.layers.values()]);
}

async function showReport(latlng) {
  if (!state.layers.size) {
    setStatus('Erst „Sichtbares Gebiet analysieren“ klicken.');
    return;
  }
  const r = evaluate(latlng.lat, latlng.lng);
  const outside = !inBbox(state.data.bbox, latlng.lat, latlng.lng);
  const html = `${reportPopup(r, latlng, { walk: state.distMode === 'walk' && !!state.graph?.graph })}
    ${outside ? '<p class="bad"><small>Außerhalb des analysierten Gebiets – Werte unzuverlässig.</small></p>' : ''}
    <div class="popup-actions">
      <button type="button" data-act="iso">⏱ Isochrone</button>
      <button type="button" data-act="cand">★ Als Kandidat</button>
      <a href="https://www.openstreetmap.org/?mlat=${latlng.lat}&mlon=${latlng.lng}#map=18/${latlng.lat}/${latlng.lng}" target="_blank" rel="noopener">OSM</a>
    </div>
    <div class="fi-wrap"></div>`;
  const popup = L.popup({ maxWidth: 380 }).setLatLng(latlng).setContent(html).openOn(map);
  const el = popup.getElement();
  el.querySelector('[data-act="iso"]').addEventListener('click', () => drawIsochrone(latlng));
  el.querySelector('[data-act="cand"]').addEventListener('click', () => {
    map.closePopup();
    addCandidateAt(latlng);
  });
  // WMS-GetFeatureInfo (z. B. Breitbandatlas) asynchron nachladen
  const infos = await overlays.featureInfo(latlng);
  if (infos.length && popup.isOpen()) {
    el.querySelector('.fi-wrap').innerHTML = infos.map((i) => `<h4>${esc(i.name)}</h4>${i.html}`).join('');
    popup.update();
  }
}

// =====================================================================
// Isochrone
// =====================================================================
async function drawIsochrone(latlng = state.lastClick) {
  if (!latlng) return setStatus('Erst auf die Karte klicken, dann Isochrone.', true);
  map.closePopup();
  // Vorhandenes Netz nutzen, wenn der Punkt mit 15-min-Radius hineinpasst, sonst kleines Gebiet um den Punkt laden.
  const around = padBbox({ south: latlng.lat, west: latlng.lng, north: latlng.lat, east: latlng.lng }, 1300);
  const cur = state.graph?.graph && state.graph.bbox;
  const fits = cur && around.south >= cur.south && around.north <= cur.north && around.west >= cur.west && around.east <= cur.east;
  if (!fits) await ensureGraph(around);
  const g = state.graph?.graph;
  if (!g) return setStatus(`Fußwegenetz nicht verfügbar: ${state.graph?.error}`, true);
  const iso = isochrone(g, latlng.lat, latlng.lng, 15);
  if (!iso) return setStatus('Kein Weg in der Nähe des Punktes.', true);
  isoLayer?.remove();
  isoLayer = L.layerGroup();
  const bands = [
    [5, '#1a9850'],
    [10, '#fdd835'],
    [15, '#d7301f'],
  ];
  for (const s of iso.segments) {
    const color = bands.find(([m]) => s.min <= m)?.[1] || '#d7301f';
    L.polyline([s.a, s.b], { color, weight: 3, opacity: 0.85, interactive: false }).addTo(isoLayer);
  }
  L.circleMarker(latlng, { radius: 7, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 })
    .bindTooltip('Start · Klick = Isochrone entfernen')
    .on('click', () => isoLayer.remove())
    .addTo(isoLayer);
  isoLayer.addTo(map);
  setStatus(`Isochrone: ${iso.reached.toLocaleString('de')} Kreuzungen in 15 min erreichbar (grün ≤ 5, gelb ≤ 10, rot ≤ 15 min, ${WALK_SPEED_M_PER_MIN} m/min).`);
}

// =====================================================================
// Kandidaten
// =====================================================================
function candidateIcon(i, score) {
  const [r, g, b] = score == null ? [120, 120, 120] : scoreColor(score);
  return L.divIcon({
    className: 'cand-icon',
    html: `<span style="--c: rgb(${r} ${g} ${b})">${i + 1}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function candidateRows() {
  return state.candidates.map((cand, idx) => {
    const ev = cand.lat != null && state.layers.size && inBbox(state.bbox, cand.lat, cand.lon) ? evaluate(cand.lat, cand.lon) : undefined;
    return { cand, idx, ev };
  });
}

function renderCandidates() {
  const rows = candidateRows();
  const { key, dir } = state.candSort;
  rows.sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });
  renderCandidateTable($('#cand-table'), rows, {
    sortKey: key,
    sortDir: dir,
    activeModules: [...state.layers.values()].map((l) => l.module),
    onSort(k) {
      state.candSort = { key: k, dir: state.candSort.key === k ? -state.candSort.dir : k === 'score' ? -1 : 1 };
      renderCandidates();
    },
    onFocus(i) {
      const c = state.candidates[i];
      if (c.lat == null) return;
      map.setView([c.lat, c.lon], Math.max(map.getZoom(), 16));
      if (state.layers.size) showReport(L.latLng(c.lat, c.lon));
    },
    onDelete(i) {
      state.candidates.splice(i, 1);
      saveCandidates();
      renderCandidates();
    },
  });
  $('#cand-count').textContent = state.candidates.length || '';
  candLayer.clearLayers();
  for (const { cand: c, idx, ev } of rows) {
    if (c.lat == null) continue;
    L.marker([c.lat, c.lon], { icon: candidateIcon(idx, ev ? ev.score : null), zIndexOffset: 1000 })
      .bindTooltip(`${idx + 1}. ${c.label}${ev ? ` · ${ev.score == null ? '✘' : Math.round(ev.score * 100) + ' %'}` : ''}`)
      .on('click', () => (state.layers.size ? showReport(L.latLng(c.lat, c.lon)) : null))
      .addTo(candLayer);
  }
}

function addCandidateAt(latlng) {
  state.candidates.push({ label: `Punkt ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`, lat: latlng.lat, lon: latlng.lng, rent: null, size: null, url: null });
  saveCandidates();
  renderCandidates();
  setStatus('Kandidat hinzugefügt (Tab „Wohnungen“).');
}

$('#cand-add').addEventListener('click', async () => {
  const parsed = parseCandidateLines($('#cand-input').value);
  if (!parsed.length) return;
  $('#cand-add').disabled = true;
  let i = 0;
  for (const c of parsed) {
    i++;
    if (c.query) {
      setStatus(`Geocodiere ${i}/${parsed.length}: ${c.query}`);
      try {
        const hit = await geocodeCached(c.query);
        if (hit) Object.assign(c, { lat: hit.lat, lon: hit.lon, display: hit.display });
        else c.error = 'Adresse nicht gefunden';
      } catch (e) {
        c.error = e.message;
      }
    }
    delete c.query;
    state.candidates.push(c);
    saveCandidates();
    renderCandidates();
  }
  $('#cand-add').disabled = false;
  $('#cand-input').value = '';
  const ok = parsed.filter((c) => c.lat != null).length;
  setStatus(`${ok}/${parsed.length} Kandidaten gefunden. „Gebiet um Kandidaten analysieren“ zum Bewerten.`);
});

$('#cand-fit').addEventListener('click', () => {
  const pts = state.candidates.filter((c) => c.lat != null).map((c) => [c.lat, c.lon]);
  if (!pts.length) return setStatus('Keine geocodierten Kandidaten.', true);
  const b = L.latLngBounds(pts).pad(0.15);
  const bbox = padBbox({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, 300);
  map.fitBounds([
    [bbox.south, bbox.west],
    [bbox.north, bbox.east],
  ]);
  analyze(bbox);
});

// =====================================================================
// Dev-Tab: Permalink, Config, Export
// =====================================================================
function currentEncoded() {
  const c = map.getCenter();
  return encodeState({
    view: { lat: c.lat, lng: c.lng, zoom: map.getZoom() },
    modules: state.modules,
    settings: state.settings,
    customDefs: state.customDefs,
    distMode: state.distMode,
    time: toLocalInput(state.time),
    candidates: state.candidates,
  });
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${what} in die Zwischenablage kopiert.`);
  } catch {
    prompt(`${what}:`, text);
  }
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#permalink-btn').addEventListener('click', () => copy(`${location.origin}${location.pathname}#s=${currentEncoded()}`, 'Permalink'));
$('#copy-query').addEventListener('click', () => copy(state.data.lastQuery || '', 'Overpass-Abfrage'));
$('#config-export').addEventListener('click', () =>
  download(
    'search-a-hood-config.json',
    JSON.stringify({ version: 1, settings: state.settings, customDefs: state.customDefs, distMode: state.distMode, candidates: state.candidates }, null, 2),
    'application/json',
  ),
);
$('#config-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const cfg = JSON.parse(await file.text());
    state.customDefs = cfg.customDefs || [];
    store.set('custom', state.customDefs);
    state.settings = {};
    store.set('settings', cfg.settings || {});
    loadModules();
    if (cfg.candidates) (state.candidates = cfg.candidates), saveCandidates();
    if (cfg.distMode) setDistMode(cfg.distMode);
    refreshPanel();
    onSettingsChanged();
    setStatus('Konfiguration geladen.');
  } catch (err) {
    setStatus(`Config ungültig: ${err.message}`, true);
  }
  e.target.value = '';
});

$('#export-geojson').addEventListener('click', () => {
  const r = state.lastResult;
  if (!r) return setStatus('Erst analysieren.', true);
  const { grid, scores } = r;
  const features = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const s = scores[row * grid.cols + col];
      const n = grid.bbox.north - row * grid.latStep;
      const w = grid.bbox.west + col * grid.lonStep;
      const ring = [
        [w, n],
        [w + grid.lonStep, n],
        [w + grid.lonStep, n - grid.latStep],
        [w, n - grid.latStep],
        [w, n],
      ].map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
      features.push({ type: 'Feature', properties: { score: Number.isNaN(s) ? null : +s.toFixed(4) }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
  }
  download('search-a-hood-heatmap.geojson', JSON.stringify({ type: 'FeatureCollection', features }), 'application/geo+json');
});

$('#export-pois').addEventListener('click', () => {
  const features = [];
  for (const { module: m, elements } of state.layers.values()) {
    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const geometry = el.geometry
        ? { type: 'LineString', coordinates: el.geometry.map((p) => [p.lon, p.lat]) }
        : lat != null
          ? { type: 'Point', coordinates: [lon, lat] }
          : null;
      if (geometry) features.push({ type: 'Feature', properties: { module: m.id, osm: `${el.type}/${el.id}`, ...el.tags }, geometry });
    }
  }
  if (!features.length) return setStatus('Erst analysieren.', true);
  download('search-a-hood-pois.geojson', JSON.stringify({ type: 'FeatureCollection', features }), 'application/geo+json');
});

$('#export-cand').addEventListener('click', () => {
  const rows = candidateRows();
  const mods = [...state.layers.values()].map((l) => l.module);
  const header = ['#', 'Adresse', 'lat', 'lon', 'Score %', 'Kaltmiete', 'm²', '€/m²', 'Link', ...mods.map((m) => `${m.name} (m)`)];
  const data = rows.map(({ cand: c, idx, ev }) => {
    const byId = new Map((ev?.parts || []).map((p) => [p.module.id, p]));
    return [
      idx + 1,
      c.label,
      c.lat,
      c.lon,
      ev ? (ev.score == null ? 'ausgeschlossen' : Math.round(ev.score * 100)) : '',
      c.rent,
      c.size,
      pricePerSqm(c),
      c.url,
      ...mods.map((m) => {
        const p = byId.get(m.id);
        return p?.hit ? Math.round(p.dist) : '';
      }),
    ];
  });
  download('search-a-hood-kandidaten.csv', '﻿' + toCSV([header, ...data]), 'text/csv;charset=utf-8');
});

// =====================================================================
// Befehlspalette & Tastenkürzel
// =====================================================================
const palette = createPalette($('#palette'), () => [
  { label: '🔍 Sichtbares Gebiet analysieren', hint: 'A', run: () => analyze() },
  { label: '🚶 Entfernung: echte Fußwege', hint: 'W', run: () => setDistMode('walk') },
  { label: '📏 Entfernung: Luftlinie', hint: 'W', run: () => setDistMode('air') },
  { label: '⏱ Isochrone am letzten Klickpunkt', hint: 'I', run: () => drawIsochrone() },
  { label: '🎚 Relative Farbskala an/aus', hint: 'R', run: () => relBox.click() },
  ...(state.focusModule ? [{ label: '◉ Einzelansicht beenden', run: () => ((state.focusModule = null), refreshPanel(), scheduleRebuild()) }] : []),
  { label: '🔗 Permalink kopieren', run: () => $('#permalink-btn').click() },
  { label: '⬇ Kandidaten als CSV', run: () => $('#export-cand').click() },
  { label: '⬇ Heatmap als GeoJSON', run: () => $('#export-geojson').click() },
  { label: '⬇ POIs als GeoJSON', run: () => $('#export-pois').click() },
  ...Object.entries(TIME_PRESETS).map(([k, fn]) => ({ label: `🕒 Zeitpunkt: ${document.querySelector(`[data-time="${k}"]`).textContent}`, run: () => setTime(fn()) })),
  ...PRESETS.map((p) => ({ label: `Preset: ${p.name}`, hint: p.description, run: () => applyPreset(p) })),
  ...state.modules.map((m) => ({
    label: `${state.settings[m.id].enabled ? '☑' : '☐'} ${m.name}`,
    hint: `Modul ${state.settings[m.id].enabled ? 'deaktivieren' : 'aktivieren'} · ${m.category}`,
    run: () => {
      state.settings[m.id].enabled = !state.settings[m.id].enabled;
      saveSettings();
      refreshPanel();
      onSettingsChanged();
    },
  })),
  ...state.candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.lat != null)
    .map(({ c, i }) => ({ label: `★ ${i + 1}. ${c.label}`, hint: 'Kandidat anzeigen', run: () => (showTab('candidates'), map.setView([c.lat, c.lon], 17), state.layers.size && showReport(L.latLng(c.lat, c.lon))) })),
  ...['criteria', 'candidates', 'layers', 'dev'].map((t, i) => ({ label: `Tab: ${tabs[i].textContent.trim()}`, hint: String(i + 1), run: () => showTab(t) })),
]);
$('#palette-btn').addEventListener('click', () => palette.open());

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    return palette.isOpen ? palette.close() : palette.open();
  }
  if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || palette.isOpen) return;
  const k = e.key.toLowerCase();
  if (k === 'a') analyze();
  else if (k === '/') (e.preventDefault(), $('#search-input').focus());
  else if (k === 'w') setDistMode(state.distMode === 'walk' ? 'air' : 'walk');
  else if (k === 'i') drawIsochrone();
  else if (k === 'r') relBox.click();
  else if (k === 'escape') map.closePopup();
  else if (/^[1-4]$/.test(k)) showTab(['criteria', 'candidates', 'layers', 'dev'][+k - 1]);
});

// =====================================================================
// Start
// =====================================================================
refreshPanel();
renderCandidates();
setStatus(fromLink ? 'Permalink geladen – „analysieren“ drücken (A).' : 'Viertel wählen, Preset oder Module einstellen, dann „analysieren“ (A). ⌘K für alles andere.');
const showEngine = () => ($('#hours-engine').textContent = hoursEngine());
showEngine();
loadHoursLib().then((ok) => (showEngine(), ok && scheduleRebuild()));

// Für Debugging / eigene Skripte in der DevTools-Konsole
window.searchAHood = { state, map, modules: state.modules, evaluate, analyze, overlays, formatDist };
