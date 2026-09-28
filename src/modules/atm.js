import { defineModule } from './define.js';

export default defineModule({
  id: 'atm',
  name: 'Geldautomat / Bank',
  category: 'Versorgung',
  color: '#546e7a',
  query: ['[amenity=atm]', '[amenity=bank][atm=yes]'],
  defaults: { distance: 600, weight: 0.3 },
});
