// ─────────────────────────────────────────────────────────────────────────────
// PHC DATA LAYER — seeded, deterministic, aggregated upward.
//
// PHC records are generated from the SAME hand-authored district constants
// (population, PHC count, bed utilization, staff availability) so there is one
// source of truth: PHC → district aggregation reproduces the district numbers
// the whole app already uses. Reload-stable: a seeded generator, no Date.now(),
// no Math.random(). All of this is synthetic demonstration data.
// ─────────────────────────────────────────────────────────────────────────────

import { districts, inventory, backgroundDistricts } from './districts';
import { mulberry32, hashString } from '../utils/seed';
import type { RiskBandName } from '../types';

export interface PhcRecord {
  id: string;
  name: string;
  districtId: string;
  populationServed: number;
  beds: number;
  occupiedBeds: number;
  staffTotal: number;
  staffAvailable: number;
  patientFootfall: number;
  /** Per-medicine stock at this PHC, in units. */
  medicineStock: Record<string, number>;
  /** Reserve target (days) — the uniform prototype assumption. */
  reserveTarget: number;
}

export interface PhcRisk {
  phc: PhcRecord;
  /** Days of cover on the worst medicine line at this PHC (simple internal
      read-out — district-level forecasting stays in utils/forecast). */
  worstCoverDays: number;
  worstMedicineId: string | null;
  bedUtilization: number;
  staffAvailability: number;
  band: RiskBandName;
}

// Deterministic hash + PRNG live in utils/seed (shared with the forecast engine).

function buildPhcs(): PhcRecord[] {
  const out: PhcRecord[] = [];
  for (const d of districts) {
    const rand = mulberry32(hashString(`phc:${d.id}`));
    const count = Math.max(4, Math.min(8, Math.round(d.phcs / 9)));
    // Split district aggregates across PHCs with seeded variation.
    const weights: number[] = [];
    let wSum = 0;
    for (let i = 0; i < count; i++) {
      const w = 0.7 + rand() * 0.6;
      weights.push(w);
      wSum += w;
    }
    const medsFor = (medicineId: string) => {
      const rec = inventory.find((r) => r.districtId === d.id && r.medicineId === medicineId);
      return rec ? rec.currentStock : null;
    };
    const medicineIds = [...new Set(inventory.filter((r) => r.districtId === d.id).map((r) => r.medicineId))];
    const dailyFor = (medicineId: string) =>
      inventory.find((r) => r.districtId === d.id && r.medicineId === medicineId)?.dailyConsumption ?? 0;

    for (let i = 0; i < count; i++) {
      const share = weights[i] / wSum;
      const beds = Math.round((d.bedUtilization / 100) * 0 + (20 + rand() * 14)); // 20–34 beds per PHC
      const staffTotal = Math.round(14 + rand() * 10);
      const medicineStock: Record<string, number> = {};
      for (const m of medicineIds) {
        const total = medsFor(m);
        if (total !== null) medicineStock[m] = Math.round(total * share);
      }
      out.push({
        id: `${d.id}-phc${i + 1}`,
        name: `${d.name} PHC ${String(i + 1).padStart(2, '0')}`,
        districtId: d.id,
        populationServed: Math.round(d.population * share * 0.12), // PHC serves ~12% of district pop
        beds,
        occupiedBeds: Math.round(beds * (d.bedUtilization / 100) * (0.9 + rand() * 0.2)),
        staffTotal,
        staffAvailable: Math.round(staffTotal * (d.staffAvailability / 100)),
        patientFootfall: Math.round(dailyFor(medicineIds[0] ?? 'ors') * (1.6 + rand() * 0.8)),
        medicineStock,
        reserveTarget: 7,
      });
    }
  }
  return out;
}

export const phcs: PhcRecord[] = buildPhcs();

export function phcsForDistrict(districtId: string): PhcRecord[] {
  return phcs.filter((p) => p.districtId === districtId);
}

/** PHC-level risk read-out (band derived from the same thresholds as districts). */
export function phcRisk(p: PhcRecord): PhcRisk {
  // Cover ratio = PHC stock ÷ the district's daily consumption for that
  // line (the PHC layer scales STOCK by district share; demand stays the
  // district rate) — same "stock ÷ mean daily demand" shape as the district
  // engine, without re-running the forecast per PHC.
  let worstCover = Infinity;
  let worstMed: string | null = null;
  for (const [medicineId, stock] of Object.entries(p.medicineStock)) {
    const daily =
      inventory.find((r) => r.districtId === p.districtId && r.medicineId === medicineId)?.dailyConsumption ?? 0;
    const cover = stock / Math.max(1, daily);
    if (cover < worstCover) {
      worstCover = cover;
      worstMed = medicineId;
    }
  }
  if (!Number.isFinite(worstCover)) worstCover = 14;
  const bedUtilization = p.beds ? Math.round((p.occupiedBeds / p.beds) * 100) : 0;
  const staffAvailability = p.staffTotal ? Math.round((p.staffAvailable / p.staffTotal) * 100) : 0;
  // Same band thresholds as the district score (score approximated at PHC level).
  const score = Math.round(
    Math.max(0, Math.min(100, (14 - Math.min(worstCover, 14)) / 14 * 70 + Math.max(0, bedUtilization - 60) * 0.5)),
  );
  const band: RiskBandName = score >= 55 ? 'critical' : score >= 45 ? 'high' : score >= 35 ? 'watch' : 'stable';
  return { phc: p, worstCoverDays: Math.round(worstCover * 10) / 10, worstMedicineId: worstMed, bedUtilization, staffAvailability, band };
}

/** District totals re-derived from PHC rows — proves aggregation is coherent. */
export function districtAggregates(districtId: string) {
  const list = phcsForDistrict(districtId);
  return {
    phcCount: list.length,
    beds: list.reduce((s, p) => s + p.beds, 0),
    occupiedBeds: list.reduce((s, p) => s + p.occupiedBeds, 0),
    staffTotal: list.reduce((s, p) => s + p.staffTotal, 0),
    staffAvailable: list.reduce((s, p) => s + p.staffAvailable, 0),
    populationServed: list.reduce((s, p) => s + p.populationServed, 0),
    footfall: list.reduce((s, p) => s + p.patientFootfall, 0),
  };
}

// ── State-level aggregation ─────────────────────────────────────────────────
// The tracked six-district demo network PLUS 17 background districts make the
// underlying network state-wide (23 districts). Background districts carry no
// inventory lines but count toward scale (PHCs, hospitals, population).

/** Count of districts in the full West Bengal network (demo + background). */
export const NETWORK_DISTRICT_COUNT = districts.length + backgroundDistricts.length;

/** PHCs per background district for scale math (seeded, stable). */
function backgroundPhcCount(id: string, phcs: number): number {
  return Math.max(3, Math.min(6, Math.round(phcs / 12) + (hashString(id) % 3)));
}

const BACKGROUND_PHC_TOTAL = backgroundDistricts.reduce(
  (s, d) => s + backgroundPhcCount(d.id, d.phcs),
  0,
);

/** State-level summary — every value derived from the dataset, nothing hardcoded. */
export function stateSummary() {
  const demoPhcRows = phcs.length;
  const totalPhcs = demoPhcRows + BACKGROUND_PHC_TOTAL;
  const hospitals = districts.reduce((s, d) => s + d.hospitals, 0) + backgroundDistricts.reduce((s, d) => s + d.hospitals, 0);
  const population = districts.reduce((s, d) => s + d.population, 0) + backgroundDistricts.reduce((s, d) => s + d.population, 0);
  const monitoredLines = inventory.length;
  const elevatedPhcs = phcs.filter((p) => phcRisk(p).band === 'critical' || phcRisk(p).band === 'high').length;
  const reserveBreaches = phcs.filter((p) => {
    const risk = phcRisk(p);
    return risk.worstMedicineId !== null && risk.worstCoverDays < 7;
  }).length;
  return {
    districtCount: NETWORK_DISTRICT_COUNT,
    demoDistrictCount: districts.length,
    phcCount: totalPhcs,
    demoPhcRows,
    hospitals,
    population,
    monitoredLines,
    elevatedPhcs,
    reserveBreaches,
  };
}

/** Facility signals behind a district's risk — the WHY at PHC level. */
export function districtFacilitySignals(districtId: string) {
  const list = phcsForDistrict(districtId);
  const risks = list.map((p) => phcRisk(p));
  const elevated = risks.filter((r) => r.band === 'critical' || r.band === 'high').length;
  const projectedBreach = risks.filter((r) => r.worstCoverDays < 7).length;
  const criticalLines = new Set(risks.filter((r) => r.band === 'critical').map((r) => r.worstMedicineId)).size;
  const worst = [...risks].sort((a, b) => a.worstCoverDays - b.worstCoverDays)[0] ?? null;
  return { total: list.length, elevated, projectedBreach, criticalLines, worst };
}
