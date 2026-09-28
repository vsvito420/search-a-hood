import { defineModule } from './define.js';

export default defineModule({
  id: 'park',
  name: 'Park / Grünfläche',
  category: 'Freizeit',
  color: '#2ecc71',
  query: ['[leisure=park]', '[landuse=forest][access!=private]'],
  defaults: { distance: 500 },
});
