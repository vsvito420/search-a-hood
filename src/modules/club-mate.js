import { defineModule } from './define.js';

export default defineModule({
  id: 'club-mate',
  name: 'Club-Mate erhältlich',
  category: 'Internet & Tech',
  color: '#fbc02d',
  description: 'Orte mit drink:club-mate=* in OSM. Überlebenswichtig.',
  query: ['["drink:club-mate"~"yes|retail|served|bottle"]'],
  supportsHours: true,
  defaults: { distance: 800, weight: 0.5 },
});
