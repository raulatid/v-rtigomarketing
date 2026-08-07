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
| `PROJECT_MEMORY.md` | Durable facts: what exists, the numbers that keep mattering, the traps. |
| `integration/00-migration-log.md` | The execution record, phase by phase. History, not policy. |
| `ARCHITECTURE.md` | The architecture as it should be. Binding. |
| `ENGINEERING_PRINCIPLES.md` | How to work in this repo. Binding. |
| `earth/DECISIONS.md`, `murcia/PROJECT_MEMORY.md` | **Inherited** from the two source prototypes. Still authoritative for behaviour inside their own experience. Where they conflict with this file, this file wins, and the entry below says so. |

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

**Supersedes** `murcia/PROJECT_MEMORY.md` §2.2, which mandated a single shared Scene. That
was written when "the other environment" meant another *city*, not a React-reconciled R3F
scene. Its renderer/canvas/loop clauses are honoured exactly; only the one-Scene clause is
overridden.

**Why.** A shared Scene breaks on Murcia's own documented rules: a detached-but-present root
is still walked by raycasts, `Box3.setFromObject` and `traverse` (§2.4), and lights and fog
are Scene-global (§2.3) — Earth's two lights and Murcia's two would cross-light each other's
world permanently.

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

## 7. The Earth ⇄ Murcia transition is the intro's warp, as a dolly

→ **`adr/005-warp-transition.md`**

**Decided.** One progress value read through the intro's three curves with their nested
widths — position full, speed ±0.34, flash ±0.17 — rather than a second motion vocabulary.
The departing world dollies in and accelerates; the cut lands under the closest, most
covered frame; the arriving world pulls back out.

**The shape was forced, not chosen.** Murcia's camera may never pull back past distance
**165** (see PROJECT_MEMORY, *The number that can hurt you*). So the arrival cannot come
from far away — it must start close and pull back. That *is* the dolly-out.

**Ruled out.** Any Murcia camera distance above 165, at any point, even for a frame. Any FOV
increase on Murcia. Both spend a skirt margin that was measured, not estimated.

**How you would know it broke.** `npm run check:warp` fails.

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

On the Murcia side the dolly owns `distance` only; `DragPanController` owns focus and yaw.
They compose without either taking external control.

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

**Exempt:** the `?debug=1` overlay's field labels, which are a developer tool and are
referenced by name in `murcia/PROJECT_MEMORY.md`.

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

## Superseded

| Decision | Was | Now |
|---|---|---|
| The 3D logo gets its own renderer | `earth/DECISIONS.md:256` | Overlay pass on the shared renderer — **§2**, `adr/002` |
| One `THREE.Scene`, two environments | `murcia/PROJECT_MEMORY.md` §2.2 | Two Scenes — **§3**, `adr/001` |
| Murcia always bypasses the composer | `adr/001` | Bypasses it *except during a warp* — **§7**, `adr/005` |
