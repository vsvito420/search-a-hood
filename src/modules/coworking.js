import { defineModule } from './define.js';

export default defineModule({
  id: 'coworking',
  name: 'Coworking / Café mit WLAN',
  category: 'Internet & Tech',
  color: '#3f51b5',
  query: ['[amenity=coworking_space]', '[office=coworking]', '[amenity=cafe][internet_access~"wlan|yes|wifi"]'],
  supportsHours: true,
  defaults: { distance: 800, weight: 0.5 },
});
