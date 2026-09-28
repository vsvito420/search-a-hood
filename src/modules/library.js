import { defineModule } from './define.js';

export default defineModule({
  id: 'library',
  name: 'Bibliothek',
  category: 'Freizeit',
  color: '#8d6e63',
  query: ['[amenity=library]'],
  supportsHours: true,
  defaults: { distance: 1500, weight: 0.3 },
});
