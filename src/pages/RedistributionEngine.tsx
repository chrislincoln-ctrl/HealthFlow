import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, Clock, Route as RouteIcon } from 'lucide-react';
import { DefTerm } from '../components/MetricGlossary';
import { ModelCard } from '../components/ModelCard';
import type { InventoryRecord } from '../types';
import { districts, inventory } from '../data/districts';
import {
  buildAllocationPlan,
  daysOfCover,
  riskBand,
  riskScore,
  stockOutDays,
  transitHoursBetween,
} from '../utils/calc';
import { reserveTargetUnits } from '../utils/forecast';
import { useScenario } from '../state/ScenarioContext';
import { surplusUnits } from '../utils/calc';
import { useTourActions } from '../state/tourActions';
import { StatusBadge } from '../components/StatusBadge';
import { TransferBadge } from '../components/TransferBadge';
import { NetworkMap } from '../components/NetworkMap';
import type { NetworkCorridorStatus, NetworkMapCorridor, NetworkMapNode } from '../components/NetworkMap';
import { corridors as corridorData } from '../data/districts';
import { riskScore as scoreOf } from '../utils/calc';

const medicineName = (id: string) =>
  inventory.find((r) => r.medicineId === id)?.medicineId && id === 'ors'
    ? 'ORS'
    : { ors: 'ORS', paracetamol: 'Paracetamol', amoxicillin: 'Amoxicillin', insulin: 'Insulin', saline: 'IV Fluids (Saline)' }[id as 'ors'] ?? id;

export default function RedistributionEngine() {
  const [params] = useSearchParams();
  const { scenario } = useScenario();
  const tourActions = useTourActions();
  const multiplier = scenario.demandMultiplier;

  const shortageOptions = useMemo(
    () =>
      inventory.filter(
        (r) => r.districtId !== 'hooghly' && r.districtId !== 'kolkata' && stockOutDays(r, scenario) < r.reserveThresholdDays,
      ),
    [scenario],
  );

  const [districtId, setDistrictId] = useState<string>(
    params.get('district') ?? shortageOptions[0]?.districtId ?? 'nadia',
  );
  const [medicineId, setMedicineId] = useState<string>(
    params.get('medicine') ?? shortageOptions[0]?.medicineId ?? 'ors',
  );

  useEffect(() => {
    const d = params.get('district');
    const m = params.get('medicine');
    if (d) setDistrictId(d);
    if (m) setMedicineId(m);
  }, [params]);

  const shortageDistrict = districts.find((d) => d.id === districtId) ?? districts[0];
  const shortage: InventoryRecord =
    inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId) ??
    inventory.find((r) => r.districtId === districtId) ??
    inventory[0];

  const sourcesForEngine = useMemo(
    () =>
      districts
        .filter((d) => d.id !== districtId)
        .map((d) => ({
          record: inventory.find(
            (r) => r.districtId === d.id && r.medicineId === shortage.medicineId,
          ),
          district: d,
        }))
        .filter((x): x is { record: InventoryRecord; district: typeof shortageDistrict } =>
          Boolean(x.record),
        ),
    [districtId, shortage.medicineId],
  );

  const plan = useMemo(
    () => buildAllocationPlan(shortage, shortageDistrict, sourcesForEngine, scenario),
    [shortage, shortageDistrict, sourcesForEngine, scenario],
  );

  // Compatibility object for components that still consume a single-leg shape:
  // first leg + THAT leg's own arithmetically true outcome (the plan-wide
  // outcome belongs to the plan, never to one leg).
  const recommendation = plan && plan.legs.length
    ? {
        fromDistrictId: plan.legs[0].fromDistrictId,
        toDistrictId: plan.toDistrictId,
        medicineId: plan.medicineId,
        quantity: plan.legs[0].quantity,
        transitHours: plan.legs[0].transitHours,
        sourceSurplus: plan.legs[0].sourceSurplusBefore,
        daysOfCoverBefore: plan.daysOfCoverBefore,
        daysOfCoverAfter: plan.legs[0].destinationCoverAfter,
        bandBefore: plan.bandBefore,
        bandAfter: plan.bandAfter,
        shortfallUnits: Math.max(0, plan.requiredUnits - plan.legs[0].quantity),
      }
    : null;

  const [transferSimulated, setTransferSimulated] = useState(false);
  useEffect(() => {
    setTransferSimulated(false);
  }, [districtId, medicineId]);

  // Guided tour can set the transfer as simulated programmatically (its own
  // flag — page-local `transferSimulated` stays untouched for real clicks).
  useEffect(() => {
    if (tourActions?.tourTransferSimulated && recommendation) setTransferSimulated(true);
  }, [tourActions?.tourTransferSimulated, recommendation]);

  const displayRecord: InventoryRecord = useMemo(() => {
    // Simulating lands the FULL plan — every leg of it — so the coverage
    // shown after “Transfer applied” is the plan-wide outcome.
    if (!plan || !transferSimulated) return shortage;
    return { ...shortage, currentStock: shortage.currentStock + plan.transferredUnits };
  }, [shortage, plan, transferSimulated]);

  const onSelectDistrict = (id: string) => {
    setDistrictId(id);
    setMedicineId(
      inventory.find((r) => r.districtId === id && r.medicineId === medicineId)
        ? medicineId
        : (inventory.find((r) => r.districtId === id)?.medicineId ?? medicineId),
    );
  };

  const mapNodes: NetworkMapNode[] = useMemo(
    () =>
      districts.map((d) => {
        const firstRecord = inventory.find((r) => r.districtId === d.id)!;
        const s = scoreOf(d, firstRecord, scenario);
        return {
          id: d.id,
          name: d.shortName,
          score: s,
          band: riskBand(s),
          selected: d.id === districtId,
          // Transfer endpoint rings are derived by NetworkMap from the active
          // leg list (all sources of a multi-source plan), not per-node here.
        };
      }),
    [districtId, recommendation, scenario],
  );

  const mapCorridors: NetworkMapCorridor[] = useMemo(
    () =>
      corridorData.map((c) => {
        // Active when THIS corridor carries ANY leg of the plan — with a
        // multi-source plan both source corridors light up, not just the first.
        const isRecommended =
          plan !== null &&
          plan.legs.some(
            (l) =>
              (c.from === l.fromDistrictId && c.to === plan.toDistrictId) ||
              (c.to === l.fromDistrictId && c.from === plan.toDistrictId),
          );
        const sourceBand = districts.find((d) => d.id === c.from)!.riskBand;
        const disrupted =
          scenario.disruptedCorridors.includes(`${c.from}->${c.to}`) ||
          scenario.disruptedCorridors.includes(`${c.to}->${c.from}`);
        const status: NetworkCorridorStatus = disrupted
          ? 'disrupted'
          : isRecommended && transferSimulated
            ? 'active'
            : scenario.transitDelayFactor > 1
              ? 'at-risk'
              : sourceBand === 'high' || sourceBand === 'critical'
                ? 'at-risk'
                : 'available';
        return { from: c.from, to: c.to, status };
      }),
    [recommendation, districtId, transferSimulated, scenario],
  );

  // Ranked source table (why THIS source / why not that one).
  // INSUFFICIENT — ESCALATE: the plan cannot lift the destination to its reserve
  // target (a residual rounding gap on a met target does not count). Amber
  // treatment + explicit escalation language; also surfaces in the Action
  // Center and Command Center so the district still reads as at-risk.
  const insufficient = Boolean(
    plan &&
      plan.remainingGapUnits > 0 &&
      plan.daysOfCoverAfter < shortage.reserveThresholdDays,
  );

  const sourceRows = useMemo(
    () =>
      sourcesForEngine
        .map((src) => {
          const transit = transitHoursBetween(src.district.id, districtId, scenario);
          const disrupted =
            scenario.disruptedCorridors.includes(`${src.district.id}->${districtId}`) ||
            scenario.disruptedCorridors.includes(`${districtId}->${src.district.id}`);
          const leg = plan?.legs.find((l) => l.fromDistrictId === src.district.id);
          const surplus = surplusUnits(src.record, scenario);
          return {
            id: src.district.id,
            name: src.district.name,
            transit,
            disrupted,
            surplus,
            allocated: leg?.quantity ?? 0,
            coverAfter: leg?.sourceCoverAfter ?? null,
            eligible: Boolean(transit !== null && !disrupted && surplus >= 100),
          };
        })
        .sort((a, b) => b.allocated - a.allocated || (a.transit ?? 99) - (b.transit ?? 99)),
    [sourcesForEngine, districtId, plan, scenario],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Redistribution Engine</h1>
          <p className="text-xs text-slate-450">
            Multi-source allocation from current simulated inventory — prototype allocation logic, one shared calculation engine
          </p>
          <div className="mt-2">
            <ModelCard context="allocation" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT: the problem */}
        <section data-tour="tour-shortage" className="rounded-lg border border-line bg-surface p-4 shadow-panel">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-450">
            Shortage district
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Shortage district">
            {['nadia', 'howrah', 'north24pgs', 'malda'].map((id) => {
              const d = districts.find((x) => x.id === id)!;
              return (
                <button
                  key={id}
                  onClick={() => onSelectDistrict(id)}
                  aria-pressed={districtId === id}
                  className={`rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    districtId === id ? 'bg-chrome text-white' : 'bg-surface-2 text-slate-450 hover:text-ink'
                  }`}
                >
                  {d.shortName}
                </button>
              );
            })}
          </div>

          <h2 className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-450">
            Medicine line
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Medicine line">
            {inventory
              .filter((r) => r.districtId === districtId)
              .map((r) => (
                <button
                  key={r.medicineId}
                  onClick={() => setMedicineId(r.medicineId)}
                  aria-pressed={medicineId === r.medicineId}
                  className={`rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    medicineId === r.medicineId
                      ? 'bg-accent-wash dark:bg-accent/20 text-accent-dark dark:text-accent-light ring-1 ring-inset ring-accent/40'
                      : 'bg-surface-2 text-slate-450 hover:text-ink'
                  }`}
                >
                  {medicineName(r.medicineId)}
                </button>
              ))}
          </div>

          <div data-tour="tour-coverage-change" className="mt-4 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">
                {medicineName(shortage.medicineId)} — {shortageDistrict.name}
              </p>
              <StatusBadge
                band={riskBand(riskScore(shortageDistrict, displayRecord, scenario))}
                size="sm"
              />
            </div>
            <dl className="tabular mt-2 space-y-1 text-xs text-slate-450">
              <div className="flex justify-between">
                <dt>Stock on hand</dt>
                <dd className="font-semibold text-ink">{displayRecord.currentStock.toLocaleString()} u</dd>
              </div>
              <div className="flex justify-between" title="Estimated days current inventory can support projected demand under the selected scenario.">
                <dt className="flex items-center gap-1">
                  <DefTerm term="Days of cover" />
                </dt>
                <dd className="font-semibold text-ink">
                  {daysOfCover(displayRecord, scenario).toFixed(1)}d
                </dd>
              </div>
              <div className="flex justify-between" title="Reserve target = 7 days of projected demand — the prototype coverage goal.">
                <dt className="flex items-center gap-1">
                  <DefTerm term="Reserve target" />
                </dt>
                <dd className="font-semibold text-ink">
                  {reserveTargetUnits(displayRecord, multiplier).toLocaleString()} u
                </dd>
              </div>
              <div className="flex justify-between" title="First day the forecast depletion path reaches zero.">
                <dt className="flex items-center gap-1">
                  <DefTerm term="Projected stock-out" />
                </dt>
                <dd className="font-semibold text-ink">
                  {stockOutDays(displayRecord, scenario) < 45 ? `+${stockOutDays(displayRecord, scenario)}d` : 'beyond 30d'}
                </dd>
              </div>
            </dl>
            {transferSimulated && recommendation && (
              <p
                data-tour="tour-transfer-result"
                role="status"
                className={`mt-2 rounded px-2 py-1 text-[11px] font-semibold ${
                  insufficient
                    ? 'bg-status-watch/10 text-status-watch'
                    : 'bg-status-stable/10 text-status-stable'
                }`}
              >
                {insufficient
                  ? `Transfer applied — redistribution insufficient, ${plan?.remainingGapUnits.toLocaleString()} u gap remains; escalate to procurement`
                  : plan && plan.remainingGapUnits === 0
                    ? 'Transfer applied — reserve target restored'
                    : `Transfer applied — gap of ${plan?.remainingGapUnits.toLocaleString()} units remains`}
              </p>
            )}
          </div>
        </section>

        {/* RIGHT: the solution */}
        <section className="space-y-4">
          {/* Ranked sources with explicit allocation */}
          <div data-tour="tour-sources" className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-450">
              Eligible sources — multi-source allocation
            </h2>
            {plan ? (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-450">{plan.reason}</p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-450">
                No intervention recommended: the line is above its reserve target, or no eligible source can give more
                without breaching its own reserve.
              </p>
            )}
            <ol role="list" className="mt-2 space-y-2">
              {sourceRows.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between rounded border px-3 py-2 ${
                    s.allocated > 0 ? 'border-accent/40 bg-accent-wash dark:bg-accent/20' : 'border-line'
                  } ${s.eligible ? '' : 'opacity-60'}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.name}</p>
                    <p className="tabular text-[11px] text-slate-450">
                      <DefTerm term="Safe surplus" /> {s.surplus.toLocaleString()} u
                      {s.coverAfter !== null && ` ·                      keeps ${s.coverAfter.toFixed(1)}d cover after transfer`}
                      {!s.eligible && (s.disrupted ? ' · corridor disrupted' : ' · available stock is below the reserve threshold')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular inline-flex items-center gap-1 text-xs font-semibold text-ink">
                      <Clock className="h-3 w-3 text-accent" aria-hidden="true" />
                      {s.transit !== null ? `${s.transit}h` : '—'}
                    </p>
                    {s.allocated > 0 && (
                      <p className="tabular mt-0.5 text-[11px] font-bold text-accent-dark dark:text-accent-light">
                        sends {s.allocated.toLocaleString()} u
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Recommendation card */}
          {plan ? (
            <div
              data-tour="tour-recommendation"
              className={`rounded-lg border bg-surface p-4 shadow-panel border-l-4 ${
                insufficient
                  ? 'border-status-watch/60 border-l-status-watch'
                  : 'border-line border-l-ai'
              }`}
            >
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <ArrowRightLeft className="h-4 w-4 text-ai" aria-hidden="true" />
                Recommended allocation
                <span className="rounded bg-ai-wash dark:bg-ai/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ai-dark dark:text-ai-light">
                  {plan.legs.length} source{plan.legs.length > 1 ? 's' : ''}
                </span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {plan.legs.map((leg) => (
                  <TransferBadge
                    key={leg.fromDistrictId}
                    insufficient={insufficient}
                    rec={{
                      fromDistrictId: leg.fromDistrictId,
                      toDistrictId: plan.toDistrictId,
                      medicineId: plan.medicineId,
                      quantity: leg.quantity,
                      transitHours: leg.transitHours,
                      sourceSurplus: leg.sourceSurplusBefore,
                      // Per-leg truth: each badge shows the cover after ITS
                      // units land — the plan total is stated once below.
                      daysOfCoverBefore: plan.daysOfCoverBefore,
                      daysOfCoverAfter: leg.destinationCoverAfter,
                      scoreBefore: plan.scoreBefore,
                      scoreAfter: plan.scoreAfter,
                      bandBefore: plan.bandBefore,
                      bandAfter: plan.bandAfter,
                      shortfallUnits: Math.max(0, plan.requiredUnits - leg.quantity),
                      legs: plan.legs,
                      fullPlanQuantity: plan.transferredUnits,
                      fullPlanCoverAfter: plan.daysOfCoverAfter,
                      fullPlanGapUnits: plan.remainingGapUnits,
                    }}
                  />
                ))}
              </div>
              {insufficient && (
                <p
                  role="status"
                  className="mt-2 flex items-start gap-1.5 rounded bg-status-watch/10 px-3 py-2 text-[11px] font-semibold text-status-watch dark:bg-status-watch/20"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Redistribution insufficient — escalate to procurement. This transfer moves{' '}
                  {plan.transferredUnits.toLocaleString()} u but leaves a {plan.remainingGapUnits.toLocaleString()} u
                  gap below the {plan.targetUnits.toLocaleString()} u reserve target; the district remains at risk
                  until the gap is closed by procurement or further sources come online.
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-slate-450">
                Required {plan.requiredUnits.toLocaleString()} u to reach the {plan.targetUnits.toLocaleString()} u
                reserve target ({shortage.reserveThresholdDays}d × projected demand).{' '}
                {plan.remainingGapUnits > 0
                  ? `${plan.transferredUnits.toLocaleString()} u allocated; ${plan.remainingGapUnits.toLocaleString()} u gap — no additional full shipment available under the current rounding rule without a source breaching its own reserve.`
                  : `All ${plan.transferredUnits.toLocaleString()} u allocated from ${plan.legs.length} source${plan.legs.length > 1 ? 's' : ''}; reserve target restored.`}{' '}
                Cover {plan.daysOfCoverBefore.toFixed(1)}d → {plan.daysOfCoverAfter.toFixed(1)}d; projected stock-out{' '}
                {plan.projectedStockOutBefore !== null && plan.projectedStockOutBefore < 45
                  ? `+${plan.projectedStockOutBefore}d → ${plan.projectedStockOutAfter !== null && plan.projectedStockOutAfter < 45 ? `+${plan.projectedStockOutAfter}d` : 'beyond 30d'}`
                  : 'unchanged (no breach in window)'}
                .
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  data-tour="tour-simulate-transfer"
                  onClick={() => setTransferSimulated(true)}
                  disabled={transferSimulated}
                  className="inline-flex items-center gap-1.5 rounded bg-ai px-3.5 py-2 text-xs font-semibold text-white hover:bg-ai-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-dark"
                >
                  <RouteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {transferSimulated ? 'Transfer applied' : 'Simulate Transfer'}
                </button>
                {transferSimulated && (
                  <button
                    onClick={() => setTransferSimulated(false)}
                    className="rounded px-3 py-2 text-xs font-semibold text-slate-450 ring-1 ring-inset ring-line hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Undo
                  </button>
                )}
                <Link
                  to="/action-center"
                  className="rounded px-3 py-2 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Send to Action Center →
                </Link>
              </div>
            </div>
          ) : (
            <div data-tour="tour-recommendation" className="rounded-lg border border-dashed border-line bg-surface p-4 text-center shadow-panel">
              <p className="text-sm font-semibold text-ink">No transfer recommended</p>
              <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-slate-450">
                {medicineName(shortage.medicineId)} in {shortageDistrict.name} is above its reserve target, so a transfer
                would add no operational benefit — the prototype allocation logic refuses pointless dispatches.
              </p>
            </div>
          )}

          {/* Transfer route on the SHARED network map */}
          <div
            data-tour="tour-map-transfer"
            className="rounded-lg border border-line bg-surface p-4 shadow-panel"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Transfer route</h2>
              <span className="tabular text-[11px] text-slate-450">
                {plan ? `${Math.max(...plan.legs.map((l) => l.transitHours))}h longest leg` : 'no corridor'}
              </span>
            </div>
            <p className="mb-2 text-[11px] text-slate-450">
              <span className="tabular font-semibold text-ink">{mapCorridors.length}</span> supply corridors
              {mapCorridors.some((c) => c.status === 'disrupted') && (
                <span className="ml-1.5 font-semibold text-status-critical">· disrupted by scenario</span>
              )}
            </p>
            <NetworkMap
              mode="transfer"
              nodes={mapNodes}
              corridors={mapCorridors}
              activeTransfers={
                plan
                  ? plan.legs.map((l) => ({
                      from: l.fromDistrictId,
                      to: plan.toDistrictId,
                      annotation:
                        transferSimulated && l.quantity > 0
                          ? `${l.quantity.toLocaleString()} ${medicineName(plan.medicineId).split(' ')[0]} · ${l.transitHours}h`
                          : null,
                    }))
                  : []
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
