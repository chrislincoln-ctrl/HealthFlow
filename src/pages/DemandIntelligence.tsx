import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Info, TrendingUp } from 'lucide-react';
import { districts, inventory } from '../data/districts';
import { useScenario } from '../state/ScenarioContext';
import { DefTerm } from '../components/MetricGlossary';
import { ModelCard } from '../components/ModelCard';
import { daysOfCover } from '../utils/calc';
import {
  FORECAST_HORIZONS,
  forecastDemand,
  projectedStockOutDay,
  reserveTargetUnits,
  type ForecastHorizon,
} from '../utils/forecast';
import { medicineNameOf } from '../components/medicineName';
import { StatusBadge } from '../components/StatusBadge';

export default function DemandIntelligence() {
  const [params] = useSearchParams();
  const { scenario } = useScenario();
  const [districtId, setDistrictId] = useState(params.get('district') ?? 'nadia');
  const [medicineId, setMedicineId] = useState(params.get('medicine') ?? 'ors');
  const [horizon, setHorizon] = useState<ForecastHorizon>(14);

  useEffect(() => {
    const d = params.get('district');
    const m = params.get('medicine');
    if (d) setDistrictId(d);
    if (m) setMedicineId(m);
  }, [params]);

  const district = districts.find((d) => d.id === districtId) ?? districts[0];
  const record =
    inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId) ??
    inventory.find((r) => r.districtId === districtId) ??
    inventory[0];

  const forecast = useMemo(
    () => forecastDemand(record, scenario.demandMultiplier, horizon),
    [record, scenario.demandMultiplier, horizon],
  );
  const depletion = useMemo(
    () => projectedStockOutDay(record, scenario.demandMultiplier, 30),
    [record, scenario.demandMultiplier],
  );
  const cover = daysOfCover(record, scenario);
  const reserveTarget = reserveTargetUnits(record, scenario.demandMultiplier);
  const breachDay = depletion.day;

  // Chart rows: history then forecast bridge, forecast band, depletion path.
  const chartData = useMemo(() => {
    const rows: {
      day: string;
      history: number | null;
      forecast: number | null;
      stock: number | null;
      band: [number, number] | null;
    }[] = forecast.history.map((h) => ({
      day: `D${h.day}`,
      history: h.units,
      forecast: null,
      stock: null,
      band: null,
    }));
    const lastHist = forecast.history[forecast.history.length - 1].units;
    rows[rows.length - 1].forecast = lastHist; // bridge the gap between series
    forecast.forecast.forEach((p, i) => {
      rows.push({
        day: `+${p.day}`,
        history: null,
        forecast: p.units,
        stock: depletion.path[i]?.units ?? null,
        band: [p.lo, p.hi],
      });
    });
    return rows;
  }, [forecast, depletion]);

  // Explicit numeric domain for the log axis (log scales misbehave with the
  // 'auto' string domain): floor at the smallest positive plotted value,
  // ceiling above the largest — including the reserve target line.
  const chartDomain = useMemo<[number, number]>(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of chartData) {
      for (const v of [row.history, row.forecast, row.stock, ...(row.band ?? [])]) {
        if (typeof v === 'number' && v > 0) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [1, 10];
    return [Math.max(1, Math.floor(min * 0.8)), Math.ceil(Math.max(max, reserveTarget) * 1.1)];
  }, [chartData, reserveTarget]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Demand Intelligence</h1>
          <p className="text-xs text-slate-450">
            Prototype demand forecasting model — weighted moving average + trend + weekly seasonality, with an 80% forecast interval
          </p>
        </div>
        <span className="rounded bg-surface-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-450">
          Prototype forecast
        </span>
      </div>

      {/* Selectors: district · medicine · horizon */}
      <div className="flex flex-wrap items-center gap-2">
        {districts.map((d) => (
          <button
            key={d.id}
            onClick={() => setDistrictId(d.id)}
            aria-pressed={districtId === d.id}
            className={`rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              districtId === d.id ? 'bg-chrome text-white' : 'bg-surface-2 text-slate-450 hover:text-ink'
            }`}
          >
            {d.shortName}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {['ors', 'paracetamol', 'amoxicillin', 'insulin', 'saline']
          .filter((m) => inventory.some((r) => r.districtId === districtId && r.medicineId === m))
          .map((m) => (
            <button
              key={m}
              onClick={() => setMedicineId(m)}
              aria-pressed={medicineId === m}
              className={`rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                medicineId === m
                  ? 'bg-accent-wash dark:bg-accent/20 text-accent-dark dark:text-accent-light ring-1 ring-inset ring-accent/40'
                  : 'bg-surface-2 text-slate-450 hover:text-ink'
              }`}
            >
              {medicineNameOf(m)}
            </button>
          ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {FORECAST_HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            aria-pressed={horizon === h}
            className={`rounded px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              horizon === h ? 'bg-ai text-white' : 'bg-surface-2 text-slate-450 hover:text-ink'
            }`}
          >
            {h}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Forecast chart — the hero of this page. */}
        <section data-tour="tour-forecast-chart" className="rounded-lg border border-line bg-surface p-4 shadow-panel">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <TrendingUp className="h-4 w-4 text-ai" aria-hidden="true" />
              {district.name} · {medicineNameOf(record.medicineId)} — daily demand
            </h2>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-450">
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-chrome" /> historical demand</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-ai" /> forecast</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-ai/20" /> 80% band</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-status-critical" /> projected stock</span>
              <span className="flex items-center gap-1"><span className="h-3 w-px border-t border-dashed border-status-critical" /> reserve target</span>
            </div>
          </div>
          <p className="mb-2 text-[11px] text-slate-450">
            Forecast based on recent demand trend, weekly pattern, and current scenario assumptions.
          </p>
          <div className="mt-2">
            <ModelCard context="forecast" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--hf-line-soft)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--hf-muted)' }} stroke="var(--hf-line)" interval={6} />
                {/* Log-friendly scale: demand (~hundreds) and projected stock
                    (thousands→0) share the chart, so a purely linear axis
                    collapses the stock line into a near-vertical drop. The
                    band is rendered on the demand scale. */}
                <YAxis
                  scale="log"
                  domain={chartDomain}
                  tick={{ fontSize: 10, fill: 'var(--hf-muted)' }}
                  stroke="var(--hf-line)"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--hf-elevated)',
                    border: '1px solid var(--hf-line)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--hf-ink)',
                  }}
                  labelStyle={{ color: 'var(--hf-muted)' }}
                />
                <ReferenceLine
                  x={`+${breachDay ?? horizon}`}
                  stroke="var(--hf-line)"
                  strokeDasharray="4 3"
                  label={{
                    value: breachDay ? `projected stock-out +${breachDay}d` : 'no breach in window',
                    fontSize: 10,
                    fill: 'var(--hf-muted)',
                    position: 'insideTopRight',
                  }}
                />
                <Line dataKey="history" name="Historical demand" stroke="#33415C" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Area
                  dataKey="band"
                  name="80% interval"
                  stroke="none"
                  fill="currentColor"
                  fillOpacity={1}
                  className="text-ai/20"
                  isAnimationActive={false}
                />
                <Line dataKey="forecast" name="Forecast" stroke="#6A00F4" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                <Line dataKey="stock" name="Projected stock" stroke="#C53030" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <ReferenceLine
                  y={reserveTarget}
                  stroke="#C53030"
                  strokeDasharray="6 4"
                  label={{
                    value: `reserve target ${reserveTarget.toLocaleString()} u`,
                    fontSize: 10,
                    fill: 'var(--hf-muted)',
                    position: 'insideTopLeft',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p data-tour="tour-forecast-insight" className="mt-2 flex items-start gap-1.5 rounded bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-slate-450">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="text-ink">80% forecast interval:</strong> the range where the model expects demand to
              fall 8 times in 10, derived from backtest residuals on the most recent observed days (MAPE{' '}
              {(forecast.mape * 100).toFixed(0)}%, trend {forecast.trendPerDay >= 0 ? '+' : ''}
              {forecast.trendPerDay.toFixed(1)} units/day). Model uncertainty — not an AI confidence score.
            </span>
          </p>
        </section>

        {/* Projection panel */}
        <section className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="text-sm font-bold text-ink">Projection</h2>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between gap-2" title="Estimated number of days current inventory can support projected demand under the selected scenario.">
                <dt className="flex items-center gap-1 text-slate-450">
                  <DefTerm term="Days of cover" />
                </dt>
                <dd className="tabular font-bold text-ink">{cover.toFixed(1)}d</dd>
              </div>
              <div className="flex justify-between gap-2" title="Estimated point at which usable inventory reaches zero under the forecast demand trajectory.">
                <dt className="flex items-center gap-1 text-slate-450">
                  <DefTerm term="Projected stock-out" />
                </dt>
                <dd className={`tabular font-bold ${breachDay ? 'text-status-critical' : 'text-status-stable'}`}>
                  {breachDay ? `+${breachDay}d` : 'beyond 30d'}
                </dd>
              </div>
              <div className="flex justify-between gap-2" title="Minimum inventory coverage the prototype attempts to maintain — 7 days of projected demand. Prototype reserve assumption.">
                <dt className="flex items-center gap-1 text-slate-450">
                  Reserve target
                  <Info className="h-3 w-3 text-faint" aria-hidden="true" />
                </dt>
                <dd className="tabular font-bold text-ink">{reserveTarget.toLocaleString()} u</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-450">Demand trend</dt>
                <dd className={`tabular font-bold ${forecast.trendPerDay > 1 ? 'text-status-critical' : forecast.trendPerDay < -1 ? 'text-status-stable' : 'text-ink'}`}>
                  {forecast.trendPerDay >= 0 ? '+' : ''}{forecast.trendPerDay.toFixed(1)} u/day
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-450">Stock on hand</dt>
                <dd className="tabular font-bold text-ink">{record.currentStock.toLocaleString()} u</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
              Risk impact
            </h2>
            <div className="mt-3 flex items-center justify-between">
              <StatusBadge band={district.riskBand} size="sm" />
              <span className="text-[11px] text-slate-450">baseline band</span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-450">
              Change the demand multiplier in the{' '}
              <Link to="/simulator" className="font-semibold text-accent hover:underline">Simulator</Link> — the forecast,
              cover, and stock-out projection react here, and every other screen reads the same calculation engine.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
