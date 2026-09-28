import { defineModule } from './define.js';

export default defineModule({
  id: 'road-noise',
  name: 'Hauptstraßen meiden',
  category: 'Ruhe',
  color: '#7f8c8d',
  description: 'Abstand zu Autobahn, Bundes- und Hauptstraßen (Lärm, Abgase).',
  query: ['[highway~"^(motorway|trunk|primary)$"]'],
  geometry: 'line',
  defaults: { mode: 'far', distance: 150, weight: 1 },
});
