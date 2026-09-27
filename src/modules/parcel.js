import { defineModule } from './define.js';

export default defineModule({
  id: 'parcel',
  name: 'Paketstation / Post',
  category: 'Versorgung',
  color: '#f1c40f',
  query: ['[amenity=parcel_locker]', '[amenity=post_office]'],
  defaults: { distance: 500, weight: 0.5 },
});
