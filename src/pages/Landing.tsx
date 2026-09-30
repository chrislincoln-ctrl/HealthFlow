import { Link } from 'react-router-dom';
import { Activity, Radar, LineChart, Truck, ArrowRight } from 'lucide-react';
import { DEMO_LABEL } from '../data/districts';
import { HeroTeaser } from '../components/HeroTeaser';

const PILLARS = [
  {
    icon: LineChart,
    title: 'Predict',
    text: 'A prototype demand forecasting model projects cover and stock-out dates from 7 weeks of synthetic history — up to 30 days ahead.',
    to: '/demand',
    cta: 'Open Demand Intelligence',
  },
  {
    icon: Radar,
    title: 'Detect',
    text: 'A weighted six-factor risk score ranks districts and medicines before shortages reach patients.',
    to: '/command-center',
    cta: 'Enter Command Center',
  },
  {
    icon: Truck,
    title: 'Act',
    text: 'Ranked surplus sources, transit times, and transfer quantities — with before/after proof the move works.',
    to: '/redistribution',
    cta: 'Run a redistribution',
  },
];

export default function Landing() {
  return (
    <div className="space-y-10">
      {/* Hero — light neutral, brand triad: green structure / purple intelligence / peach warmth.
          Desktop: copy left, cinematic teaser right (the right half is intentionally reserved
          for the teaser). Mobile: copy first, teaser stacks below at natural size. */}
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
        <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-center lg:gap-8">
          {/* Left column — the existing hero copy, unchanged. */}
          <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded bg-ai-wash dark:bg-ai/20 px-2.5 py-1 text-[10px] font-bold tracking-widest text-ai-dark dark:text-ai-light ring-1 ring-inset ring-ai/25">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai" aria-hidden="true" />
            PREDICTIVE HEALTH NETWORK INTELLIGENCE
          </span>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            <span className="text-chrome dark:text-chrome-50">Predict shortages.</span>{' '}
            <span className="text-ai dark:text-ai-light">Move resources.</span>{' '}
            <span className="rounded bg-peach/80 px-1.5 text-ink">Protect care.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-450">
            HealthFlow turns fragmented supply data into predictive operational intelligence —
            it watches the PHC supply network, projects where it is about to fail, finds the
            surplus that can close the gap, and recommends the move before the shortage hits
            patients.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/command-center"
              className="inline-flex items-center gap-2 rounded bg-chrome px-4 py-2.5 text-sm font-semibold text-white hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
            >
              Enter Command Center
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/simulator"
              className="inline-flex items-center gap-2 rounded px-4 py-2.5 text-sm font-semibold text-chrome ring-1 ring-inset ring-chrome/40 hover:bg-chrome-50 dark:text-chrome-50 dark:hover:bg-chrome-light/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
            >
              Run Emergency Simulation
            </Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-1.5 rounded bg-peach-wash dark:bg-peach/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-peach-deep dark:text-peach">
            {DEMO_LABEL} · NOT GOVERNMENT DATA
          </p>
          </div>

          {/* Right region — the cinematic teaser, occupying the intentionally
              empty right half of the hero on desktop; stacks below the copy
              on narrower screens without covering the CTAs. */}
          <div className="min-w-0">
            <HeroTeaser />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section aria-labelledby="pillars-heading">
        <h2 id="pillars-heading" className="sr-only">
          Three pillars
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <article key={p.title} className="flex flex-col rounded-lg border border-line bg-surface p-5 shadow-panel transition duration-150 hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-9 w-9 items-center justify-center rounded bg-accent-wash dark:bg-accent/20">
                <p.icon className="h-4 w-4 text-accent-dark dark:text-accent-light" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-sm font-bold text-ink">{p.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-450">{p.text}</p>
              <Link
                to={p.to}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-dark dark:text-accent-light hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {p.cta}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* One-line value strip — peach warm accent */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-peach/60 bg-peach-wash dark:bg-peach/15 px-5 py-4 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-peach/70">
            <Activity className="h-4 w-4 text-peach-deep dark:text-peach" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-ink">
            One loop, every screen: observe the network, understand the risk, predict the failure,
            optimize the move, act early, simulate the rest.
          </p>
        </div>
        <Link
          to="/command-center"
          className="inline-flex items-center gap-1.5 rounded bg-chrome px-3.5 py-2 text-xs font-semibold text-white hover:bg-chrome-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-ai"
        >
          Start observing
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
