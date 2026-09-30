/**
 * Canonical route geometry — ONE path definition shared by every consumer.
 *
 * Route endpoints are ALWAYS the projected node centers from NODE_POS
 * (networkProjection.ts). There are no per-route pixel offsets, no
 * label-derived endpoints, and no screen-space coordinates anywhere in this
 * module: every output is expressed in the map's geographic viewBox units, so
 * routes stay pinned to their nodes identically at any zoom, pan, container
 * size, or viewport (the SVG viewBox transform carries them).
 *
 * Consumers of a single route definition:
 *   1. the visible route <path> (stroke styling varies by status — geometry does not)
 *   2. the animated resource-flow particle (<animateMotion mpath href=<id>>)
 *   3. the transparent route hit-area <path> (same d, wider invisible stroke)
 *   4. the route tooltip anchor (curve midpoint, offset off the line)
 *
 * The renderer draws routes BEHIND node markers; the marker visually masks the
 * route's center so the line reads as physically anchored to the node.
 */

import { NODE_POS } from '../data/networkProjection';

export interface RoutePoint {
  x: number;
  y: number;
}

export type RouteCurve = 'straight' | 'quadratic';

export interface RoutePath {
  /** SVG path data in geographic viewBox units: `M sx sy Q cx cy ex ey`. */
  d: string;
  /** Cubic-Bézier equivalent (same endpoints, same shape) for animateMotion keyframes. */
  cubic: { c1: RoutePoint; c2: RoutePoint };
  /** Control point of the quadratic curve. */
  control: RoutePoint;
  /** Start point — the SOURCE node center (transfer origin). */
  start: RoutePoint;
  /** End point — the DESTINATION node center. */
  end: RoutePoint;
  /** Directional unit vector of the chord (start → end). */
  dir: RoutePoint;
  /** Perpendicular unit vector (rotate dir +90°, used to offset things off the line). */
  perp: RoutePoint;
  /** Chord length in viewBox units. */
  length: number;
  /** How the route curves between the endpoints. */
  curve: RouteCurve;
}

/** Bow of the quadratic curve as a fraction of chord length, clamped in
 * viewBox units. Small enough to stay subtle; large enough to keep the
 * hooghly→howrah and kolkata→howrah corridors visually apart where their
 * chords nearly coincide. */
const BOW_FRACTION = 0.14;
const BOW_MAX_UNITS = 7;

/** Sign of the bow per ordered district pair. Corridors are declared
 * undirected (districts.ts), but geometry must be DIRECTIONAL so that
 * hooghly→nadia and nadia→hooghly draw the same arc on the same side — one
 * visual corridor between two districts, never two mirrored lines. */
const BOW_SIGN: Record<string, 1 | -1> = {
  'hooghly|nadia': -1,
  'kolkata|nadia': 1,
  'hooghly|howrah': 1,
  'kolkata|howrah': -1,
};

/**
 * Build the canonical path between two nodes. Throws only in dev if a node id
 * is unknown — silently drawing a route from (0,0) would be exactly the class
 * of silent geometry bug this module exists to prevent.
 */
export function buildRoutePath(sourceNodeId: string, destinationNodeId: string): RoutePath {
  const A = NODE_POS[sourceNodeId];
  const B = NODE_POS[destinationNodeId];
  if (!A || !B) {
    throw new Error(
      `routeGeometry: unknown node id in route "${sourceNodeId}" → "${destinationNodeId}"`,
    );
  }

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;

  // One shared bow: same sign for both directions of a pair, so a corridor
  // drawn either way lands on the same arc.
  const sign = BOW_SIGN[`${sourceNodeId}|${destinationNodeId}`] ?? BOW_SIGN[`${destinationNodeId}|${sourceNodeId}`] ?? 1;
  const bow = Math.min(BOW_MAX_UNITS, length * BOW_FRACTION) * sign;
  const control: RoutePoint = {
    x: (A.x + B.x) / 2 + px * bow,
    y: (A.y + B.y) / 2 + py * bow,
  };

  return {
    d: `M ${A.x} ${A.y} Q ${control.x} ${control.y} ${B.x} ${B.y}`,
    // Quadratic → cubic elevation (exact same curve): c1 = P0 + 2/3 (C − P0),
    // c2 = P1 + 2/3 (C − P1).
    cubic: {
      c1: { x: A.x + (2 / 3) * (control.x - A.x), y: A.y + (2 / 3) * (control.y - A.y) },
      c2: { x: B.x + (2 / 3) * (control.x - B.x), y: B.y + (2 / 3) * (control.y - B.y) },
    },
    control,
    start: { x: A.x, y: A.y },
    end: { x: B.x, y: B.y },
    dir: { x: ux, y: uy },
    perp: { x: px, y: py },
    length,
    curve: 'quadratic',
  };
}

/** Stable per-route SVG id for <mpath> links (one path object, many consumers). */
export function routeId(sourceNodeId: string, destinationNodeId: string): string {
  return `route-${sourceNodeId}-${destinationNodeId}`;
}

/** Point at parameter t (0..1) along the route's quadratic curve — used for
 * tooltip/annotation anchoring. Derived from the same control point, never
 * from label positions. */
export function routePointAt(route: RoutePath, t: number): RoutePoint {
  const mt = 1 - t;
  return {
    x: mt * mt * route.start.x + 2 * mt * t * route.control.x + t * t * route.end.x,
    y: mt * mt * route.start.y + 2 * mt * t * route.control.y + t * t * route.end.y,
  };
}

/** Tangent (normalized) at parameter t — for orienting labels along the curve. */
export function routeTangentAt(route: RoutePath, t: number): RoutePoint {
  const mt = 1 - t;
  const tx = 2 * mt * (route.control.x - route.start.x) + 2 * t * (route.end.x - route.control.x);
  const ty = 2 * mt * (route.control.y - route.start.y) + 2 * t * (route.end.y - route.control.y);
  const l = Math.max(0.001, Math.hypot(tx, ty));
  return { x: tx / l, y: ty / l };
}
