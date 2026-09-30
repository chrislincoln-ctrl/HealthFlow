import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAD = 10; // breathing room between spotlight ring and target
const GAP = 14; // gap between target and tooltip
const MIN_RECT = 8; // below this the target is treated as not-yet-rendered
const MARGIN = 16; // tooltip never comes closer than this to a viewport edge
const TOP_SAFE_FALLBACK = 90; // header+stepper reserve if live measurement fails
const SETTLE_INTERVAL = 90; // stabilization poll tick
const SETTLE_TICKS = 2; // consecutive identical frames required before measuring
const SETTLE_BUDGET = 2000; // max wait for layout stabilization per step
const TARGET_BUDGET = 3500; // max wait for the target to mount before fallback
const LOCK_DEBOUNCE = 150; // re-anchor after manual scrolling settles
const RESIZE_DEBOUNCE = 200; // re-lock after a window resize settles
const SHEET_MAX_WIDTH = 640; // below this the card becomes a bottom sheet

export type TourPlacement = 'right' | 'left' | 'below' | 'above';

export interface TourRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface PlacementResult {
  x: number;
  y: number;
  placement: TourPlacement;
  arrowPosition: number;
}

interface PlacementOpts {
  targetRect: TourRect;
  tooltipSize: { width: number; height: number };
  viewport: { width: number; height: number };
  fixedHeaderHeight: number;
  workflowHeight: number;
  safeMargin: number;
  /** Preferred side order for this target type (default: below first). */
  preference?: TourPlacement[];
}

/**
 * THE canonical tour placement algorithm (spec: calculateTourPlacement).
 * Pure — same inputs always produce the same output. Scores the four sides by
 * usable space (header/stepper-aware), honors the target-type preference
 * order, falls back to the most spacious side when nothing fits, and clamps
 * the winner fully on-screen with a guaranteed viewport margin.
 */
export function calculateTourPlacement({
  targetRect,
  tooltipSize,
  viewport,
  fixedHeaderHeight,
  workflowHeight,
  safeMargin,
  preference = ['below', 'above', 'right', 'left'],
}: PlacementOpts): PlacementResult {
  const { width: cw, height: ch } = tooltipSize;
  const safeTop = fixedHeaderHeight + workflowHeight;
  // The effective target: the part visible below the fixed chrome and above
  // the viewport bottom. Anchors use its center — never a portion hidden
  // behind the header.
  const t = Math.min(Math.max(targetRect.top, safeTop), viewport.height);
  const b = Math.max(Math.min(targetRect.bottom, viewport.height), t);
  const effH = Math.max(0, b - t);
  const midY = t + effH / 2;

  const space = {
    below: viewport.height - b - safeMargin,
    above: t - safeTop - safeMargin,
    right: viewport.width - targetRect.right - safeMargin,
    left: targetRect.left - safeMargin,
  };
  const need = { below: ch + GAP, above: ch + GAP, right: cw + GAP, left: cw + GAP };

  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), viewport.width - cw - MARGIN);
  const clampY = (y: number) =>
    Math.min(Math.max(y, safeTop + MARGIN / 2), viewport.height - ch - MARGIN);

  const sides: TourPlacement[] = ['below', 'above', 'right', 'left'];
  const fitting = sides.filter((s) => space[s] >= need[s]);

  let choice: TourPlacement;
  let pinnedBelow = false; // fallback variant: card pinned to the viewport bottom
  if (fitting.length > 0) {
    // Highest-preference side that fully fits — deterministic, no re-scoring.
    choice = preference.find((p) => fitting.includes(p)) ?? fitting[0];
  } else {
    // Nothing fits unclamped (tall target / short viewport): pick the
    // least-harmful of two clamped candidates — top-clamped 'above' vs
    // bottom-pinned 'below' — by weighted coverage of the target's VISIBLE
    // area. The top 140px band counts double, so section titles and primary
    // controls stay readable; the card then only overlaps lower content.
    const aboveY = clampY(t - GAP - ch);
    const belowY = Math.max(viewport.height - ch - safeMargin, safeTop + MARGIN / 2);
    const headingBottom = Math.min(t + 140, b);
    const coverage = (y: number) => {
      const total = Math.max(0, Math.min(y + ch, b) - Math.max(y, t));
      const heading = Math.max(0, Math.min(y + ch, headingBottom) - Math.max(y, t));
      return heading * 2 + (total - heading);
    };
    choice = coverage(aboveY) <= coverage(belowY) ? 'above' : 'below';
    pinnedBelow = choice === 'below';
  }

  let x: number;
  let y: number;
  let arrowPosition: number;
  switch (choice) {
    case 'right':
      x = clampX(targetRect.right + GAP);
      y = clampY(midY - ch / 2);
      arrowPosition = Math.min(Math.max(midY - y, 12), ch - 12);
      break;
    case 'left':
      x = clampX(targetRect.left - GAP - cw);
      y = clampY(midY - ch / 2);
      arrowPosition = Math.min(Math.max(midY - y, 12), ch - 12);
      break;
    case 'above':
      y = clampY(t - GAP - ch);
      x = clampX(targetRect.left + targetRect.width / 2 - cw / 2);
      arrowPosition = Math.min(
        Math.max(targetRect.left + targetRect.width / 2 - x, 16),
        cw - 16,
      );
      break;
    default: // below — normal (under the target) or bottom-pinned fallback
      y = pinnedBelow
        ? Math.max(viewport.height - ch - safeMargin, safeTop + MARGIN / 2)
        : clampY(b + GAP);
      x = clampX(targetRect.left + targetRect.width / 2 - cw / 2);
      arrowPosition = Math.min(
        Math.max(targetRect.left + targetRect.width / 2 - x, 16),
        cw - 16,
      );
  }
  return { x, y, placement: choice, arrowPosition };
}

/**
 * Target-type-aware placement preferences (spec: TARGET-AWARE POSITIONING).
 * Map markers → right of the marker (never over marker+label); the Policy
 * Brief → outside the reading area; everything else → below/above so the
 * card never sits on top of the thing it explains.
 */
function preferenceFor(targetId: string): TourPlacement[] {
  if (targetId.startsWith('tour-map-node-')) return ['right', 'above', 'below', 'left'];
  if (targetId === 'policy-brief-full' || targetId === 'tour-snapshot')
    return ['right', 'below', 'left', 'above'];
  if (targetId === 'tour-shortage' || targetId === 'tour-sources' || targetId === 'tour-recommendation')
    return ['below', 'right', 'above', 'left'];
  return ['below', 'above', 'right', 'left'];
}

const fromDOMRect = (r: DOMRect): TourRect => ({
  top: r.top,
  left: r.left,
  bottom: r.bottom,
  right: r.right,
  width: r.width,
  height: r.height,
});

/** Fixed chrome height (sticky header + workflow stepper block), measured live. */
function chromeTopHeight(): number {
  const chrome = document.querySelector<HTMLElement>('.sticky.top-0');
  if (!chrome) return TOP_SAFE_FALLBACK;
  const h = chrome.getBoundingClientRect().bottom;
  return Math.min(Math.max(0, h), Math.round(window.innerHeight * 0.35));
}

/** One locked positioning decision for the current step. */
interface TourLock {
  rect: TourRect;
  placement: TourPlacement;
  x: number;
  y: number;
  arrow: number;
  cardW: number;
  cardH: number;
  oversized: boolean;
  sheet: boolean;
}

/**
 * Guided-tour spotlight + tooltip — ONE component for every step.
 *
 * Lifecycle per step (spec: STEP TRANSITION LIFECYCLE):
 *   step change → wait for target mount → safe scroll (clear of the sticky
 *   header/stepper) → wait for scroll/layout stabilization (rect unchanged
 *   across consecutive ticks, NOT a fixed sleep) → measure the target ONCE →
 *   calculateTourPlacement → LOCK position + rect for the step → animate
 *   opacity/transform only → controls live.
 *
 * The locked rect is the single source of truth for spotlight, tooltip anchor,
 * arrow and scroll re-anchoring (ONE TARGET RECT). After lock there is no
 * measuring loop: user scroll applies a CSS-variable translate so the anchor
 * stays glued to the target (rAF + direct style writes, zero setState per
 * frame), then re-anchors ONCE, debounced, when scrolling stops; resize
 * re-locks once, debounced. Missing targets never yield a 0,0 tooltip — a
 * compact centered fallback keeps Skip/Next usable.
 */
export function TourSpotlight({
  targetId,
  title,
  body,
  stageTitle,
  stageNumber,
  stageCount,
  momentIndex,
  momentCount,
  onBack,
  onNext,
  onSkip,
  isLast = false,
  isTransitioning = false,
}: {
  targetId: string;
  title: string;
  body: string;
  stageTitle: string;
  stageNumber: number;
  stageCount: number;
  momentIndex: number;
  momentCount: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  isLast?: boolean;
  /** True while a step transition is locked — repeat clicks are ignored. */
  isTransitioning?: boolean;
}) {
  const [lock, setLock] = useState<TourLock | null>(null);
  const [missing, setMissing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  /** Measure target once → place → LOCK. No-op if the step changed meanwhile. */
  const measureAndLock = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
    const overlay = overlayRef.current;
    if (!el || !overlay) return false;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_RECT || r.height < MIN_RECT) return false;
    const card = cardRef.current;
    const cardW = card ? card.offsetWidth : 320;
    const cardH = card ? card.offsetHeight : 220;
    const sheet = window.innerWidth <= SHEET_MAX_WIDTH;
    const res = calculateTourPlacement({
      targetRect: fromDOMRect(r),
      tooltipSize: { width: cardW, height: cardH },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      fixedHeaderHeight: chromeTopHeight(),
      workflowHeight: 0,
      safeMargin: MARGIN,
      preference: preferenceFor(targetId),
    });
    overlay.style.setProperty('--tour-shift', '0px');
    overlay.style.setProperty('--tour-shift-y', '0px');
    setLock({
      rect: fromDOMRect(r),
      placement: res.placement,
      x: res.x,
      y: res.y,
      arrow: res.arrowPosition,
      cardW,
      cardH,
      oversized: r.height > window.innerHeight - PAD * 2 - 8,
      sheet,
    });
    return true;
  }, [targetId]);

  /* ------------- per-step lifecycle: mount → scroll → settle → lock -------- */
  useLayoutEffect(() => {
    let cancelled = false;
    let timer = 0;
    setLock(null);
    setMissing(false);

    const settle = () => {
      let lastW = -1;
      let lastH = -1;
      let lastY = -1;
      let stable = 0;
      const deadline = Date.now() + SETTLE_BUDGET;
      const tick = () => {
        if (cancelled) return;
        const el = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
        if (!el) return setMissing(true);
        const r = el.getBoundingClientRect();
        // Stability = target rect AND page scroll both unchanged across
        // consecutive ticks — the lock can never land mid-scroll or mid-animation.
        if (r.width < MIN_RECT || r.height < MIN_RECT) stable = 0; // entry animation mid-flight
        else if (
          Math.abs(r.width - lastW) <= 1 &&
          Math.abs(r.height - lastH) <= 1 &&
          Math.abs(window.scrollY - lastY) <= 1
        )
          stable += 1;
        else stable = 0;
        lastW = r.width;
        lastH = r.height;
        lastY = window.scrollY;
        if (stable >= SETTLE_TICKS || Date.now() > deadline) {
          if (!measureAndLock()) setMissing(true);
          return;
        }
        timer = window.setTimeout(tick, SETTLE_INTERVAL);
      };
      timer = window.setTimeout(tick, SETTLE_INTERVAL);
    };

    // Safe scroll: the target lands clear of the sticky header/stepper with
    // room beneath for the tooltip. Oversized targets (the full Executive
    // Brief) align their TOP just under the chrome instead of centering a
    // huge block. One gentle smooth scroll per step — never a flying page.
    const safeScroll = (el: HTMLElement): boolean => {
      const mobile = window.innerWidth <= SHEET_MAX_WIDTH;
      const r = el.getBoundingClientRect();
      const chrome = chromeTopHeight();
      const vh = window.innerHeight;
      const usable = vh - chrome - 16; // viewport height below the fixed chrome
      // Oversized for the USABLE area: align the TOP just under the chrome —
      // the only position where the most content is visible at once.
      if (r.height > usable) {
        if (Math.abs(r.top - (chrome + 12)) > 8) {
          window.scrollTo({
            top: Math.max(0, window.scrollY + r.top - chrome - 12),
            behavior: 'smooth',
          });
          return true;
        }
        return false;
      }
      // Mobile: the bottom sheet occupies the lower band — keep the target
      // clear of it. Desktop: keep room under the target for the side card.
      const bottomReserve = mobile ? 240 : 24;
      const tooHigh = r.top < chrome + 24;
      const tooLow = r.bottom > vh - bottomReserve;
      if (!tooHigh && !tooLow) {
        if (mobile) return false; // target sits clear of the sheet — done
        // Room for the tooltip: a fully-visible target whose space BELOW is
        // too tight for the side card would otherwise force the card to
        // overlap the very content it explains. A short, bounded scroll that
        // moves the target higher (never under the chrome) gives the card a
        // clear home below — calm, purposeful, one scroll.
        const estCard = 190; // conservative card height estimate
        const belowSpace = vh - r.bottom;
        const room = estCard + GAP - belowSpace;
        const maxUp = r.top - (chrome + 8); // top must stay below the chrome
        const delta = Math.min(room, maxUp);
        if (room > 0 && delta >= 24) {
          window.scrollBy({ top: delta, behavior: 'smooth' });
          return true;
        }
        return false;
      }
      const delta = tooHigh
        ? r.top - (chrome + 24)
        : r.bottom - (vh - bottomReserve) + (mobile ? 0 : Math.min(r.height + GAP * 2 + 40, vh * 0.28));
      // Never scroll the target's top above the safe zone.
      const bounded = Math.min(delta, Math.max(0, r.top - (chrome + 8)));
      window.scrollBy({ top: bounded, behavior: 'smooth' });
      return true;
    };

    // Phase 1 — wait for the target to mount (route transition, drawer, data).
    const deadline = Date.now() + TARGET_BUDGET;
    const waitForTarget = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
      if (el) {
        if (safeScroll(el)) timer = window.setTimeout(settle, 260); // smooth scroll underway
        else settle();
        return;
      }
      if (Date.now() > deadline) return setMissing(true);
      timer = window.setTimeout(waitForTarget, 120);
    };
    waitForTarget();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetId, measureAndLock]);

  /* ---- post-lock: scroll re-anchor (CSS var, no setState/frame) + resize --- */
  useEffect(() => {
    if (!lock) return;
    let raf = 0;
    let scrollTimer = 0;
    let resizeTimer = 0;

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
        const overlay = overlayRef.current;
        if (!el || !overlay || !lock) return;
        const r = el.getBoundingClientRect();
        overlay.style.setProperty('--tour-shift', `${r.left - lock.rect.left}px`);
        overlay.style.setProperty('--tour-shift-y', `${r.top - lock.rect.top}px`);
      });
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        cancelAnimationFrame(raf);
        measureAndLock(); // ONE clean re-anchor once scrolling has settled
      }, LOCK_DEBOUNCE);
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setLock(null);
        if (!measureAndLock()) setMissing(true);
      }, RESIZE_DEBOUNCE);
    };

    // Bounded reflow checks: stage actions (preset applied, transfer landed,
    // brief generated) can reflow the page AFTER the lock. Three passive
    // probes re-lock once if the target actually moved — not a loop.
    const reflowTimers = [350, 800, 1600].map((d) =>
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
        if (!el || !lock) return;
        const r = el.getBoundingClientRect();
        if (Math.abs(r.top - lock.rect.top) > 4 || Math.abs(r.left - lock.rect.left) > 4) {
          measureAndLock();
        }
      }, d),
    );

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(scrollTimer);
      window.clearTimeout(resizeTimer);
      reflowTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [lock, targetId, measureAndLock]);

  /* ---- focus the primary control ONCE per step (a11y; never on re-locks,
          so scrolling cannot steal focus back mid-interaction) ---- */
  const focusedStepRef = useRef<string | null>(null);
  useEffect(() => {
    if ((!lock && !missing) || focusedStepRef.current === targetId) return;
    const t = window.setTimeout(() => {
      focusedStepRef.current = targetId;
      nextRef.current?.focus({ preventScroll: true });
    }, 260);
    return () => window.clearTimeout(t);
  }, [lock, missing, targetId]);

  // Sheet mode is derived at render time from the live viewport width so a
  // phone-sized layout always uses the bottom sheet — including on first load
  // and rotation — without depending on a resize event having fired. Side-card
  // coordinates remain locked; the sheet does not consume them.
  const sheet = window.innerWidth <= SHEET_MAX_WIDTH;
  const vArrow = !sheet && (lock?.placement === 'below' || lock?.placement === 'above');
  const hArrow = !sheet && (lock?.placement === 'right' || lock?.placement === 'left');

  /* Shared card content — identical for side card, fallback and sheet. */
  const cardBody = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ai-dark dark:text-ai-light">
        Step {stageNumber} of {stageCount} · {stageTitle}
      </p>
      <h3 id="tour-step-title" className="mt-1 text-sm font-extrabold text-ink">
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
      <div
        className="mt-3 flex items-center gap-1.5"
        aria-label={`Highlight ${momentIndex + 1} of ${momentCount}`}
      >
        {Array.from({ length: momentCount }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === momentIndex ? 'bg-ai' : 'bg-faint'}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          onClick={onSkip}
          className="rounded px-2 py-1 text-[11px] font-semibold text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBack}
            disabled={stageNumber === 1 && momentIndex === 0}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
          </button>
          <button
            ref={nextRef}
            onClick={onNext}
            aria-busy={isTransitioning}
            className="inline-flex items-center gap-1 rounded bg-ai px-3 py-1.5 text-xs font-semibold text-white hover:bg-ai-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-dark"
          >
            {isLast ? 'Finish tour' : 'Next'}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );

  // Portaled to <body> so the overlay escapes the header's stacking context
  // (z-30). Manual-scroll translation rides the --tour-shift CSS variables,
  // applied to the three anchored children via calc() — no per-frame React.
  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      style={{ '--tour-shift': '0px', '--tour-shift-y': '0px' } as CSSProperties}
    >
      {/* Dim veil — lighter in dark mode so the screen keeps context. */}
      <div className="absolute inset-0 bg-chrome-dark/60 dark:bg-black/50" />

      {/* Missing-target fallback: compact, centered, fully on-screen. Never a
          0,0 float, never a giant overlay, never a phantom spotlight. */}
      {missing && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-4">
          <div className="tour-card-in w-80 max-w-full rounded-lg border border-line bg-surface-elevated p-4 shadow-drawer">
            {cardBody}
          </div>
        </div>
      )}

      {/* Spotlight cutout — frames the target (visible portion if oversized,
          dashed tabs marking the clipped edges). Same locked rect as the
          tooltip anchor: ONE TARGET RECT. */}
      {lock && (
        <div
          className="pointer-events-auto absolute rounded-md ring-2 ring-ai"
          style={{
            top: Math.max(lock.rect.top, 4) - PAD,
            left: lock.rect.left - PAD,
            width: lock.rect.width + PAD * 2,
            height: Math.min(lock.rect.height, window.innerHeight - 8) + PAD * 2,
            transform: 'translate3d(var(--tour-shift), var(--tour-shift-y), 0)',
            boxShadow: '0 0 0 9999px rgba(14, 48, 30, 0.55)',
          }}
        >
          {lock.oversized && lock.rect.top < 0 && (
            <div
              aria-hidden="true"
              className="absolute -top-1 left-6 right-6 border-t-2 border-dashed border-ai/70"
              title="The full target continues above"
            />
          )}
          {lock.oversized && lock.rect.bottom > window.innerHeight && (
            <div
              aria-hidden="true"
              className="absolute -bottom-1 left-6 right-6 border-b-2 border-dashed border-ai/70"
              title="The full target continues below"
            />
          )}
        </div>
      )}

      {/* Side card — desktop/tablet. Mounted with real content BEFORE the lock
          (visibility:hidden) so its true size feeds the placement math; the
          settle animation runs on the INNER wrapper so it can never fight the
          locked transform. Position = transform only (never left/top). */}
      {!sheet && (
        <div
          ref={cardRef}
          className="pointer-events-auto absolute left-0 top-0 z-10 w-80 max-w-[calc(100vw-2rem)]"
          style={{
            transform: `translate3d(calc(var(--tour-shift) + ${lock?.x ?? 0}px), calc(var(--tour-shift-y) + ${lock?.y ?? 0}px), 0)`,
            visibility: lock ? 'visible' : 'hidden',
          }}
        >
          <div
            key={targetId}
            className={`rounded-lg border border-line bg-surface-elevated p-4 shadow-drawer ${
              lock ? 'tour-card-in' : ''
            }`}
          >
            {cardBody}
            {vArrow && (
              <span
                aria-hidden="true"
                className={`absolute h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-surface-elevated ${
                  lock?.placement === 'below' ? '-top-2' : '-bottom-2 rotate-180'
                }`}
                style={{ left: (lock?.arrow ?? 0) - 8 }}
              />
            )}
            {hArrow && (
              <span
                aria-hidden="true"
                className={`absolute h-0 w-0 border-y-8 border-l-8 border-y-transparent border-l-surface-elevated ${
                  lock?.placement === 'right' ? '-left-2' : '-right-2 rotate-180'
                }`}
                style={{ top: (lock?.arrow ?? 0) - 8 }}
              />
            )}
          </div>
        </div>
      )}

      {/* Mobile bottom sheet — SAME tour state, targeting and actions; pinned
          above the safe-area so it is always fully visible with Next reachable. */}
      {sheet && lock && (
        <div
          ref={cardRef}
          className="tour-card-in pointer-events-auto absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-line bg-surface-elevated p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-drawer"
        >
          {cardBody}
        </div>
      )}
    </div>,
    document.body,
  );
}
