import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import { useTour } from './TourContext';

const STAGES = [
  'DETECT RISK — Command Center',
  'UNDERSTAND WHY — district risk + PHC drill-down',
  'PREDICT DEMAND — Demand Intelligence forecast',
  'OPTIMIZE REDISTRIBUTION — Redistribution Engine',
  'STRESS-TEST THE NETWORK — Simulator',
  'ACT — Action Center intervention lifecycle',
  'GENERATE THE RESPONSE — Policy Brief',
  'SCALE BEYOND THE STATE — Federated view',
];

/**
 * Shown FIRST when the user clicks DEMO TOUR. No route changes until
 * "Start Tour" is pressed; Cancel simply closes the modal.
 */
export function TourIntroModal({
  open,
  onStart,
  onCancel,
}: {
  open: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  const { setPhase } = useTour();

  useEffect(() => {
    if (open) startRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-chrome-dark/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-intro-title"
        className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-drawer"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-accent-wash dark:bg-accent/20">
            <Play className="h-4 w-4 text-accent-dark dark:text-accent-light" aria-hidden="true" />
          </span>
          <div>
            <h2 id="tour-intro-title" className="text-base font-extrabold text-ink">
              HealthFlow Operational Tour
            </h2>
            <p className="text-xs text-slate-450">
              Eight short stages through the full detect→predict→optimize→act→stress-test loop, using the synthetic demo dataset.
            </p>
          </div>
        </div>

        <ol role="list" className="mt-4 space-y-1.5 text-xs text-ink">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-baseline gap-2">
              <span className="tabular w-4 shrink-0 text-right font-bold text-accent-dark dark:text-accent-light">{i + 1}.</span>
              <span className="font-semibold">{s}</span>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-450">
          Use <kbd className="rounded border border-line px-1">←</kbd>{' '}
          <kbd className="rounded border border-line px-1">→</kbd> or Space to move between
          highlights, <kbd className="rounded border border-line px-1">Esc</kbd> to exit at any
          point.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs font-semibold text-slate-450 ring-1 ring-inset ring-line hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            ref={startRef}
            onClick={() => {
              setPhase('running');
              onStart();
            }
            }
            className="rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark"
          >
            Start Tour
          </button>
        </div>
      </div>
    </div>
  );
}
