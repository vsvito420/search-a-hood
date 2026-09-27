import { defineModule } from './define.js';

/**
 * OSM kennt Glasfaser nur als Indikator (Verteiler, Vermittlungsstellen, Muffen).
 * Verbindlich ist der Breitbandatlas der BNetzA → WMS-Overlay "Breitbandatlas" im Layer-Tab.
 */
export default defineModule({
  id: 'fibre',
  name: 'Glasfaser-Infrastruktur (OSM)',
  category: 'Internet & Tech',
  color: '#00bcd4',
  description:
    'Indikator: Telekom-Verteiler, Vermittlungsstellen und als Glasfaser getaggte Objekte in OSM. ' +
    'Lückenhaft – für echte Verfügbarkeit das Breitbandatlas-Overlay (Tab „Layer“) nutzen.',
  query: [
    '["telecom:medium"~"fibre|fiber"]',
    '[telecom=exchange]',
    '[telecom=connection_point]',
    '[telecom=service_device]',
    '[man_made=street_cabinet][street_cabinet=telecom]',
  ],
  defaults: { distance: 300, weight: 0.3 },
});
