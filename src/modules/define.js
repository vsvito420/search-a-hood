/**
 * Ein Modul beschreibt EIN Kriterium für die Lagebewertung.
 *
 * @typedef {object} ModuleDef
 * @property {string} id            eindeutige ID
 * @property {string} name          Anzeigename
 * @property {string} category      Gruppe in der Seitenleiste
 * @property {string} color         Farbe der Marker
 * @property {string} [description] Erklärung (Tooltip)
 * @property {string[]} query       Overpass-Tag-Filter, z. B. '[amenity=fuel]'
 * @property {'point'|'line'} [geometry] 'line' für Straßen/Gleise (Abstand zur Linie)
 * @property {boolean} [supportsHours]   Kann nach "geöffnet zur gewählten Zeit" filtern
 * @property {boolean} [zone]       Radius um jeden Treffer als Kreis zeichnen (z. B. Bubatz-Sperrzone)
 * @property {(el:{tags:object}, ctx:object) => boolean} [filter] zusätzlicher Filter pro Treffer
 * @property {{enabled?:boolean, mode?:'near'|'far', distance?:number, weight?:number,
 *             required?:boolean, openAtTime?:boolean, showMarkers?:boolean, minCount?:number}} [defaults]
 *   minCount > 1: nicht der nächste, sondern der k-nächste Treffer zählt ("mind. 3 Supermärkte in 800 m")
 */

const BASE_DEFAULTS = {
  enabled: false,
  mode: 'near',
  distance: 500,
  weight: 1,
  required: false,
  openAtTime: false,
  showMarkers: true,
  minCount: 1,
};

/** @param {ModuleDef} def */
export function defineModule(def) {
  if (!def.id || !def.name || (def.kind !== 'target' && (!Array.isArray(def.query) || !def.query.length))) {
    throw new Error(`Ungültiges Modul: ${JSON.stringify(def)}`);
  }
  return {
    category: 'Sonstiges',
    color: '#607d8b',
    geometry: 'point',
    supportsHours: false,
    zone: false,
    description: '',
    query: [],
    unit: 'm',
    ...def,
    defaults: { ...BASE_DEFAULTS, ...def.defaults },
  };
}

/** Name eines OSM-Objekts für Popups. */
export function labelOf(tags, fallback) {
  return tags.name || tags.brand || tags.operator || fallback;
}

/** Öffentlich zugänglich? (access=private/no wird ignoriert) */
export const isPublic = (el) => !['private', 'no', 'customers'].includes(el.tags.access);
