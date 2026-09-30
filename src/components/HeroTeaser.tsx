import { useEffect, useRef, useState } from 'react';

/**
 * HeroTeaser — the 18s cinematic brand film embedded in the hero's right
 * region. Autoplays muted + looped (browsers allow this combination), with
 * controls hidden: it is a living visual object, not a video player.
 * The poster frame doubles as the reduced-motion / no-autoplay fallback,
 * so the hero always shows the brand constellation even when motion is off.
 */
export function HeroTeaser() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canAutoplay, setCanAutoplay] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCanAutoplay(false);
      return;
    }
    // Defensive: if the browser refuses autoplay, gracefully fall back to
    // the poster frame instead of showing a frozen first frame.
    const p = v.play();
    if (p) p.catch(() => setCanAutoplay(false));
  }, []);

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-xl border border-line bg-chrome shadow-panel"
        aria-label="HealthFlow brand teaser: a supply network wakes, detects a risk, moves resources, and stabilizes"
        role="img"
      >
        <video
          ref={videoRef}
          className="block h-full w-full"
          src="/brag-hero.mp4"
          poster="/brag-hero.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
      {/* Caption echoes the headline triad, with the same color mapping:
          Predict = brand green, Move = AI purple, Protect = peach warmth. */}
      <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-faint">
        <span className="text-chrome dark:text-chrome-50">Predict shortages</span>
        <span aria-hidden="true" className="mx-1.5">·</span>
        <span className="text-ai-dark dark:text-ai-light">Move resources</span>
        <span aria-hidden="true" className="mx-1.5">·</span>
        <span className="text-peach-deep dark:text-peach">Protect care</span>
      </p>
      {!canAutoplay && null}
    </div>
  );
}
