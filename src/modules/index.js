// Modul-Registry. Neues Kriterium = neue Datei + eine Zeile hier.
import { defineModule } from './define.js';
import { COMMUTE_MODES } from '../core/commute.js';
import fuel247 from './fuel-247.js';
import spaeti from './spaeti.js';
import supermarket from './supermarket.js';
import bakery from './bakery.js';
import parcel from './parcel.js';
import pharmacy from './pharmacy.js';
import doctors from './doctors.js';
import hospital from './hospital.js';
import transitRail from './transit-rail.js';
import transitBus from './transit-bus.js';
import carsharing from './carsharing.js';
import park from './park.js';
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
  gym,
  library,
  schoolKita,
  bubatz,
  bubatzPedestrian,
  nightlifeNoise,
  roadNoise,
  railNoise,
];

/** Eigene Module aus der UI (JSON) in echte Module umwandeln. */
export function customModule({ id, name, query, color, supportsHours, geometry }) {
  return defineModule({
    id,
    name,
    category: 'Eigene Module',
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
    name: `${m.icon} ${t.name}`,
    category: 'Meine Ziele',
    color: '#e91e63',
    description: `${m.label} zu „${t.name}“${t.mode === 'transit' ? `, Ankunft werktags ${t.arrive || '08:30'}` : ''}. Quelle: ${t.mode === 'transit' ? 'Transitous (MOTIS)' : 'FOSSGIS-OSRM'}.`,
    kind: 'target',
    unit: 'min',
    target: t,
    custom: true,
    defaults: { enabled: true, mode: 'near', distance: t.minutes || 20, weight: 2, showMarkers: false },
  });
}
