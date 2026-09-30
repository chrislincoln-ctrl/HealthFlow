import type { RiskBandName } from '../types';

// Status vocabulary is always text + color, never color alone.
const BAND_STYLES: Record<RiskBandName, string> = {
  stable: 'bg-status-stable/10 text-status-stable ring-status-stable/30',
  watch: 'bg-status-watch/10 dark:bg-status-watch/20 text-status-watch dark:text-[#E8B45A] ring-status-watch/30',
  high: 'bg-status-high/10 text-status-high ring-status-high/30',
  critical: 'bg-status-critical/10 text-status-critical ring-status-critical/30',
};

const BAND_LABELS: Record<RiskBandName, string> = {
  stable: 'STABLE',
  watch: 'WATCH',
  high: 'HIGH',
  critical: 'CRITICAL',
};

export function bandLabel(band: RiskBandName): string {
  return BAND_LABELS[band];
}

export function StatusBadge({
  band,
  size = 'md',
}: {
  band: RiskBandName;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold tracking-wide ring-1 ring-inset ${pad} ${BAND_STYLES[band]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current`} aria-hidden="true" />
      {BAND_LABELS[band]}
    </span>
  );
}
