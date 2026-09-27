import { esc } from './popups.js';

/** Unscharfe Suche: alle Zeichen der Eingabe in Reihenfolge, Bonus für Wortanfänge/Zusammenhang. */
export function fuzzyScore(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 1;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (found === 0 || /[\s/(-]/.test(t[found - 1]) ? 3 : 0);
    ti = found + 1;
  }
  return score / (t.length * 0.05 + 1);
}

/**
 * Befehlspalette (Ctrl/⌘+K).
 * @param {() => {label:string, hint?:string, run:()=>void}[]} getItems
 */
export function createPalette(root, getItems) {
  const input = root.querySelector('#palette-input');
  const list = root.querySelector('#palette-list');
  let items = [];
  let shown = [];
  let sel = 0;

  const render = () => {
    const q = input.value;
    shown = items
      .map((it) => ({ it, s: fuzzyScore(q, `${it.label} ${it.hint || ''}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.it);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown
      .map((it, i) => `<li class="${i === sel ? 'sel' : ''}" data-i="${i}"><span>${esc(it.label)}</span><small>${esc(it.hint || '')}</small></li>`)
      .join('') || '<li class="empty">Nichts gefunden</li>';
  };
  const close = () => {
    root.hidden = true;
  };
  const run = (i) => {
    const it = shown[i];
    close();
    it?.run();
  };

  input.addEventListener('input', () => {
    sel = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') sel = Math.min(sel + 1, shown.length - 1);
    else if (e.key === 'ArrowUp') sel = Math.max(sel - 1, 0);
    else if (e.key === 'Enter') return run(sel);
    else if (e.key === 'Escape') return close();
    else return;
    e.preventDefault();
    render();
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) run(+li.dataset.i);
  });
  root.addEventListener('click', (e) => e.target === root && close());

  return {
    open() {
      items = getItems();
      input.value = '';
      sel = 0;
      root.hidden = false;
      render();
      input.focus();
    },
    close,
    get isOpen() {
      return !root.hidden;
    },
  };
}
