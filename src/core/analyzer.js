import { makeGrid, haversine } from './geo.js';
import { moduleScore, isSatisfied, combine, pickTopSpots, comfort, rankKey } from './scoring.js';

/**
 * @typedef {object} ActiveLayer
 * @property {object} module   Moduldefinition
 * @property {object} settings { mode, distance, weight, required }
 * @property {import('./spatial-index.js').SpatialIndex} index
 */

/** Suchradius: weit genug, um Score und Feinwert (comfort) abzubilden. */
export const searchRadius = (s) => s.distance * 2;

/** Bewertet einen einzelnen Punkt gegen alle aktiven Layer. */
export function evaluatePoint(lat, lon, layers) {
  const parts = layers.map(({ module, settings, index }) => {
    const hit = index.nearest(lat, lon, searchRadius(settings));
    const dist = hit ? hit.dist : Infinity;
    return {
      module,
      settings,
      hit,
      dist,
      score: moduleScore(dist, settings),
      satisfied: isSatisfied(dist, settings),
      comfort: comfort(dist, settings),
      weight: settings.weight,
      required: settings.required,
    };
  });
  const score = combine(parts);
  return { parts, score, rank: rankKey(parts, score) };
}

/**
 * Rastert die Bounding-Box und bewertet jede Zelle.
 * @returns {{grid, scores: Float32Array (NaN = ausgeschlossen), top: object[]}}
 */
export function analyzeArea(bbox, layers, { cellMeters = 50, maxCells = 160, topCount = 5 } = {}) {
  const grid = makeGrid(bbox, cellMeters, maxCells);
  const scores = new Float32Array(grid.rows * grid.cols);
  const cells = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const { lat, lon } = grid.center(r, c);
      const { score, rank } = evaluatePoint(lat, lon, layers);
      scores[r * grid.cols + c] = score == null ? NaN : score;
      if (score != null) cells.push({ lat, lon, score, rank });
    }
  }
  const top = pickTopSpots(cells, topCount, 300, haversine);
  const valid = cells.length;
  return { grid, scores, top, coverage: valid / scores.length };
}
