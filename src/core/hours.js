// Öffnungszeiten-Auswertung über die opening_hours.js-Bibliothek (lazy geladen).
// Ohne Bibliothek werden nur die eindeutigen Fälle "24/7" / "off" erkannt.

const LIB_URL = 'https://cdn.jsdelivr.net/npm/opening_hours@3.15.0/+esm';
let OpeningHours = null;
const parsed = new Map();

export async function loadHoursLib() {
  if (OpeningHours) return true;
  try {
    const mod = await import(LIB_URL);
    OpeningHours = mod.default || mod.opening_hours;
    return true;
  } catch (e) {
    console.warn('opening_hours.js nicht geladen – nur einfache Auswertung', e);
    return false;
  }
}

export function isAlways(value) {
  return typeof value === 'string' && /^\s*24\/7\s*$/.test(value);
}

/**
 * @returns {boolean|null} true = offen, false = zu, null = unbekannt
 */
export function isOpenAt(value, date) {
  if (!value) return null;
  if (isAlways(value)) return true;
  if (/^\s*(off|closed)\s*$/i.test(value)) return false;
  if (!OpeningHours) return null;
  let oh = parsed.get(value);
  if (oh === undefined) {
    try {
      // Land/Bundesland für Feiertage (PH). Grob: Deutschland.
      oh = new OpeningHours(value, { lat: 51, lon: 10, address: { country_code: 'de', state: '' } }, { mode: 0 });
    } catch {
      oh = null;
    }
    parsed.set(value, oh);
  }
  if (!oh) return null;
  try {
    return oh.getState(date);
  } catch {
    return null;
  }
}
