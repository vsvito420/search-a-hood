import { defineModule } from './define.js';

export default defineModule({
  id: 'spaeti',
  name: 'Späti / Kiosk',
  category: 'Nachts & Notfall',
  color: '#8e44ad',
  description: 'shop=convenience und shop=kiosk. Mit "nur geöffnet" siehst du, was zur gewählten Uhrzeit noch auf hat.',
  query: ['[shop=convenience]', '[shop=kiosk]'],
  supportsHours: true,
  defaults: { enabled: true, distance: 400 },
});
