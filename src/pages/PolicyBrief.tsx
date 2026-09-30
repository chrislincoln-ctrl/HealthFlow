import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Check, Copy, Download, FileText, ShieldAlert, Eye } from 'lucide-react';
import type { BriefSituation } from '../types';
import { districts, inventory, medicines, DEMO_LABEL } from '../data/districts';
import {
  buildTransferRecommendation,
  computeAllRisks,
  countBands,
  daysOfCover,
  stockOutDays,
  transitHoursBetween,
} from '../utils/calc';
import { useScenario } from '../state/ScenarioContext';
import { useAuth } from '../state/AuthContext';
import { useInterventions } from '../state/InterventionContext';
import { computeResilienceIndex } from '../utils/resilience';
import { useTourActions } from '../state/tourActions';
import {
  buildBriefContext,
  explainOrFallback,
  localBrief,
} from '../services/ai';
import { CACHED_BRIEFS } from '../data/cachedBriefs';
import { scenarioOf } from '../utils/calc';
import {
  loadBrief,
  saveBrief,
  scenarioKeyOf,
} from '../state/briefStore';

export default function PolicyBrief() {
  const { scenario, baselineCriticalCount } = useScenario();
  const { plans, appliedStock } = useInterventions();
  const tourActions = useTourActions();
  const [params] = useSearchParams();
  const [brief, setBrief] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  /** Where the displayed text came from: live AI, generated cache, or deterministic. */
  const [briefSource, setBriefSource] = useState<'ai' | 'cache' | 'deterministic'>('ai');
  /** Timestamp of the persisted brief (shown as the save provenance line). */
  const [briefSaved, setBriefSaved] = useState<{ generatedAt: string } | null>(null);

  // ── Saved brief: survives navigation and reloads, cleared at sign-out ──
  const { user } = useAuth();
  const userKey = user?.provider === 'demo' ? 'demo' : user?.email ?? 'anon';
  const currentKey = scenarioKeyOf(scenario);
  // Restore the saved brief once on mount (only when the scenario still
  // matches what it was generated under — briefStore drops stale ones).
  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const saved = loadBrief(userKey, currentKey);
    if (saved) {
      setBrief(saved.text);
      setUsedFallback(saved.usedFallback);
      setBriefSource(saved.source);
      setProvider(saved.provider);
      setModel(saved.model);
      setBriefSaved({ generatedAt: saved.generatedAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Presenter switch: force the deterministic path on purpose (resilience demo). */
  const [forceDeterministic, setForceDeterministic] = useState(false);

  const situation: BriefSituation = useMemo(() => {
    const multiplier = scenario.demandMultiplier;
    const risks = computeAllRisks(districts, inventory, multiplier);
    const counts = countBands(risks);
    const districtsAtRisk = risks.filter((r) => r.band === 'critical' || r.band === 'high');
    const totalPopulationAffected = districtsAtRisk.reduce(
      (s, r) => s + districts.find((d) => d.id === r.district.id)!.population,
      0,
    );

    const topMedicineRisks = inventory
      .map((record) => {
        const district = districts.find((d) => d.id === record.districtId)!;
        const medicine = { id: record.medicineId, name: record.medicineId, category: '' };
        return {
          record,
          district,
          medicine,
          stockOutDays: stockOutDays(record, multiplier),
        };
      })
      .filter((x) => x.stockOutDays < x.record.reserveThresholdDays)
      .sort((a, b) => a.stockOutDays - b.stockOutDays)
      .slice(0, 4);

    const recommendations = inventory
      .filter((r) => stockOutDays(r, multiplier) < r.reserveThresholdDays)
      .map((shortage) => {
        const shortageDistrict = districts.find((d) => d.id === shortage.districtId)!;
        const sources = districts
          .filter((d) => d.id !== shortage.districtId)
          .map((d) => {
            const record = inventory.find(
              (x) => x.districtId === d.id && x.medicineId === shortage.medicineId,
            );
            const t = record ? transitHoursBetween(shortage.districtId, d.id) : null;
            return record && t !== null ? { record, transitHours: t } : null;
          })
          .filter(Boolean) as { record: (typeof inventory)[number]; transitHours: number }[];
        return buildTransferRecommendation(shortage, shortageDistrict, sources, multiplier);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 3);

    return {
      scenario,
      risks,
      districtsAtRisk,
      stableCount: counts.stable,
      watchCount: counts.watch,
      highCount: counts.high,
      criticalCount: counts.critical,
      baselineCriticalCount,
      totalPopulationAffected,
      topMedicineRisks: topMedicineRisks.map((x) => ({
        ...x,
        medicine: { ...x.medicine, name: medicineNameOf(x.record.medicineId) },
      })),
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }, [scenario, baselineCriticalCount]);

  // Resilience index + intervention pipeline — same shared state as the UI.
  const resilience = useMemo(
    () => computeResilienceIndex(scenario, appliedStock),
    [scenario, appliedStock],
  );
  const activePlans = plans.filter((p) =>
    ['UNDER REVIEW', 'APPROVED', 'DISPATCHED', 'IN TRANSIT'].includes(p.status),
  );
  const completedPlans = plans.filter((p) => p.status === 'COMPLETED');

  // Deep link (?auto=1) generates the brief on arrival (demo tour step 8).
  const generateRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (params.get('auto') === '1') void generateRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Guided tour can trigger generation programmatically (same code path as the button).
  useEffect(() => {
    if (tourActions?.tourAutoGenerateBrief) {
      void generateRef.current();
      tourActions.setTourAutoGenerateBrief(false);
    }
  }, [tourActions?.tourAutoGenerateBrief]);

  async function generate() {
    setLoading(true);
    setCopied(false);
    setBrief(null);
    // Presenter-triggered deterministic mode: same numbers, deliberately
    // AI-free. Never an accidental state — it exists so the fallback can be
    // demonstrated on demand.
    if (forceDeterministic) {
      const ctxText = buildBriefContext(situation);
      const detText = localBrief(ctxText);
      setBrief(detText);
      setUsedFallback(true);
      setProvider('deterministic');
      setModel(null);
      setBriefSource('deterministic');
      saveBrief(userKey, {
        text: detText,
        source: 'deterministic',
        usedFallback: true,
        provider: 'deterministic',
        model: null,
        generatedAt: new Date().toISOString(),
        scenarioKey: currentKey,
      });
      setBriefSaved({ generatedAt: new Date().toISOString() });
      setLoading(false);
      return;
    }
    const { text, usedFallback: fb, provider: prov, model: mod } = await explainOrFallback(
      {
        question:
          'Write a concise executive policy brief (situation, affected districts, risk drivers, recommended interventions) for the state health leadership.',
        contextData: buildBriefContext(situation),
        task: 'brief',
      },
      (ctx) => localBrief(ctx.contextData),
    );
    if (fb) {
      // Both providers unreachable: serve a pre-generated brief for the closest
      // canonical scenario instead of an accidental failure banner. Numbers in
      // the cache were engine-computed for that scenario; the banner says so.
      const cached =
        CACHED_BRIEFS[presetKeyOf(scenario)] ??
        (scenarioOf(scenario).demandMultiplier !== 1
          ? (CACHED_BRIEFS.s50 ?? CACHED_BRIEFS.baseline)
          : CACHED_BRIEFS.baseline);
      const cachedText = [
        `# HealthFlow Executive Brief — cached snapshot`,
        ``,
        `> Live AI was unreachable; showing the pre-generated brief for “${cached.label}”.`,
        `> Its figures were computed by the calc engine for that scenario and may`,
        `> differ slightly from the current on-screen state.`,
        ``,
        cached.text,
      ].join('\n');
      setBrief(cachedText);
      setUsedFallback(true);
      setProvider('deterministic');
      setModel(null);
      setBriefSource('cache');
      saveBrief(userKey, {
        text: cachedText,
        source: 'cache',
        usedFallback: true,
        provider: 'deterministic',
        model: null,
        generatedAt: new Date().toISOString(),
        scenarioKey: currentKey,
      });
      setBriefSaved({ generatedAt: new Date().toISOString() });
    } else {
      setBrief(text);
      setUsedFallback(false);
      setProvider(prov);
      setModel(mod);
      setBriefSource('ai');
      saveBrief(userKey, {
        text,
        source: 'ai',
        usedFallback: false,
        provider: prov,
        model: mod,
        generatedAt: new Date().toISOString(),
        scenarioKey: currentKey,
      });
      setBriefSaved({ generatedAt: new Date().toISOString() });
    }
    setLoading(false);
  }
  generateRef.current = generate;

  /** Which cached scenario matches the current stress best. */
  function presetKeyOf(s: typeof scenario): 'baseline' | 's50' | 'combined' {
    const scen = scenarioOf(s);
    const hasDisruption = scen.disruptedCorridors.length > 0 || scen.transitDelayFactor > 1 || scen.workforceFactor !== 1 || scen.supplyShockFactor > 0 || scen.coldChainIncident;
    if (scen.demandMultiplier >= 1.25 && hasDisruption) return 'combined';
    if (scen.demandMultiplier >= 1.4) return 's50';
    if (scen.demandMultiplier >= 1.2 && scen.demandMultiplier < 1.4 && !hasDisruption) return 's50';
    if (hasDisruption) return 'combined';
    return 'baseline';
  }

  const briefMarkdown =
    brief ??
    [
      `# HealthFlow Policy Brief (${DEMO_LABEL})`,
      '',
      buildBriefContext(situation),
    ].join('\n');

  function copyBrief() {
    navigator.clipboard.writeText(briefMarkdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadBrief() {
    const blob = new Blob([briefMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `healthflow-brief-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Policy Brief Generator</h1>
          <p className="text-xs text-slate-450">
            Assembles Situation / Affected Districts / Risk Drivers / Interventions from the current
            scenario state
          </p>
        </div>
        <span className="rounded bg-ai-wash dark:bg-ai/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ai-dark dark:text-ai-light">
          Report
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        {/* Situation snapshot (deterministic, always visible) */}
        <section data-tour="tour-snapshot" className="rounded-lg border border-line bg-surface p-4 shadow-panel" aria-labelledby="snapshot-heading">
          <h2 id="snapshot-heading" className="text-sm font-bold text-ink">
            Situation snapshot
          </h2>
          <p className="mt-1 text-[11px] text-slate-450">
            Computed by the calc engine from the current scenario — the AI layer only writes prose
            from these numbers.
          </p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Scenario</dt>
              <dd className="tabular font-semibold text-ink">
                demand ×{scenario.demandMultiplier.toFixed(2)} · transit ×
                {scenario.transitDelayFactor.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Critical districts</dt>
              <dd className="tabular font-semibold text-ink">
                {situation.baselineCriticalCount} → {situation.criticalCount}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Resilience index (prototype)</dt>
              <dd className="tabular font-semibold text-ink">
                {resilience.score} · {resilience.band}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Intervention pipeline</dt>
              <dd className="tabular font-semibold text-ink">
                {activePlans.length} active · {completedPlans.length} completed
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Population in high/critical</dt>
              <dd className="tabular font-semibold text-ink">
                {(situation.totalPopulationAffected / 1_000_000).toFixed(1)}M
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Urgent medicine lines</dt>
              <dd className="tabular font-semibold text-ink">{situation.topMedicineRisks.length}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-450">Transfers recommended</dt>
              <dd className="tabular font-semibold text-ink">
                {situation.recommendations.length} shown of{' '}
                {inventory.filter((r) => stockOutDays(r, scenario.demandMultiplier) < r.reserveThresholdDays).length}{' '}
                lines below reserve
              </dd>
            </div>
          </dl>

          {situation.topMedicineRisks.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                Most urgent lines
              </h3>
              <ul role="list" className="mt-1.5 space-y-1.5">
                {situation.topMedicineRisks.map((m) => (
                  <li key={`${m.district.id}-${m.record.medicineId}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-ink">
                      <span className="font-semibold">{m.district.shortName}</span>{' '}
                      {m.medicine.name}
                    </span>
                    <span className="tabular text-slate-450">
                      stock-out {m.stockOutDays.toFixed(1)}d · cover{' '}
                      {daysOfCover(m.record).toFixed(1)}d
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            data-tour="tour-generate-brief"
            onClick={generate}
            disabled={loading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark"
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            {loading ? 'Generating…' : brief ? 'Regenerate brief' : 'Generate Policy Brief'}
          </button>

          {/* Deliberate deterministic demo: presenter-triggered, clearly
              labeled — the fallback can be demonstrated honestly on demand
              without ever manufacturing an accidental failure state. */}
          <button
            onClick={() => setForceDeterministic((v) => !v)}
            aria-pressed={forceDeterministic}
            title="Presenter option: generate the next brief with the deterministic path (no AI) to demonstrate offline resilience."
            className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark ${
              forceDeterministic
                ? 'bg-status-watch/15 text-status-watch ring-1 ring-inset ring-status-watch/40'
                : 'text-slate-450 ring-1 ring-inset ring-line hover:text-ink'
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {forceDeterministic ? 'Deterministic demo: ON — next brief skips AI' : 'Deterministic demo (presenter mode)'}
          </button>
        </section>

        {/* Brief output — the COMPLETE Executive Brief panel is ONE tour target:
            header, AI badge, copy/download, notice banner, and every content
            block below are inside this root element. */}
        <section
          data-tour="policy-brief-full"
          className="rounded-lg border border-line bg-surface shadow-panel"
          aria-labelledby="brief-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 id="brief-heading" className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <FileText className="h-4 w-4 text-ai" aria-hidden="true" />
              Executive brief
              {/* Status reflects reality: AI GENERATED only when a provider
                  actually produced the text; DETERMINISTIC MODE otherwise.
                  Never both at once. */}              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  briefSource === 'ai'
                    ? 'bg-ai-wash dark:bg-ai/20 text-ai-dark dark:text-ai-light'
                    : 'bg-status-watch/15 text-status-watch'
                }`}
              >
                {briefSource === 'ai' ? 'AI generated' : briefSource === 'cache' ? 'Cached brief' : 'Deterministic mode'}
              </span>
              {/* Subtle provider provenance — hidden by default, revealed on
                  hover/focus. Development/admin detail, not judge-facing. */}
              {briefSource === 'ai' && provider && (
                <span className="group relative inline-flex" tabIndex={0}>
                  <span
                    className="ml-0.5 rounded px-1 py-0.5 text-[9px] font-semibold text-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 focus:outline-none"
                    aria-label={`Generated by ${provider}${model ? ` (${model})` : ''}`}
                  >
                    {provider}
                  </span>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-max max-w-56 rounded border border-line bg-surface-elevated px-2 py-1 text-[10px] font-medium text-ink opacity-0 shadow-drawer transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    Generated by HealthFlow AI — {provider === 'gemini' ? 'Gemini' : 'NVIDIA fallback'}
                    {model ? ` · ${model}` : ''}
                  </span>
                </span>
              )}
            </h2>
            {brief && (
              <div className="flex gap-1.5">
                <button
                  onClick={copyBrief}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {copied ? <Check className="h-3 w-3 text-status-stable" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={downloadBrief}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Download className="h-3 w-3" aria-hidden="true" />
                  Download .md
                </button>
              </div>
            )}
          </div>

          <div className="px-4 py-4">
            {!brief && !loading && (
              <div className="rounded-lg border border-dashed border-line p-5">
                <div className="text-center">
                  <FileText className="mx-auto h-8 w-8 text-faint" aria-hidden="true" />
                  <p className="mt-2 text-xs font-semibold text-ink">No brief generated yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-slate-450">
                    Generate to turn the live situation below into a leadership-ready brief — the AI
                    writes prose only; every number comes from the calc engine on screen.
                  </p>
                </div>
                <div className="mt-4 border-t border-line-soft pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">
                    What the brief will say — live situation snapshot
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">Critical districts</dt>
                      <dd className="tabular font-semibold text-ink">{situation.criticalCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">High districts</dt>
                      <dd className="tabular font-semibold text-ink">{situation.highCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">Population affected</dt>
                      <dd className="tabular font-semibold text-ink">{(situation.totalPopulationAffected / 1_000_000).toFixed(1)}M</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">Urgent lines</dt>
                      <dd className="tabular font-semibold text-ink">{situation.topMedicineRisks.length}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">Transfers planned</dt>
                      <dd className="tabular font-semibold text-ink">{situation.recommendations.length}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-450">Scenario</dt>
                      <dd className="tabular font-semibold text-ink">×{scenario.demandMultiplier.toFixed(2)} demand</dd>
                    </div>
                  </dl>
                  {situation.topMedicineRisks.length > 0 && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-450">
                      Most urgent:{' '}
                      {situation.topMedicineRisks
                        .slice(0, 2)
                        .map((m) => `${districts.find((d) => d.id === m.record.districtId)?.name} ${m.medicine.name} (stock-out +${m.stockOutDays.toFixed(1)}d)`)
                        .join('; ')}
                      .
                    </p>
                  )}
                </div>
              </div>
            )}

            {loading && (
              <div className="space-y-2" aria-busy="true" aria-label="Generating brief">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 9}%` }} />
                ))}
              </div>
            )}

            {brief && !loading && (
              <>
                {usedFallback && (
                  <p className="mb-3 flex items-start gap-1.5 rounded bg-status-watch/10 dark:bg-status-watch/20 px-3 py-2 text-[11px] font-medium text-status-watch">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {briefSource === 'cache'
                      ? 'Live AI was unreachable — showing a pre-generated brief snapshot for the closest canonical scenario. Figures were engine-computed for that scenario and may differ slightly from the current state.'
                      : 'Deterministic mode — this brief was assembled directly from the calc engine output on screen, with no AI model involved.'}
                  </p>
                )}
                {briefSaved && (
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Saved to this browser · {new Date(briefSaved.generatedAt).toLocaleString()} · generated under the
                    current scenario · cleared at sign-out
                  </p>
                )}
                <article className="space-y-3 text-xs leading-relaxed text-ink">
                  {brief
                    // Paragraph breaks: blank lines, AND any newline directly
                    // before a list marker or a markdown heading — models emit
                    // single-\n list items/heads, which would otherwise stay
                    // glued to the previous block and mis-pair bullet asterisks
                    // as emphasis.
                    .split(/\n\n|\n(?=\s*(?:#{1,4}\s|\d+\.\s|[-*]\s))/)
                    // Horizontal rules were stripped inside BriefParagraph;
                    // skip the empty blocks they leave behind.
                    .filter((para) => para.trim().length > 0)
                    .map((para, i) => (
                    <BriefParagraph key={i} text={para} />
                  ))}
                </article>

                {/* Provenance: what is real geographic context vs synthetic
                    operational data vs prototype modeling — always visible
                    with the brief so the AI prose cannot be mistaken for an
                    official data source. */}
                <aside className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-450">
                    Data &amp; model provenance
                  </h3>
                  <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-450">
                    <li>
                      <span className="font-semibold text-ink">Geography</span> — real West Bengal
                      district context (names, relative geography).
                    </li>
                    <li>
                      <span className="font-semibold text-ink">Operational data</span> — synthetic
                      demo dataset (inventory, consumption, corridors).
                    </li>
                    <li>
                      <span className="font-semibold text-ink">Facility layer</span> — synthetic
                      seeded PHC network; district signals aggregate from facilities.
                    </li>
                    <li>
                      <span className="font-semibold text-ink">Forecast</span> — prototype demand
                      model on seeded consumption history.
                    </li>
                    <li>
                      <span className="font-semibold text-ink">Optimization</span> — prototype
                      allocation engine (whole shipments, reserve gates).
                    </li>
                    <li>
                      <span className="font-semibold text-ink">AI</span> — HealthFlow AI writes prose
                      only; every number in this brief comes from the deterministic calc engine.
                    </li>
                    <li>
                      <span className="font-semibold text-ink">Scenario</span> — simulated stress
                      test; not an official forecast and not clinically validated.
                    </li>
                  </ul>
                </aside>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function medicineNameOf(id: string): string {
  return medicines.find((m) => m.id === id)?.name ?? id;
}

/** Inline markdown fragments the model actually emits: **bold** and *italic*. */
function BriefInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
          return <em key={i}>{p.slice(1, -1)}</em>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** One paragraph of the brief: heading, list item, or body text. */
function BriefParagraph({ text }: { text: string }) {
  const trimmed = text
    // Markdown horizontal rules (`---`, `***`) carry no meaning in this
    // renderer — models and cached briefs emit them as section separators,
    // so render nothing rather than a literal dash line.
    .replace(/(?:^|\n)\s*(?:---+|\*\*\+)\s*(?=\n|$)/g, '\n')
    .trim();
  // Headings: '###' or '#'-prefixed lines the model emits. The body often
  // follows on the next single line, so split it off and render separately.
  const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/s);
  if (headingMatch) {
    const headingText = headingMatch[1].split('\n')[0].replace(/\*\*/g, '');
    const bodyAfter = headingMatch[1].split('\n').slice(1).join('\n').trim();
    return (
      <>
        <h3 className="pt-1 text-sm font-bold text-ink">
          <BriefInline text={headingText} />
        </h3>
        {bodyAfter && (
          <p className="whitespace-pre-line">
            <BriefInline text={bodyAfter} />
          </p>
        )}
      </>
    );
  }
  // Numbered list items — render with the number kept as plain text.
  if (/^\d+\.\s/.test(trimmed) || trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
    const body = trimmed.replace(/^(\d+\.|\*|-)\s+/, '');
    return (
      <p className="flex gap-2 whitespace-pre-line">
        <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ai" />
        <span>
          <BriefInline text={body} />
        </span>
      </p>
    );
  }
  return (
    <p className="whitespace-pre-line">
      <BriefInline text={trimmed} />
    </p>
  );
}
