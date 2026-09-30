import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchCheck } from 'lucide-react';
import { FactorBars } from '../components/FactorBars';
import { DefTerm } from '../components/MetricGlossary';
import { useScenario } from '../state/ScenarioContext';
import { riskFactors, riskBand, daysOfCover, stockOutDays } from '../utils/calc';
import { computeResilienceIndex } from '../utils/resilience';
import { districts, inventory } from '../data/districts';
import { districtAggregates, districtFacilitySignals } from '../data/phc';
import { useInterventions } from '../state/InterventionContext';

// ─────────────────────────────────────────────────────────────────────────────
// UNDERSTAND — the root-cause stage of the core loop. OBSERVE shows WHERE the
// risk is; this page explains WHY: the six weighted factors driving each
// district's composite score, the facility layer behind them, and the
// district's structural context. One shared calculation engine — this page
// re-derives nothing.
// ─────────────────────────────────────────────────────────────────────────────

export default function Understand() {
  const { scenario, risks } = useScenario();
  const { appliedStock } = useInterventions();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('district') ?? risks[0]?.districtId ?? 'nadia';

  const district = districts.find((d) => d.id === selectedId) ?? districts[0];
  const risk = risks.find((r) => r.districtId === district.id);

  // Worst inventory line for the selected district — same engine as the drawer.
  const worst = useMemo(() => {
    const recs = inventory
      .filter((r) => r.districtId === district.id)
      .map((r) => ({ r, cover: daysOfCover(r, scenario) }))
      .sort((a, b) => a.cover - b.cover);
    return recs[0] ?? null;
  }, [district.id, scenario]);

  const factors = useMemo(
    () => (worst ? riskFactors(district, worst.r, scenario) : []),
    [district, worst],
  );

  const signals = useMemo(() => districtFacilitySignals(district.id), [district.id]);
  const agg = useMemo(() => districtAggregates(district.id), [district.id]);
  const resilience = useMemo(
    () => computeResilienceIndex(scenario, appliedStock),
    [scenario, appliedStock],
  );

  const bandTone =
    risk?.band === 'critical'
      ? 'text-status-critical'
      : risk?.band === 'high'
        ? 'text-status-high'
        : risk?.band === 'watch'
          ? 'text-status-watch'
          : 'text-status-stable';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Root-Cause Explorer</h1>
          <p className="text-xs text-slate-450">
            Why each district reads the way it does — the weighted factors, the facility layer, and the
            structural context behind every composite score.
          </p>
        </div>
        <span className="rounded bg-accent-wash px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-dark dark:bg-accent/20 dark:text-accent-light">
          Root-cause drill-down
        </span>
      </div>

      {/* District selector — the six modeled districts, ranked by risk */}
      <div
        role="group"
        aria-label="Select district"
        className="flex flex-wrap gap-1.5"
      >
        {risks.map((r) => (
          <button
            key={r.districtId}
            onClick={() => setParams(r.districtId === 'nadia' ? {} : { district: r.districtId })}
            aria-pressed={r.districtId === district.id}
            className={`rounded border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              r.districtId === district.id
                ? 'border-accent/50 bg-accent-wash text-accent-dark dark:bg-accent/20 dark:text-accent-light'
                : 'border-line bg-surface text-slate-450 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {r.districtName} · {r.score}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT: factor decomposition */}
        <section className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <SearchCheck className="h-4 w-4 text-accent" aria-hidden="true" />
              Why {district.name} reads{' '}
              <span className={`uppercase ${bandTone}`}>{risk?.band ?? '—'}</span>
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-450">
              Composite risk{' '}
              <DefTerm term="Composite risk (0–100, higher = worse)" />
              {' '}for the worst line{' '}
              {worst ? (
                <>
                  — <span className="font-semibold text-ink">{worst.r.medicineId.toUpperCase()}</span> at{' '}
                  <span className="tabular font-semibold text-ink">
                    {worst.cover.toFixed(1)}
                  </span>{' '}
                  <DefTerm term="Days of cover" /> — decomposed into six weighted factors. Every bar is a
                  visible input; Σ(weight × value) = score.
                </>
              ) : (
                ' — no tracked inventory lines.'
              )}
            </p>
            {factors.length > 0 && (
              <div className="mt-3">
                <FactorBars factors={factors} />
              </div>
            )}
            {worst && (
              <p className="mt-3 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-slate-450">
                <span className="font-semibold text-ink">Depletion path:</span>{' '}
                <DefTerm term="Projected stock-out" /> in{' '}
                <span className="tabular font-semibold text-ink">
                  {stockOutDays(worst.r, scenario) < 45 ? `${stockOutDays(worst.r, scenario)}d` : 'beyond the 30-day window'}
                </span>
                ; reserve target {Math.round((worst.r.dailyConsumption * (1 + worst.r.demandGrowthPct / 100) * worst.r.reserveThresholdDays)).toLocaleString()} u
                against {worst.r.currentStock.toLocaleString()} u on hand.
              </p>
            )}
          </div>

          {/* Structural context */}
          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="text-sm font-bold text-ink">{district.name} — structural context</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-line px-2.5 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Population</dt>
                <dd className="tabular mt-0.5 font-bold text-ink">{(district.population / 1_000_000).toFixed(1)}M</dd>
              </div>
              <div className="rounded border border-line px-2.5 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Bed utilization</dt>
                <dd className="tabular mt-0.5 font-bold text-ink">{district.bedUtilization}%</dd>
              </div>
              <div className="rounded border border-line px-2.5 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Staff availability</dt>
                <dd className="tabular mt-0.5 font-bold text-ink">{district.staffAvailability}%</dd>
              </div>
              <div className="rounded border border-line px-2.5 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">
                  Logistics vulnerability
                </dt>
                <dd className="tabular mt-0.5 font-bold text-ink">{district.logisticsVulnerability}/100</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-450">
              Beds, workforce and logistics feed the composite score directly (weights 10/10/5%); they are
              district constants in the demo dataset, not live feeds.
            </p>
          </div>
        </section>

        {/* RIGHT: facility layer + network contrast */}
        <section className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="text-sm font-bold text-ink">The facility layer behind the alert</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-450">
              District risk aggregates from a seeded synthetic PHC network —{' '}
              <span className="font-semibold text-ink">{signals.total}</span> facilities shown of{' '}
              {district.phcs} in the district ({agg.beds} beds, {agg.staffAvailable}/{agg.staffTotal} staff
              available). <span className="font-semibold text-status-watch">{signals.elevated} elevated</span>,{' '}
              <span className="font-semibold text-status-critical">
                {signals.projectedBreach} projected to breach reserve
              </span>
              . Expand any district in the Command Center drawer to inspect individual PHCs.
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-status-critical"
                style={{ width: `${signals.total ? (signals.elevated / signals.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-faint">
              Share of modeled facilities elevated (band high or critical)
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="text-sm font-bold text-ink">One district vs the network</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-450">
              Two different scales, labeled side by side —{' '}
              <DefTerm term="Composite risk (0–100, higher = worse)" /> for the district against the{' '}
              <DefTerm term="Resilience index (0–100, higher = more resilient)" /> for the whole network
              (currently {resilience.score}, band {resilience.band}).
            </p>
            <ol role="list" className="mt-3 space-y-1.5">
              {risks.map((r) => {
                const d = districts.find((x) => x.id === r.districtId)!;
                const recs = inventory.filter((x) => x.districtId === r.districtId);
                const worstCover = Math.min(...recs.map((x) => daysOfCover(x, scenario)));
                return (
                  <li
                    key={r.districtId}
                    className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                      r.districtId === district.id ? 'border-accent/50 bg-accent-wash/60 dark:bg-accent/10' : 'border-line'
                    }`}
                  >
                    <span className="font-semibold text-ink">{d.name}</span>
                    <span className="tabular text-slate-450">
                      worst cover {worstCover.toFixed(1)}d ·{' '}
                      <span className={`font-bold uppercase ${r.band === 'critical' ? 'text-status-critical' : r.band === 'high' ? 'text-status-high' : r.band === 'watch' ? 'text-status-watch' : 'text-status-stable'}`}>
                        {riskBand(r.score)}
                      </span>{' '}
                      {r.score}
                      <span className="text-faint"> /100 risk</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

    </div>
  );
}
