// Bewertungslogik: pro Modul ein Wert 0..1, dann gewichteter Mittelwert.

/**
 * @param {number} dist  Distanz zum nächsten Treffer in Metern (Infinity = keiner gefunden)
 * @param {{mode:'near'|'far', distance:number}} s
 *   near: "soll nah sein" – bis `distance` volle Punktzahl, danach linearer Abfall bis 2×distance.
 *   far:  "soll weit weg sein" – ab `distance` volle Punktzahl, darunter linear ansteigend.
 */
export function moduleScore(dist, { mode, distance }) {
  if (mode === 'far') {
    if (dist >= distance) return 1;
    return Math.max(0, dist / distance);
  }
  if (dist <= distance) return 1;
  return Math.max(0, 1 - (dist - distance) / distance);
}

/**
 * Feinwert für Gleichstände: Bei zwei Lagen mit 100 % gewinnt die, bei der alles noch näher
 * bzw. Störendes noch weiter weg ist. 0..1, fließt nur minimal in den Score ein.
 */
export function comfort(dist, { mode, distance }) {
  if (mode === 'far') return Math.min(dist, distance * 2) / (distance * 2);
  return Math.max(0, 1 - dist / (distance * 2));
}

/** Ist die Bedingung eines Moduls komplett erfüllt? */
export function isSatisfied(dist, { mode, distance }) {
  return mode === 'far' ? dist >= distance : dist <= distance;
}

/**
 * Kombiniert Modulwerte.
 * @param {{score:number, weight:number, required:boolean, satisfied:boolean}[]} parts
 * @returns {number|null} 0..1 oder null, wenn eine Pflichtbedingung verletzt ist bzw. nichts gewichtet ist.
 */
export function combine(parts) {
  let sum = 0;
  let wsum = 0;
  for (const p of parts) {
    if (p.required && !p.satisfied) return null;
    if (p.weight <= 0) continue;
    sum += p.score * p.weight;
    wsum += p.weight;
  }
  if (wsum === 0) return parts.length ? 1 : null;
  return sum / wsum;
}

/** Wie combine(), aber als Sortierschlüssel mit Gleichstands-Auflösung über comfort. */
export function rankKey(parts, score) {
  if (score == null) return -1;
  let c = 0;
  let w = 0;
  for (const p of parts) {
    if (p.weight <= 0 || p.comfort == null) continue;
    c += p.comfort * p.weight;
    w += p.weight;
  }
  return score + (w ? c / w : 0) * 1e-3;
}

/** Farbskala rot → gelb → grün als [r,g,b]. */
export function scoreColor(score) {
  const stops = [
    [0, [215, 48, 31]],
    [0.5, [253, 216, 53]],
    [1, [26, 152, 80]],
  ];
  const s = Math.min(1, Math.max(0, score));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (s <= t1) {
      const t = (s - t0) / (t1 - t0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return stops.at(-1)[1];
}

/**
 * Wählt die besten Zellen aus, mit Mindestabstand zueinander, damit nicht 5× dieselbe Ecke erscheint.
 * @param {{lat:number, lon:number, score:number}[]} cells
 */
export function pickTopSpots(cells, count, minSeparation, distFn) {
  const sorted = cells.filter((c) => c.score != null).sort((a, b) => (b.rank ?? b.score) - (a.rank ?? a.score));
  const picked = [];
  for (const c of sorted) {
    if (picked.length >= count) break;
    if (picked.every((p) => distFn(p.lat, p.lon, c.lat, c.lon) >= minSeparation)) picked.push(c);
  }
  return picked;
}
