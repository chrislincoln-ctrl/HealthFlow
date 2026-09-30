import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, FlaskConical, Users, AlertTriangle, PackageX, Radio } from 'lucide-react';
import type { InventoryRecord, RiskBandName } from '../types';
import { districts, inventory, medicines } from '../data/districts';
import { daysOfCover, stockOutDays } from '../utils/calc';
import { useScenario } from '../state/ScenarioContext';
import { useInterventions } from '../state/InterventionContext';
import { computeResilienceIndex } from '../utils/resilience';
import { stateSummary, districtAggregates } from '../data/phc';
import { KpiCard } from '../components/KpiCard';
import { NetworkMap } from '../components/NetworkMap';
import type { NetworkCorridorStatus, NetworkMapCorridor, NetworkMapNode } from '../components/NetworkMap';
import { corridors as corridorData } from '../data/districts';
import { surplusUnits } from '../utils/calc';
import { StatusBadge } from '../components/StatusBadge';
import { DistrictDrawer } from '../components/DistrictDrawer';

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;

/** Action vocabulary mapped from status vocabulary. */
function actionFor(band: RiskBandName): string {
  switch (band) {
    case 'critical':
      return 'ACT — rebalance now';
    case 'high':
      return 'INVESTIGATE';
    case 'watch':
      return 'SIMULATE';
    default:
      return 'MONITOR';
  }
}

const stateSummaryData = stateSummary();

export default function CommandCenter() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const { risks, scenario } = useScenario();
  const { recommendations } = useInterventions();
  // Districts whose best available plan still leaves them below reserve —
  // shown as ESCALATE chips so a partial fix never reads as resolved.
  const escalatedDistrictIds = useMemo(
    () => new Set(recommendations.filter((r) => r.insufficient).map((r) => r.toDistrictId)),
    [recommendations],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Deep link (?district=) opens the District Intelligence drawer directly.
  // Dedupe-ref sync: this effect re-runs on every location change and always
  // mirrors the param into state, so it also re-opens the drawer when the
  // same URL is re-pushed after an intermediate navigation (the guided tour
  // goes base → ?district=nadia within one stage transition). A plain dep
  // array can miss that because the last committed location had the same
  // search string as the new one.
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const district = params.get('district');
    const key = `${location.key}|${district ?? ''}`;
    if (lastSyncRef.current === key) return;
    lastSyncRef.current = key;
    setSelectedId(district);
  }, [params, location]);

  const bands = useMemo(() => {
    const map: Record<string, RiskBandName> = {};
    const counts: Record<RiskBandName, number> = { stable: 0, watch: 0, high: 0, critical: 0 };
    for (const r of risks) {
      map[r.districtId] = r.band;
      counts[r.band] += 1;
    }
    return { map, counts };
  }, [risks]);

  const scores = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of risks) map[r.districtId] = r.score;
    return map;
  }, [risks]);

  const kpis = useMemo(() => {
    const shortLines = inventory.filter(
      (r) => stockOutDays(r, scenario.demandMultiplier) < r.reserveThresholdDays,
    );
    // Facility-derived bed pressure (PART 1 aggregation rule): district beds
    // sum from the seeded PHC layer, never the reverse.
    const beds = districts.reduce((s, d) => s + districtAggregates(d.id).beds, 0);
    const occupied = districts.reduce((s, d) => s + districtAggregates(d.id).occupiedBeds, 0);
    // 10-day window: inside it the count differentiates meaningfully from
    // the lines-below-reserve count (wider windows just saturate).
    const stockOuts = inventory.filter((r) => {
      const so = stockOutDays(r, scenario.demandMultiplier);
      return so <= 10 && so >= 0;
    }).length;
    return { shortLines, beds, occupied, bedUtilPct: beds ? (occupied / beds) * 100 : 0, stockOuts };
  }, [scenario.demandMultiplier]);

  const selected = districts.find((d) => d.id === selectedId) ?? null;

  // Corridors: one entry per item in the canonical `corridors` list. Status is
  // COMPUTED from live state, never stored: active = recommended/simulated
  // transfer, available = surplus + source stable/watch, at-risk = source
  // high/critical. The header count equals corridors.length — honestly.
  const mapCorridors: NetworkMapCorridor[] = useMemo(() => {
    const worstBandOf = (districtId: string): RiskBandName => bands.map[districtId] ?? 'stable';
    return corridorData.map((c) => {
      const sourceBand = worstBandOf(c.from);
      const sourceHasSurplus = inventory.some(
        (r) => r.districtId === c.from && r.medicineId === 'ors' && surplusUnits(r) > 0,
      );
      const status: NetworkCorridorStatus = sourceHasSurplus && (sourceBand === 'stable' || sourceBand === 'watch')
        ? 'available'
        : sourceBand === 'high' || sourceBand === 'critical'
          ? 'at-risk'
          : 'available';
      return { from: c.from, to: c.to, status };
    });
  }, [bands.map]);

  const mapNodes: NetworkMapNode[] = useMemo(
    () =>
      districts.map((d) => ({
        id: d.id,
        name: d.shortName,
        score: scores[d.id] ?? 0,
        band: bands.map[d.id] ?? 'stable',
        selected: selectedId === d.id,
      })),
    [bands.map, scores, selectedId],
  );
  const selectedRecords = useMemo(
    () => inventory.filter((r) => r.districtId === selectedId),
    [selectedId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Command Center</h1>
          <p className="text-xs text-slate-450">
            West Bengal PHC supply network — current simulated composite risk by district
          </p>
        </div>
      </div>

      {/* KPI strip — the five decision metrics. Values from src/data + the
          shared resilience index; detail lines stay operational, not technical. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          dataTour="tour-kpi-critical"
          label="Critical districts"
          animate
          value={bands.counts.critical}
          detail={`of ${districts.length} at baseline${scenario.demandMultiplier !== 1 ? ` · ×${scenario.demandMultiplier.toFixed(2)} demand scenario` : ''}`}
          tone={bands.counts.critical > 0 ? 'critical' : 'positive'}
          icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        <KpiCard
          label="Lines below reserve"
          animate
          value={kpis.shortLines.length}
          detail={kpis.shortLines.length > 0 ? shortestLineDetail(kpis.shortLines) : 'all lines hold 7-day reserve'}
          tone={kpis.shortLines.length > 0 ? 'critical' : 'positive'}
          icon={<PackageX className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        <KpiCard
          label="Projected stock-outs"
          animate
          value={kpis.stockOuts}
          detail="medicine lines reaching zero stock in 10d"
          tone={kpis.stockOuts > 0 ? 'warning' : 'positive'}
          icon={<Radio className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        <KpiCard
          label="Bed pressure"
          animate
          value={`${Math.round(kpis.bedUtilPct)}%`}
          detail="mean occupancy across facility layer"
          tone={kpis.bedUtilPct >= 85 ? 'critical' : kpis.bedUtilPct >= 75 ? 'warning' : 'neutral'}
          icon={<Users className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        <NetworkResilienceKpi />
      </div>

      {/* Resilience + state-scale strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ResiliencePanel />
        <StateSummaryPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Network map — shared with the Redistribution Engine */}
        <section data-tour="tour-map" className="rounded-lg border border-line bg-surface p-4 shadow-panel" aria-labelledby="map-heading">
          <div className="mb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 id="map-heading" className="text-sm font-bold text-ink">
                  Network risk + resource flow
                </h2>
                <p className="text-[11px] text-slate-450">
                  Real district boundaries (2011), not to scale · simulated network, demo data
                </p>
              </div>
              <span className="tabular text-[11px] font-semibold text-ink">
                {districts.length} active locations · {stateSummaryData.districtCount}-district network
              </span>
            </div>
          </div>
          <NetworkMap
            mode="overview"
            nodes={mapNodes}
            corridors={mapCorridors}
            onNodeClick={(id) => setSelectedId(id)}
            tooltipMultiplier={scenario.demandMultiplier}
          />
        </section>

        {/* HealthFlow Intelligence panel */}
        <section data-tour="tour-intel" className="rounded-lg border border-line bg-surface p-4 shadow-panel" aria-labelledby="intel-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="intel-heading" className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <span className="h-3.5 w-0.5 rounded bg-ai" aria-hidden="true" />
              HealthFlow Intelligence
            </h2>
            <span
              className="rounded bg-ai-wash dark:bg-ai/20 px-1.5 py-0.5 text-[10px] font-bold text-ai-dark dark:text-ai-light"
              title="Ranked by the deterministic composite risk engine — AI writes the explanations, not the scores."
            >
              RISK RANKED
            </span>
          </div>
          <ol role="list" className="space-y-3">
            {risks.slice(0, 3).map((r, i) => {
              const worst = worstLineFor(r.districtId, scenario.demandMultiplier);
              return (
                <li key={r.districtId} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {i + 1}. {r.districtName}
                      </p>
                      {worst && (
                        <p className="tabular mt-0.5 text-[11px] text-slate-450">
                          {medicineName(worst.record.medicineId)}: {daysOfCover(worst.record).toFixed(1)}d
                          cover · projected stock-out{' '}
                          <span className="font-semibold text-status-critical">
                            {stockOutDays(worst.record, scenario).toFixed(1)}d
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular text-lg font-extrabold leading-none text-ink">
                        {r.score}
                      </span>
                      <StatusBadge band={r.band} size="sm" />
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-ai-dark dark:text-ai-light">
                    {actionFor(r.band)}
                    {escalatedDistrictIds.has(r.districtId) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-status-watch/15 px-1.5 py-0.5 text-[9px] font-bold text-status-watch">
                        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> escalation required
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSelectedId(r.districtId)}
                      className="inline-flex items-center gap-1 rounded bg-chrome px-2 py-1 text-[11px] font-semibold text-white hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Eye className="h-3 w-3" aria-hidden="true" /> View
                    </button>
                    <button
                      onClick={() => navigate(`/simulator?district=${r.districtId}`)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <FlaskConical className="h-3 w-3" aria-hidden="true" /> Simulate
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `/redistribution?district=${r.districtId}${worst ? `&medicine=${worst.record.medicineId}` : ''}`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-accent-dark dark:text-accent-light ring-1 ring-inset ring-accent/40 hover:bg-accent-wash dark:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Act
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <DistrictDrawer
        district={selected}
        records={selectedRecords}
        multiplier={scenario.demandMultiplier}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function worstLineFor(districtId: string, multiplier: number) {
  let worst: { record: (typeof inventory)[number]; score: number } | null = null;
  const d = districts.find((x) => x.id === districtId)!;
  for (const record of inventory.filter((r) => r.districtId === districtId)) {
    // Reuse riskScore indirectly via cover proximity so this stays calc-driven.
    const so = stockOutDays(record, multiplier);
    const pressure = Math.max(0, 1 - Math.min(so, 14) / 14);
    if (!worst || pressure > worst.score) worst = { record, score: pressure };
  }
  return { district: d, record: worst!.record };
}

function shortestLineDetail(lines: InventoryRecord[]) {
  const parts = lines
    .slice(0, 2)
    .map((l) => `${districts.find((d) => d.id === l.districtId)?.shortName} ${medicineName(l.medicineId)}`);
  return `${parts.join(', ')}${lines.length > 2 ? ` +${lines.length - 2} more` : ''} below ${lines[0]?.reserveThresholdDays ?? 7}-day reserve`;
}

/** Prototype resilience index — transparent components, no official standard. */
/** Resilience as the fifth KPI — same computeResilienceIndex the panel uses. */
function NetworkResilienceKpi() {
  const { scenario } = useScenario();
  const { appliedStock } = useInterventions();
  const idx = useMemo(() => computeResilienceIndex(scenario, appliedStock), [scenario, appliedStock]);
  const tone: 'positive' | 'neutral' | 'warning' | 'critical' =
    idx.band === 'STRONG' || idx.band === 'GOOD' ? 'positive' : idx.band === 'MODERATE' ? 'warning' : 'critical';
  return (
    <KpiCard
      label="Network resilience"
      animate
      value={idx.score}
      unit="/100"
      detail={`${idx.band} · weakest: ${idx.weakest?.label ?? '—'}`}
      tone={tone}
    />
  );
}

function ResiliencePanel() {
  const { scenario } = useScenario();
  const { appliedStock } = useInterventions();
  const idx = useMemo(() => computeResilienceIndex(scenario, appliedStock), [scenario, appliedStock]);
  const bandTone =
    idx.band === 'STRONG' ? 'text-status-stable' : idx.band === 'GOOD' ? 'text-ink' : idx.band === 'MODERATE' ? 'text-status-watch' : 'text-status-critical';

  return (
    <section
      data-tour="resilience-index"
      className="rounded-lg border border-line bg-surface p-4 shadow-panel"
      aria-labelledby="resilience-heading"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="resilience-heading" className="text-sm font-bold text-ink">
            Network resilience
          </h2>
          <p className="text-[11px] text-slate-450">
        Weighted mean of the six subscores — weights shown per row; score = Σ(value × weight). Prototype
        assumptions, not a validated standard.
      </p>
        </div>
        <div className="text-right">
          <p className={`tabular text-2xl font-extrabold leading-none ${bandTone}`}>{idx.score}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{idx.band}</p>
        </div>
      </div>
      <ul role="list" className="mt-3 space-y-1.5">
        {idx.components.map((c) => (
          <li key={c.key} className="text-[11px]" title={`${c.label}: ${c.value}/100 × weight ${(c.weight * 100).toFixed(0)}% = ${(c.weighted).toFixed(1)} points — ${c.detail}`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-450">
                {c.label} <span className="text-faint">×{(c.weight * 100).toFixed(0)}%</span>
              </span>
              <span className="tabular font-semibold text-ink">{c.value}</span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-surface-2">
              <div
                className={`h-full rounded ${c.value >= 70 ? 'bg-status-stable' : c.value >= 45 ? 'bg-status-watch' : 'bg-status-critical'}`}
                style={{ width: `${Math.min(100, c.value)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {idx.weakest && (
        <p className="mt-2.5 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-slate-450">
          <span className="font-semibold text-ink">Weakest:</span> {idx.weakest.label} — {idx.weakest.detail}.
        </p>
      )}
    </section>
  );
}

/** State-scale summary — 23-district network, values from the dataset. */
function StateSummaryPanel() {
  const s = stateSummaryData;
  const { risks } = useScenario();
  const critical = risks.filter((r) => r.band === 'critical').length;
  const high = risks.filter((r) => r.band === 'high').length;
  return (
    <section
      className="rounded-lg border border-line bg-surface p-4 shadow-panel"
      aria-labelledby="state-heading"
    >
      <h2 id="state-heading" className="text-sm font-bold text-ink">
        West Bengal network — state view
      </h2>
      <p className="text-[11px] text-slate-450">
        Architecture supports state scale; the map highlights the {s.demoDistrictCount} active demo districts.
      </p>
      <p className="mt-1.5 rounded bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-slate-450">
        Two modeling tiers: the <span className="font-semibold text-ink">{s.demoDistrictCount} fully modeled
        districts</span> carry inventory, facilities and PHC drill-down; the remaining{' '}
        {s.districtCount - s.demoDistrictCount} network districts are a coarse synthetic overlay (population and
        facility counts only, no inventory lines) — so facility totals do not imply uniform PHC density across
        the state view.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {[
          { label: 'Districts in network', value: String(s.districtCount) },
          { label: 'PHCs (synthetic layer)', value: s.phcCount.toLocaleString() },
          { label: 'Hospitals', value: String(s.hospitals) },
          { label: 'Monitored lines', value: String(s.monitoredLines) },
          { label: 'Critical districts', value: String(critical), tone: 'critical' },
          { label: 'High districts', value: String(high), tone: 'warning' },
        ].map((k) => (
          <div key={k.label} className="rounded border border-line px-2.5 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">{k.label}</dt>
            <dd
              className={`tabular mt-0.5 text-sm font-bold ${
                k.tone === 'critical' ? 'text-status-critical' : k.tone === 'warning' ? 'text-status-watch' : 'text-ink'
              }`}
            >
              {k.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
