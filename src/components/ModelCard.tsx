import { useState } from 'react';
import { ChevronDown, Sigma } from 'lucide-react';

/**
 * MODEL CARD — "how these numbers are computed" for forecast-driven pages.
 * Two-line collapsed state; expands to the full recipe. Deliberately plain
 * engineering language: the forecast is statistical, never "AI".
 */
export function ModelCard({ context = 'forecast' }: { context?: 'forecast' | 'allocation' }) {
  const [open, setOpen] = useState(false);
  const summary =
    context === 'allocation'
      ? 'How the plan is computed: greedy nearest-first multi-source fill, reserve-preservation gates, whole-unit shipments — deterministic math, not AI.'
      : 'How the forecast is computed: weighted moving average + linear trend + weekly seasonality, 80% interval from backtest residuals — statistical, not AI.';
  return (
    <div className="rounded border border-line bg-surface-2/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-450 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Sigma className="h-3 w-3 shrink-0 text-ai" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-line-soft px-2.5 py-2 text-[11px] leading-relaxed text-slate-450">
          {context === 'allocation' ? (
            <ul role="list" className="list-disc space-y-0.5 pl-4">
              <li>
                Requirement = reserve target − current stock, where the reserve target is{' '}
                <span className="font-semibold text-ink">7 demo days × projected demand</span> (projected, not
                yesterday&apos;s usage).
              </li>
              <li>
                Sources ranked by <span className="font-semibold text-ink">transit time</span>, then surplus; each
                donor keeps its own reserve (cover-after ≥ target) before giving.
              </li>
              <li>
                Whole-unit shipments only (100u lines, 50u insulin). A plan is marked{' '}
                <span className="font-semibold text-status-watch">insufficient</span> when a material gap remains and
                the destination still ends below reserve — escalation to procurement, never styled as success.
              </li>
              <li>Corridor disruption removes a donor from eligibility on both directions of the corridor.</li>
            </ul>
          ) : (
            <ul role="list" className="list-disc space-y-0.5 pl-4">
              <li>
                <span className="font-semibold text-ink">Weighted moving average</span> over the most recent weeks of
                synthetic consumption history captures the level.
              </li>
              <li>
                <span className="font-semibold text-ink">Linear trend</span> from the same history adds growth
                (the district&apos;s demandGrowthPct).
              </li>
              <li>
                <span className="font-semibold text-ink">Weekly seasonality</span> modulates day-of-week demand.
              </li>
              <li>
                The <span className="font-semibold text-ink">80% interval</span> is derived from backtest residuals —
                model uncertainty, not an AI confidence score.
              </li>
              <li>
                Depletion = projected daily demand path subtracted from on-hand stock → days of cover and the
                projected stock-out day.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
