import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  CircleDot,
  Clock,
  Eye,
  PackageCheck,
  ShieldCheck,
  Snowflake,
  Truck,
  X,
} from 'lucide-react';
import type { InterventionPlan, InterventionStatus } from '../types';
import { districts, inventory } from '../data/districts';
import { daysOfCover } from '../utils/calc';
import { useInterventions } from '../state/InterventionContext';
import { useScenario } from '../state/ScenarioContext';
import { medicineNameOf } from '../components/medicineName';

const STATUS_STYLES: Record<InterventionStatus, string> = {
  RECOMMENDED: 'bg-ai-wash dark:bg-ai/20 text-ai-dark dark:text-ai-light',
  'UNDER REVIEW': 'bg-surface-2 text-slate-450',
  APPROVED: 'bg-status-watch/15 text-status-watch',
  DISPATCHED: 'bg-accent-wash dark:bg-accent/20 text-accent-dark dark:text-accent-light',
  'IN TRANSIT': 'bg-accent-wash dark:bg-accent/20 text-accent-dark dark:text-accent-light',
  COMPLETED: 'bg-status-stable/15 text-status-stable',
  REJECTED: 'bg-status-critical/10 text-status-critical',
  CANCELLED: 'bg-surface-2 text-muted',
};

const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'IN TRANSIT', 'COMPLETED', 'CLOSED'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(p: InterventionPlan, f: Filter): boolean {
  switch (f) {
    case 'ALL': return true;
    case 'PENDING': return p.status === 'RECOMMENDED' || p.status === 'UNDER REVIEW';
    case 'APPROVED': return p.status === 'APPROVED' || p.status === 'DISPATCHED';
    case 'IN TRANSIT': return p.status === 'IN TRANSIT';
    case 'COMPLETED': return p.status === 'COMPLETED';
    case 'CLOSED': return p.status === 'CANCELLED' || p.status === 'REJECTED';
  }
}

export default function ActionCenter() {
  const { scenario } = useScenario();
  const { plans, recommendations, createPlan, review, approve, dispatch, complete, cancel } =
    useInterventions();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [reviewing, setReviewing] = useState<InterventionPlan | null>(null);

  const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? id;
  const isActive = (p: InterventionPlan) =>
    p.status !== 'COMPLETED' && p.status !== 'CANCELLED' && p.status !== 'REJECTED';

  const filtered = useMemo(() => plans.filter((p) => matchesFilter(p, filter)), [plans, filter]);
  const counts = useMemo(
    () => ({
      pending: plans.filter((p) => p.status === 'RECOMMENDED' || p.status === 'UNDER REVIEW').length,
      approved: plans.filter((p) => p.status === 'APPROVED' || p.status === 'DISPATCHED').length,
      transit: plans.filter((p) => p.status === 'IN TRANSIT').length,
      completed: plans.filter((p) => p.status === 'COMPLETED').length,
    }),
    [plans],
  );

  return (
    <div className="space-y-4" data-tour="tour-action-queue">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Action Center</h1>
          <p className="text-xs text-slate-450">
            Recommendation → review → approval → dispatch → completion. Simulated operational timeline — no external
            system is contacted.
          </p>
        </div>
      </div>

      {/* Queue summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Pending review', value: counts.pending, tone: 'text-ai-dark dark:text-ai-light' },
          { label: 'Approved', value: counts.approved, tone: 'text-status-watch' },
          { label: 'In transit', value: counts.transit, tone: 'text-accent-dark dark:text-accent-light' },
          { label: 'Completed', value: counts.completed, tone: 'text-status-stable' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface px-3 py-2 shadow-panel">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">{k.label}</p>
            <p className={`tabular text-lg font-extrabold ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Pending recommendations (from the shared allocation engine) */}
      <section className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-bold text-ink">Pending recommendations</h2>
        <p className="mt-0.5 text-[11px] text-slate-450">
          Priority score = 50% destination urgency + 30% quantity gap + 20% transit speed — calculated factors, not an AI
          judgment.
        </p>
        {recommendations.length === 0 ? (
          <p className="mt-3 rounded border border-dashed border-line p-4 text-center text-xs text-slate-450">
            No intervention recommended — every tracked line holds its reserve, or no eligible source can help without
            breaching its own.
          </p>
        ) : (
          <ul role="list" className="mt-3 space-y-2">
            {recommendations.map((r) => {
              const alreadyActive = plans.some(
                (p) =>
                  p.medicineId === r.medicineId &&
                  p.toDistrictId === r.toDistrictId &&
                  isActive(p),
              );
              return (
                <li
                  key={`${r.toDistrictId}-${r.medicineId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-ai" aria-hidden="true" />
                      {r.quantity.toLocaleString()} {medicineNameOf(r.medicineId)} ·{' '}
                      {districtName(r.fromDistrictId)} → {districtName(r.toDistrictId)}
                      {r.coldChain && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-450"
                          title="Prototype cold-chain risk assessment — temperature-sensitive line"
                        >
                          <Snowflake className="h-2.5 w-2.5" aria-hidden="true" /> cold chain
                        </span>
                      )}
                    </p>
                    <p className="tabular mt-0.5 text-[11px] text-slate-450">
                      cover {r.coverBeforeDays.toFixed(1)}d → {r.coverAfterDays.toFixed(1)}d · {r.transitHours}h transit
                      (prototype estimate)
                    </p>
                    {r.legs && r.legs.length > 1 && (
                      <p className="tabular mt-0.5 text-[11px] text-slate-450">
                        {r.legs.length} sources combined:{' '}
                        {r.legs
                          .map(
                            (leg) =>
                              `${leg.quantity.toLocaleString()} u from ${districtName(leg.fromDistrictId)} (cover after this leg: ${leg.destinationCoverAfter.toFixed(1)}d)`,
                          )
                          .join(' + ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="tabular rounded bg-surface-2 px-2 py-1 text-[10px] font-bold text-ink"
                      title={r.priority?.factors.map((f) => `${f.label}: ${f.value}`).join(' · ')}
                    >
                      PRIORITY {r.priority?.score ?? '—'}
                    </span>
                    <button
                      onClick={() => setReviewing(r)}
                      className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Eye className="h-3 w-3" aria-hidden="true" /> Review plan
                    </button>
                    <button
                      onClick={() => createPlan(r)}
                      disabled={alreadyActive}
                      className="rounded bg-ai px-3 py-1.5 text-xs font-semibold text-white hover:bg-ai-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-dark"
                    >
                      {alreadyActive ? 'Plan active' : 'Create plan'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Plans + filters */}
      <section className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Intervention plans</h2>
          <div role="group" aria-label="Filter plans" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  filter === f ? 'bg-chrome text-white' : 'bg-surface-2 text-slate-450 hover:text-ink'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="mt-3 rounded border border-dashed border-line p-4 text-center text-xs text-slate-450">
            {plans.length === 0
              ? 'No plan created yet — review a recommendation above, then create the plan to move it through the lifecycle.'
              : 'No plans match this filter.'}
          </p>
        ) : (
          <ul role="list" className="mt-3 space-y-3">
            {filtered.map((p) => (
              <li key={p.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                      {p.id}
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLES[p.status]}`}>
                        {p.status}
                      </span>
                      {p.coldChain && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-450">
                          <Snowflake className="h-2.5 w-2.5" aria-hidden="true" /> cold chain
                        </span>
                      )}
                      {p.insufficient && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-status-watch/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-watch">
                          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> insufficient — escalate
                        </span>
                      )}
                      {p.priority && (
                        <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-slate-450">
                          PRIORITY {p.priority.score}
                        </span>
                      )}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-slate-450">
                      {p.quantity.toLocaleString()} {medicineNameOf(p.medicineId)} · {districtName(p.fromDistrictId)} →{' '}
                      {districtName(p.toDistrictId)} · est. transit {p.transitHours}h · cover{' '}
                      {p.coverBeforeDays.toFixed(1)}d → {p.coverAfterDays.toFixed(1)}d
                    </p>
                    {p.insufficient && p.gapUnits !== undefined && p.gapUnits > 0 && (
                      <p className="mt-0.5 text-[11px] font-semibold text-status-watch">
                        Leaves {p.gapUnits.toLocaleString()} u below reserve — escalate to procurement.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.status === 'RECOMMENDED' && (
                      <button
                        onClick={() => review(p.id)}
                        className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" /> Mark reviewed
                      </button>
                    )}
                    {(p.status === 'RECOMMENDED' || p.status === 'UNDER REVIEW') && (
                      <button
                        onClick={() => approve(p.id)}
                        className="inline-flex items-center gap-1 rounded bg-chrome px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Approve
                      </button>
                    )}
                    {p.status === 'APPROVED' && (
                      <button
                        onClick={() => dispatch(p.id)}
                        className="inline-flex items-center gap-1 rounded bg-chrome px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Truck className="h-3 w-3" aria-hidden="true" /> Simulate dispatch
                      </button>
                    )}
                    {p.status === 'IN TRANSIT' && (
                      <button
                        onClick={() => complete(p.id)}
                        className="inline-flex items-center gap-1 rounded bg-status-stable px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-status-stable/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <PackageCheck className="h-3 w-3" aria-hidden="true" /> Record completion
                      </button>
                    )}
                    {(p.status === 'RECOMMENDED' || p.status === 'UNDER REVIEW' || p.status === 'APPROVED') && (
                      <button
                        onClick={() => cancel(p.id)}
                        className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-semibold text-slate-450 ring-1 ring-inset ring-line hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <X className="h-3 w-3" aria-hidden="true" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
                {/* Audit trail — simulated operational timeline */}
                <ol
                  role="list"
                  className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2 text-[10px] font-semibold text-slate-450"
                >
                  {p.audit.map((a, i) => (
                    <li key={i} className="flex items-center gap-1" title={a.by}>
                      {i > 0 && <CircleDot className="h-2.5 w-2.5 text-faint" aria-hidden="true" />}
                      <span className="uppercase tracking-wider">{a.status}</span>
                      <span className="tabular inline-flex items-center gap-0.5 text-faint">
                        <Clock className="h-2.5 w-2.5" aria-hidden="true" /> {a.at}
                      </span>
                    </li>
                  ))}
                  <li className="ml-auto text-faint">Simulated operational timeline</li>
                </ol>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Review modal */}
      {reviewing && (
        <ReviewModal plan={reviewing} onClose={() => setReviewing(null)} />
      )}

      <p className="text-[11px] leading-relaxed text-slate-450">
        Plans are prototype records — no external dispatch, procurement, or government system is contacted. Allocation
        reasoning lives in the{' '}
        <Link to="/redistribution" className="font-semibold text-accent hover:underline">
          Redistribution Engine
        </Link>
        ; scenario context: demand ×{scenario.demandMultiplier.toFixed(2)} · transit ×
        {scenario.transitDelayFactor.toFixed(2)}.
      </p>
    </div>
  );
}

/** Professional review modal — the trust moment before approval. */
function ReviewModal({ plan, onClose }: { plan: InterventionPlan; onClose: () => void }) {
  const { createPlan, appliedStock } = useInterventions();
  const { scenario } = useScenario();
  const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? id;
  const sourceRec = inventory.find(
    (r) => r.districtId === plan.fromDistrictId && r.medicineId === plan.medicineId,
  );
  const sourceDelta = appliedStock[plan.fromDistrictId]?.[plan.medicineId] ?? 0;
  const sourceCoverNow = sourceRec ? daysOfCover({ ...sourceRec, currentStock: sourceRec.currentStock + sourceDelta }, scenario) : null;
  const sourceCoverAfter = sourceRec ? daysOfCover({ ...sourceRec, currentStock: sourceRec.currentStock + sourceDelta - plan.quantity }, scenario) : null;
  const sourceSafe = sourceCoverAfter !== null && sourceCoverAfter >= (sourceRec?.reserveThresholdDays ?? 7);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-chrome-dark/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Review plan ${plan.id}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-ink">
              <ShieldCheck className="h-4 w-4 text-ai" aria-hidden="true" />
              Review plan {plan.id}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-450">
              {plan.quantity.toLocaleString()} {medicineNameOf(plan.medicineId)} ·{' '}
              {districtName(plan.fromDistrictId)} → {districtName(plan.toDistrictId)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review"
            className="rounded p-1 text-slate-450 hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-450">Problem</dt>
            <dd className="mt-1 leading-relaxed text-ink">{plan.reason ?? 'Destination below reserve target.'}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-line p-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Source coverage</dt>
              <dd className="tabular mt-1 font-semibold text-ink">
                {sourceCoverNow?.toFixed(1)}d → {sourceCoverAfter?.toFixed(1)}d
              </dd>
              <dd className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider ${sourceSafe ? 'text-status-stable' : 'text-status-critical'}`}>
                {sourceSafe ? 'SAFE — reserve held' : 'INELIGIBLE SOURCE'}
              </dd>
            </div>
            <div className="rounded border border-line p-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Destination coverage</dt>
              <dd className="tabular mt-1 font-semibold text-ink">
                {plan.coverBeforeDays.toFixed(1)}d → {plan.coverAfterDays.toFixed(1)}d
              </dd>
              <dd className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-status-stable">
                {plan.legs && plan.legs.length > 1
                  ? `${plan.legs.length} LEGS · FULL PLAN ${plan.quantity.toLocaleString()} U`
                  : 'RESERVE RESTORED'}
              </dd>
            </div>
            {plan.legs && plan.legs.length > 1 && (
              <div className="col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Allocation legs</dt>
                <dd className="tabular mt-1 space-y-0.5 text-ink">
                  {plan.legs.map((leg) => (
                    <p key={leg.fromDistrictId}>
                      {leg.quantity.toLocaleString()} u from {districtName(leg.fromDistrictId)} ({leg.transitHours}h) —
                      destination cover after this leg: {leg.destinationCoverAfter.toFixed(1)}d
                    </p>
                  ))}
                </dd>
              </div>
            )}
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-450">Risk if no action</dt>
            <dd className="mt-1 leading-relaxed text-ink">
              Destination projected stock-out within {plan.coverBeforeDays.toFixed(1)} days at the current scenario —
              below the 7-day prototype reserve target.
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-450">Transit estimate</dt>
            <dd className="tabular mt-1 text-ink">
              {plan.transitHours}h — prototype transit estimate, not routing data
              {plan.coldChain && ' · cold-chain line: temperature-sensitive, prototype risk assessment applies'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-slate-450">Alternative sources</dt>
            <dd className="mt-1 text-ink">
              Other eligible sources are listed with measurable rankings in the{' '}
              <Link to="/redistribution" onClick={onClose} className="font-semibold text-accent hover:underline">
                Redistribution Engine
              </Link>
              .
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-2 text-xs font-semibold text-slate-450 ring-1 ring-inset ring-line hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Close
          </button>
          <button
            onClick={() => {
              createPlan(plan);
              onClose();
            }}
            disabled={sourceSafe === false}
            className="rounded bg-ai px-3.5 py-2 text-xs font-semibold text-white hover:bg-ai-dark disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai-dark"
          >
            Approve as plan
          </button>
        </div>
      </div>
    </div>
  );
}
