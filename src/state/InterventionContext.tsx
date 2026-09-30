import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { InterventionPlan, InterventionStatus, PriorityScore } from '../types';
import { buildAllocationPlan, daysOfCover } from '../utils/calc';
import { districts, inventory } from '../data/districts';
import { useScenario } from './ScenarioContext';

/**
 * Intervention lifecycle + ONE network-state propagation channel.
 *
 * Completed (or in-transit) transfers adjust `appliedStock`, which every
 * consumer (resilience index, redistribution, risk views) folds into the
 * shared engine — so an intervention completed here updates the Command
 * Center, Simulator, and Policy Brief without any per-page patching.
 */

interface InterventionContextValue {
  plans: InterventionPlan[];
  recommendations: InterventionPlan[];
  /** districtId -> medicineId -> unit delta from landed interventions. */
  appliedStock: Record<string, Record<string, number>>;
  createPlan: (recommendation: InterventionPlan) => void;
  review: (id: string) => void;
  approve: (id: string) => void;
  reject: (id: string) => void;
  dispatch: (id: string) => void;
  complete: (id: string) => void;
  cancel: (id: string) => void;
  totalLandedDelta: (districtId: string, medicineId: string) => number;
}

const InterventionContext = createContext<InterventionContextValue | null>(null);

/** Simulated operational clock — starts 09:42, advances per transition. */
function simTime(offsetMin: number): string {
  const base = 9 * 60 + 42;
  const t = base + offsetMin;
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function InterventionProvider({ children }: { children: ReactNode }) {
  const { scenario } = useScenario();
  const [plans, setPlans] = useState<InterventionPlan[]>([]);
  const [clock, setClock] = useState(0);

  const applied = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const p of plans) {
      if (p.status !== 'COMPLETED' && p.status !== 'IN TRANSIT' && p.status !== 'DISPATCHED') continue;
      map[p.toDistrictId] = map[p.toDistrictId] ?? {};
      map[p.toDistrictId][p.medicineId] = (map[p.toDistrictId][p.medicineId] ?? 0) + p.quantity;
      // Each source district is debited exactly its own leg — the full plan
      // total is never drawn from a single district.
      if (p.legs?.length) {
        for (const leg of p.legs) {
          map[leg.fromDistrictId] = map[leg.fromDistrictId] ?? {};
          map[leg.fromDistrictId][p.medicineId] =
            (map[leg.fromDistrictId][p.medicineId] ?? 0) - leg.quantity;
        }
      } else {
        map[p.fromDistrictId] = map[p.fromDistrictId] ?? {};
        map[p.fromDistrictId][p.medicineId] = (map[p.fromDistrictId][p.medicineId] ?? 0) - p.quantity;
      }
    }
    return map;
  }, [plans]);

  const totalLandedDelta = useCallback(
    (districtId: string, medicineId: string) => applied[districtId]?.[medicineId] ?? 0,
    [applied],
  );

  // Live recommendations from the SAME allocation engine, priority-ranked.
  // SEQUENTIAL RESERVATION: each plan's legs debit a shared surplus ledger
  // before the next plan is built, so a unit of any district's surplus is
  // committed to at most ONE destination across the whole queue.
  const recommendations = useMemo(() => {
    const out: InterventionPlan[] = [];
    const adjust = (districtId: string, medicineId: string) =>
      inventory.find((r) => r.districtId === districtId && r.medicineId === medicineId)!.currentStock +
      (applied[districtId]?.[medicineId] ?? 0);
    const reserved = new Map<string, number>(); // "district:medicine" -> units already promised
    const avail = (districtId: string, medicineId: string) =>
      adjust(districtId, medicineId) - (reserved.get(`${districtId}:${medicineId}`) ?? 0);
    for (const target of districts) {
      for (const rec of inventory.filter((r) => r.districtId === target.id)) {
        const record = { ...rec, currentStock: adjust(target.id, rec.medicineId) };
        const sources = districts
          .filter((d) => d.id !== target.id)
          .map((d) => ({
            record: inventory.find(
              (r) => r.districtId === d.id && r.medicineId === rec.medicineId,
            ),
            district: d,
          }))
          .filter((x): x is { record: (typeof inventory)[number]; district: typeof target } =>
            Boolean(x.record),
          )
          .map((x) => ({
            record: { ...x.record, currentStock: avail(x.district.id, rec.medicineId) },
            district: x.district,
          }));
        const plan = buildAllocationPlan(record, target, sources, scenario);
        if (plan && plan.legs.length) {
          for (const leg of plan.legs) {
            const key = `${leg.fromDistrictId}:${plan.medicineId}`;
            reserved.set(key, (reserved.get(key) ?? 0) + leg.quantity);
          }
          const leg = plan.legs[0];
          // Multi-source plans become ONE intervention carrying every leg —
          // a unit of surplus is committed to exactly one destination.
          const urgency = Math.max(0, Math.min(100, 100 - (daysOfCover(record, scenario) / 14) * 100));
          const gapScore = Math.min(100, (plan.requiredUnits / Math.max(1, plan.targetUnits)) * 100);
          const speed = Math.max(0, 100 - leg.transitHours * 12);
          const factors = [
            { label: 'Destination urgency', value: Math.round(urgency), weighted: urgency * 0.5 },
            { label: 'Quantity gap', value: Math.round(gapScore), weighted: gapScore * 0.3 },
            { label: 'Transit speed', value: Math.round(speed), weighted: speed * 0.2 },
          ];
          const priority: PriorityScore = {
            score: Math.round(factors.reduce((s, f) => s + f.weighted, 0)),
            factors,
          };
          out.push({
            id: `HF-${2041 + out.length}`,
            medicineId: plan.medicineId,
            fromDistrictId: leg.fromDistrictId,
            toDistrictId: plan.toDistrictId,
            // Full plan quantity — every leg lands, or the plan is incomplete.
            quantity: plan.transferredUnits,
            transitHours: leg.transitHours,
            coverBeforeDays: plan.daysOfCoverBefore,
            // Plan-wide outcome, arithmetically true for the FULL quantity.
            coverAfterDays: plan.daysOfCoverAfter,
            legs: plan.legs,
            status: 'RECOMMENDED',
            audit: [],
            priority,
            reason: plan.reason,
            coldChain: plan.medicineId === 'insulin',
            gapUnits: plan.remainingGapUnits,
            insufficient: plan.remainingGapUnits > 0 && plan.daysOfCoverAfter < rec.reserveThresholdDays,
          });
        }
        if (out.length >= 6) break;
      }
      if (out.length >= 6) break;
    }
    return out.sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0));
  }, [scenario, applied]);

  const transition = useCallback(
    (id: string, next: InterventionStatus, by: string) => {
      setPlans((ps) =>
        ps.map((p) =>
          p.id === id
            ? { ...p, status: next, audit: [...p.audit, { status: next, at: simTime(clock), by }] }
            : p,
        ),
      );
      setClock((c) => c + 2);
    },
    [clock],
  );

  const createPlan = useCallback(
    (rec: InterventionPlan) => {
      const id = `HF-${2041 + plans.length}`;
      setPlans((p) => [
        { ...rec, id, status: 'RECOMMENDED', audit: [{ status: 'RECOMMENDED', at: simTime(clock), by: 'Allocation engine' }] },
        ...p,
      ]);
      setClock((c) => c + 2);
    },
    [plans.length, clock],
  );

  const value = useMemo<InterventionContextValue>(
    () => ({
      plans,
      recommendations,
      appliedStock: applied,
      createPlan,
      review: (id) => transition(id, 'UNDER REVIEW', 'Health Network Operations'),
      approve: (id) => transition(id, 'APPROVED', 'Health Network Operations'),
      reject: (id) => transition(id, 'REJECTED', 'Health Network Operations'),
      dispatch: (id) => transition(id, 'IN TRANSIT', 'Prototype logistics simulation'),
      complete: (id) => transition(id, 'COMPLETED', 'Prototype logistics simulation'),
      cancel: (id) => transition(id, 'CANCELLED', 'Health Network Operations'),
      totalLandedDelta,
    }),
    [plans, recommendations, applied, createPlan, transition, totalLandedDelta],
  );

  return <InterventionContext.Provider value={value}>{children}</InterventionContext.Provider>;
}

export function useInterventions(): InterventionContextValue {
  const ctx = useContext(InterventionContext);
  if (!ctx) throw new Error('useInterventions must be used inside <InterventionProvider>');
  return ctx;
}
