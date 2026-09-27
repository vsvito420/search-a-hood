import { esc, formatDist, walkMin, lostPoints } from './popups.js';
import { SpatialIndex } from '../core/spatial-index.js';
import { elementsToPoints } from '../core/overpass.js';
import { isOpenAt } from '../core/hours.js';
import { labelOf } from '../modules/define.js';
import { scoreColor } from '../core/scoring.js';

const RINGS = [5, 10, 15]; // Gehminuten (Luftlinie × 80 m/min)

/**
 * Druckbarer Standort-Steckbrief als eigenständiges HTML-Dokument.
 * @param {{lat:number, lon:number, label:string, rent?:number, size?:number, url?:string}} place
 * @param {{parts:object[], score:number|null}} ev evaluatePoint-Ergebnis
 * @param {Map<string, {module, settings, elements}>} layers
 */
export function buildReportHtml(place, ev, layers, { time, distMode }) {
  const scoreTxt = ev.score == null ? 'ausgeschlossen' : `${Math.round(ev.score * 100)} %`;
  const [r, g, b] = ev.score == null ? [120, 120, 120] : scoreColor(ev.score);
  const lost = lostPoints(ev.parts).filter((l) => l.lost >= 0.005);
  const broken = ev.parts.filter((p) => p.required && !p.satisfied);
  const when = time.toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const rows = ev.parts
    .map((p) => {
      const layer = layers.get(p.module.id);
      const tags = p.hit?.item?.tags || {};
      const open = p.module.supportsHours && p.hit ? isOpenAt(tags.opening_hours, time) : undefined;
      const openTxt = open === true ? '<span class="ok">offen</span>' : open === false ? '<span class="bad">zu</span>' : open === null ? '<span class="muted">?</span>' : '';
      let counts = '';
      if (p.module.geometry !== 'line' && layer) {
        const idx = new SpatialIndex(elementsToPoints(layer.elements, 'point'));
        counts = RINGS.map((m) => idx.within(place.lat, place.lon, m * 80).length).join(' / ');
      }
      const k = p.settings.mode === 'near' ? p.settings.minCount || 1 : 1;
      const goal = `${k > 1 ? `${k}× ` : ''}${p.settings.mode === 'far' ? '≥' : '≤'} ${formatDist(p.settings.distance)}`;
      return `<tr>
        <td>${p.satisfied ? '<span class="ok">✔</span>' : p.required ? '<span class="bad">✘</span>' : '<span class="warn">·</span>'}</td>
        <td><b>${esc(p.module.name)}</b><br><small>${esc(p.module.category)} · Gewicht ${p.weight}${p.required ? ' · Pflicht' : ''}</small></td>
        <td>${p.hit ? esc(labelOf(tags, '–')) : p.settings.mode === 'far' ? '<span class="ok">keins in Reichweite</span>' : '<span class="bad">keins gefunden</span>'}
            ${tags.opening_hours ? `<br><small>${esc(tags.opening_hours)}</small>` : ''}</td>
        <td class="num">${p.hit ? `${formatDist(p.dist)}<br><small>${walkMin(p.dist)} min</small>` : '–'}</td>
        <td class="num">${goal}</td>
        <td>${openTxt}</td>
        <td class="num">${counts}</td>
        <td class="num">${Math.round(p.score * 100)} %</td>
      </tr>`;
    })
    .join('');

  const d = 0.006;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${place.lon - d * 1.6},${place.lat - d},${place.lon + d * 1.6},${place.lat + d}&layer=mapnik&marker=${place.lat},${place.lon}`;
  const ppsqm = place.rent && place.size ? (place.rent / place.size).toFixed(2) : null;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steckbrief – ${esc(place.label)}</title>
<style>
  :root { --text:#1d232b; --muted:#5f6b7a; --border:#dde2e8; font-family: system-ui, sans-serif; color: var(--text); }
  body { margin: 24px auto; max-width: 900px; padding: 0 16px; background: #fff; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 24px 0 8px; }
  .meta { color: var(--muted); font-size: 13px; margin: 4px 0 16px; }
  .top { display: grid; grid-template-columns: 180px 1fr; gap: 20px; align-items: center; }
  .score { font-size: 44px; font-weight: 800; text-align: center; border-radius: 14px; padding: 18px 8px; background: rgb(${r} ${g} ${b}); color: #111; }
  .score small { display: block; font-size: 12px; font-weight: 600; color: #111; opacity: .75; }
  .facts { font-size: 14px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { border-bottom: 1px solid var(--border); padding: 6px 6px; text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; } .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  small, .muted { color: var(--muted); } .ok { color: #1a9850; } .bad { color: #d7301f; } .warn { color: #c77c02; }
  iframe { width: 100%; height: 320px; border: 1px solid var(--border); border-radius: 8px; }
  footer { margin-top: 24px; font-size: 11px; color: var(--muted); }
  .noprint { margin: 12px 0; } button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: #f6f7f9; cursor: pointer; }
  @media print { .noprint { display: none; } body { margin: 0; } iframe { height: 260px; } }
</style></head><body>
<div class="noprint"><button onclick="print()">🖨 Drucken / als PDF speichern</button></div>
<h1>📍 ${esc(place.label)}</h1>
<p class="meta">${place.lat.toFixed(5)}, ${place.lon.toFixed(5)} · Stand ${esc(when)} · Entfernungen: ${distMode === 'walk' ? 'echte Fußwege' : 'Luftlinie'}${
    place.url ? ` · <a href="${esc(place.url)}">Inserat</a>` : ''
  }</p>
<div class="top">
  <div class="score">${scoreTxt}<small>Lage-Score</small></div>
  <div class="facts">
    ${place.rent ? `Kaltmiete <b>${place.rent} €</b>${place.size ? ` · ${place.size} m² · <b>${ppsqm} €/m²</b>` : ''}<br>` : ''}
    ${broken.length ? `<span class="bad">Ausgeschlossen durch: ${broken.map((p) => esc(p.module.name)).join(', ')}</span><br>` : ''}
    ${lost.length ? `Abzüge: ${lost.slice(0, 5).map((l) => `${esc(l.part.module.name)} −${Math.round(l.lost * 100)}`).join(' · ')}` : ev.score != null ? 'Alle Kriterien voll erfüllt.' : ''}
  </div>
</div>
<h2>Kriterien</h2>
<table><thead><tr><th></th><th>Kriterium</th><th>Nächster Treffer</th><th class="num">Distanz</th><th>Ziel</th><th>zum Zeitpunkt</th><th class="num" title="Anzahl in 5 / 10 / 15 min Luftlinie">≤ 5/10/15 min</th><th class="num">Score</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>Karte</h2>
<iframe src="${esc(embed)}" loading="lazy" title="Karte"></iframe>
<footer>Erstellt mit search-a-hood · Daten © OpenStreetMap-Mitwirkende (ODbL) · Öffnungszeiten laut OSM, ohne Gewähr · Keine Rechtsberatung.</footer>
</body></html>`;
}

/** Öffnet den Steckbrief in einem neuen Tab (Blob-URL, kein document.write). */
export function openReport(html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return w;
}
