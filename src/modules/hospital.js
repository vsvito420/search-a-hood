import { defineModule } from './define.js';

export default defineModule({
  id: 'hospital',
  name: 'Krankenhaus mit Notaufnahme',
  category: 'Gesundheit',
  color: '#c0392b',
  query: ['[amenity=hospital][emergency=yes]'],
  defaults: { distance: 3000, weight: 0.5 },
});
