import { defineModule } from './define.js';

export default defineModule({
  id: 'supermarket',
  name: 'Supermarkt',
  category: 'Versorgung',
  color: '#2980b9',
  query: ['[shop=supermarket]'],
  supportsHours: true,
  defaults: { enabled: true, distance: 500, weight: 1.5 },
});
