import { defineModule } from './define.js';

export default defineModule({
  id: 'cell-tower',
  name: 'Mobilfunkmast',
  category: 'Internet & Tech',
  color: '#607d8b',
  description: 'Masten/Türme mit tower:type=communication. „nah“ = guter Empfang, „weit weg“ für Strahlungs-Vorsichtige.',
  query: [
    '[man_made=mast]["tower:type"=communication]',
    '[man_made=tower]["tower:type"=communication]',
    '["communication:mobile_phone"=yes]',
  ],
  defaults: { distance: 800, weight: 0.5 },
});
