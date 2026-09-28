import { defineModule } from './define.js';

export default defineModule({
  id: 'carsharing',
  name: 'Carsharing / Leihrad',
  category: 'Mobilität',
  color: '#5dade2',
  query: ['[amenity=car_sharing]', '[amenity=bicycle_rental]'],
  defaults: { distance: 400, weight: 0.5 },
});
