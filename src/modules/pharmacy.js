import { defineModule } from './define.js';

export default defineModule({
  id: 'pharmacy',
  name: 'Apotheke',
  category: 'Gesundheit',
  color: '#27ae60',
  query: ['[amenity=pharmacy]'],
  supportsHours: true,
  defaults: { distance: 700 },
});
