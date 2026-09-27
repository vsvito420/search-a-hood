import { defineModule } from './define.js';

/**
 * KCanG § 5 Abs. 2 Nr. 5: kein Konsum in Fußgängerzonen zwischen 7 und 20 Uhr.
 * Zeitabhängig → reagiert auf den gewählten Zeitpunkt und den Wochen-Zeitraffer.
 * Gemessen wird der Abstand zur Mittellinie/zum Rand der Fußgängerzone (≈ 15 m = "drin").
 */
export default defineModule({
  id: 'bubatz-pedestrian',
  name: 'Bubatz: Fußgängerzone 7–20 Uhr',
  category: 'Lifestyle',
  color: '#ab47bc',
  description:
    'Fußgängerzonen (highway=pedestrian) zählen nur zwischen 7 und 20 Uhr als Sperrzone – Zeitpunkt oder Zeitraffer ändern. Keine Rechtsberatung.',
  query: ['[highway=pedestrian]'],
  geometry: 'line',
  filter: (el, { time }) => {
    const h = time.getHours();
    return h >= 7 && h < 20;
  },
  defaults: { mode: 'far', distance: 15, weight: 1 },
});
