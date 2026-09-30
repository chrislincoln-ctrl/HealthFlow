import type { ReactNode } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  /** Numeric values count up gently on load (skipped under reduced motion). */
  animate?: boolean;
  unit?: string;
  detail?: string;
  tone?: 'neutral' | 'critical' | 'warning' | 'positive' | 'accent';
  icon?: ReactNode;
  /** Optional data-tour anchor for the guided demo tour. */
  dataTour?: string;
}

const TONE_RING: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'border-line',
  critical: 'border-status-critical/40',
  warning: 'border-status-watch/40',
  positive: 'border-status-stable/40',
  accent: 'border-accent/40',
};

const TONE_VALUE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'text-ink',
  critical: 'text-status-critical',
  warning: 'text-status-watch',
  positive: 'text-status-stable',
  accent: 'text-accent-dark dark:text-accent-light',
};

export function KpiCard({ label, value, unit, detail, tone = 'neutral', icon, dataTour, animate }: KpiCardProps) {
  return (
    <div data-tour={dataTour} className={`rounded-lg border bg-surface p-3 shadow-panel transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${TONE_RING[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-450">{label}</p>
        {icon && <span className="text-slate-450">{icon}</span>}
      </div>
      <p className={`tabular mt-1 text-xl font-bold leading-tight ${TONE_VALUE[tone]}`}>
        {animate && typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        {unit && <span className="ml-0.5 text-xs font-medium text-slate-450">{unit}</span>}
      </p>
      {detail && <p className="mt-0.5 text-[11px] leading-snug text-slate-450">{detail}</p>}
    </div>
  );
}
