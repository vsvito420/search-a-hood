// Bottom Sheet wie in Apple Karten: auf schmalen Bildschirmen liegt die Seitenleiste als
// ziehbares Blatt über der Karte – drei Rastpunkte: eingeklappt (Suche + Tabs), halb, voll.

const MOBILE = '(max-width: 800px)';

export function createSheet(el, handle, { onChange = () => {} } = {}) {
  const mq = matchMedia(MOBILE);
  let state = 'peek';
  let drag = null;
  let suppressClick = false; // nach einem Ziehen feuert der Browser noch einen Klick auf den Griff

  const topGap = () => 64 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0);
  const heights = () => {
    // „eingeklappt“ zeigt Griff, Suche und Tab-Leiste
    const tabs = el.querySelector('.tabs');
    const peek = tabs ? Math.round(tabs.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 6) : 150;
    const full = innerHeight - topGap();
    return { peek: Math.min(peek, full), half: Math.round(innerHeight * 0.5), full };
  };

  function apply(h, animate = true) {
    el.classList.toggle('sheet-anim', animate);
    el.style.height = `${h}px`;
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
    onChange(h);
  }

  function set(next, animate = true) {
    if (!mq.matches) return;
    state = next;
    el.dataset.state = next;
    apply(heights()[next], animate);
    handle.setAttribute('aria-expanded', String(next !== 'peek'));
  }

  function reset() {
    if (mq.matches) set(state, false);
    else {
      el.style.height = '';
      el.removeAttribute('data-state');
      document.documentElement.style.setProperty('--sheet-h', '0px');
      onChange(0);
    }
  }

  // Ziehen am Griff (und an der Kopfzeile): Höhe folgt dem Finger, beim Loslassen einrasten
  const start = (e) => {
    if (!mq.matches || e.button > 0) return;
    if (e.target.closest('input, button:not(.sheet-handle), select, textarea, a')) return;
    drag = { y: e.clientY, h: el.getBoundingClientRect().height, t: performance.now(), moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const { peek, full } = heights();
    apply(Math.max(peek * 0.8, Math.min(full, drag.h - dy)), false);
    e.preventDefault();
  };
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return; // Tippen behandelt der Klick-Handler
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 350);
    const cur = el.getBoundingClientRect().height;
    const v = (cur - d.h) / Math.max(1, performance.now() - d.t); // px/ms, positiv = nach oben (Blatt wurde größer)
    const hs = heights();
    let target;
    if (v > 0.6) target = cur > hs.half ? 'full' : 'half';
    else if (v < -0.6) target = cur < hs.half ? 'peek' : 'half';
    else target = Object.entries(hs).sort((a, b) => Math.abs(a[1] - cur) - Math.abs(b[1] - cur))[0][0];
    set(target);
    e.preventDefault();
  };
  for (const zone of [handle, el.querySelector('header'), el.querySelector('.tabs')]) {
    zone?.addEventListener('pointerdown', start);
  }
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Tippen auf den Griff: eingeklappt → halb → voll → eingeklappt
  const cycle = () => set(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek');
  handle.addEventListener('click', () => !suppressClick && cycle());
  handle.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), cycle()));

  mq.addEventListener('change', reset);
  addEventListener('resize', () => mq.matches && set(state, false));
  requestAnimationFrame(reset);

  return {
    get isMobile() {
      return mq.matches;
    },
    get state() {
      return state;
    },
    /** Mindestens bis `min` aufziehen (z. B. Report öffnet → halb). */
    expand(min = 'half') {
      const order = ['peek', 'half', 'full'];
      if (order.indexOf(state) < order.indexOf(min)) set(min);
    },
    set,
  };
}
