import { defineModule } from './define.js';

export default defineModule({
  id: 'electronics',
  name: 'Elektronik / Computerladen',
  category: 'Internet & Tech',
  color: '#795548',
  description: 'Für das HDMI-Kabel, das man um 19:55 doch noch braucht.',
  query: ['[shop=computer]', '[shop=electronics]'],
  supportsHours: true,
  defaults: { distance: 1500, weight: 0.3 },
});
