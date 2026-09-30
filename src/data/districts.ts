import type { District, InventoryRecord, Medicine, SimulatorPreset } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL DATASET — hand-authored. Do not regenerate.
// Every number in the UI traces back to this file or src/utils/calc.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const districts: District[] = [
  { id: 'nadia', name: 'Nadia', shortName: 'Nadia', state: 'West Bengal', population: 5_250_000,
    phcs: 62, hospitals: 8, riskScore: 82, riskBand: 'critical',
    bedUtilization: 88, staffAvailability: 61, logisticsVulnerability: 45 },
  { id: 'howrah', name: 'Howrah', shortName: 'Howrah', state: 'West Bengal', population: 4_850_000,
    phcs: 54, hospitals: 9, riskScore: 66, riskBand: 'high',
    bedUtilization: 74, staffAvailability: 70, logisticsVulnerability: 30 },
  { id: 'north24pgs', name: 'North 24 Parganas', shortName: 'N. 24 Pgs', state: 'West Bengal', population: 10_100_000,
    phcs: 88, hospitals: 14, riskScore: 48, riskBand: 'watch',
    bedUtilization: 60, staffAvailability: 78, logisticsVulnerability: 25 },
  { id: 'malda', name: 'Malda', shortName: 'Malda', state: 'West Bengal', population: 3_990_000,
    phcs: 41, hospitals: 6, riskScore: 44, riskBand: 'watch',
    bedUtilization: 55, staffAvailability: 80, logisticsVulnerability: 55 },
  { id: 'hooghly', name: 'Hooghly', shortName: 'Hooghly', state: 'West Bengal', population: 5_520_000,
    phcs: 58, hospitals: 10, riskScore: 22, riskBand: 'stable',
    bedUtilization: 48, staffAvailability: 91, logisticsVulnerability: 15 },
  { id: 'kolkata', name: 'Kolkata', shortName: 'Kolkata', state: 'West Bengal', population: 4_500_000,
    phcs: 45, hospitals: 22, riskScore: 18, riskBand: 'stable',
    bedUtilization: 52, staffAvailability: 94, logisticsVulnerability: 10 },
];

export const medicines: (Medicine & {
  /** Prototype cold-chain flag — insulin requires 2–8°C storage/transport. */
  coldChainRequired?: boolean;
  /** 0-100 prototype storage-failure sensitivity. */
  storageRisk?: number;
})[] = [
  { id: 'ors', name: 'ORS', category: 'Rehydration' },
  { id: 'paracetamol', name: 'Paracetamol', category: 'Analgesic' },
  { id: 'amoxicillin', name: 'Amoxicillin', category: 'Antibiotic' },
  { id: 'insulin', name: 'Insulin', category: 'Endocrine', coldChainRequired: true, storageRisk: 80 },
  { id: 'saline', name: 'IV Fluids (Saline)', category: 'Fluids' },
];

/** True when a medicine needs the cold chain (prototype logistics factor). */
export function isColdChain(medicineId: string): boolean {
  return Boolean(medicines.find((m) => m.id === medicineId)?.coldChainRequired);
}

export const inventory: InventoryRecord[] = [
  // Nadia — the flagship crisis district
  { districtId: 'nadia', medicineId: 'ors', currentStock: 5460, dailyConsumption: 1050, reserveThresholdDays: 7, demandGrowthPct: 31 },
  { districtId: 'nadia', medicineId: 'paracetamol', currentStock: 3240, dailyConsumption: 410, reserveThresholdDays: 7, demandGrowthPct: 18 },
  { districtId: 'nadia', medicineId: 'amoxicillin', currentStock: 8400, dailyConsumption: 520, reserveThresholdDays: 7, demandGrowthPct: 8 },
  { districtId: 'nadia', medicineId: 'insulin', currentStock: 980, dailyConsumption: 90, reserveThresholdDays: 7, demandGrowthPct: 6 },
  // Howrah — secondary alert (amoxicillin)
  { districtId: 'howrah', medicineId: 'amoxicillin', currentStock: 4100, dailyConsumption: 610, reserveThresholdDays: 7, demandGrowthPct: 22 },
  { districtId: 'howrah', medicineId: 'ors', currentStock: 6200, dailyConsumption: 780, reserveThresholdDays: 7, demandGrowthPct: 14 },
  { districtId: 'howrah', medicineId: 'paracetamol', currentStock: 3800, dailyConsumption: 350, reserveThresholdDays: 7, demandGrowthPct: 9 },
  { districtId: 'howrah', medicineId: 'insulin', currentStock: 1150, dailyConsumption: 105, reserveThresholdDays: 7, demandGrowthPct: 5 },
  // North 24 Parganas — watch band
  { districtId: 'north24pgs', medicineId: 'ors', currentStock: 11200, dailyConsumption: 1420, reserveThresholdDays: 7, demandGrowthPct: 12 },
  { districtId: 'north24pgs', medicineId: 'paracetamol', currentStock: 5400, dailyConsumption: 520, reserveThresholdDays: 7, demandGrowthPct: 4 },
  { districtId: 'north24pgs', medicineId: 'saline', currentStock: 7300, dailyConsumption: 690, reserveThresholdDays: 7, demandGrowthPct: 3 },
  // Malda — watch band, high logistics vulnerability
  { districtId: 'malda', medicineId: 'ors', currentStock: 6400, dailyConsumption: 830, reserveThresholdDays: 7, demandGrowthPct: 5 },
  { districtId: 'malda', medicineId: 'amoxicillin', currentStock: 4900, dailyConsumption: 380, reserveThresholdDays: 7, demandGrowthPct: 4 },
  { districtId: 'malda', medicineId: 'saline', currentStock: 5100, dailyConsumption: 460, reserveThresholdDays: 7, demandGrowthPct: 2 },
  // Hooghly — stable, ORS surplus source
  { districtId: 'hooghly', medicineId: 'ors', currentStock: 8700, dailyConsumption: 850, reserveThresholdDays: 7, demandGrowthPct: 4 },
  { districtId: 'hooghly', medicineId: 'paracetamol', currentStock: 4700, dailyConsumption: 390, reserveThresholdDays: 7, demandGrowthPct: 3 },
  { districtId: 'hooghly', medicineId: 'amoxicillin', currentStock: 7200, dailyConsumption: 470, reserveThresholdDays: 7, demandGrowthPct: 2 },
  // Kolkata — stable, ORS surplus source
  { districtId: 'kolkata', medicineId: 'ors', currentStock: 6900, dailyConsumption: 640, reserveThresholdDays: 7, demandGrowthPct: 3 },
  { districtId: 'kolkata', medicineId: 'paracetamol', currentStock: 5200, dailyConsumption: 410, reserveThresholdDays: 7, demandGrowthPct: 2 },
  { districtId: 'kolkata', medicineId: 'amoxicillin', currentStock: 6900, dailyConsumption: 450, reserveThresholdDays: 7, demandGrowthPct: 2 },
];

// Static, hand-picked transit times between district pairs (hours).
// Do not compute geospatially for the prototype. Undirected: lookup tries
// both directions at use time.
export const transitHours: Record<string, number> = {
  'hooghly->nadia': 4,
  'kolkata->nadia': 2.5,
  'hooghly->howrah': 2,
  'kolkata->howrah': 1.5,
};

// Corridors drawn on the network map (pairs with a known transit time).
// `status` is NOT stored — every screen computes it from live state (surplus,
// risk band, scenario, active transfer) so the map can never show a stale,
// hardcoded status. The count shown in any map header must equal this list's
// actual length.
export type CorridorStatus = 'active' | 'available' | 'at-risk' | 'disrupted';
export const corridors: { from: string; to: string }[] = [
  { from: 'hooghly', to: 'nadia' },
  { from: 'kolkata', to: 'nadia' },
  { from: 'hooghly', to: 'howrah' },
  { from: 'kolkata', to: 'howrah' },
];

export const simulatorPresets: SimulatorPreset[] = [
  {
    id: 's20',
    label: 'Seasonal surge',
    description: '+20% demand across all districts',
    demandMultiplier: 1.2,
  },
  {
    id: 's30',
    label: 'Regional outbreak',
    description: '+30% demand — outbreak-level surge',
    demandMultiplier: 1.3,
  },
  {
    id: 's50',
    label: 'Severe outbreak',
    description: '+50% demand — severe multi-district event',
    demandMultiplier: 1.5,
  },
  {
    id: 'supply',
    label: 'Supplier delay',
    description: 'Replenishment delayed — 25% of stock unavailable this window',
    supplyShockFactor: 0.25,
  },
  {
    id: 't20',
    label: 'Transport disruption',
    description: '+30% transit time on every corridor',
    transitDelayFactor: 1.3,
  },
  {
    id: 'flood',
    label: 'Corridor closure',
    description: 'Kolkata→Nadia corridor closed; Hooghly route slows',
    transitDelayFactor: 1.2,
    disruptedCorridors: ['kolkata->nadia'],
  },
  {
    id: 'flood2',
    label: 'Flood event',
    description: 'Multiple corridors disrupted toward Nadia and Howrah',
    transitDelayFactor: 1.25,
    disruptedCorridors: ['kolkata->nadia', 'hooghly->nadia', 'kolkata->howrah'],
  },
  {
    id: 'workforce',
    label: 'Workforce shortage',
    description: '−20% available staff statewide',
    workforceFactor: 0.8,
  },
  {
    id: 'beds',
    label: 'Bed surge',
    description: '+25% patient load and occupancy pressure',
    bedDemandFactor: 1.25,
  },
  {
    id: 'coldchain',
    label: 'Cold-chain incident',
    description: 'Temperature-sensitive lines (Insulin) degraded — prototype risk assessment',
    coldChainIncident: true,
  },
  {
    id: 'combined',
    label: 'Combined crisis',
    description: '+30% demand, +20% transit, −10% workforce',
    demandMultiplier: 1.3,
    transitDelayFactor: 1.2,
    workforceFactor: 0.9,
  },
];

// ── Extended West Bengal network ─────────────────────────────────────────
// 17 additional background districts make the underlying network state-wide
// (23 total). They carry no tracked inventory lines — they appear in state
// aggregates and the network summary, not as labeled map nodes.
export interface BackgroundDistrict {
  id: string;
  name: string;
  population: number;
  phcs: number;
  hospitals: number;
  bedUtilization: number;
  staffAvailability: number;
  logisticsVulnerability: number;
}

export const backgroundDistricts: BackgroundDistrict[] = [
  { id: 'purba-bardhaman', name: 'Purba Bardhaman', population: 4_883_000, phcs: 61, hospitals: 11, bedUtilization: 58, staffAvailability: 82, logisticsVulnerability: 22 },
  { id: 'paschim-bardhaman', name: 'Paschim Bardhaman', population: 2_882_000, phcs: 35, hospitals: 9, bedUtilization: 62, staffAvailability: 84, logisticsVulnerability: 24 },
  { id: 'bankura', name: 'Bankura', population: 3_596_000, phcs: 48, hospitals: 7, bedUtilization: 54, staffAvailability: 79, logisticsVulnerability: 40 },
  { id: 'birbhum', name: 'Birbhum', population: 3_502_000, phcs: 45, hospitals: 6, bedUtilization: 52, staffAvailability: 80, logisticsVulnerability: 38 },
  { id: 'purba-med-19', name: 'Purba Medinipur', population: 5_095_000, phcs: 63, hospitals: 9, bedUtilization: 57, staffAvailability: 81, logisticsVulnerability: 28 },
  { id: 'paschim-med', name: 'Paschim Medinipur', population: 4_776_000, phcs: 60, hospitals: 8, bedUtilization: 55, staffAvailability: 78, logisticsVulnerability: 36 },
  { id: 'jhargram', name: 'Jhargram', population: 1_136_000, phcs: 18, hospitals: 3, bedUtilization: 49, staffAvailability: 76, logisticsVulnerability: 52 },
  { id: 'purulia', name: 'Purulia', population: 2_930_000, phcs: 42, hospitals: 5, bedUtilization: 51, staffAvailability: 74, logisticsVulnerability: 58 },
  { id: 'south24pgs', name: 'South 24 Parganas', population: 8_161_000, phcs: 74, hospitals: 12, bedUtilization: 63, staffAvailability: 75, logisticsVulnerability: 34 },
  { id: 'dakshin-dinajpur', name: 'Dakshin Dinajpur', population: 1_676_000, phcs: 24, hospitals: 4, bedUtilization: 50, staffAvailability: 77, logisticsVulnerability: 48 },
  { id: 'uttar-dinajpur', name: 'Uttar Dinajpur', population: 3_007_000, phcs: 38, hospitals: 5, bedUtilization: 56, staffAvailability: 73, logisticsVulnerability: 46 },
  { id: 'darjeeling', name: 'Darjeeling', population: 1_846_000, phcs: 27, hospitals: 7, bedUtilization: 59, staffAvailability: 83, logisticsVulnerability: 55 },
  { id: 'kalimpong', name: 'Kalimpong', population: 251_000, phcs: 8, hospitals: 2, bedUtilization: 47, staffAvailability: 85, logisticsVulnerability: 62 },
  { id: 'alipurduar', name: 'Alipurduar', population: 1_491_000, phcs: 22, hospitals: 3, bedUtilization: 48, staffAvailability: 75, logisticsVulnerability: 54 },
  { id: 'coochbehar', name: 'Cooch Behar', population: 2_819_000, phcs: 36, hospitals: 5, bedUtilization: 53, staffAvailability: 78, logisticsVulnerability: 44 },
  { id: 'murshidabad', name: 'Murshidabad', population: 7_103_000, phcs: 68, hospitals: 9, bedUtilization: 60, staffAvailability: 72, logisticsVulnerability: 42 },
  { id: 'nadia-east', name: 'Nadia (East Buffer)', population: 612_000, phcs: 9, hospitals: 1, bedUtilization: 44, staffAvailability: 86, logisticsVulnerability: 30 },
];

export const DEMO_LABEL = 'SIMULATED NETWORK / DEMO DATA';

// Approximate district centroids (prototype geography — same coordinates the
// map projection is derived from). Used by the prototype transit estimator
// (haversine ÷ average speed), NOT claimed as routing-grade data.
export const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  nadia: { lat: 23.48, lon: 88.55 },
  howrah: { lat: 22.59, lon: 88.31 },
  north24pgs: { lat: 22.75, lon: 88.75 },
  malda: { lat: 25.01, lon: 88.14 },
  hooghly: { lat: 22.9, lon: 88.39 },
  kolkata: { lat: 22.57, lon: 88.36 },
};
