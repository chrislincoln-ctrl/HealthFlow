// ─────────────────────────────────────────────────────────────────────────────
// NETWORK RESILIENCE INDEX (prototype)
//
// A transparent composite of six components computed from the SAME shared
// engine state (utils/calc + data/districts). No page re-implements it.
// Weights are illustrative prototype assumptions — labeled as such in the UI.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScenarioState } from '../types';
import { districts, inventory, corridors } from '../data/districts';
import { scenarioOf, daysOfCover, corridorDisrupted, surplusUnits } from './calc';

export const RESILIENCE_WEIGHTS = {
  supplyRedundancy: 0.25,
  reserveCoverage: 0.2,
  alternativeSourcing: 0.2,
  routeAvailability: 0.15,
  workforceHeadroom: 0.1,
  bedCapacityHeadroom: 0.1,
} as const;

export interface ResilienceComponent {
  key: keyof typeof RESILIENCE_WEIGHTS;
  label: string;
  /** Raw 0-100 health of this component. */
  value: number;
  weight: number;
  weighted: number;
  /** Short human explanation of what drives this component right now. */
  detail: string;
}

export interface ResilienceIndex {
  score: number;
  band: 'LOW' | 'MODERATE' | 'ADEQUATE' | 'STRONG';
  components: ResilienceComponent[];
  strongest: ResilienceComponent | null;
  weakest: ResilienceComponent | null;
}

function bandOf(score: number): ResilienceIndex['band'] {
  if (score >= 75) return 'STRONG';
  if (score >= 60) return 'ADEQUATE';
  if (score >= 45) return 'MODERATE';
  return 'LOW';
}

/**
 * Compute the resilience index for the network at the given scenario.
 * Every component is derived from live engine state — nothing hardcoded.
 */
export function computeResilienceIndex(
  s?: Partial<ScenarioState> | number,
  /** Inventory adjustments from completed interventions (districtId -> deltas). */
  appliedStock?: Record<string, Record<string, number>>,
): ResilienceIndex {
  const scen = scenarioOf(s);
  const stockFor = (districtId: string, medicineId: string) =>
    inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId)!.currentStock +
    (appliedStock?.[districtId]?.[medicineId] ?? 0);

  // 1) Supply redundancy — share of tracked lines with a stock-out beyond 14d.
  let deepCover = 0;
  let lineCount = 0;
  for (const d of districts) {
    for (const med of ['ors', 'paracetamol', 'amoxicillin', 'insulin', 'saline']) {
      const rec = inventory.find((r) => r.districtId === d.id && r.medicineId === med);
      if (!rec) continue;
      lineCount++;
      const r2 = { ...rec, currentStock: stockFor(d.id, med) };
      if (daysOfCover(r2, scen) >= 14) deepCover++;
    }
  }
  const supplyRedundancy = lineCount ? (deepCover / lineCount) * 100 : 0;

  // 2) Reserve coverage — share of lines at or above their 7-day reserve target.
  let atReserve = 0;
  for (const d of districts) {
    for (const med of ['ors', 'paracetamol', 'amoxicillin', 'insulin', 'saline']) {
      const rec = inventory.find((r) => r.districtId === d.id && r.medicineId === med);
      if (!rec) continue;
      const r2 = { ...rec, currentStock: stockFor(d.id, med) };
      if (daysOfCover(r2, scen) >= rec.reserveThresholdDays) atReserve++;
    }
  }
  const reserveCoverage = lineCount ? (atReserve / lineCount) * 100 : 0;

  // 3) Alternative sourcing — share of critical/high districts with ≥1
  //    eligible surplus partner on an open corridor.
  let withAlt = 0;
  let needy = 0;
  for (const d of districts) {
    const recs = inventory.filter((r) => r.districtId === d.id);
    const worst = recs.reduce(
      (acc, r) => {
        const c = daysOfCover({ ...r, currentStock: stockFor(d.id, r.medicineId) }, scen);
        return c < acc.cover ? { cover: c, rec: r } : acc;
      },
      { cover: Infinity, rec: recs[0] },
    );
    if (!worst.rec || worst.cover >= 7) continue;
    needy++;
    const alt = districts.some((src) => {
      if (src.id === d.id) return false;
      if (corridorDisrupted(`${src.id}->${d.id}`, scen) || corridorDisrupted(`${d.id}->${src.id}`, scen)) return false;
      const rec = inventory.find((r) => r.districtId === src.id && r.medicineId === worst.rec.medicineId);
      if (!rec) return false;
      // Same canonical surplusUnits definition the allocation engine uses
      // (scenario-aware effective stock − reserve target).
      const surplus = surplusUnits(rec, scen);
      return surplus >= 100;
    });
    if (alt) withAlt++;
  }
  const alternativeSourcing = needy ? (withAlt / needy) * 100 : 100;

  // 4) Route availability — undisrupted share of the canonical corridor list.
  const openRoutes = corridors.filter(
    (c) => !corridorDisrupted(`${c.from}->${c.to}`, scen) && !corridorDisrupted(`${c.to}->${c.from}`, scen),
  ).length;
  const routeAvailability = corridors.length ? (openRoutes / corridors.length) * 100 : 100;

  // 5) Workforce headroom — mean staff availability across districts.
  const workforceHeadroom =
    districts.reduce((s, d) => s + d.staffAvailability * scen.workforceFactor, 0) / districts.length;

  // 6) Bed capacity headroom — 100 − mean bed utilization (capped ≥0).
  const bedCapacityHeadroom = Math.max(
    0,
    100 - districts.reduce((s, d) => s + Math.min(100, d.bedUtilization * scen.bedDemandFactor), 0) / districts.length,
  );

  const components: ResilienceComponent[] = [
    {
      key: 'supplyRedundancy',
      label: 'Supply redundancy',
      value: Math.round(supplyRedundancy),
      weight: RESILIENCE_WEIGHTS.supplyRedundancy,
      weighted: RESILIENCE_WEIGHTS.supplyRedundancy * supplyRedundancy,
      detail: `${deepCover}/${lineCount} tracked lines hold 14+ days of cover`,
    },
    {
      key: 'reserveCoverage',
      label: 'Reserve coverage',
      value: Math.round(reserveCoverage),
      weight: RESILIENCE_WEIGHTS.reserveCoverage,
      weighted: RESILIENCE_WEIGHTS.reserveCoverage * reserveCoverage,
      detail: `${atReserve}/${lineCount} lines at or above the 7-day reserve target`,
    },
    {
      key: 'alternativeSourcing',
      label: 'Alternative sourcing',
      value: Math.round(alternativeSourcing),
      weight: RESILIENCE_WEIGHTS.alternativeSourcing,
      weighted: RESILIENCE_WEIGHTS.alternativeSourcing * alternativeSourcing,
      detail: needy
        ? `${withAlt}/${needy} pressured districts have an open eligible source`
        : 'every district is above reserve — no sourcing pressure',
    },
    {
      key: 'routeAvailability',
      label: 'Route availability',
      value: Math.round(routeAvailability),
      weight: RESILIENCE_WEIGHTS.routeAvailability,
      weighted: RESILIENCE_WEIGHTS.routeAvailability * routeAvailability,
      detail: `${openRoutes}/${corridors.length} supply corridors open`,
    },
    {
      key: 'workforceHeadroom',
      label: 'Workforce headroom',
      value: Math.round(workforceHeadroom),
      weight: RESILIENCE_WEIGHTS.workforceHeadroom,
      weighted: RESILIENCE_WEIGHTS.workforceHeadroom * workforceHeadroom,
      detail: `mean staff availability ${Math.round(workforceHeadroom)}% across the network`,
    },
    {
      key: 'bedCapacityHeadroom',
      label: 'Bed capacity headroom',
      value: Math.round(bedCapacityHeadroom),
      weight: RESILIENCE_WEIGHTS.bedCapacityHeadroom,
      weighted: RESILIENCE_WEIGHTS.bedCapacityHeadroom * bedCapacityHeadroom,
      detail: `${Math.round(bedCapacityHeadroom)} points of unoccupied bed capacity on average`,
    },
  ];

  const score = Math.round(components.reduce((s2, c) => s2 + c.weighted, 0));
  const sorted = [...components].sort((a, b) => b.value - a.value);
  return {
    score,
    band: bandOf(score),
    components,
    strongest: sorted[0] ?? null,
    weakest: sorted[sorted.length - 1] ?? null,
  };
}
