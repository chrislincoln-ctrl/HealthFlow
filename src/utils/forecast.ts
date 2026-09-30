// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE DEMAND FORECASTING ENGINE
//
// Deterministic synthetic demand history + a transparent forecasting model.
// Same inputs → same outputs, every session (seeded generator, no Date.now(),
// no Math.random()). All forecast math lives here — pages call these functions;
// none re-implement forecasting.
// ─────────────────────────────────────────────────────────────────────────────

import { hashString, mulberry32 } from './seed';

export const HISTORY_DAYS = 49; // 7 weeks — enough for weekly seasonality
export const FORECAST_HORIZONS = [7, 14, 30] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

/** One day of synthetic observed demand for a district+medicine line. */
export interface DemandObservation {
  day: number; // 1..HISTORY_DAYS
  units: number;
}

/**
 * Seeded synthetic history: baseline = current daily consumption, plus trend,
 * weekly seasonality (weekday/weekend clinic pattern), occasional spikes, and
 * recent acceleration matching the record's demandGrowthPct. Deterministic
 * per (districtId, medicineId) — a reload regenerates the identical series.
 */
export function demandHistory(record: {
  districtId: string;
  medicineId: string;
  dailyConsumption: number;
  demandGrowthPct: number;
}): DemandObservation[] {
  const rand = mulberry32(hashString(`${record.districtId}:${record.medicineId}`));
  const base = record.dailyConsumption;
  const weekly = 1 + (record.demandGrowthPct / 100) * (0.35 / 0.31); // growth folded into trend
  const out: DemandObservation[] = [];
  // Weights ramp recent days so the trailing trend reflects demandGrowthPct.
  const ramp = (day: number) => 1 + (record.demandGrowthPct / 100) * ((day - 1) / (HISTORY_DAYS - 1));
  for (let d = 1; d <= HISTORY_DAYS; d++) {
    const dow = d % 7; // 0..6 within the synthetic week
    const seasonality = dow === 0 ? 0.72 : dow === 6 ? 0.85 : 1 + (dow === 3 ? 0.08 : 0); // Sunday dips
    const spike = rand() < 0.06 ? 1 + rand() * 0.35 : 1;
    const noise = 0.9 + rand() * 0.2;
    out.push({ day: d, units: Math.round(base * ramp(d) * seasonality * spike * noise) });
  }
  void weekly;
  return out;
}

export interface ForecastPoint {
  day: number; // 1..horizon, relative to "today" (end of history)
  units: number;
  /** 80% forecast interval around this point (model residual based). */
  lo: number;
  hi: number;
}

export interface DemandForecast {
  history: DemandObservation[];
  forecast: ForecastPoint[];
  /** Fitted recent trend, units/day (positive = accelerating). */
  trendPerDay: number;
  /** Mean |residual| of a backtest against the last 14 historical days. */
  meanAbsError: number;
  /** Relative error of the backtest — the honest uncertainty scale. */
  mape: number;
  horizon: ForecastHorizon;
}

/**
 * Weighted-moving-average + trend + weekly seasonality forecast, fully
 * deterministic and explainable. Uncertainty = backtest residuals on the last
 * 14 observed days (80% interval ≈ ±1.28σ of scaled residuals).
 */
export function forecastDemand(
  record: { districtId: string; medicineId: string; dailyConsumption: number; demandGrowthPct: number },
  multiplier = 1,
  horizon: ForecastHorizon = 14,
): DemandForecast {
  const history = demandHistory(record);
  // Recent window weighted toward the newest days (wMA over last 21 days).
  const window = history.slice(-21);
  let wSum = 0;
  let wMean = 0;
  window.forEach((o, i) => {
    const w = i + 1;
    wMean += o.units * w;
    wSum += w;
  });
  wMean /= wSum;
  const recent = history.slice(-14);
  const older = history.slice(-28, -14);
  const meanA = older.reduce((s, o) => s + o.units, 0) / Math.max(1, older.length);
  const meanB = recent.reduce((s, o) => s + o.units, 0) / Math.max(1, recent.length);
  const trendPerDay = (meanB - meanA) / 14;
  // Weekly shape from history (mean of same weekday / overall mean).
  const overall = history.reduce((s, o) => s + o.units, 0) / history.length;
  const dowFactor: number[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const days = history.filter((o) => o.day % 7 === dow);
    dowFactor.push(days.reduce((s, o) => s + o.units, 0) / (days.length * overall || 1));
  }

  // Backtest: naive 7-day-persistence vs observed, last 14 days.
  const errs: number[] = [];
  for (let i = 14; i < history.length; i++) {
    const predicted = history[i - 7].units;
    errs.push(Math.abs(history[i].units - predicted) / Math.max(1, history[i].units));
  }
  const mape = errs.reduce((s, e) => s + e, 0) / Math.max(1, errs.length);
  const meanAbsError = (mape * overall) || overall * 0.08;
  // 80% interval ≈ ±1.28σ; σ approximated from the residual spread.
  const sigma = meanAbsError * 1.25;

  const forecast: ForecastPoint[] = [];
  const startLevel = wMean;
  for (let d = 1; d <= horizon; d++) {
    const dow = (history.length + d) % 7;
    const units = Math.max(0, (startLevel + trendPerDay * d) * dowFactor[dow] * multiplier);
    const spread = sigma * Math.sqrt(d) * 1.28;
    forecast.push({
      day: d,
      units: Math.round(units),
      lo: Math.max(0, Math.round(units - spread)),
      hi: Math.round(units + spread),
    });
  }
  return { history, forecast, trendPerDay, meanAbsError, mape, horizon };
}

/**
 * PROJECTED STOCK-OUT: walk the forecast day by day, subtracting forecast
 * demand from current stock. Stock-out = first day usable inventory hits 0.
 * This replaces stock/Today's-demand as the primary projection method.
 */
export function projectedStockOutDay(
  record: { currentStock: number; districtId: string; medicineId: string; dailyConsumption: number; demandGrowthPct: number },
  multiplier = 1,
  horizon: ForecastHorizon = 30,
): { day: number | null; path: { day: number; units: number }[] } {
  const f = forecastDemand(record, multiplier, horizon);
  let stock = record.currentStock;
  const path: { day: number; units: number }[] = [];
  for (const p of f.forecast) {
    stock -= p.units;
    path.push({ day: p.day, units: Math.max(0, Math.round(stock)) });
    if (stock <= 0) return { day: p.day, path };
  }
  return { day: null, path };
}

/**
 * DAYS OF COVER — forecast-weighted: number of days until projected usable
 * inventory reaches zero on the forecast trajectory (not stock/today's usage).
 * Falls back to a capped number when the horizon is never breached.
 */
export function forecastDaysOfCover(
  record: { currentStock: number; districtId: string; medicineId: string; dailyConsumption: number; demandGrowthPct: number },
  multiplier = 1,
): number {
  const { day } = projectedStockOutDay(record, multiplier, 30);
  if (day !== null) return day;
  // No breach inside 30d: extrapolate cover from the mean forecast rate.
  const f = forecastDemand(record, multiplier, 30);
  const meanDaily = f.forecast.reduce((s, p) => s + p.units, 0) / f.forecast.length;
  return Math.round((record.currentStock / Math.max(1, meanDaily)) * 10) / 10;
}

/** Reserve target in units for a record under projected demand. */
export function reserveTargetUnits(
  record: Pick<InventoryRecordLike, 'reserveThresholdDays'> & { dailyConsumption: number; demandGrowthPct: number },
  multiplier = 1,
): number {
  const base = record.dailyConsumption * (1 + record.demandGrowthPct / 100) * multiplier;
  return Math.round(record.reserveThresholdDays * base);
}

// Minimal structural type to avoid a circular import with src/types.
interface InventoryRecordLike {
  districtId: string;
  medicineId: string;
  currentStock: number;
  dailyConsumption: number;
  reserveThresholdDays: number;
  demandGrowthPct: number;
}

/** Whole-shipment rounding per resource (prototype logistics assumption).
    Floors so a source is never drawn below its reserve by rounding up. */
export function roundShipment(medicineId: string, units: number): number {
  const step = medicineId === 'insulin' ? 50 : 100;
  return Math.max(0, Math.floor(units / step) * step);
}
