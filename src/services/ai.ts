/**
 * AI layer. Provider abstraction with transparent failover:
 *  - remote: the server-side provider manager (Gemini primary → NVIDIA NIM
 *    fallback), reached through /api/ai — API keys stay server-side
 *  - local provider: deterministic formatting of the same context data, used
 *    only when BOTH remote providers fail
 *
 * The model ONLY writes prose from numbers the calc engine already produced —
 * it never computes cover, risk scores, or transfer quantities. The response
 * carries `provider` so the UI can label AI-generated vs deterministic output
 * honestly.
 */

export const AI_FALLBACK_NOTICE =
  'Both AI providers are unavailable — showing deterministic intelligence computed from the current scenario state.';

export type AiProviderName = 'gemini' | 'nvidia' | 'deterministic';

export interface AiResult {
  text: string;
  usedFallback: boolean;
  provider: AiProviderName;
  model: string | null;
}

const PROXY_URL = '/api/ai';

export interface AiRequestContext {
  question: string;
  /** Compact, pre-computed facts (strings of numbers from the calc engine). */
  contextData: string;
  /** Optional instruction, e.g. "produce an executive policy brief". */
  task?: 'explain' | 'brief';
}

/** Send one prompt through the proxy; throws on network/HTTP failure. */
async function callProxy(ctx: AiRequestContext): Promise<{ text: string; provider: AiProviderName; model: string | null }> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });
  if (!res.ok) throw new Error(`AI proxy responded ${res.status}`);
  const data = (await res.json()) as { text?: string; provider?: string; model?: string };
  if (!data.text) throw new Error('AI proxy returned no text');
  // Only trust known provider names — anything else is treated as generic AI.
  const provider: AiProviderName =
    data.provider === 'gemini' || data.provider === 'nvidia' ? data.provider : 'gemini';
  return { text: data.text, provider, model: data.model ?? null };
}

/** Public API: remote provider manager (Gemini → NVIDIA server-side),
    silently falling back to deterministic prose when both fail. */
export async function explainOrFallback(
  ctx: AiRequestContext,
  localFallback: (ctx: AiRequestContext) => string,
): Promise<AiResult> {
  try {
    const { text, provider, model } = await callProxy(ctx);
    return { text, usedFallback: false, provider, model };
  } catch {
    return { text: localFallback(ctx), usedFallback: true, provider: 'deterministic', model: null };
  }
}

// ── Deterministic local provider (same context data, formatted as prose) ─────

export function localExplain(ctx: AiRequestContext): string {
  const lines = ctx.contextData
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return [
    `Deterministic read-out — ${ctx.question}`,
    '',
    ...lines.map((l) => `• ${l}`),
  ].join('\n');
}

export function localBrief(situationText: string): string {
  return [
    'POLICY BRIEF — DETERMINISTIC MODE',
    '',
    situationText,
    '',
    'Prepared from the HealthFlow demo dataset. All figures are computed by the',
    'deterministic calculation engine from the simulated demo data; no external',
    'model was involved in producing these numbers.',
  ].join('\n');
}

// ── Brief context builder (imports ONLY from data + calc) ────────────────────

import type { BriefSituation } from '../types';
import { computeAllRisks } from '../utils/calc';
import { districts, inventory, medicines, DEMO_LABEL } from '../data/districts';

const medicineName = (id: string) => medicines.find((m) => m.id === id)?.name ?? id;
const districtName = (id: string) => districts.find((d) => d.id === id)?.name ?? id;

export function buildBriefContext(situation: BriefSituation): string {
  const lines: string[] = [];
  lines.push(`HealthFlow situation summary (${DEMO_LABEL})`);
  lines.push(`Scenario: demand ×${situation.scenario.demandMultiplier.toFixed(2)}, transit ×${situation.scenario.transitDelayFactor.toFixed(2)}`);
  lines.push(
    `District bands: ${situation.criticalCount} critical, ${situation.highCount} high, ${situation.watchCount} watch, ${situation.stableCount} stable (baseline critical: ${situation.baselineCriticalCount})`,
  );
  lines.push(`Population in critical/high districts: ${(situation.totalPopulationAffected / 1_000_000).toFixed(1)}M`);
  if (situation.districtsAtRisk.length > 0) {
    lines.push('Affected districts (composite score / 100):');
    for (const r of situation.districtsAtRisk) {
      lines.push(
        `- ${r.district.name}: score ${r.score} (${r.band}); worst line cover ${r.worstDaysOfCover?.toFixed(1)} days, stock-out in ${r.worstStockOutDays?.toFixed(1)} days`,
      );
    }
  }
  if (situation.topMedicineRisks.length > 0) {
    lines.push('Most urgent medicine lines:');
    for (const m of situation.topMedicineRisks.slice(0, 4)) {
      lines.push(
        `- ${m.district.name} · ${m.medicine.name}: ${m.record.currentStock.toLocaleString()} units, stock-out in ${m.stockOutDays.toFixed(1)} days`,
      );
    }
  }
  if (situation.recommendations.length > 0) {
    lines.push('Recommended redistributions:');
    for (const rec of situation.recommendations) {
      // Multi-leg plans are described as ONE recommendation with every leg —
      // the coverage outcome is claimed once, for the FULL quantity, so the
      // prose can never credit one source with a multi-source result.
      if (rec.legs.length > 1) {
        lines.push(
          `- Move ${rec.fullPlanQuantity.toLocaleString()} units of ${medicineName(rec.medicineId)} to ${districtName(rec.toDistrictId)} as ${rec.legs.length} shipments: ${rec.legs
            .map(
              (leg) =>
                `${leg.quantity.toLocaleString()} from ${districtName(leg.fromDistrictId)} (${leg.transitHours}h transit)`,
            )
            .join(' + ')}; cover ${rec.daysOfCoverBefore.toFixed(1)} → ${rec.fullPlanCoverAfter.toFixed(1)} days when all legs land${rec.fullPlanGapUnits > 0 ? `, leaving a ${rec.fullPlanGapUnits.toLocaleString()}-unit gap below reserve` : ''}`,
        );
      } else {
        lines.push(
          `- Move ${rec.quantity.toLocaleString()} units of ${medicineName(rec.medicineId)} from ${districtName(rec.fromDistrictId)} to ${districtName(rec.toDistrictId)} (${rec.transitHours}h transit); cover ${rec.daysOfCoverBefore.toFixed(1)} → ${rec.daysOfCoverAfter.toFixed(1)} days`,
        );
      }
    }
  }
  return lines.join('\n');
}

export function buildExplainContext(districtId: string, multiplier: number): string {
  const risks = computeAllRisks(districts, inventory, multiplier);
  const r = risks.find((x) => x.district.id === districtId);
  if (!r || !r.worstRecord) return `No inventory lines tracked for ${districtName(districtId)}.`;
  const lines = [
    `${r.district.name} composite risk ${r.score}/100 (${r.band} band) at demand ×${multiplier.toFixed(2)}.`,
    ...r.factors.map(
      (f) => `${f.label}: ${Math.round(f.value)} pressure × weight ${f.weight.toFixed(2)} = ${f.weighted.toFixed(1)} points`,
    ),
    `Worst line: ${medicineName(r.worstRecord.medicineId)} — ${r.worstRecord.currentStock.toLocaleString()} units, ${r.worstDaysOfCover?.toFixed(1)} days of cover, stock-out in ${r.worstStockOutDays?.toFixed(1)} days.`,
  ];
  return lines.join('\n');
}
