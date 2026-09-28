import { defineModule, isPublic } from './define.js';

/**
 * KCanG § 5: Kein öffentlicher Konsum in Sichtweite von Schulen, Kinder- und Jugendeinrichtungen,
 * Kinderspielplätzen und öffentlich zugänglichen Sportstätten. Keine Sichtweite mehr bei > 100 m.
 * (Fußgängerzonen 7–20 Uhr sind hier nicht abgebildet.)
 * Keine Rechtsberatung – OSM-Daten sind unvollständig und Sichtweite ist Auslegungssache.
 */
export default defineModule({
  id: 'bubatz',
  name: 'Bubatz-Zone (KCanG § 5)',
  category: 'Lifestyle',
  color: '#27ae60',
  description:
    'Abstand zu Schulen, Kitas, Spielplätzen, Jugendeinrichtungen und öffentlichen Sportstätten. ' +
    'Grün im Score = mehr als 100 m entfernt. Rote Kreise zeigen die Sperrzonen. Keine Rechtsberatung.',
  query: [
    '[amenity=school]',
    '[amenity=kindergarten]',
    '[leisure=playground]',
    '[amenity=community_centre][community_centre=youth_centre]',
    '[amenity=social_facility]["social_facility:for"~"juvenile|child"]',
    '[leisure=sports_centre]',
    '[leisure=stadium]',
    '[leisure=pitch]',
  ],
  filter: isPublic,
  zone: true,
  defaults: { mode: 'far', distance: 100, weight: 1 },
});
