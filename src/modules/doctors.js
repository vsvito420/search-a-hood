import { defineModule } from './define.js';

export default defineModule({
  id: 'doctors',
  name: 'Arztpraxis',
  category: 'Gesundheit',
  color: '#16a085',
  query: ['[amenity=doctors]', '[healthcare=doctor]'],
  supportsHours: true,
  defaults: { distance: 800 },
});
