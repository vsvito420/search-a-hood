// Modul-Registry. Neues Kriterium = neue Datei + eine Zeile hier.
import { defineModule } from './define.js';
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
import nightlifeNoise from './nightlife-noise.js';
import roadNoise from './road-noise.js';
import railNoise from './rail-noise.js';

export const BUILTIN_MODULES = [
  fuel247,
  spaeti,
  supermarket,
  bakery,
  parcel,
  pharmacy,
  doctors,
  hospital,
  transitRail,
  transitBus,
  carsharing,
  park,
  gym,
  schoolKita,
  bubatz,
  nightlifeNoise,
  roadNoise,
  railNoise,
];

/** Eigene Module aus der UI (JSON) in echte Module umwandeln. */
export function customModule({ id, name, query, color, supportsHours }) {
  return defineModule({
    id,
    name,
    category: 'Eigene Module',
    color: color || '#34495e',
    query: Array.isArray(query) ? query : [query],
    supportsHours: !!supportsHours,
    custom: true,
    defaults: { enabled: true },
  });
}
