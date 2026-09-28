import { defineModule } from './define.js';

export default defineModule({
  id: 'late-food',
  name: 'Imbiss / Döner',
  category: 'Nachts & Notfall',
  color: '#ff7043',
  description: 'fast_food – mit „nur geöffnet“ + Uhrzeit 2 Uhr nachts wird es spannend.',
  query: ['[amenity=fast_food]'],
  supportsHours: true,
  defaults: { distance: 500, weight: 0.5 },
});
