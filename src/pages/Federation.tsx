import { useState } from 'react';
import { ArrowDown, Globe, Network, RefreshCw } from 'lucide-react';
import { DefTerm } from '../components/MetricGlossary';
import { stateSummary } from '../data/phc';
import { computeResilienceIndex } from '../utils/resilience';
import { useScenario } from '../state/ScenarioContext';
import { hashString } from '../utils/seed';

/**
 * Federated architecture prototype — synthetic conceptual values, clearly labeled.
 * Networks B-E are deliberately ANONYMOUS: every number attached to them is a
 * synthetic illustration of the pattern, not a measurement of any real system.
 */
const NETWORKS = [
  { id: 'demo', name: 'Network A', region: 'West Bengal PHC network — this demo, fully modeled', accent: true },
  { id: 'network-b', name: 'Network B', region: 'Illustrative - municipal health units (synthetic)', accent: false },
  { id: 'network-c', name: 'Network C', region: 'Illustrative - regional polyclinics (synthetic)', accent: false },
  { id: 'network-d', name: 'Network D', region: 'Illustrative - community health centers (synthetic)', accent: false },
  { id: 'network-e', name: 'Network E', region: 'Illustrative - district clinics (synthetic)', accent: false },
] as const;

type NetworkId = (typeof NETWORKS)[number]['id'];

/** Deterministic conceptual per-network values — seeded, reload-stable. */
function networkProfile(id: NetworkId) {
  const h = hashString(`fed:${id}`);
  const facilities = 40 + (h % 260);
  const risk = 22 + (h % 55);
  return { facilities, risk };
}

const FLOW_STAGES = [
  { key: 'local-data', label: 'Local data', note: 'operational data stays at the source' },
  { key: 'local-model', label: 'Local model', note: 'prototype forecast trained locally' },
  { key: 'update', label: 'Model update', note: 'weights/parameters only — not raw data' },
  { key: 'aggregate', label: 'Federated aggregation', note: 'updates combined into a shared representation' },
  { key: 'shared', label: 'Shared model', note: 'every network benefits from the pooled learning' },
] as const;

export default function Federation() {
  const { scenario } = useScenario();
  const summary = stateSummary();
  const resilience = computeResilienceIndex(scenario);
  const [selected, setSelected] = useState<NetworkId>('demo');
  const [updatePhase, setUpdatePhase] = useState<0 | 1 | 2 | 3>(0); // 0 idle → 3 done

  const country = NETWORKS.find((c) => c.id === selected)!;
  const profile = networkProfile(selected);
  const isDemoNetwork = country.accent === true;

  function simulateUpdate() {
    setUpdatePhase(1);
    window.setTimeout(() => setUpdatePhase(2), 700);
    window.setTimeout(() => setUpdatePhase(3), 1400);
  }

  return (
    <div className="space-y-4" data-tour="tour-federation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Federated Health Intelligence</h1>
          <p className="text-xs text-slate-450">
            Architecture prototype — raw data stays local, model updates are shared. No live federated learning is claimed
            or performed.
          </p>
        </div>
        <span className="rounded bg-ai-wash dark:bg-ai/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ai-dark dark:text-ai-light">
          Federated architecture prototype
        </span>
      </div>

      {/* The flow */}
      <section className="rounded-lg border border-line bg-surface p-5 shadow-panel">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Network className="h-4 w-4 text-ai" aria-hidden="true" />
          How the federated layer works
        </h2>
        <ol role="list" className="mt-4 grid gap-2 sm:grid-cols-5">
          {FLOW_STAGES.map((s, i) => (
            <li
              key={s.key}
              className={`relative rounded-lg border p-3 transition-colors duration-300 ${
                updatePhase === 3
                  ? 'border-status-stable/50 bg-status-stable/5'
                  : updatePhase >= 1 && i <= updatePhase
                    ? 'border-ai/50 bg-ai-wash/50 dark:bg-ai/10'
                    : 'border-line'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Step {i + 1}</p>
              <p className="mt-0.5 text-xs font-bold text-ink">{s.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-450">{s.note}</p>
              {i < FLOW_STAGES.length - 1 && (
                <ArrowDown className="absolute -bottom-4 left-1/2 h-3 w-3 -translate-x-1/2 text-faint sm:hidden" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-450">
          HealthFlow's architecture is designed so participating health networks can retain local operational data while
          contributing model updates to a shared predictive layer. This demonstration simulates the update flow
          conceptually — it does not implement privacy guarantees, differential privacy, or secure aggregation.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Country selector */}
        <section className="rounded-lg border border-line bg-surface p-4 shadow-panel" aria-labelledby="countries-heading">
          <h2 id="countries-heading" className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
            Participating networks
          </h2>
          <ul role="list" className="mt-3 space-y-1.5">
            {NETWORKS.map((c) => {
              const p = networkProfile(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setSelected(c.id);
                      setUpdatePhase(0);
                    }}
                    aria-pressed={selected === c.id}
                    className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      selected === c.id ? 'border-accent/50 bg-accent-wash dark:bg-accent/20' : 'border-line hover:bg-surface-2'
                    }`}
                  >
                    <span>
                      <span className="text-xs font-bold text-ink">
                        {c.name}
                        {c.accent && (
                          <span className="ml-1.5 rounded bg-accent-wash px-1 py-0.5 text-[9px] font-bold uppercase text-accent-dark dark:bg-accent/20 dark:text-accent-light">
                            demo
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] text-slate-450">{c.region}</span>
                    </span>
                    <span className="tabular text-right">
                      <span className="block text-[10px] text-slate-450">local risk (0-100, higher = worse)</span>
                      <span className={`text-xs font-bold ${p.risk >= 55 ? 'text-status-critical' : p.risk >= 35 ? 'text-status-watch' : 'text-status-stable'}`}>
                        {p.risk}/100
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Selected country + simulated update */}
        <section className="rounded-lg border border-line bg-surface p-4 shadow-panel">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Network className="h-4 w-4 text-ai" aria-hidden="true" />
            {country.name} — local network
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded border border-line px-2.5 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Facilities</dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-ink">
                {profile.facilities}
                {!isDemoNetwork && <span className="text-[9px] font-medium text-faint"> (illustrative)</span>}
              </dd>
            </div>
            <div className="rounded border border-line px-2.5 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">
                <DefTerm term="Local risk (0–100, higher = worse)" align="right" />
              </dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-ink">{profile.risk}/100</dd>
            </div>
            <div className="rounded border border-line px-2.5 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">Modeled districts</dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-ink">
                {isDemoNetwork ? `${summary.demoDistrictCount} of ${summary.districtCount}` : '—'}
              </dd>
            </div>
            <div className="rounded border border-line px-2.5 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">
                <DefTerm term="Resilience index (0–100, higher = more resilient)" align="right" />
              </dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-ink">
                {isDemoNetwork ? `${resilience.score}/100` : 'n/a (illustrative)'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-450">
            Different scales: <DefTerm term="Local risk (0–100, higher = worse)" /> measures pressure inside one
            network; the <DefTerm term="Resilience index (0–100, higher = more resilient)" /> measures network
            health. Only Network A is computed from the live demo engine — all values for Networks B-E are
            synthetic illustrations.
          </p>

          <div className="mt-4">
            <button
              onClick={simulateUpdate}
              disabled={updatePhase === 1 || updatePhase === 2}
              className="inline-flex items-center gap-1.5 rounded bg-ai px-3.5 py-2 text-xs font-semibold text-white hover:bg-ai-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-dark"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Simulate federated update
            </button>
            {updatePhase > 0 && (
              <ol role="list" className="mt-3 space-y-1.5 text-[11px]">
                {[
                  { at: 1, label: 'Local model update generated from this network\u2019s forecast residuals' },
                  { at: 2, label: 'Update shared to the federated aggregation layer (parameters only)' },
                  { at: 3, label: 'Global model representation refreshed — shared insights available to all networks' },
                ].map((s) => (
                  <li
                    key={s.at}
                    className={`flex items-center gap-1.5 transition-opacity duration-300 ${
                      updatePhase >= s.at ? 'opacity-100' : 'opacity-30'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${updatePhase >= s.at ? 'bg-status-stable' : 'bg-line'}`}
                      aria-hidden="true"
                    />
                    <span className="text-ink">{s.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-slate-450">
            Networks B-E are anonymous, synthetic participants: every value shown for them is a conceptual
            illustration of the architecture pattern, not a measurement of any real health system. Only Network A
            (the West Bengal demo) is computed from the live engine. No cross-border data is exchanged by this
            prototype.
          </p>
          <div className="mt-2 rounded border border-ai/30 bg-ai-wash/50 px-3 py-2.5 text-[10px] leading-relaxed text-slate-450 dark:bg-ai/10">
            <p className="font-bold text-ink">How a second real network onboards</p>
            <p className="mt-0.5">
              Concretely: (1) map the partner&apos;s facility registry and stock feeds into the same shared inventory
              data model this demo uses; (2) point their district table at the shared
              <span className="font-semibold text-ink"> forecast + risk + allocation engine</span> (already
              scenario-driven, no code changes to the math); (3) exchange only model updates or aggregated demand
              signals — never patient-level or operationally sensitive records. The demo's anonymized networks
              stand in for step 3 today.
            </p>
          </div>
        </section>
      </div>

    </div>
  );
}
