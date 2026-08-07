# Decisions

The decisions that shape this project, and what is true **now** as a result.

Last updated: 2026-08-07 · current at commit `85a419a`

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
| `earth/DECISIONS.md` | **Inherited** from the Earth prototype. Still authoritative for behaviour inside that experience. Where it conflicts with this file, this file wins, and the entry below says so. |
| `murcia/blender-export-contract.md` | What the runtime reads out of the GLB and what must be true in the `.blend`. Read before any re-export. |

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

**Inherited and upheld** — `earth/DECISIONS.md:61`, described there as "the single most
important visual principle in the project".

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

**Inherited and upheld** — `earth/DECISIONS.md:470`. Two writers per frame is the failure
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
publish through a manager of its own; Earth's geo markers, which had never been converted
despite `earth/DECISIONS.md` saying otherwise, now share the manager `InteractionLayer`
creates. The native write survives underneath as the coarse-pointer fallback.

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

**Inherited and upheld** — decided in the Murcia prototype before either direction of the
warp existed, and recorded here because its own memory has since been folded into
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

→ **`audits/production-readiness-vercel.md`**, **`adr/007-loading-has-a-deadline.md`**

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

## Superseded

| Decision | Was | Now |
|---|---|---|
| A loading timeout can never end the wait | plan 007 Phase 4, `boot.ts` | It can, but only as a **failure**, never as ready — **`adr/007`** |
| `CustomCursor` is Earth-only | `integration/00-migration-log.md`, P4 | Mounted for the whole session — **§14** |
| The 3D logo gets its own renderer | `earth/DECISIONS.md:256` | Overlay pass on the shared renderer — **§2**, `adr/002` |
| One `THREE.Scene`, two environments | The Murcia prototype's memory, since folded into `PROJECT_MEMORY.md` | Two Scenes — **§3**, `adr/001` |
| Murcia always bypasses the composer | `adr/001` | Bypasses it *except during a warp* — **§7**, `adr/005` |
