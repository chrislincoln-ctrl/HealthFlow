import { CheckCircle2 } from 'lucide-react';
import { useTour } from './TourContext';

/** Shown after the last stage. Restart Tour loops; Explore Freely closes the tour. */
export function TourCompleteModal({
  onRestart,
  onExplore,
}: {
  onRestart: () => void;
  onExplore: () => void;
}) {
  const { phase } = useTour();
  if (phase !== 'complete') return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-chrome-dark/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-complete-title"
        className="w-full max-w-md rounded-lg border border-line bg-surface p-5 text-center shadow-drawer"
      >
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-status-stable/10">
          <CheckCircle2 className="h-5 w-5 text-status-stable" aria-hidden="true" />
        </span>
        <h2 id="tour-complete-title" className="mt-2 text-base font-extrabold text-ink">
          HealthFlow Tour Complete
        </h2>

        <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-slate-450">
          You saw risk detected, explained, rebalanced, stress-tested, and turned into an executive
          response — every number from the same synthetic demo dataset and the same calculation engine.
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={onRestart}
            className="rounded px-3.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Restart Tour
          </button>
          <button
            onClick={onExplore}
            className="rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark"
          >
            Explore Freely
          </button>
        </div>
      </div>
    </div>
  );
}
