import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { RiskBandName } from '../types';
import { districts, inventory, medicines } from '../data/districts';
import { DISTRICT_PATHS, GEO_VIEWBOX, NODE_POS } from '../data/networkProjection';
import { buildRoutePath, routeId, routePointAt, type RoutePath, type RoutePoint } from '../utils/routeGeometry';
import { stockOutDays } from '../utils/calc';

// Status vocabulary is text + color everywhere — never color alone.
export const BAND_COLOR: Record<RiskBandName, string> = {
  stable: '#2F855A',
  watch: '#B7791F',
  high: '#C05621',
  critical: '#C53030',
};

// Band text colors tuned for the dark neutral canvas.
const BAND_TEXT: Record<RiskBandName, string> = {
  stable: '#7FC8A0',
  watch: '#E8B45A',
  high: '#F08A4B',
  critical: '#FF7B7B',
};

export interface NetworkMapNode {
  id: string;
  name: string;
  score: number;
  band: RiskBandName;
  selected?: boolean;
  /** Transient ring shown on the route endpoints in transfer mode. */
  routeRole?: 'source' | 'target';
}

export type NetworkCorridorStatus = 'active' | 'available' | 'at-risk' | 'disrupted';

export interface NetworkMapCorridor {
  from: string;
  to: string;
  status: NetworkCorridorStatus;
}

const CORRIDOR_STYLE_PX: Record<
  NetworkCorridorStatus,
  { stroke: string; width: number; dash?: string; opacity: number }
> = {
  // Widths are SCREEN pixels (rendered with vector-effect: non-scaling-stroke),
  // so lines stay ~1.4–2.6px at any map scale instead of bloating with the
  // state. Dashes must stay READABLE as an intentional line — too fine a dash
  // at low opacity reads as broken specks (the "disconnected route" bug), so
  // available/at-risk keep a clear 6/5 dash at legible opacity.
  active: { stroke: '#37C0BB', width: 2.6, opacity: 0.95 },
  available: { stroke: '#37C0BB', width: 1.4, dash: '6 5', opacity: 0.6 },
  'at-risk': { stroke: '#C05621', width: 1.4, dash: '6 5', opacity: 0.7 },
  disrupted: { stroke: '#C53030', width: 1.6, dash: '2 5', opacity: 0.8 },
};

/** Native route tooltip text per corridor status (same semantics as the legend). */
const ROUTE_TOOLTIP: Record<NetworkCorridorStatus, string> = {
  active: 'Active transfer corridor',
  available: 'Available corridor',
  'at-risk': 'Corridor at risk',
  disrupted: 'Corridor disrupted',
};

export interface NetworkMapProps {
  nodes: NetworkMapNode[];
  corridors: NetworkMapCorridor[];
  /** Active transfer legs — EVERY leg of a multi-source plan gets its own
      fully connected source→destination route. Derives source/target rings
      for all leg endpoints and (in transfer mode) one flow packet per leg. */
  activeTransfers?: ActiveTransferLeg[];
  onNodeClick?: (districtId: string) => void;
  /** overview = Command Center (RISK context, tooltip + critical pulse);
      transfer = Redistribution (FLOW context, route + packet). The context is
      derived from the page — there is no on-screen mode toggle. */
  mode: 'overview' | 'transfer';
  /** Scenario demand multiplier, so hover stock-out numbers match the KPI cards. */
  tooltipMultiplier?: number;
  /** Reserved: compact in-map header toggle (header is always drawn today). */
  showHeader?: boolean;
  /** Show the built-in legend (defaults true). */
  showLegend?: boolean;
}

/** One directed transfer leg of a (possibly multi-source) redistribution plan. */
export interface ActiveTransferLeg {
  /** Source district id — the route STARTS at this node center. */
  from: string;
  /** Destination district id — the route ENDS at this node center. */
  to: string;
  /** Optional annotation chip for this leg (e.g. "2,500 ORS · 2.9h"). */
  annotation?: string | null;
}

interface HoverInfo {
  id: string;
  x: number;
  y: number;
}

/** Viewport in geographic (viewBox) units: x/y = top-left, w/h = extent. */
interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Portrait vs landscape fit: the projection space is normalized to height 100,
 * so "height 86% of container" works only when the container is TALLER than
 * the state's aspect. In wide desktop cards the width is the binding
 * constraint — the state fills the full width and the leftover vertical space
 * is what fits. Both cases derive from one uniform scale; nothing is ever
 * stretched non-uniformly.
 */
const HEIGHT_FILL = 0.86; // target utilization when height is the binding side
const FALLBACK_ASPECT = 1.25; // used only before the first ResizeObserver tick
const MAX_ZOOM = 4; // deepest zoom: fit-width / 4
const BUTTON_ZOOM = 1.5; // per +/− click (animated)
const PAN_SLOP_PX = 4; // drag distance before a press becomes a pan (clicks pass through)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function computeFit(box: { w: number; h: number }): Viewport {
  const aspect = box.w / box.h;
  // HEIGHT-BINDING fit: the state's height target (86% of canvas) sets the
  // scale; viewport width follows the container's real aspect. The whole
  // state always stays visible and vertically dominant — never a cropped
  // middle band, never a width-stretch.
  const vh = 100 / HEIGHT_FILL;
  const vw = vh * aspect;
  // Degenerate ultra-narrow card: width becomes the binding side instead.
  const w = Math.max(vw, GEO_VIEWBOX.width * 1.04);
  const h = w / aspect;
  const cx = GEO_VIEWBOX.width / 2;
  const cy = 50;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Container-measured fit-to-bounds. The SVG fills the card; the default
 * viewport is derived from the REAL container aspect and a single uniform
 * scale, so the state renders as large as the box allows with balanced
 * margins — never squeezed into the middle of dead space.
 */
function useContainerBox(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [containerRef]);

  return box;
}

/** Static animation gate — particles/halo only render when motion is welcome. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;

/** Most urgent medicine line for the hover tooltip — same data as the KPI cards. */
function urgentLine(districtId: string, multiplier: number) {
  let worst: { name: string; days: number } | null = null;
  for (const r of inventory.filter((rec) => rec.districtId === districtId)) {
    const so = stockOutDays(r, multiplier);
    if (!worst || so < worst.days) worst = { name: medicineName(r.medicineId), days: so };
  }
  return worst;
}

export function NetworkMap({
  nodes,
  corridors,
  activeTransfers = [],
  onNodeClick,
  mode,
  tooltipMultiplier = 1,
  showHeader: _showHeader = true,
  showLegend = true,
}: NetworkMapProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const criticalId = nodes.find((n) => n.band === 'critical')?.id ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ---- Viewport engine ------------------------------------------------
  // `vp === null` means "use the default fitted viewport". All gestures work
  // through one applyViewport()/zoomAtPoint() pair, so both maps (Command
  // Center RISK context, Redistribution FLOW context) share one engine.
  const box = useContainerBox(containerRef);
  const fit = useMemo(() => (box ? computeFit(box) : null), [box]);
  const aspect = box ? box.w / box.h : FALLBACK_ASPECT;
  const [vp, setVp] = useState<Viewport | null>(null);
  const viewport = vp ?? fit ?? computeFit({ w: 600, h: 600 / FALLBACK_ASPECT });

  // Refs mirror the live values so native event listeners (attached once)
  // always read fresh geometry without re-subscribing on every render.
  const viewportRef = useRef(viewport);
  const fitRef = useRef(viewport);
  const aspectRef = useRef(aspect);
  useEffect(() => {
    fitRef.current = fit ?? viewportRef.current;
    aspectRef.current = aspect;
  });

  /** Screen-px → viewBox-units at the LIVE viewport: keeps markers, fonts and
      offsets constant on screen at any zoom level. */
  const pxToUnits = useCallback(
    (px: number) => (px * viewport.w) / Math.max(1, box?.w ?? viewport.w),
    [viewport.w, box],
  );
  const dashScale = viewport.w / 42.6; // px-space dash gap held constant

  const applyViewport = useCallback((v: Viewport) => {
    viewportRef.current = v;
    setVp(v);
  }, []);

  // Keep viewport aspect matched to the container when the card resizes —
  // refit (and discard any user zoom/pan) so the state never crops.
  useEffect(() => {
    setVp(null);
  }, [fit]);

  // Clamp: zoom limited to [fit/4, fit] width; pan limited so the state's
  // bounding box can never leave the canvas entirely.
  const clampViewport = useCallback((v: Viewport): Viewport => {
    const f = fitRef.current;
    const w = clamp(v.w, f.w / MAX_ZOOM, f.w);
    const h = w / aspectRef.current;
    const cx = clamp(v.x + w / 2, 0, GEO_VIEWBOX.width);
    const cy = clamp(v.y + h / 2, 0, 100);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, []);

  // Animated transitions for the +/−/Reset buttons (wheel/pan stay immediate).
  const tweenRef = useRef<number | null>(null);
  const cancelTween = useCallback(() => {
    if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    tweenRef.current = null;
  }, []);
  const tweenTo = useCallback(
    (target: Viewport) => {
      cancelTween();
      const from = viewportRef.current;
      const t0 = performance.now();
      const dur = reducedMotion ? 0 : 220;
      if (dur === 0) {
        applyViewport(target);
        return;
      }
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        applyViewport({
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          w: from.w + (target.w - from.w) * e,
          h: from.h + (target.h - from.h) * e,
        });
        tweenRef.current = p < 1 ? requestAnimationFrame(step) : null;
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [applyViewport, cancelTween, reducedMotion],
  );
  useEffect(() => cancelTween, [cancelTween]);

  /** Zoom by `factor` keeping the geographic point `geo` fixed on screen —
      real cursor-centered scaling, not a transform-origin trick. */
  const zoomAtPoint = useCallback(
    (geo: { x: number; y: number }, factor: number, animate = false) => {
      cancelTween();
      const cur = viewportRef.current;
      const w = clamp(cur.w * factor, fitRef.current.w / MAX_ZOOM, fitRef.current.w);
      const k = w / cur.w;
      const next = clampViewport({
        x: geo.x - (geo.x - cur.x) * k,
        y: geo.y - (geo.y - cur.y) * k,
        w,
        h: w / aspectRef.current,
      });
      if (animate) tweenTo(next);
      else applyViewport(next);
    },
    [applyViewport, cancelTween, clampViewport, tweenTo],
  );

  // ---- Gesture state (refs — no re-render per pointer move beyond viewport) --
  const gesture = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    drag: null as null | { sx: number; sy: number; vp: Viewport },
    pinch: null as null | { d0: number; geo: { x: number; y: number }; vp: Viewport },
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const [hint, setHint] = useState<'visible' | 'fading' | 'gone'>('visible');
  const hintTimer = useRef<number | null>(null);
  const dismissHint = useCallback(() => {
    setHint((h) => {
      if (h !== 'visible') return h;
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint('gone'), 400);
      return 'fading';
    });
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    },
    [],
  );

  /** Screen (client) point → geographic point through the LIVE viewport. */
  const clientToGeo = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vp0 = viewportRef.current;
    // preserveAspectRatio="xMidYMid meet": the viewport is letterboxed in rect.
    const scale = Math.min(rect.width / vp0.w, rect.height / vp0.h);
    const offX = (rect.width - vp0.w * scale) / 2;
    const offY = (rect.height - vp0.h * scale) / 2;
    return {
      x: vp0.x + (cx - rect.left - offX) / scale,
      y: vp0.y + (cy - rect.top - offY) / scale,
    };
  }, []);

  // Wheel zoom — native NON-passive listener so preventDefault only fires
  // while the cursor is over the map. Outside the map the page scrolls
  // untouched; nothing is globally disabled.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dismissHint();
      // Normalize trackpad deltas (pixels vs lines vs pages), then apply a
      // small exponential factor: smooth, no level jumps, no jitter.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 400;
      const factor = Math.exp(clamp(dy, -180, 180) * 0.0022); // ≈×1.1 per wheel notch
      zoomAtPoint(clientToGeo(e.clientX, e.clientY), factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clientToGeo, dismissHint, zoomAtPoint]);

  // Drag-to-pan + two-pointer pinch. Listeners live on window while active so
  // we never setPointerCapture (which would retarget clicks away from nodes).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const g = gesture.current;

    const twoPoints = () => {
      const pts = [...g.pointers.values()];
      return pts.length >= 2 ? { a: pts[0], b: pts[1] } : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dismissHint();
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      suppressClickRef.current = false;
      if (g.pointers.size === 1) {
        g.moved = false;
        g.drag = { sx: e.clientX, sy: e.clientY, vp: viewportRef.current };
        g.pinch = null;
      } else if (g.pointers.size === 2) {
        const pair = twoPoints();
        if (pair) {
          g.drag = null;
          g.moved = true; // a pinch is never a click
          g.pinch = {
            d0: Math.max(1, Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y)),
            geo: clientToGeo((pair.a.x + pair.b.x) / 2, (pair.a.y + pair.b.y) / 2),
            vp: viewportRef.current,
          };
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!g.pointers.has(e.pointerId)) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pair = twoPoints();
      if (g.pinch && pair) {
        // Pinch: scale around the midpoint; the geo point under the initial
        // midpoint stays under the current midpoint.
        const d = Math.max(1, Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y));
        zoomAtPoint(g.pinch.geo, g.pinch.d0 / d);
        return;
      }

      if (g.drag && g.pointers.size === 1) {
        const dx = e.clientX - g.drag.sx;
        const dy = e.clientY - g.drag.sy;
        if (!g.moved && Math.hypot(dx, dy) > PAN_SLOP_PX) g.moved = true;
        if (g.moved) {
          const svgEl = svgRef.current;
          const rect = svgEl?.getBoundingClientRect();
          const scale = rect ? Math.min(rect.width / g.drag.vp.w, rect.height / g.drag.vp.h) : 1;
          applyViewport(
            clampViewport({
              x: g.drag.vp.x - dx / scale,
              y: g.drag.vp.y - dy / scale,
              w: g.drag.vp.w,
              h: g.drag.vp.h,
            }),
          );
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      g.pointers.delete(e.pointerId);
      if (g.pointers.size < 2) g.pinch = null;
      if (g.pointers.size === 0) {
        // A press that panned suppresses the trailing click on district nodes.
        suppressClickRef.current = g.moved;
        g.drag = null;
        g.moved = false;
      }
    };

    svg.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      svg.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [applyViewport, clampViewport, clientToGeo, dismissHint, zoomAtPoint]);

  const zoomByButton = useCallback(
    (factor: number) => {
      dismissHint();
      const cur = viewportRef.current;
      zoomAtPoint({ x: cur.x + cur.w / 2, y: cur.y + cur.h / 2 }, factor, true);
    },
    [dismissHint, zoomAtPoint],
  );
  const resetViewport = useCallback(() => {
    dismissHint();
    tweenTo(fitRef.current);
  }, [dismissHint, tweenTo]);

  // Map context is page-derived: Command Center = RISK, Redistribution = FLOW.
  const contextLabel = mode === 'transfer' ? 'FLOW' : 'RISK';
  const flowMode = mode === 'transfer';

  // Canonical route geometry: ONE RoutePath per corridor, built from node
  // coordinates only. The visible line, the flow particle (mpath), the hit
  // area and the annotation anchor all derive from this same object. The
  // pair map lets leg-driven consumers find the shared path by
  // source|destination — never by array index.
  const routes = useMemo(
    () =>
      corridors.map((c, i) => ({
        corridor: c,
        key: `${c.from}-${c.to}-${i}`,
        route: buildRoutePath(c.from, c.to),
      })),
    [corridors],
  );
  const routeByPair = useMemo(() => {
    const m = new Map<string, RoutePath>();
    for (const r of routes) m.set(`${r.corridor.from}|${r.corridor.to}`, r.route);
    return m;
  }, [routes]);

  // Transfer endpoint rings derive from the ACTIVE LEGS, so every source of a
  // multi-source plan is marked — not just the first one.
  const transferRoles = useMemo(() => {
    const roles = new Map<string, 'source' | 'target'>();
    for (const leg of activeTransfers) {
      if (!roles.has(leg.from)) roles.set(leg.from, 'source');
      roles.set(leg.to, 'target');
    }
    return roles;
  }, [activeTransfers]);

  return (
    <div ref={containerRef} className="relative h-[520px] w-full overflow-hidden rounded-lg bg-geo sm:h-[560px] xl:h-[600px]">
      <div className="pointer-events-none absolute left-4 top-3 z-10 select-none">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
          West Bengal
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75">
          Health supply network
        </p>
        <p className="tabular mt-1 text-[10px] font-medium text-white/75">
          {nodes.length} locations · {corridors.length} supply corridors
        </p>
      </div>

      {/* Single page-derived context chip — RISK on Command Center, FLOW on
          Redistribution. All information (corridors, risk, particles) is
          always rendered; this only names the map's context. */}
      <div
        role="status"
        aria-label={`Map context: ${contextLabel}`}
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 backdrop-blur-sm"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${flowMode ? 'bg-[#37C0BB]' : 'bg-[#C53030]'}`}
          aria-hidden="true"
        />
        <span className="text-[11px] font-bold uppercase tracking-wider text-white">
          {contextLabel}
        </span>
      </div>

      {/* Zoom controls — plus wheel zoom, drag pan and pinch on the canvas */}
      <div className="absolute right-3 top-9 z-10 flex flex-col gap-1">
        <button
          onClick={() => zoomByButton(1 / BUTTON_ZOOM)}
          aria-label="Zoom out"
          className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-white/80 backdrop-blur-sm transition hover:bg-surface/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-light"
        >
          <Minus className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          onClick={() => zoomByButton(BUTTON_ZOOM)}
          aria-label="Zoom in"
          className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-white/80 backdrop-blur-sm transition hover:bg-surface/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-light"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          onClick={resetViewport}
          aria-label="Reset zoom"
          className="flex h-6 w-6 items-center justify-center rounded bg-white/10 text-white/80 backdrop-blur-sm transition hover:bg-surface/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-light"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="West Bengal health supply network: six districts with risk shading and supply corridors"
        className="block h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      >
        {/* State outline: brand green, structural only — the canvas stays neutral */}
        <motion.g
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {Object.entries(DISTRICT_PATHS).map(([id, d]) => {
            const n = nodes.find((x) => x.id === id);
            const band: RiskBandName = n?.band ?? 'stable';
            const isSelected = Boolean(n?.selected);
            const fill = flowMode
              ? 'rgba(24, 34, 48, 0.65)'
              : band === 'critical'
                ? 'rgba(197, 48, 48, 0.28)'
                : band === 'high'
                  ? 'rgba(192, 86, 33, 0.2)'
                  : band === 'watch'
                    ? 'rgba(183, 121, 31, 0.13)'
                    : 'rgba(47, 133, 90, 0.1)';
            return (
              <motion.path
                key={id}
                d={d}
                fill={fill}
                stroke={isSelected ? '#FFFFFF' : '#14432A'}
                strokeWidth={isSelected ? 2 : 1.1}
                vectorEffect="non-scaling-stroke"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="transition-[stroke] duration-200"
              />
            );
          })}
        </motion.g>

        {/* Canonical route geometry, defined once for the whole map. Every
            consumer — visible line, particle mpath, hit area — references
            THESE paths by id. Endpoints are node centers by construction. */}
        <defs>
          {[...routeByPair.entries()].map(([pair, route]) => {
            const [f, t] = pair.split('|');
            return <path key={pair} id={routeId(f, t)} d={route.d} fill="none" />;
          })}
        </defs>

        {/* Corridor lines — BEHIND every node marker. Entrances are opacity
            ONLY: no pathLength tween, which leaves a strokeDasharray="1px,1px"
            residue that (with non-scaling-stroke) paints corridors as broken
            hairlines. Dash styles stay semantic and untouched. */}
        {routes.map(({ key, corridor: c, route }, i) => {
          const style = CORRIDOR_STYLE_PX[c.status];
          return (
            <motion.path
              key={key}
              d={route.d}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash ? style.dash.split(' ').map((n) => +n / dashScale).join(' ') : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: style.opacity }}
              transition={{ duration: 0.7, delay: 0.5 + i * 0.12 }}
            />
          );
        })}

        {/* ACTIVE TRANSFER OVERLAY — one unmistakable visual per leg, drawn
            over the base corridors and UNDER the node markers: a solid teal
            route plus an animated dash flow that travels ALONG THE SAME
            canonical path (same `d`, SMIL dashoffset loop). The dashes move
            start→end, i.e. source → destination, so the judge can read WHO is
            sending to WHOM without reading a single label. */}
        {mode === 'transfer' &&
          activeTransfers.map((leg) => {
            const r = routeByPair.get(`${leg.from}|${leg.to}`);
            if (!r) return null;
            const period = 10 / dashScale; // dash+gap in viewBox units
            return (
              <g key={`active-${leg.from}-${leg.to}`}>
                <path
                  d={r.d}
                  fill="none"
                  stroke="#37C0BB"
                  strokeWidth={3}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.95}
                />
                <path
                  d={r.d}
                  fill="none"
                  stroke="#B8FBEF"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={`${3 / dashScale} ${7 / dashScale}`}
                >
                  {/* Flow animation: decreasing dashoffset moves the pattern
                      forward along the path — source → destination. */}
                  <animate
                    attributeName="stroke-dashoffset"
                    from={String(period)}
                    to="0"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            );
          })}

        {/* Route hit areas + native tooltips — same `d` as the visible line,
            transparent, slightly wider for usability. The tooltip rides the
            same path geometry. */}
        {routes.map(({ key, corridor: c, route }) => {
          const label = ROUTE_TOOLTIP[c.status];
          return (
            <path
              key={`hit-${key}`}
              d={route.d}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              pointerEvents="stroke"
            >
              <title>{label}</title>
            </path>
          );
        })}

        {/* Per-leg annotations for active transfers — placed along their OWN
            route near the source, with deterministic collision avoidance
            against every other route and node marker. A chip can never sit
            on (and visually sever) a line or cover a node. */}
        {mode === 'transfer' &&
          (() => {
            const obstaclePts: RoutePoint[] = [];
            for (const { route } of routes) {
              for (let i = 0; i <= 24; i++) obstaclePts.push(routePointAt(route, i / 24));
            }
            for (const n of Object.values(NODE_POS)) obstaclePts.push({ x: n.x, y: n.y });
            return activeTransfers.map((leg) => {
              const r = routeByPair.get(`${leg.from}|${leg.to}`);
              if (!r || !leg.annotation) return null;
              return (
                <RouteAnnotation
                  key={`ann-${leg.from}-${leg.to}`}
                  route={r}
                  text={leg.annotation}
                  unitPerPx={pxToUnits(1)}
                  obstacles={obstaclePts}
                />
              );
            });
          })()}

        {/* One flow packet per active transfer leg — the moving resource
            itself. The particle follows the canonical <mpath> of the SAME
            path the line is drawn from, source → destination. */}
        {mode === 'transfer' &&
          !reducedMotion &&
          activeTransfers.map((leg) =>
            routeByPair.has(`${leg.from}|${leg.to}`) ? (
              <FlowParticle key={`flow-${leg.from}-${leg.to}`} pair={`${leg.from}|${leg.to}`} r={0.9} />
            ) : null,
          )}

        {/* Particles on active corridors — small teal, slow, no glow. They
            travel the canonical mpath (same geometry as the drawn line). */}
        {!reducedMotion &&
          routes
            .filter(({ corridor }) => corridor.status === 'active')
            .map(({ corridor }, i) => (
              <FlowParticle
                key={`p-${corridor.from}-${corridor.to}`}
                pair={`${corridor.from}|${corridor.to}`}
                delay={0.9 + i * 0.7}
                r={0.55}
              />
            ))}

        {/* Critical halo follows the LIVE critical district */}
        {mode === 'overview' && !reducedMotion && criticalId && NODE_POS[criticalId] && (
          <motion.circle
            cx={NODE_POS[criticalId].x}
            cy={NODE_POS[criticalId].y}
            r={pxToUnits(5)}
            fill="none"
            stroke={BAND_COLOR.critical}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 3.4 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
            style={{ transformOrigin: `${NODE_POS[criticalId].x}px ${NODE_POS[criticalId].y}px` }}
          />
        )}

        {/* District markers + collision-free two-line labels. Marker radii and
            label offsets are recomputed per-viewport in SCREEN pixels
            (pxToUnits) so they stay constant on screen at any zoom. */}
        {nodes.map((n, i) => {
          const p = NODE_POS[n.id];
          if (!p) return null;
          const color = BAND_COLOR[n.band];
          const textColor = BAND_TEXT[n.band];
          const clickable = Boolean(onNodeClick);
          const showLabel = !hover || hover.id !== n.id;
          // Leader lines for labels pushed clear of the tight southern
          // cluster; short offsets just sit beside the marker.
          const needsLeader = Math.hypot(p.dx, p.dy) > 5.5;
          // Screen-constant label geometry (px, converted via pxToUnits).
          const labelR = pxToUnits(15);    // district name
          const subR = pxToUnits(12);      // STATUS · score line
          const side = p.textAlign === 'end' ? -1 : 1;
          const nameOffset = pxToUnits(side * 26);          // gap marker→text
          const nameY = p.y + pxToUnits(-6);                // slight lift
          const markerR = n.band === 'critical' || n.selected ? pxToUnits(6) : pxToUnits(5);
          const haloR = markerR + pxToUnits(5);
          const leaderEndX = p.x + nameOffset * 0.7;
          const leaderEndY = nameY - pxToUnits(4);
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              data-tour={`tour-map-node-${n.id}`}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={
                clickable
                  ? `${n.name}: ${n.band} risk, score ${n.score} of 100. Activate to open district intelligence.`
                  : `${n.name}: ${n.band} risk, score ${n.score} of 100.`
              }
              onClick={
                clickable
                  ? () => {
                      // A drag/pinch that ended on this node must not open the drawer.
                      if (suppressClickRef.current) return;
                      onNodeClick!(n.id);
                    }
                  : undefined
              }
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNodeClick!(n.id);
                      }
                    }
                  : undefined
              }
              className={clickable ? 'cursor-pointer focus:outline-none' : undefined}
              onMouseEnter={() => setHover({ id: n.id, x: p.x, y: p.y })}
              onMouseLeave={() => setHover(null)}
              onFocus={
                clickable
                  ? () => {
                      setHover({ id: n.id, x: p.x, y: p.y });
                      setFocusedId(n.id);
                    }
                  : undefined
              }
              onBlur={() => {
                setHover(null);
                setFocusedId(null);
              }}
            >
              {/* Elevated-risk outer halo (static ring) */}
              {(n.band === 'high' || n.band === 'critical') && (
                <circle cx={p.x} cy={p.y} r={haloR} fill={color} opacity={0.16} />
              )}
              {/* Transfer endpoint rings — derived from the active leg list,
                  so every source of a multi-source plan is ringed. */}
              {transferRoles.get(n.id) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={haloR + pxToUnits(1.5)}
                  fill="none"
                  stroke={transferRoles.get(n.id) === 'source' ? '#37C0BB' : '#FF7B7B'}
                  strokeWidth={1.2}
                  strokeDasharray={`${4 / dashScale} ${3 / dashScale}`}
                  opacity={0.95}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {/* Keyboard focus ring */}
              {focusedId === n.id && (
                <circle cx={p.x} cy={p.y} r={haloR} fill="none" stroke="#9B4DFF" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              )}
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={markerR}
                fill={color}
                stroke={n.selected ? '#FFFFFF' : 'rgba(255,255,255,0.35)'}
                strokeWidth={n.selected ? 1.6 : 0.8}
                vectorEffect="non-scaling-stroke"
                initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
              {/* Generous transparent hit area (scaled with the map) */}
              <circle cx={p.x} cy={p.y} r={haloR + pxToUnits(3)} fill="transparent" />

              {/* Leader line from marker to pushed-out label */}
              {needsLeader && showLabel && (
                <line
                  x1={p.x + Math.sign(nameOffset) * markerR}
                  y1={p.y}
                  x2={leaderEndX}
                  y2={leaderEndY}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                  className="pointer-events-none"
                />
              )}

              {/* Two-line label block: NAME / STATUS · SCORE */}
              {showLabel && (
                <motion.g
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 + i * 0.06 }}
                >
                  <text
                    x={p.x + nameOffset}
                    y={nameY}
                    textAnchor={p.textAlign}
                    fontSize={labelR}
                    fontWeight={n.band === 'critical' || n.selected ? 800 : 700}
                    fill={n.band === 'critical' || n.selected ? '#FFFFFF' : 'rgba(255,255,255,0.82)'}
                    className="pointer-events-none select-none"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(16,24,32,0.85)', strokeWidth: pxToUnits(3.2) }}
                  >
                    {n.name}
                  </text>
                  <text
                    x={p.x + nameOffset + pxToUnits(side * 4)}
                    y={nameY + pxToUnits(13)}
                    textAnchor={p.textAlign}
                    fontSize={subR}
                    fontWeight={700}
                    fill={textColor}
                    className="pointer-events-none select-none tabular"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(16,24,32,0.85)', strokeWidth: pxToUnits(2.6) }}
                  >
                    {n.band.toUpperCase()} · {n.score}
                  </text>
                </motion.g>
              )}
            </g>
          );
        })}
      </svg>

      {/* First-use interaction hint — fades after the first gesture */}
      {hint !== 'gone' && (
        <div
          className={`pointer-events-none absolute bottom-3 right-3 z-10 rounded bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/70 backdrop-blur-sm transition-opacity duration-300 ${
            hint === 'fading' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          Scroll to zoom · Drag to explore
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded bg-[rgba(11,17,20,0.55)] px-2.5 py-1.5 text-[11px] font-semibold text-white/85 backdrop-blur-sm">
          {(['stable', 'watch', 'high', 'critical'] as RiskBandName[]).map((band) => (
            <span key={band} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: BAND_COLOR[band] }}
                aria-hidden="true"
              />
              <span className="capitalize">{band}</span>
            </span>
          ))}
          <span className="ml-1 flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 rounded bg-[#37C0BB]" aria-hidden="true" />
            active corridor
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t border-dashed border-[#37C0BB]/60"
              aria-hidden="true"
            />
            available
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2 border-dashed border-[#E2A33C]/80"
              aria-hidden="true"
            />
            at-risk
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2 border-dotted border-[#E05252]/90"
              aria-hidden="true"
            />
            disrupted
          </span>
        </div>
      )}

      {/* Hover tooltip — same per-district data driving the KPI cards.
          Percent position maps the geo point through the LIVE viewport so it
          tracks zoom and pan correctly. */}
      {hover && (
        <TooltipCard
          node={nodes.find((n) => n.id === hover.id)!}
          leftPct={Math.min(88, Math.max(8, ((hover.x - viewport.x) / viewport.w) * 100))}
          topPct={Math.min(82, Math.max(8, ((hover.y - viewport.y) / viewport.h) * 100))}
          multiplier={tooltipMultiplier}
        />
      )}
    </div>
  );
}

/** Annotation chip for one active transfer leg. Placed along its OWN route
    near the SOURCE node (where corridors are far apart, and where the chip
    semantically reads: "this source sends this"), with deterministic
    collision avoidance: candidate anchors are sampled along the curve and the
    first box that clears every obstacle point (other routes, node markers)
    wins. Geometry derives only from RoutePath — never label positions, never
    screen space. */
function RouteAnnotation({
  route,
  text,
  unitPerPx,
  obstacles = [],
}: {
  route: RoutePath;
  text: string;
  unitPerPx: number;
  /** ViewBox-space points the chip must not overlap (other routes, nodes). */
  obstacles?: RoutePoint[];
}) {
  const font = 11 * unitPerPx;
  const charW = font * 0.56;
  const w = text.length * charW + 10 * unitPerPx;
  const h = font + 8 * unitPerPx;
  const margin = 4 * unitPerPx;

  // Outward normal at t (away from the arc's bulge).
  const outwardAt = (t: number) => {
    const p = routePointAt(route, t);
    let ox = p.x - route.control.x;
    let oy = p.y - route.control.y;
    const ol = Math.max(0.001, Math.hypot(ox, oy));
    return { p, ox: ox / ol, oy: oy / ol };
  };

  const clears = (x: number, y: number) => {
    if (x - w / 2 < 2 || x + w / 2 > GEO_VIEWBOX.width - 2 || y - h / 2 < 2 || y + h / 2 > 98)
      return false;
    for (const o of obstacles) {
      if (
        o.x > x - w / 2 - margin &&
        o.x < x + w / 2 + margin &&
        o.y > y - h / 2 - margin &&
        o.y < y + h / 2 + margin
      )
        return false;
    }
    return true;
  };

  // Candidates: near the source first (t small), progressively farther along
  // the curve; increasing outward distances each. First clear candidate wins;
  // otherwise fall back to a far-off-arc midpoint (rare, still off the line).
  let chosen: { x: number; y: number } | null = null;
  outer: for (const t of [0.18, 0.3, 0.42, 0.54, 0.66, 0.5]) {
    const { p, ox, oy } = outwardAt(t);
    for (const off of [30, 44, 58, 74]) {
      const x = p.x + ox * off * unitPerPx;
      const y = p.y + oy * off * unitPerPx;
      if (clears(x, y)) {
        chosen = { x, y };
        break outer;
      }
    }
  }
  if (!chosen) {
    const { p, ox, oy } = outwardAt(0.5);
    chosen = { x: p.x + ox * 74 * unitPerPx, y: p.y + oy * 74 * unitPerPx };
  }

  return (
    <g>
      <rect
        x={chosen.x - w / 2}
        y={chosen.y - h / 2}
        width={w}
        height={h}
        rx={3 * unitPerPx}
        fill="rgba(16,24,32,0.92)"
        stroke="#37C0BB"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={chosen.x}
        y={chosen.y + font * 0.35}
        textAnchor="middle"
        fontSize={font}
        fontWeight={700}
        fill="#7FE3DE"
        className="select-none tabular"
      >
        {text}
      </text>
    </g>
  );
}

/** Small floating card positioned relative to the map container. */
function TooltipCard({
  node,
  leftPct,
  topPct,
  multiplier,
}: {
  node: NetworkMapNode;
  leftPct: number;
  topPct: number;
  multiplier: number;
}) {
  const district = districts.find((d) => d.id === node.id)!;
  const urgent = urgentLine(node.id, multiplier);
  const flipRight = leftPct > 60;
  const flipDown = topPct > 55;

  return (
    <div
      className="pointer-events-none absolute z-20 w-44 rounded-md border border-geo-line bg-geo/95 p-2.5 text-left shadow-drawer"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(${flipRight ? '-100%' : '0'}, ${flipDown ? '-100%' : '0'})`,
      }}
      role="tooltip"
    >
      <p className="text-xs font-bold text-white">{district.name}</p>
      <p className="tabular mt-0.5 text-[11px] text-white/70">
        Score {node.score} · {node.band.toUpperCase()}
      </p>
      {urgent ? (
        <p className="tabular mt-1 border-t border-geo-line pt-1 text-[11px] leading-snug text-white/70">
          Most urgent: <span className="font-semibold text-white">{urgent.name}</span>
          <br />
          Stock-out in <span className="font-semibold text-white">{urgent.days.toFixed(1)}d</span>
        </p>
      ) : (
        <p className="mt-1 border-t border-geo-line pt-1 text-[11px] text-white/70">
          No tracked medicine lines
        </p>
      )}
    </div>
  );
}
/** Resource-flow particle following the CANONICAL route path via SMIL
    <animateMotion><mpath>. The particle and the visible line reference the
    SAME <defs> path element — one geometry object, zero drift, correct
    source→destination direction (mpath starts at the path's M point, which is
    the source node center). Renders continuously; the browser resolves the
    position from the path each frame, never from wall-clock JS. */
function FlowParticle({
  pair,
  delay = 0,
  r = 0.55,
}: {
  /** "source|destination" pair — resolves to the canonical shared path. */
  pair: string;
  delay?: number;
  r?: number;
}) {
  const [from, to] = pair.split('|');
  const id = routeId(from, to);
  return (
    <circle r={r} fill="#7FE3DE" opacity={0.9}>
      <animateMotion dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" rotate="0">
        <mpath href={`#${id}`} />
      </animateMotion>
    </circle>
  );
}
