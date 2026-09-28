import { defineModule } from './define.js';

export default defineModule({
  id: 'cinema',
  name: 'Kino / Theater',
  category: 'Freizeit',
  color: '#7e57c2',
  query: ['[amenity=cinema]', '[amenity=theatre]'],
  defaults: { distance: 1500, weight: 0.3 },
});
