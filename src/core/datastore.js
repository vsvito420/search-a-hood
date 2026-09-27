import { buildCombinedQuery, classify, runQuery } from './overpass.js';

export const bboxKey = (b) => [b.south, b.west, b.north, b.east].map((v) => v.toFixed(4)).join(',');

/**
 * Hält die OSM-Daten pro Modul für EIN Gebiet.
 * Fehlende Module werden gebündelt in einer Abfrage geholt; schlägt die fehl,
 * wird einzeln nachgeladen, damit ein kaputtes Modul nicht alle anderen blockiert.
 */
export class DataStore {
  constructor({ run = runQuery } = {}) {
    this.run = run;
    this.key = null;
    this.bbox = null;
    this.entries = new Map(); // moduleId -> {elements} | {error}
  }

  setArea(bbox) {
    const key = bboxKey(bbox);
    if (key !== this.key) {
      this.key = key;
      this.bbox = bbox;
      this.entries.clear();
    }
  }

  get(id) {
    return this.entries.get(id);
  }

  has(id) {
    const e = this.entries.get(id);
    return !!e && !e.error;
  }

  drop(id) {
    this.entries.delete(id);
  }

  /** Lädt alles, was für `modules` noch fehlt. */
  async ensure(modules, { onProgress, signal } = {}) {
    if (!this.bbox) throw new Error('Kein Gebiet gesetzt');
    const missing = modules.filter((m) => !this.has(m.id));
    if (!missing.length) return;
    const key = this.key;
    onProgress?.(`Lade ${missing.length} Modul${missing.length > 1 ? 'e' : ''} in einer Abfrage …`);
    try {
      const elements = await this.run(buildCombinedQuery(missing, this.bbox), { signal });
      if (key !== this.key) return;
      for (const [id, els] of classify(elements, missing)) this.entries.set(id, { elements: els });
    } catch (err) {
      if (signal?.aborted || missing.length === 1) {
        if (key === this.key) this.entries.set(missing[0].id, { error: err.message });
        if (missing.length === 1) return;
        throw err;
      }
      // Einzeln nachladen
      for (let i = 0; i < missing.length; i++) {
        const m = missing[i];
        onProgress?.(`Sammelabfrage fehlgeschlagen – lade einzeln: ${m.name} (${i + 1}/${missing.length})`);
        try {
          const els = await this.run(buildCombinedQuery([m], this.bbox), { signal });
          if (key === this.key) this.entries.set(m.id, { elements: classify(els, [m]).get(m.id) });
        } catch (e) {
          if (key === this.key) this.entries.set(m.id, { error: e.message });
        }
      }
    }
  }
}
