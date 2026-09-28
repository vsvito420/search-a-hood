import { defineModule } from './define.js';

/**
 * Grünanteil: Wie viel Prozent der Fläche im Umkreis sind Park, Wald, Wiese, Kleingarten …?
 * Polygone werden gerastert (25 m) und per Summed-Area-Table ausgewertet (siehe core/share.js).
 */
export default defineModule({
  id: 'green-share',
  name: 'Grünanteil im Umkreis',
  category: 'Freizeit',
  color: '#43a047',
  description: 'Anteil von Parks, Wald, Wiesen, Kleingärten usw. in einem Quadrat von ±300 m. Mehr Grün = besseres Mikroklima, weniger Hitze im Sommer.',
  query: [
    '[leisure~"^(park|garden|nature_reserve|recreation_ground)$"][access!~"^(private|no)$"]',
    '[landuse~"^(forest|grass|meadow|village_green|allotments|recreation_ground|cemetery)$"]',
    '[natural~"^(wood|scrub|grassland|heath)$"]',
  ],
  geometry: 'area',
  unit: '%',
  shareRadius: 300,
  defaults: { mode: 'far', distance: 25, weight: 1, showMarkers: false },
});
