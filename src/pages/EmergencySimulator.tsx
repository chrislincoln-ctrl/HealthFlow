import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, RotateCcw, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { districts, inventory, simulatorPresets, corridors } from '../data/districts';
import {
  computeAllRisks,
  countBands,
  daysOfCover,
  scenarioOf,
  stockOutDays,
  transitHoursBetween,
} from '../utils/calc';
import { useScenario } from '../state/ScenarioContext';
import { useInterventions } from '../state/InterventionContext';
import { computeResilienceIndex } from '../utils/resilience';
import { isColdChain } from '../data/districts';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import { motion } from 'framer-motion';
import { medicineNameOf } from '../components/medicineName';

export default function EmergencySimulator() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    scenario,
    risks,
    setDemandMultiplier,
    setTransitDelayFactor,
    applyPreset,
    reset,
    isStressed,
  } = useScenario();

  const baseline = useMemo(() => {
    const risks1 = computeAllRisks(districts, inventory, 1);
    const counts = countBands(risks1);
    const shortLines = inventory.filter((r) => stockOutDays(r, 1) < r.reserveThresholdDays);
    return { risks: risks1, counts, shortLines: shortLines.length };
  }, []);

  const scen = scenarioOf(scenario);
  const currentCounts = useMemo(() => countBands(risks), [risks]);
  const currentShortLines = useMemo(
    () => inventory.filter((r) => stockOutDays(r, scen) < r.reserveThresholdDays).length,
    [scen],
  );

  const disruptedCorridorList = useMemo(
    () =>
      corridors.filter((c) =>
        scen.disruptedCorridors.includes(`${c.from}->${c.to}`) ||
        scen.disruptedCorridors.includes(`${c.to}->${c.from}`),
      ),
    [scen.disruptedCorridors],
  );

  const rows = useMemo(() => {
    return districts
      .map((d) => {
        const before = baseline.risks.find((r) => r.district.id === d.id)!;
        const after = risks.find((r) => r.districtId === d.id)!;
        const worstRec = before.worstRecord;
        return { district: d, before, after, worstRec };
      })
      .sort((a, b) => b.after.score - a.after.score);
  }, [baseline.risks, risks]);

  const focusDistrict = params.get('district');

  // Deep link (?preset=combined) applies a named scenario preset.
  useEffect(() => {
    const presetId = params.get('preset');
    if (!presetId) return;
    const preset = simulatorPresets.find((p) => p.id === presetId);
    if (preset) applyPreset(preset);
  }, [params, applyPreset]);

  const transitMatters = disruptedCorridorList.length === 0 && scenario.transitDelayFactor > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Emergency Simulator</h1>
          <p className="text-xs text-slate-450">
            Scenarios feed the same calculation engine every screen uses — no separate simulation math
          </p>
        </div>
      </div>

      {/* Presets + sliders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section data-tour="tour-presets" className="min-w-0 rounded-lg border border-line bg-surface p-4 shadow-panel" aria-labelledby="presets-heading">
          <h2 id="presets-heading" className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <FlaskConical className="h-4 w-4 text-accent" aria-hidden="true" />
            Scenario presets
          </h2>
          <div className="mt-3 space-y-2" role="group" aria-label="Scenario presets">
            {simulatorPresets.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                aria-pressed={scenario.presetId === p.id}
                className={`w-full rounded border px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  scenario.presetId === p.id
                    ? 'border-accent/50 bg-accent-wash dark:bg-accent/20'
                    : 'border-line hover:border-line-soft'
                }`}
              >
                <p className="text-xs font-bold text-ink">{p.label}</p>
                <p className="text-[11px] text-slate-450">{p.description}</p>
              </button>
            ))}
          </div>

          <h2 className="mt-5 flex items-center gap-1.5 text-sm font-bold text-ink">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
            Manual controls
          </h2>
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="demand-slider" className="font-semibold text-ink">
                  Demand stress
                </label>
                <span className="tabular font-bold text-ink">
                  +{Math.round((scenario.demandMultiplier - 1) * 100)}%
                </span>
              </div>
              <input
                id="demand-slider"
                type="range"
                min={1}
                max={1.8}
                step={0.05}
                value={scenario.demandMultiplier}
                onChange={(e) => setDemandMultiplier(Number(e.target.value))}
                className="mt-1.5 w-full accent-[#0E7C7B]"
              />
              <p className="mt-0.5 text-[10px] text-slate-450">Baseline to +80% demand surge</p>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="transit-slider" className="font-semibold text-ink">
                  Transit delay
                </label>
                <span className="tabular font-bold text-ink">
                  +{Math.round((scenario.transitDelayFactor - 1) * 100)}%
                </span>
              </div>
              <input
                id="transit-slider"
                type="range"
                min={1}
                max={1.8}
                step={0.05}
                value={scenario.transitDelayFactor}
                onChange={(e) => setTransitDelayFactor(Number(e.target.value))}
                className="mt-1.5 w-full accent-[#0E7C7B]"
              />
              <p className="mt-0.5 text-[10px] text-slate-450">
                Slows corridors; redistribution transit times scale with this factor
              </p>
            </div>
            <button
              onClick={reset}
              disabled={!isStressed}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-slate-450 ring-1 ring-inset ring-line hover:text-ink disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset to baseline
            </button>
          </div>
        </section>

        {/* Network impact */}
        <section className="space-y-4">
          {!isStressed && (
            <p className="rounded border border-dashed border-line bg-surface px-4 py-3 text-xs leading-relaxed text-slate-450">
              Showing the honest <strong className="text-ink">baseline</strong> — no scenario applied. Run a preset on the
              left (try <button onClick={() => { const p = simulatorPresets.find((x) => x.id === 's30'); if (p) applyPreset(p); }} className="font-semibold text-accent hover:underline">Regional outbreak</button>)
              to see every metric on this page react through the shared calculation engine.
            </p>
          )}

          <div data-tour="tour-impact" aria-labelledby="impact-heading">
            <h2 id="impact-heading" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
              <TrendingUp className="h-4 w-4 text-accent" aria-hidden="true" />
              Network impact — baseline vs scenario
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Critical districts"
                value={
                  <>
                    {baseline.counts.critical}
                    <span className="mx-1 text-slate-450">→</span>
                    {currentCounts.critical}
                  </>
                }
                tone={currentCounts.critical > baseline.counts.critical ? 'critical' : 'neutral'}
              />
              <KpiCard
                label="High districts"
                value={
                  <>
                    {baseline.counts.high}
                    <span className="mx-1 text-slate-450">→</span>
                    {currentCounts.high}
                  </>
                }
                tone={currentCounts.high > baseline.counts.high ? 'warning' : 'neutral'}
              />
              <KpiCard
                label="Lines below reserve"
                value={
                  <>
                    {baseline.shortLines}
                    <span className="mx-1 text-slate-450">→</span>
                    {currentShortLines}
                  </>
                }
                tone={currentShortLines > baseline.shortLines ? 'critical' : 'neutral'}
              />
              <KpiCard
                label="Demand multiplier"
                value={`×${scenario.demandMultiplier.toFixed(2)}`}
                detail={`transit ×${scenario.transitDelayFactor.toFixed(2)}${scenario.presetId ? ' · preset' : ' · manual'}`}
                tone="accent"
              />
            </div>
          </div>

          {/* Scenario-specific explanations */}
          {transitMatters && (
            <p className="rounded border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-slate-450">
              <strong className="text-ink">Why some numbers don't move:</strong> no active transfer currently depends on
              these corridors, so a transit delay has limited immediate impact. It changes projected transit times
              ({' '}
              {(() => {
                const t1 = transitHoursBetween('kolkata', 'nadia', 1);
                const t2 = transitHoursBetween('kolkata', 'nadia', scen);
                return t1 && t2 ? `Kolkata→Nadia ${t1}h → ${t2}h` : '';
              })()}
              ) and would matter the moment a transfer runs — try the{' '}
              <Link to="/redistribution" className="font-semibold text-accent hover:underline">Redistribution Engine</Link>.
            </p>
          )}
          {disruptedCorridorList.length > 0 && (
            <div className="rounded border border-status-critical/40 bg-status-critical/5 px-4 py-3 text-xs leading-relaxed text-slate-450">
              <strong className="text-status-critical">Corridors disrupted:</strong>{' '}
              {disruptedCorridorList
                .map((c) => `${districts.find((d) => d.id === c.from)?.name} → ${districts.find((d) => d.id === c.to)?.name}`)
                .join(', ')}
              . Transfers on these routes are blocked — the{' '}
              <Link to="/redistribution" className="font-semibold text-accent hover:underline">allocation engine</Link>{' '}
              has already excluded affected sources and re-ranked the remainder.
            </div>
          )}
          {scenario.workforceFactor !== 1 && (
            <p className="rounded border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-slate-450">
              <strong className="text-ink">Workforce disruption:</strong> staff availability scaled ×
              {scenario.workforceFactor.toFixed(2)} statewide — workforce-gap risk contributions updated for every
              district below.
            </p>
          )}
          {scenario.bedDemandFactor !== 1 && (
            <p className="rounded border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-slate-450">
              <strong className="text-ink">Bed surge:</strong> occupancy pressure scaled ×
              {scenario.bedDemandFactor.toFixed(2)} — bed-pressure risk contributions updated below.
            </p>
          )}
          <ResilienceImpact />

          {/* District table */}
          <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-panel">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">District risk before and after the scenario</caption>
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-slate-450">
                  <th scope="col" className="px-4 py-2.5 font-semibold">District</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Baseline</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Scenario</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Worst line</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map(({ district, before, after, worstRec }) => {
                  const worsened = after.band !== before.band;
                  return (
                    <tr
                      key={district.id}
                      className={focusDistrict === district.id ? 'bg-accent-wash dark:bg-accent/20' : undefined}
                    >
                      <th scope="row" className="px-4 py-2.5 font-semibold text-ink">
                        {district.name}
                      </th>
                      <td className="px-3 py-2.5">
                        <span className="tabular mr-1.5 font-bold">{before.score}</span>
                        <StatusBadge band={before.band} size="sm" />
                      </td>
                      <td className="px-3 py-2.5">
                        <motion.span
                          key={`${district.id}-${after.score}`}
                          initial={{ opacity: 0.25, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                          className={`tabular mr-1.5 inline-block font-bold ${worsened ? 'text-status-critical' : ''}`}
                        >
                          {after.score}
                        </motion.span>
                        <StatusBadge band={after.band} size="sm" />
                        {worsened && (
                          <span className="ml-1.5 align-middle text-[10px] font-bold uppercase text-status-critical">
                            ↓ worsened
                          </span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2.5 text-slate-450">
                        {worstRec
                          ? `${medicineNameOf(worstRec.medicineId)} · ${daysOfCover(worstRec).toFixed(1)}d cover`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          to={`/redistribution?district=${district.id}${worstRec ? `&medicine=${worstRec.medicineId}` : ''}`}
                          className="font-semibold text-accent-dark dark:text-accent-light hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          Rebalance
                        </Link>
                        <span className="mx-1 text-faint">·</span>
                        <button
                          onClick={() => navigate(`/command-center?district=${district.id}`)}
                          className="font-semibold text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-450">
            Every scenario input (demand multiplier, transit factor, workforce, bed pressure, corridor disruptions)
            enters through the shared calculation engine — the same functions power the Command Center, Demand
            Intelligence, Redistribution, and the Policy Brief.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Baseline vs scenario resilience — the measurable adaptation story. */
function ResilienceImpact() {
  const { scenario, isStressed } = useScenario();
  const { appliedStock } = useInterventions();
  const base = useMemo(() => computeResilienceIndex(1), []);
  const now = useMemo(
    () => computeResilienceIndex(scenario, appliedStock),
    [scenario, appliedStock],
  );
  const delta = now.score - base.score;
  if (!isStressed) return null;

  // What changed — real deltas only, computed not hardcoded.
  const changes: string[] = [];
  if (scenario.demandMultiplier !== 1)
    changes.push(`Demand ×${scenario.demandMultiplier.toFixed(2)} across every forecast trajectory`);
  if (scenario.transitDelayFactor !== 1)
    changes.push(`Transit time ×${scenario.transitDelayFactor.toFixed(2)} on all corridors`);
  if (scenario.workforceFactor !== 1)
    changes.push(`Staff availability ×${scenario.workforceFactor.toFixed(2)}`);
  if (scenario.bedDemandFactor !== 1)
    changes.push(`Bed occupancy pressure ×${scenario.bedDemandFactor.toFixed(2)}`);
  if (scenario.supplyShockFactor > 0)
    changes.push(`${Math.round(scenario.supplyShockFactor * 100)}% of replenishment delayed`);
  if (scenario.coldChainIncident)
    changes.push('Cold-chain incident: temperature-sensitive lines degraded (prototype assessment)');
  if (scenario.disruptedCorridors.length > 0)
    changes.push(`${scenario.disruptedCorridors.length} corridor${scenario.disruptedCorridors.length > 1 ? 's' : ''} closed`);

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-panel" data-tour="resilience-delta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">Resilience impact</h3>
        <p className="tabular text-xs font-semibold text-slate-450">
          {base.score} → <span className={`text-base font-extrabold ${delta < 0 ? 'text-status-critical' : delta > 0 ? 'text-status-stable' : 'text-ink'}`}>{now.score}</span>
          <span className={`ml-1.5 font-bold ${delta < 0 ? 'text-status-critical' : delta > 0 ? 'text-status-stable' : 'text-slate-450'}`}>
            {delta > 0 ? `+${delta}` : delta} points
          </span>
        </p>
      </div>
      {changes.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-450">
          <span className="font-semibold text-ink">What changed:</span> {changes.join(' · ')}.
        </p>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        {now.components.map((c) => {
          const before = base.components.find((b) => b.key === c.key);
          const d = c.value - (before?.value ?? 0);
          return (
            <div key={c.key} className="flex items-center justify-between gap-2" title={c.detail}>
              <span className="text-slate-450">{c.label}</span>
              <span className="tabular font-semibold text-ink">
                {c.value}
                {d !== 0 && (
                  <span className={`ml-1 text-[10px] font-bold ${d < 0 ? 'text-status-critical' : 'text-status-stable'}`}>
                    {d > 0 ? '+' : ''}{d}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 border-t border-line-soft pt-2 text-[10px] text-slate-450">
        Prototype resilience index — illustrative weights, not an official health standard.
        {isColdChain('insulin') && ' Cold-chain degradation applies to temperature-sensitive lines only.'}
      </p>
    </div>
  );
}
