// Kleine Icon-Sammlung (Stil und Pfade angelehnt an Lucide, ISC-Lizenz) – inline, ohne Abhängigkeit.
// Verwendung im HTML: <i data-icon="search"></i> → wird beim Start durch ein SVG ersetzt.

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  crosshair: '<circle cx="12" cy="12" r="9"/><path d="M21 12h-4M7 12H3M12 7V3M12 21v-4"/>',
  timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  locate: '<path d="M2 12h3M19 12h3M12 2v3M12 19v3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 21a9 9 0 0 0 0-18z" fill="currentColor"/>',
};

export function iconSvg(name, size = 18) {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** Ersetzt alle <i data-icon="…"> im Dokument durch SVGs. */
export function applyIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    el.outerHTML = iconSvg(el.dataset.icon, +el.dataset.size || 18);
  });
}
