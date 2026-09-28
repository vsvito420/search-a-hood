import { defineModule } from './define.js';

export default defineModule({
  id: 'transit-rail',
  name: 'S-/U-Bahn, Tram, Bahnhof',
  category: 'Mobilität',
  color: '#1abc9c',
  query: ['[railway=station]', '[railway=halt]', '[railway=tram_stop]', '[station=subway]'],
  defaults: { enabled: true, distance: 600, weight: 1.5 },
});
