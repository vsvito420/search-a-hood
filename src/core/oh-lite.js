// Kompakter Auswerter für die häufigsten OSM-opening_hours-Muster.
// Fallback, falls opening_hours.js (vollständig, aber groß) nicht geladen werden kann.
//
// Unterstützt:  24/7 · Mo-Fr 08:00-20:00 · Mo,We,Fr 10:00-12:00,14:00-18:00 · Sa 22:00-02:00 (über Mitternacht)
//               Su off · 08:00-18:00 (ohne Tage = täglich) · Mo-Sa (ohne Zeit = ganztags) · 18:00+ (open end)
//               Regeln mit ";" (spätere überschreiben frühere für ihre Tage) und ", " (ergänzend)
// Nicht unterstützt (→ null = unbekannt): Monate/Daten, Wochen, sunrise/sunset, Mo[1] …
// PH/SH-Regeln werden ignoriert (Feiertage sind hier nicht modelliert).

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // Index = Date#getDay()
const DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const WD_RE = new RegExp(`^${DAY_RE}(?:-${DAY_RE})?(?:,${DAY_RE}(?:-${DAY_RE})?)*$`);
const TIME_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$|^(\d{1,2}):(\d{2})\+$/;

function parseDays(sel) {
  const days = new Set();
  for (const part of sel.split(',')) {
    const [a, b] = part.split('-').map((d) => DAYS.indexOf(d));
    if (b === undefined) days.add(a);
    else for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return days;
}

function parseTimes(sel) {
  const spans = [];
  for (const t of sel.split(',')) {
    const m = t.trim().match(TIME_RE);
    if (!m) return null;
    if (m[5] !== undefined) {
      spans.push([+m[5] * 60 + +m[6], 24 * 60]); // "18:00+" → bis Mitternacht
      continue;
    }
    const start = +m[1] * 60 + +m[2];
    let end = +m[3] * 60 + +m[4];
    if (start > 24 * 60 || end > 48 * 60) return null;
    if (end <= start) end += 24 * 60; // über Mitternacht
    spans.push([start, end]);
  }
  return spans;
}

/** Zerlegt einen Wert in Regeln: [{days:Set|null, spans:[[a,b]]|[], additive:boolean}] oder null. */
export function parseOpeningHours(value) {
  if (typeof value !== 'string') return null;
  const v = value.replace(/"[^"]*"/g, '').trim(); // Kommentare entfernen
  if (!v) return null;
  if (/^24\/7$/.test(v)) return [{ days: null, spans: [[0, 24 * 60]], additive: false }];
  const rules = [];
  for (const chunk of v.split(/\s*;\s*/)) {
    if (!chunk) continue;
    // ", " vor einem Wochentag/PH startet eine ergänzende Regel
    const parts = chunk.split(/(?<=\d|\+|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/);
    for (const [j, p] of parts.entries()) {
      let rest = p.trim();
      if (/^(PH|SH)\b/.test(rest)) continue; // Feiertage ignorieren
      rest = rest.replace(/,\s*(PH|SH)\b/g, ''); // "Mo-Fr,PH 10:00-12:00" → PH-Anteil ignorieren
      let days = null;
      const first = rest.split(/\s+/)[0];
      if (WD_RE.test(first)) {
        days = parseDays(first);
        rest = rest.slice(first.length).trim();
      }
      let spans;
      if (rest === '' && days) spans = [[0, 24 * 60]];
      else if (/^(off|closed)$/i.test(rest)) spans = [];
      else if (/^24\/7$/.test(rest)) spans = [[0, 24 * 60]];
      else spans = parseTimes(rest.replace(/\s+/g, ''));
      if (!spans) return null;
      rules.push({ days, spans, additive: j > 0 });
    }
  }
  return rules.length ? rules : null;
}

/** Wochenplan: 7 Listen von [start,end) in Minuten, Überlauf nach Mitternacht in den Folgetag. */
export function weekSchedule(rules) {
  const week = Array.from({ length: 7 }, () => []);
  for (const r of rules) {
    const days = r.days ? [...r.days] : [0, 1, 2, 3, 4, 5, 6];
    for (const d of days) {
      if (!r.additive) week[d] = [];
      week[d].push(...r.spans);
    }
  }
  // Überlauf (z. B. Fr 22:00-02:00 → Sa 00:00-02:00)
  const out = week.map((spans) => spans.map(([a, b]) => [a, Math.min(b, 24 * 60)]));
  week.forEach((spans, d) => {
    for (const [, b] of spans) if (b > 24 * 60) out[(d + 1) % 7].push([0, b - 24 * 60]);
  });
  return out;
}

const cache = new Map();

/** @returns {boolean|null} */
export function isOpenLite(value, date) {
  let week = cache.get(value);
  if (week === undefined) {
    const rules = parseOpeningHours(value);
    week = rules ? weekSchedule(rules) : null;
    cache.set(value, week);
  }
  if (!week) return null;
  const minute = date.getHours() * 60 + date.getMinutes();
  return week[date.getDay()].some(([a, b]) => minute >= a && minute < b);
}
