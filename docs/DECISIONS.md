# Decisions

The decisions that shape this project, and what is true **now** as a result.

Last updated: 2026-09-09 · §42 added (the blog is entered through a display, and the approach is
the transition; the cluster tap is removed) and amended the same day (the panel is halved to 24
units at elevation 19, and the plate's world-unit terms with it). Earlier: 2026-09-08 · §39 added (the camera never leaves the navigable area; Murcia's pose
rises to 35 degrees at distance 220) and §20 amended. Earlier: 2026-08-23 · §31 added (the CMS is Sanity, and the editable surface grew to services,
site settings, legal and the blog); §27 and §30 amended. Earlier: 2026-08-20 · §29–30 added (the
rail's presentation and the gesture hint; contact,
legal and the brand's own mark); 2026-08-17 · §26 added and `earth/DECISIONS.md` retired
into it, making this the only decisions file in the repository; 2026-08-14 · §23–25 added after the mobile and
iOS/Safari audits (context loss, decoder ownership, mobile as a target); 2026-08-13 · §21–22
added and §12, §19, §20
amended (plan 000, the drag gain, the ESO credit); 2026-08-11 · §17–18 added against the working
tree, post-`c1fa2cc`; §19 added post-`b418b5f`

---

## What belongs here

A decision earns a place in this file when reversing it would be expensive — when it
changes ownership, dependency direction, the lifecycle, the asset pipeline, the build
contract, or the product's visual language.

**This file is not a changelog.** It records *why the project is the way it is*, in a form
that stays useful after the reasoning has been forgotten. Each entry states the decision,
what it rules out, and how you would know it had been broken.

### Where things live

| Document | Job |
|---|---|
| **`DECISIONS.md`** (this file) | The binding decisions, and the current state of each. The first thing to read. |
| `adr/` | One file per architectural decision, with alternatives and trade-offs in full. Linked from here; not duplicated here. |
| `PROJECT_MEMORY.md` | Durable facts: what exists, the numbers that keep mattering, the traps. **The only one** — Murcia's separate memory was folded into it on 2026-08-07. Cite its sections by title, never by number. |
| `integration/00-migration-log.md` | The execution record, phase by phase. History, not policy. |
| `ARCHITECTURE.md` | The architecture as it should be. Binding. |
| `ENGINEERING_PRINCIPLES.md` | How to work in this repo. Binding. |
| `murcia/blender-export-contract.md` | What the runtime reads out of the GLB and what must be true in the `.blend`. Read before any re-export. |
| `content/sanity-field-contract.md` | What the content build expects from the CMS, field by field, with the rule and what happens when it is broken. Written to be handed to whoever edits the content. |
| `content/sanity-media-contract.md` | Where uploaded media lives, which formats are accepted, what is mirrored into the deployment and what stays on the CDN. Separate on purpose. |
| `content/wordpress-field-contract.md` | **Superseded** 2026-08-23 by the two above (`adr/011`). Kept because the WordPress security audit was written against it. History, not policy. |
| `audits/reports/security-wordpress-api-2026-08-11.md` | The security surface of the CMS integration **as it was designed against WordPress**. Read its 2026-08-20 addendum, then `adr/011` — the CMS is Sanity now, which removes the install the threat model was mostly about. |

### How to update it

Append. Do not rewrite history — if a decision is reversed, add a new entry that says so and
mark the old one **Superseded**, with a pointer. A decision whose entry silently changed is
a decision nobody can audit.

Keep entries short enough to read in full. If one needs more than a screen, it wants an ADR.

---

## 1. Two prototypes converge into one application

**Decided.** `starting-animation` (Earth: React + R3F) and `murcia-test` (Murcia: vanilla
three) become one application rather than two pages or two bundles.

**State.** Done. Earth migrated verbatim, Murcia's shell duties dissolved into the app with
every one of its logic modules untouched. Both source repos remain as reference
implementations and should not be edited.

**Why it held together:** Murcia's modules were already constructor-injected with no global
renderer, scene or camera. Its own memory predicted the port would be "a move rather than a
rewrite", and that is exactly what it was — which is why its 77 behavioural assertions still
pass unmodified.

---

## 2. One renderer, one canvas, one frame loop, one render authority

→ **`adr/001-renderer-and-scene-ownership.md`**, **`adr/002-single-render-pipeline.md`**

**Decided.** R3F owns the single `WebGLRenderer`. `graphics/RenderPipeline.tsx` is the only
thing that renders anything.

**State.** Done, and measured: exactly **one WebGL canvas** in the running app, verified
across three Earth ⇄ Murcia round trips. Down from two in `starting-animation` (the corner
logo had its own) and would have been three once Murcia landed.

**Ruled out.** A second renderer for anything. A second frame loop. Any `gl.render()` call
outside `RenderPipeline`.

**How you would know it broke.** `document.querySelectorAll('canvas').length > 1`, or a
`new WebGLRenderer` anywhere in `src/`.

---

## 3. Two `THREE.Scene`s, not one

→ **`adr/001-renderer-and-scene-ownership.md`**

**Decided.** Earth and Murcia each own a `THREE.Scene`. The transition swaps which one the
pipeline draws.

**Supersedes** the Murcia prototype's one-Scene rule, which mandated a single shared Scene.
That was written when "the other environment" meant another *city*, not a React-reconciled
R3F scene. Its renderer/canvas/loop clauses are honoured exactly; only the one-Scene clause
is overridden.

**Why.** A shared Scene breaks on Murcia's own documented rules: a detached-but-present root
is still walked by raycasts, `Box3.setFromObject` and `traverse`, and lights and fog are
Scene-global — Earth's two lights and Murcia's two would cross-light each other's world
permanently.

---

## 4. Both experiences stay mounted; nothing is destroyed at a transition

→ **`adr/003-experience-lifecycle.md`**

**Decided.** `activate`/`deactivate` is a boolean, not a lifecycle phase. Deactivated means
**frozen, not reset**: every gate is an early return, so a return resumes the camera pose,
the orbit clock, the surface spin and the drag state the viewer left.

**State.** Done. Earth ⇄ Murcia is reversible.

**Ruled out.** Rebuilding a world on entry. That is precisely the cost the product
requirement forbids — a rebuild means re-uploading geometry and recompiling shaders at the
exact moment the viewer is watching.

**Price.** Peak VRAM holds both worlds. Accepted and bounded.

---

## 5. The transition never waits

→ **`adr/004-transition-and-prefetch.md`**

**Decided.** Murcia is fetched, parsed and GPU-warmed **during the Earth intro**, as a
`required: false` entry in the boot manifest. It contributes to the drawing's progress but
can never gate readiness.

**State.** Done. Warming is two operations, because `compileAsync` covers only one:
shader programs and textures via `compileAsync`, then **one render into a 1×1 render target**
to force the geometry attribute buffers up. 957 GPU-instanced buildings landing on the
transition frame is exactly the hitch this avoids.

**Ruled out.** Loading on demand. A loading state inside a transition.

---

## 6. Nothing ever cross-fades

**Inherited and upheld** — from the Earth prototype, which called it "the single most important
visual principle in the project". The mechanism at the 2D→3D crossover is **§26.8**.

**State.** Every substitution in the app is a hard cut timed to a concealment beat: the
starfield → Earth cut, the 2D mark → 3D logo crossover, and the Earth ⇄ Murcia swap.

**Consequence worth naming:** it is also what makes the transition cheap. At the cut only
one scene is ever drawn, so there is no frame that renders both worlds.

---

## 7. The Earth ⇄ Murcia transition is the intro's warp, and it knows which way it is going

→ **`adr/005-warp-transition.md`**, amended by **`adr/006-the-return-is-an-ascent.md`**

**Decided.** One progress value read through the intro's three curves with their nested
widths — position full, speed ±0.34, flash ±0.17 — rather than a second motion vocabulary.
The cut lands under the most extreme, most covered frame.

**The envelope is not a direction.** It rises for the world being left and falls for the
world being entered, and says nothing about which way either of them moves. Each world maps
it onto its own departing and arriving poses:

| | Earth → Murcia | Murcia → Earth |
|---|---|---|
| Earth | radius ×1 → ×0.25, plunging in | radius ×0.25 → ×1, receding |
| Murcia | 75 → 165, settling back | **165 → 180 while rising 30° → 50°** |

**Descending is not ascending.** One mapping used to serve both roles, so the world being
left always rushed *in*. Right going down into Murcia; wrong coming back, because Murcia is
inside the Earth — it drove the camera forward through the city and then cut to a globe.

**The return had to be bought with elevation.** Both obvious ways to make a city look
smaller — more distance, wider FOV — widen its ground footprint, which is the one thing the
skirt cannot absorb. Steepening the pitch shrinks it instead, faster than the extra distance
grows it, so the risen pose reaches *less* far than rest.

**Ruled out.** Any Murcia pose that reaches further across the ground than the resting pose
does. That, not a distance, is the constraint — 180 @ 50° is safe and 200 @ 30° is not, and
no distance bound tells them apart.

**How you would know it broke.** `npm run check:warp` fails — §6 runs the real
`computeGroundFootprint` over 19 296 poses, including 5120×1440.

---

## 8. Each experience moves its own camera

**Decided.** The transition publishes `state.transitionProgress` and fires the swap. It
drives no camera. Earth and Murcia each read that number and move their own.

**Why.** It is the only reason the two experiences still know nothing about each other after
gaining a shared transition. `ARCHITECTURE.md` §13: camera behaviour belongs to the
experience that defines its interaction model.

---

## 9. Exactly one camera owner per frame, always

**Inherited and upheld** — from the Earth prototype. Two writers per frame is the failure
the source project removed `OrbitControls` to avoid.

**State.** The chain is now: `CameraController` owns the intro → hands to the focus rig at
`site` → the rig **stands down** during a warp (by not being called, never by being
deactivated — `activate()` reseeds from the overview pose and would discard the viewer's
position) → `CameraController` drives the dolly → hands back.

On the Murcia side the warp owns `distance` and `elevationDegrees`; `DragPanController` owns
focus and yaw. They compose without either taking external control, because `setFocus` and
`setYaw` re-apply whatever pose is current rather than re-deriving one from config.

---

## 10. The intro's loading is real, and says so in Spanish

**Inherited and upheld** — the drawing is driven by measured asset progress, never a timer,
and will not release into an unready scene.

**Added 2026-08-07.** A caption under the mark, driven by **measured load and readiness
only** — never by the drawing's own playhead.

That distinction is the whole point. With no measured progress the autonomous curve still
carries the outline to the pre-ready limit and holds it, so the drawing can look nearly
finished while nothing has downloaded (observed: `visual=0.815` at `measured=0.361`). A
caption reading the playhead announced "Casi listo" over an empty cache — reassuring, and
false.

---

## 11. The site is Spanish

**Decided.** All user-facing copy is Spanish. Placeholder content is Spanish placeholder
content, not English awaiting translation.

**Exempt:** the `?debug=1` overlay's field labels. They are a developer tool, never shown to
a visitor, and their names are how the fields are talked about in the docs.

---

## 12. Guard behaviour on the artifact, not on review

**Inherited and extended.** The intro chunk's standalone-ness is asserted on the emitted
bundle rather than on imports, because standalone-ness breaks equally through a dynamic
import, a global or a side-effectful module — and review would not catch it.

**Extended to the warp.** `checks/warp-transition.ts` asserts the camera-distance envelope
against the real curve module over a 2000-sample sweep. It exists because the failure it
guards is invisible on the machine the change is made on: it only shows on ultrawide.

**The rule.** When a constraint's failure is invisible where you work, assert it. Care is
not a mechanism.

**Extended again, 2026-08-13 — and until then this entry described an aspiration.** The
assertions existed; nothing ran them. `npm run build` was `tsc -b`, the intro simulation and
`vite build`, so Vercel ran neither the harnesses nor anything else, and `check:navigation`
could not have failed a build even if it had been run — it printed failures and left the exit
code at 0. Both are now closed (`PROJECT_MEMORY` §10):

- `npm run build` is `npm run check && vite build`, where `check` is
  `typecheck && test && check:harnesses` and npm's `precheck` hook runs `content:build` first
  (§27). `check:harnesses` gained `check:studio` on 2026-09-05 — the Sanity Studio's own
  typecheck, run from the root, which SKIPS with a stated reason when that package's
  `node_modules` are absent. That skip is deliberate and is what keeps a Vercel deployment
  from depending on the Studio's dependency tree being installed. Verified by forcing a failing unit test and a failing harness assertion and confirming
  `vite build` is never reached, rather than by reading the script. (It was written here as
  `tsc -b && npm run test && npm run check:harnesses && vite build` when this section was
  decided; the shape moved into `check` on 2026-08-13 and gained the content step on 2026-08-20.)
- The exit code lives once, in `checks/lib/assert.ts`, and is counted live. The three
  hardcoded summary totals went with it — one of them had drifted to 32 against 36 real
  assertions.

**The corollary, which is the part worth keeping:** *an assertion nobody runs is a comment,
and an assertion that cannot fail is a lie.* Both had been true here for months while the
repository read as though it were well guarded. When adding a check, the question is not only
"does it hold" but "what makes this run, and what happens when it does not hold".

**Ruled out.** A `VERTIGO_SKIP_TESTS` escape hatch. `VERTIGO_SKIP_BUDGETS` exists so a
developer can inspect a bundle the assertion aborted, which is a real need; there is no
equivalent here, and an escape hatch on the gate is the gate.

---

## 13. Migration and refactoring stay separate

**Inherited** — `ENGINEERING_PRINCIPLES` §19. Upheld through the whole migration: Earth
came across byte-for-byte first (identical emitted chunk hashes), and structural change came
afterwards, phase by phase.

**Two consequences still open**, both deliberate debt rather than oversight — see
PROJECT_MEMORY, *Known debt*: Vite is pinned at 5, and `noUncheckedIndexedAccess` is off.

---

## 14. The custom cursor is global, so every hover source must publish a hint

**Decided 2026-08-07.** `CustomCursor` mounts once for the whole session. It is not gated on
the active experience. Every source that wants to change the cursor goes through a
`CursorManager`, and each experience owns one.

**Reverses** the P4 gate `{earthActive && <CustomCursor />}`, recorded in
`integration/00-migration-log.md` under "Earth UI gated on `earthActive`".

**Why the gate was wrong.** Mounting installs `cursor: none` on `<html>`; unmounting strips
it. So entering Murcia did not merely leave the hand behind, it handed the viewer the native
arrow back mid-session — the one outcome the custom cursor exists to prevent. The stated
reason, that two writers would fight over the property, could not happen: `cursor: none` is
`!important`, so Murcia's native writes were being discarded, not competing.

**What makes it safe now.** A native `style.cursor` write is invisible while the cursor is
mounted, so it cannot be the mechanism. `cursorSignal` is. Murcia's district hovers and drag
publish through a manager of its own; Earth's geo markers, which the prototype's own notes claimed had been
converted and never had, shared the manager `InteractionLayer` creates (the markers were
removed outright 2026-08-19; satellite focus still publishes through that manager). The
native write survives underneath as the coarse-pointer fallback.

**Two managers, not one, and not one per source.** One arbiter per element is the whole
point — a second arbiter on the same canvas restores the last-writer-wins flip-flop the
manager was built to remove, which is why the geo markers borrow Earth's rather than making
their own. Earth and Murcia are the exception: they are never live at the same time, and each
needs to drop *its own* whole set of requests on going inactive. Hovers are resolved in
`update()`, which stops when an experience deactivates, so anything held at the cut could
never be retracted.

**How you would know it broke.** Enter Murcia and the pointer becomes an OS arrow. Or: hover
a district, open it, and the pointing hand stays up under the panel. Or: return to Earth with
a district hovered and the hand never relaxes.

---

## 15. The warp is triggered by a control, never by scroll

> **REVERSED 2026-08-19 — `adr/009-navigation-is-a-gesture.md`.** The warp is now driven by a
> gesture: wheel on desktop, a two-finger pinch on touch (a right-edge rail until `adr/012`),
> accumulating deliberate progress
> and committing at a threshold. The control is gone — `ReturnToEarthControl` is deleted and the
> Spain marker no longer navigates. This was a **product decision, not a technical argument**,
> and the reasoning below is preserved rather than deleted because most of it is still true and
> it is what the replacement had to answer. ADR 009 takes the four objections below in order.
> The one it does *not* answer is the fourth: keyboard and assistive-technology access between
> the two worlds is a recorded regression. See also §20/§21 — zoom is gone entirely, and that is
> what freed the wheel.

**Inherited and upheld until 2026-08-19** — decided in the Murcia prototype before either
direction of the warp existed, and recorded here because its own memory has since been folded into
`PROJECT_MEMORY.md` and this is the only reasoning in it that is a *decision* rather than a
fact.

**Decided.** Entering Murcia is a click on the Spain marker; leaving it is a button. Neither
direction is ever driven by wheel, trackpad or scroll position.

**Why.**

- **Touch has no `wheel` event**, and single-finger drag is committed to navigation, so a
  tappable control has to exist regardless. Scroll could only ever be a desktop-only alias
  for it.
- Mouse wheel and trackpad produce incomparable event streams — discrete notches against a
  continuous stream with post-release momentum.
- An accidental scroll would warp the viewer into another world.
- The page is `overflow: hidden` with a full-viewport canvas, so nothing signals that scroll
  does anything; an affordance has to be drawn anyway.
- A `<button>` gets keyboard access, focus and an accessible name for free.

**Consequence already in the code.** `DragPanController` registers a non-passive `wheel`
listener purely to `preventDefault` it. Wheel is actively suppressed, not merely unbound.

**Ruled out.** Layering a discrete scroll trigger on top of the control later. It would keep
the accidental-trigger risk and add nothing. A scroll-driven warp, if ever wanted, is
continuous scrubbing — a different and much larger feature.

---

## 16. Production and preview are different builds, and the difference is one flag

→ **`audits/reports/production-readiness-vercel-2026-08-07.md`**, **`adr/007-loading-has-a-deadline.md`**

**Decided 2026-08-07**, during the production-readiness audit.

**Decided.** `src/app/buildFlags.ts` exports `DEBUG_TOOLS_ENABLED`, false only when
`VERCEL_ENV === 'production'`. It gates the `/debug` tuning console, every query-parameter
override (`?stats=1`, `?debugNavigation=1`, `?dragGain=`, `?model=` …) and all diagnostic
logging. Local development and every Preview deployment keep the lot.

**Why not simply delete them.** They are how this project is tuned, and a preview deployment
— real hardware, real network, noindexed, unlisted — is exactly where you want the FPS meter
and the bounds wireframe. What was wrong was not their existence but their reach: `/debug`
was a live unlisted page on the public origin, and 26 `console.info`/`table` calls dumped
plate geometry into every visitor's console on every load.

**The flag is threaded as a parameter into `src/experiences/**`, never imported there.** Two
independent reasons, both already established: `src/experiences` may not depend upward on
`src/app` (§8, `ARCHITECTURE` §13), and `checks/` bundles those modules for Node with
esbuild, where `import.meta.env` does not exist (`scene/cityDistrictBindings.ts`).

**It is a compile-time literal**, injected by `vite.config.ts` via `define`, so the debug
panel is unreachable code the minifier removes. That is not incidental — the app entry chunk
sits against a hard 320,000 B budget that *fails* the build, and dropping the panel bought
back 4.3 KB.

**The same switch decides the SEO surface.** `robots.txt` and `sitemap.xml` are generated at
build time, not committed: production allows crawling, **preview serves `Disallow: /` and a
`noindex` meta**. Canonical and `og:url` come from `VERCEL_PROJECT_PRODUCTION_URL`, so a
preview names production rather than itself and never competes with it in the index.

**Ruled out.** Committing a static `robots.txt` — it cannot vary by environment, and the
failure mode (previews indexed as duplicate sites) is slow and awkward to undo. Reading
`import.meta.env` inside `src/experiences`. Gating on hostname at runtime, which would ship
the panel and rely on a string comparison to hide it.

**How you would know it broke.** `curl <preview>/robots.txt` returns `Allow: /`. Or `/debug`
renders the tuning panel on the production domain. Or the console is not silent on load.

**Depends on Vercel system environment variables being enabled** in project settings. Without
them every build looks like `development`: the debug console ships and production says
`Disallow: /`. That is the one deployment setting this repo genuinely requires.

---

## 17. 3D picking resolves from the event's own coordinates, never from a stored hover

**Every raycast that decides an action takes `clientX, clientY` and returns an answer.** No
handler may read a hover result computed on a previous frame.

The site was mouse-only for its entire life because of the opposite rule. A tap fires
`pointerdown → pointerup → click` with **no `pointermove` in between**, so a hover computed
from `pointermove` is never computed at all on a touch device — it stays `null`, and every
handler that consulted it silently did nothing. `createSatelliteFocus.onClick` took no event
argument, which made it structurally incapable of resolving a target; `createGeoMarkers`
already *had* the release coordinates and threw them away to read `hoveredMarker`. That
second one is the only door into Murcia, so the whole city was unreachable by touch.

The pattern was already in the repo and already correct — `DistrictInteraction.pickAt`, which
is exactly why Murcia's *interior* was the one part that always worked on a phone.

Hover remains a separate, mouse-only concern: it is still evaluated per frame from the last
`pointermove`, because satellites keep moving when the pointer is still (**§26.2**, "selection
is React state; hover is not"). What changed is that **nothing acts on it**.

**A corollary, and it is not optional: tap tolerances are per pointer type.** A finger wanders
5–15 px between contact and release. The 4 px and 5 px thresholds are correct for a mouse and
reject most real taps as drags, so touch gets its own number and mouse and pen keep theirs
untouched. One threshold for both input classes is not a compromise, it is a bug for one of
them.

**Ruled out.** Synthesising a `pointermove` before the tap, which fakes a hover state the
device does not have and leaves a satellite highlighted after the finger is gone. Lowering the
mouse threshold to suit touch. Adopting R3F's event manager, which is mounted but unused —
correct for touch, but it would mean rewriting all picking rather than fixing it.

**How you would know it broke.** Any handler that raycasts without taking coordinates. A
`getDragClickThreshold()` that ignores pointer type. Or the whole-scene symptom: on a phone,
nothing responds and nothing errors.

---

## 18. The brand plates are a drawn floor that real logos upgrade, and readiness never waits on artwork

`createBrandAtlas` rasterises its placeholder plates **synchronously**, then loads any real
`logo` URLs in the background and redraws those cells when they land. A logo that 404s, fails
CORS, or decodes to nothing keeps its drawn plate. **A panel is never blank.**

This is why the build stays synchronous. `orbits:build` is a *required* boot resource and the
whole orbit system is constructed inside one effect — making the atlas await its images would
put decorative artwork on the readiness path, where a slow media host holds the loading screen
hostage. That is precisely the failure the required/optional split exists to prevent
(`adr/007`). Timing is generous anyway: the first panel's opacity leaves zero ~2 s into the
reveal.

**`logo` is a single string, and that is the entire media seam.** `/logos/mango.webp` — and it
stays a local path under `/public` even once the artwork comes from WordPress, because the
content build **mirrors** CMS uploads into `public/logos/` rather than hotlinking them (§27,
`adr/010`). Everything therefore stays same-origin: no `Access-Control-Allow-Origin` on the CMS
media path, no origin added to `img-src`, no CSP edit at all, and `vercel.json`'s existing
`/(earth|models|textures|libs|draco|logos)/` cache rule already covers the output.

**The cross-origin machinery below stays anyway.** It costs nothing on same-origin files and is
correct the day anyone points `logo` somewhere else.

**Cross-origin is a correctness issue, not a nicety.** The atlas is shared by all six panels,
so one tainted image makes `texImage2D` throw and takes down *every* plate. `crossOrigin` is
set before `.src`, and a disposable 1×1 probe reads a pixel back before the image is allowed
near the shared canvas — `crossOrigin` alone is necessary and not sufficient.

**Ruled out.** Async build gated on readiness. Per-logo texture uploads — `needsUpdate`
re-uploads the whole 2048×1536 canvas and regenerates its mip chain, so uploads are coalesced
to one per frame. Trusting `crossOrigin` without the probe.

**How you would know it broke.** A blank or garbage panel instead of a wordmark. The loading
screen waiting on `/logos/`. Or a `SecurityError` out of the render loop, which means the
probe was skipped.

Artwork requirements are in `earth/logo-spec.md` — it is written to be sent to a client.

> **Amendment, 2026-08-25.** The seam is a **pair**, not a single string: `isotype` (the square
> symbol, shown at rest) and `logo` (the full lockup, shown under selection) — §26.21. Everything
> above still holds for both; there are now two atlases and two texture binds rather than one,
> and `createBrandAtlas(plates, kind)` draws the floor for each. **The pair is a hard
> requirement**: a case study with one and not the other fails `content:build` naming the case,
> and the Studio's validation says the same to the editor. A case with neither keeps both drawn
> plates. Half-authored brand artwork would crossfade from a real mark into a drawn one mid-unfold,
> which is not a state worth designing for.

---

## 19. The sky is a photograph, and it is a mesh rather than a background

> **Superseded in part, 2026-08-13.** The sky was generated on the GPU and baked into a
> cubemap; it is now a downloaded photographic panorama. The mesh-not-background half of this
> entry stands unchanged, as does everything about render order, the star shell and the
> composer. Only the source of the pixels changed — which is exactly the substitution the
> original entry said the cubemap existed to allow. The superseded text is below the rule.

The resting scene's backdrop is a galactic band of clustered stars over a photographic Milky
Way panorama: ESO's *GigaGalaxy Zoom* image by Serge Brunier, **113 KB**, equirectangular in
galactic coordinates, loaded during the existing load phase as a required resource.

**Why the procedural nebula was abandoned rather than tuned.** Two of its failures were
structural, not a matter of constants. Its ridged noise was built on **value** noise, whose
0.5 level set snaps to the lattice — so what was meant to be dust filaments rendered as
axis-aligned polygon walls, a crazed cracked-marble network over the whole band. And fbm is
**stationary** by construction: every patch of sky has identical statistics, so no number of
octaves produces variety, only finer detail. One analytic gaussian was the entire large-scale
structure of the sky. It read as a texture smeared along a stripe, which is precisely what it
was. A third failure was merely bad and was fixable: the cubemap was RGBA8 in a *linear*
target at brightness 0.14, so the whole nebula occupied about 40 of 255 code values and its
weakest channel about 5, which is where the muddy colour came from.

**AVIF, not WebP, and the codec choice is load-bearing rather than incidental.** WebP quantises
smooth dark gradients into flat macroblocks, and the sky is mostly smooth dark gradient
magnified 1.76× on screen — 3.52× on a high-DPI display, since R3F defaults `dpr = [1, 2]`.
That renders as visible squares, and raising WebP quality does not fix it: q96 still measures
1.600 on the block-ratio harness against AVIF q60's 1.171, at nearly twice the bytes. AVIF is
also *not monotonic* — q70 and q80 block worse than q60 — so the quality constant may not be
raised without re-running the measurement in `scripts/prepare-sky-panorama.mjs`.

**The byte cost is real but small, and smaller than expected.** 240 KB against the Earth's
2.43 MB, on a low-priority preload, behind the app chunk, with an 81 KB variant below 767 px.
The saving came from an unobvious place: **point stars were filtered out of the panorama before
it shipped.** The same image un-filtered is 1.5 MB, because point stars are high-entropy and
dominate the compressed size.
Removing them was independently correct — the star shell draws its own stars nearer, where
they parallax and twinkle, and photographed ones would have been a second static set
contradicting them. The photograph supplies diffuse gas; the shell supplies the sparkle.

**Attribution is a licence obligation, not a courtesy.** CC BY 4.0 requires the credit
"ESO/S. Brunier" be clearly readable and not hidden. It is in the audit panel, and
`CREDITS.md` records both the terms and where the visible credit lives. Do not reword it,
hide it at a breakpoint, or fade it further.

> **Correction, 2026-08-13.** This entry called the audit panel "the only *persistent* text
> surface the site has". It is not persistent: the credit sits inside `.audit-overlay`, which
> is hidden until a visitor opens the lead-capture panel, so at rest the site displays no
> attribution at all. Found by `e2e/backdrop.spec.ts`, which expected it to be visible and
> was not.
>
> A credits panel is usually accepted as attribution "in a reasonable manner", so this is
> flagged rather than treated as a breach — but it is **weaker than this entry describes**,
> and the decision of whether that is good enough is the owner's, not a harness's. The spec
> asserts what ships: reachable in one click, above 0.5 effective opacity, exact wording. If
> a real footer ever appears, the credit belongs there and this paragraph goes with it.

> **Superseded, 2026-08-18. There is no attribution, because there is no longer an ESO image.**
> The client requires that the site carry no third-party credit. That is a requirement, not a
> preference, so the panorama was replaced with a **public domain** source and the credit was
> removed from `AuditSection.tsx` along with the `.audit-credit` rules in `styles.css`. The
> paragraphs above are kept because they record why the credit existed and what removing it
> touched; nothing in them still binds. `e2e/backdrop.spec.ts` now asserts the **absence** of
> any credit — the inverse of the test described above — so a future asset swap cannot quietly
> reintroduce one.
>
> **The replacement was chosen by looking, and that is the part worth keeping.** Six CC0
> candidates were prepared and put in the running scene. Five were rejected on what the scene
> showed rather than on how the flat image read: 004 and 005 are ground-based framings, 002 and
> 006 do not wrap (their two vertical edges hold different sky, which no seam correction fixes),
> and 003 wraps perfectly but has no galactic plane. NASA/Goddard's Deep Star Maps were rejected
> on licence — courtesy credit plus an ESA/Gaia DR2 layer that is not NASA's to release — and on
> being EXR-only, not on quality.
>
> **The trap: candidate 001 first rendered almost entirely black, and the image was not at
> fault.** `skyBrightness`/`skyContrast` were 0.22/1.25, tuned to the far brighter ESO
> panorama, and a gamma above 1 crushes a dimmer source into the floor. At 0.60/1.00 the same
> file reads richly. Those two uniforms sit in the debug overlay precisely so this is a drag
> rather than a diagnosis — use them before concluding a new sky is wrong. An earlier pass at
> this swap built a 568-line candidate script and 44 MB of quality-ladder output without ever
> putting one candidate in the scene, and so never found this.
>
> **Amended, 2026-08-19: none of the six candidates is an equirectangular panorama, and the
> screen above could not have told you.** It checked wrapping and whether a galactic plane was
> present. Neither looks at a pole, and the only projection guard in the prep script is
> `width === height * 2` — aspect ratio is not projection, so every flat 2:1 image passes it.
> `shell.frag.glsl` maps `v = asin(dir.y)/π + 0.5`, so the top row IS the zenith: one point of
> sky across all 4096 columns. Row sd at the pole over the equator's, per channel: the ESO
> image scores **0.029**, candidate 001 scores **0.670**, and the whole candidate set sits at
> 0.319 and above. Read the gap, not a threshold — the reference itself is 0.152 at the bottom.
>
> The visible consequence was reported as "the image is zoomed" and "you can see the edge of
> the image". The edge is a **pinwheel of radial spokes converging on a vertex, with a hard
> straight wedge along the meridian**: the top strip of the image is wrapped into a disc, so
> its horizontal detail becomes azimuthal detail. Both poles are reachable by ordinary dragging
> — the sky pole lies along `bandAxis(22°)`, needing a camera `phi` of 158° / 22° against a
> clamp of 8.6°–171.4° — and the warp's FOV surge to 74° pulls ~1.8× more sky into frame, which
> is where it gets noticed. Nothing geometric is wrong; the sky sphere still encloses the
> camera by ≥12×. The boundary is in the TEXTURE.
>
> **`convergePoles` does two things and only the second one fixed it, which is the part worth
> keeping.** Band-limiting each row to `1/cos(lat)` is the textbook anti-aliasing for equirect,
> and it drove the pole ratio from 0.54 to 0.015 while leaving the rendered pole view
> INDISTINGUISHABLE. The spokes are resolvable content being stretched, not unresolvable detail
> being aliased; at 22.5° from the pole that kernel is 2.6 pixels out of 4096. What fixes it is
> fading each row toward its own azimuthal MEAN from 55° latitude to the pole — 55 chosen by
> rendering the pole view at 74° FOV against 90/65/45, not derived. It runs AFTER `levelSeam`,
> or the seam ramp is painted back across the pole rows.
>
> **The metric agreed with a picture that was still broken.** A pole ratio near zero says the
> pole row is constant and says nothing about the ring one degree out — and it is unchanged by
> the fade that actually fixed things. Screen a source with it; never verify a correction with
> it. Render the pole view — `node scripts/preview-sky-poles.mjs`, which exists because of
> this. §19's own earlier lesson, recurring in a new costume.
>
> AVIF quality moved 50 → 59 as a consequence, not a preference: the correction freed the bits.
> 59 rather than 60 because q60 is 202,169 bytes — under 200 KiB but over 200,000, and every
> file this project has shipped cleared both readings.
>
> The resting-view e2e baselines pass unchanged, which is the evidence that the correction is
> confined to the polar caps.
>
> **What it does NOT fix:** the image is still a flat picture stretched across 360°, so its
> features keep whatever angular scale that produces. If the sky still reads as zoomed, the
> answer is a different source, not a different filter. **Space backgrounds are 4096×2048 from
> now on** (2048×1024 narrow) — a standing decision, which fixes the sky at 11.4 px/deg against
> a ~20 px/deg viewport, i.e. 1.76× magnification, and accepts it.
>
> Full working, including why the metric must be measured PER CHANNEL, in
> `docs/audits/reports/sky-panorama-projection-2026-08-19.md`.
>
> Two further findings, both measured. The seam correction now applies the **median per-channel
> offset** rather than a smoothed per-row delta: the per-row scheme closed the seam but printed
> broad coloured horizontal bands into the picture, p90 4.21 and max 11.92 against a sky
> background near 12/255 — on the ESO source too, not only the new ones. And the AVIF quality
> optimum is **per-image and does not transfer**: q60 was right for ESO, q80 measures best on
> this source, and q50 ships only because the desktop file is held under a 200 KB client budget.
> See `CREDITS.md` and the header of `scripts/prepare-sky-panorama.mjs`.
> *(The shipped quality is **q59** since 2026-08-20 — `convergePoles` freed the bytes. The rule
> stated here is unchanged; only the number it produces moved. See the amendment above.)*
>
> **Narrowed, 2026-08-20.** The absence assertion in `backdrop.spec.ts` now names the
> third-party shapes it forbids (ESO, CC BY, Creative Commons) instead of matching any `©`:
> the site footer carries the brand's OWN mark (§30), which is not a credit to anyone else
> and is exactly what the no-third-party-credit requirement leaves room for.

> **Amended, 2026-08-25: the 2026-08-19 fix repaired the innermost 15 degrees and left the rest,
> and the metric said it was done.** Reported again in the same words — "the collapse point, the
> point where the sphere closes", plus "pixeled, like zoomed".
>
> **What was actually on screen.** A point in a FLAT image maps near a pole to a shape whose
> radial extent is constant and whose azimuthal extent shrinks in proportion to the distance from
> the pole. So every star the 5x5 median left behind became a RADIAL DASH, and the cap read as a
> warp-speed tunnel converging on a vertex. `convergePoles`'s fade is a smoothstep from 55 to 90,
> so its weight at 60 degrees is **0.06** and at 70 it is **0.40**: everything from roughly 45 to
> 75 degrees was never touched, which is most of a pole view at any FOV the scene uses.
>
> **Why the 2026-08-19 pass did not see it.** It rendered the pole view looking for spokes, found
> the innermost degrees clean, and stopped. §19's own lesson, in a third costume: the previous
> round's fix defines what the next round looks for.
>
> **The ring metric agreed with a broken picture too, and it agreed the other way round.**
> Azimuthal detail at 25 degrees from the pole measures 1.16 against ordinary sky's 0.37-0.80 —
> *above* the healthy range. Read as a number that says "plenty of structure, nothing wrong here".
> It was the dashes. A metric that cannot tell gas from aliased streaks cannot be read in either
> direction; only the picture can.
>
> **It cannot be fixed downstream.** A shader cannot remove a dash by modulating it — multiplying
> a dash by anything leaves a dash — and the azimuthal average that does remove it is affordable
> in the prep script and nowhere else.
>
> **So the median window now ramps with latitude**: 5 at the galactic plane where the dust lanes
> are, 15 by 60 degrees where there is no fine structure to protect. The ramp starts at 25, so
> everything the resting camera is pointed at keeps the original 5x5 exactly, and the "median 9
> softens the core" trade that rejected a stronger filter globally is declined rather than paid.
> Point stars are high-entropy, so this took the desktop AVIF from 194,642 bytes to 144,318 at the
> same quality — spent back on quality, not pocketed: **q59 to q70**, re-measured, 188,787 bytes.
>
> **The darkness of the caps is NOT a defect and must not be "fixed".** `convergePoles` is
> mean-preserving on both passes — the circular box blur preserves each row's sum, and
> `row += (mean - row) * fade` preserves the mean by construction. The caps are dark because the
> flat source's top and bottom rows are dark. A real galactic pole is dark too. Anyone who
> "corrects" this will brighten the poles and be wrong.
>
> **What is left for the shader is the SYMMETRY.** With the dashes gone the caps are almost
> perfectly radially symmetric smooth gradients, which still reads as a funnel. `shell.frag.glsl`
> now samples the panorama a second time through a fixed **90-degree** rotation and uses it as a
> **multiplier whose mean over the cap is 1 by construction**. 90 degrees is forced, not chosen:
> it puts the borrowed frame's own poles AND its `atan` branch cut exactly on the primary's
> equator, where the weight is already zero, so the repair cannot recurse or introduce a second
> seam. It also hands the two caps antipodal patches, so north and south are not copies.
>
> A mean-1 multiplier rather than a cross-fade because the two caps' levels differ by **3.2x**: a
> lerp would trade a dark funnel for a bright one. For the same reason the level is **per pole**,
> not one shared constant.
>
> **The cap ships at strength 0.35, and low on purpose.** Above ~0.5 the borrowed patch stops
> reading as gas and becomes a mottled disc pasted over the pole — the cap becomes its own
> artifact, which is now the third time this sky has done that. Judge it at the SCENE's exposure
> (0.60 through ACES), never at `preview-sky-poles.mjs`'s 2.4x detection gain, which makes 0.7
> look reasonable and 0.35 look like nothing.
>
> **"Pixeled" is answered separately**, by a direction-locked multiplicative grain in the shader.
> The magnification is 1.76x at DPR 1 and 3.5x at DPR 2 and is fixed by the 4096x2048 standing
> decision, so it cannot be answered with resolution; grain gives the eye high-frequency content
> to resolve, the same way it rescues a soft scan. It is NOT the dither, which stays: one code
> value of white noise for the OutputPass's 8-bit quantisation is a different job from breaking up
> AVIF block plateaus.
>
> **The cap start has a hard geometric floor of 62.2 degrees.** At rest the nearest sky pole is
> exactly `90 - skyBandTilt` = 68 degrees off the view axis and the 1600x900 frame's half-diagonal
> is 40.2, so a corner reaches latitude 62.2. Start below that and the repair is in the resting
> frame. It ships at 68, and `checks/space-backdrop.ts` section 7 recomputes the margin from the
> real modules — the first cut of that check compared against 27.8 (the angle FROM the pole)
> instead of 62.2 (the latitude), passed, and guarded nothing.
>
> **The resting e2e baselines pass UNCHANGED**, which is the evidence the repair stayed in the
> caps. If they move, that is the test working.
>
> Full working and the numbers in `CREDITS.md` and the header of `scripts/prepare-sky-panorama.mjs`.

**Bloom now exists in the pipeline**, between `RenderPass` and `AfterimagePass`. Before it,
nothing in the scene could look luminous rather than painted — a star was a bright matte dot
and the galactic core was flat. It is before the afterimage so it thresholds the true HDR
frame rather than one already faded toward the previous one, which would make the glow pump
as the warp blur ramped.

**It is an opaque mesh at `renderOrder -1000`, never `scene.background`.** A background is
written as an untone-mapped clear colour, so it would sit at the wrong brightness beside an
ACES-mapped Earth; as a mesh it passes through the composer's `OutputPass` like everything
else. This also makes its non-occlusion a property of render order rather than of geometry.
The *star* shell's guarantee is separate and geometric, and clustering it is therefore
angular-only — see `PROJECT_MEMORY.md` §11.33 and §11.34, which are the general forms.

**Palette exception, stated so it is not mistaken for drift.** The sky is naturalistic — warm
dust, pale core — and does not follow the brand's blue-accent rule. Same reasoning as the
Earth's textures: the brand guide governs UI chrome, and this is the scene's own language.
`skyBrightness` is the one dial the client is likely to want, and it is a slider.

**Ruled out.** `scene.background` (tone mapping). Fixing the procedural shader instead —
simplex noise plus domain warping would have got there, but only after several bake-and-look
art iterations, and the photograph is right on the first. NASA's Deep Star Maps, which are
public domain and would have avoided the attribution obligation, but ship only as OpenEXR at
this framing and nothing in the toolchain decodes EXR. Animating the sky — the user rotates
the scene themselves, so ambient motion buys nothing and costs a per-frame pass.

**How you would know it broke.** Stars in front of the Earth at full zoom. Visible squares in
the dark gas, which is compression blocking and means the codec or its quality changed
(`PROJECT_MEMORY.md` §11.38) — check at DPR 2, because DPR 1 halves the artifact and is how it
went unnoticed the first time. A straight ruler line across the sky, which is the panorama's
wrap seam reopening (`PROJECT_MEMORY.md` §11.32). A swirl of radial spokes converging to a point, or a
hard straight wedge, when you drag the globe far up or far down — the pole correction failing.
Do NOT diagnose that from the prep script's `poles` column, which cannot see it: render the
pole view. See the 2026-08-19 amendment above.
A visible pop as the sky arrives after the Earth, which means the boot step stopped being
required. The Earth's day side hazing over, which means the bloom threshold fell too far. A
backdrop obviously brighter or flatter than the planet in front of it, which means it stopped
going through the composer.

The defects that only screenshots caught, in both rounds, are in `PROJECT_MEMORY.md` §11 — the
lesson being that the first round *did* look at a picture and still shipped dirt, because it
read a property of the noise basis as a tuning error.

---

> **Amended 2026-08-27: a procedural sky is back on the table as a BAKED CUBEMAP, and C6 is
> the direction — but the photograph still ships.**
>
> Plan 005 asked one question: can a procedurally generated high-resolution cubemap give the
> Earth scene a cleaner, sharper, more controllable backdrop than a flat 2:1 photograph treated
> as equirectangular. Nine variants were baked and measured; the whole record, with numbers, is
> `audits/reports/sky-cubemap-discovery-2026-08-27.md`.
>
> **The resolution half is answered, decisively.** Measured over the same sky-only region, the
> shipped photograph has p50 17 — it never reaches black anywhere — and max 114 in a frame
> containing no bright star, meaning its brightest object is a smeared blob. The cubemap
> variants have true black negative space and crisp point sources. A cubemap is sharper.
>
> **The projection half is answered by construction rather than by tuning.**
> `shellCube.frag.glsl` is `shell.frag.glsl` with the `equirect()` projection, the second
> fetch through a 90-degree rotation, the latitude-ramped blend, the directional grain and the
> dither all *removed*. There is no branch cut and no pole in a cubemap, so `convergePoles`
> has nothing left to do. That the file is shorter IS the finding.
>
> **C6 is the chosen art direction** (`plans/005-sky-cubemap/scenes/c6-aurora.json`, reached
> at `?sky=c6`): blue and purple both read, the Earth sits in true black, the hero galaxy is
> aimed upper-right and clear of it, and it needs no runtime correction — brightness and
> contrast both 1.0, because the exposure curve is baked into the scene. Runtime contrast could
> not be used: `pow(colour, contrast)` is per channel and drags every colour toward its
> dominant one, so at 2.5 the violet layer read as plain blue, and purple is the half of the
> brief that is not negotiable.
>
> **Nothing is promoted, and four things block promotion.** `protoSky.ts` is gated on
> `DEBUG_TOOLS_ENABLED`, so in a production build the variant is unconditionally null and
> `?sky=c6` from a visitor's address bar does nothing — the same seam `buildFlags.ts` already
> draws for `/debug`. What is unresolved: **(1)** C6 has not been reviewed for banding,
> lattice or repetition, which is what killed the previous procedural attempt, and a brightness
> distribution cannot see structure; **(2)** continuity across the six cube faces is untested —
> the photograph's seam class is gone, but the baker's is not ruled out; **(3)** the quad below;
> **(4)** weight, in two forms — C6's six faces are **117 MB** of PNG, so shipping needs
> KTX2/Basis which plan 005 puts out of scope, and 6 x 4096^2 RGBA is ~402 MB of VRAM with
> mipmaps off, with the 2048 comparison not yet run. Mobile is a first-class target (§25), so
> that last one is a gate rather than a footnote.
>
> **The quad is not a prototype bug, and it is the item to chase first.** A large hard-edged
> quad is visible in the `rotated` frame of every bright variant and invisible against the
> shipped dark sky. It is **not in the cubemap** — the baked faces contain no straight edge
> anywhere. It is in the Earth scene, shipping today, hidden only because the current backdrop
> is too dark to reveal it. Any brightening exposes it, whatever the source of the pixels.
>
> **What this does NOT overturn.** §19's original case against the procedural nebula was that
> its failures were *structural* — value-noise lattice walls, and fbm being stationary so no
> number of octaves buys variety. Those critiques stand against **that** implementation. What
> C6 shows is that an *authored, aimed, multi-layer* bake is a different technique, not a
> tuning of the same one: its large-scale structure is placed by hand
> (`dirLonDeg`/`dirLatDeg`), which is exactly what a stationary field cannot have. It also
> came at a price the original entry did not anticipate — the byte argument was made against a
> hypothetical "4K sky", and the real photograph costs 113 KB while C6 costs 117 MB unencoded.


> **Amended 2026-08-31: the projection question is now a TOOL rather than a habit, the
> compensation is conditional, and the ESO panorama turns out to be recoverable.**
>
> Four rounds of this entry have said some version of "aspect ratio is not projection" and the
> next round has screened a source without checking a pole anyway. The check is now a command.
>
> **`scripts/screen-sky-source.mjs`** takes any image and prints a verdict — read-only, writes
> nothing, no pipeline run. It reports the per-channel pole ratio and the wrap `spread`, and
> names the outcome in words (`EQUIRECTANGULAR` / `AMBIGUOUS` / `NOT EQUIRECTANGULAR`, and
> `CROP` independently). The metrics were **moved**, not copied, into
> `scripts/lib/sky-metrics.mjs`, which `prepare-sky-panorama.mjs` now imports: two definitions
> of `poleRatios` drifting apart would mean the screen that accepts a source and the pipeline
> that processes it were answering different questions. Verified by reproducing the recorded
> 0.670 / 0.383 on the shipped source and the full 0.319-0.838 range across all six candidates.
>
> **The prep script was measuring its own diagnostic in the wrong place, and it flattered the
> source by nearly 2x.** `poleRatios` was called inside `emit()`, *after* the latitude-ramped
> median — a 15x15 median at the poles flattens the pole rows itself, so the number described
> the filter's work rather than the image's projection. `sky-panorama-001` printed **0.37**
> where the untouched file measures **0.670**, against the script's own printed guidance that
> "under ~0.15 is consistent with a real equirectangular source". It is now measured on the
> decoded source before any pass runs. **General form, and this is the fourth costume §19 has
> seen it in: a metric computed downstream of its own correction confirms the correction.**
>
> **`convergePoles` and the latitude-ramped median are now conditional on that measurement.**
> Both are corrections for a flat source; on a genuine panorama they are damage, and
> `convergePoles` is the dangerous one — fading every row above 55 degrees toward its azimuthal
> mean erases real polar sky and manufactures the exact funnel it was written to remove. Being
> mean-preserving, it would not look like a brightness bug; it would look like "you can see
> where the sphere closes", for the fourth time. The decision is auto, printed with the number
> that drove it, and forced either way by `--flat-source` / `--no-flat-source`. The flat-source
> path still produces **byte-identical** output to the committed assets, which is how the
> refactor was proved behaviour-preserving.
>
> **Cost of turning it off, measured:** forcing the compensation off on the current flat source
> takes the desktop AVIF from 184 KB to **297 KB**, past the 200,000-byte client budget. The
> polar median is doing much of the compression work because point stars are high-entropy, so a
> real panorama must re-run the quality ladder rather than inherit q70.
>
> **`?skyImage=` — a candidate can now be judged in the scene in about two minutes.** A
> dev-only override on `protoSky.ts`'s existing gate loads any raw file from
> `public/textures/` with no preparation at all, so the audition happens at the scene's own
> exposure through ACES rather than on a flat file in a viewer. That is the step the 2026-08
> screening round skipped, and it is how six images that are not panoramas got through. The
> name must begin `sky-test-`, which makes traversal impossible and matches a `.gitignore`
> rule so a multi-megabyte scratch PNG cannot be committed by accident. Inert in production and
> with no `?skyImage=`, which `e2e/backdrop.spec.ts` passing unchanged is the evidence for.
>
> **The ESO panorama is recoverable, and the record about it was wrong in one number.**
> It is *The Milky Way panorama*, ESO id **eso0932a**, by Serge Brunier, 6000 x 3000, released
> 2009-09-14 — <https://www.eso.org/public/images/eso0932a/>, original TIFF at
> <https://cdn.eso.org/images/original/eso0932a.tif>. It exists in three places: the derived
> textures are intact in git at `74c85a7` and reachable from `main`, so unprunable
> (`sky-panorama.avif` **245,633 B at 6144 x 3072**, `.webp` 410,456 B, narrow pair 82,487 /
> 131,726 B at 3072 x 1536); the 29,082,084-byte original still sits at
> `node_modules/.cache/eso0932a.tif`, where the prep script's old `SOURCE_URL` downloaded it,
> **one `npm ci` from deletion**; and it is still downloadable. Restore a texture with
> `git show 74c85a7:public/textures/sky-panorama.avif > out.avif` — from Git Bash, since
> PowerShell's `>` corrupts binary.
>
> **The "113 KB" at the top of this entry is wrong.** The real ESO desktop AVIF was 245,633
> bytes, and this entry contradicts itself twenty lines later with "240 KB". 113 KB is a stale
> draft figure that has been quoted onward ever since, including into the C6 comparison above.
>
> **What has genuinely changed about the attribution, and what has not.** CC BY 4.0 still makes
> "ESO/S. Brunier" mandatory, and three enforcement points now hold that line:
> `e2e/backdrop.spec.ts` asserts the credit's *absence* in three separate assertions,
> `.audit-credit` is gone from `styles.css`, and the markup is gone from `AuditSection.tsx`.
> But the 2026-08-13 correction above flagged the old placement as weaker than the licence
> wants, because `.audit-overlay` is hidden until a visitor opens the lead panel.
> **`src/components/SiteFooter.tsx` now exists and renders persistently** (`App.tsx:445`), which
> is exactly the condition that correction named: "If a real footer ever appears, the credit
> belongs there." So the *technical* objection is resolved and only the client's
> no-third-party-credit requirement remains — a business decision, not one to settle here.
>
> **Regardless of the licence, it is the only known-good calibration case this project has.**
> 0.029 / 0.152 against 0.670 / 0.383. Used locally it proves the screener, proves the gate
> takes the `OFF` path, and proves a pole view is clean with `skyCapStrength` 0 — none of which
> requires shipping it or showing any credit.
>
> **Still true and unchanged:** the shipped path is a photograph on a mesh at `renderOrder
> -1000`, never `scene.background`; `equirect()` is correct and was not touched; mipmaps stay
> off; the grain and dither each do their own job. **None of the tooling above changes a single
> rendered pixel** (`23f30a3`) — `e2e/backdrop.spec.ts` passing unchanged is the evidence, and
> the compensation stack is still in place and still doing its job.
>
> **What DID change on screen, separately and in the same days, is broken.** `4e590d0` /
> `528dd42` committed a new sky without running it through the prep script: the narrow pair is
> named with **spaces** (`sky-panorama - narrow.avif`) against the hyphenated path
> `spaceConfig.ts` requests, so every viewport at or under 767 px 404s twice and renders black;
> both narrow files are byte-identical to the wide ones; and all four are **10000 x 5000**, which
> is 200 MB of VRAM and past `MAX_TEXTURE_SIZE` on many GPUs. `PROJECT_MEMORY` §11.64 and §11.65
> carry the detail. Fixing it is a prep-script run, not an edit — which is the point of there
> being a prep script.

<details>
<summary>Superseded text: the sky was generated on the GPU, not downloaded</summary>

The resting scene's backdrop is a galactic band of clustered stars over a procedural nebula.
The nebula is generated by a shader and baked into a cubemap during the existing load phase,
one face per frame. **Zero download bytes, and no new required boot resource.**

That is the decision, and it is what makes an "amazing" background affordable at all in a
project whose dominant constraint is load time (`adr/007`, §10). An authored 4K sky would have
been simpler to art-direct and would have put megabytes on the critical path.

**The cubemap is deliberately a seam.** If authored artwork is ever wanted, it replaces the
bake and nothing downstream changes — the same shape of decision as §18's `logo` string.

*That seam is what was used. The claim held: the substitution touched the shell's fragment
shader, the loader and the config, and nothing else. What did not hold was the premise that
the procedural sky could be made to look good — see above. Note also that the byte argument
was made against a hypothetical "4K sky" costing megabytes; the real one costs 113 KB, because
the case assumed a photograph must carry its own stars.*

</details>

---

## 20. Murcia navigates like a map

> **Amended 2026-08-13 — §21.** The gain is 0.7 rather than 1:1.
>
> **Amended again 2026-08-19 — `adr/009`. The zoom band is gone**, on the wheel and on the
> pinch alike, and so is Earth’s orbit zoom. There is no user-facing zoom anywhere in the
> product; a controlled camera flight onto a clickable object is the only thing that changes
> distance. The gesture split below otherwise stands — left/one finger pans, right/two fingers
> rotate — and two-finger centroid rotation is unaffected. Two consequences below invert:
> **distance is no longer user state**, so `checks/navigation-zoom.ts` is retargeted at the
> flight range rather than a band and renamed `checks/footprint.ts` (`check:footprint`); and **the skirt’s 600 to 700
> widening, which existed to pay for zoom-out, becomes slack margin.** It is not being narrowed
> — the warp’s departure pose still reaches past the resting distance the 600 was sized for.
>
> **Amended a third time 2026-09-04 — `adr/014`. The zoom band is back**, on the wheel and on
> the pinch, in Earth and in Murcia, and both of the inversions above invert again: **distance
> is user state once more**, and **the skirt’s extra 100 units are spent again** rather than
> slack. `checks/footprint.ts` keeps its name and its job, and now sweeps zoom depth and flight
> scale together — it is the gate that decided Murcia's far end (280 units at 52°, leaving
> +59.2 units of skirt at the worst case).
>
> What does **not** come back is the band's shape. It is not `distanceScale` any more: the zoom
> resolves a **pose**, so a controlled flight still owns the scale and the two compose
> multiplicatively instead of fighting over one number. And neither end is a judgement — the far
> one is a footprint measurement, and the near one is the district-flight floor, deliberately
> reused rather than measured a second time.
>
> The gesture split below — left/one finger pans, right/two fingers rotate — has now survived
> all three amendments untouched.
>
> **Amended a fourth time 2026-09-06 — `adr/015`.** The split survives this one too, but the
> arbitration between its two-finger rotate and the pinch did not. The rule that decided ties
> compared raw centroid travel against an 8px dead zone, and a pinch moves the centroid by
> half its growth by construction — so reaching the 16px claim put the midpoint at exactly the
> decline, and **no anchored-thumb pinch could zoom Murcia at all.** Reported from a phone as
> "sometimes rotate, sometimes nothing happens". The rival is now measured on X only, which is
> the axis rotation actually consumes, and compared after an allowance of half the growth. The
> tie still goes to the turn: a pair carried without changing separation has no allowance and
> still declines at 8.
>
> Two other things moved with it. **Leaving the city is now its own gesture** — one close
> zooms out and parks, a second close leaves — because 110px of closure filled the band and
> 55px more flew you to Earth, which is one ordinary pinch. And **`zoomNearScale` stopped
> being `focusFlight.minDistanceScale`**: the reuse made a full pinch-in worth ×1.43, and the
> two numbers answer different questions. It is 0.45, swept through `check:footprint` (0.35
> passes, 0.30 fails at 59.8 against a ~60 floor) and deliberately not the lowest value that
> passed.
>
> **Amended a fifth time 2026-09-08 — §39. The navigable area now bounds the CAMERA**, not
> only the focus, and it is a function of the pose rather than of the plate: the eye sits
> `distance * cos(pitch)` behind the focus, so a legal focus never made the eye legal. The
> gesture split survives a fifth amendment untouched; what changes is where the gestures are
> allowed to arrive. **Pan range falls from 352 units to ~172 in the worst direction**, the
> resting pose rises to 35 degrees at distance 220, and `zoomNearScale` moves 0.45 -> 0.58 —
> not a re-judgement, but because it is a scale and the shorter rest distance multiplied
> straight into the compound closest approach the fourth amendment had just measured.
>
> **Amended a sixth time, the same day — §40. The edge stops being a wall.** 1:1 panning still
> ends where the fifth amendment put it, but the drag no longer stops there: past that edge it
> travels the A2 ring against a gain that falls to zero, and cannot pass it. Grab-the-point is
> given up deliberately in the band — that IS the resistance — and is untouched everywhere else.
> Worst-case pan range goes back from ~114 x 115 to ~169 x 182 units, as band rather than as
> free travel.

**Left button and one finger pan the ground 1:1 under the cursor, in both axes. Rotation
moves to the right button and to two fingers, at half the sensitivity. A small, bounded zoom
band lands on the wheel and on pinch.**

This **reverses a signed-off decision**, and the grounds matter more than the change.

The 2026-08-06 sign-off on `translationGain: 0.5` and `degreesPerViewportWidth: 120` was valid
on its own terms — a person drove the build and judged it, and every other number in this repo
is reasoned or measured rather than judged. `PROJECT_MEMORY` §7 says a numeric argument is not
sufficient grounds to change it. That still stands: **this is not being changed by a numeric
argument.** It is being changed by the same currency that set it — real people driving the
build and reporting that one gesture carrying both axes is not what they expect from a map,
that there is no way to strafe, and that rotation is too fast. Judgement supersedes judgement;
the arithmetic had no vote either time.

Four structural consequences, each of which is the reason a number moved:

- **Strafing exists, so free 360° yaw no longer has to pay for it.** The old scheme justified
  losing sideways pan on the grounds that unbounded yaw made every point reachable by turning
  and advancing. True, and not what people tried to do.
- **Rotation is deliberate, which is what lets its sensitivity halve.** 120°/viewport-width
  read as twitchy mostly because it fired by accident on the horizontal axis of every drag. A
  gesture entered on purpose can afford to cost more travel — and the gestures now carrying it
  (right-drag, two fingers) have less usable travel than a primary drag does.
- **Distance became user state, and therefore a footprint input.** So it is bounded by a
  check and not by a number: `checks/footprint.ts` proves `maxDistanceScale` against
  `computeGroundFootprint` at every azimuth on every tested aspect. Same class of hazard as
  §7's warp poses, and it gets the same treatment.
- **The terrain skirt widened 600 → 700, because the skirt is what pays for zoom-out.** At
  600 the band ran out of margin at scale 1.09 — and only on ultrawide, i.e. invisibly to
  whoever chose it. The cost is a few hundred more fully transparent triangles.

The rejected design is preserved in `PROJECT_MEMORY` §7 rather than deleted, because its
reasoning is sound for its constraints and is what to return to if the right button ever
stops being available.

---

## 21. The pan gain is 0.7, so grab-the-point is a property of the solve rather than of the feel

> Amends **§20**, which states pan as "1:1 under the cursor". The gesture split, the
> rotation sensitivity and the zoom band in that entry are unchanged; only the gain is.

**Decided 2026-08-13, by hand.** `translationGain: 0.7`. The ground covers 70% of the
cursor's sweep, so the grabbed point slides ~30% of the drag distance behind the pointer —
**by construction, not as lag**.

**Why this is not a numeric argument overturning a judged value.** §20 reversed the
signed-off 0.5 to 1.0 on user reports, and argued that 1 had *left* the judged set because it
is the definition of grab-the-point. That argument was too strong: the definition is a
property of the solve, and how much of it to spend is still a taste. 0.7 is the same
currency as every other feel number here — a person driving the build — and the arithmetic
had no vote this time either.

**What it costs, stated plainly.** The complaint that produced §20 was "dragging does not
move the view where the mouse goes". At 0.7 that is *partly* true again, deliberately. If it
comes back from real users, the answer is 1.0 and it is one character.

**Consequence for the coupled constant.** §20's `smoothingTimeConstant: 0.03` was a
consequence of gain 1, since the latency objection fires only while the ground is expected to
track the cursor exactly. At 0.7 it fires in proportion, so 0.03 is conservative rather than
required. Left alone: the gain was re-judged, the time constant was not, and moving both at
once is how the pair stopped being understood the first time.

**How this was caught, which matters more than the number.** `checks/navigation-feel.ts` §9
had been failing two assertions with `npm run check` still exiting 0 — that harness sets no
exit code (`PROJECT_MEMORY` §10, and the reason plan 000 exists). A judged value silently
contradicting a documented definition is exactly what a harness is for, and this one was
reporting it into a log nobody read.

**The harness now asserts the solve, not the taste.** §9 drives the L-shaped drag twice: at
gain 1, where the grabbed point must land within a pixel of the cursor because that is a
definition; and at the shipped gain, where the focus must cover *exactly* that fraction of
the exact answer. An inverted sign, a dropped delta, a clamp eating part of the drag or the
solve drifting with camera lag all still fail. Re-judging the gain requires no harness edit.

**Ruled out.** Asserting a screen position at the shipped gain, which pins a person's taste
in a check and fails the next time it is re-judged. Deleting the assertion, which would have
retired the one property the rework exists for. Changing the gain to make the check pass —
the check was wrong about which of the two properties it owned.

**How you would know it broke.** `check:navigation` fails §9 at gain 1, which means the solve
itself regressed and no gain will fix it. Or the proportionality assertions fail while gain 1
passes, which means something downstream of the solve — a clamp, the smoothing, the bounds —
is eating part of the drag.

---

## 22. There are two test tiers, and a rule for telling them apart

→ **`docs/plans/000-testing-strategy.md`**

**Decided 2026-08-13.** Vitest for pure logic beside its module; `checks/` unchanged for
anything that needs real Three.js objects across many frames. A hybrid, not a migration.

> A **unit test** lives beside its module as `*.test.ts` and needs no scene.
> A **harness** lives in `checks/`, drives real Three.js objects across many frames, and is
> bundled with esbuild.

That rule is in `vitest.config.ts` as well as in prose — `include` is
`['src/**/*.test.{ts,tsx}', 'content/**/*.test.ts']`, so
`checks/` cannot be swept into the runner by accident. Two tiers are worthless if nobody can
say which one a new test belongs in.

**Why the harnesses were not ported.** They are not unit tests and would be worse as unit
tests: `check:warp` sweeps 19 296 real camera poses through the real
`computeGroundFootprint`, and the thing it guards is invisible on the machine every change is
made on. Nothing about that fits a fast pure-function runner.

**What the unit tier is for.** The cheapest logic in the repository had no coverage at all,
because writing a test meant hand-rolling an assertion function and an esbuild invocation.
That is where the coupled-array class of bug lives — `SATELLITES` against `ORBIT_PRESETS`,
which `tsc` cannot see with `noUncheckedIndexedAccess` off, and where one missing case study
would have refused to load the whole site. *(That particular pairing is gone as of §28 — the
arrays are resolved by id and a mismatch throws. The class of bug is not: it is what the tier
is for.)*

**A third home appeared with the content build:** `content/` at the repository root holds the
Node-side mappers, validators and generator. They are unit-tier by the rule above — no scene, no
DOM stub — but they cannot live under `src/`, because nothing in the browser bundle may import
`fs` or `fetch`. The `include` covers both directories.

**Playwright is local, not a gate.** Vercel's build container would download Chromium on
every deploy and has no server to point at. `npm run e2e`, against `vite preview`. If CI is
ever added, this is the first thing that moves into it. *Amended 2026-09-14:* the build DOES now
download Chromium on Vercel — for the blog display's screenshot only (§42), never for tests.

**Coverage is scoped to the pure set**, not repository-wide. A whole-repo percentage would be
dominated by the WebGL surface that is untestable by design, and would end up either
meaningless or a reason to write tests that exist to raise it.

**Vitest is pinned to 3.x.** Vitest 4 bundles its own Vite 8 rather than using the project's,
which would quietly put the test tier on a different bundler from the build — the exact
ride-along that "Vite pinned at 5" exists to prevent.

**Ruled out.** Porting `checks/` to Vitest. ESLint, still — a stubbed `lint` script is a gate
that does not exist. A `VERTIGO_SKIP_TESTS` flag. Tests written to move a coverage number.

**How you would know it broke.** `npm ls vite` reports more than one Vite. A `*.test.ts`
appears under `checks/`, or a file in `checks/` stops calling `finish()`. Or the tell that
started all of this: a harness reporting failures while `npm run check` exits 0.

---

## 23. A lost graphics context is a stated failure, not a blank screen

→ **`audits/ios-safari-2026-08-14.md`** §I1

**Decided 2026-08-14.** `graphics/contextLoss.ts` observes `webglcontextlost`, calls
`preventDefault()`, and reports upward. The application latches `markFatal` **and** renders a
Spanish notice with a reload action.

**Why two surfaces and not one.** The timing decides which is on screen. Before the intro hands
over, the drawing is still running its own loop and reads readiness every frame, so `markFatal`
reaches the visitor through the caption it already owns. After handover that loop has stopped,
and marking fatal latches a state **nothing repaints**. Either alone covers half a session.

**Ruled out: restoring the context.** Every texture upload and shader compile in this
application happens once, inside an effect keyed on load, so a restored context comes back to an
empty GPU while the scene believes it is warm. Recovery is a project, and `ENGINEERING_PRINCIPLES`
§37/§38 are explicit that a fallback must not exist unless it is implemented. `webglcontextrestored`
logs and leaves the fatal state.

**Why this is not a theoretical hazard.** iOS drops contexts under memory pressure, and this
application holds both worlds resident for the whole session by design (§4). Context loss is the
expected end of a long mobile session, not a driver curiosity — which is why the 2026-08-07
audit finding it and closing only the *availability* probe left the larger half open for a year.

**How you would know it broke.** `e2e/mobile.spec.ts` drives a real
`WEBGL_lose_context.loseContext()` and expects the notice. Or, in the field: a black canvas with
nothing on it.

---

## 24. The decoders are owned once, and counted

**Decided 2026-08-14.** `graphics/decoders.ts` owns one `DRACOLoader` and one `KTX2Loader` for
the application, acquired and released in pairs.

**What it replaced.** Three Draco loaders and two KTX2 loaders — the city, the corner logo and
the satellites — each with its own worker pool against byte-identical decoder paths. Up to
twenty workers and ~1.6 MB of duplicated WASM heap, **all alive at once**, because all three of
those assets load during the intro. `createAssetLoader` had already made exactly this argument
for Murcia and had not generalised it.

**Reference counted rather than a singleton, and that is the decision.** A singleton fixes the
loading peak and then holds two worker pools for the rest of the session — trading a spike for
permanent residency, which is a bad trade on a device where steady state is the problem.
Counting keeps both properties: at most one pool of each kind, released by whoever finishes
last. Every call site already had a dispose path, so nothing changed about *when* things are
freed.

**Worker limits deliberately untouched.** Lowering them cuts WASM heap and slows the city's 257
meshes by an amount nothing here can measure — a device-profile question (§28).

**Consequence.** `appConfig.dracoDecoderPath` is gone, following the renderer settings that left
the same file for the same reason: the path belongs to whoever owns the decoder.

**How you would know it broke.** `new DRACOLoader` or `new KTX2Loader` anywhere outside
`graphics/decoders.ts`. Or three's "multiple instances" warning in the console.

---

## 25. Mobile is a first-class target, and it is capability-detected

→ **`audits/mobile-responsiveness-2026-08-14.md`**, **`audits/ios-safari-2026-08-14.md`**

**Decided 2026-08-14**, after auditing both. The site is production, not a desktop prototype,
and the audits found gaps rather than an absent strategy — the existing `(hover: none)`,
`(pointer: fine)` and `pointerType` branching was already the right pattern.

**Three things are now true that were not.**

- **Tap tolerances are per pointer type everywhere.** Murcia had one 6 px threshold for mouse
  and finger, so a real tap became a drag and `DistrictInteraction` dropped it — districts, the
  only *content* in that experience, failed intermittently and silently on every phone. §17
  stated this rule in 2026-08-11 and listed "a threshold that ignores pointer type" under how
  you would know it broke. It was broken in the module that most needed it, in the same file
  that reads `pointerType` two hundred lines earlier.
- **The case panel is a bottom sheet below 767 px, and the close-up framing knows it.** Those
  are one decision, not two: `closeUp.screenOffset` existed *to clear the panel's column*, and a
  fixed world offset is a fixed angle while the horizontal half-FOV collapses with the aspect
  ratio — so in portrait the camera pushed the subject of the close-up outside the frustum, to
  make room for a 142 px column nobody could read. The offset is now a fraction of the
  half-width (`camera/closeUpFraming.ts`) and zero below the breakpoint.
- **The Earth ships at two resolutions**, media-gated at the same 767 px as the sky. 134 MB →
  34 MB of texture memory on a phone. 2048 is not a concession: at 390 CSS px and DPR 2 the
  globe spans ~300 device pixels against ~1024 texels of visible hemisphere.

**Still capability detection, never device detection.** No `userAgent` anywhere. Width decides
*layout*; `(hover: none)`, `(pointer: coarse)` and `pointerType` decide *input*; the driver
decides its own point-size limit. Conflating the two is how `(hover: none)` rules end up keyed
to a breakpoint and stop working on a small laptop window.

**One thing deliberately NOT done, and it is the architectural one.** Murcia's camera pose is
tuned against wide viewports, and `cameraPortraitOverrides` is built, tested and fed `null` — so
`resolveCameraPose` returns the landscape pose at every aspect. Fixing it means re-running the
full azimuth sweep against the terrain skirt (§5 of `PROJECT_MEMORY`, "a much larger job than it
looks") and having a person judge a new composition. Named as an architectural issue rather than
patched, which is what the audit brief asked for.

> **Closed 2026-09-17.** Portrait now rests at 370 (`cameraPortraitOverrides: { distance }`) with
> its own zoom far end, 450 @ 58 (`zoomFarPortraitOverrides`, resolved by `resolveZoomFar` on the
> same threshold). Distance only — fov and pitch are untouched, and every aspect at or above
> `portraitAspectThreshold` still gets `camera` by identity. `check:footprint` and `check:warp`
> resolve rest and band per aspect now, so portrait is swept at the pose it really has. The
> reasoning is in `murciaConfig.ts` beside the two fields.

**How you would know it broke.** `check:navigation` §12 fails. Or `.case-panel` gains a width
without `closeUpFraming.ts` being touched. Or an Earth texture URL appears outside
`EARTH_TEXTURES`, which is how the preloads and the loader silently start disagreeing and every
visitor downloads both sets.

---

## 26. The Earth experience's own decisions

**Folded in 2026-08-17**, when `earth/DECISIONS.md` was retired so that this file is the only
decisions file in the repository. That document was 1862 lines of chronological entries running
2026-07-20 → 2026-08-13. Everything below was binding and stated nowhere else.

What was dropped, so the loss is auditable rather than silent: entries already carried here
(§6 cross-fades, §9 camera ownership, §16 the debug flag's reach, §17 picking, §18 the plate
seam, §19 the whole sky arc); entries this file already supersedes (the 3D logo's own renderer
→ §2 and `adr/002`, per-consumer decoders → §24, `screenOffset` as a fixed world offset → §25);
entries superseded *inside* that file (the "scope ends at the corner logo" entry, the procedural
nebula, the `baseSize` / `lineOpacity` / `closeUp.distance` flip-flops,
`createPlaceholderLogoTexture`, the five dead `state.*Ready` flags); and tuning numbers, which
are taste rather than decisions and live in `orbitConfig.ts`, `interactionConfig.ts` and
`PROJECT_MEMORY.md` §9. The traps from that file are in `PROJECT_MEMORY.md` §11.

### Time and state

**26.1 — Phase checks are ordered, never listed.** Every comparison goes through
`atOrAfter(phase, mark)` against `PHASE_ORDER` in `sceneVisibility.ts`. A hardcoded
`phase === 'swap' || 'corner' || 'site'` stranded the camera at the starfield for the whole
orbit reveal when `orbits` was inserted between `corner` and `site` — it typechecked, threw
nothing, and only a screenshot caught it. *How you would know it broke:* a phase name compared
by equality or membership anywhere outside `PHASE_ORDER`.

**26.2 — Continuous values never touch React.** `useState` holds the discrete phase name and
nothing else. Warp progress, overlay opacity and blur amount live in the mutable
`sequenceState.ts` singleton, are read by the render loop, and are applied by direct DOM or
three.js writes. The overlay has two independent contributors and combines them with `max()`,
so neither can clobber the other at a boundary. Selection is React state because it drives the
DOM; **hover is not**, because satellites keep moving under a still pointer.

**26.3 — The single clock owns everything from `shrink` onward.** P0 is not on a clock at all —
it is on a progress axis (26.5). Past `shrink`, one paused GSAP timeline owns all of time, and
its labels double as debug seek targets. The documented exception is endless ambient motion —
Earth spin, logo idle, satellites orbiting — which accumulates from `useFrame` delta: the
timeline owns when those *start*, never their heartbeat. The price is that the orbit reveal
cannot be scrubbed backwards; seeking away resets it and the draw-in replays.

### The boot path

**26.4 — Code that runs first depends on nothing.** The intro draw is a standalone module with
zero runtime dependencies, its own Rollup entry and its own `<script>`, because its entire job
is to be on screen before anything else exists. The test is concrete: **it must run in a bare
HTML page with no build step, given only a progress callback.** The corollary is that nothing
not needed to draw the isotype belongs in the entry chunk — three, R3F, the scene and the orbit
system all sit behind a dynamic import fired *after* the first painted frame, since module
evaluation is a synchronous main-thread block. Guarded on the artifact by the `closeBundle`
hook (12 KB intro, 320 KB app), never on imports; §12 is the general form. **Not a licence to
hand-roll elsewhere** — past `shrink` the libraries are loaded and paid for.

**26.5 — Visual progress, load progress and readiness are three things, and none is derived
from the others.** `visualProgress` drives the playhead; `loadProgress` *moves* the drawing and
may never gate it; `readiness` gates the ending only. Three zones, with every boundary derived
from the stage weights rather than hardcoded: an unconditional time-driven opening so something
is visible ~20 ms in whatever the network is doing, then `max(autonomous, measured)` for the
outline, then readiness alone for the collapse and fill. **A timeout is not a readiness
signal** — the intro logs, sets a diagnostic flag, and keeps waiting. Extends §10, whose point
is that the caption must never announce a readiness the load has not reached.

### The warp

**26.6 — The warp is two unrelated legs and a concealed cut.** The camera never travels the
distance it appears to: it is at `[0,0,-200]` on the last frame of leg 1 and `[0,0,80]` on the
first frame of leg 2, and **that teleport is the transition**. One progress value is read
through three curves with deliberately nested widths — travel (full), speed and motion blur
(±0.34), overlay flash (±0.10) — so the blur ramps gradually while the overlay reads as a
flicker rather than a fade. The tween is `ease: 'none'` **on purpose**; a GSAP ease on top would
compound with the three curves and destroy that width relationship. **The cut keys off raw
progress, not the eased travel curve**, so visibility and the flash stay locked together if the
position easing is ever retuned. §7 applies the same structure to the Earth ⇄ Murcia warp.

**26.7 — The starfield exists because we have no city.** The source prototype's leg 1 flies away
from a city, and that geometry *is* the motion cue the FOV surge stretches and the blur pass
smears. Ported literally, our leg 1 would be a black screen with a widening FOV. One
`THREE.Points` cloud, one draw call, is the minimum that fixes both. It is not decoration —
without it the warp does not read.

**26.8 — The 2D→3D substitution is a scale-through-zero crossover, not a particle burst.** §6
states the principle; this is the mechanism. The 2D mark scales to zero at a point while the 3D
model scales up from zero at the same point, removing the frame in which a comparison is
possible rather than concealing it behind noise. That is why the model's start rotation is a
free choice and no silhouette matching is needed. The cost required a specific mitigation: a
burst would cover ~1 s of a missing model and a zero-crossing covers nothing, so the crossover
is **conditional on the model being ready** and holds the 2D mark at full size otherwise. If it
ever needs more weight: widen the flash, then add a bloom sprite, then reconsider — a held
afterimage would need the model rendered by the composer, which is an architectural change.

### Assets and scene conventions

**26.9 — A baked texture owns its shading: `metalness = 0`, `roughness = 1`, `flipY = false`.**
Bake in the DCC tool, export KTX2 with mipmaps, load through the shared transcoder (§24). The
bake already contains the lighting, so leaving the authored PBR response lights an already-lit
texture. The map is applied to the **shared template before cloning** — `Material.clone()`
copies the `.map` reference, so six satellites cost one GPU texture; applying it after cloning
looks identical and wastes six uploads. A texture failure degrades to untextured-but-present
and must never cost the model.

**26.10 — Scale is reconciled at the mount, not in the data.** Orbit radii, cloud radius and
sizes all stay in the source project's "Earth radius = 1" units, and the orbit
group mounts with `scale={EARTH_CONFIG.radius}` (the geo-marker group did too, until the
marker's removal on 2026-08-19; the destination in `earth/navigation/destination.ts` keeps
the same convention, taking the Earth radius as a parameter). Rewriting the numbers
would have been equally easy and considerably worse: the presets stay diffable against
`earth-connections`, so a fix there can be pulled across by eye. `interactionConfig` follows the
same rule, multiplying at definition.

**26.11 — The satellite model's orientation never reads camera or selection state.** A `spinner`
group advances by per-frame delta only, seeded per satellite. The badges it replaced billboarded
with `lookAt(camera)`, which made satellites visibly reorient during the focus fly-in — so
opening or closing the case panel now cannot produce an orientation jump, and `update(delta)`
runs every visible frame whether frozen or not (the `frozen` flag skips the orbital write, never
the spin). Raycasting uses an invisible sphere at `baseSize`, not the GLB's thin, spiky meshes,
which flickered the highlight. The panel hung off `content` is a scoped exception: it billboards
in the vertex shader, because an unreadable label has no purpose.

**26.11a — The satellite's size is one number with three dependents.** `ORBIT_CONFIG.satellite.modelSize`
doubled (0.26 → 0.52) on 2026-08-20 because the model read too small in the overview. Three other
numbers moved with it, and none of them is an independent taste call:
`satellite.baseSize` (0.10 → 0.20), or the raycast sphere sits buried inside the model and the
outer half of every satellite becomes a hover dead zone; `panel.offsetY` (0.12 → 0.30), because the
plate's lower edge is `offsetY - height / 2` and the panel did **not** scale — doubling the offset
alone would have pushed it *deeper* into the model; and `INTERACTION_CONFIG.closeUp.distance`
(0.55R → 1.05R), because a subject that subtends twice the angle overflows a frame tuned for the
smaller one. That last one had already flip-flopped once for exactly this reason (1.25R for the flat
badge → 0.55R for the smaller GLB). Change `modelSize` again and all four move together.
The offset has moved twice since, and neither move was recorded here at the time: plan 008 took it
to 0.34 when the plate became a projection field (`2f7d082`), and on 2026-09-07 the client asked for
the mark to sit closer to its satellite, which took it to 0.31. Both are still bounded by the same
thing this entry exists to name — the panel's lower edge against the model's top — and the current
reasoning, including the measurement of what the model's top actually is, lives on `panel.offsetY`
in `orbitConfig.ts`.

**26.12 — A raw `ShaderMaterial` gets no output colour conversion.** It must end with
`#include <colorspace_fragment>`. Built-in materials append the transform and a hand-written one
does not, so this fails as "looks a bit dark" rather than as an error. Recorded because it
recurs with every custom shader added here. (The chunk was `encodings_fragment` before three
r152; this project is well past it.)

### Content and UI

**26.13 — The case-study sample data names real Spanish companies and every metric in it is
invented.** Mango, Cabify, Estrella Galicia, Idealista, Camper and Freixenet are not clients and
those results did not happen; the chart series are invented on the same terms. `caseStudies.ts`
says so in bold at the top. Fine for an internal prototype and **not fine to ship** — attaching
fabricated results to a real company's name is a false endorsement claim, not a rough draft. It
is also why every `logo` in §18 is still `null`. Replace before anything is published — and note
that it now has to be replaced in **two** places: WordPress, and `content/seed/` + `content/fixtures/`,
which are what `npm run dev` and CI build against.

`.ts` rather than `.json` so `tsc` catches a mistyped field, and because the orbit system builds
its panels synchronously at mount. **Both reasons survived the CMS**, because the generator emits
a `.ts` module rather than fetching JSON (§27). What did not survive is the seam this entry named:
`SATELLITES` was deleted, the content lives in `src/content/generated/caseStudies.ts`, and the
orbit pairing moved to `orbitAssignments.ts` (§28).

**26.14 — Case-panel charts are hand-rolled SVG.** Four fixed chart types over at most twelve
static points do not justify a dependency. The data file decides the chart and the renderer only
normalises each series to its own min/max, so units do not matter and only the shape does. The
donut differentiates segments by **opacity, not hue** — the panel is monochrome glass and has no
colour language to borrow. New content blocks in that panel must reserve their height, because
it stays mounted through its fade and anything that changes height mid-fade makes it jump.

**26.15 — The audit section is a projection shift, not a camera move.** The camera pose already
has two owners that reassert it per frame, so a third writer was never on the table.
`AuditCameraShift` animates `camera.setViewOffset()`, one level below the pose: whoever owns the
camera keeps drag, zoom and the warp FOV surge, and `clearViewOffset()` is an exact restore by
construction with no saved pose to drift. The shift is derived from the panel's CSS width. The
curtain itself is CSS off the master timeline — the section can open in *any* phase, so it is
user-triggered UI rather than a beat in the intro, and follows the 26.2 idiom instead.

**26.16 — No interactive chrome until `site`.** The intro offers nothing to click until
everything has arrived. The gate is `phase === 'site'`, passed down as a `ready` prop, and it is
correct *by construction* rather than by tuning: the orbits phase holds for
`max(toCornerDuration, orbitRevealDuration())` before the `site` label fires, so `site` means
"last satellite drawn in, logo parked". Controls are **unmounted** before then, not hidden —
nothing to focus, tab to or read out — which is also what fires their CSS entry animation
exactly once. Any future chrome gates on the same prop-from-phase pattern, never its own timer.

> **AMENDED 2026-09-03 — the chrome is one header, and it lives on every surface.** The
> `site` gate stands; the "and Earth showing" half of it does not. `SiteHeader`
> (`components/SiteHeader.tsx`) is the site's one header: transparent over Earth and Murcia, a
> paper bar on the blog, and it is what the two triggers render INTO (a portal from each
> section, which keeps their focus return and `data-state` choreography where they were). The
> sections lost their `active` prop and its hard-close: a warp cannot start while either panel
> is open (`canNavigate`), so Earth never stops showing under one. The blog mounts its own
> instances of both sections and the legal panel (`idPrefix` keeps the ids apart in a warm
> document; `recomposesScene={false}` keeps `auditView.open` to one writer per scene), which is
> why their stylesheets moved out of `styles.css` and next to the components — `blog.html`
> never loads `styles.css`. The 3D logo no longer has a margin of its own: `CornerLogoLayer`
> measures `.site-header__row` and the motion module anchors the model's EDGE to that inset and
> scales it to that line's height, so the two 48px that had drifted (centre vs edge, and a logo
> that grew with the window while the buttons did not) are one number in one place. Phones get
> a burger in the same header — a white sheet with the two triggers, nothing more yet.

> **AMENDED 2026-09-04 — the brand cell is 3D on the blog too, and the SVG is now the
> fallback.** The cell that Earth and Murcia leave empty for the overlay pass is the cell the blog
> fills with a live mini-canvas of its own: same GLB, same bake, same idle spin, `createCornerLogo`
> unchanged. Both hosts, because "the mark is 3D over there and flat over here" is exactly the kind
> of difference that reads as a bug. `blog/BlogHeaderLogo.tsx` paints the SVG first and swaps only
> when the model is compiled; `blog/headerLogoRuntime.ts` is the dynamic seam that keeps three.js
> out of the cold blog's initial graph, and it holds ONE renderer per document rather than one per
> mount — `Index` and `Article` are different component types, so a component-owned context would be
> rebuilt on every article open. Two things were fixed on the way and are the reusable part:
> `logoMotion.worldPerPx()` divided by `window.innerHeight`, which is the render surface only while
> the canvas is the window (`setSurfaceHeight` now supplies it, and a 26px mark is where that was
> two orders of magnitude wrong); and `CornerLogoLayer` reached `DEFAULT_CORNER_METRICS` out of
> `logoMotion` for a plain constant, a static edge into a three-importing module that cost a
> modulepreload on `/` the moment the logo had a second consumer. Placement stayed ONE concept —
> the motion module anchors the box's left edge, and centring is arithmetic at the call site — rather
> than growing a second, mutually exclusive framing mode. See `adr/013`'s amendment for the costs
> that were accepted: two GL contexts in a warm document, `/` at 11 initial requests, and a light
> material on a paper-white bar.

> **AMENDED 2026-09-04 — the phone menu is a glass field, not a white sheet.** The burger's
> "nothing more yet" is now the thing itself, and it is drawn in the site's own material: the
> emitter line (the audit curtain's) ignites under the header, dark glass (the case panel's)
> wipes down from it over the live scene and thins to nothing at the floor, and the two doors
> rise into it one behind the other. No edge anywhere — the hologram's rule
> (`createHoloPanel.ts`), and §6's: the glass wipes under cover, nothing cross-fades. Paper
> glass over a light ground (Murcia's sky, the blog's bar), keyed off the `tone` the header
> already has. Still the two doors only; the user chose that over navigation entries. All of it
> CSS keyed on `[data-menu-open]` with a delayed `visibility` flip — no clock in JavaScript, so
> reduced motion is one media block. Two things it changed outside the stylesheet: the burger
> now precedes the items in the DOM so Tab reaches them, and the header reports its open state
> to App, because the global Escape's re-seek to 'site' snaps the parked logo and had been doing
> so on every Escape meant to fold the sheet. Working detail, the collisions found and the
> capture recipe: `plans/011-phone-menu-glass-field.md`.

> **AMENDED 2026-09-08 — four bars, and on the scene they are geometry.** The header's two ends
> are now one composition drawn by ONE pass: the brand mark at the left inset and the phone
> burger's bars at the right, both in `createCornerLogo`'s scene on its camera
> (`corner-logo/headerBurger.ts`). Not a second overlay pass and not a canvas of its own — the
> pipeline still has exactly one overlay slot, and `isDrawable()` is still the MARK's visibility,
> which is correct for the bars too because they are only ever measurable at phase 'site' (this
> section's own definition of it) and go with the mark on a replay's `reset()`. Colour is
> deterministic per face — three shades, no lights — because on the light tone the facets have to
> come out LIGHTER than a near-black front face, and lighting only darkens; the front face
> carries the contrast `siteHeader.css` already measured and argued for. Static: the ✕ morph is
> gone from BOTH surfaces rather than reworked, since it does not map onto four bars, and the
> state is still carried by `aria-expanded` and by the field igniting.
>
> **The flat bars stay in the DOM**, hidden with `visibility` and never `display`, because they
> are the geometry's source of truth — the module measures their count, length, thickness and
> pitch, so `siteHeader.css` remains the single owner of those numbers exactly as it is of the
> line the logo is placed on — and because they are the fallback: `burger3d` is off when the GLB
> or its chunk never arrives, and an empty 44×44 button on every phone is not an acceptable
> degradation. A zero-width box is also how CornerLogoLayer asks "phone, and are there actions
> yet", so 767px is not copied into TypeScript.
>
> The blog is untouched and `adr/013` needs no widening: it builds the same module on its own
> little renderer, never measures a burger, and so carries four invisible meshes and flat bars.
> **The cost accepted** is the layer stack — the bars now draw at z 10 with the canvas while the
> button stays at 70, so with the audit curtain or a modal open on a phone they read through that
> surface. Recorded rather than fixed; if it matters, the fix is to drop `burger3d` while a panel
> above the canvas is open.

> **AMENDED 2026-09-08 (later the same day) — the bars fly, and the menu is the frame they make.**
> Tapping the burger sends its four bars to the centre of the screen, where they stretch into the
> four sides of a rectangle; an HTML panel holding the two doors and a ✕ arrives inside it. Closing
> plays that backwards — the panel fades, THEN the frame unforms and the bars fly home — and a door
> chosen from the panel opens only once they are home. Closing without choosing opens nothing.
> Scene surfaces only, phones only. Working file: `plans/021-phone-menu-3d-frame.md`.
>
> **"No clock in JavaScript" (the 2026-09-04 amendment) is retired for the scene**, and what replaces
> it is a split rather than a surrender. React owns the PHASES —
> `closed · opening · open · closing · retracting` — in the `setTimeout` shape AuditSection and
> ConsentBanner already use. The frame loop owns the INTERPOLATION: it is handed one boolean and
> eases from wherever it currently is, so a reversal mid-flight resumes instead of replaying. Neither
> reports back to the other, so there is no clock to keep in step — only the constants, and
> `corner-logo/headerMenuTiming.ts` is the one copy of them. That module imports NOTHING, which is
> what lets the header read it without opening a static edge into three. `utils/easing` gained
> `cubicBezierEase` for the same reason: the panel fades on a CSS curve and the bars fly on the same
> one, rather than on a hand-picked approximation that drifts the first time either is retuned.
>
> **The dim is a quad in the same overlay pass, not a scrim in the DOM**, and that is forced: the
> bars are drawn on the canvas at z 10 and every HTML overlay in this app paints above it, so a
> scrim would hide the very frame it was meant to sit behind. It is ordered by DEPTH and not by
> `renderOrder` — three draws the opaque list before the transparent one whatever the render order
> says — so it passes everywhere the overlay's opaque geometry did not draw, and the frame and the
> brand mark stay lit inside it. For the same reason the footer, the rail, the consent plate,
> `.case-panel` and `.murcia-ui` stand down while the menu is open (`data-menu-open` on
> `.app__scene`): they live between the frame and the panel and would otherwise paint over the dim.
>
> **The blog is untouched** and keeps the glass field verbatim — it has no scene canvas, so it has
> nothing to draw a frame with. The field's CSS is SCOPED to `[data-layout='blog']` rather than
> replaced, the element is rendered for that layout alone, and the blog runs no phases at all: it
> toggles, and a chosen door opens in the same tick it always did.
>
> **A door's click is swallowed and re-issued**, not re-implemented. The interception is a capture
> listener on the HEADER, and the placement is the mechanism: two capture listeners on the same node
> fire in registration order, so nothing could get in front of the fold from the actions cell — and
> on an ancestor it also runs before React, which dispatches `onClick` from a bubble-phase root
> listener, so `stopPropagation()` means the trigger's own handler does not run at all. It is
> re-issued with `el.click()` once the bars are home, which keeps every trigger's handler, focus
> return and `data-state` choreography exactly where they were. ONE pending slot, latest wins —
> which is also what stops ContactSection, which has no re-entry guard of its own, being opened
> twice by a double tap.
>
> **The header reports itself open for the WHOLE close**, and App's `attentionIsFree` now reads it.
> Until today the menu blocked gestures by covering the viewport with a `touch-action: none` field;
> a small centred panel over a live scene does not, and the deferred door would otherwise leave a
> 600 ms window in which nothing was open and a pinch could commit a warp.
>
> **The 2026-09-08 cost is paid off.** That amendment accepted that with a panel open the bars would
> read through it. They cannot now: `data-panel-open` takes the burger away entirely while
> Auditoría, Contacto or a legal doc is open, and on a phone the menu is the only way into any of
> them, so no route is lost. It is `display: none` and not a fade, because a zero-size box is also
> how CornerLogoLayer is told there is no burger to draw.

> **AMENDED 2026-09-09 — the viewport hinges away, and the menu is what it uncovers.** The two
> 2026-09-08 amendments above are REVERSED before anyone watched them: there are no geometry bars,
> no flight, no frame and no dim. The burger is three flat bars again — folding into a ✕ while the
> menu is open, which three bars can do and four could not — and on the scene, tapping it moves the
> SCENE. The viewport — the canvas and everything drawn on it, the brand mark
> included — becomes a rigid card that slides down, moves away from the viewer and hinges back on
> its bottom edge, all in one motion, and the menu is the layer it uncovers behind itself: two
> doors set as type in the band the card leaves free. Closing is the exact inverse. Scene surfaces
> only, phones only. Working file: `plans/023-phone-menu-scene-card.md`.
>
> **The scene's burger is white on BOTH tones, and twice the size it was.** It no longer goes ink
> over Murcia's daylight the way the bare Contacto text does: it is the one control that does not
> restate the sky. The bars double to 44 × 4 px at a 12 px pitch — the same 11:1 ratio, simply
> read bigger — and at 44 px they span the button edge to edge, so the button stays pinned to
> `--header-control` or the glyph would leave the header's line. §37's four homes for the blue
> stand; the burger wore `--accent` for an hour on 2026-09-09, on the argument that it is the only
> route to the Auditoría box, and went back to white on client direction. What survived that hour
> is the tone-independence, which the blue was the first thing to need.
>
> **The cost is on Murcia and it is not hidden.** White is 21:1 over Earth and, over Murcia,
> whatever roof happens to be under it — pale roofs are most of that city, so it falls under the
> 3:1 a control wants in places. Doubling the bars is what makes it hold at all: 4 px of mass
> reads where 2 px would vanish. If it reads too faint on a real device the fix is a shadow on the
> bars, never a colour that follows the sky, because not following the sky is the rule.
>
> **The card is CSS on a wrapper, not a change to any camera.** `.app__stage` (fixed, full
> viewport, z 10) carries `perspective`; `.app__viewport` inside it carries the transform —
> `translate3d(0, y, z) rotateX(tilt) scale(s)`, in that order, so each knob is the thing it is
> named — with its origin on the card's bottom edge, which is what "hinges away" means. The stage
> wraps the canvas and NOTHING else, because a perspective, like a transform, makes an element the
> containing block for its `position: fixed` descendants (the `.nav` trap `styles.css` records),
> and the header, the rail and the modals must keep the viewport as their frame. The menu layer,
> `.app__menu`, is App's element at z 5 — behind the canvas, which is what "revealed" requires — and
> SiteHeader portals its menu box into it on a phone (`menuHost`), so the triggers keep portaling
> into `.site-header__end` exactly as before and the two sections learn nothing.
>
> **The canvas is neither remounted nor resized by any of this**, and the second half needed a
> change: R3F measures its container with `getBoundingClientRect()`, which includes ancestor
> transforms, and the first resize or scroll event while the menu was up would have pushed the
> tilted rect into `gl.setSize` → `composer.setSize` → `setViewport` — the cascade the scene wrapper
> exists to prevent. `SceneCanvas` now asks for `resize={{ offsetSize: true }}`, which measures
> layout size, and the e2e provokes a resize with the menu open and checks the drawing buffer and
> the renderer's resource counts did not move. The card is also `pointer-events: none` for the
> whole of open and closing, because every pick, drag and raycast maps the pointer through the
> canvas's client rect, and a tilted card's rect is not the surface it was rendered on. A tap on the
> card therefore falls through to the layer's ground, which is "outside" to the header, and closes
> the menu — which is what a tap on the scene should do. Two traps in that sentence: the stage is a
> full-viewport box ABOVE the layer and takes every tap unless it is `pointer-events: none` itself
> (the card turns them back on), and R3F writes `pointer-events: auto` inline on its container, so
> only an `!important` on `.scene-canvas` actually takes the canvas out from under a tilted card.
>
> **The composition is knobs, not numbers.** How far the card drops, recedes and hinges, its
> radius, the perspective, the hinge and the eye are custom properties on `.app__stage`, tuned by
> eye and not settled here; `?menu3d=1&y=42&z=-140&tilt=12` (`app/protoMenu3d.ts`, debug builds
> only) writes them inline so they can be tuned on the phone they are for. The one number React
> needs — how long the card takes — is `MENU_MOTION_MS` in `corner-logo/headerMenuTiming.ts`,
> written onto the stage as `--menu-3d-ms`, so the phase timer and the transition are one value.
>
> **The phases shrink to three** — `closed · open · closing` — and the deferred door is gone. There
> is no `opening`: the reveal needs no gate, and a tap on the burger mid-close reopens from
> wherever the card is, which a transition does for free. A chosen door opens in the tick it was
> chosen and the card returns to fullscreen under the arriving panel; a panel taking over folds the
> menu SOFTLY for the same reason. What survives from 2026-09-08 is the rule that the header
> reports itself open for the whole close — `attentionIsFree` still reads it — and that the chrome
> between the canvas and the header stands down on `data-menu-open`, now because it would stay flat
> over a tilting scene. `cubicBezierEase` leaves with its only consumer.
>
> **Two things are deliberately left to the eye, and one to a device.** The brand mark rides the
> card because it is painted on the canvas — that reads as the whole scene plane moving, and if it
> reads wrong the fix is to hide it while the menu is up. The doors' type — sentence case,
> `clamp(32px, 9vw, 40px)`, bare, the rules and numerals removed the same day — is the first proposal, not a canvas-approved one. And
> the rounded corners rely on `overflow: hidden` clipping a composited WebGL layer under a 3D
> transform, which iOS Safari has been known to ignore; the fallback is `isolation: isolate` on the
> card, and it is untested here because both mobile projects are Chromium.

**26.17 — The cursor glyphs are inlined path data, and `public/icons/*.svg` is the design source
that is not read at runtime.** Redrawing those files changes nothing on screen until the `d`
attributes are re-pasted into the component; both the component and the stylesheet say so at the
point of use. Nothing to fetch and nothing that can 404 mid-session, which for a cursor is the
difference between a styling risk and no visible pointer at all. Two properties must not be
"cleaned up": **white fill with a thin black outline**, which is what keeps it legible over both
the black starfield and the white case-panel glass, and **`fill-rule: nonzero`**, without which
the finger divisions punch holes and the hand renders shredded.

**26.18 — Debug config is ephemeral, and reduced motion and skip are part of the design.** No
persistence of any kind: every reload starts from the committed defaults, which are the source
of truth. Escape skips to the end state from any point — at ~16 s that is not a courtesy — and
under `prefers-reduced-motion: reduce` the sequence places everything at rest with no warp, no
crossover and no flight, since a 2.6 s FOV surge with accumulation blur is exactly the motion
that triggers vestibular symptoms. Reduced motion still shows the *outline* and lets readiness
bring the fill, because filling early would announce readiness to the users least able to
reinterpret it (§10).

**26.19 — The case panel is a two-stop bottom sheet below the breakpoint, and the breakpoint is
width OR height.** Added 2026-08-18, porting Murcia's district panel (§8 in `PROJECT_MEMORY`)
rather than inventing a second sheet.

A single-stop sheet shipped on 2026-08-14 and failed at both of its jobs. Anchored to `bottom: 0`
at `60dvh`, its top edge landed at 40% of the screen while the close-up centres the satellite at
50% — so **the panel covered the satellite it was describing**. And the case did not fit: 706 px
of content at 393×852 and 719 px at 360×740, against 511 px and 444 px of sheet, leaving 28% and
38% behind a scroll with no handle, no stop and no shadow to say there was one.

The stops are Murcia's 40 / 85, unchanged, and they hold here: peek is 341 px at 393×852 — the
header, name, meta line, both metric tiles and the summary — with the satellite at y=426 clear of
the sheet's top edge at y=511. Expanded is 724 px against 706 px of content, so a typical phone
reads the whole case without scrolling. **The camera does not re-frame when the sheet expands**,
for the reason `PROJECT_MEMORY` §8 already gives: at the reading stop the viewer has chosen
content over scene, and chasing the remaining strip reads as instability.

The media query is now `(max-width: 767px), (max-height: 500px)`. It was width alone, and a phone
in landscape is 852×393 — wide enough to miss it entirely and fall back to the desktop dock:
324 px wide, **820 px tall on a 393 px screen**, `overflow-y: visible`, centred with
`translateY(-50%)`, roughly half the case off-screen top and bottom with no way to reach it.
`closeUpFraming.ts` carries both conditions as `CASE_PANEL_DOCK_MIN_WIDTH` and
`CASE_PANEL_DOCK_MIN_HEIGHT`; they are two halves of one composition decision and moving one
without the other leaves the camera clearing a dock that is not there.

**26.20 — The drawing's pace is measured in seconds of visible time, and it is uniform.**
Added 2026-08-17, after three separate visitor reports — "it doesn't start", "it's too fast to
see", "it starts then freezes" — turned out to be two bugs in how the playhead spent time.

*Three seconds, in seconds.* `elapsed` accumulated `min(dt, maxDt)`, so the minimum duration was
three seconds **of frames shorter than 50 ms** and anything slower stretched the drawing in
proportion. Measured against the real module: 4.00 s at 15 fps, 8.57 s at 7 fps, 12.00 s at
5 fps — and the intro is precisely when frames drop, since three.js evaluating, 2.43 MB of JPEG
decoding and the GPU warmup all land inside it. A production build measured here ran at 7 fps
and took **10.0 s**. The clock is real now; what gets rationed is one frame's **advance**, against
the recent frame cadence rather than a constant, so a steady 7 fps still finishes in three
seconds while a one-off stall is repaid over the following frames instead of teleporting.

*The pace is a line, not a curve.* The no-signal floor was `1 - exp(-elapsed/tau)`, which
front-loads its movement and then decays without ever arriving: 0.326/s at the start, 0.0001/s at
23 s. That is one curve producing both of the complaints that sound contradictory. It is now a
uniform ramp covering 85% of the outline in the minimum duration, then the remaining 15% at a
slow **constant** rate — constant-slow reads as working, asymptotic reads as crashed. This is the
common path, not the edge case: measured progress is pinned at 0 until the app chunk lands, ~6.6 s
in on Fast 3G.

*Two corollaries.* A wall clock can be spent while nobody is watching, so the drawing stops
counting while `document.hidden` — the same guard the master timeline and the warp already keep,
hand-rolled because this module has no GSAP. And the ending is timed from the moment readiness
**arrives**, not from page load: the minimum-duration ramp saturates once the wait outlasts it and
then caps nothing, which was observed cutting the collapse and the fill into a single frame
(readiness 4538 ms, complete 4540 ms). Whatever the drawing waited for, the two beats that mean
"ready" keep their own ~0.55 s.

*What was NOT the problem.* The boot chunk being a separate request looked like the reason the
drawing starts late, and inlining it into the document was built and A/B'd — 5 runs a side, four
network profiles. It loses, worst on the slowest links (Slow 3G 1789 ms linked vs 1841 ms
inlined). The preload scanner already fetches a 6 KB tag in parallel while the document parses;
the document is the critical path, and inlining makes it bigger. The numbers are kept in
`vite.config.ts` so the idea is not re-attempted from the same reasoning.

**26.21 — The brand panel rests on the isotype and unfolds into the logo on selection.** Added
2026-08-25 (`74098b4`). Six full wordmarks were permanently on screen above the satellites — a
lot of horizontal text competing with the Earth for a view whose subject is the Earth. The panel
is now a **square showing the brand's symbol alone**, and while its case study is selected it
unfolds to 2:1 with the full lockup, folding back on deselect. Selection only, never hover:
`createSatelliteFocus` already told `selectedId` from `hoveredId`, and the 1.14× bump stays the
hover's only response.

*One eased value drives everything.* Each frame `panelExpansion.ts` produces a single number
and the quad's width, the frame's aspect correction and the isotype→logo crossfade are all
derived from it — `uAspect` is computed **from the width that was just written**, never lerped
beside it, so the frame cannot disagree with the quad's real shape for a frame. Progress is
stored as a value rather than a start timestamp, which is what makes reversal free: a panel
caught halfway open turns around from 0.6, not from 1.0. `reset()` snaps rather than animates,
for the reason the hover bump is already cleared outright rather than tweened across a replay.

*Two atlases, and the panel aspect is decoupled from the cell aspect.* `createBrandAtlas` takes a
`kind` — a closed set of exactly two, with the cell sizes as constants keyed by it rather than
parameters, because a caller able to pass a third combination would build a grid that quietly
letterboxes instead of failing. The fragment shader **contain-fits** each sample against the
quad's *current* aspect (`containUv`), with the bounds check on the contained uv **before** the
cell fold — afterwards the coordinate is inside its cell by construction, and `ClampToEdge`
would smear the neighbouring plate's border across the letterbox. This retires the "2:1,
matching the atlas cell aspect — change both together" contract §9 of `PROJECT_MEMORY` used to
carry. Both widths derive from `PANEL_HEIGHT`; to make the resting square read larger, raise the
height, never the collapsed width alone.

*The content model carries the pair* — see §18's amendment for the hard requirement.

**How you would know it broke.** A wordmark visible at rest. An isotype that stretches to twice
its width as the panel unfolds. A border thicker on one axis mid-transition. A panel that snaps
fully open before closing when the viewer clicks straight from one satellite to another.

**26.22 — The panel's chrome is dark glass, and the brand colour lives on the emitter.** Added
2026-08-25 (`718f2d0`), immediately after 26.21, because zooming in on the settled state showed
that the mechanics were right and the look was not: fat cyan corner brackets, a brand-coloured
wash over the whole pane, a filled-disc "avatar" with a dark initial, a bold underlined wordmark
and scanlines striping across all of it — a generic sci-fi HUD, none of it a choice made for this
site. It mattered more than it had a day earlier, twice over: **real trademarks will be seen
through this chrome**, and a brand-tinted wash under a full-colour logo is a colour cast on
someone's mark; and **the isotype is on screen six times, permanently**, at ~30 px, where a frame
drawn as a fixed fraction of the panel was the loudest thing in it.

*The chrome is designed to be looked through, not at.* The panel is the in-scene cousin of
`.case-panel`: the same near-black glass (`rgb(12,15,22)`, alpha 0.30 → 0.42), a white hairline at
0.16, four small corner ticks *outside* the pane, and the artwork composited over the glass
**untinted** through a straight-alpha `over()`. No scanlines, no grain, no flicker — the plate is
a trademark and is drawn as delivered. `panel.frameColor` is gone.

*The hairline is screen-constant.* Its width comes from `fwidth()` (core in WebGL2, which three
0.174 targets exclusively), so it is ~1 px at the close-up **and** ~1 px on the resting square.
The old `smoothstep(0.012, 0.020, edge)` in uv scaled with the panel and was a band at overview
distance; this single change is why the collapsed state now reads as artwork with a frame rather
than a frame with something inside.

*Exactly one brand-coloured element.* The **emitter line**: a brand-colour line along the pane's
bottom edge, the pane's exact width, with a soft bloom falling away beneath it into the band the
`panel.inset` (0.92) leaves outside the glass, fading out before the quad's edge can clip it. It
is what makes the panel read as projected up from the satellite, and it is where all the brand
colour moved to. The bloom breathes at 8% over 1.4 s; nothing else moves. The alternatives —
pure glass with no signature, or tinting the hairline itself — were considered and rejected: the
first leaves six identical dark squares with nothing saying "a different client" until the letter
is read, the second puts saturated colour back beside the artwork.

*The drawn floor is a monogram, not an avatar.* A stroked brand-colour ring (stroke 7% of the
diameter, drawn inside the radius so its outer edge lands on the padded box like a real isotype)
with the initial in the brand colour at weight 500. The lockup's wordmark is soft white, 500,
tracked `0.02em`, with **no rule beneath it** — it contrasts with the ring instead of matching
it, which is what stops mark, name and ground merging into one hue. Isotype padding tightened
56 → 40 px, because at 30 px every pixel of margin is a pixel the symbol does not get.

*Two defects the browser check surfaced.* `drawLockup`'s text limit added `originX`, so a name in
the second atlas column never shrank and "PcComponentes" ran off the cell — it is a width now.
And the scene's bloom thresholds at **0.62 linear luminance** (§19); the atlas is SRGB-tagged so
the sampled value of white is 1.0 whatever its alpha, and a translucent white wordmark bloomed
into a halo. The wordmark is opaque `rgb(200,200,200)`, ~0.58 linear — under the knee.

**Ruled out.** A brand-tinted pane (the cast). Brackets, even thin ones (a targeting reticle).
Scanlines on the plate (banding across the letterforms, muddy on real logos). Any per-frame hash
flicker (reads as broken, not holographic).

**How you would know it broke.** A real full-colour logo with a colour cast. A frame that reads
as a band on the resting square. Saturated colour anywhere in the chrome but the bottom edge. A
glowing wordmark. A bloom cut off flat at the quad's edge.

**Not exercised.** A real full-colour trademark through the new composite — no asset was
available. The composite is neutral-over-glass by construction; the day the first real logo
lands, look for a cast before anything else.

---

**26.23 — A brand mark an editor uploads is checked at the field, in two tiers, and again at
build time.** Added 2026-08-26, closing the gap §26.21 left: the schema had both image fields and
the pipeline mirrored both, but format and size were **prose in the field description**. Nothing
stopped a 3000×1200 JPEG being published.

*Why it needed anything at all.* `drawLogoContained` contain-fits whatever arrives, so a wrong
image never breaks the panel — it draws small, or soft, or, for a format with no alpha, over its
own opaque rectangle. Nothing throws, nothing warns in production, and the result is a client's
trademark rendered slightly wrong on the one screen it appears on. That is the failure mode a
content pipeline exists to catch, and catching it at deploy time is too late to be useful to the
person holding the file.

*Two tiers, because they answer different questions.* **Error** blocks Publicar: not PNG or WebP,
under 432×432 (isotype) or 900×400 (logo), or an aspect outside 0.75–1.33:1 and 1.5–5:1
respectively. **Warning** publishes and flags the field: below the ideal, wastefully above it, or
an unusual-but-workable proportion. The split follows the renderer — the error band is where
"drawn smaller" becomes "illegible", and everything short of that is advice.

*The numbers are the atlas boxes, doubled.* A 512² isotype cell padded by 40 fits a 432×432 box; a
1024×512 logo cell padded by 64/56 fits 896×400. The floors are those boxes; the ideals — 512×512
and **1600×800** — are roughly 2×, which is what survives the downscale at the close-up.

*JPEG moved from tolerated to refused.* The media contract used to call it "the wrong choice"
and let it through. A format that ships a rectangle over the dark glass is not a judgement call
worth delegating. SVG keeps its own separate check and its own message: the argument there is
stored XSS, not alpha, and collapsing the two into "extension not allowed" teaches neither.

*No async validator, and none needed.* Sanity names an image asset after its own dimensions and
format — `image-<hash>-1600x800-webp` — so both tiers are a string parse. The mirror reads the
same numbers off the URL, before it fetches. The Studio's parse **fails open** on an id it does
not recognise: if Sanity changes that format the Studio must stop pre-checking, never start
rejecting correct artwork. The build is the half that guarantees.

*Enforced twice, in two packages, on purpose.* `sanity-studio/schemas/lib/brandMark.ts` and
`BRAND_MARK_RULES` in `caseStudies.collection.ts`. The Studio is its own npm package and neither
side may import the other — the same arrangement §26.21's pairing rule already has. The Studio
covers the editor; the build covers `sanity dataset import`, a restored backup and the HTTP API,
which write documents no Studio ever sees. `options.accept` narrows the file picker as a third,
weakest layer: an asset chosen out of the media library never passes through it.

**How you would know it broke.** A `.jpg` or an undersized file in `public/logos/`. A `mediaRules`
key drifting from its `mirror` field name, which would silently disable the whole geometry tier —
`collections.test.ts` asserts the two agree for that reason. The Studio accepting a 300×300 JPEG
without a word, which means `parseImageRef` is failing open against a live asset id.

---

## 27. Content is generated at build time, and the browser never calls the CMS

**Decided** 2026-08-20. Full reasoning and the alternatives in **`adr/010`**.

> **Amended 2026-08-23 by §31 (`adr/011`).** Everything below about WHEN content is fetched and
> what happens when it cannot be still holds. The CMS named throughout is no longer WordPress —
> it is Sanity, and the environment variables changed with it.

**WordPress is the editorial source of truth; the network boundary is the build, not the
browser.** `npm run content:build` fetches every collection in Node, validates it, and emits
`src/content/generated/*.ts` — ordinary typed modules, imported exactly as the hand-written ones
were. There is no runtime fetch, no loading state, no deadline, no new boot resource, no async
`createOrbitSystem`, and no CSP or CORS work. This is a 3D experience; a third-party origin on
the critical path is the thing being avoided.

**Generated modules are build output, not source.** `src/content/generated/` and
`public/logos/` are gitignored. Git holds `content/fixtures/` (development and test inputs) and
`content/seed/` (an emergency snapshot that drifts by design). Committing the generated modules
would claim a persistence model that does not exist — Vercel writing files during a build does
not commit them back, so the committed copy would go stale after the first CMS-triggered deploy
while still looking authoritative.

**Strict by default, and production is the strict case.** Unreachable CMS, non-2xx, timeout or a
failed validation all exit non-zero, which fails the build and leaves the existing deployment
serving. A publish that cannot be validated must not report success, because a green deployment
is what an editor reads as "my change is live". `CONTENT_SOURCE=seed` is the human-invoked
escape hatch and prints a banner; it is never a default. **And production never defaults to
fixtures either** (2026-08-20, re-audit `CMS-2`): with `VERCEL_ENV=production` and neither
`WP_CONTENT_BASE` nor `CONTENT_SOURCE` set, `content:build` exits non-zero. The fixture default is
for laptops and Preview deployments; a production build has to name its source, because the
alternative was a green deployment serving demo content on the strength of one log line.

**`npm run check` is the content validation gate, and that fell out of the ordering rather than
being designed.** `content:build` writes before `check` runs, so bad content from WordPress
fails `npm run build` with the same assertions that have always guarded hand-written content —
unique ids, non-empty strings, the 140-character district summary, one label per bar.

**Generation is transactional.** Rendered to a temp directory, moved into place only once every
collection has mapped, audited and rendered. One invalid record fails its whole collection; one
failed collection fails the whole build. There is no state in which new case studies sit beside
old districts.

**Ruled out.** Runtime fetch with a static fallback (the shape §26.13 assumed). Pulling inside
`vercel build` with a fallback to the previous output — indistinguishable from success in the
deployment record. Committing the generated modules. Dropping invalid records and publishing the
rest: five of six case studies is a silent content outage, because the globe renders five
satellites and looks deliberate.

**Cost, stated rather than discovered.** While the CMS is down, no deployment can succeed —
including a code-only hotfix. `content/seed/` exists to close that, and it will drift.

**How you would know it broke.** A deployment that succeeded while the CMS was unreachable.
`src/content/generated/` appearing in a commit. A generated module carrying a timestamp — the
emitter is deterministic so that an unchanged collection produces an unchanged file, which is
what makes a content diff mean something and keeps Vite's chunk hashes stable.

---

## 28. Scene composition is code-owned; the CMS owns copy and nothing else

**Decided** 2026-08-20, with §27.

**Which case study rides which orbit is a design decision, not editorial data.** `orbitId` was a
field on `CaseStudy`, declared, documented and never read — the pairing was positional, and it
agreed with the presets only because both arrays happened to be in the same order. A REST
response has no such obligation, and the failure is silent and defamatory: one client's invented
metrics rendered under another client's name.

The field is gone from the content type. `experiences/earth/orbit/orbitAssignments.ts` binds
`orbitId` to `caseId`, which is exactly the shape `scene/cityDistrictBindings.ts` already used
for Murcia — so the repo has **one** concept for "code decides where content appears", not two.

**The consequence is the point.** The CMS may hold any number of case studies; publishing one
does **not** create an orbit. The six presets are hand-placed against the camera's framing
(`orbitConfig.test.ts` asserts radius ∈ (1,3)), and featuring a different client is a reviewable
one-line edit rather than something that can happen in wp-admin unobserved.

**Structural relationships fail the build; they are never resolved by guessing.** Two assignments
claiming one orbit, two naming one case, an unknown preset, or a case the content does not
contain — all throw from `resolveOrbitCases`. The whole value of generating at build time is that
invalid content is rejected before it is deployed, so "first wins" and "drop and warn" would be
throwing that value away.

**What else stays in code, and why — the distinction matters.** Some of this is structural and
some is merely not-yet-moved, and conflating them turns a temporary constraint into a false law:

| Genuinely code-owned | Reason |
|---|---|
| `ORBIT_PRESETS`, `orbitAssignments`, `cityDistrictBindings` | camera framing and GLB geometry, not copy |
| `DESTINATION` (`navigation/destination.ts`) | drives the warp aim *and* the Earth's rest rotation |
| `ORBIT_CONFIG`, `EARTH_CONFIG`, `murciaConfig`, `defaultIntroConfig` | tuning |
| `AuditSection` `<option>` **values** | a contract with the future server-side validator |

| CMS-compatible, left in code today | What would have to change first |
|---|---|
| `introDraw.ts` `CAPTIONS` | the 16 KB boot chunk may import nothing; a generator could inline literals, but there is no editorial value in it |
| `NavigationControl.tsx` hint copy (the gesture sentences and the city's controls) | rendered once as JSX with every input × direction variant, which the stylesheet picks between; a CMS field per variant is eight strings for one sentence |
| `AuditSection` labels, `CasePanel` / `districtPanel` aria strings | nothing structural; no editorial requirement yet |
| `index.html` title / description / OG | needs a per-entity SEO decision, which needs prerendering this app does not have |

---

## 29. The rail's feel is presentation, and its dress is the journey

> **AMENDED 2026-08-26 — `adr/012`. The rail is gone, and the hint waits.** Touch navigates by
> pinching the scene, so the rail lost both of its jobs: the scene is the indicator now, and there
> is nothing left to drag. What survives is the accumulator/spring split below (unchanged, and the
> feel rule with it) and the fact that SOMETHING must say a gesture exists.
>
> The hint's rule inverts. Once-per-visit-from-first-paint was right for a rail, because the rail
> was visible and advertised itself — the hint only had to explain it. A pinch on a bare canvas
> advertises nothing, so the hint now appears after **five seconds with no navigation input** and
> offers itself **once per world**, re-armed on arrival because the two worlds are left by opposite
> gestures and demonstrating one teaches nothing about the other. A two-finger gesture classified
> as Murcia's ROTATION explicitly does not count as having demonstrated anything.
>
> `--nav-progress`, `data-state` and `data-direction` are still written, now as the observable
> surface e2e reads rather than as anything drawn.
>
> **Everything below describes the rail itself and is preserved rather than deleted**, in
> keeping with this file's habit: the reasoning about where FEEL belongs is still correct and
> still governs the spring, and the fill/glass paragraphs are the record of a thing that
> shipped. The rail element, its gradient and its glass no longer exist.

> **AMENDED AGAIN 2026-09-04 — `adr/014`. The hint teaches two stages, and retires earlier.**
> The gesture is now a persistent zoom followed by a push past its limit, so *"scroll to
> travel"* described neither half of it.
>
> Retirement moves with it, from the accumulator's rising edge to **any accepted travel**. The
> first 600px of every gesture never reach the accumulator now, so the old rule let a viewer
> zoom half way across the band with the hint still explaining how to do it. What proves they
> have found the control is that the world MOVED, and the zoom is what moves it first. The
> once-per-world rule, the re-arm on arrival and the rotation exclusion are unchanged.
>
> The line below about the accumulator's constants being the safety case needs one correction:
> `commitDistancePx` moved 900 → 300 under `adr/014` — but for the structural reason that the
> journey is now split in two and 600px of it lives in the band, NOT for feel. The prohibition
> stands exactly as written.

> **AMENDED AGAIN 2026-09-05 — the hint is offered on arrival, and never retired.** The
> once-per-world rule failed in the field: "any accepted travel" includes one nudge of the wheel
> into the zoom band, so a viewer who brushed it was never reminded again in that world, and the
> client reported the hint as "sometimes not appearing". It now carries a sentence under the
> glyph, appears **a beat (1.2s) after every arrival** — the intro handing over, each warp
> settling — hides the moment the viewer navigates, and **returns after fifteen seconds** with no
> navigation input, as many times as that happens. The re-arm on arrival and the rotation
> exclusion stand. `HINT_DELAY_MS` 5000 → 15000, `HINT_ARRIVAL_MS` added.

> **AMENDED AGAIN 2026-09-05 (later) — one glass frame, in both worlds, and the city's
> controls live in it.** The client's review of the day's hints: the sentence was unreadable
> over Murcia (bare text with a drop shadow, floating 40px above the city's own
> `#controls-hint` plate, the two reading as unrelated things), the plate's fade mask into the
> screen edge read as cut off, and none of it moved like the rest of the site. The hint is now
> a glass plate with the beacons' emitter hairline — even tint, no mask, a 1px bottom rule —
> and Murcia's three controls (drag, rotate, select) are ROWS IN THAT FRAME rather than a
> second element: one owner (`createNavigationInput` paints `data-visible`, and the
> stylesheet shows the city's rows whenever the frame is open in Murcia). `ControlsHint` and
> its reading clock are gone with the plate, and so is the `matchMedia` read: every copy
> variant is JSX and `(pointer: coarse)` picks. **And the closing rule is ONE rule**, the
> client's: offered a beat after every arrival, the frame closes **three seconds after the
> viewer's first interaction with the scene** — a wheel, a pinch, a press on the canvas, not a
> press on a button — and does not return until the next arrival. That replaced the
> hide-on-input, the fifteen-second idle re-offer of the morning and Murcia's fifteen-second
> reading clock, all at once (`HINT_DELAY_MS` and `CONTROLS_HINT_MIN_MS` deleted,
> `HINT_LINGER_MS` 3000 added). An interaction that lands before the frame is on screen does
> not count (the arriving gesture's tail, M22). Choreography: hairline ignites, frame rises,
> rows land staggered; each glyph has one part that loops slowly (wheel, fingers, hand, turn,
> ring), all `transform`/`opacity`, all off under reduced motion. Below 480px the controls
> are a three-column glyph card. The Murcia-only lifts (88/128px) went with the plate.

The navigation rail (`adr/009`) is the one control between the worlds, and three 2026-08-20
decisions govern how it reads and feels. All three live in the presentation layer on
purpose: the accumulator's constants (`commitDistancePx`, `idleGapSeconds`, `decaySeconds`)
are the accidental-warp safety case §15 demanded, and nothing here may retune them for feel.

**The fill is a gradient pinned to the track** — Earth blue at the top, Murcia amber at the
bottom, because that is the geography the rail travels — so the tip takes on the
destination's colour as a gesture approaches it, and the endpoint dots wear their world's
colour. Pinning it forced a technique change: a `scaleY` squashes a gradient, so the fill is
revealed by two counter-translating transforms (`.nav-rail__reveal` / `.nav-rail__fill`),
which preserves the component's render contract — compositor-only animation, no React
re-render, `--nav-progress` written straight onto the element.

**The rail stands on frosted glass.** Murcia's backdrop is mid-gray city and bright sky; no
single line colour reads on all of that and on space too, so the rail borrows the panels'
glass material instead of learning which world is behind it — a scene-aware colour was
considered and rejected as coupling the rail to scene state it has no other reason to know.

**The painted progress chases the accumulator through a damped spring**
(`progressSpring.ts`, tuned only in `NAVIGATION_SPRING`): input lands with ~5% of elastic
overshoot and a release settles instead of fading. The spring hangs off `paint()`, never the
gesture — it does not decide where progress goes, it must snap to a LITERAL 0 when settled
(the e2e flick test polls for exactly `0`, and the frame loop's stop condition waits on it),
and it goes critically damped under `prefers-reduced-motion`.

**A gesture exists, and now something says so.** §15's strongest surviving objection was
that nothing on screen signals scroll navigation. The rail carries a once-per-visit hint — a
mouse glyph on fine pointers, a swipe glyph on coarse; the input decides, never the viewport
(the Murcia controls hint records why) — dismissed by `createNavigationInput` on the first
frame a gesture is in flight, through the one funnel every input path shares, and never
resurrected by a reset: a reset returns progress to zero, not the viewer to ignorance.

Broken when: a feel change edits `NAVIGATION_GESTURE` instead of `NAVIGATION_SPRING`, the control
learns which scene is behind it, the hint re-appears within a world after a gesture, or the hint
is shown while the context is refusing navigation.

> **Amended 2026-09-15 (client review):** the gesture hint this section introduced is gone. Its
> last form was Murcia's glass "Scroll" / "Zoom" plate (`.nav-hint`), offered on every arrival and
> closed three seconds after the first scene interaction; the client asked for it to be removed.
> The markup, its CSS, the clock in `createNavigationInput` and `HINT_LINGER_MS` /
> `HINT_ARRIVAL_MS` are deleted. Earth's text hint (§43, §46) has its own timing and is unaffected;
> it keeps the `nav-hint-wheel-down` / `nav-hint-chase` keyframes, whose names are historical.

## 30. Contact, legal and the brand's own mark

The Earth scene grew its floor and its second CTA on 2026-08-20: phone numbers bottom-left
as bare `tel:` links (a number behind a disclosure costs calls), "Términos y privacidad" ·
"Aviso legal" · the © mark bottom-right, and a Contacto ghost button beside Auditoría — a
ghost deliberately, because the blue family belongs to the primary CTA alone. All of it
gates on the audit trigger's own expression (`phase === 'site'` and Earth showing, §26.16)
and joins the rail-suppression context in App.

> **Revisited 2026-08-24 — the floor line carries the © alone.** The client moved each item
> to where the question it answers arises: the phone numbers under the contact dialog's
> heading, the two legal links at the foot of the audit panel (form branch only — the success
> screen is a receipt, not a place to re-read terms). `SiteFooter` is now a single `<span>` and
> takes no props; `AuditSection` gained the `onOpenLegal` prop `SiteFooter` gave up. This
> reverses the "a number behind a disclosure costs calls" reasoning above, deliberately and on
> request: both the numbers and the links now sit one click deep. The contact form's own
> consent link stays where it was — it belongs to the form, not to the floor.
>
> **And the Contacto trigger lost its box.** No border, no fill, no radius, no padding: bare
> text in the trigger's typography, beside the blue Auditoría button. The ghost-button rule
> below (blue is the primary CTA's alone) still holds — this only takes it further. Its `right`
> offset moved 10px → 14px, because with the padding gone the element's edge is the text's edge.

> **Revisited 2026-09-03 — the numbers moved to the dialog's foot.** Under a hairline, after
> the consent note, as the alternative once the form has made its ask; two placeholder numbers
> until the client supplies the real ones (they are CMS content, §31 — the fixture carries two,
> the `development` dataset must be given the second in Studio). The header the trigger sits in
> is now one component for the whole site (§26.16 amendment), so the dialog opens over Murcia
> and over the blog as well as over Earth.

**The brand data has one home, and it is not a collection.** `src/content/site.ts` —
hand-written, like `lookup.ts` — holds the phones, the contact address, the © line and the
legal texts, all PLACEHOLDER and marked so. The content pipeline is strictly
array-of-records synced from the CMS (§27), and a phone number does not earn a post type; if
the client must ever edit these in the CMS, that is the decision to revisit.

> **Revisited 2026-08-23 — §31, `adr/011`.** The client edits their own contact details, so it
> was. `site.ts` is now a compatibility adapter over two generated collections, keeping every
> export name it had; the legal texts are constrained Portable Text rather than `string[]`.

**The contact form obeys the audit form's transport rule** (`contactSubmission.ts`, the §16
demo/production split): demo builds resolve after 700 ms so the flow can be demonstrated;
production REJECTS, because no backend exists and a fake "Recibido" is a message nobody will
read. The two transports are duplicated rather than shared so the two forms can get real
backends independently. The GDPR obligations the audits attach to a real endpoint (consent,
lawful basis, retention — `security-wordpress-api` API-3) ride with it, and the legal panels
are where that text will land.

**Legal pages are panels, because there are no pages.** The application has no router;
"página legal" is an overlay like everything else the viewer opens. The texts are Spanish
placeholder boilerplate (§11) that must be written and legally reviewed before launch.

> **Revisited 2026-09-05 — there are three, and one of them is linked from a banner.** The
> cookie consent banner (§35) opens `cookies`, the third legal document; `terminos` still says
> the forms send nothing to a server, which stopped being true when `api/` landed 2026-09-04.
> Both texts wait on the same legal review.

**The brand's own © is not a credit.** The 2026-08-18 no-third-party-credit requirement
(recorded under §19's superseded ESO entry) is about ATTRIBUTION. Its guard in
`e2e/backdrop.spec.ts` was narrowed from "no © anywhere" to the third-party shapes it exists
to forbid (ESO, CC BY, Creative Commons), so the footer's own mark and the client
requirement coexist.

Broken when: real contact data is edited anywhere but `site.ts`, a form reaches success in a
production build, chrome appears before `site`, or a third-party credit
passes the narrowed assertion, or the
phones and the legal links drift back onto the floor line.

## 31. The CMS is Sanity, and the client edits more than copy

**Decided** 2026-08-23. Full reasoning and the alternatives in **`adr/011`**. Everything §27 says
about *when* content is fetched still holds; what changed is *from where*, and *how much*.

**Sanity replaced WordPress, and nothing working was replaced.** The collections requested
`_fields=id,slug,title,acf` and then read flat top-level keys — `source.name`, `source.summary`.
A real `wp/v2` response returns `title.rendered` and an `acf` envelope, and no layer existed
between them. The fixtures already had the flat shape, so every test passed against a shape
WordPress would never send: the transport was tested, the mapping never was. That is the only
reason this migration was cheap, and it is worth recording rather than discovering again.

**The GROQ projection is the normalization layer.** Each collection declares
`{ type, projection, orderBy }` and the projection returns exactly the shape the mapper reads, so
nothing past `map` ever sees `_ref`, `_type`, `slug.current` or an asset object. Deliberately not
vendor-neutral — `projection` is GROQ and no naming makes it otherwise. A generic multi-CMS
abstraction would have been built for a vendor that does not exist and would have fitted it badly
whenever it arrived.

**One query per collection removes torn reads without making them transactional.** The paginated
WordPress pull had to assert `X-WP-Total` against what arrived, because a collection that changed
mid-pull produced a snapshot with a record duplicated or missing. That failure class is gone. What
remains is that Sanity's query API is eventually consistent with recent mutations, so a build fired
by a publish webhook can in principle read the state just before the publish. Documented as a
freshness concern, not solved with a sleep — measure before adding retries.

**The editable surface grew to services, site settings, legal documents and the blog.** Services
are first-class documents a district references rather than rows nested in one district. Site
settings and both legal documents are singletons enforced twice: the Studio hides the
"create another" button, and the build asserts the count, because a restored backup or the HTTP
API can produce a second document the Studio never showed anybody.

**Structured content is typed blocks, and typed blocks are not HTML.** Legal and blog bodies store
Portable Text; ingestion converts it into a small declared vocabulary and FAILS THE BUILD on a
style, mark or annotation it does not know. Links are restricted to `https:` and `mailto:` by
parsing. `LegalPanel` switches on `kind`; there is no `dangerouslySetInnerHTML` and no raw-HTML
block type. The old rule stands — arbitrary CMS HTML must never reach a renderer — it just stops
being confused with "all CMS content must be plain strings". An unknown block is never dropped:
publishing a legal document missing a clause an editor believed they had written is the worst
outcome available.

**Brand logos are mirrored into the deployment; editorial imagery is not.** A logo is drawn into
the shared WebGL atlas, where a cross-origin draw can taint the canvas every panel uses, so it is
fetched into `public/logos/` at build time and `img-src 'self'` is untouched. Blog images stay on
`cdn.sanity.io` — the library grows without bound and nothing renders them yet. SVG is prohibited
in both places until someone writes a sanitizer on purpose.

**The blog is modelled and not rendered.** No page, no route, no renderer, and
`checks/architecture.ts` asserts nothing under `src/` imports the generated module — the entry
chunk has ~2 KB spare against its 320,000 B ceiling. The schema exists so the format does not have
to be invented later against live editorial copy.

**Ruled out.** Fixing the WordPress mapping and running the install it needs; `@sanity/client` in
the dependency graph; `apicdn.sanity.io` for a build that runs seconds after a publish; a
vendor-neutral source contract; `body: string[]` for legal or blog; mirroring all media, or none.

**Cost, stated rather than discovered.** More of the site is CMS-owned, so a Sanity outage blocks
more builds — `CONTENT_SOURCE=seed` is still the escape and `content/seed/` now carries all six
collections. The app entry grew ~1.6 KB to ~317.9 KB, which leaves the tightest headroom this
budget has had. And the field rules now live in two places that must agree: the Studio schema
tells an editor what is allowed, the build guarantees it.

Broken when: a deployment succeeds while Sanity is unreachable; the browser requests
`sanity.io` or `cdn.sanity.io`; a token or `VITE_SANITY_*` appears in `dist/`; a draft reaches the
public site; a generated module changes bytes on a build where no content did; a legal document
renders with a clause missing; or the entry budget fails and the message blames three.js.

---

## 32. One service per building, one interaction per district

**Decided** 2026-08-27, when the re-exported city shipped `edificio-servicio-001..007` and `009`.

**The district is engaged through a building, never picked as a whole.** Until now "Servicios" was
one cluster (`blog_edificios*`, a stand-in) that opened an accordion of all five services. The
new asset has a building per service, so the unit of attention is the building: hover lights one,
tapping one frames it and the panel shows that service alone. The accordion is gone.

**Which building shows which service is scene composition, not copy (§28).** It lives in
`cityDistrictBindings.ts` as `buildings[] { serviceId, nodeName }`. Buildings are identified by
**object name** — a per-building custom property would say nothing the name does not, and the
names are dot-free by contract. Every service in the content needs a row, and the binding test
fails otherwise: a service published in Sanity that silently never appeared in the city is the
failure §28 exists to prevent. Unbound `edificio-servicio-*` objects (006, 007, 009 today) are plain
city until a service is written for them.

**One `DistrictInteraction` owns N sites; it is not instantiated once per building.** Each instance
owns a `CameraFlight`, four canvas listeners and a panel. Five of them would mean that tapping
building B while A is open has two flights writing the rig in the same frame — exactly the failure
the external-control handover (§20) exists to prevent — plus five panels and a hover/close race.
One raycaster over every site's meshes and proxies answers "which building"; one flight, one panel.

**A swap keeps the distance.** Selecting another building while one is open re-aims the flight
without closing the panel, resetting the sheet stop, moving keyboard focus, or dollying out. The
rig is already at the approach scale, so the second flight's distance delta is zero and the camera
glides sideways (`checks/district-flight.ts` §7d). Closing still returns the distance to rest and
nothing else (§20).

**The service card is the case panel's design, floating.** Amended 2026-08-27, same day: the
docked full-height sidebar was replaced by a floating glass card with the case panel's every
value — `right: 20vw`, `width: min(420px, 38vw)`, vertically centred, gradient glass, 14px
radius, the white-tick eyebrow, the 28px close, 220/340 ms rise-in/fade-out — so the two
panels read as one family. The values are copied into `murcia.css`, the classes are not
shared: `e2e/mobile.spec.ts` locates `.case-panel` strictly and this element is always in the
DOM. It is centred **without a transform** (`top/bottom: 0; margin: auto 0; height:
fit-content`): `getObstructionRect()` measures the offset box, which is pre-transform, so a
`translateY(-50%)` centring would report the card half a height too low and the camera would
frame the building behind it. `checks/district-flight.ts` §7 now describes that card and
asserts the framed centre lands left of it.

**Prev/next wrap.** Both buttons stay enabled at the ends, so keyboard focus never sits on a control
that just became `disabled` and fell to `<body>`. The eyebrow "Servicios · n / N" carries position.
On mobile a step does **not** raise the sheet: the viewer is touring buildings and the camera is
what moves; raising the sheet would hide the thing they asked to see. The nav therefore sits above
the copy in the DOM so it is reachable at the 40dvh peek stop, and CSS `order` sends it to the
foot of the desktop column.

**Left open.** `DistrictContent.summary` and `intro` have no reader now; the contract is untouched
until the Sanity schema is revisited. Per-building `approachYawDegrees` exists in the table for the
buildings against the +Z plate edge, where the framing solve may clamp; it is tuned by looking.

---

## 33. The boot is measured in pixels, and the city is not part of it

**Decided** 2026-08-28, from plan 008. Users reported the screen "flashing white" during the
opening and the intro feeling rough.

**Renderer state is borrowed state, and `warm()` must give all of it back.** The flash was one
frame of Murcia's daylight sky over the whole viewport. `MurciaExperience.warm()` renders the city
once so the transition frame does not pay for 957 instanced buildings, and it already saved and
restored the render target — but three's `WebGLBackground` applies `scene.background` by calling
`setClearColor` on the **renderer** and never puts it back. Murcia's background is `0x9fb4c7`,
Earth's `RenderPass` declares no clear colour of its own, and mid-intro the Earth is small enough
that the clear IS the frame. The clear colour is now restored in the same `finally` as the target.
**Anything that borrows the shared renderer restores every piece of state it touched, not the
obvious one.** The renderer is shared by two experiences (ADR 001/002); this is the second time
that sharing has leaked, and it will not be the last.

**A visual defect needs a visual test.** Nothing structural could see this: the DOM is correct, CLS
is 0, and the frame is gone in 16 ms. `scripts/proto/capture-boot.mjs` takes a CDP screencast and
reduces each frame to a mean luminance, which turns "it flashes" into a number — 190 against a
5-to-25 baseline. `e2e/boot.spec.ts` asserts that ceiling permanently. The capture **reloads**
rather than navigating: before a page's first paint the browser still shows the PREVIOUS document,
which in a fresh context is `about:blank`, and counting its white manufactures the bug being looked
for. That artifact cost a wrong diagnosis first — `color-scheme: dark` was written, measured,
found to change nothing, and reverted.

**The city is not part of the boot.** `MurciaLayer` built the environment on mount, i.e. through
the intro: 1.26 MB of city plus 707 KB of decoder wasm at HIGH priority (three's `FileLoader` uses
XHR, which Chrome prioritises that way) against Earth textures deliberately preloaded LOW so they
could not out-rank the app chunk. It waits for `__vertigoIntro.completed` now. Nothing visible
waits longer: `canNavigate` already requires `murciaReady` AND phase `site`, and `murcia:model`
completes *before* the phase-`site` trigger exists. Slow 4G scene-ready 31.5 s → 25.1 s.

**The Earth preloads stay `fetchpriority="low"`, and this is now measured rather than argued.**
Promoting all six maps to `high` left scene-ready unchanged (within noise) and cost **310 ms** of
time-to-first-drawn-frame. The demotion's original reason holds. Do not re-derive this.

**The remaining intro stalls are required work, deliberately placed.** 23 % of frames over 33 ms on
Fast 4G + 4× CPU, attributed: three 4096×2048 Earth uploads (324/412/485 ms), the synchronous
brand-atlas raster (250 ms), `compileAsync` (377 ms). The warm-up exists to pay exactly these while
the drawing covers the screen. The lever is fewer/smaller bytes — `specularClouds.jpg` is 1.65 MB
and is the last required byte on Slow 4G — not rescheduling.

**Left open.** Satellite assets and the decoders still fetch HIGH before the handover (915 KB
through the gate window). They are `required: false`, but they are on screen in P5 seconds after
the handover and on Slow 4G would need ~5.5 s from a handover start — so the scheduling point has
to come from a measured reveal deadline, not from reusing the city's answer.

---

## 34. The services district is driven by a projected display, not by its buildings

**Decided** 2026-08-31, porting the design from `prototypes/vertigo-lab`
(`src/experiments/services-buildings/`). The plans it was built against are copied to
`docs/plans/010-services-district/`; plan 003 is the current one and the code cites it by section.

**This replaces §32 outright.** Buildings as click targets, the floating DOM card, per-building
framing and the swap-keeps-the-distance flight are all gone. It is not additive and there are no
compatibility paths: §32 describes what the district was between 2026-08-27 and 2026-08-31.

**One surface owns the interaction.** A tilted 48×48 plane hangs 28 units above the plaza, backed
by a thin extruded plate, lit by beams from the three `foco` nodes, and carrying every control the
district has: previous, next, SABER MÁS, VOLVER. It is drawn by a `ShaderMaterial` whose copy comes
from a `CanvasTexture`, and it follows the camera in **yaw only**, clamped to ±42° around the
approach heading — never a billboard, because the lean is part of the object.

**The buildings became scenery that reacts.** A tap on any of them means "enter", carries no service
meaning, and lights the whole cluster on hover because the cluster is one entry target. Once open,
the active building takes the emissive highlight and its connection wedge runs the active accent
inward to the ring — which is the building→display signal plan 003 §7 asks for, built out of
geometry that was already there rather than a new effect.

**`districtState.ts` is the single source of truth**, and it holds three fields:
`activeServiceIndex`, `detailOpen`, `districtActive`. Everything else derives. There is deliberately
no second "selected building": two fields describing one fact are two fields that can disagree.
One subscription in `createServicesDistrict.ts` pushes each snapshot to the interaction, the flow,
the display and the announcement, in that fixed order — four independent subscribers would race.

**Two hit tests, never both.** Closed, the raycast is the sites' meshes and their layer-1 proxies.
Open, it is `intersectObject(panel, false)` and nothing else, with the UV mapped through
`uCoreInset` into the same rects `displayConfig.ts` gives the shader. Non-recursive is load-bearing:
the plate is a child, and `ExtrudeGeometry` gives its rim walls a meaningless `uv`.

**The camera settles once.** Entering flies to the plaza at the district's `focusDistanceScale`;
paging does not move it, because the UI has not moved. Leaving returns the distance to rest and
leaves focus and yaw where the visitor put them, exactly as §20 had it.

**Reading claims its gesture through the external-control handover.** `DragPanController` listens
on the same canvas and registered first, so at the target node it runs first whatever the capture
flag says — `stopPropagation` cannot work here. `beginExternalControl()` releases its pointers and
stops it writing the rig; the release hands it back with `adoptRigState`. The wheel is claimed only
over the reading area and only while reading, which is safe beside `createNavigationInput` —
the app's single wheel owner — because that already stands down while a district is engaged.

**Copy is split, not re-authored.** `Service` stays `{ id, title, body }` (§28, §31). Measured
2026-08-31, every published body is one paragraph of 265–355 characters, so
`district/serviceCopy.ts` takes the leading sentences up to 150 characters as the summary and the
whole body as the detail — a paragraph break wins where an editor wrote one. Accents are scene
composition and live in `cityDistrictBindings.ts` beside the node names.

**The DOM that went is replaced by a keyboard surface, not by nothing.** `districtPanel.ts` and
`districtLabel.ts` are deleted. A shader cannot be tabbed to or read aloud, so
`district/ui/districtA11y.ts` carries the same five transitions as clipped `.nav-control`-pattern
buttons plus a polite live region. It is a second way to reach one navigation model, never a second
model (plan 003 §20).

**Panning stays available while the display is open.** Decided 2026-08-31, against the lab, which
set `enablePan = false` inside the district. `DragPanController` has no per-axis gate and
`beginExternalControl` is all-or-nothing, so freezing pan would freeze the rotation plan 003 §E
wants kept. The cost is that a deliberate drag can carry the display off-screen; Escape and the
keyboard VOLVER both recover, and the app's "you can always move the map" model (§20) wins over
adding a mode to the navigation module.

**Left open.** With the labels gone nothing at rest marks where the services are — the wayfinding
gap §32 already recorded, now more visible. `focusDistanceScale` and the display's elevation are a
tuning pair that arithmetic cannot settle and no automated check can see. `DistrictContent.summary`
and `intro` still have no reader.

---

## 35. Consent is asked once, as the intro's last stroke

**Decided** 2026-09-05, plan 018. The client requires a cookie banner and plans Google Analytics
after launch; the runtime inventory taken that day found the site setting no cookies, keeping no
storage, loading no third-party script and embedding nothing. So the banner is a **consent banner
for future analytics** — Aceptar / Rechazar, one `analytics` category that exists in code with
nothing behind it — and not an informational notice, which is what today's runtime alone would
justify. `src/app/consent.ts` is the whole mechanism: a versioned record in `localStorage`
(`vertigo:consent`), read tolerantly like `history.state`, shared by the same immediate-callback
signal `cursorSignal.ts` uses. Bumping `CONSENT_VERSION` asks everyone again. A vendor loader,
when one lands, gates on `hasConsent('analytics')` and nowhere else.

**A stored choice is the site's first persistent storage**, and it is the exempt kind: the record
of a consent needs no consent. Plan 012's ban on persisted onboarding state stands untouched.
`localStorage` over a cookie because no server reads it — a cookie would ride every `/api/*`
request for nobody, and would need an expiry.

**It mounts at `phase === 'site'`, inside each surface, twice.** §26.16 holds: no chrome before the
intro lands, and the arrival is what fires the entry animation once. It is NOT a sibling of
`.app__scene`: `.blog-root` is its own stacking context at z 90 and holds the blog's LegalPanel at
62, which the banner's own link opens — a banner above 90 would cover it. So App mounts one copy
inside the scene wrapper and the blog's TopBar another, `idPrefix="blog-consent"`, each under its
own LegalPanel, both closing on the one record. z 48: over the rail (45) and the floor line (42),
under everything that asks for attention (60, 62, 70, 80).

**Non-modal.** A `region`, no scrim, no focus trap, focus untouched on arrival, and it is in
neither `canNavigate` nor App's Escape handler: a scroll or a pinch has to keep working under it,
and Escape keeps its meaning. The cost is that the question can be ignored — which for a choice
that gates nothing yet is the right cost.

**Drawn like the mark, after it.** The client asked for it "at the start, with the drawing".
Inside P0 was refused for four reasons: `src/intro-draw/` imports nothing by build assertion,
`boot.spec.ts` guards the luminance of every intro frame, §26.16, and nobody can read a consent
text while the screen is a drawing. What ships is the handover's last beat: a dot on the floor
line the © shares, a leader rising from it, the plate's outline **stroke-drawn** by dash offset
(the intro's own technique, `pathLength="1"`, local to the component), the glass filling behind
the nearly closed outline, the emitter hairline igniting and breathing, the copy on the
120/200/320 stagger. Two ghost buttons of equal weight (§30: the blue is the CTA's). The long
text is the third `legalDoc`, `cookies` — a code change, as `legalDocs.collection.ts` says any
addition must be, plus a fixed `legal-cookies` singleton in the Studio and the document imported
into `development` BEFORE the code required it.

**The e2e suite is seeded.** `playwright.config.ts` stores a choice in every context so no
first-load banner sits under a coordinate click, in a baseline or over the blog building;
`consent.spec.ts` is the one spec that clears it.

**Broken when:** a vendor script loads without `hasConsent('analytics')`; the banner blocks a
warp or swallows Escape; it appears before `site`; a copy mounts outside `.app__scene` or
`.blog-root`; the policy text stops saying how to withdraw before a control exists.

---

## 36. The Vertigo building is the client's, and it moves

**Decided** 2026-09-05, plan 019. Four things landed together; each is its own decision.

**The logo on the tower turns, from Murcia's one frame loop.** The isotype standing on the
tower's cap is two curve meshes — `BézierCurve` and `BézierCurve.001`, the same two the header's
mark is built from — and `createTowerLogo` turns both about their local +Y at
`VERTIGO_BUILDING.logo.angularSpeedRadPerSec` (0.35, a turn every ~18 s), angle = speed × delta,
composed onto the authored orientation so position, scale and any future tilt survive. No
`requestAnimationFrame` of its own — `MurciaExperience.update` ticks it beside the water — and
the test reads the module's source to say so. Reduced motion is ONE read for the whole city now
(`MurciaExperience.reducedMotion`), shared by the districts' flights and the logo. Missing nodes
warn and the city loads; `check:asset:contract` §5d fails the export, and asserts the identity
transform too. The two names are Blender's defaults and the contract says so, with the names a
re-export should give them (`docs/murcia/blender-export-contract.md` §6.8).

**The screen on the tower is editorial, and its image is mirrored.** `siteSettings` gained a
switch (`bannerEnabled`, absent = on) and an image (`bannerImage`), emitted as
`buildingBanner: { enabled, image? }`. The image goes through `withMediaMirror` like the brand
marks — a WebGL texture may not come from a third party — with its own rule (PNG/WebP, ≥1024×512,
1.6–2.1:1, because the band's faces are ~1.84:1 and the picture is stretched onto them), written
twice on purpose: `siteSettings.collection.ts` fails the build, `sanity-studio/schemas/lib/bannerImage.ts`
tells the editor. Image only; the video variant is documented beside the renderer and has no field
until it has a consumer. Rendering is three separate steps — `resolveBannerSource` (the upload, or
the city's placeholder `vertigo-banner-placeholder.png` through the same path) → `attachBanner`
(an unlit, untone-mapped `MeshBasicMaterial`, sRGB, glTF flip, replacing but never disposing the
city's shared material) — and the band's UVs are generated from its geometry, because the export's
are a top-down projection that collapses every side face onto one edge of the UV square. That
turned the contract from "unwrap it like this" into "keep it an axis-aligned box, normals out".
Awaited inside `loadAndSetup` so `warm()` compiles the material; `murcia:model` is not a required
boot step, so the boot never waits on it.

**The 3D mark is brand white by material, and the bake is gone.** `vertigo-isotipo-3d.glb` carries
no UV set, so `logoBake.ktx2` could not be sampled by it — the visual comparison was settled by the
container. `applyBrandWhite` gives every mesh a `MeshBasicMaterial` at 1.0 with `toneMapped:
false` (both renderers run ACES, which would ship 0.8 grey); the three lights and the KTX2 acquire
left `createCornerLogo` / `loadLogoAssets` with them; the file is deleted. KTX2 stays in the
project for the satellite bake.

**The blog's bar is black, and that is one selector.** `.site-header[data-layout='blog']` sets the
ground and the ink; the blog's own controls in it inherit rather than carrying a colour each, the
SVG mark follows `currentColor`, the 3D mark is white by material, and BlogRoute passes
`tone="dark"` because that is now true of the ground. The scene-only scrim rule keeps its
`data-layout` scoping for the reason it always had — it is about the sky, not the tone.

Broken when: a second frame loop appears for the logo, the banner texture is fetched from
`cdn.sanity.io`, a banner field is added to the CMS without a consumer, the mark regains a lit
material or a bake, or a second colour appears on the blog's bar.

## 37. The overlay UI is one smoked-glass material in three densities, and blue is spent once

**Decided** 2026-09-06, plan 020, drawn on a design canvas before a line of CSS changed
(`design/smoked-glass/`, 11 artboards over real captures of the Earth and Murcia scenes). The
canvas was the specification and was approved as one; what follows is what it settled.

**One material, three densities, and the bigger the surface the quieter the glass.** A dark
translucent graphite body, moderate blur, a cool border barely there, a thin film of reflected
light at the top, and a deep neutral shadow that separates the panel from the scene. Density A
(`--glass-bg-light`, 0.68) is the floating tray: the hint frame, the beacon plates, the consent
plate — separation by shadow rather than by opacity. Density B (`--glass-bg`, 0.78) is the
compact plaque, which is the case panel. Density C (`--glass-bg-heavy`, 0.86) is the heavy
panel: contact, the legal sheets, the audit curtain. It is deliberately NOT frosted glass and
not a HUD; the material should only become noticeable when compared against a plain dark
rectangle. Where `backdrop-filter` is unsupported the three densities go near-opaque and keep
their hierarchy, in one `@supports` block.

**The tokens live in `siteHeader.css`, because that is the only sheet every document loads.**
`styles.css` never reaches the blog, and this file already owned the app's one `:root` (the
header geometry). Extending it was the smallest change that reaches Earth, Murcia and the blog
alike. The blog inherits the dark-material tokens and must never consume them: its surface is
paper, and it reads `--header-control` and nothing else. This is a token layer, not a design
system — about two dozen names, each with a consumer.

**Blue is scarce so that it means something.** It had been on accent lines, buttons,
scrollbars, select arrows, focus states, eyebrow ticks, leaders, dots and six copies of an
emitter hairline. It now has four homes and no others: the filled primary CTA, the soft ring
behind a focused field's *neutral* border, the beacon dot that marks a pressable place in the
world, and the keyboard focus outline, which is unchanged because accessibility is not a
styling question. The CTA lost its 110° gradient and its outer glow for a flat face, an inset
top highlight and a neutral drop shadow — pressed sits *down* rather than shrinking.

> **Amended 2026-09-06, the same day.** The floating trays wear a blue edge: the hint frame,
> the beacon plates and the desktop consent plate take `--glass-border-accent` instead of the
> neutral `--glass-border`. That is a fifth home, and it is deliberate — the client asked for
> it after seeing the neutral edge in the scene. It costs less than it looks like it costs,
> because the token is an alias of `--accent-border`, the CTA's own edge: the hint tray and the
> Auditoría button are then the same blue rather than two that nearly match, and there is still
> exactly one blue value to change. Density B and C keep the neutral edge, so the trays now read
> as their own family rather than as small versions of the panels. The phone consent sheet is
> unaffected: it has no border to colour, being a sheet against the frame's bottom edge.

**The blue emitter hairline is gone from every surface, and with it the reason to duplicate
it.** It was byte-identical in six sheets, and `styles.css` documented why it could not be
shared: `murcia.css` rides the scene chunk and Earth shows the hint frame before that chunk has
loaded. The constraint was real and is now moot. Where the line was doing work it stayed and
went neutral — the contact and audit delivered states still draw a rule from the centre,
because the *drawing* is what says something arrived; where it was decoration it went.

> **This amends §26.22 and the 2026-09-04 phone-menu amendment above.** The phone menu's field
> is still glass wiping down from the header over the live scene, and it still has no edge —
> but the line it ignites under is a neutral white hairline now, not the audit curtain's blue
> emitter, because the audit curtain no longer has one.

**Fields are not glass.** The container is the material; the inputs are matte surfaces inset
into it — darker, thin neutral border, a shallow inner shadow, and no `backdrop-filter` of
their own. Nested glass reads as two effects arguing and costs a second blurred layer for
nothing. One blurred surface per panel is the performance rule this redesign holds to: no
animated `backdrop-filter`, no stacked blurs, no filter chains, no new JavaScript, no
dependency.

**Uppercase is for eyebrows and micro-labels only.** Instruction sentences and submit buttons
went to sentence case ("Enviar", "Continuar", "Haz scroll para bajar a Murcia"). The header's
own triggers stayed uppercase with their tracking: they are nav micro-labels, and the canvas
draws them that way on every artboard. No copy changed — this was `text-transform` and
letter-spacing.

Broken when: a colour literal appears in a panel sheet instead of a token, a second sheet
declares `:root`, blue turns up outside the homes listed above, a field grows a `backdrop-filter`,
a panel's material stops being one of the three densities, or `blog.css` starts reading a
`--glass-*` value.

## 38. Pan and yaw feel are split by pointer type, because a finger runs out of glass

> Amends **§21** (the pan gain) and **§20** (Murcia navigates like a map). Neither is
> reversed: both described one gesture with one sensitivity, and there are now two of each.
> Note also that §21's heading says "the pan gain is 0.7" and the shipped mouse value is
> 0.4 — recorded here rather than edited, since the heading is the decision as taken.

**Decided 2026-09-06,** on a report that Murcia panned and rotated fine on a desktop and cost
far too much interaction on a phone. `touchTranslationGain: 1` against the mouse's `0.4`, and
`rotation.touchDegreesPerViewportWidth: 175` against the mouse's `110`.

**The obvious explanation is false, and that is the useful part of this entry.** The
reflex is that a phone shows less ground, so a pixel of drag buys less world. Ground per CSS
pixel at this pose works out to `2*tan(fov/2)/h` — **a function of viewport pixel height
alone**, in both screen axes, because the frustum widening with aspect is exactly cancelled
by there being more pixels to spread it over. Driven through the real pose maths: 0.2241
units/px on a 390x844 phone against 0.1751 on a 1920x1080 desktop. The phone pixel is worth
*more*. Anyone who reaches for the frustum, portrait aspect, or `cameraPortraitOverrides` to
explain a mobile feel complaint is looking in the wrong place.

**What is actually different is stroke length.** A mouse drag is unbounded by the window —
pointer capture keeps events coming past the edge — and unbounded by the desk, because OS
acceleration divorces hand travel from pixel travel. A finger stops at the glass at ~250px,
and every re-anchor costs a lift and a fresh `touchDragThresholdPx`. At gain 0.4 that is 22.4
units per stroke against the desktop's 70, so crossing the 352-unit plate cost ~16 strokes on
a phone and ~5 on a desktop. Rotation is the same shape one level worse: two fingers carry a
centroid ~140px of a 390px width, so a quarter turn cost 2.4 sweeps where the shipped comment
priced it at 1.5.

**And rotation's cost was not only slowness.** Every extra sweep re-arms the ADR 015 pinch
arbitration. The controller does not wait for the classifier, but `claimPinch` can take a
sweep away mid-gesture with a synthetic `pointercancel`, and the decision latches per finger
pair — so five short sweeps run that race five times where one long sweep runs it once. Fewer,
longer sweeps is the fix for both halves of the complaint.

**Pointer type, not viewport aspect,** and the numbers above are the argument: units/px does
not depend on aspect, so aspect is not the mechanism. The mechanism is whether a stroke can be
arbitrarily long, which is a property of the input device. Aspect also changes *under* a
gesture — a device rotates, a window is dragged wider — and `rect` is re-read every move, so
keying sensitivity to it would retune mid-drag; `dragThresholdFor` already records why pointer
type cannot do that. A tablet in landscape is touch and gets the boost, which is accepted
rather than overlooked: at 1180x820 a 400px sweep buys 36.9 units against a desktop's 70, so a
tablet is short too, just less so.

**Desktop is unchanged, and that was the constraint rather than a side effect.** The last time
touch made rotation feel expensive the fix went onto the number both inputs shared —
`260f4d8`, 2026-08-26, ADR 012, 60 -> 110 — and silently retuned the mouse. The pair exists so
that cannot happen a third time.

**`twoPointerThresholdPx` was deliberately not touched.** It is coupled by hand to
`NAVIGATION_PINCH.declineRivalPx`, unenforceably, because `experiences/` may not import
`app/`. The arbitration is decided in pixels; this change alters only what a pixel is worth in
degrees, so the coupling is undisturbed. If a settling grip nudges the city, the answer is to
lower `touchDegreesPerViewportWidth`, **not** to raise the dead zone — that would move
`declineRivalPx` with it and amend ADR 015.

**THE NUMBERS ARE NOT YET JUDGED.** Both are arithmetic, derived from thumb reach, and neither
has been driven on a device. `?touchDragGain=` and `?touchYawDeg=` exist so the judgement can
be made on a phone instead of through a rebuild; `?touchDragGain=0.4&touchYawDeg=110` is the
pre-split A/B. Ladders: 0.85 then 0.7 for the gain, 150 then 130 for the yaw. Gain 1 is a
ceiling rather than a rung — on touch the finger is on the thing it drags, so ground that
outruns it reads as broken, and `check:navigation` §13 asserts the bound.

**Ruled out.** One shared number retuned for mobile (retunes desktop, which is the fault being
corrected). Splitting on portrait aspect (splits on a variable that does not appear in the
maths, and changes desktop behaviour for a tall window). A nested `touch:` override block
(invites partial-merge semantics and puts each value far from the one it deviates from;
`dragThresholdPx`/`touchDragThresholdPx` had already answered the question). Lowering the
two-finger dead zone (moves `declineRivalPx` and re-opens ADR 015).

**How you would know it broke.** `check:navigation` §13 fails: the touch pan block measures
the mouse gain, which means the per-pointer selection was dropped — the negative control run
on 2026-09-06 confirmed that removing it fails exactly the three touch assertions and leaves
the 60 mouse ones green. Or the distinctness checks fail, which means a retune collapsed the
pair back into one number.

## 39. The camera never leaves the navigable area

> Amends **§20** ("Murcia navigates like a map"). The navigable area is no longer a property
> of the plate alone — it is a function of the pose, and it bounds the CAMERA and not only
> the focus. Also reverses the 2026-09-04 client direction recorded in `murciaConfig.ts`'s
> pose docblock, whose 18 degrees is replaced here by 35.

**Decided 2026-09-08,** on a report that opening the services district flew the camera
somewhere it should not be: it landed out on the empty filler ground and looked back in at
the display from there, with the horizon and the emptiness past the city plainly in frame.

**THE RULE, and it is the point of this entry rather than the fix that prompted it.** No pose
reachable by any means may put `camera.position` XZ outside the navigable rectangle. It binds
the drag, the yaw, the zoom band and every district flight, present and future. It is not a
tuning preference and it is not negotiable against a composition: a heading that frames a
district beautifully from off the plate is a heading that loses.

**One exception, and only one.** The **warp**. It departs to distance 470 at 66 degrees and
deliberately leaves the world behind; the rig stands down and Earth takes the camera (§9). The
rule holds for as long as Murcia owns the camera, which is every moment the viewer is
navigating.

**Why it is a rule and not a bug fix.** The eye sits `distance * cos(pitch)` behind the focus
on the ground — 271 units at the shipped 18 degrees and 285, on a plate 352 units across. The
camera was therefore off the authored city almost *everywhere*, not merely at the district,
and had been since the pose was lowered. Nothing would have caught it: `checks/footprint.ts`
§3 bounds the eye against the SKIRT, some 2170 x 1925 units of filler city, which an eye
standing on empty filler clears by a thousand units. Every future change to pitch, distance or
plate size moves this number, so what was needed was a gate and not an edit.

**The mechanism is one more intersection, not a solver.** The camera offset depends on yaw,
pitch and distance and never on the focus, so "the eye is inside R" is itself a rectangle in
focus space: R shifted by −offset. `computeStationLimitedBounds`
(`navigation/viewportFootprint.ts`) builds it and `NavigableArea.recompute` intersects it into
the effective area, alongside the footprint term it already had. The shift is **one-sided** —
the camera is on one side of the focus, not on all four — so the surviving width is
`width − offset` and not `width − 2·offset`. That is the whole reason the rule is affordable
on a 352-unit plate.

**Pitch is 35 degrees and it is a constant.** Client direction, and it fixes the other half of
the report: at 18 degrees the top of frame is 0.5 degrees below horizontal and the view reaches
past the horizon, so the visitor lands looking at emptiness. At 35 it is 17.5 degrees below and
reaches ~218 units. Pitch changes on the pinch out toward Earth (`zoomFarElevationDegrees`) and
in the warp, and NOWHERE else. The value may be re-judged later; that it is a single constant
may not.

**Distance 285 -> 220, and it was not a free choice.** 285 existed because 18 degrees was
shallow enough to read the whole plate. At 35 the frame covers ~139 units of ground depth and
the whole plate cannot be read at any distance, so that constraint retired with the pitch and
the number was re-chosen against navigation instead: eye offset 180, leaving ~172 units of pan.
At 285 it would have been ~119.

**The price, accepted knowingly.** Pan range falls from 352 units to ~172 in the worst
direction — the viewer can no longer bring the far corners of the city to the centre of the
frame. Anyone who wants it back buys it with pitch, with distance, or with a larger authored
plate — **never by weakening the clamp**.

**And it cost the services approach half a turn, which is the most instructive part.** The
intent was to keep `approachYawDegrees` at 45 and let the focus clamp, accepting a display that
sat higher in the frame. Measured, that is not what happens. The cluster is against the plate's
+X/+Z corner and 45 stands the camera +X/+Z of the focus, so the rule and the heading want the
eye in the same place: the clamp pinned it at (-94.4, 465.3), the corner itself, putting the
camera ON the plaza looking away from it, with three of the display's four controls projecting
off the canvas. 225 is the same composition read from the other side — the camera inside the
city looking out at the corner — and it lands with the focus not clamped at all and every
control framed. **A heading that only worked because the camera could leave the city is a
heading that stops working**, and no amount of tuning `PANEL_ELEVATION` would have found that.

**It forced `zoomNearScale` 0.45 -> 0.58, which is worth reading as a warning.** That number
is a SCALE, so a shorter rest distance multiplies straight into the compound closest approach:
`285 x 0.45 x 0.7 = 89.8` became `220 x 0.45 x 0.7 = 69.3`, against a 60-unit footprint
inversion floor and a `check:warp` §7 that demands a quarter of it in hand. 0.58 restores 89.3.
In absolute terms nothing about the product changed — closest approach 127.6 units against
128.25 — but the ratio fell from x2.22 to x1.72, and `adr/015` exists because a ratio that is
too small reads as a broken gesture. Judge it on a device.

**It also gave a safeguard back.** `disableFootprintInsets` was called at load whenever the
model carried ground past the plate, because at 18 degrees the horizon was in frame and a
frustum past the horizon has no finite footprint to inset by — insetting by a
`maxGroundDistance` clamp would drag the focus off the plate corners for a reach nobody
measured. At 35 no ray clamps at any reachable pose, so the footprint is a real measurement
again and the inset is back on, costing nothing: `check:footprint` §2 sweeps 508032 samples and
still finds the full plate navigable, with 818 units of skirt to spare. It is now asked **per
pose**, in `NavigableArea.recompute`, rather than guessed once at load — whether the footprint
has degenerated is a property of the pose, not of the model, so a future pitch that reopens the
horizon degrades safely instead of silently.

Superseded with it: "the services camera stands out on the skirt side and looks back in"
(`cityDistrictBindings.ts`, 2026-08-27) — it now stands inside the city and looks out.

**Ruled out.** Bounding the eye to the skirt and calling it done (that is the assertion that
already passed while the bug shipped). Clamping the eye after the fact rather than the focus
before it (the rig has one writer per frame and does not clamp — §9 — and a corrected eye is a
camera that no longer matches its own focus). Symmetrically shrinking the navigable rect by the
offset (collapses a 352-unit plate outright, and is simply the wrong geometry). Moving the
plaza off the plate corner in Blender, which is the real root cause and is a separate task.

Broken when: `computeStationLimitedBounds` is dropped from `NavigableArea.recompute`; it is put
behind `insetsDisabled`; `checks/footprint.ts` §4 is removed or its usable-area floor is
lowered to make a distance fit; the pitch is lowered far enough that `check:warp` §6 or
`check:footprint` §2 start reporting clamped rays again; or a new camera mover writes
`rig.setFocus` without passing its proposal through `clampToRect` against the effective bounds
first.

**Amended the same day by §40.** The rule and the mechanism survive verbatim; the rectangle they
guard grows from the authored plate to the plate plus the A2 ring, and the last stretch before it
is travelled against resistance rather than at full speed. Read the two together: everything above
about WHY the eye is bounded at all is still the reason, and §40 is only about where and how it
stops.

## 40. The edge is felt arriving, not hit

> Amends **§39** ("The camera never leaves the navigable area"). The rule is unchanged and the
> enforcement is unchanged. What changes is which rectangle it guards — the authored plate
> becomes the plate plus the `CITY_A2_SIMPLIFIED` ring that wraps it — and that the last stretch
> before that rectangle is travelled against rising resistance rather than at full speed.

**Decided 2026-09-08,** the same day as §39 and on a report about it: *"the boundaries are too
strict for the camera to not surpass them … it shouldn't feel like an invisible wall."* §39 is
enforced by `Math.min/Math.max` on the proposed focus, and a hard clamp is exactly what an
invisible wall is. The city pans at full speed and then stops dead under a finger that is still
moving, with no warning that the edge was coming.

**THE RULE, restated rather than replaced.** No pose reachable by any means may put
`camera.position` XZ outside the navigable rectangle. The navigable rectangle is now the plate
**plus the A2 ring**, and the outer part of it is a band the viewer must push into against a
gain that falls to zero. The warp remains the one exception, for the same reason.

**Why A2 and not simply "a bit further".** The reason §39 exists is a camera that stood on empty
filler ground and looked back at the city with the horizon in frame. Neither is reachable here,
and that is a property of the rectangle rather than of the tuning: `CITY_A2_SIMPLIFIED` is
*built city*, and the frame already reaches ~78 units past the focus, so A2 has been on screen
at the plate edge all along. This puts up to ~42 more units of it there. The ring was measured
out of the shipped GLB — X [-463.1, -56.4] Z [70.5, 489.8], margins **-X 24.9  +X 30.0  -Z 50.0
+Z 16.5** — and `checks/city-asset.ts` §7b asserts the file still covers it, because nothing at
runtime looks that mesh up by name and a re-export could otherwise leave the number describing
nothing.

**The mechanism is the same pipeline twice, not a solver.** `NavigableArea.recompute` already
derives the effective area by intersecting a footprint term and a station term into `configured`.
It now runs both terms a second time against `nav.extendedBounds`. Both are **re-derived** rather
than the result being grown by the ring margins: the station shift is a function of the rectangle
it shifts, so expanding the answer would be a different rectangle, and a wrong one.
`DragPanController.applyPan` swaps `clampToRect` for `resistToRect` between the two.

**The ramp, and why this shape.** Per axis, with `b` the band width on the edge being pressed and
`gap` the distance still available to the limit:

```
gap' = gap * exp(-travel / b)
```

1. **It cannot overshoot.** The result is written as `limit - gap'`, so the hard bound is
   arithmetic rather than an epsilon. Past ~35 band widths of *accumulated* travel the
   exponential underflows and the focus rests exactly on the limit — which is the safe bound, and
   by then the gain has been zero for a long time.
2. **It composes exactly.** `d1` then `d2` lands where `d1 + d2` lands, because multiplying the
   gap is associative. A per-event `delta * gain(overshoot)` does not have this, and where the
   city ended up would depend on how many `pointermove` events the browser coalesced.
3. **Gain is 1 at the firm edge**, so the band does not announce itself with a step in speed.

Resistance is **one-way**: leaving a band is 1:1. There is no snap-back — the focus stays where
it was pushed — so a symmetric ramp would make the first drag back out of a deep overshoot feel
stuck. Pushing out is heavy, coming back is light, and that is the intended asymmetry.

**What it cost, and what it bought.** Nothing was given up. Worst-case usable area goes from
**114 x 115 to 169 x 182 units** (`check:footprint` §4 and §5) — §39 gave up 56% of the
configured rectangle and roughly half of that comes back, as band rather than as free pan. The
eye reaches at most **42.0 units** past the plate, inside the ring on every side.

**Rejected: elastic overshoot with a snap-back.** The iOS model, and the obvious alternative. It
puts the eye genuinely outside the allowed area while the finger is down, which is the one thing
§39 exists to make impossible, and it buys a bounce nobody asked for. The user chose the
asymptotic stop directly.

**One degenerate case, handled by giving up rather than guessing.** When the eye offset outruns
the rectangle, `collapseIfInverted` pins BOTH terms to their midpoint — and the two midpoints are
the ring margins apart, so the limit would not contain the firm area and the ramp would resist in
the wrong direction. `NavigableArea` falls back to the firm rectangle there: no focus satisfies
the rule at such a pose, so the honest answer is no band rather than a rectangle invented between
two pinned points. `check:footprint` §5 proves the fallback never fires inside the reachable band.

**`?band=` is the knob, and it is a SCALE on the ring margins rather than a width.** 1 is the
ring, 0 restores §39's wall exactly, and no value it accepts can name a rectangle outside the
built city. `check:navigation` §7 measures the focus against the extended rectangle now, with a
second assertion that a sustained push actually reaches the band — without it the first would
still pass if the band silently stopped working.

**`check:footprint` §4 still measures usability on the FIRM rectangle**, deliberately. The band
must never become load-bearing for whether the city can be navigated: if a future pitch eats the
full-speed area, §4 has to fail even though the ring would hide it.

Broken when: `resistToRect` is replaced by `clampToRect` in `applyPan`; `setBounds` or the
inertia step is re-pointed at the firm rectangle (either drags a target that is legitimately in
the band back to the firm edge on every frame of a rotation, which is the band not existing);
`extendedBounds` stops containing `bounds`; `checks/city-asset.ts` §7b is removed or the GLB
stops carrying `CITY_A2_SIMPLIFIED`; `checks/footprint.ts` §4's usable-area floor is moved onto
the extended rectangle; or a district flight is re-pointed at the extended bounds — flights clamp
to the firm area on purpose, a composed shot having no business landing in the molasses.

## 41. The Earth's hint is drawn in the scene, out of particles

> **REVERSED 2026-09-09 by §43.** The particle figure is gone and the hint is DOM text. Kept
> because it is the record of how the figure was tuned and why it was rejected — and because
> everything below about WHEN the hint appears, and the placement arithmetic that answers to
> `.site-footer`, is still in force and still describes shipped code.

> Amends **§39 (2026-09-05, the hint frame)** for the Earth scene only. Murcia's plate, its
> four cells and every rule about WHEN a hint appears are untouched.

**Decided 2026-09-08,** on client direction: no HTML hint-tutorial on the Earth scene. The
glass chip read as browser chrome laid over a 3D scene rather than as part of it.

**What replaces it.** Two chevrons over one sentence, drawn as ~770 points that gather out of
the star field over 2 s, float while the viewer looks, and scatter outward the moment they move.
`experiences/earth/hint/`. The chevrons are the SAME path data the Murcia chip draws
(`NavigationControl.tsx`), not a redrawn pair — the client dropped the mouse outline precisely
so one glyph serves a cursor and a thumb, and a second drawing would drift from the first.

**THE NUMBER THAT GOVERNS THE FIGURE, and it is not the intuitive one.** Legibility is decided
by dot SPACING against dot SIZE, never by dots per letter. A sentence's ink skeleton is about
`1.7 x fontSize x letters` long, so a budget buys that length divided by it; dots ~3px across
need ~3px of spacing to read as dots, and closer than that they touch and the sentence renders
as solid strokes — glowing text, which is not what was asked for. At the shipped caption size:

| budget | spacing | reads as |
|---|---|---|
| 1400 points | 1.11 px | merged strokes |
| 800 points | 2.09 px | tight |
| 600 points | 2.96 px | separate dots |

That table is the arithmetic and NOT the answer, which is the correction worth carrying: it
holds the dot size fixed at ~3 px, and the dot size turned out to be the free variable. See
the revision below.

A bigger budget is not wrong, it is a bigger FIGURE — 1400 points at 3px spacing needs the
sentence ~1380px wide, a headline across the viewport. That was offered and declined. **The
client's opening instinct of ~500 was right, and the 1400 figure this project first proposed
was arrived at through the wrong measure.**

**FILL, not stroke.** Sampling `strokeText` looks like the obvious way to get a skeleton and
is not: it outlines BOTH sides of every stem, so each stroke becomes two dotted lines a stem
apart and every counter grows a second ring inside it. Filling and letting the sampler derive
its cell size from the ink gives the skeleton for free — the cell lands near the stem width,
so a one-stem cross-section keeps one point and a shoulder keeps two or three.

**The sampler is a grid, not a stride, and the difference is measurable.** Taking every k-th
pixel of a row-major ink list samples proportionally to AREA, and a letter is not an even
stroke. Measured on a mask with a 10px stem beside a 1px hairline: the stride gives the
hairline **0 of 120 points** — it disappears. `sampleInk.ts` buckets ink into cells and takes
one point per cell in a golden-ratio order, which is a cheap blue-noise approximation with no
randomness. Nothing calls `Math.random`; screenshot baselines depend on it.

**NORMAL blending, not additive, and this is the load-bearing material call.** Additive is
right for the hover cue (sparse moving lights on black) and wrong here: ~600 sprites at ~3px
spacing overlap along the stems — exactly the ink carrying the letterforms — and additively
that pushes the strokes past the 0.62 bloom knee and hazes the counters shut. Blended
normally, the brightest pixel the figure can make is `uColor`, which is what makes the bloom
question answerable with one number instead of a density argument. `rgb(200,200,200)` is
~0.58 linear, under the knee (§11.58).

**Locked to the camera, entirely in the vertex shader.** `modelViewMatrix` is never read; the
position is built in view space from the projection alone, so there is no parenting, no
follower group and no per-frame CPU work. Parenting to the camera would not have worked at
all — R3F does not add its default camera to the scene, and the renderer builds its draw list
by traversing the scene, so a child of the camera is silently never drawn.
`projectionMatrix[1][1]` IS `1/tan(fov/2)`, so the frustum half-height is read off the matrix
rather than pushed — Earth's fov is not constant, and a pushed value would be a frame stale.

**It owns no timing** — as first shipped. When the hint appeared and went was
`createNavigationInput`'s answer, 1.2 s after an arrival and gone 3 s after the first
interaction, reaching the scene as one `onHintVisible` edge. **Reversed by the revision
below:** the figure is offered on STILLNESS, which is a question that module cannot answer,
and the callback is gone.

**The Earth plate is hidden, not deleted.** `.nav[data-direction='down'] .nav-hint { display:
none }`. The FRAME, not the travel cell: on Earth `.nav-hint__controls` is held at `0fr`, so
the cell is the whole plate and hiding only it would leave an empty glass rectangle. Nothing
leaves the markup — Murcia needs every glyph, and `NavigationControl.test.tsx` asserts the
plate carries both directions' vocabulary because "the CSS can only choose between what was
rendered".

**Accessibility is unchanged, and nothing was added.** `.nav-hint` has always been
`aria-hidden="true"`; the accessible route is `.nav-control`, a real visually-hidden button
labelled "Ir a Murcia" that unclips on `:focus-visible`, and it is untouched. An sr-only line
beside a button that already says the same thing would be duplicate announcement.

**Two sentences, one word apart.** `Scroll para viajar a Murcia` on a fine pointer,
`Zoom para viajar a Murcia` on a coarse one. Not cosmetic: `createNavigationInput` returns early below two
contacts, so a one-finger swipe does not navigate at all and telling a phone to scroll would
teach a gesture that does nothing. "Zoom" is the word the chip already used there.

**Ruled out.** Elastic/iOS-style behaviour was never in question here, but a snap-back exit
was: the figure scatters outward instead, because gathering slowly from a wide field and
leaving quickly outward are not each other's reverse, and running the exit backwards through
the arrival reads as a rewind. Inter as the rasterization face — see the trap below.

Broken when: the material is switched to additive or the colour taken over the 0.62 knee;
`sampleInk` is replaced by a stride; `modelViewMatrix` appears in the vertex shader;
`HintLayer` is mounted conditionally or behind `Suspense`, which would take its shader out of
the scene-level warm-up; or the plate's `display: none` is turned into a removal from the JSX.

### Revised the same day, over five rounds of review

The rule and the mechanism above hold. Five things inside them moved, and each was a broken
assumption rather than a preference.

**Size and budget are one number, not two.** Type 35 -> 26. The count had to move with it —
skeleton length scales with type size, so holding the old count at the smaller size closes the
spacing and fills the letters in.

**The position was anchored to the viewport CENTRE, which is not a position.** The gap to the
bottom edge was a function of viewport height — 68 px at 1440x900, 301 px on a tall tablet,
and **-187 px in phone landscape**, off the screen entirely. Anchored to the bottom edge now,
plus `env(safe-area-inset-bottom)` through a probe element, and against the figure's own ink
bounding box rather than its canvas, which carries descender headroom the sentence may not
use. `bottomPx` is a floor set by `.site-footer`, not a preference: below it the sentence runs
through the copyright mark on a phone, which `styles.css` had already recorded for the chip.

**Readability was the dot SHAPE before it was the count.** The figure borrowed
`POINT_SPRITE_FALLOFF`, which squares a smoothstep across the whole radius — correct for a
star, wrong for ink: at half its radius a dot was already at 0.25 alpha. A local falloff,
solid to `dotCore` then a short shoulder, is worth **3.5x the ink per dot** at the same
diameter and the same count. The shared file is untouched; a letterform is not a star.

**Dot size is the free variable the table above holds fixed.** 700 points at 1.8 px, not 600
at 3.1: more points at the SAME dot size is a denser blob, which is the failure the second
round reported. The two moves pull opposite ways on spacing and only work together.

**The float is rigid.** Per-particle drift was built first; it shimmers rather than floats and
moves the dots relative to each other, softening the baseline. Rigid motion cannot blur a
letterform, so the amplitude went from under half the dot spacing to 5 px. It is reserved in
the bottom gap — otherwise the down half of the swing re-enters the footer band, which is the
collision the anchor exists to prevent arriving through the side door.

**And it is an IDLE affordance.** Offered after two seconds of stillness and gone as soon as
the viewer ACTS, rather than a beat after every arrival. That is not a question
`createNavigationInput` can answer — it fires once per arrival and never again — so
`onHintVisible` was removed and that module is what it was. What crosses now is permission
only (`state.hintAllowed`), with the shared refusals hoisted into one value so the rail's list
and the hint's cannot drift. Murcia's chip keeps the arrival rule; the two hints no longer
share a trigger because they no longer share a question.

**Moving the mouse is not acting.** Stillness is counted against `pointerdown`, `wheel`,
`keydown` and `touchstart` — a press that starts a drag to a satellite or a button, a scroll,
a key. `pointermove` was on that list as first shipped and made the figure too reactive to be
read: it scattered on the smallest twitch, which is exactly what a hand does while its owner
is reading. A hovering pointer is a viewer who has not chosen yet, so the offer stands until
they commit.

**With one hover that does count: a satellite.** That is the one hover the scene ANSWERS —
the badge bumps, the cursor turns — so a pointer resting there has found its target and the
figure pointing at one is in the way. It is not an event, so it is not on the list above:
`createSatelliteFocus` exposes the pick it already runs every frame as `hovering`,
InteractionLayer publishes it on `satelliteHoverRef`, and the hint holds the idle count at
zero for as long as it is true. A ref rather than a callback because the reader is already in
the frame loop, and because a ref cannot keep reporting a hover the scene has left — the
write happens ahead of every early return in that loop, and `setEnabled(false)` has cleared
the hover by then. The lag is one frame against a two-second rule.

Also broken when: `onHintVisible` is reintroduced to couple the two hints again; the idle
threshold is folded into `createNavigationInput`; `pointermove` returns to the poke list;
`satelliteHoverRef` is written after an early return in InteractionLayer's frame; or the
float's amplitude stops being reserved in the bottom gap.

## 42. The blog is entered through a display, and the approach is the transition

**Decided 2026-09-09, plan 022,** porting `vertigo-lab`'s `blog-transition` experiment
(`src/experiments/blog-transition/`, six commits on `feat/blog-transition`). Roughly 1,900 of its
4,765 lines crossed; the lab harness, its sandbox stage and its own copy of the blog page did not.

**A shader-drawn display floats above the `blog_edificios` cluster, and clicking it is the way into
the blog.** Over three seconds the camera comes off the rig and moves onto the panel's own normal
until the readable core fills the frame, at which point the route changes behind a full-screen
cover wearing the same image the panel is wearing. Leaving runs it backwards.

**This replaces the cluster tap outright, and the tap is deleted rather than kept beside it.**
`interaction/BlogBuilding.ts` and its test are gone. Two ways into the blog over one part of the
scene — one instant, one with a three-second flight — is not two affordances; it is a coin toss
decided by which mesh a ray reaches first, and the nearer mesh is the cluster. That file's docblock
said "it is not a district, and it must not become one", and this is still not one: no
`DistrictState`, no service meaning, no panel of controls, and the buildings underneath carry no
interaction at all. What it has that the tap did not is a camera flight.

**The lab's document swap is not this app's mechanism, and about a third of the experiment went
with it.** Over there the approach ended in `location.assign('/blog')`, and a `sessionStorage`
token with a TTL, an inline classic script in `index.html`, a `pageshow`/`persisted` bfcache reload
and a deliberately leaked cover all existed to survive it. Here `App` changes a route in the same
document (`adr/013`): the scene is hidden and frozen but never unmounted, so the rig still holds the
departure pose and the return is a flight from where the camera was parked. None of that machinery
was ported, and none of its failure modes came with it.

**What the same-document path introduced instead is that THE FRAME LOOP STOPS.** `frameloop="never"`
means `MurciaExperience.update()` is not called at all while the blog is open, so anything that must
still happen in that window cannot be driven from a frame. Three consequences, each handled where it
arises: the cover's last-resort dismissal is a DOM timer inside `handoffImage` (a dismissal in
`update()` would be unreachable in exactly the situation it was written for); a resize is QUEUED
rather than applied, because rebuilding the panel there would allocate a geometry and a texture
inside the window `e2e/blog.spec.ts` pins counts across; and the return is started from a
`useLayoutEffect` in `App`, before paint, so the cover is up in the same commit that unhides a canvas
still holding the last frame it drew.

**The return fires on every warm route back to the scene, not on the blog's control.** It is keyed on
`blogOpen` falling, because the browser's Back button and a step back through an article arrive as
the same state change and never touch `handleExitBlog`. Hooking the control alone would leave Back
landing the visitor nose-against the display it flew them into. Cold documents never reach it.

**The panel wears a screenshot of the real built `/blog`, or a neutral plate — never a stale copy.**
`scripts/blog-preview.mjs` photographs the built page at three viewport shapes after `vite build`,
into a `dist/` that was emptied first, so a capture cannot outlive the pages it photographed. Every
failure path exits 0: a broken capture degrades the panel, it never fails a deploy. What it degrades
to is DELIBERATELY not a picture of the blog — paper, a header bar, nothing else — because a
fallback that imitated the blog would be a second copy going stale silently, and one that carries no
content cannot be out of date. The lab's third route, an exact SVG raster built from the same
strings its `/blog` injected, is not available here and must not be recreated: this blog is
`src/blog/BlogRoute.tsx`, and `checks/architecture.ts` forbids `src/experiences/` from importing it.

**Production wore the plate until 2026-09-14, because Vercel never had a browser.** The build log
said `Executable doesn't exist at /vercel/.cache/ms-playwright/chromium-1234/…` and the script,
per its contract, warned and wrote nothing. It now installs the locked Playwright's Chromium on
Vercel only (`VERCEL=1`), shell-free, under its own 180 s deadline, and retries the launch once. A
browser on a build machine that holds every secret is CONFINED rather than trusted:

- **Static files only.** `vite preview` is gone from the capture: it evaluated `vite.config.ts`
  and mounted `apiRouting`, which answers `/api/*` with the real form handler and `process.env`.
  An in-process `node:http` server on `127.0.0.1:4320` serves `dist/` — GET and HEAD, no `/api`,
  real paths inside `dist/`, a fixed MIME map, `/blog` resolved as `blogRouting` resolves it.
- **Routed before any page exists.** Other origins are aborted; this origin gets GET/HEAD and
  never `/api`; local assets are fetched with `maxRedirects: 0`, so no redirect is ever followed;
  page WebSockets are closed unconnected; popups are closed. Service-worker registration is
  stubbed out by `serviceWorkers: 'block'` — in the locked 1.62.1 an init script replacing
  `register` with a no-op, so the call RESOLVES and nothing registers — and the server refuses a
  `Service-Worker: script` request as a second layer. Any of these discards the capture, as does a
  nonzero refusal count on the server.
- **Bounded and cancellable.** A 120 s capture deadline that closes the browser and the server
  rather than waiting on them; a launch that lands after it is closed; promotion is synchronous
  after a final check, so a cancelled run never publishes; cleanup itself is bounded.
- **Allowlisted environments.** Chromium and the installer see a handful of variables, not the
  build's secrets.
- **The sandbox is on everywhere except Vercel.** `chromiumSandbox: true` — Playwright's default is
  off — was the first shipped choice, with no fallback. Vercel's build container cannot run it (no
  setuid helper, no user namespaces): the first build with the libraries in place died on
  "Chromium sandboxing failed!". **Decided 2026-09-14:** the capture runs with
  `chromiumSandbox: false` when `VERCEL=1`, as an explicit per-environment setting rather than a
  retry after a failed launch, so the browser is loosened only where a person said so. *Accepted
  residual risk, stated plainly:* the sandbox is the kernel-level isolation of Chromium's renderer
  processes, and nothing else in this design replaces it — the request routing, the static server
  and the environment filtering bound what the browser can reach, not what a compromised renderer
  could do to the build machine. It is proportionate because the only page this browser ever
  renders is the blog this build just produced: its CMS content is constrained Portable Text
  (`strong`/`em`, links through `safeHref`) converted to typed blocks at build time and rendered
  as text — no `dangerouslySetInnerHTML` in `src/blog/`, embeds are link cards, not iframes — by a
  trusted editor. The alternatives (a separate capture service, a CI workflow, a hand-made image
  template) were rejected as maintenance the site does not want. **Maintenance obligation:**
  Playwright and its matching Chromium are updated during scheduled dependency maintenance; a
  published Chromium renderer/V8 vulnerability is a reason to update earlier, because this is the
  one place a Chromium runs without its sandbox.

**Vercel's image has the browser but not its libraries.** The next build got as far as starting
Chromium and died on `libnspr4.so`. The loader names only the first missing library, so all 21
that Playwright lists for Chromium (`nativeDeps.ts`) are installed at once, as their Amazon Linux
2023 packages, by `scripts/vercel-install.sh` — `installCommand` in `vercel.json` runs it, because
Vercel caps that string at 256 characters and the list alone is longer. That REPLACES the "keep
the default install" setting: the script ends in `exec npm install`, which is exactly Vercel's
default for a `package-lock.json`, and the `dnf` step before it is `|| echo`-guarded, so a failed package
install prints one line and the build carries on to the plate — never a failed deploy. The
packages come from the image's own, release-locked Amazon Linux repositories, into the build
container only; the functions and `dist/` never see them.

**What that does and does not guarantee.** Routing is DevTools-protocol interception, not a
firewall. Measured on 2026-09-14 against a second local server that counted every hit: HTTP(S)
requests from pages, popups and dedicated workers (blob and same-origin script), a same-origin
302 to elsewhere, an EventSource and a page WebSocket were all stopped and recorded, with zero
hits. **WebSockets opened inside a dedicated worker are the exception:** `routeWebSocket` does not
see them — with that layer alone one reached the external server — and with the full
configuration none did, but no layer recorded it, so worker WebSockets are NOT claimed. Nor are
DNS lookups, speculative preconnects, the browser's own background traffic, or the installer's
download; Vercel's build image offers no egress control, so zero egress from the browser process
is not claimed.

**It is the second exception to §39,** on the same footing as the warp and for the same reason. The
approach ends outside the navigable rectangle because it must: the seam requires the camera to land
exactly square-on at the solved fill distance, and a clamp would land it somewhere the panel does not
fill the frame. It is bounded — pointer input is off for the whole run, the flight ends by leaving
the scene, and the return ends inside the rectangle at a pose the rig already held.
`computeStationLimitedBounds` and `NavigableArea.recompute` are untouched, and weakening either to
accommodate this would be the wrong fix.

**One camera owner per frame (§9) is an `if/else`, not a last write.** While the approach owns the
camera the drag controller and the zoom do not run at all, and the districts go deaf for the
duration — their input is not otherwise gated on this flight, so a tap on a service building
mid-approach would start a `CameraFlight` beside it.

**The budget was raised, knowingly.** `INITIAL_JS_BUDGET_BYTES` 1,600,000 -> 1,610,000. Measured by
stubbing the feature out and rebuilding: 20,109 B, against 15,142 B of headroom. `vite.config.ts`
carries the itemisation and the three alternatives that were measured and rejected.

**Left open, and one of them blocks.** The panel's **elevation** and its **resting yaw** are the pair
arithmetic cannot settle, exactly as §34 records for the services display — and at the shipped
elevation of 38 the display's centre does not project into the frame at Murcia's arrival pose, which
was measured in a preview build and not yet corrected. With the cluster tap gone and
`nav.openBlogIndex()` called from exactly one place, that means the blog has no way in until the
number comes down. The e2e was rewritten and NOT run.

**Amended 2026-09-09: the panel is half the size it shipped at.** `PANEL_HEIGHT` 48 → 24 and
`PANEL_ELEVATION` 38 → 19, on the client's reading that the display was massive next to Murcia's
buildings. Equal heights with the services display were never equal size — that panel is square,
this one wears a browser viewport, so at 48 and a 16:9 window it spanned 85 world units. The two
still match in tilt, follow and material; they no longer match in height, because matching there
is what made them look like different objects. The elevation came down with it because the
clearance that reads as floating is derived against the panel's own half-extent, and it is the
same pair §34 warns about — so the number above is superseded, not corrected, and the resting yaw
it is coupled to has not been re-judged.

Nothing else in the feature moved: the approach solves its fill distance from `coreHeight()`
every frame, so the camera simply flies half as far and the arrival pose is still exact, and the
pointer remaps by the core inset. What did NOT follow on its own were the plate's world-unit
terms — `SHELL_BLEED` 0.9 → 0.45 and `SHELL_THICKNESS` 0.6 → 0.3 — because a world-unit margin
and rim on a half-size plate read as twice as thick. The rim now sits ON its documented aliasing
floor rather than inside it, seen from a camera further out again: it is the one term here that
is a judgement by eye, with 0.4 as the deliberate non-proportional fallback.

---

## 43. Earth's hint is text again

> Reverses **§41 (2026-09-08, the particle figure)**. Murcia's plate is untouched and stays
> hidden on Earth by the same one-line rule.
>
> **Amended 2026-09-11 by §46:** the mark is no longer the two chevrons alone. Fine pointers
> get the plate's mouse back, coarse pointers a hand spreading on a phone. Everything else here
> — the sentence, the timing, the 16px type and its measured floor — stands.

**Decided 2026-09-09,** on client direction: the particles go. The hint is the same two chevrons
over the same sentence, drawn as plain white DOM text.

**The objection was never the text.** §41 read the September direction — "no HTML hint-tutorial
on the Earth scene" — as a ruling against HTML, and answered it by rebuilding the sentence out of
~770 points inside the canvas. What the client had actually rejected was the glass chip: a plate,
a border and a backdrop laid over a 3D scene. A bare sentence with none of those is not that
thing. Reading a material objection as an architectural one bought a shader, a sampler, a canvas
rasterizer and five rounds of tuning, and the second direction is what disambiguated it.

**What is identical, deliberately.** The icon is the same two chevron paths `NavigationControl`
draws — the same drawing, not a redraw that can drift. The sentence and both its pointer variants
are unchanged, and both are still rendered with the stylesheet picking between them. The 2 s
stillness rule, `state.hintAllowed` as the only thing that crosses from the app, and a satellite
hover counting as acting are all untouched.

**Revised the same day: smaller, on the brief that the concept is premium and elegant.** Type 26px
→ 16, and the two moves that came with it are not decoration — at 16px the original settings read
cramped rather than quiet.

- **Weight 600 → 500.** The 600 was bought for a reason that died with the particles: heavier
  stems held a wider dot spacing at 26px, where the ink had to survive being *sampled*. Solid
  glyphs do not need it.
- **Letter-spacing 0.055em.** Counters close as size falls, so small white type on a dark ground
  wants tracking that large type does not. `.nav-hint__label` reaches for the same tool harder
  (0.14em) because it is uppercase.
- **The mark had to come down with the text, and by more than proportionally.** Every size in
  `.earth-hint` is an em ratio, so the chevrons shrank from 44px to 27px on the type change alone
  — and that is exactly what exposed them. The figure's stroke was 1.6 units across an 8-unit box,
  a fifth of the mark's width, which reads as deliberate weight at 44px and as a 5.4px slab at 27
  over letter stems half that thick. **Weight is a ratio to what it sits beside, not a constant.**
  So the stroke is 1.0 and the mark 22px (1.375em), and the `viewBox` grew by the half-stroke
  spill on each side: it was the ink crop because the canvas bitmap was exactly that size and
  clipped the caps flat, which was right while the sentence was made of dots, but a thin round cap
  sliced square is just a blunt tip.

Measured on the shipped path at 1440×900: one line, 221px wide, clearing the footer by 7.1px at
the BOTTOM of the float. 390×844 gives 14px and 193px, phone landscape 16px and 220px, both on
screen and unwrapped — the viewport that was 187px off the bottom before the anchor was fixed.

**What changed, and why each one had to.**

- **Gather and scatter became a plain opacity fade,** 2.0 s in and 0.9 s out. Gathering was a
  particle idea; a fade is what the sentence can do. `hintPresence.ts` went with it — its
  `progress`/`exit` floats existed only to drive shader uniforms, and every behaviour its ten
  tests asserted is native to a CSS transition, including the interrupt case it carried a branch
  for. The one deliberate difference: under reduced motion it used to snap in already formed, and
  now it fades. That is the policy the plate already follows — kill the loops, keep the fades.
- **The colour is white at 85%,** not the figure's `rgb(200,200,200)`. That grey was never a
  design choice; it was the largest value that stays under `UnrealBloomPass`'s 0.62 linear knee,
  because text that blooms cannot be read. Bloom samples the WebGL frame, and DOM composites over
  it afterwards and is never sampled — so the constraint is simply void, and the white the client
  asked for became available for the first time. Taken to 85% on client direction the same day.

  **The alpha lives in `color`, and moving it to `opacity` breaks the hint.** That property is
  already the fade channel — 0 → 1 on `data-visible`, over 2.0 s in and 0.9 s out — so an
  `opacity: 0.85` on the element is simply overwritten the moment the hint is offered, and moving
  it into the keyframes instead would fight the float. Alpha in `color` composites *with* the
  fade: 0.85 once shown, still 0 when dismissed. It dims the chevrons too, because they are drawn
  with `currentColor` — deliberately, since a mark left at full white over an 85% sentence would
  read brighter than it did before the change.
- **The float is CSS and always running,** rather than gated on the visible flag, so a hint
  dismissed mid-swing fades from where it is instead of snapping 5 px on its way out.
- **`!active` now HIDES rather than freezes.** The figure could be left mid-flight because it
  lived in a scene that went away with it. A DOM node does not, and leaving the flag painted
  would strand the sentence over Murcia.

**Three workarounds died with it, and they are the tell.** The safe-area probe — a throwaway
`div` appended to the body to ask CSS a question the canvas could not — the `measureText` layout
that had to name `system-ui` explicitly because a canvas must be told what to measure, and the
single fit uniform that stood in for a re-layout. All three existed to give a figure inside a
canvas access to things a DOM box has for free. 1,090 lines across seven files went with them.

**The bottom expression is the part that was PAID FOR and is kept verbatim.** `.site-footer` owns
roughly the bottom 26 px; at a 12 px gap the sentence runs through "© 2026 Vértigo" on a 390 px
phone, and a nearly full-width centred sentence cannot miss a right-aligned mark horizontally. So
24 px is a floor, and the float's amplitude is reserved above it so the DOWN half of the swing
bottoms out at the floor rather than 5 px inside the footer. The safe-area term is additive
rather than the plate's `max(28px, inset + 20px)`, because the footer itself already sits at
`max(14px, inset)` and only an additive form still clears it on a device with a home indicator.

**One thing got better rather than smaller.** §41 promised an e2e and it was never written,
because canvas pixels are not addressable and an image baseline of `system-ui` copy is
platform-bound — `hintConfig.ts` and PROJECT_MEMORY §11.68 both recorded the claim as though it
had been. The hint is DOM now, so `navigation.spec.ts` asserts the round trip on the real idle
path AND measures the sentence against the footer at the bottom of its float, which is the
collision the whole placement exists to prevent and the one no unit test can see.

**Also broken when:** the `--hint-float` term is dropped from `bottom` (the sentence then rests
at 24 and dips to 19, into the footer); `.nav[data-direction='down'] .nav-hint { display: none }`
is removed in the belief that it un-hides "the" hint (it un-hides Murcia's plate on Earth, which
is the chrome this exists instead of); a `visible` prop is added to `EarthHint` (that boolean
flips on every `pointerdown`, and App's own note says a `useState` for it re-renders both
canvases and every overlay); `pointermove` returns to the poke list; or `HintLayer` stops
clearing `data-visible` when `active` goes false.

> **Amended 2026-09-15:** "Murcia keeps this plate" no longer holds — the client removed it, and
> `.nav-hint` is deleted along with the `display: none` rule above (see §29's amendment). Earth's
> sentence is now the site's only gesture hint.

---

## 44. Murcia is navigated by one pointer carrying both axes, over a spring

**2026-09-10.** Ported from `prototypes/vertigo-lab`, experiment
`camera-navigation`. Replaces **§20** and its amendments **§21** and **§38**,
and retires **§39** and **§40** outright.

**The model.** One pointer drives yaw and travel SIMULTANEOUSLY: horizontal
movement turns the rig, vertical movement advances or retreats along the
resulting heading, and a diagonal does both. There is no gesture classification —
no `if (|dx| > |dy|)`, no forward vector captured at pointerdown. Yaw is applied
first and the heading is re-derived from the value that line just wrote, which is
what turns a diagonal drag into a curve rather than a straight line at an angle.

**The signs are a decision, and were reported wrong once.** Both gains are
positive: the world follows the finger. Drag down and the camera ADVANCES,
because the ground is being pulled toward the viewer; drag right and the camera
yaws LEFT, because the world slides right. The opposite reading — the camera
moves the way the finger moves — is self-consistent, shipped first in the
sandbox, and was called backwards on first use.

One honest caveat, on yaw only, asserted in `checks/navigation-feel.ts` §2 so
nobody re-derives it as a bug: this is an ORBIT about the navigation target, so a
point BEYOND the target follows the finger, a point AT it is stationary, and a
point NEARER sweeps the other way. "The point under the cursor stays under the
cursor" is true at the target distance and nowhere else.

**Damping became a spring.** The first-order `1 - exp(-k·dt)` lag is gone. Every
axis runs the closed-form solution of a damped harmonic oscillator, evaluated once
per damping group per frame: exactly frame-rate independent rather than
approximately, unconditionally stable at any dt and any ratio, allocation-free.
`dampingRatio` is 0.85 on rotation and travel, so the camera LANDS — it passes a
stopped target once by about 1.4 units and returns. The overshoot is the point;
`checks/navigation-feel.ts` §3 bounds it rather than forbidding it.

Zoom is hard-wired critically damped whatever the ratio says, because the clamp is
on the target and a spring that lands is a spring that passes its target — an
overshooting zoom would dip below `minRadius` and put the near plane through the
ground.

**The pitch rides the zoom's own coefficients**, so distance and elevation settle
as ONE motion. That coupling is why the zoom's ease had to move out of
`MurciaExperience` and into the rig: a single scalar lerp outside the rig could
not express it.

**The camera leans toward a hovering cursor** after two seconds of stillness, up
to 2.5° of yaw and 1° of pitch. An ornament, not a navigation: it is added at pose
time and never enters the targets, so the bounds clamp, a flight handover and a
snapshot all stay clean. First-order rather than a spring, deliberately — a spring
would bounce when the mouse stops, which is exactly when the viewer is looking at
it. The idle clock lives in the rig because the input layer has no frame tick, and
a mouse that stops moving would never reopen the gate.

**Two fingers mean one thing.** Two-finger rotation is gone, and with it every
mechanism that existed to tell a pinch from it: `pinchClassifier.ts`, its two test
files, `NAVIGATION_PINCH.declineRivalPx`, the anchored-thumb allowance of
`adr/015`, and the synthetic-`pointercancel` claim that used to pry the gesture
out of the drag controller. A pair now arms on the second contact and drives the
band from the first sample, with no dead zone to pay back. The fingers are still
taken from whatever was following them, once, at arm time — that is not an
arbitration, it is telling the experiences that the finger they were tracking is
now half of something else.

One threshold survives, and only one: `releaseGrowthPx`, the outward growth that
dismisses a focused display. Feeding the band needs no floor, because a pixel of
growth moves it by a pixel and the viewer can take it straight back; dismissing
what someone is reading cannot be undone.

**The travel doubled.** The band is 1200 px each way and the commit 600 px — the
whole journey 1800 px, about 15 wheel notches, with the 2:1 ratio preserved. The
band has to be long enough that the vacuum has somewhere to build before the
commit is even reachable.

**The vacuum.** Leaving Murcia now runs a screen-space pass: radial UV
magnification, a radial streak blur and a grey vignette, all hanging off one
radial term. Scrubbed from the viewer's OWN scroll before the commit — reversible,
and 0 until the approach passes 0.7 — then carried to full on the speed bell once
committed. The latch at the commit is load-bearing: `speed(0)` is exactly 0, so
reading the bell alone would snap the effect back to nothing on the first
committed frame, a visible flinch at the moment the viewer has succeeded.

Deliberately NOT a FOV widening, which would have been less code. FOV grows the
camera's ground footprint at no distance cost, which is precisely what
`checks/warp-transition.ts` and `checks/footprint.ts` exist to bound — the edge of
the world would arrive for ultrawide viewers with every distance limit still
satisfied. A screen-space pass cannot move the camera and so cannot show anything
the camera was not already seeing. Grey rather than black, because black is what
the flash uses and a black vignette would read as the cut arriving early.

Suppressed under `prefers-reduced-motion` by HOLDING AT ZERO rather than
resetting. The cursor lean is suppressed for the same reason: both are involuntary
motion applied to the viewer.

> **RETIRED 2026-09-17 — the next two paragraphs.** The zoom-driven steer, the approach lock
> and the held commit are gone; see "Earth swings above Spain AFTER the commit" below. They are
> kept because the defects they record are the ones a replacement must not reintroduce. (The
> threshold had also drifted: this text says 0.6, the code had said 0.35 since 2026-09-16, with
> an `earthGuideEnd` of 0.8 and an `approachLerpK` of 12 that were never written down here.)

**Earth gained a zone to dive at.** Past `earthGuideStart` (0.6) the same scroll
that zooms also turns the globe toward the destination, so a viewer who pushes all
the way arrives facing Spain.

The turn is written into the rig's ORBIT TARGET, before the rig runs, and the rig
eases it like a drag (amended 2026-09-10). As first ported it was applied to the
finished camera AFTER the rig, and that override knew nothing about the rig: it
re-aimed satellite close-ups at Spain, left the drag dead at full zoom (the free
orbit had no weight left in the blend), and swung the camera back on every zoom-out.
Now zooming IN turns the orbit a fraction of the way that is left, so any notches
from the threshold to the end of the band land exactly on the destination; zooming
out only zooms; a drag is never dead and never undone; a close-up owns the camera,
and closing it returns facing Spain as far as the zoom says. While engaged the orbit
follows the destination as the globe spins, in proportion to the turn applied, so a
viewer parked at full zoom stays on it. The radius is untouched, so the zoom stays
theirs the whole way through. The dive starts from the rig's own aim and swings onto
the destination on the bell (`destinationSteer.ts` and its test).

**The approach, and leaving only from above Spain** (2026-09-10, client direction). Past
the threshold the zoom is the only control: the orbit takes no drag (`setApproachLock`, a
flag of its own because the satellite focus owns `setOrbitEnabled`) and the satellites are
switched off, so the steer brings the view onto Spain with nothing able to take it off
that path. Zooming back below the threshold gives both back. And the transition waits for
the camera to actually be there: `NavigationContext.mayCommit` is false on Earth until the
eased camera is within `EARTH_DEPARTURE_ALIGN_DEGREES` (2°) of the destination, measured
at the Earth's centre. It HOLDS rather than refuses: a push that reaches the commit first
stays armed — the accumulator full, not decaying — and the transition starts by itself the
moment the camera arrives, so one pinch or one scroll always suffices. A refusal was built
first and made a phone's single pinch stop short (four e2e specs caught it). Zooming back
out lets go of a held commit. The lock
alone made departing from over Spain likely, and the gate makes it certain: the rig eases
each turn over about a second, and a fast trackpad fling could otherwise fill the band and
the push before the turn landed. The accessible control is not held — someone navigating
by keyboard has no zoom with which to line anything up.

**Earth leaves at the end of the zoom, with no push stage** (2026-09-10, client report: the
approach "froze in front of Spain until another input"). `adr/014`'s second stage — park at
the band's limit, then push against it — is kept for Murcia and dropped for Earth
(`NavigationContext.commitAtBandEnd`). Past the steer threshold the zoom is already an
approach, so arriving at its end is the whole request: every notch or pinch keeps moving
the camera, and the frame the zoom reaches its end, the transition fires. The
accidental-warp guarantee is the band itself — 1200 px, at least ten capped events. If the
camera is still gliding onto Spain when the band ends, the commit is held and goes by
itself as the glide lands.

**Earth swings above Spain AFTER the commit, and the viewer looks freely until then**
(2026-09-17, client direction). The band had two thresholds and so three zones — zoom and
orbit, zoom only, commit — and the middle one read as the controls being taken away for most
of the way in. It is gone: the orbit takes a drag and the satellites take a click at every
depth, and arriving at the end of the band commits from wherever the camera is
(`commitAtBandEnd`, unchanged).

What the zone was FOR has not gone anywhere: `applyWarp` dollies along the radius it finds the
camera on and never re-orbits, so a departure from the far side of the planet dives through
it. The steer guaranteed the alignment BEFORE the commit and had a race to win against a fast
gesture, which is why it needed both a lock and a held commit. The alignment now happens after
the commit, as a phase of fixed length (`WARP_TRANSITION.earthDepartureAimSeconds`, 1 s) that
`useExperienceTransition` runs ahead of the cinematic. A fixed phase has no race, so
`NavigationContext.mayCommit`, the hold in `createNavigationInput`, `setApproachLock`,
`approachLerpK`, `earthGuideStart/End` and `destinationSteer.ts` were all deleted with it.

- **It is not part of the cinematic.** `transitionCommitted` stays false for its length: Earth's
  own rig turns the camera (`departureAim.ts` resolves the orbit, the rig places it), so the
  dolly departs from an orbit the rig actually holds and there is still one camera writer. The
  signal is `NavigationSignals.departureAim`, 0..1 or null. The warp's duration is untouched.
- **Input is already locked**, because the phase starts after `machine.commit()`; the rig's
  drag has its own lock (`setDepartureLock`) for the same second. `transitioning` is true from
  the swing's first frame, which is what the DOM reads.
- **The orbit is placed without the rig's ease** (`setOrbitAnglesImmediate`). Eased again it
  would trail its clock and finish short of Spain — the same lag that made the old gate
  necessary. The clock also rests at exactly 1 for one frame before handing over, because its
  last running value is always a frame short of it.
- **The destination is read live**, and its azimuth is unwrapped against the previous frame's
  rather than re-resolved from the start, so a goal near half a turn away cannot flip sides
  mid-swing as the globe spins.
- **The accessible control gets it too.** It was never held, so a keyboard commit from the far
  side used to dive through the planet. It is the same transition now.
- **Skipped under reduced motion.** That preference already removes the dolly, so there is no
  planet to dive through, and a globe swinging half a turn is the motion it asks not to see.

**And the band ends at the satellites' height** (same day, client direction): the commit read
as too far from the planet. `zoomNearFactor` was pinned at 0.63 (11.34 units) by the warp, whose
dolly was a bare `earthCloseFactor` of the departure radius — any nearer and the dive went
through the surface before the flash closed. The dolly now has a floor
(`earthDollyRadius`, `earthMinDollyRadius: 2.84`, the pose the cut has always landed on), which
frees the near end; it is derived from the outermost of `ORBIT_PRESETS` (3.84 units), so it
follows the satellites. From far out the dolly is unchanged, so the arrival from Murcia and a
commit from rest are what they were. The band is still linear in RADIUS over its 1200 px, so
the on-screen growth is now x4.69 rather than x1.59 and most of it lands in the last third.

How you would know it broke: `departureContinuity.test.ts` (the real rig, a spinning globe, a
commit from the far side, 30/60/120 fps) stops landing within 0.01° of the destination, or
`useExperienceTransition.test.tsx` sees `transitionCommitted` during the swing.

**A compass.** A hairline across the bottom of the frame with a pin per place
worth clicking. Complementary to the beacons rather than a replacement: a beacon
names a thing you can see, the compass points at a thing you cannot — and turning
away from things became easy and continuous under the new model. Bearings are
computed on the GROUND PLANE, not in camera space, because a camera-space bearing
moves when only the pitch moves and Murcia's pitch sweeps 35° to 55° across the
band. A pin warms only when it is BOTH near the centre of the bar and near in the
world; being pointed at something is not the same as having arrived at it.

> **Amended 2026-09-10 — the arrival beacons are removed** (user direction). The two glass
> plates pinned over the services district and the blog display on arrival (`districtBeacons.ts`,
> with their leader and blue dot) are deleted, with their styles, unit tests and e2e spec. The
> compass stands alone, built from the same two anchors. With the beacon gone, §37's density-A
> tray is the hint frame and the consent plate, and the beacon dot is no longer one of blue's homes.

> **Amended 2026-09-10 (later) — the compass moves to the top, and Murcia's hint loses the
> city's cells** (user direction). The bar sits ON the site header's line, centred
> between its two ends and narrowed to clear them (the right-hand group measured 261 px
> over Murcia), not above the bottom edge; from 768 to 899 px wide there is no room between
> them, and it hangs just under the header instead. The hint frame's Mover / Girar / Abrir cells
> are removed with their glyphs, their motion and the hairline that ruled them off from the way
> out; in Murcia the plate now carries only the travel gesture.

> **Amended 2026-09-10 (later still) — the compass takes the lab's look** (user direction). The
> treatment is `vertigo-lab`'s camera-navigation compass: a #1c67ff lens for the bar, fading
> to 10% at both ends, and a blue forward lens drawn through it; white map pins with monospace
> labels that turn yellow (rgb 255 209 26) and grow to 1.5× on arrival; every mark shrinking to
> 62% on a narrow screen. That spends blue on furniture, which §37 had kept scarce — the beacon
> dot's home went the same day. The port also fixes the marks' travel: `--offset` was a
> percentage of each mark's OWN width, so a landmark at the edge of the span sat half a label
> from centre instead of at the end of the bar.

> **Amended 2026-09-10 (evening) — the compass is on the glass** (user direction). The whole
> instrument sits on a density-A tray: the hint frame's own recipe from §37 — `--glass-bg-light`,
> the film, the blur, the shadow and the accent-blue edge — so it joins the hint frame and the
> consent plate as the third floating tray. Its top edge is the header controls' top edge, and it
> hangs below the header from there. The lab's blue bar and forward mark stay on the glass.

> **Amended 2026-09-11 — the compass gains its instrument details** (user direction: "more
> premium, subtle details", the logic untouched). Four, all inside the lab's language. A
> calibration: hairline ticks every 15° standing on the bar's top edge, longer at ±45° and ±90°,
> in the bar's own fade and at 55% of its weight — none at 0°, because the forward lens is that
> mark. Light: a blue halo under the forward lens, and a yellow halo on a pin that grows with the
> same `--warmth` the JS already writes. Lift and lettering: a hairline shadow under the lens, the
> labels in capitals at 0.14em with a lift shadow. And one arrival ring per arrival — a circle on
> the pin's head that expands and fades once when warmth rises through 0.85, re-armed only below
> 0.5 (`utils/compass.ts` `arrivalEdge`, tested), skipped under reduced motion from JS because
> it is a WAAPI one-shot the stylesheet cannot reach. Blue's spend is unchanged: the halo is on
> furniture that was already blue. One trap recorded: the bar's fade gradient moved to
> `userSpaceOnUse`, because a bounding-box gradient does not paint on a vertical line.

> **Amended 2026-09-15 — the compass keeps off the header, off itself, and off blue** (user
> direction, after a design critique scored it 18/40). Three changes; the bearings, the warmth
> and the arrival edge are untouched. *Clearance:* the plate cleared a measured 330 px
> right-hand group, and the music toggle arrived after that measurement — from 900 to about
> 1190 px wide it covered Contacto, and on a phone it ran under the toggle. SiteHeader now
> publishes the tail cell's width as `--site-header-tail` (a ResizeObserver, scene header only),
> the compass clears that, and it hangs just under the line whenever less than 240 px is left
> between the ends. That replaces the 768–899 px rule and now takes in phones, where there was
> never room once the toggle is counted. *Labels:* from the arrival pose the two places are a few
> degrees apart and their labels printed over each other ("SERVBLOG"). `utils/compass.ts`
> `placeLabels` (tested) draws only the higher-priority of two colliding labels, with hysteresis,
> and moves a label near an end inward so it stays on the bar; the widths come from a
> ResizeObserver and are never read per frame. *Colour:* the blue lens, the blue forward mark,
> their glows, the yellow arrival and its halo are gone — DESIGN.md rules out HUD styling and
> glow. The bar is a white hairline feathered to nothing, the forward mark a white needle at full
> strength standing on the bar (it dips 2u through it and stops short of the pins, which in one
> colour merged with its lower half), pins and labels `--text-secondary` rising to
> `--text-primary` with a 1.2× label on arrival, and the ring white. The plate drops from 78 to
> about 72 px. Blue on the compass is the
> tray's edge alone, so §37's accounting holds again, and no colour literal is left in its rules
> (`--glass-bg-light-dense` is the phone's denser tray, now with a no-blur fallback).

**What it cost, and what it bought.** `DragPanController` (958 lines), the
`NavigableArea` pipeline (347) and `pinchClassifier` (226) are deleted, with about
1,400 lines of tests and harness that measured them. §39's eye-bounded rectangle
and §40's resistance band are retired: the viewer's TARGET is clamped to one
rectangle, and that rectangle is the A2 ring — the ground the GLB actually
carries. The sandbox grew its plate by a flat 50 units; measured, Murcia's built
ground extends past the plate by −X 24.9, +X 30.0, −Z 50.0, +Z 16.5, so a flat 50
would have put the viewer over nothing on three sides of four.

Rest returned to distance 285 with `zoomNearScale` 0.45. §39 is explicit that 220
was "re-chosen against navigation" to preserve pan range UNDER the eye clamp; with
the clamp retired the argument for it went with it, and 285 is the pose the
sandbox's feel was judged at. Closest approach is unchanged in absolute terms
(128.25 against 127.6), and the pinch ratio returns to ×2.22 — which is what
`adr/015` wanted.

**What now guarantees the world still surrounds the camera.** `checks/footprint.ts`
§3, which was always the outer guarantee and is now the only one. It passes with
1207 units of margin at the shipped pose. §2's clamp assertion was restated rather
than deleted: 576 of 508,032 sampled poses out-reach the horizon, all on ultrawide,
and the clamp they fall back on is 800 units against 888 units of real ground — so
what those poses draw is ground.

**A horizontal trackpad swipe turns the camera** (2026-09-14, user reports: on a
touchpad "sometimes they can't move horizontally", and it "sometimes feels bad").
The one wheel listener read only `deltaY`, so a two-finger sideways swipe was
swallowed and did nothing, and the stray `deltaY` of a swipe that was meant to turn
zoomed the city instead. In Murcia a wheel event whose `deltaX` dominates now yaws
exactly as a horizontal drag does (`MurciaExperience.lookBy` → `CameraRig.drag(dx,
0)`, same gain and spring), and never reaches the zoom band or the commit. Every
other event keeps its old path, so a mouse wheel and Earth are unchanged. This is
a classification, and the drag above deliberately has none. The difference is the
device: a drag is one hand on one surface, while a wheel event is two axes the OS
reports together, and a trackpad never sends a pure one.

> **Amended 2026-09-15 (client review):** the turn was "a bit fast". `rotationGain` 100 → 75
> degrees per viewport width. The spring (`rotationDamping` 4) is unchanged — lowering it would
> have made the turn lag the finger rather than cover less of the circle. The horizontal trackpad
> swipe shares the gain, so it is 25% slower too. The compass plate was tightened vertically in
> the same review (about 72 → 56 px on a desktop, the width untouched): a shorter needle and pin
> and smaller gaps, the arrived label's 1.2× reservation kept.


## 45. The services district is the campus

**2026-09-11.** Ported from `prototypes/vertigo-lab`, experiment
`service-campus`, whose `core/` was split out to be copied the way the tower's
screen was. Replaces **§34** — the projected display — whole. The working
record is `plans/024-services-campus.md`.

**The model.** The campus stands at the plate's +X/+Z corner, modelled in the
city since `murcia-v6`. A tap on its lake flies the camera to a ring of stops
round the water, and a particle field rises out of the lake into a disc: the
intro. A horizontal swipe, or the arrow keys, walk the ring — each service forms
its symbol out of the same particles, and the ring is endless in both
directions. [+] turns the symbol into that service's animated figure and leans
the camera in. Escape, or the overlay's close, goes back one level; a pinch out
leaves. The copy is real DOM, and the LED strip round the building runs the
invitation "CLICA AQUI, VE NUESTROS SERVICIOS" (since `230f836`, 2026-09-16; it
was SERVICIOS) three times — nothing measures the phrase against the pitch, and
at four copies the ≈ 90 m line overran its 86 m pitch and wrapped onto itself,
so the count came down rather than the type, and the renderer now warns when a
line runs past the strip.

**What was decided on the way, with the client:**

1. **Replace, not add.** The display, its beams, reveal and shaders,
   `DistrictInteraction`, `DistrictHighlight`, `resolveDistrict`,
   `CameraFlight` and `cameraFraming` are deleted, not kept switchable.
2. **No Sanity change.** A service's subtitle is the opening of its `body`
   (`splitServiceCopy`) and its detail is the rest. Its symbol and figure are
   scene composition, in `scene/cityDistrictBindings.ts` — placeholders until
   the artwork arrives. `DistrictContent.intro` stays unread, as it was under
   §34: the overlay has no slot for a paragraph.
3. **One LED engine.** The campus's strip runs on the tower's
   `landmark/towerScreen/`, which gained the lab's `flipY` and `setScroll`.
   The scroll only wraps u while scrolling, so the tower is pixel-identical.
4. **A visible close.** The lab left by Escape only, and a phone has none. The
   overlay grew a 40 px close beside [+].
   > *Amended 2026-09-16 (client review on a phone).* In the phone sheet the mark
   > is 26 px inside the same 44 px target; the sheet's grip is a bare pill with
   > no caption (its `aria-label` still says "Leer más" / "Ver partículas"), with
   > 26 px of air under it; and under the centred title the subtitle, the copy,
   > «Qué medimos» and the legend are a centred column of left-aligned text.

**What the port decided without asking, and why:**

- **The campus flies its own camera.** Its stops sit at an elevation and a
  look-at height the rig cannot express, so for the whole visit the rig is
  externally controlled and adopts the camera on the way out — the blog
  approach's hand-over (`campusCameraAdapter.ts`). `check:campus` measures the
  exit landing on the pose entered from at 2.8e-14 units.
- **A press during a flight is ignored, not "stop".** §34's display cancelled a
  flight on any press; the campus's flights cannot be cancelled mid-air, and
  they are 1.4 s. Reversed deliberately.
- **Authored metalness is kept.** The tower's palette zeroed its metals (§6.8
  of the export contract); the campus's numbers were judged in the lab under
  the same kind of rig, so they stand, and the glazing and frames are the
  visual-pass knobs.
- **The strip is 8192, not the lab's 16384.** Two canvas slots of ~5 MB each
  instead of ~21 MB, against a phone budget measured at ~70 MB.
- **The approach yaw is gone.** 225 was forced by the old plaza; the campus
  takes its heading from wherever the visitor was looking.

**Open, and not decided here.** The lake is the only entry target, as in the
lab. From the resting pose it is small, and on a phone smaller; §34's display
grew its controls to a touch floor after projection, and nothing does that for
the lake. With a detail open at 1600x900 the expanded copy climbs into the
figure. Both are judgements for the visual pass on real hardware.

---

## 46. Earth's glyph is the wheel again, and a hand on a phone for touch

> **Amended 2026-09-15 — forward wheel rotation zooms in.** Users reported
> trying the opposite direction. Desktop vertical wheel input is now inverted
> at `onWheel`: forward approaches, backward retreats, consistently in Earth and
> Murcia. Continuing inward on Earth travels to Murcia; continuing outward in
> Murcia returns to Earth. Touch spread, horizontal trackpad look, zoom limits
> and transition guards retain their existing behaviour. Earth's desktop hint
> now reads **"Zoom para viajar a Murcia"**, with an upright mouse, upward wheel
> motion and upward chevrons above it. Its timing and reduced-motion rules stay.

> Amends **§43**, whose sentence, timing, type size and measured floor all stand. Murcia's plate
> (`.nav-hint`) is untouched: it keeps its mouse and its two-dot pinch.

**Decided 2026-09-11,** on client direction. §43 had cropped Earth's mark to the two chevrons
alone. The client wants the icon that Murcia's plate carries — the mouse with its scrolling
notch and the two chevrons chasing below it — back on the Earth scene, and for touch something
more explicit than two dots: a phone, and a hand spreading two fingers on its screen.

**Both glyphs are rendered and `(pointer: coarse)` picks,** in the SAME rule that picks the
sentence, so the picture and the word are chosen by one fact and cannot disagree. This is the
arrangement `NavigationControl` and `EarthHint` already used for the words; it now covers the
drawing too.

**The mouse is a copy of the plate's path data, pinned by a test — not a shared component.** The
plate's mouse carries chevron groups on BOTH sides and lets `.nav[data-direction]` choose; Earth
only ever goes down. A shared component would have to thread that selection into a scene with
no direction to select, or grow a prop for it, for one glyph. The §43 convention — copy the
literals and let `EarthHint.test.tsx` fail the moment either copy is redrawn — is cheaper and
was already in place. The Earth copy is cropped to the body and the DOWN chevrons
(`viewBox="6 13 12 34"`), so it needs none of the plate's ±6px recentring, and its stroke is
1.4 against the plate's 1.6, on §43's rule that weight is a ratio to what it sits beside.

**The keyframes are shared outright.** `nav-hint-wheel-down` and `nav-hint-chase` are global,
and Earth's rules apply them to `.earth-hint__part--wheel` / `--chase` with the plate's own
delays (−1s, −0.84s on the second chevron). Same notch travel, same 160ms hand-off. No direction
variable on Earth, because there is no second direction to vary to.

**The pinch is a spread,** because leaving Earth is an approach (ADR 006) and the world is
pulled toward you. The hand is three FAT round-capped strokes — a palm pill low on the screen
and index and thumb rising from it in a V, their caps the fingertips — over a hairline phone:
the weight difference is the drawing. Two cuts came before it and both were measured off a
filmstrip: a hairline hand with dots for tips read as a needle, and two fat fingers with no
palm read as a pair of slashes. The V from one palm is what reads as a hand. Each finger is
ONE path and the spread is a ROTATION about its palm end (`transform-origin` on the fill-box
corner each base lands on), on the plate's pinch shape (land, travel, hold on the 62–86%
plateau, fade). Rotation rather than translation because a translation tears each finger off
the palm by the amount it travels. No path morphing, so it is transform-and-opacity like
everything else on the plate and reduced motion can freeze it readable.

**Every animation sits at (0,3,0), and the reduced-motion kill comes after them.** The trap §43's
predecessor recorded — a rule one class heavier than the kill keeps the wheel scrolling for a
visitor who asked it to stop — is avoided by construction here rather than through the plate's
custom-property indirection, which Earth does not need. The resting drawing is the readable one:
every part at full opacity and zero offset, the keyframes travelling away from it.

**Sizes are judged, not derived.** Mouse 1.25em wide (20px at 16px type, height following
12:34), phone 2.5em square (40px). §43's 1.375em was set for a bare mark; a drawing of a mouse
below ~20px wide reads as a toy. These are the first numbers a client review may move.

**Verified** in a filmstrip on the shipped path (fine 1440×900, coarse 390×844 and 844×390),
frames taken by setting each animation's `currentTime`; reduced motion checked with
`getAnimations()` on every `.earth-hint__part`, not by eye. The e2e footer measurement in
`navigation.spec.ts` still passes: the hint is bottom-anchored, so a taller glyph grows upward.

**Also broken when:** an `.earth-hint__part` rule gains a class (it outranks the kill); the
mouse's literals are edited in one component and not the other (the test says which); the
pinch's fingers are drawn as one path with a morph (nothing else on the plate morphs, and
reduced motion could not freeze it readable); or the glyph swap is moved out of the
`(pointer: coarse)` block that swaps the sentence.

## 47. Two typefaces in two roles

**Decided 2026-09-11,** on client direction. The site sets type in two roles. **Switzer is the
display role**: headings, titles, the compass, the LED panels, the CTAs. **Inter is the text
role**: everything else. The blog keeps Source Serif 4 for reading runs of prose.

**One declaration, for every document.** `siteHeader.css` declares `'Vertigo Display'` (Switzer)
and `'Vertigo Text'` (Inter), with the tokens `--font-display` and `--font-text`. It is the one
sheet the scene, the warm blog and the cold blog all load — the same reason it owns §37's glass
tokens. The facade's canvas text asks `document.fonts` for these same names instead of
registering faces of its own, so the private `'Vertigo Facade Inter'` and `'Vertigo Campus Inter'`
are gone. The blog names `'Vertigo Display'` directly, because `blog.css` reads no site token but
`--header-control`; its own `'Vertigo Blog Inter'` points at the same files, so the browser
fetches each once.

**What changed on the scene.** It had rendered in `system-ui` — `styles.css` asked for an
`'Inter'` nobody declared (PROJECT_MEMORY §11.68). It now renders in Inter, which is a visible
change to every string on it. The names stay private for adr 013's reason: `@font-face` is
global to a document, and a plain `Inter` is something other sheets could ask for by accident.

**Measured, not assumed.** Switzer is one variable woff2 for every weight, 43,220 B with 386
glyphs, every Spanish character present; its cap height is 0.750 em against Inter's 0.727, and
the facade sizes each face by its own so a block's cap-height spec means the same metres in
either. The Earth holo atlas still draws in `system-ui` — it rasterizes during the intro, before
any web font could be counted on — and is the one surface left out.

**Söhne was rejected.** The files offered were Klim's `TestSohne` trial copies, licensed for
personal use only, with 69 glyphs: no á é í ó ú ñ ¿ ¡, no curly quotes, no dashes. Every Spanish
word would have fallen back mid-word. Shipping Söhne needs a Klim web licence and its full files.

**Cost.** About 91 KB more on `/`, preloaded at low priority (Inter latin and Switzer), onto a
boot the 2026-09-02 audit already measured over its 2.8 MB target.

**Also broken when:** a sheet declares a face named plain `Inter` or `Switzer`; a new font lands
in `public/fonts/` without the first 8 hex of its SHA-256 in its name (the path is `immutable`);
a preload loses `crossorigin`; or a facade text block type is added without choosing a role in
`facadeRenderer.ts`.

## 48. The music crossfades; the picture still cuts

**Decided 2026-09-11,** on client direction. There is background music: one loop for Earth and
one for Murcia. It starts when Earth is whole, and the warp crossfades from one track to the
other. The player is `src/app/audio/backgroundMusic.ts`.

As of 2026-09-11, only Earth has a track. Murcia's entry is commented out, and a world without a
track is simply silent: the warp fades Earth out, and fades nothing in.

**§6 is not broken.** "Nothing ever cross-fades" is a *visual* principle, and every
substitution it names is a picture. The Earth ⇄ Murcia swap is still a hard cut under full
black. The music is the one thing that is allowed to overlap the cut, and it starts crossing at
the commit (`useExperienceTransition`'s `onStart`), not at the cut. The crossfade lasts
**2.4 s** against the warp's 1.6 s, so the new world's track settles after the picture does. It
runs on the AudioContext clock, not on `transitionProgress`: a committed warp cannot reverse, so
there is nothing to follow per frame.

**It cannot truly autoplay.** Browsers refuse audible playback until the visitor has made a
gesture, and the intro has nothing to click. At phase `'site'` the player tries to start. If
that is refused, the music begins on the first press, tap or key instead. Wheel and scroll never
count, so a trackpad visitor who only scrolls hears nothing until they click. The header carries
a toggle (`SoundToggle.tsx`, WCAG 1.4.2), and a blocked start reads as off there, so pressing it
is the gesture that starts the music. The preference is on by default and is stored as
`vertigo:sound` in `localStorage`.

**Streamed, not decoded.** Each track is an `<audio>` element feeding a GainNode. A decoded
3-minute track costs about 63 MB of PCM, and the phone budget has no room for two. Web Audio is
there for the fades, because iOS ignores `element.volume`. The Murcia track fetches nothing
until the first warp. A track that fades to silence is paused and keeps its position, so a
return resumes where it left off. This is also why the CSP's `media-src` went from `'none'` to
`'self'`.

**Quiet elsewhere.** The warm blog fades the music out and back in on close. A hidden tab fades
it out too. A cold `/blog` has no music and no toggle, and `e2e/blog.spec.ts` asserts it
requests no `/audio/` file.

**Also broken when:** a `play()` promise goes uncaught (the e2e collectors fail on unhandled
rejections); the unlock listener is moved to `pointerdown` or `wheel`, which grant no user
activation on touch; or a track lands in `public/audio/` without its hash in the name.

## 49. The centre of the city is baked and unlit; the exterior is lit

**Decided 2026-09-11,** with murcia-v7. The city's centre — the four quadrants inside the A2 ring,
their windows and props, and the streets — ships with its light baked into twelve KTX2 atlases,
and renders **unlit**: `MeshBasicMaterial` with a lightmap, the scene's rig ignored. The exterior
blocks, the outer ground and the trees are not baked and keep the authored lit material under the
same hemisphere-and-sun rig as before. `src/experiences/murcia/assets/lightmaps/` is the runtime;
the export contract §7 is the artist's side.

**Why unlit.** The bake is diffuse direct + indirect without albedo, so the texel IS the light. A
lit material would add the rig's 2.7 of irradiance to light already in the texture, and the
floor-brightness problem (the bloom threshold, §floor) would come back doubled.

**Receivers by extras, never by name.** The site dresses 21 nodes itself — the tower's screen and
logo, the campus, the blog building, the river, the plate — and finds them by name. The bake
marks what it covers with `asset_lightmap_kind` / `ground_lightmap_chunk` extras, and the lightmap
pass visits only those. The named nodes keep their names, pivots and UVs untouched. The tower's
own glass and metal parts went into the baked chunk, so `applyTowerPalette` dresses nothing there
now; its screen and its logo are still separate.

**The plate is invisible.** `suelo-principal` and the ground chunks cover the same rectangle at
the same height. The plate stays for what is measured off it and as the skirt's material template
— now an unlit material in the outer ground's mean vertex colour, so the horizon continues the
ground it wraps — and `visible = false` is what stops the two from z-fighting.

**No trim texture.** The export embeds a neutral white trim so Blender and the site share one
material graph. White multiplied in is nothing, so the runtime drops it and `trimSheet.baseColor`
is null. Base colour is vertex colour alone.

**Resolution follows the sky's split.** Twelve atlases at 2048 are ~34 MB of GPU memory against
the ~70 MB iOS budget; a phone-width or touch-first viewport gets the 1024 set (~8 MB). Both ship.

**Cost.** The model is 5.4 MB (v6: 3.5) and the atlases 4.2 MB at 2048 / 1.3 MB at 1024, fetched
after the GLB inside the same non-required boot step; the intro's bar stalls at 80 % while they
load. The lit exterior and the baked centre are balanced by eye after the first look.

**Also broken when:** a receiver loses `TEXCOORD_1`; an instanced group's `asset_st_accessor` is
missing; a named node is also merged into a baked chunk; the plate is deleted from the export;
`configureTrimTextures` runs after the lightmaps (it would set repeat wrapping on the atlases); or
a re-bake changes the manifests' `uvChannel`.

## 50. The billing range is a dropdown, and its options are the client's

**Decided 2026-09-14,** at the client's request. «Rango de facturación de tu empresa» in the audit
form was free text, on the argument that the client wanted business context and a select would
force somebody to invent brackets. The client now wants the brackets — they just do not know them
yet. So it is a `<select>` like «Servicio de interés», but its options are CONTENT:
`siteSettings.revenueRanges` in Sanity, emitted as `REVENUE_RANGES` by `src/content/site.ts`.
«Presupuesto mensual» stays free text.

**The label is the value.** Each range is one string, shown as the option and submitted as-is. No
id: nothing parses it, the notification email shows it as picked, and the editor keeps one list
rather than two aligned by hand.

**The server checks the closed set, like `PLANS`.** `server/validate.ts` imports the same generated
list — the second edge from `server/` into `src/`, after `recipient.ts`, and through the same
adapter — and refuses anything outside it. Browser and server ship in one build, so they agree; a
tab open across a range change gets a field error, the trade the service select already makes.

**Four placeholders, in two places.** `REVENUE_RANGES_FALLBACK` in `siteSettings.collection.ts`
applies when the field is absent or empty, so a dataset that predates it still builds and the
dropdown can never render empty. The same four are written into the dataset so the Studio shows
them as something to replace. The Studio requires at least one.

**Also broken when:** the Studio's per-entry bound and `CAPS.revenue` drift apart (both 60 today;
the Studio reads `EDITORIAL_BOUNDS.siteSettings.revenueRange`); or a publish of an old
`drafts.siteSettings` that predates the field wipes the list back to the fallback.

## 51. The intro's tail can be left once loading is done, and a returning visitor leaves it

**Decided 2026-09-15** with the user, on measurements (plan 025). The loading draw is the loading
cover and is untouched: it waits on every required resource and has a 3 s floor. The tail after
it — shrink, warp, swap, the corner hold and the orbit reveal, 9.7 s fixed — plays over a scene
that is already whole, and nothing in it waits on loading: satellites are ready before it starts
on every measured load, and Murcia's readiness is enforced by the gesture and its hint instead.

**A pointer press skips the tail, and only the tail** (`app/introSkip.ts`). Primary button, touch
or pen, in `shrink` … `orbits`. During the draw a press does nothing; at `site` a pointer press is
the visitor using the page. Escape is unchanged from before this plan: it keeps its existing guards
and its existing behaviour at `site` too. No visible hint: the scene carries no text (the user
rejected on-scene captions the same day).

**A returning visitor skips it automatically — if they consented** (`app/introSeen.ts`). The first
landing stores `vertigo:intro` = `{ v: 1, seen: true }`, and a later visit plays the loading draw in
full and seeks to `site` at the first tail phase. The record holds only that flag and is read by
nothing but this page, but it is still storage on the visitor's device — the thing ePrivacy
(Spain's LSSI art. 22.2) governs, whatever identifies whom — and unlike `vertigo:sound` it would be
written without the visitor doing anything. So, by the user's decision the same day, **it is
written only with consent**: App subscribes to the consent record from `site`, writes the flag on
an accepted choice (the banner's single choice, stored as `analytics: true`) and removes it on a
refused or withdrawn one. A visitor who never consents gets the full intro every visit. The cookie
policy (Sanity `legalDoc` `cookies`) still describes only the consent record and not
`vertigo:sound`; that text is the client's and their legal review's.

**Not chosen:** controls arriving during the tail (§26.16 stands) and shorter holds (the timeline's
one-focal-thing-at-a-time choice stands). **Withdrawn:** pacing the tail by what is still loading —
measured, it would pace by nothing.

**Broken when:** a press during the draw lands the site; a pointer press at `site` re-seeks (the
parked logo jolts); a returning visitor's draw is shorter than its floor; `vertigo:intro` is
written without an accepted consent, or survives a refusal; or the storage read throws instead of
reading "not seen".

## 52. A service's figure draws what its copy argues, and the plate names it

**2026-09-15.** The client said the campus plates beside the particles "only have text" and asked
for graphs. A graph was already there, and it was decoration: each symbol turned every ~3 s into
`bars`, `ring`, `pins` or `line`, with constant bar heights and a sum of sines, and two services
shared `ring`. The user's condition: nothing added for the sake of adding.

**Decided with the user:**

1. **The figures became the argument.** Five figures, one per service, each drawing the mechanism
   that service's own copy states (`campus/particles/figureLayouts.ts`): `compound` (SEO — paid
   traffic stops with the spend, organic keeps accruing), `segments` (paid — the segments that do
   not convert are cut), `funnel` (analytics — one step loses most), `path` (content — few pieces,
   linked, leading somewhere), `repeat` (brand — the symbol ten times, identical, moving as one).
   The old four are deleted.
2. **Schematic, never data.** No figure has a value, scale or axis. No measured result exists
   (PRODUCT.md), and a chart that looked like one would be a claim the client has to retract.
3. **The symbol turns into its figure once and holds it.** Reduced motion still makes the turn
   (short morph, still figure): the figure is content now.
4. **Two new, optional `service` fields in Sanity.** `figureCaption` is the legend, which fades in
   under the copy once the figure has formed, with a key in the service's particle colour.
   `measures[]` is «Qué medimos»: up to three metric names. Draft copy lives in the fixtures as
   placeholders for the client to replace. Optional, so the already-published documents keep
   building.

**Not chosen:** a chart inside the plate (it would duplicate the particle figure beside it),
figures with numbers, and on-scene labels (the 2026-09-15 no-captions decision).

**Broken when:** a figure gains a value or an axis; the legend shows before its figure has
formed; a service's body is rewritten to argue something its figure does not draw, and nobody
changes the binding; or a document without the new fields fails the build.

## 53. The selected hologram lands on a smoked-glass tray, edge and all

**Decided** 2026-09-16, from the client's report that the expanded lockup could not be read
when the close-up put it over the daylit hemisphere. One of five options analysed before any
code; built on its own branch beside the rimless variant (option 3, `feat/holo-smoked-glass-field`)
so the two can be judged by eye against each other.

**What it is.** While a case study is selected, the field's own 2:1 rectangle becomes a tray in
the site's smoked glass: §37 density A (`rgba(10,15,22,0.68)`) with the trays' neutral hairline
(`--glass-border`, 0.10) and their film of reflected light along the top, all restated as
`panel.glass*` in `orbitConfig.ts` because a shader cannot read a custom property. Drawn first,
so the artwork and the emitter sit ON it; the emitter line is still the light source at its
base. It scales with `resolve`, the stage the logo arrives on, and is absent at rest.

> **Amended the same day, after the client saw it.** The hairline is one screen pixel, faded
> over the next half — `line()`'s ~2 px read as a frame on a tray this size. And the rear halo
> is withdrawn as the plate arrives (scaled by `1 - resolve`): on the glass, blue belongs at the
> base alone, the emitter line and its wash, and a blue glow behind the lockup was a second light
> source arguing with it. The resting square keeps its halo. The emitter wash climbs less far
> and less bright on the glass (0.20 → 0.14 pane heights, gain 0.16 → 0.11, both eased on
> `resolve`): the plate is the ground now, and the light only has to say where it enters.
> Chosen over the rimless variant (option 3, `feat/holo-smoked-glass-field`) the same day.

**Why an edge is allowed here and nowhere else in the field.** The rule against edges was
written for the RESTING state — six marks permanently on screen, where any frame is the loudest
thing in it — and for the accidental rectangles earlier passes drew. This edge is neither: it is
the reward state only, and it is the same hairline the hint frame and the case panel wear, so the
expanded field reads as their in-scene cousin rather than as a HUD card. Blue stays on the light.

**What the CSS material has that this cannot.** `backdrop-filter` — no blur of the scene behind
a quad without a second pass — and the drop shadow, which below the field would land in the
cone's territory.

**Broken when:** the plate is visible at rest; its colour, alpha or border stop matching the
§37 tokens; the border grows past a hairline; blue appears on the plate; or the plate is drawn
above the artwork.

## Superseded

| Decision | Was | Now |
|---|---|---|
| The services district is a projected in-world display that owns every control, entered from any of its buildings, and a flight that frames the plaza | `district/display/**`, `interaction/DistrictInteraction.ts`, `camera/CameraFlight.ts`, `checks/district-flight.ts`, deleted 2026-09-11; **§34** | The lab's campus: a tap on the lake, a ring of stops walked by swipe, arrows and Escape, symbols and figures made of particles, copy in a DOM overlay, and the campus's own camera — **§45**, `plans/024` |
| The phone burger is four bars drawn as geometry on the canvas, and they fly to the centre to become the frame of the menu | `corner-logo/headerBurger.ts`, deleted 2026-09-09; **§26.16** amendments of 2026-09-08 | Three flat bars, and the SCENE moves: the viewport hinges away and slides down as a card, uncovering the menu behind it — **§26.16** amendment 2026-09-09, `plans/023` |
| The blog is entered by a tap on the `blog_edificios` cluster, which owns no camera and is "not a district, and must not become one" | `interaction/BlogBuilding.ts`, deleted 2026-09-09 | A display floating above that cluster, and a three-second approach into the page. The tap is gone rather than kept beside it — **§42** |
| Earth teaches its way out on a glass chip at the bottom of the viewport | `.nav-hint` travel cell, `NavigationControl.tsx`, **§39 (the hint frame)** | It is drawn IN the scene, as ~770 points that gather out of the star field. The plate is hidden on Earth and kept in full for Murcia — **§41** |
| The Earth hint is offered a beat after each arrival, and does not return until the next one | `createNavigationInput`'s `onHintVisible`, **§41** as first shipped | It is offered after two seconds of STILLNESS and returns whenever the viewer goes quiet again. Murcia's chip keeps the arrival rule, and the two are no longer wired together — **§41 revision** |
| Earth's way out is drawn in the scene, as ~770 points that gather out of the star field | `experiences/earth/hint/{createHintParticles,sampleInk,buildHintFigure,hintPresence}.ts`, deleted 2026-09-09, **§41** | Plain white DOM text carrying the same chevrons and the same sentence, faded in over 2 s and floating ±5 px. The client's objection was the glass plate, never the text — **§43** |
| Earth's mark is the two chevrons alone, for both inputs | `EarthHint.tsx`, **§43** | The plate's mouse (body, scrolling notch, chasing chevrons) on fine pointers, and a hand spreading two fingers on a phone for touch, picked by the same `(pointer: coarse)` rule as the sentence — **§46** |
| Murcia navigates like a map: one finger pans the ground 1:1 under the cursor, a second finger or the right button rotates | `navigation/DragPanController.ts`, deleted 2026-09-10; **§20**, **§21**, **§38** | One pointer carries BOTH axes at once over a second-order spring, and two fingers mean only a pinch. The ground-raycast grab-the-point solve is gone rather than kept beside it — **§44** |
| The navigable area bounds the CAMERA, and the outer part of it is a band travelled against a falling gain | `navigation/navigableArea.ts` and `resistToRect`, deleted 2026-09-10; **§39**, **§40** | The viewer's TARGET is clamped to one rectangle, and the rectangle is the A2 ring the GLB carries. The band bought pan range; the wider rectangle gives it outright — **§44** |
| A pinch has to prove it is not a two-finger turn before it may drive anything | `app/navigation/pinchClassifier.ts`, deleted 2026-09-10; **`adr/015`** | Two fingers mean a pinch, because nothing else uses two fingers. It arms on the second contact and drives the band from the first sample — **§44** |
| The Earth ⇄ Murcia cinematic is counted by a GSAP timeline | `app/useExperienceTransition.ts`, rewritten 2026-09-10 | A `dt` clock, `utils/transitionClock.ts`. The timeline was two linear tweens and a callback; the `visibilitychange` guard it needed is structurally impossible now — **§44** |
| The navigable area is the authored plate, and its edge is a hard clamp | `computeStationLimitedBounds(configured, …)` and `clampToRect` in `DragPanController.applyPan`, **§39** | The plate plus the A2 ring, with the ring travelled against a gain that falls to zero. Same rule, wider rectangle, felt edge — **§40** |
| The navigable area bounds the focus | `NavigableArea`, `DragPanController`, and `checks/footprint.ts` §3, which bounded the eye against the *skirt* and passed while the camera stood off the city | It bounds the CAMERA. The eye offset is `distance * cos(pitch)` — 271 units on a 352-unit plate — so the focus being legal never made the eye legal — **§39** |
| Murcia rests at 18 degrees and distance 285 | **§20** amendment 2026-09-04, client direction, `murciaConfig.ts` pose docblock | 35 degrees and 220. The low pose put the horizon in frame on arrival and the camera off the plate everywhere — **§39** |
| The footprint inset is disabled whenever the model carries ground past the plate | `MurciaExperience.ts`, `disableFootprintInsets`, 2026-09-04 | It is asked per pose, and is back ON: at 35 degrees no reachable pose clamps a ray, so the footprint is a measurement again. The flag survives only for the no-skirt case — **§39** |
| The audit section is an opaque curtain: the scene goes away while the form is open | `auditSection.css` `.audit-panel { background: #050506 }`, **§26.15** | Density C smoked glass. The world stays behind the questions as soft context, and the panel is the same material as the contact and legal sheets — **§37** |
| The emitter hairline is the site’s signature, restated in six sheets because they cannot share | `styles.css`, `murcia.css`, `consentBanner.css`, `siteHeader.css`, `auditSection.css`, `contactSection.css` | Removed. Where the line said something it stayed and went neutral; the sharing problem it caused went with it — **§37** |
| Blue marks accents, focus, scrollbars, arrows, ticks, leaders and gradients | plan 005 palette note, `auditSection.css` header | Four homes: the primary CTA, a focused field’s ring, the beacon dot, the focus outline — **§37** |
| The services district is engaged through a building, and a floating card shows that service | `DistrictInteraction.ts`, `districtPanel.ts`, `districtLabel.ts`, **§32** | A projected in-world display owns every control; buildings are one entry target and otherwise scenery — **§34** |
| A swap between buildings re-aims the flight and keeps the distance | **§32**, `checks/district-flight.ts` §7d | Paging moves no camera at all. The only district flights are in and out — **§34** |
| The district camera frames around the panel that covers part of the canvas | **§32**, `unobstructedCenterNdc(rect, panel.getObstructionRect())` | The display is in the world and moves with the camera, so the framing target is simply the centre — **§34** |
| Murcia loads during the Earth intro so the transition never waits on it | `MurciaLayer.tsx`, ADR 004 | It loads after the handover. The transition still never waits — `canNavigate` gates on `murciaReady`, which lands before phase `site` — and the intro stops competing with 2 MB it does not need — **§33** |
| "Servicios" is one district, picked as a cluster, opening an accordion of every service | `cityDistrictBindings.ts` (`blog_edificios*` stand-in), `districtPanel.ts` accordion, §20 | One building per service (`edificio-servicio-NNN`), engaged one at a time; the panel shows one service with prev/next — **§32** |
| The terrain plate is `Plane.013` | `murciaConfig.ts`, `blender-export-contract.md` §5 | `suelo-principal` since the 2026-08-27 re-export; the largest-flat-mesh fallback covered the gap and warned — **§32** |
| WordPress is the editorial source of truth | **§27**, `adr/010` | Sanity. The WordPress mapping never worked — flat keys against a `rendered`/`acf` envelope — so nothing working was replaced — **§31**, `adr/011` |
| `WP_CONTENT_BASE`'s presence selects the source; `wp \| fixture \| seed` | `scripts/build-content.ts` | `SANITY_PROJECT_ID` selects it; `sanity \| fixture \| seed`. A leftover `WP_CONTENT_BASE` fails with a message naming what changed — **§31** |
| A torn pull is caught by asserting `X-WP-Total` against what arrived | `content/lib/source.ts` | One GROQ query per collection removes the failure class. Eventual consistency after a publish remains, and is documented rather than slept on — **§31**, `adr/011` |
| Content is fixtures and two collections; a phone number does not earn a post type | **§30** | Six collections. Services, site settings and both legal documents are CMS-owned; `site.ts` is a compatibility adapter over generated content — **§31** |
| Legal copy is `string[]`, one entry per paragraph | **§30**, `site.ts` | Constrained Portable Text, converted to typed blocks at ingest and rendered by an explicit serializer — **§31**, `adr/011` |
| `SATELLITES` is the single seam an API would replace | **§26.13**, `orbitConfig.ts` | The seam is the generated module. `SATELLITES` is deleted; content is emitted at build time — **§27**, `adr/010` |
| The satellite↔orbit pairing is positional, and `orbitId` is unread | `createOrbitSystem.ts`, `caseStudies.ts` | `orbitId` is off the content type; `orbitAssignments.ts` binds preset to case and unresolvable ones fail the build — **§28** |
| `logo` becomes a CMS media URL, needing CORS and an `img-src` entry | **§18**, 2026-08-14 | Media is mirrored into `public/logos/` at build time, so it stays same-origin and the CSP is untouched — **§27** |
| `logo` is a single string, and that is the entire media seam; one 2048×1536 atlas whose 2:1 cell is coupled to `panel.width` | **§18**, `PROJECT_MEMORY` §9 | A pair, `isotype` + `logo`, both or neither; two atlases, and the shader contain-fits so panel and cell aspect are independent — **§18** amendment 2026-08-25, **§26.21** |
| The panel's frame is Vertigo's cyan holographic language (`panel.frameColor`, brackets, scanlines, brand-tinted pane) | `createHoloPanel.ts`, `orbitConfig.ts` until 2026-08-25 | Dark glass matching `.case-panel`, a screen-constant hairline, and the brand colour only on the emitter line — **§26.22** |
| The warp is triggered by a control, never by scroll | **§15**, inherited from the Murcia prototype | A gesture: wheel on desktop, a two-finger pinch on touch. Accumulated, reversible, threshold-committed — **`adr/009`**, then **`adr/012`** |
| A bounded zoom band lands on the wheel and on pinch | **§20**, 2026-08-13 | There is no zoom anywhere. Flights are the only way to get closer — **`adr/009`**. A pinch means NAVIGATE, not zoom — **`adr/012`** |
| Wheel is claimed by both experiences’ cameras | `createFocusCameraRig.ts`, `DragPanController.ts` | One global listener owns the whole wheel stream, which is what makes trackpad momentum tractable — **`adr/009`** |
| The repo has no test runner | `PROJECT_MEMORY` §2, "no ESLint and no test runner" | Vitest for pure logic; `checks/` unchanged; Playwright local — **§22** |
| `npm run check` is the gate, and nothing runs it | `PROJECT_MEMORY` §10, audit `VER-1` | `npm run build` runs it, and every harness can fail — **§12** |
| Pan is 1:1 under the cursor | **§20**, 2026-08-13 | Gain 0.7; exactness is asserted on the solve at gain 1 instead — **§21** |
| One gesture carries both navigation axes | `PROJECT_MEMORY` §7, signed off 2026-08-06 | Pan owns the primary gesture; rotation is right-button/two-finger; zoom exists — **§20** |
| The Earth prototype keeps its own decisions file | `earth/DECISIONS.md`, 1862 lines, listed above as still authoritative | Retired 2026-08-17; what still binds is **§26**, and this file is the only one — **§26** |
| The brand plates are drawn, never loaded | the Earth prototype's "The plates are drawn, not real logos" | Drawn as the floor; real artwork upgrades in — **§18** |
| The cold blog document is 2D by construction, and pays for no 3D at all | **`adr/013`**, 2026-08-31; the ban asserted in `e2e/blog.spec.ts` | It pays for the BRAND MARK and nothing else: three, the Draco decoder and the mark's GLB (the KTX2 bake and its transcoder went with plan 019 §3, 2026-09-05 — the geometry has no UVs and the mark is unlit brand white) — deferred until after the article paints, with the SVG as the first paint and the permanent fallback. What it still refuses is the 3D APPLICATION, and the e2e states that as an allow-list in both directions rather than a blanket ban — **`adr/013` amendment**, **§26.16** |
| The application has one WebGL renderer | **`adr/001`**, **`adr/002`**, and `graphics/decoders.ts`'s "which is all there ever is here" | One renderer for the SCENE. A warm document also holds the blog header's 44×44 `low-power` context — **`adr/013` amendment** |
| A logo should be delivered at ~1024×512 | `sanity-media-contract.md` and the Studio's own field description, since 2026-08-23 | 1600×800, minimum 900 wide. 1024×512 is barely above the 896×400 box the artwork is fitted into, and `drawLogoContained` already warns below it — the CMS was advising editors towards artwork the renderer complains about. `docs/earth/logo-spec.md` had said 1600×800 all along and was the copy nobody reconciled — **§26.23** |
| The format and size rules for a brand mark are guidance for the editor | the two `description` strings on `caseStudy.isotype` / `.logo` | They are validation. Wrong format or geometry disables Publicar and fails the build; only the ideal-versus-acceptable difference is advice — **§26.23** |
| The backdrop is a field of uniform points on a shell | the Earth prototype's "The space backdrop is a second field, on a shell" | The shell stands; the points are now a clustered, magnitude-varied field over a sky image — **§19** |
| The sky is generated on the GPU, not downloaded | **§19**, first form | It is a 113 KB photograph. The procedural nebula could not be made to look like anything but dirt, for structural reasons — **§19** |
| The sky source is an equirectangular panorama | **§19**, `CREDITS.md`, `spaceConfig.ts`, and the `width === height * 2` guard that "checked" it | It is a flat 2:1 image, and so is every candidate that was screened. Aspect ratio is not projection. Mitigated by `convergePoles`, not fixed — only a different source fixes it — **§19** amendment 2026-08-20, `audits/reports/sky-panorama-projection-2026-08-19.md` |
| `convergePoles` removed the polar spokes | **§19** amendment 2026-08-19, and a pole view rendered looking only for what it had just fixed | It removed them above ~75 degrees. Its fade weight is 0.06 at 60 and 0.40 at 70, so the dashes survived across 45-75 — most of a pole view — for six days. Fixed 2026-08-25 by ramping the median window with latitude — **§19** amendment 2026-08-25 |
| The polar caps are dark because `convergePoles` darkened them | the shape of the artifact, and the fact that the fade obviously removes signal | It is **mean-preserving on both passes**: the box blur preserves each row's sum and the fade is `row += (mean - row) * fade`. The darkness is the flat source's own top and bottom rows. Turning the fade off restores the spokes, re-inflates the file, and does not lighten the caps by one code value — **§19** amendment 2026-08-25 |
| High azimuthal detail near the pole means the sky there is healthy | the ring metric used to verify the 2026-08-25 diagnosis | 1.16 at 25 degrees against ordinary sky's 0.37-0.80 was the DASHES, not gas. The metric cannot tell structure from aliased streaks, so it cannot be read in either direction — **§19** amendment 2026-08-25 |
| A procedural sky cannot be art-directed, because its failures are structural | **§19**, the 2026-08-13 abandonment | True of THAT implementation — value-noise lattice, stationary fbm, one analytic gaussian for all large-scale structure. An authored multi-layer bake with hand-aimed features is a different technique, and C6 delivers blue and purple against true black — **§19** amendment 2026-08-27, `audits/reports/sky-cubemap-discovery-2026-08-27.md` |
| The carve technique is how a nebula gets its shape | `purple-nebula-complex.xml`, the canonical preset the first refinements copied | A carve removes almost everything from an additive stack that starts from black rather than from a full-sky wash: C2 did exactly that and measured p95 0.07. Coverage is controlled by `powerAmount` (exponent `1/powerAmount`), not by `shelfAmount` — **§19** amendment 2026-08-27 |
| The sky is too dark to judge, so brightness is the knob | the first brightness sweep | The gas is authored orders of magnitude below the stars: variant C at 10x reaches mean 1.82 while its stars hit max 247, near clipping. The fix is the ramp inside the bake, never `uSkyBrightness` — **§19** amendment 2026-08-27 |
| The scene has no bloom | `RenderPipeline.tsx`, three passes | Four passes; bloom sits between render and afterimage — **§19** |
| A click acts on the satellite the pointer is hovering | `createSatelliteFocus.ts` | It acts on what is under the event's coordinates — **§17** (the geo marker had the same rule until its removal, 2026-08-19) |
| Tap tolerance is per pointer type *on Earth* | **§17**, 2026-08-11 | Everywhere. Murcia had one threshold for both and swallowed district taps — **§25** |
| A lost WebGL context is unhandled | `production-readiness-vercel-2026-08-07.md` `P0-2`, open since 2026-08-07 | Detected, reported, and said out loud in Spanish — **§23** |
| Each consumer builds its own Draco/KTX2 loader | `createAssetLoader`, `loadLogoAssets`, `createSatellite` | One of each, reference counted, in `graphics/` — **§24** |
| The Earth ships one set of 4096 maps to every device | `EarthScene.tsx` | Two sets, media-gated at 767px like the sky — **§25** |
| The renderer takes R3F's defaults | `SceneCanvas.tsx`, `gl={{ antialias: true }}` | `alpha: false` and an explicit `dpr`, so the cap has an owner again — **§25** |
| A loading timeout can never end the wait | plan 007 Phase 4, `boot.ts` | It can, but only as a **failure**, never as ready — **`adr/007`** |
| `CustomCursor` is Earth-only | `integration/00-migration-log.md`, P4 | Mounted for the whole session — **§14** |
| The 3D logo gets its own renderer | the Earth prototype's "The 3D logo gets its own renderer" | Overlay pass on the shared renderer — **§2**, `adr/002` |
| One `THREE.Scene`, two environments | The Murcia prototype's memory, since folded into `PROJECT_MEMORY.md` | Two Scenes — **§3**, `adr/001` |
| Murcia always bypasses the composer | `adr/001` | Bypasses it *except during a warp* — **§7**, `adr/005` |
| The city loader needs only Draco | `createAssetLoader.ts` | The shared KTX2 transcoder is attached too, before any texture exists — a GLTFLoader without one *rejects* a Basis image rather than degrading, and the production trim set has to be compressed to fit the iOS budget — **`murcia/blender-export-contract.md` §6.5** |
| Blender owns every sampling property of a texture | plan 001, *Blender decides WHERE the texture is sampled* | It owns all of them except wrapping. The banded trim atlas needs `wrapS = Repeat` with `wrapT = ClampToEdge`, and Blender's Image Texture *Extension* is one setting for both axes — so `configureTrimTextures` in `loadCity.ts` expresses what the export had no way to say — **`blender-export-contract.md` §6.3** |
| The trim sheet arrives inside the GLB | plan 001 Phase 7, `blender-export-contract.md` §6.5, *"this is a file swap"* | It is served from `/textures/murcia/` and put onto the material at load. Embedding it makes every colour change a re-export of 1.29 MB of Draco geometry, and the sheet will be iterated dozens of times before anyone is happy with it. It costs nothing to move: the GLB declares zero materials, so the runtime has to build the city's material either way — **`loadTrimSheet.ts`, `applyTrimSheet.ts`, plan 009 Phase 4** |
| The runtime must not create materials for the city | plan 001 Phase 4, *"Prevent Existing Runtime Material Overrides"* | Only while the export has none to override. `GLTFLoader` fabricates one `metalness: 1` default for all 222 primitives, which is nobody's authored intent and is most of why the city read as grey. The rule survives where it was aimed: the moment the export ships a material, `applyTrimSheet` stops replacing it and dresses it instead — **`applyTrimSheet.ts`** |
