import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, Square } from 'lucide-react';
import { useScenario } from '../state/ScenarioContext';
import { useTourActions } from '../state/tourActions';
import { useInterventions } from '../state/InterventionContext';
import { computeResilienceIndex } from '../utils/resilience';
import { districts, inventory, medicines, simulatorPresets } from '../data/districts';
import {
  buildTransferRecommendation,
  computeAllRisks,
  stockOutDays,
  transitHoursBetween,
} from '../utils/calc';
import { TourProvider, useTour } from './tour/TourContext';
import { TourIntroModal } from './tour/TourIntroModal';
import { TourSpotlight } from './tour/TourSpotlight';
import { TourCompleteModal } from './tour/TourCompleteModal';

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;

/**
 * Section 11.2 guided tour. Copy is a TEMPLATE: every number is interpolated
 * from the same live scenario state the screens show — never hardcoded.
 */
function tourUrgentLine(multiplier: number) {
  const lines = inventory.map((r) => ({
    record: r,
    district: districts.find((d) => d.id === r.districtId)!,
    so: stockOutDays(r, multiplier),
  }));
  return [...lines].sort((a, b) => a.so - b.so)[0];
}

/** Pure calc call — the same buildTransferRecommendation the page uses. */
function nadiaOrsRecommendation(multiplier: number) {
  const shortage = inventory.find((r) => r.districtId === 'nadia' && r.medicineId === 'ors')!;
  const shortageDistrict = districts.find((d) => d.id === 'nadia')!;
  const sources = districts
    .filter((d) => d.id !== 'nadia')
    .map((d) => {
      const record = inventory.find((r) => r.districtId === d.id && r.medicineId === 'ors');
      const t = record ? transitHoursBetween('nadia', d.id) : null;
      return record && t !== null ? { record, transitHours: t } : null;
    })
    .filter(Boolean) as { record: (typeof inventory)[number]; transitHours: number }[];
  return buildTransferRecommendation(shortage, shortageDistrict, sources, multiplier);
}

function countCriticalAt(multiplier: number): number {
  // Same calc engine — no separate counting path.
  return computeAllRisks(districts, inventory, multiplier).filter(
    (r) => r.band === 'critical',
  ).length;
}

interface MomentDef {
  id: string;
  title: string;
  body: string;
}

interface TourDataCtx {
  multiplier: number;
  transitFactor: number;
  critical: { id: string; name: string; score: number };
  baselineCritical: number;
  scenarioCritical: number;
  urgentLine: { district: string; medicine: string; so: number };
  rec: ReturnType<typeof nadiaOrsRecommendation>;
  /** Current network resilience score (same index the UI panels show). */
  resilience: number;
  /** Resilience score before vs after the recommended redistribution. */
  resBefore: number;
  resAfter: number;
}

interface StageActions {
  navigate: (path: string) => void;
  scenario: ReturnType<typeof useScenario>;
  tour: ReturnType<typeof useTourActions>;
  selectDistrict: (id: string | null) => void;
  simulateTransfer: () => void;
  autoGenerateBrief: () => void;
}

interface StageDef {
  title: string;
  path: string;
  moments: (ctx: TourDataCtx) => MomentDef[];
  onStageEnter?: (actions: StageActions) => void;
  /** Runs when Next leaves the LAST moment of this stage (the stage action). */
  onStageExit?: (actions: StageActions) => void;
  /** Optional extra moment shown AFTER the action runs — the visible result. */
  resultMoment?: (ctx: TourDataCtx) => MomentDef;
}

const STAGES: StageDef[] = [
  {
    title: 'DETECT RISK',
    path: '/command-center',
    // No onStageEnter needed — navigating to the path itself clears the
    // ?district= param, which the Command Center's param-sync mirrors.
    moments: ({ critical, baselineCritical, multiplier, resilience }: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-kpi-critical',
        title: 'Critical districts',
        body: `${critical.name} is currently the highest-risk district, at ${critical.score}. ${baselineCritical} district${baselineCritical === 1 ? '' : 's'} sit${baselineCritical === 1 ? 's' : ''} in the critical band${multiplier !== 1 ? ` under the ×${multiplier.toFixed(2)} scenario` : ' at baseline'} — network resilience ${resilience}/100.`,
      },
      {
        id: 'tour-map',
        title: 'The network at a glance',
        body: 'Every node is a district colored by its computed composite risk — the halo pulses on whichever district is critical right now, and corridors show where resources can flow.',
      },
      {
        id: 'tour-map-node-nadia',
        title: `${critical.name} — the hot spot`,
        body: `Clicking any node opens its intelligence. ${critical.name} is flagged CRITICAL, so it carries the slow pulse.`,
      },
      {
        id: 'tour-intel',
        title: 'HealthFlow Intelligence',
        body: 'Top-risk districts are ranked here with MONITOR / INVESTIGATE / SIMULATE / ACT actions mapped from each band.',
      },
    ],
  },
  {
    title: 'UNDERSTAND WHY',
    // The path itself carries ?district=nadia — the Command Center's
    // param-sync effect opens the drawer. A second navigate() here raced the
    // router (double push of the identical URL in one tick) and left the
    // drawer unopened.
    path: '/command-center?district=nadia',
    moments: (ctx: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-urgent-line',
        title: 'The urgent line, in plain numbers',
        body: `${ctx.urgentLine.medicine} stock-out projected in ${ctx.urgentLine.so} days in ${ctx.urgentLine.district}. This sentence is generated from the same data the screen shows — never a script.`,
      },
      {
        id: 'tour-factor-bars',
        title: 'Why the score says CRITICAL',
        body: 'Six weighted factors — inventory cover, demand acceleration, stock-out proximity, beds, workforce, logistics. The score is not a black box; every bar is a visible input.',
      },
      {
        id: 'phc-drilldown',
        title: 'Down to the facility',
        body: `District risk is not asserted — it aggregates from a seeded synthetic PHC network. Expand the facility signals to see which PHCs in ${ctx.urgentLine.district} drive the alert.`,
      },
    ],
  },
  {
    title: 'PREDICT DEMAND',
    path: '/demand',
    // No onStageEnter needed — the page opens on its most urgent line.
    moments: (ctx: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-forecast-chart',
        title: 'Seven weeks of history, thirty days ahead',
        body: `The forecast is not a static number: ${ctx.urgentLine.medicine} demand in ${ctx.urgentLine.district} is projected from recent trend and weekly pattern, with an 80% interval showing where demand realistically lands.`,
      },
      {
        id: 'tour-forecast-insight',
        title: 'The depletion path, not just the demand',
        body: `Demand meets inventory on the same chart — projected stock crosses the reserve threshold in ${ctx.urgentLine.so} days. That crossing point is what drives the alert, not a threshold rule.`,
      },
    ],
  },
  {
    title: 'OPTIMIZE REDISTRIBUTION',
    path: '/redistribution?district=nadia&medicine=ors',
    onStageEnter: ({ tour }) => tour?.setTourTransferSimulated(false),
    moments: (ctx: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-shortage',
        title: 'Shortage district',
        body: `Nadia / ORS is short of its 7-day reserve — ${ctx.urgentLine.so} days to stock-out at current demand.`,
      },
      {
        id: 'tour-sources',
        title: 'Ranked surplus sources',
        body: 'Surplus districts are ranked by transit time, then by how much they can spare while keeping their own 7-day reserve.',
      },
      {
        id: 'tour-recommendation',
        title: 'The recommendation',
        body: ctx.rec
          ? ctx.rec.legs.length > 1
            ? `${ctx.rec.legs.length} sources combined: ${ctx.rec.legs
                .map(
                  (leg) =>
                    `${leg.quantity.toLocaleString()} units from ${
                      districts.find((d) => d.id === leg.fromDistrictId)?.name ?? leg.fromDistrictId
                    }`,
                )
                .join(' + ')} — cover moves from ${ctx.rec.daysOfCoverBefore.toFixed(1)}d to ${ctx.rec.fullPlanCoverAfter.toFixed(1)}d when every leg lands.`
            : `Move ${ctx.rec.quantity.toLocaleString()} units from ${
                districts.find((d) => d.id === ctx.rec!.fromDistrictId)?.name ?? ctx.rec.fromDistrictId
              } — about ${ctx.rec.transitHours}h transit — restoring cover from ${ctx.rec.daysOfCoverBefore.toFixed(1)}d to ${ctx.rec.daysOfCoverAfter.toFixed(1)}d.`
          : 'No corridor-linked source can fill this line right now.',
      },
      {
        id: 'tour-map-transfer',
        title: 'The route on the network',
        body: 'The same fixed node positions as the Command Center — now with the recommended transfer painted on its corridor.',
      },
    ],
    onStageExit: ({ simulateTransfer }) => simulateTransfer(),
    resultMoment: (ctx: TourDataCtx): MomentDef => {
      const delta = ctx.resAfter - ctx.resBefore;
      const deltaText = `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'}`;
      return {
        // Targets the in-page "Transfer applied" result — the card mounts on
        // /redistribution only AFTER the stage action lands the transfer, so
        // the spotlight highlights the real outcome, not a foreign element.
        id: 'tour-transfer-result',
        title: 'Transfer applied — the network adapts',
        body: ctx.rec
          ? `Cover restored from ${ctx.rec.daysOfCoverBefore.toFixed(1)}d to ${ctx.rec.fullPlanCoverAfter.toFixed(1)}d — and network resilience moves ${ctx.resBefore} → ${ctx.resAfter} (${deltaText}). Recomputed by the same engine, not scripted.`
          : 'No transfer was possible for this line.',
      };
    },
  },
  {
    title: 'STRESS-TEST THE NETWORK',
    path: '/simulator',
    moments: (ctx: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-presets',
        title: 'Scenario presets',
        body: 'Prebuilt stress tests — demand surges, transit delays, or combined. Applying one feeds a multiplier into the same calc engine every other screen uses.',
      },
      {
        id: 'tour-impact',
        title: 'Simulated network impact',
        body: `Applying +30% demand moves critical districts from ${ctx.baselineCritical} to ${ctx.scenarioCritical} — recomputed by the same riskScore function against simulated demo data. No separate simulation math.`,
      },
    ],
    onStageExit: ({ scenario }) => {
      const preset = simulatorPresets.find((p) => p.id === 's30');
      if (preset) scenario.applyPreset(preset);
    },
    resultMoment: (ctx: TourDataCtx): MomentDef => ({
      id: 'tour-impact',
      title: '+30% demand applied — the network reacts',
      body: `Critical districts ${ctx.baselineCritical} → ${ctx.scenarioCritical} at +30% demand${
        ctx.scenarioCritical === ctx.baselineCritical
          ? ` — the count holds, so the stress shows up in the scores and shrinking stock-out windows instead (stock-out now ${ctx.urgentLine.so} days)`
          : ''
      } — one multiplier through the one shared calc engine, every screen re-colored instantly.`,
    }),
  },
  {
    title: 'ACT',
    path: '/action-center',
    moments: (): MomentDef[] => [
      {
        id: 'tour-action-queue',
        title: 'From recommendation to action',
        body: 'Predicting a shortage is not enough. Each allocation-engine recommendation becomes a tracked intervention — reviewed, approved, dispatched, and completed — with a simulated audit trail.',
      },
    ],
  },
  {
    title: 'GENERATE THE RESPONSE',
    path: '/policy',
    onStageEnter: ({ tour }) => tour?.setTourAutoGenerateBrief(false),
    moments: (ctx: TourDataCtx): MomentDef[] => [
      {
        id: 'tour-snapshot',
        title: 'Situation snapshot',
        body: `${ctx.scenarioCritical} critical district${ctx.scenarioCritical === 1 ? '' : 's'} under the scenario; ${ctx.urgentLine.district} ${ctx.urgentLine.medicine} is the most urgent line at ${ctx.urgentLine.so} days. The AI layer only writes prose from these numbers — it never computes them.`,
      },
      {
        id: 'tour-generate-brief',
        title: 'Generate the executive brief',
        body: 'One click assembles the operational response from the exact state on screen. If the AI service is unavailable, a deterministic fallback writes the same brief from the same numbers.',
      },
    ],
    onStageExit: ({ autoGenerateBrief }) => autoGenerateBrief(),
    // The FINAL moment targets the COMPLETE Executive Brief container
    // (policy-brief-full) — header, AI badge, actions, notice, and every
    // content block — so the judge sees the whole output as one artifact.
    resultMoment: (): MomentDef => ({
      id: 'policy-brief-full',
      title: 'The executive response is ready',
      body: 'HealthFlow converts the calculated network state into a concise operational brief covering affected districts, urgent resources, risk drivers, and recommended interventions.',
    }),
  },
  {
    title: 'SCALE BEYOND THE STATE',
    path: '/federation',
    moments: (): MomentDef[] => [
      {
        id: 'tour-federation',
        title: 'Federated architecture prototype',
        body: 'The same resilience pattern, scaled: partner health networks share model updates — never raw patient data. A simulated update shows the flow. Architecture prototype only; no live federated learning is claimed.',
      },
    ],
  },
];

function useStageActions(): StageActions {
  const navigate = useNavigate();
  const scenario = useScenario();
  const tour = useTourActions();
  const { plans, appliedStock, createPlan, review, approve, dispatch } = useInterventions();
  const selectDistrict = useCallback(
    (id: string | null) => {
      navigate(id ? `/command-center?district=${id}` : '/command-center');
    },
    [navigate],
  );
  // The tour's transfer must be REAL: it enters the same intervention pipeline
  // the Action Center manages, so appliedStock — and therefore the resilience
  // index every screen shows — genuinely moves. Idempotent: if the transfer is
  // already in the pipeline (repeat tour run), it does not duplicate.
  const simulateTransfer = useCallback(() => {
    tour?.setTourTransferSimulated(true);
    const rec = nadiaOrsRecommendation(scenario.scenario.demandMultiplier);
    if (!rec) return;
    // The tour lands the FULL plan (every leg), matching the Redistribution
    // Engine's "Transfer applied" — surplus is committed once, consistently.
    const alreadyLanded =
      (appliedStock[rec.toDistrictId]?.[rec.medicineId] ?? 0) >= rec.fullPlanQuantity;
    if (alreadyLanded) return;
    const id = `HF-${2041 + plans.length}`;
    createPlan({
      id,
      medicineId: rec.medicineId,
      fromDistrictId: rec.fromDistrictId,
      toDistrictId: rec.toDistrictId,
      quantity: rec.fullPlanQuantity,
      transitHours: rec.transitHours,
      coverBeforeDays: rec.daysOfCoverBefore,
      coverAfterDays: rec.fullPlanCoverAfter,
      legs: rec.legs,
      status: 'RECOMMENDED',
      audit: [],
      coldChain: rec.medicineId === 'insulin',
      gapUnits: rec.fullPlanGapUnits,
      insufficient: rec.fullPlanGapUnits > 0 && rec.fullPlanCoverAfter < 7,
    });
    review(id);
    approve(id);
    dispatch(id);
  }, [tour, scenario.scenario.demandMultiplier, appliedStock, plans.length, createPlan, review, approve, dispatch]);
  const autoGenerateBrief = useCallback(() => {
    tour?.setTourAutoGenerateBrief(true);
  }, [tour]);
  return useMemo(
    () => ({ navigate, scenario, tour, selectDistrict, simulateTransfer, autoGenerateBrief }),
    [navigate, scenario, tour, selectDistrict, simulateTransfer, autoGenerateBrief],
  );
}

function TourRunner({ onExit }: { onExit: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { phase, stageIndex, momentIndex, goToStage, nextMoment, prevMoment, exitTour, completeTour } =
    useTour();
  const scenario = useScenario();
  const { appliedStock } = useInterventions();
  const actions = useStageActions();

  // Route the user started from — Escape/Skip returns here, never a full reset.
  const startPath = useRef(location.pathname + location.search);

  // Navigation effect: whenever the stage changes, go to its route once.
  const lastNavRef = useRef<string>('');
  useEffect(() => {
    const target = STAGES[stageIndex].path;
    if (lastNavRef.current !== target) {
      lastNavRef.current = target;
      navigate(target);
    }
  }, [stageIndex, navigate]);

  // Stage-entry side effects fire AFTER the navigation commits (location
  // matches the stage path) — not in the same tick as navigate(), which
  // previously raced the router and left page state (e.g. the drawer) unset.
  const lastEnterRef = useRef<number | null>(null);
  useEffect(() => {
    const stage = STAGES[stageIndex];
    const stagePath = stage.path.split('?')[0];
    if (location.pathname === stagePath && lastEnterRef.current !== stageIndex) {
      lastEnterRef.current = stageIndex;
      stage.onStageEnter?.(actions);
    }
  }, [location.pathname, stageIndex, actions]);

  const ctx: TourDataCtx = useMemo(() => {
    const worst = tourUrgentLine(scenario.scenario.demandMultiplier);
    const criticalRisk = scenario.risks.find((r) => r.band === 'critical') ?? scenario.risks[0];
    const s30 = simulatorPresets.find((p) => p.id === 's30')!;
    const base = {
      multiplier: scenario.scenario.demandMultiplier,
      transitFactor: scenario.scenario.transitDelayFactor,
      critical: {
        id: criticalRisk.districtId,
        name: criticalRisk.districtName,
        score: criticalRisk.score,
      },
      baselineCritical: scenario.baselineCriticalCount,
      scenarioCritical: countCriticalAt(s30.demandMultiplier ?? 1.3),
      urgentLine: {
        district: worst.district.shortName,
        medicine: medicineName(worst.record.medicineId),
        so: Number(worst.so.toFixed(1)),
      },
      rec: nadiaOrsRecommendation(scenario.scenario.demandMultiplier),
    };
    // Resilience pair for the redistribution result moment. The result moment
    // renders AFTER simulateTransfer has landed the plan in the pipeline, so
    // `applied` already contains it: "after" is the live index, "before" strips
    // exactly this transfer back out. Before the action runs, the same pair is
    // computed prospectively (before = live, after = live + transfer). Either
    // way the two numbers are the real with/without-transfer states.
    const scen = scenario.scenario;
    const rec = nadiaOrsRecommendation(scen.demandMultiplier);
    const applied = appliedStock;
    const resilience = computeResilienceIndex(scen, applied).score;
    let resBefore = resilience;
    let resAfter = resilience;
    if (rec) {
      // Stock movement uses the FULL plan: every destination gain is mirrored
      // by each source's own leg debit — never the whole total from one district.
      const landed = applied[rec.toDistrictId]?.[rec.medicineId] ?? 0;
      const alreadyLanded = landed >= rec.fullPlanQuantity;
      const sourceDeltas = rec.legs.map((leg) => ({
        id: leg.fromDistrictId,
        qty: leg.quantity,
      }));
      const shiftSources = (map: typeof applied, sign: 1 | -1) => {
        const next = { ...map };
        for (const { id, qty } of sourceDeltas) {
          next[id] = {
            ...(next[id] ?? {}),
            [rec.medicineId]: (next[id]?.[rec.medicineId] ?? 0) + sign * qty,
          };
        }
        return next;
      };
      const withoutTransfer = shiftSources(
        {
          ...applied,
          [rec.toDistrictId]: {
            ...(applied[rec.toDistrictId] ?? {}),
            [rec.medicineId]: landed - rec.fullPlanQuantity,
          },
        },
        +1,
      );
      const withTransfer = shiftSources(
        {
          ...applied,
          [rec.toDistrictId]: {
            ...(applied[rec.toDistrictId] ?? {}),
            [rec.medicineId]: landed + rec.fullPlanQuantity,
          },
        },
        -1,
      );
      if (alreadyLanded) {
        resBefore = computeResilienceIndex(scen, withoutTransfer).score;
        resAfter = resilience;
      } else {
        resBefore = resilience;
        resAfter = computeResilienceIndex(scen, withTransfer).score;
      }
    }
    return { ...base, resilience, resBefore, resAfter };
  }, [scenario.scenario.demandMultiplier, scenario.scenario.transitDelayFactor, scenario.risks, scenario.baselineCriticalCount, appliedStock]);

  const moments = useMemo(() => {
    const base = STAGES[stageIndex].moments(ctx);
    // The result moment only exists once the stage's action has run (or when
    // it needs no action) — Back stays consistent because the action is
    // idempotent and re-running it is harmless.
    const result = STAGES[stageIndex].resultMoment?.(ctx);
    return result ? [...base, result] : base;
  }, [stageIndex, ctx]);

  // STEP TRANSITION LOCK — rapid Next/Back (or held arrow keys) must never
  // stack transitions: one accepted click opens a short window during which
  // further advance/back calls are ignored (buttons stay visible and enabled,
  // they just do not double-fire). The window covers route change + target
  // mount + tooltip settle; the spotlight's own lifecycle handles the rest.
  const transitioningRef = useRef(false);
  const lockTimerRef = useRef(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const lockTransition = useCallback(() => {
    transitioningRef.current = true;
    setIsTransitioning(true);
    window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => {
      transitioningRef.current = false;
      setIsTransitioning(false);
    }, 450);
  }, []);
  useEffect(() => () => window.clearTimeout(lockTimerRef.current), []);

  const advance = useCallback(() => {
    if (transitioningRef.current) return;
    lockTransition();
    const stage = STAGES[stageIndex];
    const hasResult = Boolean(stage.resultMoment);
    // Next onto the result moment performs the stage action first, so the
    // result card shows the real, fresh outcome (transfer applied, preset
    // applied, brief generated).
    const actionRunsNow = hasResult && momentIndex === moments.length - 2;
    if (momentIndex < moments.length - 1) {
      if (actionRunsNow) stage.onStageExit?.(actions);
      nextMoment();
      return;
    }
    // Leaving the final moment of the stage — advance to the next stage.
    if (stageIndex < STAGES.length - 1) {
      goToStage(stageIndex + 1);
    } else {
      completeTour();
    }
  }, [momentIndex, moments.length, stageIndex, actions, nextMoment, goToStage, completeTour, lockTransition]);

  const back = useCallback(() => {
    if (transitioningRef.current) return;
    lockTransition();
    if (momentIndex > 0) {
      prevMoment();
      return;
    }
    if (stageIndex > 0) {
      goToStage(stageIndex - 1, STAGES[stageIndex - 1].moments(ctx).length - 1);
    }
  }, [momentIndex, stageIndex, ctx, prevMoment, goToStage, lockTransition]);

  // Keyboard: ArrowRight/Space = Next, ArrowLeft = Back, Escape = exit to start route.
  // A focused button/interactable element consumes the event first so a stray
  // Space press doesn't advance while the user is interacting with the page.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const onInteractable = tag === 'INPUT' || tag === 'TEXTAREA' || (tag === 'BUTTON' && e.key === ' ');
      if (onInteractable) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        advance();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitTour();
        navigate(startPath.current, { replace: true });
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, advance, back, exitTour, navigate, onExit]);

  const currentMoment = moments[Math.min(momentIndex, moments.length - 1)];

  if (phase !== 'running') return null; // completion modal takes over

  return (
    <TourSpotlight
      targetId={currentMoment.id}
      title={currentMoment.title}
      body={currentMoment.body}
      stageTitle={STAGES[stageIndex].title}
      stageNumber={stageIndex + 1}
      stageCount={STAGES.length}
      momentIndex={momentIndex}
      momentCount={moments.length}
      isLast={stageIndex === STAGES.length - 1 && momentIndex === moments.length - 1}
      isTransitioning={isTransitioning}
      onBack={back}
      onNext={advance}
      onSkip={() => {
        exitTour();
        navigate(startPath.current, { replace: true });
        onExit();
      }}
    />
  );
}

function TourChrome() {
  const { phase, setPhase, restart, goToStage } = useTour();
  // Opening the intro always begins a FRESH tour — stage/moment indices reset,
  // so Start Tour lands on Stage 1 even after a previous run reached Stage 5.
  const openIntro = useCallback(() => {
    goToStage(0, 0);
    setPhase('intro');
  }, [goToStage, setPhase]);
  return (
    <>
      <TourButton onClick={openIntro} active={phase !== 'idle'} />
      {phase === 'intro' && (
        <TourIntroModal
          open
          onStart={() => setPhase('running')}
          onCancel={() => setPhase('idle')}
        />
      )}
      {(phase === 'running' || phase === 'complete') && <TourRunner onExit={() => setPhase('idle')} />}
      {phase === 'complete' && (
        <TourCompleteModal
          onRestart={() => restart()}
          onExplore={() => setPhase('idle')}
        />
      )}
    </>
  );
}

/** Keeps the DEMO TOUR header button; the old auto-chaining demo is replaced. */
export function DemoTour() {
  return (
    <TourProvider>
      <TourChrome />
    </TourProvider>
  );
}

function TourButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold text-accent-light ring-1 ring-inset ring-accent-light/40 hover:bg-chrome-light/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
      title="Guided operational tour — detect to resilience"
    >
      {active ? (
        <Square className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Play className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="hidden min-[480px]:inline">DEMO TOUR</span>
    </button>
  );
}
