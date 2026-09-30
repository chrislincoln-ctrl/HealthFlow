import districtsGeo from './wbDistrictsGeo.json';
import { NETWORK_GEO } from './networkGeo';

export type GeoFeature = {
  type: 'Feature';
  properties: { id: string; name: string };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
};

export type FeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

/** The 6 demo districts as a real FeatureCollection (2011 boundaries, 10KB). */
export const WB_GEO: FeatureCollection = districtsGeo as unknown as FeatureCollection;

/**
 * True-aspect equirectangular projection into a clean viewBox: geometry fills
 * [0..width] × [0..height] edge-to-edge with ZERO internal padding — fit
 * padding is the renderer's job (NetworkMap computes it from the real
 * container size), never baked in here. Previously the geometry was inset by
 * 8 units AND the viewBox added another 5%/3.5%, which double-taxed the map
 * and left it as a small cluster in a big canvas.
 *
 * Height is normalized to 100; width follows the true geographic aspect
 * (longitude span scaled by the mid-latitude cosine), so West Bengal's real
 * tall-narrow shape is preserved exactly.
 */
const lons: number[] = [];
const lats: number[] = [];
for (const f of WB_GEO.features) {
  for (const poly of f.geometry.coordinates) {
    for (const ring of poly) {
      for (const c of ring) {
        lons.push(c[0]);
        lats.push(c[1]);
      }
    }
  }
}
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const k = 1 / Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);

export const GEO_VIEWBOX = {
  minX: 0,
  minY: 0,
  height: 100,
  width: 100 * ((maxLon - minLon) / ((maxLat - minLat) * k)),
};

export function projectPoint(lon: number, lat: number): { x: number; y: number } {
  return {
    x: ((lon - minLon) / (maxLon - minLon)) * GEO_VIEWBOX.width,
    y: GEO_VIEWBOX.height - ((lat - minLat) / (maxLat - minLat)) * GEO_VIEWBOX.height,
  };
}

/** Pre-projected ring paths, one `d` string per district id. */
export const DISTRICT_PATHS: Record<string, string> = Object.fromEntries(
  WB_GEO.features.map((f) => {
    const d = f.geometry.coordinates
      .map(
        (poly) =>
          poly
            .map(
              (ring) =>
                'M' +
                ring
                  .map((c) => {
                    const p = projectPoint(c[0], c[1]);
                    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
                  })
                  .join('L') +
                'Z',
            )
            .join(' '),
      )
      .join(' ');
    return [f.properties.id, d];
  }),
);

/**
 * NODE_POS: the renderer-facing positions — REAL projected centroids plus the
 * label-side hint from networkGeo.ts. This is the import every map consumer
 * already uses, so the swap is additive: same symbol, real geometry.
 */export const NODE_POS: Record<
  string,
  { x: number; y: number } & { dx: number; dy: number; textAlign: 'start' | 'middle' | 'end'; subDx?: number; subDy?: number }
> = Object.fromEntries(
  NETWORK_GEO.map((n) => [n.id, { ...projectPoint(n.approx.long, n.approx.lat), ...n.label }]),
);

export { NETWORK_GEO };
