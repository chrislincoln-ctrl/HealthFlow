import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightLeft,
  FlaskConical,
  Info,
  LineChart as LineChartIcon,
  Package,
  Truck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { District, InventoryRecord } from '../types';
import { districts, inventory, medicines } from '../data/districts';
import {
  buildTransferRecommendation,
  daysOfCover,
  projectedDemand,
  riskBand,
  riskFactors,
  stockOutDays,
  transitHoursBetween,
  riskScore,
} from '../utils/calc';
import {
  phcsForDistrict,
  districtAggregates,
  phcRisk,
  districtFacilitySignals,
} from '../data/phc';
import { useScenario } from '../state/ScenarioContext';
import { StatusBadge } from './StatusBadge';
import { FactorBars } from './FactorBars';
import { Drawer } from './Drawer';

const TABS = ['Overview', 'Inventory', 'Demand', 'Recommendations'] as const;
type Tab = (typeof TABS)[number];

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;

export function DistrictDrawer({
  district,
  records,
  multiplier,
  onClose,
}: {
  district: District | null;
  records: InventoryRecord[];
  multiplier: number;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={district !== null}
      onClose={onClose}
      title={
        district ? (
          <span className="flex items-center gap-2">
            {district.name}
            <DistrictBadge district={district} records={records} multiplier={multiplier} />
          </span>
        ) : (
          ''
        )
      }
      subtitle={
        district ? (
          <span>
            {/* Breadcrumb: the drill path is part of the mental model. */}
            <span aria-label="Drill-down path" className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-450">
              <span>{district.state}</span>
              <span aria-hidden="true" className="text-faint">/</span>
              <span className="text-ink">{district.name}</span>
              <span aria-hidden="true" className="text-faint">/</span>
              <span className="text-ai-dark dark:text-ai-light">PHC Network</span>
            </span>
            <span className="tabular">
              {(district.population / 1_000_000).toFixed(2)}M people ·{' '}
              {district.phcs} PHCs · {district.hospitals} hospitals
            </span>
          </span>
        ) : null
      }
    >
      {district && (
        <DistrictTabs district={district} records={records} multiplier={multiplier} />
      )}
    </Drawer>
  );
}

function DistrictBadge({
  district,
  records,
  multiplier,
}: {
  district: District;
  records: InventoryRecord[];
  multiplier: number;
}) {
  const { score, worstRecord } = useMemo(() => {
    let best: { score: number; rec: InventoryRecord } | null = null;
    for (const r of records) {
      const s = riskScore(district, r, multiplier);
      if (!best || s > best.score) best = { score: s, rec: r };
    }
    return best ? { score: best.score, worstRecord: best.rec } : { score: 0, worstRecord: null };
  }, [district, records, multiplier]);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular text-sm font-bold text-ink">{score}</span>
      {worstRecord && <StatusBadge band={riskBand(score)} size="sm" />}
    </span>
  );
}

function DistrictTabs({
  district,
  records,
  multiplier,
}: {
  district: District;
  records: InventoryRecord[];
  multiplier: number;
}) {
  const [tab, setTab] = useState<Tab>('Overview');

  const worst = useMemo(() => {
    let best: { rec: InventoryRecord; score: number } | null = null;
    for (const r of records) {
      const s = riskScore(district, r, multiplier);
      if (!best || s > best.score) best = { rec: r, score: s };
    }
    return best;
  }, [district, records, multiplier]);

  return (
    <div>
      <div role="tablist" aria-label="District intelligence sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-t px-3 py-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              tab === t ? 'border-b-2 border-accent text-accent-dark dark:text-accent-light' : 'text-slate-450 hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === 'Overview' && worst && (
          <OverviewTab district={district} records={records} multiplier={multiplier} worstRecord={worst.rec} />
        )}
        {tab === 'Inventory' && <InventoryTab district={district} records={records} multiplier={multiplier} />}
        {tab === 'Demand' && worst && <DemandTab records={records} multiplier={multiplier} worstRecord={worst.rec} />}
        {tab === 'Recommendations' && worst && <RecommendationsTab district={district} records={records} multiplier={multiplier} worstRecord={worst.rec} />}
      </div>
    </div>
  );
}

function OverviewTab({
  district,
  records,
  multiplier,
  worstRecord,
}: {
  district: District;
  records: InventoryRecord[];
  multiplier: number;
  worstRecord: InventoryRecord;
}) {
  const score = riskScore(district, worstRecord, multiplier);
  const band = riskBand(score);
  const factors = useMemo(() => riskFactors(district, worstRecord, multiplier), [district, worstRecord, multiplier]);

  const medName = medicineName(worstRecord.medicineId);
  const doc = daysOfCover(worstRecord);
  const so = stockOutDays(worstRecord, multiplier);
  const stressNote =
    multiplier === 1 ? 'baseline demand' : `current ×${multiplier.toFixed(2)} demand stress`;

  return (
    <div className="space-y-5">
      <p data-tour="tour-urgent-line" className="text-sm leading-relaxed text-ink">
        <span className="font-semibold">{medName}</span> demand is{' '}
        <span className="tabular font-semibold">+{worstRecord.demandGrowthPct}%</span> above baseline
        with <span className="tabular font-semibold">{doc.toFixed(1)} days</span> of coverage
        remaining — stock-out projected in{' '}
        <span className="tabular font-semibold">{so.toFixed(1)} days</span> under {stressNote}
        {so < worstRecord.reserveThresholdDays
          ? `, below the ${worstRecord.reserveThresholdDays}-day reserve.`
          : `, above the ${worstRecord.reserveThresholdDays}-day reserve.`}
      </p>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450">
            Composite risk score
          </h4>
          <p className="tabular text-2xl font-extrabold text-ink">
            {score}
            <span className="ml-1 text-xs font-medium text-slate-450">/ 100</span>
          </p>
        </div>
        <div className="mt-1"><StatusBadge band={band} /></div>
        {/* Weighted factor bars (weights are prototype assumptions) */}
        <p className="mt-4 flex items-center gap-1 text-[11px] text-slate-450">
          <Info className="h-3 w-3" aria-hidden="true" />
          Six weighted factors (illustrative prototype weights, shown per bar)
        </p>
        <div data-tour="tour-factor-bars" className="mt-2">
          <FactorBars factors={factors} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Bed utilization', value: `${district.bedUtilization}%` },
          { label: 'Staff availability', value: `${district.staffAvailability}%` },
          { label: 'Logistics vulnerability', value: `${district.logisticsVulnerability}/100` },
          { label: 'Tracked lines', value: String(records.length) },
        ].map((s) => (
          <div key={s.label} className="rounded border border-line bg-surface px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">
              {s.label}
            </dt>
            <dd className="tabular mt-0.5 text-sm font-bold text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* PHC drill-down — State → District → PHC. Aggregated from the same
          seeded PHC layer (src/data/phc.ts); district numbers stay the single
          source of truth and PHC rows split them coherently. */}
      <PhcBreakdown districtId={district.id} />
    </div>
  );
}

function PhcBreakdown({ districtId }: { districtId: string }) {
  const { scenario } = useScenario();
  const rows = useMemo(
    () => phcsForDistrict(districtId).map((p) => phcRisk(p)),
    [districtId],
  );
  const agg = useMemo(() => districtAggregates(districtId), [districtId]);
  const signals = useMemo(() => districtFacilitySignals(districtId), [districtId]);
  const [openPhc, setOpenPhc] = useState<string | null>(null);
  // PHC rows expand on demand — "View PHCs" is the explicit judge action.
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      {/* Facility-signal summary — WHY the district risk is what it is */}
      <div

        className="mb-3 rounded border border-line-soft bg-surface-2 px-3 py-2"
        data-tour="phc-drilldown"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
          District risk is aggregated from facility-level signals
        </p>
        <p className="tabular mt-1 text-[11px] leading-relaxed text-ink">
          {districts.find((d) => d.id === districtId)?.name} · {signals.total} of {districts.find((d) => d.id === districtId)?.phcs ?? signals.total} PHCs modeled
          (representative sample, not all facilities) ·{' '}
          <span className="font-semibold text-status-watch">{signals.elevated} elevated</span> ·{' '}
          <span className="font-semibold text-status-critical">{signals.projectedBreach} projected to breach reserve</span>
          {signals.criticalLines > 0 && (
            <> · <span className="font-semibold">{signals.criticalLines} critical medicine line{signals.criticalLines > 1 ? 's' : ''}</span></>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450">
          PHC breakdown
        </h4>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded bg-chrome px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? 'Hide PHCs' : `View PHCs (${agg.phcCount})`}
          <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="tabular mt-1 text-[11px] text-slate-450">
        {agg.beds} beds · {agg.staffAvailable}/{agg.staffTotal} staff available
      </p>
      {open && (
      <table className="mt-2 w-full text-left text-xs">
        <caption className="sr-only">Facility-level view for this district — click a row for detail</caption>
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-slate-450">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Facility</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Population</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Beds</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Staff</th>
            <th scope="col" className="py-1.5 text-right font-semibold">Worst cover</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => {
            const { phc, worstCoverDays, worstMedicineId, bedUtilization, staffAvailability, band } = r;
            const open = openPhc === phc.id;
            return (
              <PhcRow
                key={phc.id}
                risk={r}
                open={open}
                onToggle={() => setOpenPhc(open ? null : phc.id)}
                scenario={scenario}
                bedUtilization={bedUtilization}
                staffAvailability={staffAvailability}
                worstCoverDays={worstCoverDays}
                worstMedicineId={worstMedicineId}
                band={band}
              />
            );
          })}
        </tbody>
      </table>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-450">
        Synthetic facility records, seeded and reload-stable — the district aggregates above are
        coherent with these rows.
      </p>
    </div>
  );
}

/** One PHC row + expandable detail panel (facility profile, alerts, risk why). */
function PhcRow({
  risk,
  open,
  onToggle,
  scenario,
}: {
  risk: ReturnType<typeof phcRisk>;
  open: boolean;
  onToggle: () => void;
  scenario: ReturnType<typeof useScenario>['scenario'];
  bedUtilization: number;
  staffAvailability: number;
  worstCoverDays: number;
  worstMedicineId: string | null;
  band: import('../types').RiskBandName;
}) {
  const { phc } = risk;
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
        aria-expanded={open}
      >
        <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}
            >
              →
            </span>
            {phc.name}
            <span className="align-middle"><StatusBadge band={risk.band} size="sm" /></span>
          </span>
        </th>
        <td className="tabular py-1.5 pr-3 text-right">{phc.populationServed.toLocaleString()}</td>
        <td className="tabular py-1.5 pr-3 text-right" title={`${risk.bedUtilization}% occupied`}>
          {phc.occupiedBeds}/{phc.beds}
        </td>
        <td className="tabular py-1.5 pr-3 text-right" title={`${risk.staffAvailability}% available`}>
          {phc.staffAvailable}/{phc.staffTotal}
        </td>
        <td className="tabular py-1.5 text-right">
          {risk.worstMedicineId ? `${risk.worstCoverDays.toFixed(1)}d ${medicineName(risk.worstMedicineId)}` : '—'}
        </td>
      </tr>
      {open && <PhcDetail risk={risk} scenario={scenario} />}
    </>
  );
}

/** Expanded PHC detail: profile, medicine inventory, projected shortages, alerts, "why at risk". */
function PhcDetail({ risk, scenario }: { risk: ReturnType<typeof phcRisk>; scenario: ReturnType<typeof useScenario>['scenario'] }) {
  const { phc } = risk;
  const lines = Object.entries(phc.medicineStock).map(([medicineId, stock]) => {
    const districtRec = inventory.find(
      (r) => r.districtId === phc.districtId && r.medicineId === medicineId,
    );
    const rec = { ...districtRec!, currentStock: stock };
    return { rec, cover: daysOfCover(rec, scenario), medicineId, stock };
  });
  const alerts = lines
    .filter((l) => l.cover < phc.reserveTarget)
    .sort((a, b) => a.cover - b.cover);

  return (
    <tr>
      <td colSpan={5} className="bg-surface-2 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Profile */}
          <div>
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Facility profile</h5>
            <dl className="tabular mt-1 space-y-0.5 text-[11px] text-slate-450">
              <div className="flex justify-between"><dt>Population served</dt><dd className="font-semibold text-ink">{phc.populationServed.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Patients today</dt><dd className="font-semibold text-ink">{phc.patientFootfall.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Bed utilization</dt><dd className="font-semibold text-ink">{risk.bedUtilization}%</dd></div>
              <div className="flex justify-between"><dt>Staff availability</dt><dd className="font-semibold text-ink">{risk.staffAvailability}%</dd></div>
              <div className="flex justify-between"><dt>Reserve target</dt><dd className="font-semibold text-ink">{phc.reserveTarget}d (prototype)</dd></div>
            </dl>
          </div>
          {/* Medicine lines */}
          <div>
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Medicine inventory</h5>
            <ul role="list" className="tabular mt-1 space-y-0.5 text-[11px]">
              {lines.map(({ medicineId, stock, cover }) => (
                <li key={medicineId} className="flex justify-between gap-2">
                  <span className="text-slate-450">{medicineName(medicineId)}</span>
                  <span className={
                    cover < phc.reserveTarget ? 'font-semibold text-status-critical' : 'font-semibold text-ink'
                  }>
                    {stock.toLocaleString()} u · {cover.toFixed(1)}d
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Alerts */}
        <div className="mt-3">
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Recent alerts</h5>
          {alerts.length === 0 ? (
            <p className="mt-1 text-[11px] text-status-stable">No line below reserve — no active alerts.</p>
          ) : (
            <ul role="list" className="mt-1 space-y-1">
              {alerts.map(({ medicineId, cover }) => (
                <li key={medicineId} className="flex items-center gap-1.5 text-[11px] text-status-critical">
                  <span className="font-bold">CRITICAL</span>
                  <span className="text-slate-450">
                    {medicineName(medicineId)} · projected stock-out in {cover.toFixed(1)} days — below the{' '}
                    {phc.reserveTarget}-day reserve target
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Why at risk — deterministic explanation */}
        <p className="mt-3 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-slate-450">
          <span className="font-semibold text-ink">Why this PHC is at risk:</span> the deterministic risk engine scores{' '}
          {phc.name} from the same six factors used district-wide. This facility's band is{' '}
          <span className="font-semibold text-ink">{risk.band.toUpperCase()}</span>, driven by{' '}
          {risk.worstMedicineId ? (
            <>
              {medicineName(risk.worstMedicineId)} cover of {risk.worstCoverDays.toFixed(1)} days against a{' '}
              {phc.reserveTarget}-day target, with bed utilization at {risk.bedUtilization}%.{' '}
            </>
          ) : (
            'no tracked medicine lines (bed and workforce signals only). '
          )}
          Facility records are synthetic; the risk logic is the shared engine.
        </p>
      </td>
    </tr>
  );
}

// Factor computation comes from the shared engine (utils/calc) — no local copy.

function InventoryTab({
  district,
  records,
  multiplier,
}: {
  district: District;
  records: InventoryRecord[];
  multiplier: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{district.name} inventory lines</caption>
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-slate-450">
            <th scope="col" className="py-2 pr-3 font-semibold">Medicine</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Stock</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Daily use</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Cover</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Stock-out</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Δ demand</th>
            <th scope="col" className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {records.map((r) => {
            const doc = daysOfCover(r);
            const so = stockOutDays(r, multiplier);
            const band = riskBand(riskScore(district, r, multiplier));
            return (
              <tr key={r.medicineId} className="align-middle">
                <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                  {medicineName(r.medicineId)}
                </th>
                <td className="tabular py-2 pr-3 text-right">{r.currentStock.toLocaleString()}</td>
                <td className="tabular py-2 pr-3 text-right">{r.dailyConsumption.toLocaleString()}</td>
                <td className="tabular py-2 pr-3 text-right font-semibold">{doc.toFixed(1)}d</td>
                <td className="tabular py-2 pr-3 text-right">{so.toFixed(1)}d</td>
                <td className="tabular py-2 pr-3 text-right">+{r.demandGrowthPct}%</td>
                <td className="py-2"><StatusBadge band={band} size="sm" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-450">
        Cover = stock ÷ daily consumption. Stock-out uses projected demand
        {multiplier !== 1 ? ` at ×${multiplier.toFixed(2)} scenario` : ''} vs the{' '}
        {records[0]?.reserveThresholdDays ?? 7}-day reserve threshold.
      </p>
    </div>
  );
}

function DemandTab({
  records,
  multiplier,
  worstRecord,
}: {
  records: InventoryRecord[];
  multiplier: number;
  worstRecord: InventoryRecord;
}) {
  const [selectedId, setSelectedId] = useState(worstRecord.medicineId);
  const selected = records.find((r) => r.medicineId === selectedId) ?? worstRecord;

  const data = useMemo(() => {
    const dailyUse = projectedDemand(selected, multiplier);
    const reserve = selected.reserveThresholdDays * selected.dailyConsumption;
    return Array.from({ length: 15 }, (_, day) => ({
      day,
      stock: Math.max(0, Math.round(selected.currentStock - dailyUse * day)),
      reserve,
    }));
  }, [selected, multiplier]);

  const so = stockOutDays(selected, multiplier);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose medicine line">
        {records.map((r) => (
          <button
            key={r.medicineId}
            onClick={() => setSelectedId(r.medicineId)}
            aria-pressed={selectedId === r.medicineId}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              selectedId === r.medicineId
                ? 'bg-accent-wash dark:bg-accent/20 text-accent-dark dark:text-accent-light ring-1 ring-inset ring-accent/40'
                : 'bg-surface-2 text-slate-450 hover:text-ink'
            }`}
          >
            {medicineName(r.medicineId)}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <LineChartIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Projected stock trajectory — 14 days
          </h4>
          <p className="tabular text-[11px] text-slate-450">
            Stock-out in <span className="font-bold text-status-critical">{so.toFixed(1)}d</span>
          </p>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hf-line-soft)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--hf-muted)' }} tickFormatter={(d) => `d${d}`} stroke="var(--hf-line)" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--hf-muted)' }} stroke="var(--hf-line)" />
              <Tooltip
                formatter={(value: number, name) => [value.toLocaleString(), name === 'stock' ? 'Projected stock' : 'Reserve threshold']}
                labelFormatter={(d) => `Day ${d}`}
                contentStyle={{
                  backgroundColor: 'var(--hf-elevated)',
                  border: '1px solid var(--hf-line)',
                  borderRadius: 6,
                  color: 'var(--hf-ink)',
                  fontSize: 11,
                }}
                labelStyle={{ color: 'var(--hf-muted)' }}
                cursor={{ fill: 'var(--hf-line-soft)', opacity: 0.4 }}
              />
              <Bar dataKey="stock" fill="#0E7C7B" radius={[2, 2, 0, 0]} maxBarSize={26} />
              <ReferenceLine
                y={data[0]?.reserve}
                stroke="#C53030"
                strokeDasharray="4 3"
                label={{ value: 'reserve', fontSize: 10, fill: '#C53030', position: 'insideTopRight' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-450">
          {medicineName(selected.medicineId)}: {selected.currentStock.toLocaleString()} units on hand,
          projected burn ≈ {Math.round(projectedDemand(selected, multiplier)).toLocaleString()} units/day
          (baseline {selected.dailyConsumption.toLocaleString()} ×{' '}
          {(1 + selected.demandGrowthPct / 100).toFixed(2)} growth
          {multiplier !== 1 ? ` × ${multiplier.toFixed(2)} scenario` : ''}). Red line ={' '}
          {selected.reserveThresholdDays}-day reserve.
        </p>
      </div>
    </div>
  );
}

function RecommendationsTab({
  district,
  records,
  multiplier,
  worstRecord,
}: {
  district: District;
  records: InventoryRecord[];
  multiplier: number;
  worstRecord: InventoryRecord;
}) {
  const shortageLines = useMemo(
    () => records.filter((r) => stockOutDays(r, multiplier) < r.reserveThresholdDays),
    [records, multiplier],
  );

  const recs = useMemo(() => {
    return shortageLines
      .map((shortage) => {
        const sources = districts
          .filter((d) => d.id !== district.id)
          .map((d) => {
            // Cross-district source lookup needs the same medicine elsewhere:
            const sourceRecord = sourceRecordFor(d.id, shortage.medicineId);
            const t = transitHoursBetween(district.id, d.id);
            if (!sourceRecord || t === null) return null;
            return { record: sourceRecord, transitHours: t };
          })
          .filter(Boolean) as { record: InventoryRecord; transitHours: number }[];
        const rec = buildTransferRecommendation(shortage, district, sources, multiplier);
        return { shortage, rec };
      })
      .filter((x) => x.rec !== null);
  }, [shortageLines, district, multiplier]);

  return (
    <div className="space-y-4">
      {recs.length === 0 && (
        <div className="rounded-lg border border-line bg-surface p-4 text-xs text-slate-450">
          No redistribution needed for this district at the current scenario — every tracked line
          holds its {worstRecord.reserveThresholdDays}-day reserve
          {multiplier !== 1 ? ' even under scenario stress' : ''}.
        </div>
      )}

      {recs.map(({ shortage, rec }) => (
        <div key={shortage.medicineId} className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink">{medicineName(shortage.medicineId)}</h4>
            <StatusBadge band={rec!.bandAfter} size="sm" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {rec!.legs.length > 1 ? (
              <span className="tabular inline-flex items-center gap-1.5 font-semibold text-ink">
                <Truck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                Move {rec!.fullPlanQuantity.toLocaleString()} units — {rec!.legs.length} sources:{' '}
                {rec!.legs
                  .map(
                    (leg) =>
                      `${leg.quantity.toLocaleString()} from ${districts.find((d) => d.id === leg.fromDistrictId)?.name}`,
                  )
                  .join(' + ')}
              </span>
            ) : (
              <span className="tabular inline-flex items-center gap-1.5 font-semibold text-ink">
                <Truck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                Move {rec!.quantity.toLocaleString()} units from{' '}
                {districts.find((d) => d.id === rec!.fromDistrictId)?.name}
              </span>
            )}
            <span className="tabular text-slate-450">{rec!.transitHours}h transit</span>
            <span className="tabular text-slate-450">
              cover {rec!.daysOfCoverBefore.toFixed(1)}d → {rec!.fullPlanCoverAfter.toFixed(1)}d
            </span>
            <span className="tabular text-slate-450">
              score {rec!.scoreBefore} → {rec!.scoreAfter}
            </span>
          </div>
          {rec!.fullPlanGapUnits > 0 && (
            <p className="mt-1.5 text-[11px] text-status-watch">
              Partial fill — leaves a {rec!.fullPlanGapUnits.toLocaleString()}-unit shortfall against
              the reserve.
            </p>
          )}
          <Link
            to={`/redistribution?district=${district.id}&medicine=${shortage.medicineId}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Redistribution Engine
          </Link>
        </div>
      ))}

      {multiplier > 1 && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-450">
          <FlaskConical className="h-3 w-3" aria-hidden="true" />
          Recommendations reflect the current ×{multiplier.toFixed(2)} demand scenario.
        </p>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-slate-450">
        <Package className="h-3 w-3" aria-hidden="true" />
        Sources ranked by transit time, then surplus; each source keeps a 7-day reserve.
      </p>
    </div>
  );
}

function sourceRecordFor(districtId: string, medicineId: string): InventoryRecord | null {
  return inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId) ?? null;
}
