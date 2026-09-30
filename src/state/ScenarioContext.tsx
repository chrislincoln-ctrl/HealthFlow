import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ScenarioState, SimulatorPreset } from '../types';
import { districts, inventory } from '../data/districts';
import { computeAllRisks, countBands, scenarioOf } from '../utils/calc';

interface ScenarioContextValue {
  scenario: ScenarioState;
  risks: ComputedRiskLite[];
  baselineCriticalCount: number;
  setDemandMultiplier: (v: number) => void;
  setTransitDelayFactor: (v: number) => void;
  applyPreset: (preset: SimulatorPreset) => void;
  reset: () => void;
  /** True when the scenario deviates from baseline in any dimension. */
  isStressed: boolean;
}

/** Minimal risk shape shared across screens (mirrors ComputedRisk fields). */
export interface ComputedRiskLite {
  districtId: string;
  districtName: string;
  score: number;
  band: 'stable' | 'watch' | 'high' | 'critical';
}

const DEFAULT_SCENARIO: ScenarioState = {
  demandMultiplier: 1,
  transitDelayFactor: 1,
  workforceFactor: 1,
  bedDemandFactor: 1,
  disruptedCorridors: [],
  supplyShockFactor: 0,
  coldChainIncident: false,
  presetId: null,
};

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<ScenarioState>(DEFAULT_SCENARIO);

  const setDemandMultiplier = useCallback((v: number) => {
    setScenario((s) => ({ ...s, demandMultiplier: v, presetId: null }));
  }, []);

  const setTransitDelayFactor = useCallback((v: number) => {
    setScenario((s) => ({ ...s, transitDelayFactor: v, presetId: null }));
  }, []);

  const applyPreset = useCallback((preset: SimulatorPreset) => {
    setScenario({
      demandMultiplier: preset.demandMultiplier ?? 1,
      transitDelayFactor: preset.transitDelayFactor ?? 1,
      workforceFactor: preset.workforceFactor ?? 1,
      bedDemandFactor: preset.bedDemandFactor ?? 1,
      disruptedCorridors: preset.disruptedCorridors ?? [],
      supplyShockFactor: preset.supplyShockFactor ?? 0,
      coldChainIncident: preset.coldChainIncident ?? false,
      presetId: preset.id,
    });
  }, []);

  const reset = useCallback(() => setScenario(DEFAULT_SCENARIO), []);

  const risks = useMemo(() => {
    return computeAllRisks(districts, inventory, scenario).map((r) => ({
      districtId: r.district.id,
      districtName: r.district.name,
      score: r.score,
      band: r.band,
    }));
  }, [scenario]);

  const baselineCriticalCount = useMemo(
    () => countBands(computeAllRisks(districts, inventory, 1)).critical,
    [],
  );

  const value = useMemo<ScenarioContextValue>(
    () => ({
      scenario,
      risks,
      baselineCriticalCount,
      setDemandMultiplier,
      setTransitDelayFactor,
      applyPreset,
      reset,
      isStressed:
        scenario.demandMultiplier !== 1 ||
        scenario.transitDelayFactor !== 1 ||
        scenario.workforceFactor !== 1 ||
        scenario.bedDemandFactor !== 1 ||
        scenario.supplyShockFactor !== 0 ||
        scenario.coldChainIncident ||
        scenario.disruptedCorridors.length > 0,
    }),
    [
      scenario,
      risks,
      baselineCriticalCount,
      setDemandMultiplier,
      setTransitDelayFactor,
      applyPreset,
      reset,
    ],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error('useScenario must be used inside <ScenarioProvider>');
  return ctx;
}

// Re-exported so pages can normalize partial scenarios through one helper.
export { scenarioOf };
