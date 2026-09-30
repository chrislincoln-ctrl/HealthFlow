# Hyperframes Composition Brief: HealthFlow — Hero Teaser

## Objective
Create an 18s premium cinematic brand teaser for HealthFlow, designed to be embedded in the
RIGHT HALF of the existing landing-page hero (a 1600x900 canvas that scales cleanly into that
region).

## Output
- Composition directory: `brag-output-2026-09-30-064123/composition/`
- Rendered video: `brag-output-2026-09-30-064123/brag.mp4`
- Format: landscape — 1600x900
- Duration: 18.0 seconds

## Source Material
- Project root: `C:\Health flow`
- Primary files read: `src/pages/Landing.tsx`, `src/index.css`, `src/components/EcgMark.tsx`, prior `brag-output/` composition
- Product name: HealthFlow
- Tagline: "Predict shortages. Move resources. Protect care."
- Key visual moment to recreate (abstractly, in the product's own language): the node-and-corridor
  network map — nodes, curved corridors, risk halo, traveling resource-flow paths, ECG mark.
- Copy that must appear verbatim:
  - "PREDICT SHORTAGES."
  - "MOVE RESOURCES."
  - "PROTECT CARE."
  - "HEALTHFLOW"
  - "Predict shortages. Move resources. Protect care."

## Creative Direction
- Tone preset: cinematic
- Creative direction: "premium cinematic healthcare technology brand film"
- Interpretation: slow camera drift, long holds, restrained type, soft transitions; the system
  THINKS and RESPONDS. Conceptual arc: RISK → INTELLIGENCE → RESOURCE FLOW → RESILIENCE.
- Hook: nodes breathe out of dark green fog (0–2s)
- Outro / punchline: HEALTHFLOW + triad tagline lock at 17.47s, then 0.5s fade for loop seam
- Avoid:
  - Doctors/hospitals/medicine bottles/stock footage
  - Dashboard screen recordings or app UI reproduction
  - District names (Nadia, Hooghly, Kolkata…), specific quantities, fabricated statistics,
    fake AI scores, or any implication of live government data
  - Glitch effects, frantic motion, excessive zoom, corporate motion-graphics feel
  - Text near extreme edges; clutter

## Visual Identity
- Background: #0b1114 → #14432A green atmosphere washes
- Text: #f4f7f5 (light) / #a8b7b0 (muted)
- Structure/healthy: #14432A, #37C0BB, #5CE0A1
- Risk: #C53030 / #E05252
- Intelligence accent: #6A00F4 → #9B4DFF violet (one moment only)
- Warm accent: #FFD6A5 peach (surplus nodes + "PROTECT CARE.")
- Display font: Inter Variable (assets/fonts/inter-var.woff2), weights 700–800, tight tracking
- Visual references: product's network map, ECG mark, triad color coding (green structure /
  violet intelligence / peach warmth)

## Storyboard (contract = brag-plan.md)
1. Atmospheric network reveal — 0–4.2s — nodes + corridor lines emerge from fog, no text
2. Risk emerges — 4.2–8.0s — red pulse + propagation; "PREDICT SHORTAGES." (in 4.6s, hold ≥2.4s)
3. Intelligence & flow — 8.0–12.4s — violet sweep, peach surplus, traveling teal paths;
   "MOVE RESOURCES." lands 8.74s
4. Stabilization — 12.4–15.4s — halo dissolves to healthy green; "PROTECT CARE." lands 12.6s
5. Brand resolution — 15.4–18.0s — constellation + ECG draw; HEALTHFLOW + tagline lock 17.47s;
   fade to dark 17.5–18.0

## Audio
- Audio role: cinematic support
- Audio arc: bed fades in with fog → holds low → fades out across 17.2–17.9 before loop seam
- Music: assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (already in assets)
- Music treatment: volume automation 0→0.3 over 0–0.8s, hold 0.3, 0.3→0 across 17.2–17.9
- Music cue guidance: preset read (vol-12 cues). Strong cues 8.74s, 17.47s. Cue locks:
  "MOVE RESOURCES." reveal at 8.74s; brand row lock at 17.47s (±0.15s).
- Audio-reactive treatment: subtle; pre-extracted RMS (assets/music/audio-data.js, already
  regenerated for 18s? NO — regenerate for 18s via the creative skill's extractor) breathes
  the ambient halo + flow-path glow only. No waveform/equalizer visuals.
- Audio-coupled moments:
  - Scene 2 halo bloom — drop_001 @ 4.6s (0.5)
  - Scene 3 sweep — bong_001 @ 8.3s (0.4)
  - Scene 5 brand lock — impactSoft_medium_001 @ 17.47s (0.5)
- SFX selection guidance: warm, low-HF-risk files only (impactSoft_medium_*, drop_001, bong_001);
  three accents total; none during phrase holds.
- Audio files: music + 3 SFX already copied into composition/assets/

## Hyperframes Instructions
Load domain skills (hyperframes-core/animation/creative/keyframes/cli) as instructed by /brag;
do not enter the hyperframes intent interview. Build ONE root composition in index.html
(1600x900, 30fps, 18.0s), GSAP timeline registered as window.__timelines["main"], seek-safe
patterns (dual-number reveals instead of counters; clip-rect reveals for dashed lines;
data-start/data-duration per scene; final 0.5s global fade). Text must pass WCAG contrast on
its background. All type inside a safe area with ≥72px internal padding. Run
`npx hyperframes check` in the composition dir and fix all errors before render.
