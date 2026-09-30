/**
 * Network node metadata — the single source of truth tying each demo district
 * to its real geographic anchor. Every screen that renders the network map
 * imports positions through here (via networkProjection), so Command Center
 * and Redistribution always read as the same place.
 *
 * `approx` holds the REAL centroid of each district, computed from the
 * 2011-boundary GeoJSON (wbDistrictsGeo.json) by scripts/build-wb-geo.mjs and
 * projected by networkProjection.ts.
 *
 * `label` is a curated annotation offset (in viewBox units, from the marker
 * center) chosen once so the five close-together southern districts never
 * collide: two-line labels (name / STATUS · score) sit clearly apart at every
 * supported zoom level. x anchor + textAlign place the block left/right of
 * the point; dy lifts it above/below.
 */
export interface NetworkGeoNode {
  id: string;
  name: string;
  state: string;
  /** Real district centroid (lat/long) — computed, not hand-placed. */
  approx: { lat: number; long: number };
  /** Curated label-block offset + anchoring, collision-free for this layout. */
  label: {
    dx: number;
    dy: number;
    textAlign: 'start' | 'middle' | 'end';
    subDx?: number;
    subDy?: number;
  };
}

export const NETWORK_GEO: NetworkGeoNode[] = [
  {
    id: 'malda',
    name: 'Malda',
    state: 'West Bengal',
    approx: { lat: 25.189, long: 88.134 },
    label: { dx: 4.4, dy: 1.6, textAlign: 'start', subDy: 3.2 },
  },
  {
    id: 'nadia',
    name: 'Nadia',
    state: 'West Bengal',
    approx: { lat: 23.53, long: 88.523 },
    label: { dx: 4.8, dy: 2.2, textAlign: 'start', subDy: 3.4 },
  },
  {
    id: 'north24pgs',
    name: 'N. 24 Parganas',
    state: 'West Bengal',
    approx: { lat: 22.729, long: 88.771 },
    label: { dx: 4.4, dy: -2.6, textAlign: 'start', subDy: 3.2 },
  },
  {
    id: 'hooghly',
    name: 'Hooghly',
    state: 'West Bengal',
    approx: { lat: 22.897, long: 87.993 },
    label: { dx: -4.4, dy: -2.8, textAlign: 'end', subDy: 3.2 },
  },
  {
    id: 'howrah',
    name: 'Howrah',
    state: 'West Bengal',
    approx: { lat: 22.551, long: 88.06 },
    label: { dx: -4.4, dy: 1.2, textAlign: 'end', subDy: 3.2 },
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    state: 'West Bengal',
    approx: { lat: 22.567, long: 88.33 },
    label: { dx: 4.4, dy: 1.4, textAlign: 'start', subDy: 3.2 },
  },
];

/**
 * Flat lookup used by the map renderer. Positions are filled at runtime by
 * networkProjection.ts (which projects approx into viewBox units) — consumers
 * import NODE_POS from there.
 */
export const NODE_POS: Record<
  string,
  { x: number; y: number } & NetworkGeoNode['label']
> = {};
