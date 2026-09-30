import type { ScenarioState } from '../types';

/**
 * Saved Policy Brief store.
 *
 * A generated brief is a session artifact: it survives leaving the Policy
 * Brief page (and full reloads) so the operational document is not destroyed
 * by navigation, and it is cleared on sign-out so the next session starts
 * clean. Stored per-user in localStorage; a stored brief is only restored
 * when the CURRENT scenario matches the one it was generated under — a brief
 * written for another scenario would silently mislead.
 */

export interface SavedBrief {
  text: string;
  source: 'ai' | 'cache' | 'deterministic';
  usedFallback: boolean;
  provider: string | null;
  model: string | null;
  generatedAt: string;
  /** Scenario fingerprint the brief was generated under. */
  scenarioKey: string;
}

const storageKey = (userKey: string) => `hf:policy-brief:${userKey}`;

/** Stable fingerprint of the scenario state that produced a brief. */
export function scenarioKeyOf(s: Partial<ScenarioState>): string {
  return [
    s.demandMultiplier ?? 1,
    s.transitDelayFactor ?? 1,
    s.workforceFactor ?? 1,
    s.bedDemandFactor ?? 1,
    (s.disruptedCorridors ?? []).slice().sort().join('|'),
    s.supplyShockFactor ?? 0,
    s.coldChainIncident ? 1 : 0,
    s.presetId ?? '',
  ].join('~');
}

/** Load the user's saved brief, or null when absent / stale for this scenario. */
export function loadBrief(userKey: string, currentScenarioKey: string): SavedBrief | null {
  try {
    const raw = localStorage.getItem(storageKey(userKey));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedBrief;
    if (!saved?.text || saved.scenarioKey !== currentScenarioKey) return null;
    return saved;
  } catch {
    return null;
  }
}

/** Persist the brief for this user (best-effort — never blocks the UI). */
export function saveBrief(userKey: string, brief: SavedBrief): void {
  try {
    localStorage.setItem(storageKey(userKey), JSON.stringify(brief));
  } catch {
    // Storage unavailable (private mode/quota): the brief still shows this
    // visit; it just won't survive navigation.
  }
}

/** Remove the saved brief — called on sign-out. */
export function clearBrief(userKey: string): void {
  try {
    localStorage.removeItem(storageKey(userKey));
  } catch {
    // ignore
  }
}
