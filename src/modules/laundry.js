import { defineModule } from './define.js';

export default defineModule({
  id: 'laundry',
  name: 'Waschsalon',
  category: 'Versorgung',
  color: '#26a69a',
  description: 'Für WG-Zimmer und Wohnungen ohne Waschmaschinenanschluss.',
  query: ['[shop=laundry]', '[shop=dry_cleaning][self_service=yes]'],
  supportsHours: true,
  defaults: { distance: 800, weight: 0.5 },
});
