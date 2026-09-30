import type { InventoryRecord, District, RiskBandName, RiskFactor, ComputedRisk, AllocationPlan, AllocationLeg, ScenarioState, TransferRecommendation } from '../types';
import { DISTRICT_COORDS, districts, isColdChain } from '../data/districts';
import {
  forecastDaysOfCover,
  projectedStockOutDay,
  forecastDemand,
  reserveTargetUnits,
  roundShipment,
} from './forecast';

// ─────────────────────────────────────────────────────────────────────────────
// ONE CALCULATION ENGINE. Every screen (Command Center, District Intelligence,
// Demand Intelligence, Redistribution, Action Center, Simulator, Policy Brief)
// calls THESE functions — no page re-implements risk, cover, stock-out, or
// allocation math. Scenario context (demand ×, transit ×, workforce, beds,
// disrupted corridors) enters here and nowhere else.
// ─────────────────────────────────────────────────────────────────────────────

// ── Scenario helpers ──────────────────────────────────────────────────────────

export function scenarioOf(s?: Partial<ScenarioState> | number): Required<ScenarioState> {
  if (typeof s === 'number') {
    return { demandMultiplier: s, transitDelayFactor: 1, workforceFactor: 1, bedDemandFactor: 1, disruptedCorridors: [], supplyShockFactor: 0, coldChainIncident: false, presetId: null };
  }
  return {
    demandMultiplier: s?.demandMultiplier ?? 1,
    transitDelayFactor: s?.transitDelayFactor ?? 1,
    workforceFactor: s?.workforceFactor ?? 1,
    bedDemandFactor: s?.bedDemandFactor ?? 1,
    disruptedCorridors: s?.disruptedCorridors ?? [],
    supplyShockFactor: s?.supplyShockFactor ?? 0,
    coldChainIncident: s?.coldChainIncident ?? false,
    presetId: s?.presetId ?? null,
  };
}

/** True when the scenario knocks out this corridor ("from->to" id). */
export function corridorDisrupted(corridorId: string, s?: Partial<ScenarioState> | number): boolean {
  return scenarioOf(s).disruptedCorridors.includes(corridorId);
}

/** Transit hours with the scenario's delay factor applied. */
export function transitHoursBetween(
  fromId: string,
  toId: string,
  s?: Partial<ScenarioState> | number,
): number | null {
  const { transitDelayFactor } = scenarioOf(s);
  const dist = DISTRICT_COORDS[fromId];
  const dest = DISTRICT_COORDS[toId];
  if (!dist || !dest) return null;
  // Prototype transit estimate: haversine distance ÷ configurable average
  // speed, ×1.35 road factor + 0.5h load/unload. Deliberately simple and
  // labeled as such in the UI.
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(dest.lat - dist.lat);
  const dLon = toRad(dest.lon - dist.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(dist.lat)) * Math.cos(toRad(dest.lat)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a));
  const SPEED_KMH = 38; // prototype average transport speed, incl. stops
  const raw = ((km * 1.35) / SPEED_KMH + 0.5) * transitDelayFactor;
  return Math.round(raw * 10) / 10;
}

// ── Core stock metrics (forecast-driven) ─────────────────────────────────────

/**
 * Effective stock after scenario shocks: a supply shock (delayed
 * replenishment) removes a fraction of on-hand stock; a cold-chain incident
 * degrades temperature-sensitive lines (prototype assessment — insulin is
 * the cold-chain line in this dataset).
 */
export function effectiveStock(r: InventoryRecord, s?: Partial<ScenarioState> | number): number {
  const scen = scenarioOf(s);
  let stock = r.currentStock * (1 - scen.supplyShockFactor);
  if (scen.coldChainIncident && isColdChain(r.medicineId)) {
    stock *= 0.4; // 60% of cold-chain stock compromised — prototype assumption
  }
  return Math.round(stock);
}

/** The record as the engine sees it, with scenario-adjusted stock. */
export function scenarioRecord(r: InventoryRecord, s?: Partial<ScenarioState> | number): InventoryRecord {
  return { ...r, currentStock: effectiveStock(r, s) };
}

/** Projected daily demand at a scenario multiplier (mean forecast rate). */
export function projectedDemand(r: InventoryRecord, multiplier = 1): number {
  const f = forecastDemand(r, multiplier, 7);
  return f.forecast.reduce((s, p) => s + p.units, 0) / f.forecast.length;
}

/**
 * DAYS OF COVER — estimated days current inventory supports projected demand
 * on the forecast trajectory (NOT stock ÷ today's usage). Scenario shocks
 * (supply delay, cold-chain incident) reduce the effective stock first.
 */
export function daysOfCover(r: InventoryRecord, s?: Partial<ScenarioState> | number): number {
  const scen = scenarioOf(s);
  return forecastDaysOfCover(scenarioRecord(r, scen), scen.demandMultiplier);
}

/**
 * PROJECTED STOCK-OUT — first day the forecast depletion path hits zero.
 * Falls back to a capped 45 (beyond the 30-day projection window).
 */
export function stockOutDays(r: InventoryRecord, s?: Partial<ScenarioState> | number): number {
  const scen = scenarioOf(s);
  return projectedStockOutDay(scenarioRecord(r, scen), scen.demandMultiplier, 30).day ?? 45;
}

export function surplusUnits(r: InventoryRecord, s?: Partial<ScenarioState> | number): number {
  const scen = scenarioOf(s);
  const target = reserveTargetUnits(r, scen.demandMultiplier);
  return Math.max(0, effectiveStock(r, scen) - target);
}

// ── Composite risk score (explainable, reconciling factors) ──────────────────
//
// Illustrative prototype weights — the UI labels them as such, never as
// medically validated values. Contributions below reconcile exactly:
// Σ(weight × value) = score.

export const RISK_WEIGHTS = {
  inventory: 0.3, // Inventory pressure
  demand: 0.2, // Demand acceleration
  stockOut: 0.25, // Stock-out proximity
  beds: 0.1, // Bed pressure
  workforce: 0.1, // Workforce gap
  logistics: 0.05, // Logistics vulnerability
} as const;

export function riskScore(
  d: District,
  r: InventoryRecord,
  s?: Partial<ScenarioState> | number,
): number {
  const scen = scenarioOf(s);
  return Math.round(riskFactors(d, r, scen).reduce((sum, f) => sum + f.weighted, 0));
}

export function riskBand(score: number): RiskBandName {
  if (score >= 55) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 35) return 'watch';
  return 'stable';
}

/** The six weighted factors for one district+medicine pair. Σweighted = score. */
export function riskFactors(
  d: District,
  r: InventoryRecord,
  s?: Partial<ScenarioState> | number,
): RiskFactor[] {
  const scen = scenarioOf(s);
  const doc = daysOfCover(r, scen);
  const so = stockOutDays(r, scen);
  const inventoryPressure = 100 * Math.max(0, 1 - Math.min(doc, 14) / 14);
  const demandAcceleration = Math.min(r.demandGrowthPct, 100);
  const stockOutProximity = 100 * Math.max(0, 1 - Math.min(so, 14) / 14);
  const bedPressure = Math.min(100, d.bedUtilization * scen.bedDemandFactor);
  const workforcePressure = Math.min(100, 100 - d.staffAvailability * scen.workforceFactor);
  const logisticsVuln = d.logisticsVulnerability;

  return [
    { key: 'inventory', label: 'Inventory pressure', weight: RISK_WEIGHTS.inventory, value: inventoryPressure, weighted: RISK_WEIGHTS.inventory * inventoryPressure },
    { key: 'demand', label: 'Demand acceleration', weight: RISK_WEIGHTS.demand, value: demandAcceleration, weighted: RISK_WEIGHTS.demand * demandAcceleration },
    { key: 'stockout', label: 'Stock-out proximity', weight: RISK_WEIGHTS.stockOut, value: stockOutProximity, weighted: RISK_WEIGHTS.stockOut * stockOutProximity },
    { key: 'beds', label: 'Bed pressure', weight: RISK_WEIGHTS.beds, value: bedPressure, weighted: RISK_WEIGHTS.beds * bedPressure },
    { key: 'workforce', label: 'Workforce gap', weight: RISK_WEIGHTS.workforce, value: workforcePressure, weighted: RISK_WEIGHTS.workforce * workforcePressure },
    { key: 'logistics', label: 'Logistics vulnerability', weight: RISK_WEIGHTS.logistics, value: logisticsVuln, weighted: RISK_WEIGHTS.logistics * logisticsVuln },
  ];
}

/** Live-recomputed risk for a district: worst inventory line at this scenario. */
export function computeDistrictRisk(
  d: District,
  records: InventoryRecord[],
  s?: Partial<ScenarioState> | number,
): ComputedRisk {
  const scen = scenarioOf(s);
  let worst: { record: InventoryRecord; score: number } | null = null;
  for (const r of records) {
    const score = riskScore(d, r, scen);
    if (!worst || score > worst.score) worst = { record: r, score };
  }
  const factors = worst ? riskFactors(d, worst.record, scen) : [];
  const score = worst ? worst.score : 0;
  return {
    district: d,
    score,
    band: riskBand(score),
    factors,
    worstRecord: worst?.record ?? null,
    worstDaysOfCover: worst ? daysOfCover(worst.record, scen) : null,
    worstStockOutDays: worst ? stockOutDays(worst.record, scen) : null,
  };
}

// ── Multi-source allocation (prototype allocation logic) ─────────────────────
//
// Requirement = reserve target − current stock (reserve target = reserve days ×
// forecast daily demand). Sources must keep their own reserve after giving.
// Objective: minimize remaining shortage + transit cost + source reserve risk.
// Whole-unit shipments, transparent reason strings, no pointless transfers.

const MIN_BENEFIT_COVER_GAIN = 0.5; // days — below this, the transfer isn't worth the dispatch

export function buildAllocationPlan(
  shortage: InventoryRecord,
  shortageDistrict: District,
  sources: { record: InventoryRecord; district: District }[],
  s: Partial<ScenarioState> | number = 1,
): AllocationPlan | null {
  const scen = scenarioOf(s);
  const coverBefore = daysOfCover(shortage, scen);
  const soBefore = stockOutDays(shortage, scen);
  const target = reserveTargetUnits(shortage, scen.demandMultiplier);
  const required = Math.max(0, target - shortage.currentStock);
  const scoreBefore = riskScore(shortageDistrict, shortage, scen);
  const bandBefore = riskBand(scoreBefore);

  // NO POINTLESS TRANSFERS: destination already holds ≥ reserve target with
  // comfortable cover → nothing meaningful to fix.
  if (shortage.currentStock >= target && coverBefore >= shortage.reserveThresholdDays + MIN_BENEFIT_COVER_GAIN) {
    return null;
  }

  // Eligible sources: projected surplus after preserving their own reserve
  // target, on an undisrupted corridor.
  const eligible = sources
    .map((src) => {
      const transit = transitHoursBetween(src.district.id, shortage.districtId, scen);
      const disrupted = corridorDisrupted(`${src.district.id}->${shortage.districtId}`, scen) ||
        corridorDisrupted(`${shortage.districtId}->${src.district.id}`, scen);
      const surplus = surplusUnits(src.record, scen);
      return { ...src, transit, disrupted, surplus };
    })
    .filter((src) => src.transit !== null && !src.disrupted && src.surplus >= 100)
    .sort((a, b) => a.transit! - b.transit! || b.surplus - a.surplus);

  if (!eligible.length || required < 100) return null;

  // Greedy multi-source fill: nearest-first, each source keeps its reserve.
  // Each leg records the destination cover AFTER THAT LEG LANDS — a leg's
  // claimed outcome is arithmetically true for that leg alone; the plan-wide
  // outcome is reported once on the plan. The running ledger is the single
  // source of truth, so surplus is never double-spent within a plan.
  let remaining = required;
  let runningDestStock = shortage.currentStock;
  const legs: AllocationLeg[] = [];
  const remainingSurplus = new Map<InventoryRecord, number>(eligible.map((e) => [e.record, e.surplus]));
  for (const src of eligible) {
    if (remaining <= 0) break;
    const avail = remainingSurplus.get(src.record) ?? 0;
    if (avail < 100) continue;
    const qty = roundShipment(shortage.medicineId, Math.min(avail, remaining));
    if (qty <= 0) continue;
    const sourceCoverAfter = forecastDaysOfCover(
      { ...src.record, currentStock: src.record.currentStock - qty },
      scen.demandMultiplier,
    );
    runningDestStock += qty;
    const destCoverAfterThisLeg = forecastDaysOfCover(
      { ...shortage, currentStock: runningDestStock },
      scen.demandMultiplier,
    );
    remainingSurplus.set(src.record, avail - qty);
    remaining -= qty;
    legs.push({
      fromDistrictId: src.district.id,
      quantity: qty,
      transitHours: src.transit!,
      sourceSurplusBefore: src.surplus,
      sourceCoverAfter,
      destinationCoverAfter: destCoverAfterThisLeg,
    });
  }

  const transferred = legs.reduce((sum, l) => sum + l.quantity, 0);
  if (transferred < 100) return null;

  const afterRecord: InventoryRecord = { ...shortage, currentStock: shortage.currentStock + transferred };
  const coverAfter = daysOfCover(afterRecord, scen);
  const soAfter = stockOutDays(afterRecord, scen);
  const scoreAfter = riskScore(shortageDistrict, afterRecord, scen);

  // Minimum-benefit gate: the intervention must materially move cover or the
  // projected stock-out — otherwise it's dispatch theater.
  const coverGain = coverAfter - coverBefore;
  const soGain = soBefore !== null && soAfter !== null ? soAfter - soBefore : null;
  const meaningful =
    coverGain >= MIN_BENEFIT_COVER_GAIN ||
    (soGain !== null && soGain >= 1) ||
    (soBefore <= shortage.reserveThresholdDays && coverAfter >= shortage.reserveThresholdDays);
  if (!meaningful) return null;

  const remainingGap = Math.max(0, required - transferred);
  const reason = legs.length > 1
    ? `${legs.length} sources combined — no single district held enough safe surplus (${legs.map((l) => `${l.quantity.toLocaleString()} from ${l.fromDistrictId}`).join(', ')}).`
    : `${legs[0].fromDistrictId} selected: shortest transit (${legs[0].transitHours}h, prototype estimate) with ${legs[0].sourceSurplusBefore.toLocaleString()} units above its own reserve target.`;

  return {
    toDistrictId: shortage.districtId,
    medicineId: shortage.medicineId,
    targetUnits: target,
    requiredUnits: required,
    transferredUnits: transferred,
    remainingGapUnits: remainingGap,
    legs,
    daysOfCoverBefore: coverBefore,
    daysOfCoverAfter: coverAfter,
    projectedStockOutBefore: soBefore,
    projectedStockOutAfter: soAfter,
    scoreBefore,
    scoreAfter,
    bandBefore,
    bandAfter: riskBand(scoreAfter),
    reason: remainingGap > 0
      ? `${reason} Shortfall of ${remainingGap.toLocaleString()} units — no eligible source could give more without breaching its own reserve.`
      : reason,
  };
}

// ── Single-source compatibility wrapper ───────────────────────────────────────
// Legacy call sites (drawer, tour, brief, intervention queue) consume the
// single-source shape. The multi-source plan is the real engine; this wrapper
// presents the plan's FIRST leg with that leg's OWN arithmetically true
// outcome — never the plan-wide numbers — and carries the full plan on
// `legs`/`fullPlan*` so every screen can show the complete, consistent story.

export function buildTransferRecommendation(
  shortage: InventoryRecord,
  shortageDistrict: District,
  sources: { record: InventoryRecord; transitHours: number }[],
  s: Partial<ScenarioState> | number = 1,
): TransferRecommendation | null {
  const scen = scenarioOf(s);
  const byId = new Map(districts.map((d) => [d.id, d]));
  const plan = buildAllocationPlan(
    shortage,
    shortageDistrict,
    sources
      .map((src) => ({ record: src.record, district: byId.get(src.record.districtId) }))
      .filter((x): x is { record: InventoryRecord; district: District } => Boolean(x.district)),
    scen,
  );
  if (!plan || !plan.legs.length) return null;
  const leg = plan.legs[0];
  return {
    fromDistrictId: leg.fromDistrictId,
    toDistrictId: plan.toDistrictId,
    medicineId: plan.medicineId,
    quantity: leg.quantity,
    transitHours: leg.transitHours,
    sourceSurplus: leg.sourceSurplusBefore,
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
  };
}

// ── Aggregation helpers (network-level views) ────────────────────────────────

export function computeAllRisks(
  allDistricts: District[],
  allInventory: InventoryRecord[],
  s?: Partial<ScenarioState> | number,
): ComputedRisk[] {
  return allDistricts
    .map((d) =>
      computeDistrictRisk(
        d,
        allInventory.filter((r) => r.districtId === d.id),
        s,
      ),
    )
    .sort((a, b) => b.score - a.score);
}

export function countBands(risks: { band: RiskBandName }[]) {
  const counts = { stable: 0, watch: 0, high: 0, critical: 0 };
  for (const r of risks) counts[r.band] += 1;
  return counts;
}
