import { esc, fmtValue, safeUrl, modLabel } from './popups.js';
import { pricePerSqm } from '../core/candidates.js';
import { scoreColor } from '../core/scoring.js';

// Sequenzielle Blau-Rampe (hell → dunkel) für die Score-Matrix; im Dark Mode eigene Stufen,
// bei denen niedrige Werte zur (dunklen) Fläche hin zurücktreten.
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab'];
const RAMP_DARK = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef'];
const step = (ramp, s) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(s * (ramp.length - 1))))];
/** Zellstil: Hintergrund nach Score, Schrift hell/dunkel je nach Stufe (Kontrast). */
function cellStyle(score) {
  const i = Math.round(Math.max(0, Math.min(1, score)) * (RAMP.length - 1));
  return `--bg-l:${step(RAMP, score)};--fg-l:${i >= 6 ? '#fff' : '#1d232b'};--bg-d:${step(RAMP_DARK, score)};--fg-d:${i >= 7 ? '#0b1a2e' : '#e6eaef'}`;
}

const pct = (s) => (s == null ? '✘' : `${Math.round(s * 100)} %`);
const chip = (s) => {
  if (s === undefined) return '<span class="muted">–</span>';
  const [r, g, b] = s == null ? [120, 120, 120] : scoreColor(s);
  return `<span class="score-chip" style="--c: rgb(${r} ${g} ${b})">${pct(s)}</span>`;
};

/**
 * Vergleichstabelle: Zeilen = Kandidaten, Spalten = Score, €/m² und je Modul die Distanz.
 * @param {object[]} rows  [{cand, idx, eval?: {score, parts}}]
 */
export function renderCandidateTable(root, rows, { sortKey, sortDir, onSort, onFocus, onDelete, activeModules }) {
  if (!rows.length) {
    root.innerHTML = '<p class="hint">Noch keine Kandidaten.</p>';
    return;
  }
  const head = [
    ['idx', '#'],
    ['label', 'Adresse'],
    ['score', 'Score'],
    ['rent', '€'],
    ['sqm', '€/m²'],
    ...activeModules.map((m) => [`m:${m.id}`, modLabel(m)]),
  ];
  const arrow = (k) => (k === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
  const cells = (r) => {
    const { cand: c, ev } = r;
    const byId = new Map((ev?.parts || []).map((p) => [p.module.id, p]));
    const ppsqm = pricePerSqm(c);
    return [
      `<td class="num">${r.idx + 1}</td>`,
      `<td class="addr" title="${esc(c.display || c.label)}">${safeUrl(c.url) ? `<a href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">${esc(c.label)}</a>` : esc(c.label)}${
        c.lat == null ? `<br><small class="bad">${esc(c.error || 'nicht gefunden')}</small>` : ''
      }</td>`,
      `<td>${ev ? chip(ev.score) : chip(undefined)}</td>`,
      `<td class="num">${c.rent ?? ''}</td>`,
      `<td class="num">${ppsqm ? ppsqm.toFixed(1) : ''}</td>`,
      ...activeModules.map((m) => {
        const p = byId.get(m.id);
        if (!p) return '<td class="muted">–</td>';
        const mark = p.satisfied ? '✓' : p.required ? '✗' : '·';
        const val = p.hit ? fmtValue(m, p.dist) : p.settings.mode === 'far' ? 'weit' : '–';
        const tip = `${m.name}: ${val} · ${Math.round(p.score * 100)} % ${p.satisfied ? '(Ziel erfüllt)' : p.required ? '(Pflicht verletzt)' : '(Ziel verfehlt)'}${p.hit?.item?.tags?.name && m.unit === 'm' ? ` · ${p.hit.item.tags.name}` : ''}`;
        return `<td class="cell" style="${cellStyle(p.score)}" title="${esc(tip)}">${mark} ${val}</td>`;
      }),
      `<td><button class="del" type="button" data-del="${r.idx}" title="entfernen">✕</button></td>`,
    ].join('');
  };
  root.innerHTML = `<table class="cmp">
    <thead><tr>${head.map(([k, l]) => `<th data-sort="${esc(k)}" title="${esc(l)}">${esc(l)}${arrow(k)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-idx="${r.idx}">${cells(r)}</tr>`).join('')}</tbody>
  </table>
  ${activeModules.length ? '<div class="matrix-legend"><span>Erfüllung 0 %</span><i></i><span>100 %</span><small>✓ Ziel erfüllt · ✗ Pflicht verletzt · · verfehlt · Spaltenkopf = sortieren</small></div>' : ''}`;
  root.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => onSort(th.dataset.sort)));
  root.querySelectorAll('tr[data-idx]').forEach((tr) =>
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a,button')) return;
      onFocus(+tr.dataset.idx);
    }),
  );
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => onDelete(+b.dataset.del)));
}

/** Sortierwert einer Zeile für eine Spalte. */
export function sortValue(row, key) {
  const { cand: c, ev } = row;
  if (key === 'idx') return row.idx;
  if (key === 'label') return c.label.toLowerCase();
  if (key === 'score') return ev ? (ev.score ?? -1) : -2;
  if (key === 'rent') return c.rent ?? Infinity;
  if (key === 'sqm') return pricePerSqm(c) ?? Infinity;
  if (key.startsWith('m:')) {
    const p = ev?.parts.find((x) => x.module.id === key.slice(2));
    return p ? p.dist : Infinity;
  }
  return 0;
}
