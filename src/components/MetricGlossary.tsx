import { useState } from 'react';
import { BookOpen, Info, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// METRIC GLOSSARY — every derived number in HealthFlow has exactly ONE
// definition, written once here and reused through <DefTerm> tooltips and the
// footer glossary. Scales are named explicitly: per-district composite risk
// and local network risk are 0–100 where HIGHER = WORSE; the resilience index
// is 0–100 where HIGHER = MORE RESILIENT. Never show two differently-scaled
// numbers side by side without these labels.
// ─────────────────────────────────────────────────────────────────────────────

/** One canonical definition per metric. Keep each to a single sentence. */
export const METRIC_DEFS: Record<string, string> = {
  'Composite risk (0–100, higher = worse)':
    'Weighted six-factor pressure score for a district and medicine line: inventory 35% · demand 20% · stock-out proximity 20% · beds 10% · workforce 10% · logistics 5%.',
  'Days of cover':
    'Current stock ÷ mean forecast daily demand (mean of the next 7 forecast days, scenario-adjusted) — a ratio, distinct from the projected stock-out day.',
  'Projected stock-out':
    'First day the day-by-day depletion walk (forecast demand subtracted from stock) reaches zero; “beyond 30d” means no breach inside the 30-day window. A different metric from days of cover.',
  'Reserve target':
    '7 × the same mean forecast daily demand used for days of cover (next-7-forecast-day mean, scenario-adjusted) — the line the allocation engine fills to.',
  'Safe surplus':
    'Units a district holds above its own reserve target; the most it can give without breaching its own reserve.',
  'Priority score (0–100, higher = more urgent)':
    'Calculated queue order for interventions: 50% destination urgency + 30% quantity gap + 20% transit speed — not an AI judgment.',
  'Resilience index (0–100, higher = more resilient)':
    'Network-level health: weighted mean of supply redundancy 25% · reserve coverage 20% · alternative sourcing 20% · route availability 15% · workforce headroom 10% · bed capacity headroom 10%.',
  'Local risk (0–100, higher = worse)':
    'Synthetic pressure state of a participating network in the federation illustration — conceptual, not a measurement.',
};

/**
 * Inline term with its canonical definition on hover/focus. `align="right"`
 * anchors the tooltip to the term's right edge — use near the right side of
 * the page so the (invisible-until-hover) tooltip box never widens the page.
 */
export function DefTerm({
  term,
  align = 'left',
}: {
  term: keyof typeof METRIC_DEFS | string;
  align?: 'left' | 'right';
}) {
  const def = METRIC_DEFS[term];
  return (
    <span className="group relative inline-flex items-center gap-0.5">
      <span className="underline decoration-dotted decoration-faint underline-offset-2">{term}</span>
      {def && (
        <>
          <Info className="h-3 w-3 text-faint" aria-hidden="true" />
          <span
            role="tooltip"
            className={`pointer-events-none absolute top-full z-30 mt-1 w-max max-w-72 rounded border border-line bg-surface-elevated px-2 py-1 text-[10px] font-medium leading-snug text-ink opacity-0 shadow-drawer transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {def}
          </span>
        </>
      )}
    </span>
  );
}

/** Footer glossary — every metric, one line each. Persistent across routes. */
export function GlossaryPopover() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-chrome-50/80 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
      >
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        Metric glossary
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-40 mb-2 w-[min(92vw,34rem)] rounded-lg border border-line bg-surface-elevated p-3 shadow-drawer">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-ink">Metric definitions</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close glossary"
              className="rounded p-1 text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Risk scales run 0–100 with higher = worse. The resilience index runs 0–100 with higher = more resilient.
          </p>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(METRIC_DEFS).map(([term, def]) => (
              <div key={term} className="text-[11px] leading-snug">
                <dt className="font-bold text-ink">{term}</dt>
                <dd className="text-slate-450">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
