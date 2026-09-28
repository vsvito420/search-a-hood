import { defineModule } from './define.js';

export default defineModule({
  id: 'nightlife-noise',
  name: 'Kneipen & Clubs meiden',
  category: 'Ruhe',
  color: '#e74c3c',
  description: 'Bars, Pubs und Clubs – als "weit weg" gewertet, damit nachts Ruhe ist.',
  query: ['[amenity=bar]', '[amenity=pub]', '[amenity=nightclub]'],
  defaults: { mode: 'far', distance: 150, weight: 0.5 },
});
