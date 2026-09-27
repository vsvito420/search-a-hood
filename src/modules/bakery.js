import { defineModule } from './define.js';

export default defineModule({
  id: 'bakery',
  name: 'Bäckerei',
  category: 'Versorgung',
  color: '#d35400',
  query: ['[shop=bakery]'],
  supportsHours: true,
  defaults: { distance: 400, weight: 0.5 },
});
