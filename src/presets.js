// Presets sind nur Einstellungs-Pakete für Module – beliebig erweiterbar.
export const PRESETS = [
  {
    id: 'informatiker',
    name: '🧑‍💻 Informatiker',
    overlays: ['breitbandatlas'],
    description: 'Breitbandatlas-Overlay, Club-Mate, Hackerspace, Späti & Döner nachts offen, Bahn nah, Ruhe vor Clubs und Hauptstraßen.',
    modules: {
      fibre: { enabled: true, distance: 250, weight: 0.3 },
      'transit-rail': { enabled: true, distance: 600, weight: 1.5 },
      spaeti: { enabled: true, distance: 400, weight: 1.5, openAtTime: true },
      'late-food': { enabled: true, distance: 500, weight: 1, openAtTime: true },
      'club-mate': { enabled: true, distance: 800, weight: 0.3 },
      hackerspace: { enabled: true, distance: 2500, weight: 0.5 },
      supermarket: { enabled: true, distance: 500, weight: 1 },
      parcel: { enabled: true, distance: 400, weight: 1 },
      'road-noise': { enabled: true, distance: 120, weight: 1 },
      'nightlife-noise': { enabled: true, distance: 100, weight: 0.5 },
    },
  },
  {
    id: 'nachteule',
    name: '🌙 Nachteule',
    description: '24/7-Tanke, Späti mit Öffnungszeit-Check, Bahn in der Nähe.',
    modules: {
      'fuel-247': { enabled: true, distance: 800, weight: 2 },
      spaeti: { enabled: true, distance: 400, weight: 2, openAtTime: true },
      'transit-rail': { enabled: true, distance: 600, weight: 1 },
      supermarket: { enabled: true, distance: 600, weight: 1 },
    },
  },
  {
    id: 'ruhig',
    name: '🌿 Ruhig & grün',
    description: 'Weg von Hauptstraßen, Gleisen und Clubs, Park in der Nähe.',
    modules: {
      park: { enabled: true, distance: 400, weight: 2 },
      'road-noise': { enabled: true, distance: 200, weight: 2 },
      'rail-noise': { enabled: true, distance: 200, weight: 1 },
      'nightlife-noise': { enabled: true, distance: 200, weight: 1 },
      supermarket: { enabled: true, distance: 800, weight: 1 },
    },
  },
  {
    id: 'bubatz',
    name: '🥦 Bubatz-freundlich',
    description: 'Außerhalb der 100-m-Zonen und (7–20 Uhr) der Fußgängerzonen – Pflicht. Späti & Tanke nah. Zeitraffer zeigt Tag/Nacht.',
    modules: {
      bubatz: { enabled: true, distance: 100, weight: 2, required: true },
      'bubatz-pedestrian': { enabled: true, distance: 15, weight: 1, required: true },
      spaeti: { enabled: true, distance: 500, weight: 1 },
      'fuel-247': { enabled: true, distance: 1000, weight: 1 },
      park: { enabled: true, distance: 600, weight: 1 },
    },
  },
  {
    id: 'familie',
    name: '👨‍👩‍👧 Familie',
    description: 'Schule/Kita, Arzt, Apotheke, Supermarkt, Park – ohne Hauptstraße.',
    modules: {
      'school-kita': { enabled: true, distance: 600, weight: 2 },
      doctors: { enabled: true, distance: 800, weight: 1 },
      pharmacy: { enabled: true, distance: 800, weight: 1 },
      supermarket: { enabled: true, distance: 500, weight: 1 },
      park: { enabled: true, distance: 500, weight: 1 },
      'road-noise': { enabled: true, distance: 150, weight: 1 },
    },
  },
];
