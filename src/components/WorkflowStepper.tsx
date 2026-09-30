import { Link, useLocation } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// THE WORKFLOW STEPPER — the product's single global chronology.
//
// Rendered EXACTLY ONCE, from the app shell (Layout), directly below the main
// header. Pages, cards and the footer must never render their own copy.
//
// One source of truth: stage labels, routes and the active-stage calculation
// all live here. The active stage is DERIVED FROM THE CURRENT ROUTE — pages
// pass nothing, there is no per-page active-state logic, and a browser
// refresh on any route re-derives the same highlight.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowStage {
  /** Canonical stage label — never re-hardcoded by consumers. */
  label: string;
  /** Route the stage navigates to. */
  path: string;
}

export const WORKFLOW_STAGES: WorkflowStage[] = [
  { label: 'OBSERVE', path: '/command-center' },
  { label: 'UNDERSTAND', path: '/understand' },
  { label: 'PREDICT', path: '/demand' },
  { label: 'OPTIMIZE', path: '/redistribution' },
  { label: 'ACT', path: '/action-center' },
  { label: 'SIMULATE', path: '/simulator' },
  { label: 'REPORT', path: '/policy' },
  { label: 'SCALE', path: '/federation' },
];

/**
 * The stage for a given pathname (exact match), or null when the route is
 * outside the core loop (e.g. the landing page).
 */
export function stageForPath(pathname: string): WorkflowStage | null {
  return WORKFLOW_STAGES.find((s) => s.path === pathname) ?? null;
}

/**
 * Global workflow rail: navigation + workflow context in one row.
 * - Same content container (max-w-7xl) as the header and main — one app grid.
 * - Lives inside the sticky shell block, so header + stepper scroll as ONE
 *   coherent top navigation system.
 * - Desktop: single compact row. Mobile: the same single row, horizontally
 *   scrollable (never wraps, never duplicates elsewhere).
 * - Always renders on the brand chrome, so one style serves light AND dark
 *   themes through the existing chrome tokens — no second implementation.
 */
export function WorkflowStepper() {
  const { pathname } = useLocation();
  const activeIndex = WORKFLOW_STAGES.findIndex((s) => s.path === pathname);

  return (
    <nav
      aria-label="HealthFlow workflow"
      data-tour="tour-workflow"
      className="border-b border-chrome-dark bg-chrome text-white"
    >
      {/* One horizontal rail at every viewport: overflow scrolls, never wraps. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WORKFLOW_STAGES.map((stage, i) => {
            const active = i === activeIndex;
            // Subtle completed treatment: stages before the active one read a
            // touch brighter than untouched stages — quiet, not noisy.
            const completed = activeIndex > -1 && i < activeIndex;
            return (
              <span key={stage.label} className="flex items-center whitespace-nowrap">
                {i > 0 && (
                  <span aria-hidden="true" className="mx-1.5 select-none text-[11px] text-chrome-50/30">
                    →
                  </span>
                )}
                <Link
                  to={stage.path}
                  aria-current={active ? 'page' : undefined}
                  data-tour={`tour-workflow-${stage.label.toLowerCase()}`}
                  className={`relative flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light sm:text-[11px] ${
                    active
                      ? 'bg-white/15 text-white ring-1 ring-inset ring-white/25'
                      : completed
                        ? 'text-chrome-50/85 hover:bg-white/10 hover:text-white'
                        : 'text-chrome-50/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {/* Small active indicator — not color alone (a11y). */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-light"
                    />
                  )}
                  {stage.label}
                </Link>
              </span>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
