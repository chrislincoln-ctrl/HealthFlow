import { useId } from 'react';

/**
 * The HealthFlow heartbeat mark: a seamless scrolling ECG waveform inside a
 * clipped 24-unit viewport. Two identical 12-unit tiles translate by exactly
 * one tile width per cycle (.ecg-track in index.css), so the loop never jumps.
 * Only the white line moves — this component is transparent to the surface
 * behind it, so the teal square it sits on stays static.
 *
 * useId keeps the clipPath id unique per instance (header + footer render
 * two copies of the same SVG in one document).
 */
export function EcgMark({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <clipPath id={clipId}>
        <rect x="0" y="0" width="24" height="24" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g className="ecg-track">
          <path
            className="ecg-line"
            d="M0 12 H2.6 l0.5 -0.9 0.5 0.9 H4.8 L5.6 6.2 6.4 17.2 7.2 12 H9.4 l0.5 -0.9 0.5 0.9 H12 M12 12 H14.6 l0.5 -0.9 0.5 0.9 H16.8 L17.6 6.2 18.4 17.2 19.2 12 H21.4 l0.5 -0.9 0.5 0.9 H24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}
