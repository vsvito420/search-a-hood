import { defineModule } from './define.js';

export default defineModule({
  id: 'transit-bus',
  name: 'Bushaltestelle',
  category: 'Mobilität',
  color: '#48c9b0',
  query: ['[highway=bus_stop]'],
  defaults: { distance: 300, weight: 0.5 },
});
