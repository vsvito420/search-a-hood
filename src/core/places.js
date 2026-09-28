// Einzelne Orte (Wohnungs-Kandidaten) bewerten – ohne Heatmap, beliebig über eine Stadt verteilt.
// Gemeinsamer Kern für CLI und Web-App: Orte werden räumlich gruppiert, jede Gruppe bekommt
// EINE kleine Overpass-Abfrage; Pendel-Ziele werden exakt je Ort (OSRM) bzw. per Haltestellen-Feld (ÖPNV) berechnet.

import { DataStore } from './datastore.js';
import { elementsToPoints } from './overpass.js';
import { evaluatePoint, searchRadius } from './analyzer.js';
import { SpatialIndex } from './spatial-index.js';
import { padBbox, bboxAreaKm2 } from './geo.js';
import { isOpenAt } from './hours.js';
import { WalkGraph, NetworkField, buildWalkQuery } from './routing.js';
import { ShareField, ShareIndex } from './share.js';
import { osrmPointsField, transitField, CommuteIndex, nextWorkday } from './commute.js';

/** Gruppiert Punkte so, dass jede Gruppe (inkl. Rand) höchstens maxKm2 groß ist. */
export function groupPoints(points, margin, maxKm2 = 25) {
  const boxOf = (pts) =>
    padBbox(
      {
        south: Math.min(...pts.map((p) => p.lat)),
        north: Math.max(...pts.map((p) => p.lat)),
        west: Math.min(...pts.map((p) => p.lon)),
        east: Math.max(...pts.map((p) => p.lon)),
      },
      margin,
    );
  const groups = [];
  for (const p of points) {
    const g = groups.find((grp) => bboxAreaKm2(boxOf([...grp, p])) <= maxKm2);
    if (g) g.push(p);
    else groups.push([p]);
  }
  return groups.map((pts) => ({ points: pts, bbox: boxOf(pts) }));
}

/** Rand um die Orte, damit alle Kriterien vollständig abgedeckt sind. */
export function marginFor(modules, settings) {
  const r = modules.map((m) => (m.geometry === 'area' ? (m.shareRadius || 300) + 50 : searchRadius(settings[m.id])));
  return Math.min(2000, Math.max(200, ...r)) + 200;
}

/**
 * @param {{lat:number, lon:number}[]} points
 * @param {object} o
 * @param {object[]} o.modules  aktive Module (Overpass- und Ziel-Module gemischt)
 * @param {object} o.settings   Einstellungen je Modul-ID
 * @param {Date} o.time
 * @param {boolean} [o.walk]    echte Fußwege (lädt Wegenetz je Gruppe)
 * @param {Function} o.run      Overpass-Runner (runQuery-kompatibel)
 * @returns {Promise<{results: {point, ev}[], errors: {module, error}[], modules: Map, groups: number, walkNodes: number}>}
 */
export async function scorePlaces(points, { modules, settings, time, walk = false, run, fetchImpl, onProgress = () => {}, maxGroupKm2 = 25 }) {
  const dataMods = modules.filter((m) => m.kind !== 'target');
  const targetMods = modules.filter((m) => m.kind === 'target');
  const groups = groupPoints(points, marginFor(dataMods, settings), maxGroupKm2);
  const errors = [];
  const used = new Map(); // Modul-ID → {module, settings, count}
  const layersOf = new Map(); // Punkt → Layer seiner Gruppe
  let walkNodes = 0;

  for (const [gi, grp] of groups.entries()) {
    const tag = groups.length > 1 ? ` [Gebiet ${gi + 1}/${groups.length}]` : '';
    const layers = [];
    if (dataMods.length) {
      const store = new DataStore({ run });
      store.setArea(grp.bbox);
      await store.ensure(dataMods, { onProgress: (m) => onProgress(m + tag) });
      let graph = null;
      if (walk) {
        onProgress(`🚶 Lade Fußwegenetz …${tag}`);
        try {
          graph = new WalkGraph(await run(buildWalkQuery(grp.bbox), { timeoutMs: 180_000 }));
          walkNodes += graph.n;
        } catch (e) {
          errors.push({ module: 'walk', error: `Fußwegenetz: ${e.message}${tag}` });
        }
      }
      for (const m of dataMods) {
        const s = settings[m.id];
        const d = store.get(m.id);
        if (!d || d.error) {
          errors.push({ module: m.id, error: `${d?.error || 'keine Daten'}${tag}` });
          continue;
        }
        const els = d.elements.filter((el) => {
          el.tags ||= {};
          if (m.filter && !m.filter(el, { time, isOpenAt })) return false;
          if (m.supportsHours && s.openAtTime) return isOpenAt(el.tags.opening_hours, time) === true;
          return true;
        });
        used.set(m.id, { module: m, settings: s, count: (used.get(m.id)?.count || 0) + els.length, elements: [...(used.get(m.id)?.elements || []), ...els] });
        if (m.geometry === 'area') {
          const f = new ShareField(els, grp.bbox, m.shareRadius || 300);
          layers.push({ module: m, settings: s, index: new ShareIndex(f, `${f.polygons} Flächen`), elements: [] });
          continue;
        }
        const pts = elementsToPoints(els, m.geometry);
        const useNet = graph && m.geometry !== 'line' && s.mode !== 'far' && (s.minCount || 1) === 1;
        layers.push({ module: m, settings: s, index: useNet ? new NetworkField(graph, pts, searchRadius(s)) : new SpatialIndex(pts), elements: els });
      }
    }
    for (const p of grp.points) layersOf.set(p, layers);
  }

  const goalLayers = [];
  for (const m of targetMods) {
    const t = m.target;
    const s = settings[m.id];
    onProgress(`Reisezeiten zu „${t.name}“ …`);
    try {
      const field =
        t.mode === 'transit'
          ? await transitField(t, { time: nextWorkday(t.arrive), maxMinutes: Math.min(90, Math.ceil((s.distance * 2) / 30) * 30), fetchImpl })
          : await osrmPointsField(t.mode, t, points, { fetchImpl });
      goalLayers.push({ module: m, settings: s, index: new CommuteIndex(field, t), elements: [] });
      used.set(m.id, { module: m, settings: s, count: 1, elements: [] });
    } catch (e) {
      errors.push({ module: m.id, error: e.message });
    }
  }

  const results = points.map((p) => ({ point: p, ev: evaluatePoint(p.lat, p.lon, [...(layersOf.get(p) || []), ...goalLayers]) }));
  return { results, errors, modules: used, groups: groups.length, walkNodes };
}
