import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type TourPhase = 'idle' | 'intro' | 'running' | 'complete';

interface TourContextValue {
  phase: TourPhase;
  stageIndex: number;
  momentIndex: number;
  setPhase: (p: TourPhase) => void;
  goToStage: (stageIndex: number, momentIndex?: number) => void;
  nextMoment: () => void;
  prevMoment: () => void;
  /** Finish the last stage → completion modal. */
  completeTour: () => void;
  /** Leave the tour entirely (Skip / Escape / Explore Freely). */
  exitTour: () => void;
  /** Back to stage 0, moment 0 from the completion modal. */
  restart: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<TourPhase>('idle');
  const [stageIndex, setStageIndex] = useState(0);
  const [momentIndex, setMomentIndex] = useState(0);

  const goToStage = useCallback((s: number, m = 0) => {
    setStageIndex(s);
    setMomentIndex(m);
  }, []);

  const nextMoment = useCallback(() => setMomentIndex((m) => m + 1), []);
  const prevMoment = useCallback(() => setMomentIndex((m) => Math.max(0, m - 1)), []);

  const completeTour = useCallback(() => setPhase('complete'), []);
  const exitTour = useCallback(() => setPhase('intro'), []);
  const restart = useCallback(() => {
    setStageIndex(0);
    setMomentIndex(0);
    setPhase('running');
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      phase,
      stageIndex,
      momentIndex,
      setPhase,
      goToStage,
      nextMoment,
      prevMoment,
      completeTour,
      exitTour,
      restart,
    }),
    [phase, stageIndex, momentIndex, goToStage, nextMoment, prevMoment, completeTour, exitTour, restart],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}
