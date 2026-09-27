#!/usr/bin/env node
// Headless-CLI: Adressen gegen Module/Presets bewerten – für Skripte, Cronjobs, CI.
//
//   node bin/search-a-hood.mjs score "Oranienstr. 185, Berlin" "Wiener Str. 10, Berlin" --preset informatiker
//   node bin/search-a-hood.mjs score 52.4986,13.418 --modules spaeti,supermarket --walk --time "2026-10-02T23:00" --json
//   node bin/search-a-hood.mjs modules | presets
//
// Hinter einem HTTP-Proxy: NODE_USE_ENV_PROXY=1 setzen (Node ≥ 22.21).

import { parseArgs } from 'node:util';
import { BUILTIN_MODULES, targetModule } from '../src/modules/index.js';
import { PRESETS } from '../src/presets.js';
import { DataStore } from '../src/core/datastore.js';
import { runQuery } from '../src/core/overpass.js';
import { evaluatePoint, searchRadius } from '../src/core/analyzer.js';
import { SpatialIndex } from '../src/core/spatial-index.js';
import { elementsToPoints } from '../src/core/overpass.js';
import { padBbox } from '../src/core/geo.js';
import { isOpenAt } from '../src/core/hours.js';
import { WalkGraph, NetworkField, buildWalkQuery, WALK_SPEED_M_PER_MIN } from '../src/core/routing.js';
import { createGeocoder } from '../src/core/candidates.js';
import { scoreColor } from '../src/core/scoring.js';
import { osrmField, transitField, CommuteIndex, COMMUTE_MODES } from '../src/core/commute.js';

const UA = 'search-a-hood-cli (+https://github.com/vsvito420/search-a-hood)';
// Alle Dienste mit eigenem User-Agent ansprechen (Transitous blockt z. B. Nodes Standard-UA „node“)
const uaFetch = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, 'User-Agent': UA } });
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c('2', s);
const bold = (s) => c('1', s);
const scoreFmt = (s) => {
  if (s == null) return c('31;1', 'ausgeschlossen');
  const [r, g, b] = scoreColor(s);
  return tty ? `\x1b[1;38;2;${r};${g};${b}m${Math.round(s * 100)} %\x1b[0m` : `${Math.round(s * 100)} %`;
};
const fmtDist = (m) => (!Number.isFinite(m) ? '–' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
// Terminal-Breite: Emojis belegen zwei Spalten, Variation Selectors keine
const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].reduce((w, ch) => w + (/\p{Extended_Pictographic}/u.test(ch) ? 2 : /[\uFE0F\u200D]/.test(ch) ? 0 : 1), 0);
const pad = (s, n) => {
  const len = width(s);
  return s + ' '.repeat(Math.max(0, n - len));
};

const HELP = `${bold('search-a-hood')} – Wohnlagen-Check auf OpenStreetMap-Basis

${bold('Befehle')}
  score <adresse|lat,lon> [...]   Eine oder mehrere Lagen bewerten (mehrere = Ranking)
  modules                         Verfügbare Module auflisten
  presets                         Presets auflisten

${bold('Optionen für score')}
  -p, --preset <id>               Preset (Standard: Module mit enabled-Default)
  -m, --modules <id,id,…>         Module explizit wählen (überschreibt Preset)
  -s, --set <id.key=wert>         Einstellung überschreiben, mehrfach möglich
                                  z. B. -s spaeti.distance=300 -s bubatz.required=true
  -g, --goal "<name>|<adresse>|<modus>|<min>"
                                  Pendel-Ziel, mehrfach möglich. Modus: bike, transit, foot, car
                                  z. B. -g "Arbeit|Alexanderplatz, Berlin|transit|25"
      --arrive <hh:mm>            Ankunft am Ziel für ÖPNV (Standard 08:30, nächster Werktag)
  -w, --walk                      Echte Fußwege statt Luftlinie (lädt das Wegenetz)
  -t, --time <ISO>                Zeitpunkt für „nur geöffnet“ (Standard: jetzt)
      --json                      Maschinenlesbare Ausgabe
      --overpass <url>            Eigene Overpass-Instanz (auch via OVERPASS_URL)
  -h, --help

${bold('Beispiele')}
  search-a-hood score "Oranienstr. 185, Berlin" -p informatiker
  search-a-hood score "Adresse A" "Adresse B" -p nachteule -t 2026-10-03T03:00 --walk
  search-a-hood score 52.4986,13.418 -m spaeti,supermarket -s spaeti.openAtTime=true --json | jq .
  search-a-hood score "Adresse A" "Adresse B" -p informatiker -g "Arbeit|Alexanderplatz, Berlin|transit|25"
`;

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return Number.isFinite(+v) && v.trim() !== '' ? +v : v;
}

function resolveSettings({ preset, modules, set }) {
  const settings = Object.fromEntries(BUILTIN_MODULES.map((m) => [m.id, { ...m.defaults }]));
  if (preset) {
    const p = PRESETS.find((x) => x.id === preset);
    if (!p) throw new Error(`Unbekanntes Preset „${preset}“. Verfügbar: ${PRESETS.map((x) => x.id).join(', ')}`);
    for (const s of Object.values(settings)) s.enabled = false;
    for (const [id, patch] of Object.entries(p.modules)) Object.assign(settings[id], patch);
  }
  if (modules) {
    const ids = modules.split(',').map((s) => s.trim());
    for (const id of ids) if (!settings[id]) throw new Error(`Unbekanntes Modul „${id}“ (siehe: search-a-hood modules)`);
    for (const [id, s] of Object.entries(settings)) s.enabled = ids.includes(id);
  }
  for (const kv of set || []) {
    const m = kv.match(/^([\w-]+)\.(\w+)=(.*)$/);
    if (!m || !settings[m[1]]) throw new Error(`Ungültiges --set „${kv}“ (Format: modul.key=wert)`);
    settings[m[1]][m[2]] = parseValue(m[3]);
  }
  return settings;
}

async function locate(q, geocode) {
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { label: q, lat: +m[1], lon: +m[2] };
  const hit = await geocode(q);
  if (!hit) throw new Error(`Adresse nicht gefunden: ${q}`);
  return { label: q, lat: hit.lat, lon: hit.lon, display: hit.display };
}

async function score(places, opts) {
  const settings = resolveSettings(opts);
  const mods = BUILTIN_MODULES.filter((m) => settings[m.id].enabled);
  const goals = (opts.goal || []).map((g, i) => {
    const [name, addr, mode = 'bike', minutes = '25'] = g.split('|').map((x) => x.trim());
    if (!name || !addr || !COMMUTE_MODES[mode] || !(+minutes > 0)) throw new Error(`Ungültiges --goal „${g}“ (Format: Name|Adresse|bike/transit/foot/car|Minuten)`);
    return { id: `g${i}`, name, addr, mode, minutes: +minutes, arrive: opts.arrive || '08:30' };
  });
  if (!mods.length && !goals.length) throw new Error('Keine Module aktiv. --preset, --modules oder --goal angeben.');
  const time = opts.time ? new Date(opts.time) : new Date();
  if (Number.isNaN(time.getTime())) throw new Error(`Ungültige Zeit: ${opts.time}`);
  const log = (msg) => !opts.json && process.stderr.write(dim(`${msg}\n`));

  const geocode = createGeocoder({ fetchImpl: uaFetch });
  const points = [];
  for (const q of places) {
    log(`📍 ${q}`);
    points.push(await locate(q, geocode));
  }

  for (const g of goals) {
    log(`🎯 ${g.name}: ${g.addr}`);
    Object.assign(g, await locate(g.addr, geocode));
  }

  // Ein Gebiet für alle Punkte (plus Rand) → eine Overpass-Abfrage
  const radius = Math.min(2000, Math.max(200, ...mods.map((m) => searchRadius(settings[m.id]))));
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bbox = padBbox({ south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) }, radius + 200);

  const endpoints = opts.overpass || process.env.OVERPASS_URL ? [opts.overpass || process.env.OVERPASS_URL] : undefined;
  const run = (q, o) => runQuery(q, { ...o, endpoints, fetchImpl: uaFetch });
  const store = new DataStore({ run });
  store.setArea(bbox);
  await store.ensure(mods, { onProgress: log });

  let graph = null;
  if (opts.walk) {
    log('🚶 Lade Fußwegenetz …');
    graph = new WalkGraph(await run(buildWalkQuery(bbox), { timeoutMs: 180_000 }));
    log(`   ${graph.n.toLocaleString('de')} Knoten, ${graph.edgeCount.toLocaleString('de')} Kanten`);
  }

  const layers = [];
  const errors = [];
  for (const m of mods) {
    const s = settings[m.id];
    const d = store.get(m.id);
    if (!d || d.error) {
      errors.push({ module: m.id, error: d?.error || 'keine Daten' });
      continue;
    }
    const els = d.elements.filter((el) => {
      el.tags ||= {};
      if (m.filter && !m.filter(el, { time, isOpenAt })) return false;
      if (m.supportsHours && s.openAtTime) return isOpenAt(el.tags.opening_hours, time) === true;
      return true;
    });
    const pts = elementsToPoints(els, m.geometry);
    const useNet = graph && m.geometry !== 'line' && s.mode !== 'far';
    layers.push({ module: m, settings: s, index: useNet ? new NetworkField(graph, pts, searchRadius(s)) : new SpatialIndex(pts), count: els.length });
  }
  // Pendel-Ziele: Reisezeitfeld über die Kandidaten-Box (OSRM) bzw. Haltestellen (Transitous)
  const pointBox = padBbox({ south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) }, 150);
  for (const g of goals) {
    const m = targetModule(g);
    const s = { ...m.defaults };
    settings[m.id] = s;
    log(`${COMMUTE_MODES[g.mode].icon} Reisezeiten zu „${g.name}“ …`);
    try {
      let field;
      if (g.mode === 'transit') {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        const [h, mi] = g.arrive.split(':').map(Number);
        d.setHours(h, mi, 0, 0);
        field = await transitField(g, { time: d, maxMinutes: s.distance * 2, fetchImpl: uaFetch });
      } else {
        field = await osrmField(g.mode, g, pointBox, { n: points.length === 1 ? 2 : 9, fetchImpl: uaFetch });
      }
      layers.push({ module: m, settings: s, index: new CommuteIndex(field, g), count: 1 });
    } catch (e) {
      errors.push({ module: m.id, error: e.message });
    }
  }

  if (errors.some((e) => settings[e.module].required)) throw new Error(`Pflichtmodul nicht geladen: ${JSON.stringify(errors)}`);

  const results = points.map((p) => ({ ...p, ...evaluatePoint(p.lat, p.lon, layers) }));
  results.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));

  if (opts.json) {
    const out = {
      time: time.toISOString(),
      distance: graph ? 'walk' : 'air',
      modules: layers.map((l) => ({ id: l.module.id, ...l.settings, hits: l.count })),
      errors,
      results: results.map((r) => ({
        label: r.label,
        display: r.display,
        lat: r.lat,
        lon: r.lon,
        score: r.score == null ? null : +r.score.toFixed(4),
        criteria: r.parts.map((p) => ({
          module: p.module.id,
          unit: p.module.unit,
          distance: Number.isFinite(p.dist) ? Math.round(p.dist) : null,
          walkMinutes: p.module.unit === 'min' ? null : Number.isFinite(p.dist) ? Math.max(1, Math.round(p.dist / WALK_SPEED_M_PER_MIN)) : null,
          satisfied: p.satisfied,
          score: +p.score.toFixed(3),
          nearest: p.hit ? { name: p.hit.item.tags?.name || null, osm: p.hit.item.id } : null,
        })),
      })),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const when = time.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  console.log(dim(`\n${layers.length} Kriterien · ${graph ? '🚶 Fußwege' : 'Luftlinie'} · Zeitpunkt ${when}${opts.preset ? ` · Preset ${opts.preset}` : ''}`));
  results.forEach((r, i) => {
    console.log(`\n${results.length > 1 ? bold(`#${i + 1} `) : ''}${bold(r.display || r.label)}  ${dim(`${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`)}`);
    console.log(`   Score ${scoreFmt(r.score)}`);
    for (const p of r.parts) {
      const icon = p.satisfied ? c('32', '✔') : p.required ? c('31', '✘') : c('33', '·');
      const isMin = p.module.unit === 'min';
      const d = p.hit
        ? isMin
          ? `${Math.round(p.dist)} min`
          : `${fmtDist(p.dist)} ${dim(`(${Math.max(1, Math.round(p.dist / WALK_SPEED_M_PER_MIN))} min)`)}`
        : p.settings.mode === 'far'
          ? dim('weit weg')
          : c('31', isMin ? 'zu weit' : 'keiner');
      const goal = dim(`${p.settings.mode === 'far' ? '≥' : '≤'} ${isMin ? `${p.settings.distance} min` : fmtDist(p.settings.distance)}`);
      const name = p.hit?.item.tags?.name && !isMin ? dim(p.hit.item.tags.name) : '';
      console.log(`   ${icon} ${pad(p.module.name, 30)} ${pad(d, 22)} ${pad(goal, 12)} ${name}`);
    }
  });
  for (const e of errors) console.log(c("33", `\n⚠ nicht geladen: ${e.module} – ${e.error}`));
  console.log(dim('\nDaten © OpenStreetMap-Mitwirkende (ODbL)'));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      preset: { type: 'string', short: 'p' },
      modules: { type: 'string', short: 'm' },
      set: { type: 'string', short: 's', multiple: true },
      walk: { type: 'boolean', short: 'w' },
      goal: { type: 'string', short: 'g', multiple: true },
      arrive: { type: 'string' },
      time: { type: 'string', short: 't' },
      json: { type: 'boolean' },
      overpass: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd) return console.log(HELP);
  if (cmd === 'modules') {
    for (const m of BUILTIN_MODULES) {
      const d = m.defaults;
      console.log(`${pad(bold(m.id), 20)} ${pad(m.name, 32)} ${dim(`${m.category} · ${d.mode === 'far' ? '≥' : '≤'} ${d.distance} m${m.supportsHours ? ' · ⏱' : ''}`)}`);
    }
    return;
  }
  if (cmd === 'presets') {
    for (const p of PRESETS) console.log(`${pad(bold(p.id), 16)} ${p.name}\n${' '.repeat(17)}${dim(p.description)}`);
    return;
  }
  if (cmd === 'score') {
    if (!rest.length) throw new Error('Mindestens eine Adresse oder lat,lon angeben.');
    return score(rest, values);
  }
  throw new Error(`Unbekannter Befehl „${cmd}“ – siehe --help`);
}

main().catch((e) => {
  console.error(c('31', `Fehler: ${e.message}`));
  process.exit(1);
});
