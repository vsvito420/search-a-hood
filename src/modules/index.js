// Modul-Registry. Neues Kriterium = neue Datei + eine Zeile hier.
import { defineModule } from './define.js';
import { COMMUTE_MODES } from '../core/commute.js';
import fuel247 from './fuel-247.js';
import spaeti from './spaeti.js';
import supermarket from './supermarket.js';
import bakery from './bakery.js';
import parcel from './parcel.js';
import atm from './atm.js';
import laundry from './laundry.js';
import cinema from './cinema.js';
import pharmacy from './pharmacy.js';
import doctors from './doctors.js';
import hospital from './hospital.js';
import transitRail from './transit-rail.js';
import transitBus from './transit-bus.js';
import carsharing from './carsharing.js';
import park from './park.js';
import greenShare from './green-share.js';
import gym from './gym.js';
import schoolKita from './school-kita.js';
import bubatz from './bubatz.js';
import bubatzPedestrian from './bubatz-pedestrian.js';
import nightlifeNoise from './nightlife-noise.js';
import roadNoise from './road-noise.js';
import railNoise from './rail-noise.js';
import fibre from './fibre.js';
import cellTower from './cell-tower.js';
import hackerspace from './hackerspace.js';
import clubMate from './club-mate.js';
import coworking from './coworking.js';
import publicWifi from './public-wifi.js';
import electronics from './electronics.js';
import library from './library.js';
import evCharging from './ev-charging.js';
import lateFood from './late-food.js';

export const BUILTIN_MODULES = [
  fuel247,
  spaeti,
  lateFood,
  supermarket,
  bakery,
  parcel,
  atm,
  laundry,
  pharmacy,
  doctors,
  hospital,
  transitRail,
  transitBus,
  carsharing,
  evCharging,
  fibre,
  cellTower,
  publicWifi,
  coworking,
  hackerspace,
  clubMate,
  electronics,
  park,
  greenShare,
  gym,
  cinema,
  library,
  schoolKita,
  bubatz,
  bubatzPedestrian,
  nightlifeNoise,
  roadNoise,
  railNoise,
];

/** Symbol je Modul – für die Liste, den Report und die Befehlspalette. */
export const MODULE_ICONS = {
  'fuel-247': '⛽', spaeti: '🏪', 'late-food': '🥙', supermarket: '🛒', bakery: '🥐', parcel: '📦',
  atm: '🏧', laundry: '🧺', pharmacy: '💊', doctors: '🩺', hospital: '🏥', 'transit-rail': '🚇',
  'transit-bus': '🚌', carsharing: '🚲', 'ev-charging': '🔌', fibre: '🌐', 'cell-tower': '📡',
  'public-wifi': '📶', coworking: '💻', hackerspace: '🛠️', 'club-mate': '🧉', electronics: '🖥️',
  park: '🌳', 'green-share': '🌿', gym: '🏋️', cinema: '🎬', library: '📚', 'school-kita': '🏫',
  bubatz: '🥦', 'bubatz-pedestrian': '🚶', 'nightlife-noise': '🍻', 'road-noise': '🛣️', 'rail-noise': '🚆',
};
for (const m of BUILTIN_MODULES) m.icon = MODULE_ICONS[m.id] || '📍';

/** Eigene Module aus der UI (JSON) in echte Module umwandeln. */
export function customModule({ id, name, query, color, supportsHours, geometry }) {
  return defineModule({
    id,
    name,
    category: 'Eigene Module',
    icon: '🧩',
    color: color || '#34495e',
    query: Array.isArray(query) ? query : [query],
    supportsHours: !!supportsHours,
    geometry: geometry === 'line' ? 'line' : 'point',
    custom: true,
    defaults: { enabled: true },
  });
}

/** Persönliches Ziel (Arbeit, Uni, …) als Modul: Einheit Minuten, Daten kommen vom Routing statt von Overpass. */
export function targetModule(t) {
  const m = COMMUTE_MODES[t.mode] || COMMUTE_MODES.bike;
  return defineModule({
    id: `target-${t.id}`,
    name: t.name,
    category: 'Meine Ziele',
    color: '#e91e63',
    description: `${m.label} zu „${t.name}“${t.mode === 'transit' ? `, Ankunft werktags ${t.arrive || '08:30'}` : ''}. Quelle: ${t.mode === 'transit' ? 'Transitous (MOTIS)' : 'FOSSGIS-OSRM'}.`,
    kind: 'target',
    icon: m.icon,
    unit: 'min',
    target: t,
    custom: true,
    defaults: { enabled: true, mode: 'near', distance: t.minutes || 20, weight: 2, showMarkers: false },
  });
}
