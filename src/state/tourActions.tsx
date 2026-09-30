import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Programmatic actions the guided tour performs that live in PAGE-local state
 * (so the tour can't set them directly). Global scenario state is applied by
 * the tour via the existing ScenarioContext — no duplicated data, no separate
 * math. Each flag mirrors a deep-link behavior the page already supports:
 *   - tourTransferSimulated  ↔  Redistribution's ?auto=1
 *   - tourAutoGenerateBrief  ↔  Policy Brief's ?auto=1
 */
interface TourActionsValue {
  tourTransferSimulated: boolean;
  setTourTransferSimulated: (v: boolean) => void;
  tourAutoGenerateBrief: boolean;
  setTourAutoGenerateBrief: (v: boolean) => void;
}

const TourActionsContext = createContext<TourActionsValue | null>(null);

export function TourActionsProvider({ children }: { children: ReactNode }) {
  const [tourTransferSimulated, setTourTransferSimulated] = useState(false);
  const [tourAutoGenerateBrief, setTourAutoGenerateBrief] = useState(false);

  const value = useMemo<TourActionsValue>(
    () => ({
      tourTransferSimulated,
      setTourTransferSimulated,
      tourAutoGenerateBrief,
      setTourAutoGenerateBrief,
    }),
    [tourTransferSimulated, tourAutoGenerateBrief],
  );

  return <TourActionsContext.Provider value={value}>{children}</TourActionsContext.Provider>;
}

/** Returns null outside the provider — pages treat that as "no tour running". */
export function useTourActions(): TourActionsValue | null {
  return useContext(TourActionsContext);
}
