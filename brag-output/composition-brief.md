# Hyperframes Composition Brief: HealthFlow

## Objective
Create a short launch-style brag video for HealthFlow — a premium hackathon showcase of the predictive healthcare supply-chain workflow: detect risk → understand drivers → forecast → optimize multi-source redistribution → measure resilience → executive response.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 22.5 s

## Source Material
- Project root: `C:\Health flow`
- Primary files read: `src/index.css`, `tailwind.config.js`, `src/pages/Understand.tsx`, `src/pages/DemandIntelligence.tsx`, `src/pages/RedistributionEngine.tsx`, `src/pages/PolicyBrief.tsx`, `src/data/districts.ts`, `src/data/cachedBriefs.ts`, `src/components/LoopStrip.tsx`
- Product name: HealthFlow
- Tagline / strongest claim: "Predict shortages. Move resources. Protect care."
- Key UI or visual moment to recreate: the redistribution payoff (2 source cards + cover 5.0d → 8.0d) and the login network artwork hero
- Copy that must appear verbatim:
  - "Predict shortages. Move resources. Protect care."
  - "NADIA · CRITICAL · 57"
  - "projected stock-out +5d"
  - "Root-Cause Explorer" / "Every bar is a visible input."
  - "Redistribution Engine" / "HOOGLY 2,500u" / "KOLKATA 1,600u" / "2 sources · 4,100u" / "cover 5.0d → 8.0d"
  - "HealthFlow Executive Policy Brief" / "1 critical district · 10.1M residents affected"
  - Loop strip: "OBSERVE · UNDERSTAND · PREDICT · OPTIMIZE · ACT · SIMULATE · REPORT · SCALE"

## Creative Direction
- Tone preset: polished
- Creative direction: "premium hackathon showcase — the quiet confidence of infrastructure that works"
- Interpretation: 4 long scenes, slow crossfades (0.6–0.8s), restrained motion, third-person claims, engine-verified numbers instead of adjectives.
- Angle: one real shortage (Nadia ORS, 5,460u, cover 5.0d, CRITICAL 57) travels the product's 8-stage loop and comes out as a plan and a policy brief. The workflow is the flex; no hype words.
- Hook (first 2–3s): full-bleed login network artwork, Nadia node pulses critical red, badge "NADIA · CRITICAL · 57" locks in, hook line "Five days before the shelves empty." rises.
- Outro / punchline: executive brief panel → name card "HealthFlow" + tagline; music fades to silence after the tagline.
- Avoid:
  - Generic SaaS language ("streamline", "empower", "revolutionize")
  - Abstract filler visuals, waveforms, equalizer bars, particle noise
  - Calling the forecast "AI" (it is statistical; "AI" only applies to the brief prose)
  - Unrelated visual redesign — stay inside HealthFlow's palette and type

## Visual Identity
- Background: #0E301E (brand chrome-dark deep green — hero + outro); app panels #111C21 on #0B1114 canvas; hairlines #26363D
- Text: #F4F7F5 primary; #A8B7B0 muted
- Accent: teal #0E7C7B (text-safe dark-bg variant #5FA8A7), corridor glow #37C0BB; forecast purple #6A00F4 (dark-bg variant #9B4DFF)
- Status: critical #C53030 (node red on dark reads #E05252), watch #E2A33C; peach #FFD6A5 (text-safe deep variant #8A520B on light washes — on dark use #FFD6A5 itself for the human note)
- Display font: Inter Variable, 800 weight, tight tracking, tabular numerals for metrics
- Body font: Inter Variable, 400/600
- Visual references from the project: login network artwork (`src/assets/login-network.png` — copy into composition assets), LoopStrip stage chips, FactorBars, demand chart (history solid / forecast dashed purple / depletion red), redistribution source cards, executive brief document panel

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The map knows first — 4.5s — network artwork hero, Nadia node pulse, badge "NADIA · CRITICAL · 57", hook line "Five days before the shelves empty.", OBSERVE lit
2. Understand, then predict — 5.5s — Root-Cause Explorer factor bars stagger in; demand chart draws and crosses reserve threshold; "projected stock-out +5d" (beat-locked 8.74s); UNDERSTAND → PREDICT lit
3. Move resources — 6.6s — two source cards slide in (HOOGLY 2,500u; KOLKATA 1,600u), chip "2 sources · 4,100u", payoff "cover 5.0d → 8.0d" (beat-locked 13.11s), apply click, resilience 70 → 71 counter; OPTIMIZE → ACT → SIMULATE lit
4. The executive response — 5.9s — executive brief panel rises (near cue 17.47s) with situation line + one highlighted ORS→Nadia row; crossfade to name card + tagline; music fades to silence

## Audio
- Audio role: warm steady bed + sparse professional accents
- Audio arc: bed enters at 0s and stays low; small drop accents on factor bars; one soft low bell at the 8.74s label; the 13.11s and 17.47s payoffs carry themselves; warm soft impact under the final name card; fade to silence ~21.5–22.5s
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (already copied into composition assets)
- Music treatment: data-start 0, data-volume 0.32, short fade-in, fade-out over the final ~1s so the tagline lands into silence
- Music cue guidance: bundled preset read at `.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.md` (tempo ~110 BPM; copy JSON+MD next to the track in composition assets). Strong-cue locks (±0.15s, `// beat-locked`): **8.74s** stock-out label, **13.11s** cover payoff, **17.47s** brief panel entrance. Beat grid ≈0.55s apart for small entrances (`// beat-grid`, ±0.10s); sequential TEXT snaps to every other beat. 22.93s sits past the cut — unused.
- Audio-reactive treatment: subtle — music RMS/bass breathes the hero map glow, corridor line brightness, and panel presence. No waveform/equalizer visuals, no strobing. If the audio-reactive extraction helper is unavailable or ffmpeg is missing, skip it and note that in the run log — do not block the render.
- Audio-coupled moments:
  - Scene 2 factor bars — soft drop accents matched to gesture
  - Scene 2 stock-out label — soft low bell at lock
  - Scene 3 card slides — card/drop sound matched to gesture
  - Scene 3 resilience tick — quiet tick at 70→71
  - Scene 4 name card — warm soft impact, then silence
- SFX selection guidance: 3 cues max, low high-frequency-risk files only (polished tone); align SFX to the start of the animation; never let sound pull text off screen before it is read
- SFX analysis guidance: `.agents/skills/brag/assets/sfx/sfx-analysis.md` (+ `.json` beside it) — prefer `impactSoft_medium_*` / `interface/drop_*` / `interface/bong_001` family for this tone
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume after the animation exists
- Audio files: music copied into `brag-output/composition/assets/music/`; Hyperframes copies its SFX picks into the same `assets/` tree

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (the login network artwork + the recreated panels above satisfy this)
- Keep all text readable in the final render (reading-time floors: short label ~0.8s settled; sentence ~0.3s/word min ~1.2s)
- Keep the video within 15–25 seconds (plan commits to 22.5s)
- Include the planned music/SFX layer
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, scene pacing, or the product story
- Major reveals may move toward nearby strong cues within ±0.15s (mark `// beat-locked`); smaller entrances may align to beats within ±0.10s (mark `// beat-grid`); use only the 1–3 strong locks named above
- Honor the music fade-out so the video ends in silence after the tagline
- When music is present and the treatment is not `none`, use the Hyperframes audio-reactive workflow to extract per-frame audio data and wire at least one visual element (subtle only)
- Use local assets for audio and any required runtime/media dependencies
- Run `hyperframes check` before render — it is brag's single gate; fix every error it reports (including WCAG contrast)
