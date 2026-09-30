# Brag Plan: HealthFlow

## What is this app?
HealthFlow is a predictive healthcare supply-chain command center for a 23-district West Bengal network (6 fully modeled) that detects medicine stock-out risk, explains the root causes, forecasts demand, optimizes multi-source redistribution, measures network resilience, and drafts the executive policy brief.

## The angle
A quiet, confident "infrastructure that works" film: one real shortage — Nadia's ORS line, 5,460 units, cover 5.0 days, CRITICAL 57 — travels the product's own 8-stage loop (OBSERVE → UNDERSTAND → PREDICT → OPTIMIZE → ACT → SIMULATE → REPORT → SCALE) and comes out the other side as a plan and a policy brief. Every number on screen is engine-verified demo data. No hype words; the workflow is the flex.

## Hook (first 2-3 seconds)
The isometric dark-green network artwork (src/assets/login-network.png) fills the frame; one node pulses CRITICAL red and a badge locks in: **NADIA · CRITICAL · 57**. Over it, the hook line: **"Five days before the shelves empty."** (authored line — five days is the engine's real stock-out projection for the line). The map-eyes-first moment earns the next 20 seconds.

## Key moments (the middle)
- Root-Cause Explorer factor bars grow one by one — "every bar is a visible input" (six weighted factors behind the 57).
- Demand Intelligence chart draws: history → dashed purple forecast → red depletion path crossing the dashed reserve threshold, labeled "projected stock-out +5d".
- The multi-source plan lands: **Hooghly 2,500u + Kolkata 1,600u — 2 sources** (from ORS surpluses of 8,700u and 6,900u), flipping **cover 5.0d → 8.0d**.
- Resilience index ticks **70 → 71** as the plan applies (SIMULATE/ACT payoff).

## Outro / punchline
The executive artifact: a "HealthFlow Executive Policy Brief" panel ("1 critical district · 10.1M residents affected") — detection turned into leadership-ready prose. Then the name card: **HealthFlow** + tagline **"Predict shortages. Move resources. Protect care."** Music fades to silence after the tagline (polished law).

## User flow worth showing
Entry: Command Center map flags Nadia CRITICAL → key action: the Redistribution Engine builds a 2-source transfer and it is applied → result: cover 5.0d→8.0d, resilience 70→71, and the Executive Policy Brief generated. The loop-strip kicker (OBSERVE · UNDERSTAND · PREDICT · OPTIMIZE · ACT · SIMULATE · REPORT · SCALE) lights up stage by stage across the video — SIMULATE is represented by the resilience measure ticking as the intervention applies.

## Tone
- Preset: polished
- Creative direction: "premium hackathon showcase — the quiet confidence of infrastructure that works"
- Interpretation: 4 long scenes, slow crossfades (0.6-0.8s), restrained motion, third-person product claims, real numbers instead of adjectives; let the data be loud so the edit can be calm.

## Format: landscape — 1920x1080
## Duration: 22.5s

## Visual identity (from the project)
- Background: #0E301E (brand chrome-dark deep green; hero + outro), app panels #111C21 on #0B1114 canvas, hairlines #26363D
- Accent: teal #0E7C7B (text-safe light variant #5FA8A7), corridor glow #37C0BB; AI/forecast purple #6A00F4 (light variant #9B4DFF on dark)
- Status: critical #C53030 (map/node red reads #E05252 on dark), watch #E2A33C; peach #FFD6A5 for the human note
- Text: #F4F7F5 primary, #A8B7B0 muted (dark theme tokens)
- Display font: Inter Variable, extra-bold, tight tracking; tabular numerals for all metrics
- Body font: Inter Variable, regular
- Strongest visual element: src/assets/login-network.png — isometric facilities, glowing nodes and a courier on a deep-green map (use as hero backdrop and echo in outro)

## Share copy (draft)
Introducing HealthFlow: predictive supply-chain command for a 23-district health network — it flags a stock-out five days out, moves stock from two sources, and drafts the executive brief. Built with React + Vite and a deterministic calc engine.

## Audio direction
- Role: warm steady bed + sparse professional accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (steady, clean — the polished/cinematic pick)
- Music treatment: starts at 0s, volume ~0.32, short fade-in; holds under the whole film; fades out over the final ~1s so the tagline lands into silence
- Music cue guidance: bundled preset read (assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.md), tempo ~110 BPM. Strong-cue locks: **8.74s** ("projected stock-out +5d" label), **13.11s** ("cover 5.0d → 8.0d" payoff), **17.47s** (executive brief panel entrance). 22.93s sits past the cut — unused. Beat grid ≈0.55s apart for small entrances; sequential TEXT items snap to every other beat so lines stay readable.
- Audio-reactive treatment: subtle; music RMS/bass breathes the hero map glow, corridor line brightness, and panel presence. No waveform/equalizer visuals.
- SFX posture: sparse (3 cues max, low HF-risk files): soft drop on the factor-bar stagger, one soft low bell at the 8.74s stock-out label, one warm soft-impact under the final name card. SFX on track indexes above the music bed.
- Audio-coupled moments: factor bars + card slides (gesture-matched), counter tick 70→71, brief panel rise, final logo.
- Restraint rule: no aggressive hits, no per-beat SFX, nothing that outshouts the numbers; never let sound cue text off screen before it can be read.

## Storyboard

### Scene 1 — The map knows first — 4.5s
Full-bleed login network artwork (real asset) on deep green #0E301E, slow 1.04→1.0 settle. A node on the Nadia position pulses critical red; badge "NADIA · CRITICAL · 57" locks in beside it. Hook line fades up beneath: "Five days before the shelves empty." Loop-strip kicker appears at the bottom, OBSERVE lit.
Sequential/interaction: yes — badge locks in, then hook line rises (two staggered entrances).
Audio intent: establish calm control; the bed starts, nothing flashy.
Audio-coupled idea: node glow breathes with music RMS (subtle audio-reactive).
Music: vol-12 from 0s.
Transition mood: soft crossfade (0.7s) → Scene 2

### Scene 2 — Understand, then predict — 5.5s
Split panel on dark app chrome. Left: "Root-Cause Explorer" — three weighted factor bars grow in sequence (supply coverage, demand growth, logistics), caption "Every bar is a visible input." Right: Demand Intelligence chart draws left-to-right — solid history line, dashed purple forecast, red depletion path — and the dashed reserve threshold is crossed; label lands "projected stock-out +5d" (beat-locked 8.74s). Kicker: UNDERSTAND → PREDICT lit.
Sequential/interaction: yes — factor bars stagger in, then the chart line draws, then the label lands.
Audio intent: quiet build; small drop accents as bars arrive.
Audio-coupled idea: chart draw ends exactly as the label locks on the strong cue.
Music: continues.
Transition mood: soft crossfade → Scene 3

### Scene 3 — Move resources — 6.6s
"Redistribution Engine" header. Two source cards slide in one by one over a mini corridor map (teal corridors): **HOOGLY 2,500u** and **KOLKATA 1,600u**, with a confirm chip "2 sources · 4,100u". The payoff locks on the strong cue: **cover 5.0d → 8.0d** (beat-locked 13.11s). Then the plan applies: an "Apply plan" chip clicks in (ACT lit), the resilience counter ticks **70 → 71** as SIMULATE lights on the kicker. Kicker: OPTIMIZE → ACT → SIMULATE lit.
Sequential/interaction: yes — two cards slide in sequentially (card-gesture), apply chip simulates a click, counter ticks up.
Audio intent: the centerpiece — motion carries it; let the cover payoff land on the strong cue with no added hit.
Audio-coupled idea: counter tick at 70→71 synced to the apply; card slide sound matched to gesture.
Music: continues.
Transition mood: soft crossfade → Scene 4

### Scene 4 — The executive response — 5.9s
A document panel rises: "HealthFlow Executive Policy Brief" with the situation line "1 critical district · 10.1M residents affected" and one highlighted recommendation row (ORS → Nadia). At ~17.4s the panel is fully settled (near strong cue 17.47s). Crossfade to the outro card at ~19.9s: name mark **HealthFlow** + tagline **"Predict shortages. Move resources. Protect care."** Music fades to silence; hold the card to 22.5s.
Sequential/interaction: yes — brief panel rises, then highlighted row; logo settles last.
Audio intent: resolution; brief arrival near cue, then quiet.
Audio-coupled idea: warm soft-impact under the name card only.
Music: fade out ~21.5–22.5s.
Transition mood: slow crossfade, then stillness (silence after outro)

**Sum: 4.5 + 5.5 + 6.6 + 5.9 = 22.5s** ✓ (15–25s window)

**Music mood for this video:** steady, clean, quietly confident (polished)
**Audio summary:** one low-key business bed under all four scenes with three sparse low-risk accents, fading to silence after the tagline.

## Notes
- Forecast is statistical (weighted moving average + trend + weekly seasonality, 80% interval) — never call it "AI"; "AI" applies only to the LLM-written brief prose.
- All figures are from the demo dataset (Census of India 2011 populations; synthetic PHC network). Numbers verified against src/data/districts.ts and the engine outputs.
- Poster: extracted at 13.6s (Scene 3 settled payoff — source cards + "cover 5.0d → 8.0d" + "2 sources · 4,100 units") and baked as frame 0 of brag.mp4.
- Render: brag.mp4 — 22.5s, 1920×1080, h264+aac, `hyperframes check` 0 errors / 0 warnings / 90-90 WCAG AA before render.
