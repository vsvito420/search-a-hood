# search-a-hood

Ein modulares OSINT-Tool, mit dem du **Wohnlagen nach deinen eigenen Kriterien** findest, auf Basis offener Daten aus OpenStreetMap.

> „Wo kann ich wohnen, ohne mir Sorgen zu machen, ob der Laden noch auf hat oder ob der Weg zu lang ist?“

Jedes Kriterium ist ein **Modul**, zum Beispiel die 24/7-Tankstelle in max. 800 m, ein Späti, der Sonntag um 23 Uhr noch offen hat, S-Bahn in der Nähe, mehr als 150 m bis zur Hauptstraße oder außerhalb der Bubatz-Sperrzonen (KCanG § 5). Die Module werden **übereinandergelegt**, gewichtet und als Heatmap über die Karte gelegt. Mit einem Klick auf einen Ort bekommst du einen Standort-Report.

## Schnellstart

```bash
npm start          # startet http://localhost:8080 (ohne Abhängigkeiten)
npm test           # Unit-Tests (node:test)
```

Da es eine rein statische Seite ist, läuft sie auch über GitHub Pages oder mit jedem anderen Static-Hoster.

1. Auf ein Viertel zoomen (max. ca. 60 km²)
2. Ein Preset wählen oder die Module einzeln einstellen
3. **„Sichtbares Gebiet analysieren“** klicken
4. Die Heatmap zeigt grün = passt, rot = passt nicht, grau = ein Pflichtkriterium ist verletzt
5. Auf die Karte oder auf einen Eintrag der Top-Lagen klicken, um den Report zu öffnen: nächster Treffer je Modul, Distanz und Gehminuten

## Wie die Bewertung funktioniert

Jedes Modul hat folgende Einstellungen:

| Einstellung    | Bedeutung |
|----------------|-----------|
| `nah dran ≤ X` | Bis X m gibt es 100 %, danach fällt der Wert linear auf 0 % bei 2·X |
| `weit weg ≥ X` | Ab X m gibt es 100 %, darunter steigt der Wert linear von 0 an |
| Gewicht 0–3    | Anteil am Gesamtscore (gewichteter Mittelwert) |
| Pflicht        | Ist das Kriterium nicht erfüllt, wird die Lage ausgeschlossen (grau) |
| nur geöffnet   | Zählt nur Treffer, die zum gewählten Zeitpunkt laut `opening_hours` geöffnet sind |

Das sichtbare Gebiet wird in ein Raster aus Zellen von ca. 50 m geteilt. Für jede Zelle wird über einen räumlichen Index der nächste Treffer je Modul gesucht. Straßen und Gleise werden als Linien behandelt, gemessen wird also der Abstand zur Linie und nicht zu ihrem Mittelpunkt.

## Mitgelieferte Module

| Kategorie        | Module |
|------------------|--------|
| Nachts & Notfall | 24/7-Tankstelle, Späti/Kiosk |
| Versorgung       | Supermarkt, Bäckerei, Paketstation/Post |
| Gesundheit       | Apotheke, Arztpraxis, Krankenhaus mit Notaufnahme |
| Mobilität        | S-/U-Bahn/Tram, Bus, Carsharing/Leihrad |
| Freizeit         | Park/Grün, Fitnessstudio |
| Familie          | Schule/Kita |
| Lifestyle        | Bubatz-Zone (100 m um Schulen, Kitas, Spielplätze, Jugendeinrichtungen, öffentliche Sportstätten) |
| Ruhe             | Kneipen & Clubs, Hauptstraßen und Bahngleise meiden |

Dazu kommen **eigene Module direkt in der UI** („➕ Eigenes Modul“) mit einem beliebigen Overpass-Filter, z. B. `[cuisine=kebab]` oder `[amenity=vending_machine][vending=cigarettes]`. Sie werden im Browser gespeichert.

## Ein neues Modul im Code anlegen

1. Eine Datei in `src/modules/` anlegen:

```js
// src/modules/doener.js
import { defineModule } from './define.js';

export default defineModule({
  id: 'doener',
  name: 'Dönerladen',
  category: 'Versorgung',
  color: '#c0392b',
  query: ['[amenity=fast_food][cuisine~"kebab"]'],   // Overpass-Tag-Filter
  supportsHours: true,                                // Filter "nur geöffnet" anbieten
  // filter: (el, ctx) => el.tags.diet_halal === 'yes', // optional: eigene Logik pro Treffer
  defaults: { enabled: false, mode: 'near', distance: 400, weight: 1 },
});
```

2. Das Modul in `src/modules/index.js` importieren und in `BUILTIN_MODULES` eintragen. Fertig.

Weitere Optionen: `geometry: 'line'` (Abstand zu Linien wie Straßen oder Flüssen) und `zone: true` (zeichnet den Radius um jeden Treffer, wie bei der Bubatz-Karte). Presets sind einfache Einstellungs-Pakete in `src/presets.js`.

## Architektur

```
index.html, styles.css
src/
  main.js                 Karte (Leaflet), Zustand, Laden → Filtern → Bewerten → Zeichnen
  presets.js              Einstellungs-Pakete
  core/
    overpass.js           Query-Builder, Abruf mit Fallback-Instanzen, Cache
    spatial-index.js      Hash-Grid für die Suche nach dem nächsten Nachbarn
    geo.js                Distanzen, Raster, Linien verdichten
    scoring.js            Score pro Modul, Kombination, Farbskala, Top-Spots
    analyzer.js           Bewertung von Punkten und Rastern (rein, testbar)
    hours.js              opening_hours-Auswertung (opening_hours.js wird lazy nachgeladen)
  modules/                ein Kriterium pro Datei, Registry in index.js
  ui/                     Seitenleiste und Popups
tests/                    node:test-Unit-Tests
```

## Ideen für weitere Module und Datenquellen

- Lärmkarten (EU-Umgebungslärmrichtlinie, oft als WMS der Länder verfügbar)
- Erreichbarkeit per ÖPNV in X Minuten (Isochronen über OpenTripPlanner oder Valhalla)
- Mietspiegel und Bodenrichtwerte (BORIS-D)
- Hochwasser-Risikogebiete (WMS der Länder)
- Glasfaser-/Breitbandatlas
- Fußgängerzonen für die Bubatz-Regel 7–20 Uhr

## Hinweise

- Die Daten stammen von © OpenStreetMap-Mitwirkenden (ODbL). Sie sind nicht vollständig. Vor allem `opening_hours` fehlt oft, und Treffer ohne Öffnungszeiten werden bei „nur geöffnet“ ignoriert.
- Nutze die öffentlichen Overpass- und Nominatim-Server fair: kleine Gebiete, keine automatisierten Massenabfragen.
- Die Bubatz-Zone ist eine Annäherung und **keine Rechtsberatung**. Wann „Sichtweite“ vorliegt, ist Auslegungssache.
