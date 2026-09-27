import { defineModule } from './define.js';

export default defineModule({
  id: 'gym',
  name: 'Fitnessstudio',
  category: 'Freizeit',
  color: '#9b59b6',
  query: ['[leisure=fitness_centre]'],
  supportsHours: true,
  defaults: { distance: 1000, weight: 0.5 },
});
