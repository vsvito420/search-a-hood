import { defineModule } from './define.js';
import { isAlways } from '../core/hours.js';

export default defineModule({
  id: 'fuel-247',
  name: '24/7 Tankstelle',
  category: 'Nachts & Notfall',
  color: '#e67e22',
  description: 'Tankstellen mit opening_hours=24/7 – der Notfall-Späti für Kippen, Milch und Snacks um 3 Uhr.',
  query: ['[amenity=fuel]'],
  filter: (el) => isAlways(el.tags.opening_hours),
  defaults: { enabled: true, distance: 800 },
});
