import { defineModule } from './define.js';

export default defineModule({
  id: 'ev-charging',
  name: 'E-Ladesäule',
  category: 'Mobilität',
  color: '#4caf50',
  query: ['[amenity=charging_station]'],
  defaults: { distance: 500, weight: 0.5 },
});
