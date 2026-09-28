import { defineModule } from './define.js';

export default defineModule({
  id: 'rail-noise',
  name: 'Bahngleise meiden',
  category: 'Ruhe',
  color: '#95a5a6',
  query: ['[railway~"^(rail|light_rail)$"][service!~"."]'],
  geometry: 'line',
  defaults: { mode: 'far', distance: 150, weight: 0.5 },
});
