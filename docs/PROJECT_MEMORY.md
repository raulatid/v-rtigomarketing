# Project Memory

Durable context for the VertigoSEO web experience: what this is, what exists, the numbers
that keep mattering, and what will bite you again.

It exists so none of this has to be re-derived. Keep it current.

Last updated: 2026-08-13 · §2, §6, §7, §8, §9, §10, §12 and §13 rewritten for the two-tier
test layer (plan 000). Earlier: 2026-08-11 · §2, §9, §10, §11 (23–36), §12 and §13 against the working
tree, post-`b418b5f`. The Vercel readiness re-audit is folded into §9, §10 and §12.

> **Scope.** Facts and traps. The *reasoning* behind binding decisions lives in
> `DECISIONS.md` and `adr/`; the *history* of how the code got here lives in
> `integration/00-migration-log.md`. When something here stops being true, change it — this
> file is worthless the moment it is stale, and its predecessors in the two source
> prototypes both rotted in exactly that way (`murcia-test/README.md` still describes a
> first-person controller that was deleted).

> **This is the only project memory.** The Murcia prototype kept a second one at
> `murcia/PROJECT_MEMORY.md`; on 2026-08-07 everything in it still true of the shipping code
> was folded in here and the file was deleted. Two documents with the same name made every
> bare `PROJECT_MEMORY §N` citation ambiguous — and the numbers scattered through `src/` all
> pointed at the *other* one. **Cite sections by title, never by number**, so a citation
> survives the next edit.

| | |
|---|---|
| 1 | [What this is](#1-what-this-is) |
| 2 | [Stack and commands](#2-stack-and-commands) |
| 3 | [How a frame works](#3-how-a-frame-works) |
| 4 | [Loading](#4-loading) |
| 5 | [The number that can hurt you](#5-the-number-that-can-hurt-you) |
| 6 | [Murcia's terrain edge](#6-murcias-terrain-edge) |
| 7 | [Murcia's navigation](#7-murcias-navigation) |
| 8 | [Murcia's district interaction](#8-murcias-district-interaction) |
| 9 | [Numbers worth knowing](#9-numbers-worth-knowing) |
| 10 | [How this repo verifies things](#10-how-this-repo-verifies-things) |
| 11 | [Things that will bite you again](#11-things-that-will-bite-you-again) |
| 12 | [State of the work](#12-state-of-the-work) |
| 13 | [Map of the code](#13-map-of-the-code) |

---

## 1. What this is

A single-page marketing experience for Vertigo, built as **two WebGL worlds inside one
application**:

- **Earth** — the intro (an isotype drawn stroke by stroke while the site loads), then the
  landing page itself: a globe with six orbiting satellites carrying case studies, a case
  panel and a lead-capture audit form.
- **Murcia** — a navigable 3D city: drag to pan and turn, click a lit district to fly to it
  and open its services panel.

You travel between them through a warp, driven by a sustained scroll/drag gesture on the
right-edge rail (`adr/009`) — the same gesture both ways. Nothing on the globe navigates:
the destination marker that used to be the way in was removed outright (2026-08-19, client
decision), and the warp aims at Murcia through `earth/navigation/destination.ts`, which is
data, not a scene object.

Converged from two working prototypes, both of which still exist and should be treated as
read-only reference:
`../starting-animation` (Earth) and `../murcia-test` (Murcia).

### Terminology

- **Experience** — a user-facing world. Earth and Murcia. A product concept.
- **Scene** — a `THREE.Scene`. There are exactly two, one owned by each experience.

Murcia's own docs say **environment** where this repo says **experience**; they mean the
same thing. What matters is that neither word is ever used to mean `THREE.Scene`.

---

## 2. Stack and commands

React 19 · `@react-three/fiber` 9.6 · **three 0.174** · gsap 3.12 · Vite 5 ·
TypeScript 5.6 · `vite-plugin-glsl` · stats.js

```
npm run dev            # dev server            (predev: content:build)
npm run build          # content + typecheck + unit tests + all six harnesses + vite build
npm run preview        # serve dist/
npm run check          # typecheck + unit tests + all six harnesses  ← run this
                       #   (precheck: content:build, so bad CMS content fails HERE)
                       #   CONTENT_SOURCE=sanity | fixture | seed selects the source
npm run content:build  # query Sanity, validate and emit src/content/generated/  (adr/010, adr/011)
                       #   THE SITE READS SANITY ONLY WHEN THIS RUNS. After publishing in the
                       #   Studio, run it again; Vite hot-reloads the regenerated module.
                       #   Deliberately not a watcher.
npm test               # Vitest, 706 assertions over the pure logic and the content build
npm run test:watch     # the same, watching
npm run test:coverage  # scoped coverage, thresholds enforced
npm run check:architecture # 19 assertions — the dependency directions, enforced
npm run check:navigation   # 52 assertions — drag feel, signs, bounds, grab-the-point
npm run check:footprint    # 8  assertions — every reachable distance against the skirt
npm run check:district     # 68 assertions — flights, the focus dolly, framing, materials
npm run check:warp         # 36 assertions — the camera envelope and the footprint sweep
npm run check:space        # 29 assertions — the star shell bound, clumping, the band
npm run e2e            # Playwright smoke, against `vite preview`. LOCAL, not a gate.
```

There is **no ESLint**, still deliberately — a stubbed `lint` script would be a gate that
does not exist. There **is** a test runner as of 2026-08-13: two tiers, described in §10.

**The dividing rule, and hold to it** — two tiers are worthless if nobody can tell which one
a new test belongs in:

> A **unit test** lives beside its module as `*.test.ts` and needs no scene.
> A **harness** lives in `checks/`, drives real Three.js objects across many frames, and is
> bundled with esbuild.

`vitest.config.ts` enforces the first half mechanically: `include` is
`['src/**/*.test.{ts,tsx}', 'content/**/*.test.ts']`, so nothing in `checks/` can be picked up by
the runner by accident.

**`content/` is the third home, and it is a unit tier, not a harness.** The Node-side content
build (mappers, validators, the generator) lives outside `src/` because it must never be bundled
for the browser — but it is ordinary testable code that needs no scene and no DOM stub, so it
belongs here rather than in `checks/`.

**Content is generated before the gate runs.** `precheck` runs `content:build`, which writes
`src/content/generated/` and then lets the existing invariant tests run over it. That ordering is
what makes `npm run check` the CMS validation gate — see `adr/010`.

---

## 3. How a frame works

One canvas. One `WebGLRenderer` (R3F's). One frame loop (R3F's).

```
useFrame priority 0   every simulation layer — cameras, rigs, orbits, Murcia's update()
useFrame priority 1   RenderPipeline  ← the ONLY thing that renders
useFrame priority 2   GeoMarkersLayer — CSS2D labels, after the camera is final
```

`RenderPipeline` per frame, unconditionally:

1. The active experience — Earth through the `EffectComposer`; Murcia direct (for MSAA), or
   through the composer while a warp plays (for the blur).
2. The corner logo, as an overlay pass with `autoClear = false` and an explicit
   `clearDepth()`.

**An early return in that callback is a blank canvas, not a missing effect.**

### Layer stack (z-index)

```
10  scene canvas (incl. the corner-logo overlay pass)
15  geo tags (CSS2D)
16  Murcia UI host (.murcia-ui)
20  the SVG intro drawing
35  case panel
40  warp overlay (the flash)
45  experience switch
```

`.murcia-ui` is full-viewport but `pointer-events: none`, with children opting back in.
Without that it would kill canvas drag for **both** experiences.

---

## 4. Loading

Three numbers, deliberately never derived from each other:

| | |
|---|---|
| **visual progress** | where the drawing is |
| **measured progress** | what has actually downloaded |
| **readiness** | whether the scene can be shown at all |

The boot manifest (`intro-draw/bootState.ts`) weights each resource and marks it required or
not. Required entries gate readiness; the rest only move the drawing.

```
chunk:scene       20  required
earth:textures    30  required
gpu:warmup        15  required
logo:assets       10  required
orbits:build      10  required
satellite:assets  15  not required
murcia:model      10  not required   ← prefetched during the intro
```

**The trap this design exists for:** with no measured progress, the autonomous floor still
carries the outline to the pre-ready limit and holds it there. The drawing can look nearly
finished while nothing has downloaded. Anything that reports to the user must read
**measured progress and readiness**, never the playhead. Observed: `visual=0.815` at
`measured=0.361`.

**How the playhead spends time** (DECISIONS 26.20, fixed 2026-08-17). Two rules, both of which
were broken in ways no unit test could see:

- The minimum duration is **three seconds of visible wall-clock time**. It used to accumulate
  `min(dt, maxDt)`, making it three seconds of frames under 50 ms — so the drawing stretched to
  8.57 s at 7 fps, which is the frame rate the intro actually boots at. What is rationed now is
  one frame's advance, adaptively against the recent cadence.
- The no-signal pace is a **uniform ramp with a constant slow tail**, not an exponential. The old
  curve ran at 0.326/s then 0.0001/s: it sprinted through the isotype and then appeared to freeze,
  which is both of the visitor complaints at once.

`playhead.test.ts` now varies the frame interval — every case used to step at a healthy 60 fps,
which is why a suite of eleven passing cases sat on top of this for months.

Captions (Spanish, in `intro-draw/introDraw.ts`): `Cargando experiencia` →
`Estamos preparándolo todo` (measured ≥ 0.5) → `Casi listo` (**readiness ready only**), with
`Esto está tardando más de lo habitual` past the notice threshold and
`No se pudo cargar la experiencia` on a hard failure.

### Warming is two operations, not one

Three uploads lazily, on first render, so a loaded-but-never-drawn world costs **no VRAM** —
CPU typed arrays only. That is exactly the requirement, and it defers the whole cost to the
worst possible moment: the first frame after activation would do the shader compile and the
buffer upload synchronously, mid-warp.

`compileAsync(scene, camera)` covers shader programs and textures. It does **not** upload
geometry attribute buffers. So `MurciaExperience.warm()` follows it with **one render into a
1×1 render target** — the smallest draw that still walks the whole visible graph, into a
target rather than the canvas because Earth is still on screen. 957 GPU-instanced buildings
arriving on the transition frame is the hitch this exists to avoid. See `adr/004`.

---

## 5. The number that can hurt you

**Murcia's camera must never reach further across the ground than it does at rest.**

The far edge of the visible ground sits at

```
d_far = cameraHeight / tan(effectivePitch − fov/2)
```

which **diverges** as the pitch drops. That divergence is the whole problem: small pose
changes produce enormous footprint changes, in a direction nothing on screen reveals.

For a long time the constraint was written down as *distance ≤ 165*, which is the same
statement only while elevation is held at 30°. Since ADR 006 the warp's departing leg rises,
and the proxy stops being sound in both directions: **180 @ 50° is safe, 200 @ 30° is not.**
Reason about the footprint, never about the distance alone.

Ground reach grows ≈**1.33 world units per unit of distance** *at a fixed elevation*. The
terrain skirt is sized for distance 165 at 30°, and the measured worst-case margin is:

| Viewport | Margin |
|---|---|
| 5120×1440 (ultrawide) | **+50 units** ← binding |
| 16:9 | +229 |
| Portrait | +306 |

So distance ≈200 puts the plate edge on screen **for ultrawide viewers only**, silently,
with nothing visibly wrong on a normal monitor. This has already shipped once: going
110 → 165 raised the ultrawide worst corner from +40 to **−89** — the plate edge was on
screen before any rotation work started, and nobody saw it.

Closer is **not** always safer either. Below ≈60 the fixed `lookAtHeight` (5.85) tilts the
camera up relative to the rig, the effective pitch collapses through the ~28° floor where
the bounds maths degenerates, and the footprint widens again. Below ≈23 the top frustum edge
crosses the horizon and the footprint is reported as the `maxGroundDistance` 800 clamp.

Two further consequences of the divergence, worth having in mind before touching the pose:

- **Lowering the camera recovers navigable area better than raising the angle.** At FOV 35,
  16:9: 30°/height 45 gives navigable Z 191 × X 124; 30°/height 70 gives 101 × 60.
- **Raising `lookAtHeight` tilts the camera up and widens the footprint**, because it lowers
  the *effective* pitch below the rig's elevation. That is the trade to watch when adjusting
  the view for looks.

The warp runs **165 → 75 → 165** arriving, and **165 @ 30° → 180 @ 50° → back** departing.
The rise is what pays for the recession: 180 @ 50° reaches ~227 against rest's ~478.

`npm run check:warp` asserts the real property rather than the proxy — §6 of that harness
runs the actual `computeGroundFootprint` over the actual `applyPoseToCamera` at 201 progress
samples × 24 azimuths × 4 aspects including 5120×1440 (19 296 poses), and fails on any
over-reach or any `clampedRays`. The per-leg distance bounds are kept as a cheap first line
of defence. **Nothing else guards this**, and this is the only check in the repo that
computes a footprint at all.

Any *resting* camera change — distance, elevation, `lookAtHeight`, FOV — still invalidates
the skirt margin itself and requires re-running the azimuth sweep, because §6 compares
against rest and would happily approve a pose that out-reaches the skirt as long as rest
out-reaches it too. It is a much larger job than it looks.

---

## 6. Murcia's terrain edge

The strict version of "never reveal the plate edge" would have left ~19% of the map
navigable at the pose that actually looks right. So the rule was inverted: **the skirt hides
the edge, and the bounds follow the content.** `boundsInset: 0` — the whole model is
navigable, at every azimuth, on every tested viewport, with the footprint term never
binding.

Two pieces, both in `experiences/murcia/environment/`.

**Collar** (`createTerrainTransition.ts` + `meshBoundary.ts`) — the exact difference between
the plate's real outline and its bounding rectangle, triangulated with
`ShapeUtils.triangulateShape` using the outline as a hole. Opaque, cloned material. It fixes
the background-coloured band that showed through the gap. Heights interpolate from the
plate's real edge height to the plate top.

`meshBoundary.ts` extracts boundary loops by welding vertices **by position** first. A GLB
splits vertices wherever normals or UVs differ, so raw index comparison reports every seam
as a boundary and the outline never closes.

**Skirt** — a rectangular fade continuing outward from the bounding rectangle.
`width: 700`, `fadeEndFraction: 0.21` (~147 units of visible gradient), `loops: 10`,
`segmentsPerSide: 12`, `fadeExponent: 1.6`, `innerOverlap: 0.5`, `verticalOffset: 0.05`.

### Decisions inside it

- **Fade alpha to zero rather than matching the background colour.** The renderer uses
  `ACESFilmicToneMapping`, but `scene.background` is written as an untone-mapped clear
  colour, so a mesh authored to the background value renders visibly darker. Alpha is not
  tone-mapped, and the problem disappears.
- **Nothing is coplanar with the plate.** The collar sits `verticalOffset` below the top and
  tucks `innerOverlap` under the outline.
- **The fade is rectangular, not coastline-following.** Offsetting a concave outline outward
  self-intersects wherever a feature is narrower than the offset, and the skirt reaches 600
  units on a 352-unit plate — nearly twice the plate itself. If the silhouette turns out to
  matter visually, the fix is a *bounded* offset — follow the outline for ~40 units, then
  blend to the rectangle — with a self-intersection guard.
- **Being a plate-aligned rectangle is what makes yaw expensive.** The viewport footprint
  turns; the skirt does not.
- **`fadeEndFraction` decouples gradient width from geometry width.** The skirt must *reach*
  far enough to stay out of frame; a gradient that wide would wash the horizon.

### Why the width is 700

Sized so that with `boundsInset: 0` — focus reaching the plate corners — the footprint lands
inside the skirt at **5120×1440**, the binding case, **at every azimuth**. Three things drove
it up from 380:

- **distance 110 → 165** spent the whole margin (see §5).
- **free yaw** costs a further 50–85 units on wide viewports, because the frustum footprint
  turns against a plate-aligned rectangle. Portrait barely notices (−4 to −6), its footprint
  being near-symmetric.
- **the zoom band**, last: at 600 the band ran out of margin at scale ≈1.09, so 600 → 700 is
  what pays for zoom-out. The table in §7 is the measurement.

`fadeEndFraction` fell 0.4 → 0.25 → **0.21** in step, holding the visible gradient near 150
units throughout — 147 today against the original 152.

> Corrected 2026-08-13. This section and §9 both still read 600 / 0.25 long after §7 recorded
> the widening to 700 / 0.21, so two sections of this file contradicted a third. The config
> is the arbiter: `murciaConfig.ts` says 700 and 0.21. Do not copy either number into a test —
> read them from the config, the way `checks/navigation-zoom.ts` does.

---

## 7. Murcia's navigation

### One gesture per thing

```
left button / one finger     pan the ground under the cursor, both axes, 1:1
right button / two fingers   rotate the rig horizontally about the focus, freely, 360°
wheel / pinch                dolly, within a bounded band
middle button                ignored
```

Pan is solved against the ground, not from pixels: both ends of the pointer's movement are
projected onto the navigation plane and the focus moves by the negated difference, so the
grabbed point stays under the cursor. Solving against the ground is what keeps sensitivity
consistent across the screen — a pixel near the horizon covers far more ground than one near
the bottom edge. Yaw is pixels→degrees normalized by viewport width, and touch feeds the
two-finger centroid through the same mapping so a turn costs the same fraction of screen on
either input. A *turntable* solve — yaw from the angle the grabbed point sweeps about the
focus — was tried on paper and rejected: its radius varies ~10× between the top and bottom of
the screen at this elevation, so sensitivity would depend on where the drag started.

Two-finger rotation is taken from the centroid's horizontal movement, **not** from the twist
angle, which is the more literal reading. At this elevation a twist maps to yaw at ~1:1, so
the involuntary twist in every pinch would turn the city constantly and with elevation fixed
there is nothing to absorb it. If user testing disagrees, the alternative to try is twist →
yaw with the centroid driving a two-finger pan.

Vertical rotation does not exist, and is absent rather than clamped: elevation stays at the
configured pose, so the footprint analysis §5 and §6 depend on continues to hold. That
matters more than it did — zoom made distance user state, so elevation is now the last pose
term the footprint maths can treat as constant.

### What this replaced, and why the old reasoning was sound

```
drag ↕   move forward / backward along the view direction
drag ↔   rotate the rig horizontally about the focus
left button, right button, one finger — all identical
```

No gizmo, no modifier, no button: with nothing else available a single pointer had to carry
both, so each screen axis owned one. **The cost was that strafing did not exist** — there was
no sideways pan at all. Free 360° yaw was supposed to pay for it: turn toward a place, then
advance. `translationGain` was 0.5, so even the axis that did translate deliberately let the
grabbed point slide behind the cursor, and that slide was where the weight came from.

Reported by real users as wrong, on three counts: dragging did not move the view where the
mouse went; there was no way to strafe; and rotation felt too fast — which it was, at 120°
per viewport width, but the compounding problem was that it rode the horizontal axis of
*every* drag and so fired constantly by accident. A gesture people enter by mistake reads as
twitchy at any sensitivity.

Keep this. The reasoning above is not wrong about its own constraints; it is what the design
looks like when a single pointer has to carry everything, and if a future change ever removes
the right button (a kiosk, a stylus-only device) this is the fallback it should return to.

### Drag feel — the judged numbers

> **Signed off 2026-08-06, first pass, no retuning needed**, then amended by the rework
> above. The original sign-off was a person driving the build and reporting the feel they
> were after; the amendment is real users driving the build and reporting it as wrong.
> Judgement supersedes judgement — the arithmetic had no vote either time.
>
> **A numeric argument is still not sufficient grounds** to change what is left, because no
> number here can see what was being judged.

| | during drag | after release | inertia | min | max |
|---|---|---|---|---|---|
| translation | **0.03** | 0.08 | **0** | 1.5 | 260 u/s |
| yaw | 0.09 | 0.08 | **0** | 1.5 | 90 °/s |

Both use `velocityBlend: 0.25`; `translationGain: 0.7`; `degreesPerViewportWidth: 60`;
`zoom.smoothingTimeConstant: 0.12`.

What moved, and what did not:

- **`translationGain` is 0.7, and it went back to being judged.** It moved 0.5 → 1.0 on user
  reports, then **1.0 → 0.7 by hand on 2026-08-13** — enough fidelity to read as dragging the
  map, enough shortfall to keep some weight. So the grabbed point is *deliberately* not under
  the cursor: it slides ~30% of the drag distance behind it, **by construction rather than as
  lag**. That distinction matters when reading the section below, which is about lag only.
  `?dragGain=1` gives exact grab-the-point for comparison, `?dragGain=0.5` the original.

  Found by the harness rather than by eye, and worth keeping for the process rather than the
  number: `check:navigation` had been failing §9 for two assertions while `npm run check`
  exited 0, because that harness cannot set an exit code (§10). §9 now asserts the *solve* at
  gain 1, where exactness is a definition, and asserts proportionality at whatever gain ships
  — so a re-judged gain does not require touching the harness again.
- **`smoothingTimeConstant` 0.09 → 0.03 is a consequence, not a choice.** These two are
  coupled and must move together. The 0.09 was affordable *only* because the latency
  objection is conditional — it applies while the ground is expected to track the cursor, and
  a gain of 0.5 had given that up. At gain 1 the condition fires: the lag shows as
  `dragSpeed × τ` of slide, ~25 world units at 0.09 on a fast pan, which is precisely the "it
  doesn't follow my mouse" complaint. Restoring one without the other gets the worst of both.
  **At 0.7 the coupling is partial**: the objection fires in proportion to the gain, so 0.03
  is now conservative rather than mandatory. It was left alone deliberately — the gain was
  re-judged, the time constant was not.
- **`degreesPerViewportWidth` 120 → 60 is re-opened**, and is a judgement again. Halved for
  two compounding reasons: rotation is entered on purpose now so it can afford to cost more
  travel, and the gestures carrying it have less usable travel than a primary drag — nobody
  right-drags across a whole screen, and two fingers run out of room sooner than one.
- **The `feel` time constants are otherwise unchanged** and remain judged.
- **The two axes are no longer deliberately matched.** They were matched because one gesture
  carried both and a difference in weight between them would read as a fault. That premise
  died with the split, which is why `?smooth=` now hits translation only and `?yawSmooth=`
  exists.

### Zoom is bounded by a measurement, not by a number

Cross-reference §6, "The number that can hurt you": `camera.distance` now has a *band* rather
than a value, which is exactly the kind of coupling that section exists to protect.

Zoom-in is free — pulling closer shrinks the ground footprint. **Zoom-out spends the terrain
skirt**, and spends it unevenly: the worst case is a wide viewport at an oblique azimuth, so a
ceiling a few hundredths too high is invisible on the 16:9 monitor it was chosen on and shows
the hard plate edge to an ultrawide visitor.

Slack (skirt width − worst corner reach − `edgeSafetyMargin`) over every aspect × azimuth:

| skirt \ scale | 1.00 | 1.10 | 1.20 | 1.30 |
|---|---|---|---|---|
| 600 | +42 | −3 | **−49** | −95 |
| 700 | +142 | +97 | **+51** | +5 |

So **at the shipped skirt width of 600, zoom-out ran out of margin at scale ≈ 1.09** — a 9%
dolly, not worth shipping. `terrainTransition.width` went 600 → 700 to pay for the band
(`fadeEndFraction` 0.25 → 0.21 in step, holding the visible gradient at ~147 units), which
puts full zoom-out at +51 — more cushion than the resting pose had before. The binding case
is 5120×1440 at yaw 30–120, exactly as recorded in §6.

`checks/navigation-zoom.ts` asserts this, and it asserts the strong form: the navigable area
must stay the **whole plate** at every scale, so zoom-out cannot quietly drag the focus toward
the plate centre. It also asserts `clampedRays === false` throughout, because a clamped ray
*under*-reports the footprint — the unsafe direction, and the failure §6 already records.

**`maxDistanceScale` is a measurement. Do not raise it without re-running that check.**

### Why the pan solve is immune to smoothing lag

The rendered focus trails its target — that is what the smoothing is — so it looks as though
grab-the-point must be solved against a stale camera and drift further out of register with
every move. It does not, and this is the thing a future reader is most likely to get wrong.

The camera sits at a **rigid** offset from the focus: elevation is fixed, and distance and yaw
are constant during a pan *because they belong to other gestures now*. So rendering at focus
F instead of target T translates the whole ray field by `T − F`, and the ground hit of a given
screen position translates by the same vector. Both ends of the delta are projected against
the **same** camera, so the offset appears in both and cancels in the subtraction. The delta
is exact in target space however far behind the render is.

The corollary is that per-move deltas telescope: any closed cursor loop returns the target
focus to its exact starting value, path-independently. §9 of `checks/navigation-feel.ts`
asserts both — at `translationGain: 1` the grabbed point lands within 1px of the cursor after
an L-shaped drag, and a 6-waypoint loop closes to within 1e-9.

**The gain is applied on top of an exact solve, and the two are not the same property.** At
the shipped 0.7 the point lands short on purpose; §9 asserts that the focus covers exactly
`gain` of the exact answer, which still catches an inverted sign, a dropped delta or a clamp
eating part of the drag. Everything in this section is about the *solve*, and holds at any
gain.

What the lag *does* cost is purely visual: `dragSpeed × smoothingTimeConstant` of slide while
moving. **The fix for that is the time constant, not the solve.**

An absolute-anchor solve (remember the world point grabbed at pointerdown, re-place it every
move) is equally exact in the interior and was rejected for the edges: it goes dead against a
wall, because the anchor keeps demanding a focus the clamp will not give, so pushing 200 units
past an edge means 200 units of nothing happening on the way back.

**This reverses the previous design, recorded because its reasoning is sound and was still
wrong.** It ran 0.05 / 0.30 / 1.1 s with no gain and 180°, on the argument that positional
lag during a drag reads as latency rather than mass — the grabbed ground slides out from
under the cursor — so weight belonged in the settle and the coast.

Tested by hand, that produced the two complaints that prompted the change: the view **kept
moving after the pointer stopped**, which reads as a loss of control rather than as mass;
and with no gain on a 1:1 ground solve the camera covered far too much ground per pixel from
83 units up, which felt quick and light. The latency argument also turns out to be
conditional — it holds only while the ground is *expected* to stay under the cursor, and a
gain of 0.5 has already given that up. That is what makes the longer 0.09 tracking constant
affordable, and it is where the smoothness now comes from.

Momentum is disabled by configuration, not deleted. `inertiaTimeConstant: 0` is honoured by
guards in `updateYaw` and `updateTranslation`, so `?inertia=` turns it back on for
comparison. `minInertiaSpeed` and `maxInertiaSpeed` are inert while it is 0.

**Some travel after release is unavoidable and is not inertia.** Smoothing leaves the focus
behind its target during a drag, so releasing has a catch-up to finish. It is bounded by
`dragSpeed × smoothingTimeConstant` and decays from the moment of release, where momentum
was bounded by `dragSpeed × inertiaTimeConstant` instead. On the same sweep: **8.7 units,
95% of it inside 0.25 s**, against **139 units over 3.4 s** before. §6 of
`checks/navigation-feel.ts` asserts that bound rather than a magic number — the first
attempt asserted "travel < 1 unit" and failed against correct code.

### Momentum must not survive a pointer held still

Velocity was originally sampled only in `pointermove`. A pointer held motionless produces no
events, so it kept whatever speed it last had: press, sweep, **pause**, release — and the
view flung on a gesture that had ended at a standstill.

Fixed with an explicit bleed in `update()`: after `POINTER_STILL_GRACE` (50 ms) without a
move, velocities decay with a 50 ms time constant. A genuine drag resamples every frame and
never decays.

**Unreachable at the shipped settings** — with `inertiaTimeConstant: 0` there is no coast
for a stale velocity to feed. The bleed is kept anyway, and §8 of the harness still
exercises it *with momentum re-enabled*, because `?inertia=` makes that path reachable at
runtime. Deleting it as dead code would be easy and rediscovering the bug would not be.

Behaviours worth preserving: grabbing mid-motion stops it; a tap never coasts; **a gesture
that ends at a standstill releases at a standstill**; the drag re-anchors when the 6 px
threshold is crossed so the first frame does not jump; smoothing is frame-rate independent
via `1 − exp(−dt/τ)`.

### Live tuning

`experiences/murcia/config/environmentQueryOverrides.ts` — `?dragGain=` `?yawDeg=` `?smooth=`
`?yawSmooth=` `?release=` `?inertia=` `?zoomMin=` `?zoomMax=` `?wheelZoom=` `?zoomSmooth=`,
applied by `MurciaExperience` after the `?model=` override so the two compose. Separate from
`appConfig`'s overrides because these are experience-scoped rather than shell-scoped.

`?dragGain=0.5&smooth=0.09` restores the pre-rework feel in one URL — the comparison most
likely to be wanted while reviewing it.

`?zoomMax=` is not like the others and warns when exceeded: it is the only parameter here
whose shipped value is a measurement rather than a judgement.

They exist because feel is a judgement no harness can make and an edit-rebuild cycle is too
slow to converge on one. **A tuning tool, not configuration** — a settled value belongs in
`murciaConfig.ts` with its reasoning.

If a future change *does* have grounds to retune, the order is: rotation too fast →
`degreesPerViewportWidth`; not smooth enough → `smoothingTimeConstant`; drifting after release
→ `releaseTimeConstant`; zoom too coarse → `wheelSensitivity`. All are live as query
parameters, so it is a browser session and not a rebuild cycle. Record the outcome here either
way, including "tried and went back", which is the entry this section was missing the first
time.

Two exceptions to that order now. `translationGain` is not really a speed knob — lowering it
does not make panning slower so much as it trades fidelity away, and grab-the-point is the
thing users asked for. It is judged rather than derived (0.7 as of 2026-08-13), so it may be
re-judged; what it must not be is *reasoned* into a new value, and the lever for "panning
feels too fast" is the camera distance. And `zoom.maxDistanceScale` is not
tunable by feel at all: raise it only with `checks/navigation-zoom.ts` re-run and passing.

Reference given: **chartogne-taillet.com** — as *concept, not goal*. The site is fully
JS-rendered so no values could be read from it.

---

## 8. Murcia's district interaction

A district highlights on hover, flies the camera to itself on click, and opens a services
panel. It is the first *content* in Murcia; everything before it was navigation.

### The asset does not contain the district

The Blender collection is called `edificios_servicios`. **It does not exist in the GLB.**
All 294 node names were dumped to confirm it: the glTF exporter flattens collections and
only object names survive.

`resolveDistrict` (`experiences/murcia/interaction/resolveDistrict.ts`) therefore resolves in
layers, reporting which one fired — the same discipline `findTerrainPlate` uses, for the same
reason:

```
userData.district === tag   ->  'tag'    the production mechanism
configured node names       ->  'name'   all three spellings
world XZ rectangle          ->  'rect'   development only, gated + loud
                            ->  'not-found'  feature left entirely inert
```

**Stand-in today:** `blog_edificios` + `blog_edificios.001`, a real non-instanced cluster at
X [−381, −299] Z [156, 212]. When the objects carry `district = "servicios"` the tag path
wins automatically and no code changes. The Blender side is `murcia/blender-export-contract.md`.

`allowSpatialFallback` is a field on the binding, **not** `import.meta.env.DEV`. Nothing in
`src/` reads `import.meta.env`, and `checks/` bundles these modules for Node with esbuild
where it does not exist — reading it inside the resolver would have broken the harness that
tests the resolver.

### Exclusive camera ownership

The first design suspended *pointer input* during a flight. That is not enough:
`DragPanController.update()` writes the rig unconditionally, so a flight would move the rig
and the controller would ease it back toward its stale drag targets on the same frame, every
frame.

The fix is a lifecycle, not a filter. `beginExternalControl()` makes `update()` return
**before** touching the rig; `endExternalControl({ adoptRigState: true })` reads focus and
yaw back off the rig into the controller's current *and* target state. §2 of
`checks/district-flight.ts` asserts both, and also asserts that *without* adoption the view
snaps back 37.8 units — so the guard is demonstrably load-bearing rather than decorative.

Cancellation uses a **capture-phase** `pointerdown` listener on the canvas. It runs before
the controller's own constructor-registered handler, so the press that stops the flight is
also the press that starts the drag — no synthetic re-dispatch, no dead first gesture. Its
`pointerup` is suppressed.

### The flight moves focus and yaw only

Distance, elevation and FOV are untouched, so the ground footprint is unchanged and
everything in §5 and §6 holds with no re-measurement. A deliberate scoping decision, not an
oversight — §5 makes a pose change a much larger job.

Yaw uses the shortest signed delta added to the rig's unbounded yaw, so 350° → 10° travels
+20° and a wound-up 730° stays wound up. The flight integrates `elapsed / duration` through
an ease-in-out curve rather than the project's usual `1 − exp(−dt/τ)`: it needs a defined
endpoint, and frame-rate independence then holds by construction (verified identical at
30/60/120 fps, spread 0.0).

*Desired* and *feasible* focus are kept separate. The destination is never rewritten by a
frame that happened to be clamped, so a trajectory grazing the navigable edge still arrives
exactly where it was aimed.

### Framing around the panel

The district must not land behind the UI. The offset is computed as: centre of the
unobstructed region → NDC → raycast to the navigation plane → point P →
`focus = target + (target − P)`.

That is **exact, not approximate**. Moving the focus by d moves the camera by d, so the
point under a given NDC moves by exactly d; the round trip verifies to 1e-4 on every
viewport including 5120×1440 and an offset canvas.

Two things that are easy to get wrong and are now asserted:

- **Measure from real DOM rects**, not the breakpoint, and relative to the *canvas* rect
  rather than the viewport.
- **Never mutate the live rig to take the measurement.** `computeFramedFocus` builds a
  detached `CameraRig` on a throwaway camera. Pointing the real rig at the destination would
  jump the camera for a frame and fire `onYawChanged` → `recomputeBounds()` as a side effect.

The panel is measured with `offsetLeft/Top/Width/Height`, not `getBoundingClientRect()`.

### Look: emissive, not lights, and no halo

Murcia has no post-processing outside a warp, so emissive makes a surface read as
self-illuminated; it does **not** bloom into the air. The ground marker supplies the spread.
Dynamic lights are ruled out separately by the light-count recompile.

Materials are cloned **by original identity** (`Map<original, clone>`), not one clone for
all — that would work only while the GLB ships zero materials, and the texturing work will
end that. Originals are recorded and restored before the clones are disposed. Authored
emissive is scaled, never overwritten, so future `districtPart = "emission"` strips keep
their modelled look.

Idle intensity is deliberately **non-zero**, because there is no hover on touch.

### Mobile is not a smaller desktop

At 30° elevation the screen's vertical axis maps to *distance*: the bottom of frame is near
foreground, the top is the far city. A bottom sheet therefore covers the cheapest part of the
image, where a side panel on a narrow screen would cover the city. Two stops (~40% / ~85%);
the camera frames for the peek stop and **does not** re-frame when the sheet expands — at 85%
the user has chosen content over scene, and chasing the remaining strip reads as instability.

**Buildings are not small touch targets**, contrary to the assumption that usually drives a
picking proxy. Measured at the shipped pose, scale at the focus plane is ~8.7 px/unit at
1440×900 and ~8.1 px/unit at 390×844, so a 13-unit building is ~105 px wide. The proxy exists
for two other reasons: the marker is the affordance and must itself be clickable, and the
gaps between buildings should not be dead space.

Accessibility is carried by the projected label, which is a real `<button>`: a raycast cannot
be tabbed to or activated by Enter.

### The panel

A `summary` (one sentence, sized to survive the 40% mobile peek stop), a longer `intro`, and
five services as **single-open accordion sections**, the first open on arrival. All-collapsed
reads as a menu rather than as content, and several open at once loses the reader's place in
a 380 px column.

**Earth's case panel is now the same sheet** (DECISIONS 26.19, 2026-08-18). The 2026-08-14 mobile
audit left it open whether these stops suited the case panel too; the answer is yes, and the
single-stop sheet that shipped in the meantime did not. Measured on the build, with the longest
case:

| viewport | one 60dvh stop | content | hidden |
|---|---|---|---|
| 393×852 | 511 px | 706 px | 196 px, **28%** |
| 360×740 | 444 px | 719 px | 276 px, **38%** |
| 852×393 | **desktop dock, 820 px tall, unscrollable** | 818 px | unreachable |

Two failures in one: the sheet's top edge at 40% of the screen covered a satellite centred at
50%, and a third of the case sat behind a scroll nothing advertised. At the peek stop the panel
now clears the satellite by ~85 px on a 393×852 phone, and expanded holds the whole case with
nothing left to scroll.

The landscape row is the one worth remembering: **a breakpoint written only in width does not
describe a phone.** 852×393 passed `max-width: 767px` and got the desktop layout.

`src/content/types.ts` holds `DistrictService { id, title, body }`. The
`id` wires `aria-controls` to the region, so duplicates would point two headers at one panel
— invisible unless you use a screen reader, hence asserted.

**Height animates with `grid-template-rows: 0fr → 1fr`, not `max-height`.** `max-height`
needs a number bigger than any real body; whatever it is, the visible motion finishes early
and the transition spends the remainder doing nothing, because the easing applies to the
guess rather than to the content. The `fr` track animates to genuine `auto`. It needs an
inner wrapper with `min-height: 0` — grid items default to `min-height: auto` and refuse to
shrink below their content, which would hold the section open at `0fr`.

Two ordering traps, both hit during implementation:

- `.reveal` and `.district-service-region` are both single-class selectors, so whichever is
  declared last wins the `transition` shorthand outright. With `.reveal` last the accordion
  silently stopped animating its height. The utility now precedes the components.

  **This used to claim `checks/` verified that order in the built CSS. It does not, and never
  did** — no such assertion exists in any harness, and the claim survived because a sentence
  describing a guard reads exactly like a guard. Corrected 2026-08-13 rather than
  implemented: the honest position is that this ordering is currently held by nothing but
  the source order and this paragraph. If it breaks again, the place to assert it is a
  Playwright spec that opens a district and measures the section's animated height, because
  the failure is behavioural rather than textual.
- `buildSections()` opens section 0, which routed through the same path as a tap — including
  the mobile auto-expand. On a phone the sheet jumped to 85% the instant the panel opened and
  the peek stop was never seen. `setOpenSection` now takes `fromUser`, and only a gesture
  raises the sheet or scrolls.

**Opening a section does not re-frame the camera**, deliberately: the desktop dock is
fixed-width and full-height and the mobile sheet's height is set by its stop, so section
height changes only inside the scrolling body. `getObstructionRect()` returns the same
rectangle.

---

## 9. Numbers worth knowing

**Murcia camera:** fov 35 · elevation 30° · azimuth 0° · distance 165 · `lookAtHeight` 5.85 ·
near 1 · far 1200 · camera height 82.5. Effective pitch ≈27.3°, because `lookAtHeight` is a
constant rather than a fraction of distance. Azimuth 0 is a *starting* value only; the user
yaws freely and `CameraRig` keeps that yaw outside the pose.

Originally FOV 60, distance 551, elevation 44.2°, derived from the bounding sphere — the
"isometric strategy game" look the navigation work set out to replace.

**Murcia navigation:** `deriveBoundsFromTerrain: true` · `boundsInset: 0` ·
`dragThresholdPx: 6` · `groundPlaneHeight: 1` · `edgeSafetyMargin: 8` ·
`maxGroundDistance: 800`. `maxGroundDistance` was 500; at distance 165 on an ultrawide the
corner rays genuinely reach ~550, so the clamp fired in a *normal* case rather than the
near-horizon one it exists for — and it under-reported the footprint, which is the unsafe
direction: −37 measured where the truth was −170.

**Murcia plate:** X [−438.2, −86.4] · Z [120.5, 473.3] · 351.8 × 352.8 · top surface at
Y 1.41. Model bounds coincide with the plate exactly. Skirt width 700,
`fadeEndFraction` 0.21.

The plate is **not a rectangle**: 134 vertices / 88 triangles, a low-poly irregular polygon
that does not fill its own bounding box. Local POSITION Y spans −2.55 → 0 with node
translation +1.41, so it is a slab whose top face sits at world Y 1.41. `Plane.018` is a
351 × 69 strip at world Y −1.15 → 0.01 spanning Z 291–360 — almost certainly the river, in a
channel cut through the plate, and the reason the services district approaches at
`approachYawDegrees: −35`.

**The GLB** (`/models/city-prototype.glb`, 456 KB, Draco + `EXT_mesh_gpu_instancing`,
Blender glTF I/O v5.1.20): 294 nodes · 111 meshes · 957 GPU-instanced buildings · **0
materials · 0 textures · 0 `extras`**. Representative building ~13 units, tallest landmark
`Plane.019` at 45. Scale is 1 unit ≈ 1 metre. All meshes share one default
`MeshStandardMaterial` — always clone before modifying. And with no `extras`, districts
resolve by **node name**, not by tag. The city currently renders monochrome as a result.

> ⚠️ **Those numbers describe the committed GLB. The working tree currently holds a different
> one** (measured 2026-08-11): **1 245 164 B · 1 070 nodes · 257 meshes**, against 455 616 B ·
> 294 · 111 at `HEAD`. Still Draco, still `EXT_mesh_gpu_instancing`, still 0 materials and —
> importantly — **still 0 `extras`**, so the re-export did not close the district-tagging gap.
> It is uncommitted and its provenance is unknown; it was already in the tree when the
> readiness re-audit began. It sits on the intro's prefetch path, so +790 KB competes with the
> 2.43 MB of Earth textures. **Verify which file you are measuring before trusting either set
> of numbers, and update this paragraph when the asset is settled.** Audit `ASSET-2`.

**Stop measuring it by hand.** `npm run check:asset` (`checks/city-asset.ts`) reads the GLB's
JSON chunk and reports every number in this section, then asserts the export contract on top of
them. Run it before trusting anything written here. Against the working-tree file on
2026-08-14 it reports **6/9**, and the three failures are the three known gaps:

| | |
|---|---|
| `TEXCOORD_0` on every primitive | **73 / 257** — and the 184 without it are exactly the Geometry Nodes buildings, the ones the exporter names `Mesh` |
| nodes carrying `extras` | **0** — Include → Custom Properties was never checked, so districts still resolve by node name |
| a node tagged `district=` | **0** — same cause |
| instancing (passing) | 14 instanced nodes · **6602 instances**, so trim variation is per-geometry-variant, never per-building |

It is deliberately **not** in the `check:harnesses` chain: the UV assertion fails today by
design, and chaining it would fail `npm run build` for a gap it was written to measure. Add it
to the chain in the same commit that lands the trim-sheet re-export.

**Tap tolerances — two numbers, per pointer type, and they must stay two.** Camera rig:
`dragClickThreshold` 4 px (mouse/pen) · `touchDragClickThreshold` 12 px. **Murcia's drag:
`dragThresholdPx` 6 · `touchDragThresholdPx` 12** (added 2026-08-14). A physical click barely
moves a cursor; a finger wanders 5–15 px between contact and release. Collapsing these back
to one value re-breaks touch even with the raycast correct (§11.23). (The geo markers'
slop pair went with the marker system, 2026-08-19.)

> Murcia had only the one number until 2026-08-14, and it cost the feature that experience
> exists for: a finger tap that wandered 7 px became a drag, and `DistrictInteraction` refuses
> to select while the controller reports one. Districts failed *intermittently*, with no error
> — which reads as an unresponsive site rather than a broken one. `check:navigation` §12 now
> asserts both directions at a distance strictly between the two thresholds, so it can only
> pass if the controller really does read `pointerType`.

**Earth textures ship at two resolutions** (2026-08-14). 4096×2048 above 767 px, 2048×1024 at or
below it, media-gated in `index.html` and selected by `EARTH_TEXTURES` in `earthConfig.ts` — the
two MUST agree or every visitor downloads both sets. **134 MB → 34 MB** of texture memory with
mipmaps; on the wire 2 376 KB → 1 662 KB. 2048 is not a concession: at 390 CSS px and DPR 2 the
globe spans ~300 device pixels against ~1024 texels of visible hemisphere, so it is still
oversampled more than 3×. Re-derive that if the close-up framing ever changes. Regenerate with
`scripts/prepare-earth-textures.mjs`, never by hand.

**The close-up's screen offset is a fraction, not a distance.** `CLOSE_UP_OFFSET_FRACTION` 0.395
of the horizontal half-width, in `camera/closeUpFraming.ts`, and **zero below 768 px** where the
case panel is a bottom sheet rather than a right-hand dock. It was `0.16 * R` = 0.32 world
units, which is a fixed *angle* (16.2°) against a horizontal half-FOV that collapses from 36.4°
at 16:9 to 10.8° at 9:19.5 — so in portrait the subject of the close-up was pushed outside the
frustum. 0.395 reproduces the judged desktop composition to three decimals.

**Brand atlas:** one 2048×1536 `CanvasTexture`, 2 columns × 3 rows of **1024×512** cells,
sRGB, mipmapped, `ClampToEdgeWrapping`, anisotropy 4. Cell aspect is **2:1 and coupled to
`ORBIT_CONFIG.panel` 0.28 × 0.14** — change one without the other and every plate stretches.
Cell resolution is set by the case-panel close-up at `closeUp.distance` 0.55R, not the
overview. Hard cap of 6 plates; `cellUv` clamps past it. Logo artwork is specified at
1600×800 WebP with alpha, contain-fitted into a 896×400 box (`PAD_X` 64, `PAD_Y` 56) — the
atlas owns the padding, so files must be trimmed tight (`earth/logo-spec.md`).

**Earth rotation is 0.035 rad/s — a full turn takes ~180 s.** Worth knowing before writing any
test that waits for a specific place to face the camera: Murcia is on the near side for well
under half of that, and a 60 s poll will simply miss it.

**The space backdrop** (`src/space/`, `DECISIONS.md` §19). Two independent non-occlusion
guarantees, and they work differently:

| | Stars | Sky |
|---|---|---|
| Kept off the Earth by | **geometry** — a shell enclosing the camera | **render order** — opaque at `renderOrder -1000` |
| So the radius is | load-bearing: 180 ±15%, min 153 against `zoomMax` 22 | free: 1000, anything inside the far plane |

3500 stars in **one** draw call. Clustering is 36 knots · spread 0.09 · share 0.6 · strength
0.6, and it is **angular only** — perturb the direction, renormalise, then apply the radius.
Magnitude is continuous: `rand ** 2.6` mapped to 0.7–4.2 px with brightness 0.35–1.0. Only
stars ≥ 2.6 px twinkle (~20% of them), amplitude 0.15, alpha not `gl_PointSize`. **The twinkle
threshold moves with `maxSize`** — it is an absolute pixel size, so widening the range without
raising it pushes past the harness's 25% ceiling.

Galactic band: **tilt 22°, width 0.22, yaw 250°**, shared by the stars and the sky — that
agreement is the design, and `skyOrientation()` is what enforces it. Yaw is compositional
only: `u` falls by 1/360 per degree, and 250 puts the galactic core beside the Earth rather
than behind it. Depth is the pair **brightness 0.60 · contrast 1.00** — the gamma is what makes
a sky read as distant, where dimming alone only flattens it, so contrast at 1.00 means this
source needs none. It was 0.22 · 1.25 for the ESO panorama; see the retuning note below, which
is the same fact from the other end.  Star seed `20260811`.

Sky texture: **4096 × 2048 AVIF q59, 194,642 bytes on the wire, RGBA8 no mipmaps = 33.6 MB
VRAM**, with a 2048-wide pair below a 767 px viewport (81,648 bytes, 8.4 MB) and WebP twins for
browsers without AVIF. **AVIF is load-bearing** — see §11.38 — but the specific quality is set
by a **200 KB client budget** rather than by the block-ratio optimum, which on this source is
q80. q59 measures 1.666 and looks clean anyway because the shader dithers.

**4096 × 2048 is now the standing format for every space background** (client decision,
2026-08-20), so this is a fixed frame rather than a ceiling to push against. It puts the sky at
11.4 px/deg against a ~20 px/deg viewport — **1.76× magnification, accepted**, where the
6144-wide ESO source gave 1.17×.

**q59 and not a round number**, because "200 KB" is ambiguous by a factor that matters here:
q60 is 202,169 bytes, which is 197.4 KiB and passes a 1024-based reading while failing a
1000-based one. Every file this project has shipped cleared both. q59 gives up almost nothing
(1.666 against q60's 1.647). It was q50 until `convergePoles` freed the bits — see §11.55.

**Public domain source, and the site shows NO attribution — a client requirement.** This
replaced ESO's eso0932a (CC BY 4.0, credit "ESO/S. Brunier" mandatory) for that reason alone;
the credit came out of `AuditSection.tsx` and `styles.css` with it, and `e2e/backdrop.spec.ts`
now asserts the *absence* of any credit. NASA/Goddard Deep Star Maps were considered and
rejected — courtesy credit plus an ESA/Gaia layer, and EXR-only. See `CREDITS.md`.

Sampled as equirectangular in **galactic** coordinates, so the plane is the horizontal
centreline and the core is at `u = 0.5`. Point stars are median-filtered out of it (§11.37) and
its wrap seam is levelled (§11.32) by the median per-channel offset — *not* the old per-row
scheme, which printed coloured horizontal bands into the picture on every source including the
ESO one. Regenerate with `node scripts/prepare-sky-panorama.mjs <path-to-png>`, never by hand.

**The source is NOT actually an equirectangular panorama, and neither is any candidate that was
screened.** It is a flat 2:1 image; the shader maps it over the sphere anyway. Measured as
per-channel row sd at each pole over the equator's, the ESO panorama scores **0.029** and this
source **0.670** — every CC0 candidate scores 0.319 or above. `convergePoles` in the prep
script mitigates the visible consequence (§11.55); it cannot make the image a panorama, so the
residual "zoomed" look is a property of the source and only a different source fixes it. Screen
any replacement with the pole ratio the script prints, and **verify with the picture**:
`node scripts/preview-sky-poles.mjs`. Full working in
`docs/audits/sky-panorama-projection-2026-08-19.md`.

**The new source is dimmer, so `skyBrightness` went 0.22 → 0.60 and `skyContrast` 1.25 → 1.00.**
At the old pair this image renders almost entirely black. Any future sky swap needs that pair
retuned in the debug overlay before the image is judged.

Bloom: **strength 0.55 · radius 0.5 · threshold 0.62**, between `RenderPass` and
`AfterimagePass`. `strength 0` disables the pass outright, which is the performance escape
hatch. Below ~0.5 the threshold starts hazing the Earth's day side.

Clumping is measured, not asserted by eye: coefficient of variation of nearest-neighbour
angular distance is **0.020 for `fibonacciSpherePoints` and 0.651 for the shipped field**.
That spiral is a *maximally even* distribution, which is why the old sky read as combed.
`fibonacciSphere.ts` is untouched — `createConnectivityCloud` still wants exactly that.

**Warp:** duration 1.6 s · cut at 0.5 · Earth FOV 45→74 · Earth radius ×0.25 at the cut ·
Murcia arriving 165→75 · Murcia departing 165→180 while rising 30°→50° · flash reaches full
black. The two legs are not mirror images (ADR 006).

**Build budgets** (asserted; the build fails, it does not warn):

```
intro entry   13 325 B / 16 000 B   ← must have LITERALLY ZERO imports
app entry    316 247 B / 320 000 B  ← ~3.7 KB headroom — NEARLY FULL
```

Emitted chunks: `three` 814 KB · `SceneCanvas` 211 KB · entry 316 KB ·
`MurciaExperience` 70 KB · `createCornerLogo` 3.7 KB · `intro` 13 KB.

Both numbers moved since the 2026-08-07 reading (12 996 / 300 787) and the growth is shared
between the touch, logo and backdrop work — do not attribute it to any one of them. The
2026-08-20 chrome-and-feel work (rail dress, spring, hint, footer, contact, legal) took the
app entry from ~302 KB to 316 247 B: the NEXT entry-chunk feature almost certainly has to
lazy-load, and `LegalPanel` is the first candidate to push out if a small one trips the gate. **The
intro figure is not the backdrop's doing**, which was checked rather than assumed: the built
intro chunk contains zero galaxy symbols. `introConfig.ts` does carry a *value* import of
`space/galaxyBand`, so the band defaults have one source of truth; that is safe only because
the boot entry never reaches `introConfig`. §11.1 still governs everything under
`intro-draw/`, and the nebula itself adds **no** download bytes at all, being generated on the
GPU.

---

## 10. How this repo verifies things

**Everything the harnesses do is numeric**: good at signs, magnitudes and geometry, silent on
whether the result looks or feels right.

**Assistant-side visual verification began on 2026-08-11** and is now the expectation for
anything visual. Not the Chrome extension, which has still never been connected — Playwright
against the dev server. Two forms, both worth copying:

- **Screenshots read back by the assistant** (the galaxy backdrop). `npx --no-install
  playwright screenshot --browser chromium --viewport-size "1600,900" --wait-for-timeout
  22000 http://localhost:5173/ out.png`. The timeout is simply longer than the intro.
- **Emulated devices driven against a control** (touch picking) — 460 taps on the pre-fix
  code producing no response, then the same script passing after. A verification with no
  negative control cannot tell "fixed" from "never broken".

**This is not optional for visual work, and the galaxy is the evidence.** Three defects
survived both design review and code review and were caught only by looking: noise frequency
producing fog (§11.32), dust lanes crazing the whole sky, and a smooth analytic band reading
as a searchlight beam. All three were *invisible* to 28 passing numeric assertions, because
each assertion was true. Numbers prove the mechanism; only a picture judges the result.

Playwright's bundled Chromium is already installed here, but the Playwright **MCP** is
configured for the `chrome` channel and fails with "Chromium distribution 'chrome' is not
found". Chrome is not installed on this machine; Edge is. Use the CLI, which is what the
command above does, rather than installing a browser.

**Judgement is still the user's.** Screenshots catch defects — fog, crazing, a beam. They do
not settle whether a thing looks *good*, and the division of labour below is unchanged.

**The division of labour that worked**, and is worth repeating for anything judged rather
than measured: the numeric side proves the mechanism (sign, bound, magnitude,
no-regression), query parameters put the judgement in the user's hands directly, and the
outcome comes back into this document as a decision. The drag feel went from "reasoned
defaults, unvalidated" to signed off in one pass that way (§7). The failure mode it replaced
was a long round-trip of the assistant guessing at a feel it cannot perceive — which is how
the rejected momentum design survived as long as it did.

Everything numeric is verified by bundling the **real TypeScript modules** with esbuild for
Node and running a harness against them. Never a reimplementation, never a convenient
stand-in.

Four rules these harnesses earned the hard way:

- **Exercise the real resolution path.** The first navigation harness constructed plate
  bounds *directly* rather than resolving them by name, so it validated the maths and never
  the lookup — which is exactly where the worst bug in the project lived.
- **Cross-check the measurement against the shipped function.** The azimuth sweep computes
  corner ground hits itself (it needs the points, not just the reaches) and asserts its own
  axis-aligned extents match `computeGroundFootprint` to 0.00 units. Without that it could
  have been measuring something adjacent.
- **Validate against a recorded number.** The sweep independently reproduced this document's
  "+40 units at 5120×1440, distance 110" before being trusted on any new configuration.
- **A failing assertion is a question, not a verdict.** Several of the first failures were
  the test's fault: a 960 px pointer move delivered in a single 16 ms sample (a 60 000 px/s
  flick) asserted to produce no coast; a weight comparison that drove into the navigable
  boundary and so compared walls rather than momentum, where the *heavier* setting hit the
  wall sooner and read as travelling less.

### Both gaps above are closed as of 2026-08-13 — plan `000-testing-strategy`

**`check:navigation` can fail now.** It used to print its failures and leave
`process.exitCode` at 0, so `npm run check` chained straight past it with `&&`. The exit code
now comes from `checks/lib/assert.ts`'s `finish()`, which every harness calls and which counts
live — one place, so it cannot be got wrong once per file again.

That gap was not theoretical: while it was open, §9 of `checks/navigation-feel.ts` had been
failing two assertions — grab-the-point undershooting by 30% — and `npm run check` was
exiting 0 the whole time. The cause was a judged `translationGain` (`DECISIONS.md` §21), not
a bug, but nothing in the process would have told anybody either way.

**The same `finish()` removed three hardcoded summary counts.** `warp-transition.ts` printed
`32/32 checks passed` while running **36** assertions; space and zoom had the same pattern.
A summary that cannot be wrong beats a summary that is round.

**The deploy path runs the gate.** `npm run build` is now
`tsc -b && npm run test && npm run check:harnesses && vite build` (since folded into
`npm run check && vite build`, with `precheck` → `content:build` in front — see §2), and `vercel.json` still
sets no `buildCommand`, so Vercel runs it. Verified by forcing a failure of each kind and
confirming `vite build` is never reached. Audit `VER-1` is closed, and `DECISIONS.md` §12
("guard behaviour on the artifact") is honoured rather than merely stated.

**The tradeoff was taken knowingly, and it is the one recorded here before:** a
tuning-sensitive harness now sits on the deploy path. `check:space` was once seen failing at
ratio 1.107 against a 1.15 threshold while `spaceConfig.ts` was mid-edit. Local iteration is
unaffected — `npm run dev` runs none of this — so the friction appears only at build time,
which is the point of a gate. If it becomes intolerable the answer is CI, not an escape
hatch; there is deliberately no `VERTIGO_SKIP_TESTS`.

### The two tiers, and which one a thing belongs in

**Unit tier — Vitest, 383 assertions, `src/**/*.test.ts`.** Pure logic that needs no scene:
the visibility predicates, the warp curves, easing, the navigation rectangles,
`shortestYawDelta`, the framing geometry, `geoUtils`, the Fibonacci shell, the boot state
machine, the loading playhead, and the coupled-array data integrity `tsc` cannot see with
`noUncheckedIndexedAccess` off.

Config in `vitest.config.ts`, deliberately separate from `vite.config.ts` — that file's
plugins are `apply: 'build'` and `introEntry()` rewrites the Rollup input. Three things are
carried across: `glsl()`, the `__VERTIGO_ENV__` define, and `environment: 'node'` with jsdom
opted into **per file**. That last is not fussiness: a global jsdom would hand every module a
`window` and hide an accidental DOM dependency in the boot chunk, whose standalone-ness is
asserted on the emitted bundle.

**Vitest is pinned to 3.x on purpose.** Vitest 4 ships its own Vite (8.x) rather than using
the project's, which would put the test tier on a different bundler from the build — see
*Known debt*, "Vite pinned at 5". `npm ls vite` must keep reporting a single deduped 5.x.

**Harness tier — `checks/`, 185 assertions, esbuild + node.** Unchanged in kind. They sweep
tens of thousands of camera poses through real Three.js objects and catch geometric
regressions invisible to both the type checker and a screenshot. They were NOT ported and
should not be: they are not unit tests and would be worse as them.

**Smoke tier — Playwright, 18 tests across 3 projects, `npm run e2e`.** Local, against `vite preview`, never a
build gate: Vercel's container would download Chromium on every deploy and has no server to
point at. If CI is ever added this is the first thing that moves into it.

Three projects since 2026-08-14: `chromium` at a fixed 1600×900 (the screenshot baselines are
sized to it), plus `mobile-android` on `devices['Pixel 7']` and `mobile-ios-shaped` at
393×852/DPR 3. The mobile pair is scoped to `e2e/mobile.spec.ts` by `testMatch`, and the desktop
project excludes it — the baselines would fail at any other size.

**A device profile is the point, not the viewport.** A context with `hasTouch: true` alone still
reports `hover: hover`, so every `(hover: none)` and `(pointer: coarse)` rule stays inert and a
touch fix looks verified when it is not (§11.25). **Both mobile projects are still Chromium**,
and that is stated in the config rather than left to be discovered.

`scripts/simulate-intro.mjs` **no longer exists.** All eight of its scenarios live in
`src/intro-draw/playhead.test.ts`, Case 1 first, driving the same real module by plain import
instead of by esbuild-transform and a base64 data URL. The disk read only ever existed
because there was no runner.

**Coverage is scoped, not repository-wide** (`vitest.config.ts`): eleven pure modules, 93%
statements against an 85% floor. A repository-wide number would be dominated by the WebGL
surface that is untestable by design, and would end up either meaningless or a reason to
write fake tests.

### Verifying the production build, not the dev server

Three things that only the production path can tell you, all verified on 2026-08-11:

- **The SEO branch is environment-gated and had never been executed.** Every build until then
  ran the development path, which emits `Disallow: /` and `noindex`. Exercise the real one
  locally with
  `VERCEL_ENV=production VERCEL_PROJECT_PRODUCTION_URL=example.com npm run build`, then read
  `dist/robots.txt`, `dist/sitemap.xml` and the `canonical`/`og:url` tags. Production also
  drops the `/debug` console, so the entry chunk comes out ~5.4 KB smaller — if it does not,
  the flag did not take.
- **The build is deterministic.** Two clean builds produce byte-identical chunk hashes. When
  checking that, fingerprint `src/` before and after: this repo has had two agents in it at
  once, and a "non-deterministic build" is far more likely to be a file that changed underneath
  you.
- **Failure paths need `vite preview` plus request blocking**, not reasoning. Playwright
  `page.route('**/earth/*.jpg', r => r.abort())` and read
  `window.__vertigoIntro.boot.readiness()` / `.pending()`. Confirmed: a required asset gives
  `fatal` and the Spanish caption, an optional one leaves `ready`, and blocking `model.glb` —
  the 20 KB file that once trapped every visitor — now lands `ready` with progress 1.

Note the city meshes set `raycast = () => {}` so they never intercept object picking; a probe
must restore it to measure coverage.

---

## 11. Things that will bite you again

1. **The intro entry must import nothing.** It is a separate Rollup input whose script tag
   is injected head-prepend, because Vite concatenates every module script in a document
   into one chunk. One stray value import — even something that looks like a type — pulls
   three.js back in and fails the build. That assertion has already caught it once.
2. **GLTFLoader strips `[ ] . : /` from node names.** `Plane.013` becomes `Plane013`, so
   `getObjectByName('Plane.013')` returns `undefined`. This once left the terrain plate
   unfound, the skirt unbuilt, `visualBounds` falling back to `contentBounds`, and the
   navigable area collapsed to **41 × 110 — 3.6% of the plate**, with no error of any kind.
   Never trust name lookup into a GLB; prefer measurement and heuristics, and always report
   which path was taken (`findTerrainPlate` exposes `terrainSource`).
3. **Blender collection names are not exported.** The glTF exporter flattens collections —
   only object names become nodes. A collection can never be a runtime contract. Use custom
   properties, which land in `extras` and then in `userData`. See
   `murcia/blender-export-contract.md`.
4. **Silent degradation is worse than failure.** Anything that can fail to find an object
   must log loudly and degrade to something *usable*, never to a technically-valid sliver.
   `maxGroundDistance` clamping is the same trap in numeric form: it under-reports the
   footprint, so a value set too low hides an edge that is actually visible.
5. **Hardcoded world coordinates drift** the moment the model is re-exported. Measure at
   load and keep the constants as a last-resort fallback — which is what
   `deriveBoundsFromTerrain: true` is for. The district resolver's `fallbackRect` is a
   development crutch for the same reason, and is gated behind `allowSpatialFallback`.
6. **All meshes share one material instance** while the GLB ships no materials. Clone before
   touching anything, and clone **by original identity** so the mapping survives the
   texturing work. Un-assign a clone before disposing it, or the mesh keeps a dangling
   reference across a remount.
7. **Changing the light count recompiles every shader** — a stall at exactly the moment of a
   warp. Keep the count and types identical across experiences and vary only position,
   colour and intensity; those can then animate through a transition for free. This is why
   the district highlight is emissive rather than a dynamic light.
8. **`rig.getPose()` returns `murciaConfig.camera` by identity.** Mutating it corrupts the
   config for the rest of the session. Always build a fresh pose object.
9. **`DragPanController.update()` is an unconditional rig writer.** It calls
   `rig.setFocus`/`rig.setYaw` whenever its stored targets differ from the rig, so anything
   else that moves the rig will be fought frame by frame. Gating pointer input does not stop
   it. Use `beginExternalControl()` / `endExternalControl({ adoptRigState: true })` — and
   note `externalControl` is a plain boolean shared with `setActive` and every district
   flight, so sequencing matters.
10. **The focus rig's `activate()` is destructive.** It reseeds from the overview pose. To
    suspend it without losing the viewer's position, stop calling `update()`; never toggle
    activation.
11. **`setViewport()` re-resolves Murcia's pose on every resize**, and `CameraRig.setPose`
    with it. Anything animating the pose must compose with that or a resize will snap it
    back. User yaw is deliberately stored outside the pose so it survives; do not fold it in.
12. **Bounds must clamp the drag target, never the rendered focus.** Snapping the focus was
    harmless when bounds only changed on resize; with free yaw it would jerk on every frame
    of a turn.
13. **Murcia's ground footprint is azimuth-dependent.** With free yaw the navigable bounds
    change every frame of a rotation, so any analysis at a fixed azimuth is invalid —
    including any *analysis*, not just any test. `DragPanController` fires `onYawChanged` for
    this.
14. **Ultrawide is the binding aspect** for skirt coverage, not desktop. Lowering the camera,
    pulling it back, or raising `lookAtHeight` widens the footprint and spends skirt margin;
    re-run `check:warp` and re-check `terrainTransition.width` after *any* camera change. See
    §5, which exists entirely for this.
15. **The drag feel numbers are hand-validated and signed off** (§7). They are the only judged
    values in the project. Do not "improve" them from reasoning, and do not treat a
    camera-pose change as licence to adjust them silently — `translationGain` interacts with
    the pose, so if distance or elevation moves, say so and let a person re-judge it.
16. **The raycaster reads `object.layers`, never `object.visible`.** An object hidden with
    `visible = false` is still picked. Murcia's picking proxies depend on this
    (`INTERACTION_LAYER = 1`); Earth must not use layer 1. A picking proxy is controlled by
    layers or not at all.
17. **A tap that cancels something still fires `pointerup`.** The click guard tests only the
    drag threshold, so a sub-threshold "tap to cancel" falls straight through into selection.
    Suppress the cancelling pointer's own `pointerup`, and clear the suppression on
    `pointercancel` too.
18. **`getBoundingClientRect()` reports the *transformed* box.** Measuring a panel for camera
    framing at the moment it opens returns its off-screen entry position, and the framing
    offset comes out as zero. Use `offsetLeft/Top/Width/Height`, which are layout values and
    ignore transforms.
19. **Both experiences' input listeners share one canvas.** Earth's satellite focus listens
    on `window`; Murcia's controllers listen on the canvas. Everything must be
    gated on which experience is active, or the inactive one silently accumulates state.
20. **Murcia's stylesheet was globally hostile** and is now scoped to `.murcia-ui`. Its
    declaration order is load-bearing: `.reveal` must stay declared before
    `.district-service-region`, or the accordion silently stops animating.
21. **GSAP's `lagSmoothing`** clamps the per-tick delta to 33 ms once a frame exceeds 500 ms.
    On slow hardware a 1.6 s warp stretches over tens of seconds. Correct behaviour, but it
    invalidates any wall-clock-driven test and will mislead you when profiling.
22. **Kill stale dev servers.** Three accumulated across sessions here, and the one being
    viewed served a stale module graph producing a `ReferenceError` that looked exactly like
    a circular import. It cost real time twice. Check the port before debugging a phantom.
23. **A tap produces no `pointermove`, so any hover computed from one does not exist.**
    `pointerdown → pointerup → click`, and nothing in between. This kept the *entire* site
    mouse-only until 2026-08-11: two handlers acted on a stored hover, and on touch it was
    permanently `null`, so nothing responded and nothing errored. Raycast from the event's
    own `clientX/clientY` — `DECISIONS.md` §17. The corollary is the second half of the bug:
    **a finger wanders 5–15 px between contact and release**, so a 4–5 px drag threshold
    rejects most real taps. Tolerances are per pointer type or they are wrong for one of them.
24. **`(hover: none)` is a device class you must design for, not a fallback.** Anything
    revealed only on hover is invisible forever on a phone. Both answers in this repo pair
    the persistent label with a *limb/on-screen* class so it cannot advertise something
    unpickable (`districtLabel.ts`, `.geo-tag.is-near`). And a label made
    visible must also be made activatable — it sits offset from the hit target, so a visible
    control that ignores taps is worse than no control.
25. **Emulating touch needs a real device profile.** A Playwright context with `hasTouch:
    true` still reports `hover: hover`, so every `(hover: none)` rule stays inert and a touch
    bug looks fixed when it is not. Use `devices['Pixel 7']`.
26. **Geometry and material passed to R3F as *props* are never disposed.** R3F disposes only
    objects it created; `THREE.Points` has no `dispose()` and prop-attached resources are not
    walked. So a `useMemo`'d geometry leaks on unmount *and* on every memo rebuild — which
    the debug sliders do per drag tick. Dispose them in an effect cleanup keyed to the memo.
27. **`EffectComposer.dispose()` does not walk its passes.** It releases its own two render
    targets and `copyPass`, nothing else. `AfterimagePass` alone owns two more full-screen
    render targets, two materials and two fullscreen quads. Retain every pass and dispose it
    yourself — a pass constructed inline in `addPass()` is unreachable and cannot be freed.
28. **A rejected promise stays cached.** `templatePromise` in `createSatellite` memoises the
    satellite GLB; a single transient 404 was replayed to every satellite for the rest of the
    session and survived a full orbit-system rebuild. Clear the cache in a `.catch` so the
    next attempt can actually retry.
29. **Async loads must be cancellable against teardown, and StrictMode makes that the normal
    path.** React 19 runs mount → cleanup → mount, so in dev *every* load lands after a
    dispose at least once. A callback with no `disposed` guard attaches geometry to a disposed
    scene, calls `compileAsync` on a dead object, and reports readiness for something that no
    longer exists. Guard the callback, not just the dynamic `import()`.
30. **Fixed-length coupling between two arrays is a site-down bug, not a missing item.**
    `createOrbitSystem` walked `ORBIT_PRESETS` (6) and indexed `SATELLITES[index]`; one fewer
    case study threw, and `OrbitSystemLayer` converts a throw into a **fatal** boot state. So
    deleting a case study would have refused to load the whole site. `noUncheckedIndexedAccess`
    being off is why `tsc` cannot see this class of bug (§12).
31. **`CubeCamera` does not orient its six face cameras in the constructor.** It leaves
    `coordinateSystem` null and only points them in `updateCoordinateSystem()`, which it calls
    lazily from `update()`. Borrowing the cameras — the right move, since a hand-rolled
    face-basis table is the most error-prone part of baking a cubemap — means bypassing
    `update()`, and then **all six still look down −Z and every face bakes the same image**.
    Call `updateCoordinateSystem()` yourself, from `renderer.coordinateSystem`. The general
    class: three initialises lazily inside its convenience methods, so taking the parts
    without the method takes them uninitialised.
32. **A photographic panorama's wrap seam renders as a straight ruler line, and the obvious
    way to measure it lies to you.** A stitched 360° image's two vertical edges rarely match
    photometrically. Under a perspective camera a great circle projects to a **straight line**,
    so the step does not read as soft variation in the sky — it reads as a ruled diagonal
    across it, which the eye finds instantly. Two traps. First, measure the seam **signed**:
    `mean(px(0) − px(W−1))` was 0.40/255 while the mean *absolute* difference was 1.7 both
    before and after the fix, because at that scale absolute difference measures per-pixel
    noise rather than the step, and will tell you the seam survived when it did not. Second,
    0.40/255 sounds negligible and is not — the sky background sits near 12/255, so it is a 3%
    step, and the sRGB toe is steep enough to expand that into something obvious. The fix is a
    per-row offset ramped across the full width, which closes the meridian exactly and hides
    the correction over 360°. No wrap mode or filter setting touches it; the data is
    discontinuous. Also: keep mipmaps **off** on an equirect sky, or `atan`'s branch cut sends
    the derivative to infinity on the wrap column and the sampler picks the smallest mip there,
    drawing a second line for an entirely different reason.
33. **In a procedural sky shader the domain scalar is the *only* thing setting feature size.**
    The input is a unit vector, so `dir * k` fixes how many noise lattice cells span the whole
    sky. At `k = 2.4` that is about eight — features ~23° wide, two of which fill a 45° FOV,
    and it renders as fog no matter how many octaves are stacked on top. Octaves add detail
    *below* the base frequency; they cannot rescue one that is too low. 8.0 is the working
    value, and this is invisible to every numeric assertion.
34. **Perturbing a position destroys a geometric invariant; perturbing a direction does not.**
    The star shell's non-occlusion guarantee is that every point lies on a sphere enclosing
    the camera. Clustering by offsetting final positions in 3D breaks it for *a handful* of
    stars at *some* orbit angles — the intermittent kind no screenshot reliably catches.
    Perturb the direction and renormalise, then apply the radius, and the guarantee holds by
    construction. Assert the radius bound across the full parameter space, not at defaults.
35. **`scene.background` is not tone-mapped, so anything authored to match it is wrong.** It
    is written as a clear colour and skips `ACESFilmicToneMapping` entirely, while every mesh
    beside it does not. This has now bitten twice, in opposite directions: Murcia's skirt had
    to fade to *alpha* rather than to the background value (§6), and the sky had to be an
    opaque **mesh** rather than a background so it passes through the composer's `OutputPass`
    like the Earth does. Related, and equally quiet: a raw `ShaderMaterial` gets no output
    conversion appended, so omitting `#include <colorspace_fragment>` fails as "looks a bit
    dark" rather than as an error. The same family: a downloaded sky texture needs
    `colorSpace = SRGBColorSpace` set by hand, and getting it wrong is not an error either —
    just a backdrop mysteriously too bright next to the planet.
36. **Procedural noise has two failure modes no amount of tuning reaches, and both were spent
    a full round before being recognised.** *Value noise cannot make filaments.* Ridged noise
    folds around its input's 0.5 level set, and for value noise that set snaps to the cubic
    lattice — so ridged value noise produces axis-aligned polygon walls, a crazed
    cracked-marble network, never curved filaments. Gradient or simplex noise does not have
    this property. *And fbm is stationary by construction*, meaning every patch of the domain
    has identical statistics. Stacking octaves adds finer detail, never variety; if the result
    reads as "too uniform", no octave count, threshold or colour will fix it. Non-stationarity
    has to be authored — domain warping, low-frequency modulation, explicit landmarks — or the
    texture has to come from somewhere else. Before spending a second tuning round on a
    procedural look, ask which of these two you are fighting.
37. **A star field and a photographed sky must not both supply stars.** Point stars in a
    panorama are static and cannot parallax or twinkle, so beside a real star shell they read
    as a contradictory second set. Median-filtering them out of the source is the fix, and it
    pays twice: point stars are high-entropy and dominated the compressed file, so removing
    them took a 4096×2048 WebP from 1.5 MB to 113 KB. The photograph's job is diffuse gas; the
    shell's job is the sparkle. Splitting responsibilities that way is why the image is cheap.
38. **WebP blocks smooth dark gradients at every quality, and magnification turns that into
    visible squares.** A sky rendered from a WebP q82 panorama was reported as "a bad-res image
    where you can see the pixels". It was not resolution. WebP quantises smooth dark regions
    into flat macroblocks; magnifying a texture 1.76× (DPR 1) or 3.52× (DPR 2, which is R3F's
    default `dpr = [1, 2]`) turns 16-px blocks into 28- and 56-px squares on screen.
    **Raising WebP quality does not fix it** — q96 still measures 1.60 and costs 4× the bytes.
    Measure it as the ratio of pixel steps ACROSS 16-px block boundaries to steps WITHIN
    blocks, over dark pixels only; lossless scores 1.00, the shipped WebP scored **2.147**.
    AVIF q60 scores **1.171 at half the bytes of WebP q88**. And AVIF is **not monotonic in
    quality** — q70 and q80 both block *worse* than q60, because rate control chooses different
    tiling at different targets, so never raise it without re-running the measurement.
    Two general forms worth keeping: a lossy codec's artifacts are multiplied by whatever
    magnification the texture is later drawn at, so a texture that is fine in an image viewer
    can be unacceptable on a sphere; and *shader dither* of ±0.5/255 is nearly free and removes
    what survives, because the eye integrates grain but finds edges.
39. **`sharp(encodedBuffer).toFile(path)` silently re-encodes at default quality.** Encoding to
    a buffer with chosen settings and then writing it back through sharp decodes and re-encodes
    it, so the file on disk is not the one that was measured. It shipped that way once — the
    script printed 240 KB while writing 153 KB. Write encoded buffers with `fs.writeFile`. The
    general form: an image library's `toFile` is a pipeline sink, not a byte writer.
40. **A `gl_Points` sprite is a SQUARE unless the fragment shader makes it round.** No amount of
    colour, size or blending changes that; only `gl_PointCoord` distance plus `discard` does.
    `PointsMaterial` with no `map` therefore draws square stars, which is easy to miss at 1–2 px
    in a still and becomes obvious the moment anything magnifies or blooms them — adding bloom
    is what exposed the warp tunnel's. The falloff lives once in `src/space/pointSprite.ts` and
    is shared by both star fields so they cannot drift into different shapes.
    The companion trap: **replacing a `PointsMaterial` with a raw `ShaderMaterial` silently
    changes every point's size**, because three feeds `size` and `scale` uniforms to its own
    points shader and to nothing else. Reproduce it as
    `gl_PointSize = size * pixelRatio * (cssHeight * 0.5) / -mvPosition.z`, and note that
    `cssHeight` is R3F's `size.height`, not `gl.domElement.height` — the latter already includes
    the pixel ratio and squares it, which looks correct on a 1x display and wrong on every other.
41. **A diagnostic can sit in a production code path for months and only start firing when an
    unrelated asset changes.** `InteractionProbe` returns `void` and its only effect is a
    `console.info` of node metadata; it was called from Murcia's `pointerup` on every click,
    gated on `active` and drag state but **not** on `DEBUG_TOOLS_ENABLED`. It emitted nothing
    only because the GLB carries no `extras`, so its cache was empty — and the planned Blender
    re-export exists precisely to add those. "Currently silent" is not "gated"; check what a
    thing would do once the data it keys on arrives. Now gated (audit `DBG-1`).
42. **A DOM event is not a React error, and an error boundary cannot see one.** `webglcontextlost`
    fires on the canvas; three sets `_isContextLost` and every `render()` becomes a silent no-op.
    Nothing throws, nothing rejects, no component re-renders — so `SceneErrorBoundary` never runs
    and the visitor gets a black rectangle with no explanation, permanently. The class's own
    docstring claimed to cover "a driver reset", which is exactly the case it structurally
    cannot. The general form: **a failure that arrives as an event needs a listener, and no
    amount of boundary placement substitutes for one.** Also, `preventDefault()` on that event is
    not a formality — without it the browser never even attempts restoration, so
    `webglcontextrestored` can never fire.
43. **A fatal state latched after the intro has handed over repaints nothing.** `markFatal` sets
    the boot state and notifies listeners, and the drawing's rAF loop is what turns that into a
    Spanish caption — but that loop stops when the drawing finishes. So a failure during load is
    visible and the identical failure ten seconds later is invisible. Anything reporting a
    mid-session fatal needs its own surface; the boot state is not one after handover.
44. **A shared instance whose consumers each "dispose" it needs counting, not sharing.** Three
    modules built their own `DRACOLoader` and disposed it when their load finished, which was
    correct in isolation and became a use-after-free the moment the instance was shared —
    whichever consumer finished first would tear the pool out from under the others. Reference
    counting is the whole fix, and it also keeps the property the per-consumer pools had: nothing
    is retained once loading ends. A plain singleton would have traded the loading peak for
    permanent residency, which on iOS is the worse half of the trade.
45. **`alpha: false` changes what the canvas clears to, and three's default is pure black.**
    R3F defaults `alpha: true`, so an unpainted canvas showed the page's `#050507` through it.
    Turning alpha off to save the per-frame composite makes the canvas opaque — and opaque black,
    silently changing the intro's backdrop for the seconds before the sky arrives. `setClearColor`
    is required *by* the change, not incidental to it. General form: switching a buffer from
    transparent to opaque always introduces a colour that was previously somebody else's.
46. **The console is not silent on load in production**, and the check that would have caught
    it is written down in `DECISIONS.md` §16. Three `console.warn` groups naming internal
    Blender nodes fire on every visit — from `cityDistrictBindings` and
    `createTerrainTransition` — because Murcia is *prefetched during the intro*, so they reach
    visitors who never enter the city. The general trap is that second one: anything
    prefetched runs its diagnostics for everybody, not just for the people who use it (audit
    `LOG-1`, open).
47. **GSAP's `seek()` suppresses callbacks by default.** Escape-to-skip and the debug phase
    buttons looked dead: the timeline moved and every `setPhase()` `.call()` was skipped.
    `tl.seek(label, false)` fixes it — and because that then fires *every* callback between the
    current position and the target, the seek handler also has to reconcile the imperative state
    tweens cannot rewind (SVG visibility, filter and transform, the corner logo's pose). The
    general form: a timeline that owns declarative tweens does not own what you wrote by hand,
    so anything seekable needs a reconcile path beside its tweens.
48. **The intro layer must stay mounted, and the bug only appears on the second run.** It was
    conditionally unmounted at `phase === 'site'`, which nulled `svgRef.current`; the master
    timeline bails early with no SVG, so Replay bumped the key and the effect could never
    rebuild — the phase stuck at `site` permanently. The layer is always mounted now and the
    mark's visibility is driven imperatively. The durable lesson is the verification one: **any
    pass over the sequence must include a replay, not just a first play-through.**
50. **A legal import can still land a module in the wrong chunk, and the dependency rules
    cannot see it.** Rollup puts a module that two chunks need into the chunk they *share* — here
    the budgeted app entry — and re-exports it. `orbitConfig.ts` re-exported `SATELLITES`;
    `useMasterTimeline` (entry) imported one number from it, `createOrbitSystem` (scene chunk)
    imported the content; result, every word of case-study Spanish pinned inside a 320,000 B hard
    budget sitting at 97.5%. `checks/architecture.ts` passed throughout, because nothing about the
    *direction* was wrong. **Converting the type-only imports to `import type` changed nothing** —
    esbuild was already eliding them; the fix was deleting the re-export so the module is not
    shared. The general form: a module crossing a chunk boundary should carry only what both sides
    need. Measure it, do not reason about it — `VERTIGO_SKIP_BUDGETS=1 npx vite build` prints every
    chunk's size and imports.
51. **Strip HTML first, decode entities second — and never assert "no `<`" on the result.** The
    content mapper had it backwards in both halves. Decoding first turns `&lt;script&gt;` into a
    real tag for the stripper to delete, silently removing text an author escaped on purpose. And
    a post-condition rejecting any `<` fails on `&lt;5%`, which is ordinary marketing copy —
    a CMS encodes the bracket, decoding legitimately produces it back. The tag check belongs
    *before* decoding, where markup and text are still distinguishable; afterwards only unresolved
    entities are worth rejecting. A literal `<` is harmless here because every consumer renders
    through a JSX text node, `textContent` or canvas `fillText`, none of which parse markup.
52. **Three constants agreed by convention and nothing checked it.** Six orbit presets, six atlas
    cells (`COLUMNS = 2`, `ROWS = 3`) and six case studies. A seventh case would have been
    `slice`d away and then `cellUv` clamped its index back to the sixth cell, so the seventh
    satellite wore the sixth company's logo — no error, no blank, just wrong. `ROWS` is derived
    from the plate count now. Whenever a count appears in three places, one of them is going to
    move first.
53. **U+2028 and U+2029 in emitted source are a parse error, not a rendering quirk.** They are
    valid inside a JSON string but are line terminators to some ECMAScript parsers, and copy pasted
    out of a word processor is a realistic way to acquire one. `emit.ts` escapes them. The same
    characters bit while *writing* that code: a literal U+2028 in the regex made the file itself
    unparseable when evaluated, which is why the pattern is built from an ASCII string
    (`new RegExp('[\\u2028\\u2029]', 'g')`) rather than written as a literal.
54. **`import.meta.dirname` is the bundle's directory, not the repo's.** Anything under
    `scripts/` or `checks/` is esbuild-bundled into `node_modules/.cache/` before it runs, so
    resolving paths against it silently points at `node_modules/`. Resolve against
    `process.cwd()` — npm runs a script from the package root, and it is what every existing
    harness already relies on.

49. **CSS presentation attributes lose to any stylesheet rule.** Setting `width`/`height` as
    *attributes* on an `<svg>` put them at the bottom of the cascade — below the existing
    `.intro-svg` class rule — so resizing the mark did nothing at all and cost a debugging
    session. Sizing flows through a `--intro-size` custom property set inline instead, since
    inline styles beat class rules. Anything overriding a stylesheet from JS on an SVG takes the
    same route.
55. **A 2:1 aspect ratio is not an equirectangular projection, and the metric that proves it
    cannot verify the fix.** The sky source shipped 2026-08-18 is a flat 2:1 image. The only
    guard was `width === height * 2`, which every flat 2:1 image on earth passes, and the
    candidate screen that chose it checked wrapping and whether a galactic plane was present —
    neither looks at a pole. The real test: the shader maps `v = asin(dir.y)/π + 0.5`, so the
    **top row IS the zenith**, one point smeared across all W columns, and in a real panorama
    those pixels are near-identical. Per-channel row sd at the pole over the equator's separates
    them cleanly — ESO **0.029**, every CC0 candidate **0.319+**. Read the gap, not a threshold:
    the reference itself scores 0.152 at its own bottom pole.
    **Measure it PER CHANNEL.** Pooling R, G and B also measures the spread *between* the
    channel means, so a perfectly flat row still scores non-zero — pooled, a pole row that was
    genuinely constant read 0.473, which nearly sent a debugging session after a bug that was
    only ever in the ruler.
56. **`npm audit` in `sanity-studio/` reports 7 findings, and they are accepted — do not run
    `npm audit fix --force`.** It downgrades `sanity` 6.10.1 → 5.14.1, surrendering a major
    version of the Studio to silence findings in `@sanity/cli`. All four flagged packages
    (`js-yaml`, `smol-toml`, `uuid`, `typeid-js`) sit behind `sanity init` / `sanity new`;
    `dev`, `build` and `deploy` never load them, and none reaches a browser. The marketing
    site is a different package and audits clean. **Full assessment, and the conditions that
    would re-open it, in the Dependency audit section of `sanity-studio/README.md`** — read it
    before re-investigating. Two things that make this reproducible rather than folklore: the
    Studio's `package-lock.json` is committed, and `npm run typecheck` inside that package
    checks the schemas against the installed Sanity. It is deliberately NOT part of the repo
    root's `npm run check`, so building the website never requires installing the Studio.
    **Then the expensive half.** The visible defect is a pinwheel of radial spokes on a vertex
    with a hard wedge along the meridian, reported as "you can see the edge of the image". The
    obvious reading — unresolvable detail, therefore aliasing, therefore band-limit each row to
    `1/cos(lat)` — is textbook-correct anti-aliasing, drove the pole ratio from 0.54 to 0.015,
    and **changed the rendered picture not at all**: at 22.5° from the pole that kernel is 2.6
    pixels out of 4096, and the spokes are resolvable content being stretched, not detail being
    aliased. What fixes it is fading each row toward its own **azimuthal mean** over the polar
    caps (`POLE_FADE_START_DEG = 55`, chosen by rendering, not derived) — and the pole ratio
    does not move at all when you do.
    Three general forms, in ascending order of reuse. A conformance check on a *container*
    property (aspect, extension, MIME) says nothing about the *content* it is supposed to
    stand for. A statistic that is a good **screen** for an input can be worthless as a
    **verification** of an output, and the two uses need arguing separately. And when a metric
    and a symptom disagree, **suspect the metric** — the only thing that caught this was
    rendering the pole and looking at it, which is why `scripts/preview-sky-poles.mjs` exists.

---

## 12. State of the work

**Sky projection, 2026-08-20 (`DECISIONS` §19 amendment, `audits/sky-panorama-projection-2026-08-19.md`).**
Reported as "the image is like zoomed" and "you can see the edge of the image". The source is
a flat 2:1 picture rather than an equirectangular panorama, so the poles rendered as a pinwheel
on a vertex with a hard meridian wedge; both poles are reachable by ordinary dragging, and the
warp's 45°→74° FOV surge is where it got noticed. `convergePoles` in the prep script now band-
limits each row *and* fades it toward its azimuthal mean over the polar caps; the second step is
the one that works (§11.55). AVIF moved q50 → q59 because the correction freed the bits.
`scripts/preview-sky-poles.mjs` is new and exists because the metric agreed with a broken
picture. 591 unit tests, 211 harness checks and all 32 e2e pass — **the resting backdrop
baselines pass unchanged**, which is the evidence the correction is confined to the caps.
**Not closed:** the residual "zoomed" look is the source's, not the pipeline's, and the standing
4096×2048 format means it is a fixed 1.76× magnification. Replacing the source is a client
decision, and the pole ratio is how to screen a candidate.

**Navigation feel and Earth chrome, 2026-08-20 (`DECISIONS` §29–30).** The rail was
redressed — journey gradient on frosted glass, endpoint dots in each world's colour — and its
painted progress now runs through a damped spring (`progressSpring.ts`); presentation only,
the accumulator untouched. A once-per-visit gesture hint answers §15's discoverability
objection (mouse glyph on fine pointers, swipe glyph on coarse, dismissed on the first real
gesture). Earth grew its floor chrome: bare `tel:` numbers, legal panels and the brand © in
a site footer, plus a Contacto ghost button with a three-field dialog on the audit form's
demo/production transport rule. Every placeholder — number, address, legal texts — lives in
`src/content/site.ts`, the single swap point. Verified in a browser on desktop and emulated
mobile; 591 unit tests and the backdrop + navigation e2e pass. The © absence assertion in
`backdrop.spec.ts` was narrowed to third-party shapes so the brand's own mark can exist.
**The entry budget paid for it** — see §9: ~3.7 KB of headroom left.

**Content pipeline, 2026-08-23 (`adr/010`, `adr/011`).** Sanity is the editorial source of truth
and the network boundary is the build, not the browser: `npm run content:build` queries,
validates and emits `src/content/generated/`. Strict by default — an unreachable CMS or a failed
validation exits non-zero, fails the deploy and leaves the previous one serving. Scene
composition stayed out of the content type (`orbitAssignments.ts`, `DECISIONS` §28).

WordPress was replaced before it ever ran: the collections requested `_fields=id,slug,title,acf`
and then read flat top-level keys, with nothing between them to unwrap `title.rendered` or the
`acf` envelope. The transport was tested and the mapping never was.

Six collections now: case studies, districts, services, site settings, legal documents and blog
posts. **Media mirroring is built** — `content/lib/mirror.ts` fetches brand logos into
`public/logos/` at build time so `img-src 'self'` is untouched and a cross-origin draw cannot
taint the shared atlas. Editorial imagery stays on `cdn.sanity.io`. Every fixture `logo` is
still `null`, so `createBrandAtlas` draws its plate — the designed fallback — until real
artwork is uploaded.

**Not done, and waiting on the client's Sanity project:** creating the project and dataset,
importing `sanity-studio/scripts/import-fixtures.mjs`, running the fixture-vs-Sanity parity
diff, and wiring the publish webhook to a Vercel Deploy Hook.

**Done.** Both experiences migrated and running in one app. Single renderer, verified as one
canvas. Reversible Earth ⇄ Murcia warp with the dolly, prefetch and GPU warm. Gesture
navigation as the entry point (`adr/009`; the globe marker was removed outright
2026-08-19). Spanish throughout. Murcia's drag navigation, terrain edge, navigation
bounds and district interaction all came across unmodified and their 77 behavioural
assertions still pass.

**Verified in a browser**, not merely asserted: one canvas across three round trips; Murcia
renders with terrain, districts and highlight; Earth restores with correct FOV and no
residual dolly; Murcia's camera returns to exactly `distance 165 / height 82.5` after a warp;
zero console errors; the caption sequence under throttling.

**Touch and pen work (2026-08-11).** Until then the site responded to a mouse and nothing
else — see §11.23 and `DECISIONS.md` §17. Verified against a control, not just after the
fact: 460 emulated taps across the whole globe produced no response on the pre-fix code; the
first tap selects a satellite after it. Also confirmed on an emulated Pixel that the Murcia
tag is visible without hover and that tapping the label enters the city, on both the dev
server and the production build. Mouse behaviour is unchanged by construction — picking at
the click's coordinates and picking at the hover position are the same point on a mouse.

**Real client logos are wired (2026-08-11).** `CaseStudy.logo` was declared, documented and
never read by anything; it now drives the brand atlas. Still `null` on all six, so nothing
visible changed — the pipe works, the artwork is a content decision (`DECISIONS.md` §18,
`earth/logo-spec.md`).

**The Vercel readiness audit was re-run (2026-08-11)** —
`audits/production-readiness-vercel-2026-08-11.md`, a delta against the 2026-08-07 pass, which
is left intact as the record of that one. Status unchanged in shape: **ready to deploy, not
ready to publish**, and the publish blockers are still content rather than engineering.

What it settled that had never been checked: **the production SEO branch had never once been
executed** — every build until then ran the development path — and it is correct; the build is
byte-for-byte deterministic; `npm ci` from the lockfile alone succeeds; and all three
documented failure classes behave as designed *on the production build* (§10). It also found
that the harnesses are not on the deploy path, that there is no observability at all, and the
GLB discrepancy in §9 — all three now in Known debt below.

Two things it fixed: a diagnostic wired into Murcia's production click path (§11.41) and a
`.gitkeep` that shipped with prose in it. Two it deliberately did not: gating the load-time
console warnings (§11.46) and reverting the GLB.

**One verification gap is worth repeating: only Chromium has ever been tested.** WebKit and
Firefox are not installed here, and Safari on iOS is where the KTX2 transcoder and
`compileAsync` are most likely to differ. That is the largest remaining unknown, and no code
change can close it.

**A leak-and-crash pass landed with it.** Undisposed composer passes and prop-attached
geometry; loads outliving teardown; a promise cache that remembered rejections; degenerate-
input crashes in the charts and the sphere sampler; and the fixed-length array coupling in
§11.30. All behaviour-neutral. The traps are recorded in §11 (23–30) because each is a class
of bug, not a one-off.

**The backdrop is a galaxy (2026-08-11).** The resting scene's stars were "equal in form,
colour and distance" — all three literally true, and the first structurally so, since
`PointsMaterial` has no per-point size and magnitude was faked with three `Points` objects.
Now one draw call with continuous magnitude and stellar colour, clumped along a galactic
band, over a procedural nebula baked to a cubemap during P0 for **zero download bytes**.
Numbers in §9, reasoning in `DECISIONS.md` §19, six new sliders on `/debug`.

**Visually verified, and that mattered more than usual**: three defects passed both design
and code review and were caught only by reading back screenshots (§10, §11.32). It is the
first feature in this project the assistant has judged against pixels rather than handing to
the user unseen. Whether it looks *right* is still the user's call.

**Not verified.** The warp **at frame rate**. Software WebGL runs the city at ~2 fps and
`lagSmoothing` then distorts every mid-transition frame, so how the motion actually *feels*
is unjudged. The timings in `app/warpTransition.ts` are reasoned and endpoint-asserted but
tuned blind — they need a person on real hardware.

**Mobile and iOS were audited, and P0+P1 remediated (2026-08-14).**
`audits/mobile-responsiveness-2026-08-14.md` and `audits/ios-safari-2026-08-14.md`, both written
against the briefs of the same name, both carrying their own remediation-status section.

The mobile verdict was *functionally usable, architecturally sound, blocked on two content
surfaces* — not "desktop-first", which the code does not support: the capability-based branching
was already the right pattern and the gaps were specific. The two blockers were both on the
surfaces that carry the product's content: **Murcia's districts could not reliably be tapped**
(one 6 px threshold for mouse and finger, so a real tap was discarded as a drag), and **the Earth
case panel was unusable in portrait twice over** — the camera flew the subject off-screen to
clear room for a 142 px column.

The iOS verdict was *contains significant iOS risks*, on two compounding findings: **no
`webglcontextlost` handling at all** — a lost context is a DOM event, so the error boundary
structurally could not see it and the visitor got a permanent silent blank — on top of **~280 MB
of GPU working set that is never released**, which is what makes context loss the expected end of
a long mobile session rather than a curiosity.

All P0 and P1 items are fixed. Phone texture memory is down 134 → 34 MB, five decoder pools are
down to at most two, `AfterimagePass` no longer runs two full-resolution passes per frame to
compute a no-op, and a lost context now says so in Spanish with a reload action. Decisions in
`DECISIONS.md` §23–25.

**The verification gap is unchanged and must not be read as closed.** Two emulated mobile
Playwright projects were added and **both are Chromium** — the config says so in as many words.
Nothing here has run on iOS, WebKit, or any Safari. The device matrix and test protocol in the
iOS report are what would move those findings from *strongly inferred* to *verified*.

### Known debt

| | Why it is deliberate |
|---|---|
| **Vite pinned at 5** | The two custom build plugins are validated only against 5. A bundler bump deserves its own verification pass, not a ride-along inside a migration. |
| **`noUncheckedIndexedAccess` off** | Murcia was written under it, Earth was not. Enabling it repo-wide produces 36 errors, 16 of them inside the 16 KB intro budget. Restore in a dedicated pass. |
| **Placeholder content** | Case studies are invented, and every `logo` is still `null` — real trademarks beside invented results read as endorsement. The pipeline that replaces them exists (`adr/010`, `adr/011`): Sanity is read at build time and emitted as `src/content/generated/`. **Replacing the copy now means replacing it in two places** — the CMS, and `content/fixtures/` + `content/seed/`, which are what `npm run dev` and CI build against. Media mirroring is built; what is missing is uploaded artwork. |
| **No keyboard path into the 3D** | Touch and pen work as of 2026-08-11, but satellites are still raycast-only. (The Murcia marker and its geo tag are gone entirely, 2026-08-19 — the focusable rail is the path between worlds.) `A11Y-1` in the readiness audit is narrowed, not closed, and closing it means real markup — the `districtLabel.ts` button pattern applied to the globe. |
| **`label` is unread** | `CaseStudy.label` is declared and nothing renders it — the brand atlas draws `name`. Kept because it is a reasonable short-form field for a CMS to carry. (`orbitId` was the other half of this row and is **resolved**: it left the content type entirely on 2026-08-20, because which case rides which orbit is scene composition — `orbitAssignments.ts`, `DECISIONS` §28.) |
| **District resolves by node name** | The GLB carries no `extras`. Fix is in Blender — see `murcia/blender-export-contract.md` — not in code. |
| ~~**Two KTX2 loaders**~~ | **Closed 2026-08-14.** It was worse than recorded — three `DRACOLoader`s as well, so up to twenty workers and ~1.6 MB of duplicated WASM alive together during the intro. One of each now, reference counted, in `graphics/decoders.ts`. `DECISIONS.md` §24. "Harmless" had been assessed against a desktop. |
| ~~**Corner logo z-order**~~ | **Closed 2026-08-19.** The geo-tag layer at z 15 was the only thing that could paint over the logo, and it went with the marker system. |
| ~~**`check:navigation` cannot fail a build**~~ | **Closed 2026-08-13.** `checks/lib/assert.ts` owns the exit code for all five harnesses. §10. |
| ~~**The harnesses are not on the deploy path**~~ | **Closed 2026-08-13.** `npm run build` runs the unit tier and all five harnesses before `vite build`; `vercel.json` still sets no `buildCommand`, so Vercel runs it. Verified by forcing each kind of failure. Audit `VER-1` closed. §10. |
| **Only Chromium is ever tested** | Unchanged, and now also true of all three Playwright projects — the two mobile ones added on 2026-08-14 are Chromium with a device profile, which makes `(hover: none)` and `(pointer: coarse)` rules apply but says nothing about WebKit. iOS Safari is still where the KTX2 transcoder and `compileAsync` are most likely to differ. **No code change closes this**; the device matrix in `audits/ios-safari-2026-08-14.md` §4 is what would. |
| **Murcia has no portrait camera pose** | `cameraPortraitOverrides` is built, unit-tested and fed `null`, so `resolveCameraPose` returns the landscape pose at every aspect — and the pose itself is tuned against wide viewports, with a footprint analysis that only guards *too large*. Deliberate: any resting-pose change invalidates the terrain-skirt margin and needs the full azimuth sweep (§5) plus a composition judged by a person. Named as architectural in the mobile audit (M9) rather than patched. |
| ~~**Six case markers are invisible on touch**~~ | **Closed 2026-08-17.** The five case city markers were retired outright — they carried placeholder copy and were never going to be used. `GEO_MARKERS` collapsed to a single `DESTINATION_MARKER`, so the only tag left is Murcia's, which already had the `(hover: none)` fallback. Mobile audit M10 no longer has a subject. |
| **The `.reveal` ordering is unasserted** | §8 claimed `checks/` verified it in the built CSS. No such check exists or ever did; the claim was corrected rather than implemented. The ordering is currently held by source order alone. |
| **No analytics, no error reporting** | Production failures will be completely invisible after launch. The instrumentation already exists (`bootState.fatalReason()`, `pending()`, `readiness()`); what is missing is a sink. Audit `OBS-1`. |
| **The city GLB in the working tree ≠ the committed one** | ~3× the nodes and +790 KB, uncommitted, still without `extras`. Needs an owner's decision before it ships. §9, audit `ASSET-2`. |

### Open questions

Closed, kept here because each was open long enough to shape the code:

- ~~The drag feel is unvalidated by human hands.~~ **Validated 2026-08-06, and the original
  design rejected.** §7.
- ~~Whether 180° per viewport width is the right rotation sensitivity.~~ **No — 120°.**
- ~~The district copy is English while its label is Spanish.~~ **Settled: Spanish**, per
  `DECISIONS.md` §11.
- ~~Interactive objects need `extras` before selection can be tested.~~ **Worked around, not
  closed.** `resolveDistrict` resolves by node name against a stand-in cluster, so the
  interaction is testable now; the `extras` tag remains the production mechanism and the
  district is still a placeholder until the re-export lands.

Still open:

- **The whole district interaction is visually unjudged.** Marker legibility, glow strength,
  flight duration, approach yaw and panel timing are all reasoned or measured, none judged —
  the same status the drag feel had before it was driven by hand and rewritten. Expect the
  numbers in `defaultDistrictHighlightConfig` and `CameraFlight` to move.
- **`approachYawDegrees: −35`** was chosen to keep the river strip out of the composition.
  That is a guess about framing, not a measurement.
- **`initialFocus` is the plate centre**, chosen arithmetically. It also determines Murcia's
  opening heading, and neither has been judged as a composition.
- **Whether the rectangular fade reads correctly**, or the coastline needs following (§6).
- **The monochrome look has not been confirmed as intended.** The GLB has no materials.
- **Whether losing strafe is acceptable.** Free yaw was chosen over sideways panning because
  one gesture cannot carry three axes. If it turns out to matter, the fallback is
  dominant-axis locking at drag start — modal, and worse in every other respect. It survived
  the feel review without being raised, which is weak evidence for it, not a decision.
- **The service copy is placeholder**, written to give the layout realistic text lengths. It
  is marked as such in `content/fixtures/district.json`, which is what `npm run dev` and CI
  build against. Replacing it means replacing it in Sanity AND in the fixtures and seed.

---

## 13. Map of the code

```
src/
├── main.tsx, App.tsx          application shell and orchestration
├── app/                       experience identity, transition, warp curves
├── graphics/RenderPipeline    the single render authority
├── intro-draw/                the loading drawing — STANDALONE, imports nothing
├── components/                R3F layers, and the adapters into each experience
├── corner-logo/               3D logo, drawn as an overlay pass
├── content/                   types, invariants, lookups, site.ts (brand/contact/legal placeholders) + generated/ (BUILD OUTPUT, gitignored)
├── experiences/earth/         the globe — orbits, satellites, camera, timeline, space
├── experiences/murcia/        the city — its own Scene, camera, rig, UI
├── interaction/               cursor arbitration and NDC
├── shaders/, utils/, loading/
content/                       the Node-side content build — collections, lib, fixtures, seed
scripts/build-content.ts       fetch -> validate -> emit. Iterates the registry; knows no collection
checks/                        the behavioural harnesses (six)
checks/lib/                    the shared assert vocabulary and the stub canvas
e2e/                           Playwright smoke specs + committed screenshot baselines
*.test.ts                      unit tests, beside the module they cover
```

`scripts/simulate-intro.mjs` was retired on 2026-08-13; its eight scenarios are
`src/intro-draw/playhead.test.ts`.

Inside `experiences/murcia/`: `config/` (pose, feel, skirt, query overrides) · `camera/`
(rig, flight, framing, warp pose) · `navigation/` (drag controller, bounds, viewport
footprint) · `environment/` (collar, skirt, boundary extraction) · `interaction/` (district
resolve, highlight, state machine) · `assets/` (loader, city load, node names) · `scene/`
(district bindings) · `ui/` · `styles/`. **Its `content/` folder is gone** — district copy moved
to `src/content/` on 2026-08-20, because `checks/architecture.ts` forbids either experience
importing the other and Earth needs the same vocabulary (`adr/010`).

`src/content/invariants.ts` is imported by BOTH the vitest suites and the Node content build, so
it is pure by rule: no Node APIs, no DOM, no imports beyond types. It is the one place the bounds
are written down — a bound relaxed there is relaxed for the validator and the test at once, which
is the point.

**No module reaches for a global renderer, Scene, camera or config.** Every dependency
arrives through a constructor. That property is what made Murcia's migration a move rather
than a rewrite, and it is worth preserving for the same reason.

`src/space/` splits the same way and for the same reason: `galaxyBand.ts`, `spaceConfig.ts`
and `starDistribution.ts` are pure and Node-safe so `check:space` drives the real modules,
while anything touching `.glsl` or a renderer (`starShader.ts`, `bakeNebulaCubemap.ts`) stays
out of that path. **`bandDensity` has a deliberate twin in `shaders/nebula/bake.frag.glsl`** —
kept to one line so the duplication cannot hide a discrepancy, with the axis and width passed
in as uniforms so only the gaussian is duplicated. Change one, change the other.

`app/warpTransition.ts` is deliberately free of three, React and the DOM, so `checks/` can
drive the real curves rather than a reimplementation. Keep it that way. It holds the
envelope and the Earth leg only — Murcia's pose mapping lives in
`experiences/murcia/camera/warpPose.ts`, because nothing under `experiences/` may import
upward from `app/`, and because how a city may be approached or left is a property of its
terrain skirt (ADR 006). `check:warp` imports from both, plus the real `applyPoseToCamera`
and `computeGroundFootprint`.
