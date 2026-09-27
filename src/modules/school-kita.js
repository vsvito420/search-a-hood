import { defineModule } from './define.js';

export default defineModule({
  id: 'school-kita',
  name: 'Schule / Kita',
  category: 'Familie',
  color: '#f39c12',
  query: ['[amenity=school]', '[amenity=kindergarten]'],
  defaults: { distance: 800 },
});
