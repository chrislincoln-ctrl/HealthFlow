/**
 * One-off build script (node scripts/build-wb-geo.mjs)
 * Reads ./wb.geojson, keeps the 6 demo districts, simplifies polygons
 * (Douglas-Peucker), rounds coordinates, and writes:
 *   src/data/wbDistrictsGeo.json  — compact FeatureCollection
 *   printed centroids for networkGeo.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const WANT = {
  'Nadia': 'nadia',
  'Howrah': 'howrah',
  'Kolkata': 'kolkata',
  'Malda': 'malda',
  'Hooghly': 'hooghly',
  'North 24 Parganas': 'north24pgs',
};

const src = JSON.parse(readFileSync('./wb.geojson', 'utf8'));

// ---- Douglas-Peucker (per ring) ----
function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(x - cx, y - cy);
}
function simplify(points, tol) {
  if (points.length <= 4) return points;
  let maxD = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [a, b];
  const left = simplify(points.slice(0, idx + 1), tol);
  const right = simplify(points.slice(idx), tol);
  return [...left.slice(0, -1), ...right];
}
const round = (n) => Math.round(n * 1000) / 1000;
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
};
function polygonCentroid(poly) {
  // Vertex-average centroid of the outer ring — winding-independent and
  // stable under simplification; perfectly adequate as a node anchor.
  const ring = poly[0];
  let sx = 0, sy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  const n = Math.max(1, ring.length - 1);
  return [sx / n, sy / n];
}

const TOL = 0.012; // degrees — aggressive but keeps recognizable shapes
const features = [];
const centroids = {};

for (const f of src.features) {
  const name = f.properties.district;
  const id = WANT[name];
  if (!id) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Drop tiny islands below 0.005 deg² — keeps the mainland shape
  const kept = polys
    .map((poly) => poly.map((ring, ri) => (ri === 0 ? simplify(ring, TOL) : ring)))
    .filter((poly) => Math.abs(ringArea(poly[0])) > 0.005);
  if (!kept.length) continue;
  const c = polygonCentroid(kept[0]);
  centroids[id] = { name, lat: round(c[1]), long: round(c[0]) };
  features.push({
    type: 'Feature',
    properties: { id, name },
    geometry: {
      type: 'MultiPolygon',
      coordinates: kept.map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)]))),
    },
  });
}

if (features.length !== 6) {
  console.error('MISSING DISTRICTS. Available names:', [...new Set(src.features.map((f) => f.properties.district))].join(', '));
  process.exit(1);
}

const out = { type: 'FeatureCollection', features };
writeFileSync('src/data/wbDistrictsGeo.json', JSON.stringify(out));
console.log('Wrote', (JSON.stringify(out).length / 1024).toFixed(1) + 'KB,', features.length, 'districts');
console.log(JSON.stringify(centroids, null, 2));
