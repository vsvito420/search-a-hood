import { esc } from './popups.js';

/**
 * Zeichnet die Modul-Liste in der Seitenleiste.
 * @param {HTMLElement} root
 * @param {{onChange:(id:string, patch:object)=>void, onDelete:(id:string)=>void}} handlers
 */
export function renderModules(root, modules, settings, counts, handlers) {
  const byCat = new Map();
  for (const m of modules) {
    if (!byCat.has(m.category)) byCat.set(m.category, []);
    byCat.get(m.category).push(m);
  }
  root.innerHTML = '';
  for (const [cat, mods] of byCat) {
    const wrap = document.createElement('div');
    wrap.className = 'category';
    wrap.innerHTML = `<div class="cat-title">${esc(cat)}</div>`;
    for (const m of mods) wrap.append(moduleCard(m, settings[m.id], counts[m.id], handlers));
    root.append(wrap);
  }
}

function moduleCard(m, s, count, { onChange, onDelete, onFocus, focusId }) {
  const el = document.createElement('div');
  el.className = `module${s.enabled ? ' on' : ''}`;
  el.style.setProperty('--mcolor', m.color);
  el.innerHTML = `
    <div class="head">
      <label title="${esc(m.description)}">
        <input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''} />
        <span class="micon" aria-hidden="true">${esc(m.icon || '📍')}</span><span class="mname">${esc(m.name)}</span>
      </label>
      <span class="count" data-count-for="${esc(m.id)}"></span>
      ${s.enabled ? `<button class="eye${focusId === m.id ? ' active' : ''}" type="button" title="Heatmap nur für dieses Kriterium" aria-pressed="${focusId === m.id}">◉</button>` : ''}
      ${m.custom ? '<button class="del" type="button" title="Modul löschen">✕</button>' : ''}
    </div>
    <div class="opts">
      ${m.description ? `<p class="desc">${esc(m.description)}</p>` : ''}
      ${
        m.unit === '%'
          ? `<label>mind. <input type="number" data-k="distance" min="1" max="100" step="1" value="${s.distance}" class="tiny" /> % im Umkreis von ${m.shareRadius || 300} m</label>`
          : m.unit === 'min'
          ? `<label>max. <input type="number" data-k="distance" min="1" max="120" step="1" value="${s.distance}" class="tiny" /> min</label>`
          : `<select data-k="mode" aria-label="Richtung">
        <option value="near" ${s.mode === 'near' ? 'selected' : ''}>nah dran ≤</option>
        <option value="far" ${s.mode === 'far' ? 'selected' : ''}>weit weg ≥</option>
      </select>
      <label><input type="number" data-k="distance" min="10" max="10000" step="10" value="${s.distance}" /> m</label>`
      }
      ${s.mode === 'near' && m.unit === 'm' ? `<label title="Mindestanzahl Treffer im Umkreis (1 = der nächste reicht)">mind. <input type="number" data-k="minCount" min="1" max="20" step="1" value="${s.minCount || 1}" class="tiny" /> ×</label>` : ''}
      <label title="Gewichtung im Gesamtscore">Gewicht <input type="range" data-k="weight" min="0" max="3" step="0.5" value="${s.weight}" /> <output>${s.weight}</output></label>
      <label title="Lagen, die das nicht erfüllen, werden grau ausgeschlossen"><input type="checkbox" data-k="required" ${s.required ? 'checked' : ''} /> Pflicht</label>
      ${m.supportsHours ? `<label title="Nur Treffer, die zum gewählten Zeitpunkt laut OSM geöffnet sind"><input type="checkbox" data-k="openAtTime" ${s.openAtTime ? 'checked' : ''} /> nur geöffnet</label>` : ''}
      ${m.unit !== 'm' ? '' : `<label><input type="checkbox" data-k="showMarkers" ${s.showMarkers ? 'checked' : ''} /> Marker</label>`}
    </div>`;

  el.querySelectorAll('[data-k]').forEach((input) => {
    const k = input.dataset.k;
    const read = () => (input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' ? +input.value : input.value);
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
      const v = read();
      if (k === 'distance' && !(v > 0)) return;
      if (k === 'minCount' && !(v >= 1 && v <= 50)) return;
      if (k === 'weight') input.nextElementSibling.textContent = v;
      onChange(m.id, { [k]: v });
    });
  });
  setCount(el.querySelector('.count'), count);
  el.querySelector('.del')?.addEventListener('click', () => onDelete(m.id));
  el.querySelector('.eye')?.addEventListener('click', () => onFocus?.(m.id));
  return el;
}

function setCount(span, count) {
  span.classList.toggle('err', !!count?.error);
  if (count?.error) {
    span.textContent = 'Fehler';
    span.title = count.error;
    return;
  }
  if (!count) {
    span.textContent = '';
    span.title = '';
    return;
  }
  if (count.label) {
    span.textContent = count.label;
    span.title = count.title || '';
    return;
  }
  // Datenqualität: Wie viele Treffer haben überhaupt Öffnungszeiten in OSM?
  const q = count.hoursShare != null ? ` · ⏱${Math.round(count.hoursShare * 100)}%` : '';
  span.textContent = `${count.n}${q}`;
  span.title =
    `${count.n} Treffer im analysierten Gebiet` +
    (count.total != null && count.total !== count.n ? ` (von ${count.total} vor Filter)` : '') +
    (q ? `\n${Math.round(count.hoursShare * 100)} % davon haben opening_hours in OSM – bei „nur geöffnet“ zählen nur diese.` : '');
}

/** Aktualisiert nur die Trefferzahlen, ohne die Liste neu zu bauen. */
export function updateCounts(root, counts) {
  root.querySelectorAll('[data-count-for]').forEach((span) => setCount(span, counts[span.dataset.countFor]));
}

export function renderPresets(root, presets, onPick) {
  root.innerHTML = '';
  for (const p of presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.title = p.description;
    b.addEventListener('click', () => onPick(p));
    root.append(b);
  }
}
