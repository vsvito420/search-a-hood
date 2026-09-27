import { defineModule } from './define.js';

export default defineModule({
  id: 'public-wifi',
  name: 'Freies WLAN / Freifunk',
  category: 'Internet & Tech',
  color: '#009688',
  description: 'internet_access=wlan ohne Gebühr – Backup, wenn der Anschluss mal wieder hängt.',
  query: ['[internet_access=wlan]["internet_access:fee"!~"yes|customers"]'],
  defaults: { distance: 400, weight: 0.3 },
});
