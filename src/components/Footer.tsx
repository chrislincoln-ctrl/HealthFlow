import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { DEMO_LABEL } from '../data/districts';
import { GlossaryPopover } from './MetricGlossary';

const METHODOLOGY: { area: string; detail: string }[] = [
  { area: 'Real (external data)', detail: 'District names, boundaries and relative geography are real West Bengal geography; district populations are anchored to the Census of India 2011 (censusindia.gov.in) and rounded. This is the only external dataset used.' },
  { area: 'Synthetic (demo data)', detail: 'Inventory levels, daily consumption, demand growth, corridor transit times and the facility (PHC) layer are synthetic, hand-authored demonstration data — clearly labeled SIMULATED NETWORK / DEMO DATA throughout.' },
  { area: 'Forecast model', detail: 'A statistical forecast — weighted moving average + linear trend + weekly seasonality, with an 80% prediction interval. It is deterministic math, not AI; “AI” in this product refers only to the LLM-written prose in the Policy Brief.' },
  { area: 'Risk & optimization', detail: 'Composite risk: weighted six-factor score (Σ weight × value = score). Allocation: greedy nearest-first multi-source fill with reserve-preservation gates and whole-unit shipments.' },
  { area: 'AI layer', detail: 'HealthFlow AI (Gemini primary → NVIDIA fallback) writes narrative prose from engine-computed numbers only; a deterministic mode covers outages. The AI never computes the numbers.' },
  { area: 'Simulation', detail: 'Scenario presets re-run the same shared calculation engine — no separate simulation math.' },
];

/** Known limitations — stated in-app to preempt the harshest judge questions. */
const LIMITATIONS = [
  'Uniform 7-day reserve threshold for every district and medicine line.',
  'Fixed prototype corridor transit times (haversine estimate); no live traffic or weather.',
  'No real-time inventory feed — stock levels are static demo snapshots until a scenario or transfer changes them.',
  'PHC facility rows are a representative synthetic sample per district, not an exhaustive registry.',
  'Forecast confidence intervals are derived from backtest residuals on synthetic history.',
];

export function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="mt-auto bg-chrome text-chrome-50/90">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              {DEMO_LABEL}
            </span>{' '}
            Decision-support prototype — not real government data. All recommendations are for
            demonstration only.
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <GlossaryPopover />
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-chrome-50/80 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
            >
              <Info className="h-3 w-3" aria-hidden="true" />
              Methodology &amp; data provenance
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        {open && (
          <>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded border border-white/15 bg-white/5 px-3 py-3 text-[11px] sm:grid-cols-2">
              {METHODOLOGY.map((m) => (
                <div key={m.area} className="flex gap-1.5">
                  <dt className="shrink-0 font-bold text-chrome-50">{m.area}:</dt>
                  <dd className="text-chrome-50/80">{m.detail}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 rounded border border-white/15 bg-white/5 px-3 py-3 text-[11px]">
              <p className="font-bold text-chrome-50">Known limitations</p>
              <ul role="list" className="mt-1 list-disc space-y-0.5 pl-4 text-chrome-50/80">
                {LIMITATIONS.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
