export type RiskBandName = 'stable' | 'watch' | 'high' | 'critical';

export interface District {
  id: string;
  name: string;
  /** Compact label for map/chart rendering. */
  shortName: string;
  state: string;
  population: number;
  phcs: number;
  hospitals: number;
  riskScore: number; // precomputed for static display; Simulator recomputes live
  riskBand: RiskBandName;
  bedUtilization: number; // %
  staffAvailability: number; // %
  logisticsVulnerability: number; // 0-100, higher = harder to reach
}

export interface Medicine {
  id: string;
  name: string;
  category: string;
}

export interface InventoryRecord {
  districtId: string;
  medicineId: string;
  currentStock: number;
  dailyConsumption: number;
  reserveThresholdDays: number; // uniform prototype assumption: 7 days
  demandGrowthPct: number; // e.g. 31 means +31% vs baseline
}

/** One weighted factor contributing to a district's risk score. */
export interface RiskFactor {
  key: string;
  label: string;
  weight: number;
  /** Raw 0-100 pressure value of this factor. */
  value: number;
  /** Weighted contribution to the total score. */
  weighted: number;
}

/** Live-recomputed risk for one district at the current simulator multiplier. */
export interface ComputedRisk {
  district: District;
  score: number;
  band: RiskBandName;
  factors: RiskFactor[];
  /** Worst inventory line in this district at the current multiplier. */
  worstRecord: InventoryRecord | null;
  worstDaysOfCover: number | null;
  worstStockOutDays: number | null;
}

/** One multi-source allocation leg (prototype allocation logic). */
export interface AllocationLeg {
  fromDistrictId: string;
  quantity: number;
  transitHours: number;
  /** Source surplus available BEFORE this leg is drawn down. */
  sourceSurplusBefore: number;
  /** Source projected days-of-cover after sending this leg. */
  sourceCoverAfter: number;
  /** Destination days-of-cover after THIS leg lands (arithmetically true
      for this leg alone — never the plan-wide outcome). */
  destinationCoverAfter: number;
}

/** Multi-source allocation output. `legs` is ordered by transit efficiency. */
export interface AllocationPlan {
  toDistrictId: string;
  medicineId: string;
  /** reserve target × projected demand, whole shipment units. */
  targetUnits: number;
  requiredUnits: number;
  transferredUnits: number;
  remainingGapUnits: number;
  legs: AllocationLeg[];
  daysOfCoverBefore: number;
  daysOfCoverAfter: number;
  projectedStockOutBefore: number | null;
  projectedStockOutAfter: number | null;
  scoreBefore: number;
  scoreAfter: number;
  bandBefore: RiskBandName;
  bandAfter: RiskBandName;
  /** Why this intervention is recommended (or why not). */
  reason: string;
}

/** Output of the redistribution engine for one shortage record. */
export interface TransferRecommendation {
  fromDistrictId: string;
  toDistrictId: string;
  medicineId: string;
  quantity: number;
  transitHours: number;
  sourceSurplus: number;
  /** How many days of cover the shortage district has BEFORE the transfer. */
  daysOfCoverBefore: number;
  /** After THIS recommendation's primary leg lands — arithmetically true for
      this leg alone. Multi-source plans carry the plan-wide outcome in
      `fullPlanCoverAfter`, never here. */
  daysOfCoverAfter: number;
  scoreBefore: number;
  scoreAfter: number;
  bandBefore: RiskBandName;
  bandAfter: RiskBandName;
  /** Units still missing after the primary leg (before any further legs). */
  shortfallUnits: number;
  /** ALL legs of the underlying allocation plan (single-source plans: one). */
  legs: AllocationLeg[];
  /** Total units across every leg of the full plan. */
  fullPlanQuantity: number;
  /** Days of cover after the FULL multi-leg plan lands. */
  fullPlanCoverAfter: number;
  /** Units the full plan still cannot fill (0 when the reserve target is met). */
  fullPlanGapUnits: number;
}

/** Scenario state driven by the Emergency Simulator. */
export interface ScenarioState {
  demandMultiplier: number; // e.g. 1.3 = +30% demand
  transitDelayFactor: number; // e.g. 1.2 = +20% transit time
  /** Availability multiplier on district staff (e.g. 0.8 = −20% workforce). */
  workforceFactor: number;
  /** Occupancy pressure multiplier on beds (e.g. 1.25 = +25% bed demand). */
  bedDemandFactor: number;
  /** Corridor ids ("from->to") knocked out by the scenario. */
  disruptedCorridors: string[];
  /** Supply shock: fraction of replenishment delayed (0..1). Raises effective
      demand on stock without touching the demand trajectory. */
  supplyShockFactor: number;
  /** Cold-chain incident: temperature-sensitive lines degraded. */
  coldChainIncident: boolean;
  presetId: string | null;
}

export interface SimulatorPreset {
  id: string;
  label: string;
  description: string;
  demandMultiplier?: number;
  transitDelayFactor?: number;
  workforceFactor?: number;
  bedDemandFactor?: number;
  disruptedCorridors?: string[];
  supplyShockFactor?: number;
  coldChainIncident?: boolean;
}

export interface BriefSituation {
  scenario: ScenarioState;
  risks: ComputedRisk[];
  districtsAtRisk: ComputedRisk[];
  stableCount: number;
  watchCount: number;
  highCount: number;
  criticalCount: number;
  baselineCriticalCount: number;
  totalPopulationAffected: number;
  topMedicineRisks: { medicine: Medicine; record: InventoryRecord; district: District; stockOutDays: number }[];
  recommendations: TransferRecommendation[];
  generatedAt: string;
}

/** Simulated intervention workflow lifecycle (Action Center). */
export type InterventionStatus =
  | 'RECOMMENDED'
  | 'UNDER REVIEW'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'IN TRANSIT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface InterventionAuditEntry {
  status: InterventionStatus | 'REVIEWED';
  /** Wall-clock label, e.g. "12:04" — simulated operational timestamps. */
  at: string;
  /** Who/what performed the transition (simulated operational roles). */
  by?: string;
}

export interface InterventionPlan {
  id: string;
  medicineId: string;
  /** Primary (first) source — for multi-source plans see `legs`. */
  fromDistrictId: string;
  toDistrictId: string;
  /** TOTAL units across all legs (equals the single-leg quantity when 1 leg). */
  quantity: number;
  transitHours: number;
  coverBeforeDays: number;
  coverAfterDays: number;
  /** Every allocation leg; each carries its own arithmetically true
      destination-cover-after value. Absent on legacy single-leg plans. */
  legs?: AllocationLeg[];
  status: InterventionStatus;
  audit: InterventionAuditEntry[];
  /** Calculated priority (0-100) with its factor breakdown. */
  priority?: PriorityScore;
  /** Why the intervention was recommended (from the allocation plan). */
  reason?: string;
  /** Units still missing after this plan lands (allocation-engine gap). */
  gapUnits?: number;
  /** True when the plan cannot lift the destination to its reserve — escalation required. */
  insufficient?: boolean;
  /** True when any leg is cold-chain sensitive (prototype assessment). */
  coldChain?: boolean;
}

/** Transparent priority score with factor breakdown (NOT an AI judgment). */
export interface PriorityScore {
  score: number;
  factors: { label: string; value: number; weighted: number }[];
}

export type AiProviderName = 'remote' | 'local';

export interface AiProvider {
  name: AiProviderName;
  explain(question: string, context: string): Promise<string>;
  generateBrief(situation: BriefSituation): Promise<string>;
}
