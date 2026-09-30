import type { RiskFactor } from '../types';

const pct = (n: number) => `${Math.round(n)}%`;

/** Six weighted factor bars backing the "Why?" step of the demo script. */
export function FactorBars({ factors }: { factors: RiskFactor[] }) {
  return (
    <ul role="list" className="space-y-2.5">
      {factors.map((f) => (
        <li key={f.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-ink">{f.label}</span>
            <span className="tabular text-slate-450">
              {pct(f.value)} <span className="text-faint">|</span> ×{f.weight.toFixed(2)} ={' '}
              <span className="font-semibold text-ink">{f.weighted.toFixed(1)}</span>
            </span>
          </div>
          <div
            className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={`${f.label}: ${pct(f.value)} pressure, weight ${f.weight.toFixed(2)}, contributes ${f.weighted.toFixed(1)} points`}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, f.value))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
