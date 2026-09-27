// Geometrie-Helfer. Alles in Metern, WGS84-Koordinaten.

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;

/** Großkreis-Distanz in Metern. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Meter pro Grad in Nord-Süd- bzw. Ost-West-Richtung auf Breite `lat`. */
export function metersPerDegree(lat) {
  return { lat: 111_320, lon: 111_320 * Math.cos(toRad(lat)) };
}

/** Fläche einer Bounding-Box in km². bbox = {south, west, north, east} */
export function bboxAreaKm2({ south, west, north, east }) {
  const m = metersPerDegree((south + north) / 2);
  return ((north - south) * m.lat * (east - west) * m.lon) / 1e6;
}

/**
 * Verdichtet eine Linie, sodass zwischen zwei Punkten höchstens `step` Meter liegen.
 * Damit lässt sich der Abstand zu Straßen/Gleisen über den Punkt-Index annähern.
 */
export function densify(coords, step = 25) {
  if (coords.length < 2) return coords.slice();
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    const n = Math.floor(d / step);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
    }
    out.push(b);
  }
  return out;
}

/**
 * Raster über eine Bounding-Box. Zellgröße in Metern, begrenzt auf `maxCells` pro Achse.
 */
export function makeGrid(bbox, cellMeters = 50, maxCells = 160) {
  const m = metersPerDegree((bbox.south + bbox.north) / 2);
  const heightM = (bbox.north - bbox.south) * m.lat;
  const widthM = (bbox.east - bbox.west) * m.lon;
  const rows = Math.max(1, Math.min(maxCells, Math.round(heightM / cellMeters)));
  const cols = Math.max(1, Math.min(maxCells, Math.round(widthM / cellMeters)));
  const latStep = (bbox.north - bbox.south) / rows;
  const lonStep = (bbox.east - bbox.west) / cols;
  return {
    rows,
    cols,
    latStep,
    lonStep,
    bbox,
    /** Mittelpunkt der Zelle (row 0 = Norden). */
    center(row, col) {
      return { lat: bbox.north - (row + 0.5) * latStep, lon: bbox.west + (col + 0.5) * lonStep };
    },
  };
}

/** Vergrößert eine Bounding-Box um `meters` in alle Richtungen. */
export function padBbox(bbox, meters) {
  const m = metersPerDegree((bbox.south + bbox.north) / 2);
  const dLat = meters / m.lat;
  const dLon = meters / m.lon;
  return { south: bbox.south - dLat, west: bbox.west - dLon, north: bbox.north + dLat, east: bbox.east + dLon };
}
