import { esc, formatDist } from './popups.js';
import { pricePerSqm } from '../core/candidates.js';
import { scoreColor } from '../core/scoring.js';

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
    ...activeModules.map((m) => [`m:${m.id}`, m.name]),
  ];
  const arrow = (k) => (k === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
  const cells = (r) => {
    const { cand: c, ev } = r;
    const byId = new Map((ev?.parts || []).map((p) => [p.module.id, p]));
    const ppsqm = pricePerSqm(c);
    return [
      `<td class="num">${r.idx + 1}</td>`,
      `<td class="addr" title="${esc(c.display || c.label)}">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.label)}</a>` : esc(c.label)}${
        c.lat == null ? `<br><small class="bad">${esc(c.error || 'nicht gefunden')}</small>` : ''
      }</td>`,
      `<td>${ev ? chip(ev.score) : chip(undefined)}</td>`,
      `<td class="num">${c.rent ?? ''}</td>`,
      `<td class="num">${ppsqm ? ppsqm.toFixed(1) : ''}</td>`,
      ...activeModules.map((m) => {
        const p = byId.get(m.id);
        if (!p) return '<td class="muted">–</td>';
        const cls = p.satisfied ? 'ok' : p.required ? 'bad' : 'warn';
        return `<td class="${cls}" title="${esc(p.hit?.item?.tags?.name || '')}">${p.hit ? formatDist(p.dist) : p.settings.mode === 'far' ? '✔ weit' : '✘'}</td>`;
      }),
      `<td><button class="del" type="button" data-del="${r.idx}" title="entfernen">✕</button></td>`,
    ].join('');
  };
  root.innerHTML = `<table class="cmp">
    <thead><tr>${head.map(([k, l]) => `<th data-sort="${esc(k)}" title="${esc(l)}">${esc(l)}${arrow(k)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-idx="${r.idx}">${cells(r)}</tr>`).join('')}</tbody>
  </table>`;
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
