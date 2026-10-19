# ADR 016 — The boot is a state machine, and work has a place in it

Status: **Accepted** — 2026-10-19 (proposed 2026-10-16). Migration steps 1–4 done; `gsap`
removed. The work rule runs through `intro-draw/workScheduler.ts`, stepped by the frame loop;
the city is two units: its files are read ahead as `network` work from `shrink`
(`murcia/assets/cityBytes.ts`), and its parse, decoding and assembly are one `main` unit at `site`. Deferred work never starts in `draw`, and `site` starts one
main-thread unit per frame until the slice budget is decided.
Amends: DECISIONS §26.3 (who owns time). Would amend: §33 ("the lever is fewer bytes, not
rescheduling"). Keeps: ADR 007, DECISIONS §26.4, §26.5, §26.8, §26.16, §26.20.

## Context

Visitors still describe the opening as stuttering: in the drawing and in the warp. On
2026-10-16 the opening was measured end to end. The set-up was a production build, headless
Chromium on a desktop GPU with ANGLE D3D11 and `KHR_parallel_shader_compile` present, and the
CPU throttled 4× as a mid-range phone. The figures are frame intervals from rAF, Long Animation
Frame entries, and a CPU profile attributed against an unminified build of the same commit. The
Traces recorded on a real Xiaomi Pad 5 the day before show the same pattern.

| Stretch | fps | Frames > 50 ms | Worst | Main-thread work inside those frames |
|---|---|---|---|---|
| P0 `draw` (0.1–3.9 s) | 35 | 11 (1.43 s) | 283 ms | React + R3F mount; WebGL context; first program links (~176 ms); brand atlas raster and readback (~250 ms); sky upload (~105 ms); `samplePath` before the first paint (177 ms) |
| P1–P2 `shrink` + `warp` (3.9–7.7 s) | **39** | **8 (1.28 s)** | **317 ms** | **The city.** Draco/GLTF results arriving through `postMessage` (~380 ms), the river frame (`pointSegmentDistance`, ~240 ms), the campus SVG mask readback (~76 ms), then `MurciaExperience.warm()` (program links ~190 ms, uploads ~70 ms) |
| P3–P5 `swap` → `orbits` (7.7–13.6 s) | 57 | 3 | 145 ms | Satellite and orbit reveal, mostly clean |
| `site`, idle | 56 | 3 | 100 ms | — |

Two findings matter more than any single number.

**1. Covering the screen does not hide work.** §33 records that the intro's stalls are
"required work, deliberately placed" while the drawing covers the screen. The placement is
right, but the cover does not work: the drawing is an SVG animated by `requestAnimationFrame`
on the **same main thread** as the work. Every long task freezes the stroke the visitor is
watching. Bytes are not the lever either. The whole of `three` compiles off-thread (streamed),
and evaluating it with the scene chunk costs 27 ms at 4×.

**2. Moving work without a rule moves the stall.** §33 took the city out of P0 and started it
at `__vertigoIntro.completed`, the end of the drawing. That instant is the start of `shrink`
and `warp`, the most motion-sensitive three and a half seconds of the site. The city's build
now lands there. Nobody chose that: it fell out of picking an event that happened to be
convenient. The next feature added to the opening will make the same kind of choice, with
nothing to check it against.

### Why there is nothing to check it against

The opening's sequence is real, but no single place owns it. Today:

| Concern | Owner | Mechanism |
|---|---|---|
| What has loaded; whether the scene can be shown | `intro-draw/bootState.ts` | Manifest of 8 steps, weighted and required/optional; `starting → loading → ready`, or `fatal` |
| P0's pace and ending | `intro-draw/playhead.ts` + `introDraw.ts` | Pure policy on a progress axis; local flags `quiet`, `holding`, `done`, `noticed` |
| P1–P5 and their order | `useMasterTimeline.ts` | `gsap` timeline: labels, `call()`s, tweens on proxy objects. Three variants: first visit, returning visitor, reduced motion |
| The phase React sees | `useMasterTimeline` → `setPhase` | `Phase` in React state, compared through `PHASE_ORDER` (§26.1) |
| The 3D logo | `corner-logo/logoMotion.ts` | Own machine `hidden → spinning → toCorner → idle`, own clock, started by a `call()` |
| Orbit reveal | `state.orbitsStarted` | Flag written by the timeline, read per frame |
| Swap legality | Timeline `onUpdate` | Polls `cornerLogo.isReady()` every frame of the swap (§26.8) |
| The city | `MurciaLayer.tsx` | `await intro.completed`, then load and warm |
| Warp-pass warm-up | `RenderPipeline.tsx` | On mount, outside the manifest |
| Hidden tab | Three separate guards | `introDraw`, the master timeline and the warp each keep their own |

### The opening as it runs today

What follows is reconstructed from the code, not from intent. Durations come from
`introConfig.ts`, `drawConfig.ts` and `orbitRevealDuration()`.

| State | Entered on | Left on | Duration | On screen | Time owned by | Work started here or still running (measured) |
|---|---|---|---|---|---|---|
| `draw` | Boot script evaluates | Fill completes: readiness `ready`, plus the minimum duration and the ending gesture (§26.20) | ≥ 3.0 s; `fatal` holds here with the failure caption; 45 s deadline (ADR 007) | 2D SVG mark and caption; scene canvas behind it | Playhead, on visible time | Every required step, the satellites (optional), the warp-pass warm-up |
| `draw` (quiet) | Same, returning visitor | `ready` (no minimum), or a 6 s grace / `fatal`, which reveals the drawing | — | Nothing | Playhead | Same |
| `shrink` | `drawComplete` → `master.play('shrink')` | Tween ends | 0.8 s | 2D mark shrinking over the stars | gsap | **City load starts here** (`intro.completed`) |
| `warp` | Timeline | Tween ends | 2.6 s | Starfield leg, FOV surge, blur; 2D mark blurred by CSS | gsap | City: GLB, river frame, campus, `warm()` |
| `swap` | Timeline | Tween ends | 0.7 s; substitution at 0.45, **only if** the logo model is ready, otherwise the 2D mark holds | Scale-through-zero crossover and flash | gsap | City, if it is still going |
| `corner` | Label `swap + 0.7 × 0.55` | Label | 0.15 + 2.0 s | 3D logo pausing, then spinning, at centre | gsap holds the span; the logo runs on its own clock | — |
| `orbits` | Label | Label `site` | max(1.2 s, reveal) | Logo flying to the corner; orbits drawing in | gsap holds the span; the reveal is per frame | — |
| `site` | Label | — (rest) | — | Chrome mounts, consent banner (§26.16, §35) | Ambient clocks from `useFrame` | Navigation waits on `murciaReady` and `site` |

Variants: reduced motion jumps from `draw` to `site`. A returning visitor goes from the quiet
`draw` to `shrink`, then `swap` without the warp, then `corner`. Debug `replay`/seek rewinds the
draw and the timeline. A hidden tab pauses the drawing's clock and the timeline separately.

## Decision (proposed)

**1. One machine owns the opening's discrete state; clocks own the motion inside it.**

The machine is a pure transition function, `next(state, event) → state`, with plain,
serializable events: steps reported, fill complete, phase elapsed, logo ready, tab hidden or
visible, replay, deadline. It holds no curves and runs no per-frame logic. In-phase motion
(shrink scale, warp progress, flash envelope, reveal) is driven by clocks that walk 0 → 1 and
are stepped by the frame loop. `utils/transitionClock.ts` already does this for the Earth ⇄
Murcia warp.

- **No library.** The shape is a reducer. XState would put tens of KB back into the initial
  closure that `aab6a3b` (the three catalogue) just lowered and froze.
- **Not React state.** The machine exists before React does, and it must step without a commit.
  React subscribes to discrete changes only, which is what `setPhase` is today (§26.2 holds).
- **Dependency-free, like the boot entry (§26.4).** It shares `bootState`'s cross-chunk
  arrangement: one instance on a global key, created by the boot entry and adopted by the app.
  A value import shared between the two entries would hoist a chunk, and the build already
  fails on that.
- **Serializable on purpose.** That is what lets item 3 put a worker on one side.

**2. Two regions run in parallel, and one rule connects them.**

- *Presentation*: `draw → shrink → warp → swap → corner → orbits → site`, with the variants
  above. These are the existing `Phase` names: §26.1's ordering and every consumer keep working.
- *Work*: what is being prepared. Each unit of work is declared with its kind: network only,
  off-thread (worker decode), main-thread CPU, or GPU (an upload or a program link). **A program
  link counts as main-thread work**: the link-status query blocks, measured at 86–100 ms per
  batch even with `KHR_parallel_shader_compile`.

**The rule: every presentation state declares how much main-thread work it admits, and the
scheduler starts nothing that the current state does not admit.**

| Presentation state | Admits | Why |
|---|---|---|
| `draw`, with the drawing off the main thread (item 3) | Everything | Nothing on the main thread is visible |
| `draw`, with the drawing on the main thread (today) | Everything, as now | Unchanged until item 3 lands |
| `shrink`, `warp`, `swap` | Network and off-thread only. Results queue; nothing completes on the main thread | The most motion-sensitive part of the site |
| `corner`, `orbits` | Network and off-thread only | Focal 3D motion: the logo spin and the orbit draw-in |
| `site` | Main-thread work in slices of a fixed per-frame budget | At rest, but still animating and interactive |

The guards that exist today become explicit transitions: `draw → shrink` requires the required
steps (§26.5); the substitution in `swap` requires the logo (§26.8); navigation requires `site`
and the city (§26.16, `canNavigate`).

**3. The drawing moves off the main thread.**

P0 is drawn into an `OffscreenCanvas` owned by a worker. `playhead.ts` moves unchanged: it is
already pure and dependency-free. The main thread posts progress and readiness; the worker
keeps animating on its own rAF with the last values it received, so a 300 ms main-thread stall
no longer freezes the stroke. The P1–P3 scale and blur on the 2D mark stay CSS transforms and
filters on the canvas element, which run on the compositor. The SVG drawing stays as the
fallback where a worker cannot draw.

**4. Consequence for the city.** Under the rule above, the city's main-thread parts cannot run in
`shrink` through `orbits`. Its bytes can be fetched and Draco-decoded in workers from P0 on. Its
main-thread completion (geometry assembly, the river frame, the campus mask, `warm()`) runs in
`site`, sliced. Separately, the work itself can shrink: the river frame and the campus mask are
pure functions of static assets and could be computed at build time.

## Alternatives considered

- **Keep the timeline and only reschedule the city** (e.g. to `site`). It fixes today's worst
  stretch for little code, and it is the obvious first patch. It is also exactly the move §33
  made, which shifted the stall from P0 into P1–P2. Without a rule there is nothing to stop the
  next placement from doing the same. Worth doing as a step inside this ADR, not instead of it.
- **XState or a similar library.** Visualisation and tooling for free, at a dependency and bytes
  cost in the one closure this project budgets hardest. The machine has about a dozen states;
  a reducer and a table test (the `playhead.test.ts` style) cover it.
- **`useReducer`.** Ties every transition to a React render and commit (the React scheduler
  measured 104–165 ms tasks during P0). It also cannot exist before the app chunk does, and
  the drawing starts before that.
- **Compositor-only animation for the drawing** (WAAPI on transform and opacity). Immune to the
  main thread, but a stroke drawn by dash offset is not a compositor property. It would change
  what the drawing looks like, and the drawing is approved as it is.
- **Fewer bytes.** Measured, and not the cause: see Context, finding 1.

## Trade-offs

- **The city is ready later** after a first visit, by roughly its main-thread cost spread over
  `site` slices. Nothing reachable waits, because navigation already requires `murciaReady`. But
  the navigation control is enabled later than today, and that interval has to be measured.
- **Canvas versus SVG.** Antialiasing and line caps can differ. The worker path needs a
  side-by-side visual check against the current drawing, the `boot.spec.ts` luminance guard,
  and a fallback.
- **`gsap`.** Once the phases are on the machine and the motion on clocks, the timeline has
  nothing left to do. Removing it (~60 KB, ~20 KB brotli; one rAF ticker fewer; no lag-smoothing
  jumps after a long frame) would reverse the intro half of §26.3. That is a separate, explicit
  decision.
- **One more concept.** Today a reader follows a timeline top to bottom; after this, a table of
  states plus a set of clocks. The table is the part this ADR argues is missing.

## Migration, in order, each step measured before and after

1. Write the machine as a pure module with the table above as its test, and change no behaviour:
   drive it from the existing events and assert that it agrees with the timeline.
2. Put the work rule in front of the city: queue its main-thread completion until `site`. This
   is the largest measured stall and the smallest change.
3. Draw P0 in the worker, with the SVG fallback.
4. Move P1–P3 from the timeline to clocks, phase by phase. Decide about `gsap` then.

## Open questions

- The per-frame budget for `site` slices, and whether a slice may include one program link,
  which cannot be split.
- Whether the satellites (optional, needed at P5) can always finish before `orbits` on a slow
  link. §33 left this open, and the rule makes it a declared deadline rather than a hope.
- iPhone: `OffscreenCanvas` 2D in a worker needs iOS 16.4 or later. Confirm on the reference
  device.
