import { defineModule } from './define.js';

export default defineModule({
  id: 'hackerspace',
  name: 'Hackerspace / Makerspace',
  category: 'Internet & Tech',
  color: '#ff5722',
  description: 'leisure=hackerspace – CCC-Erfas, Makerspaces, FabLabs.',
  query: ['[leisure=hackerspace]', '[club=computer]'],
  defaults: { distance: 2500, weight: 0.5 },
});
