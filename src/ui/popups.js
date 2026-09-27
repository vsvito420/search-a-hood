import { isOpenAt } from '../core/hours.js';
import { labelOf } from '../modules/define.js';

// OSM-Tags sind Fremddaten → immer escapen.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatDist(m) {
  if (!Number.isFinite(m)) return '–';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Gehminuten bei ~4,8 km/h. */
export const walkMin = (m) => Math.max(1, Math.round(m / 80));

const openLabel = (v, time) => {
  const s = isOpenAt(v, time);
  return s === true ? '<span class="ok">geöffnet</span>' : s === false ? '<span class="bad">geschlossen</span>' : 'unbekannt';
};

export function poiPopup(module, el, time) {
  const t = el.tags || {};
  const rows = [];
  if (t.opening_hours) rows.push(`<tr><td>Öffnungszeiten</td><td>${esc(t.opening_hours)}<br>${openLabel(t.opening_hours, time)}</td></tr>`);
  const addr = [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] || ''}`, t['addr:city']].filter(Boolean).join(', ');
  if (addr) rows.push(`<tr><td>Adresse</td><td>${esc(addr)}</td></tr>`);
  if (t.website) rows.push(`<tr><td>Web</td><td><a href="${esc(t.website)}" target="_blank" rel="noopener noreferrer">${esc(t.website)}</a></td></tr>`);
  const [type, id] = el.type ? [el.type, el.id] : String(el.id).split('/');
  return `<div class="report">
    <strong>${esc(labelOf(t, module.name))}</strong><br><small>${esc(module.name)}</small>
    <table>${rows.join('')}</table>
    <a href="https://www.openstreetmap.org/${esc(type)}/${esc(id)}" target="_blank" rel="noopener">in OSM ansehen</a>
  </div>`;
}

export function reportPopup({ parts, score }, latlng, { walk = false } = {}) {
  const rows = parts
    .map((p) => {
      const { module, settings, hit, dist, satisfied } = p;
      const icon = satisfied ? '<span class="ok">✔</span>' : settings.required ? '<span class="bad">✘</span>' : '<span class="bad">·</span>';
      const what = hit ? esc(labelOf(hit.item.tags || {}, '')) : '';
      const d = hit
        ? `${formatDist(dist)} (${walkMin(dist)} min)`
        : settings.mode === 'far'
          ? `> ${formatDist(settings.distance)}`
          : `> ${formatDist(settings.distance * 2)}`;
      const goal = `${settings.mode === 'far' ? '≥' : '≤'} ${formatDist(settings.distance)}`;
      const how = walk && module.geometry !== 'line' && settings.mode !== 'far' ? '🚶' : '';
      return `<tr><td>${icon}</td><td>${esc(module.name)}${what ? `<br><small>${what}</small>` : ''}</td><td>${how}${d}<br><small>Ziel ${goal}</small></td></tr>`;
    })
    .join('');
  const total = score == null ? '<span class="bad">Pflichtkriterium verletzt</span>' : `${Math.round(score * 100)} %`;
  return `<div class="report">
    <div class="score">${total}</div>
    <small>${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)} · ${walk ? '🚶 Fußwege' : 'Luftlinie'}</small>
    <table>${rows}</table>
  </div>`;
}
