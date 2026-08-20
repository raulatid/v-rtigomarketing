# Architecture, Complexity & Refactoring — 2026-08-20

**Date:** 2026-08-20 · **Against:** working tree at `a207f2b`
**Brief:** `audits/architecture-complexity-refactoring.md`

**First pass in this lineage.** Every other brief in `docs/audits/` has at least one dated report;
this one had none. There is nothing to delta against, so everything here is stated in full. Later
passes should treat this as the baseline and say where they disagree.

The tree audited is the working tree, not `a207f2b` itself: roughly sixty files are uncommitted,
including two structural changes still landing — `app/navigation/` (ADR 009, accepted 2026-08-19)
and the root `content/` build (ADR 010, accepted 2026-08-20). Both are treated as intended
architecture, not as work in progress, because both have accepted ADRs.

---

## 0. Verified baseline

Nothing in this report is hand-derived where the repository already asserts it. Full run,
2026-08-20:

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run test` (vitest) | **593 tests, 35 files, all pass** |
| `check:architecture` | 18/18 — **129 modules, 346 relative imports** walked, acyclic |
| `check:audit` | 16/16 |
| `check:navigation` | 52/52 |
| `check:footprint` | 8/8 |
| `check:district` | 68/68 |
| `check:warp` | 36/36 |
| `check:space` | 29/29 |
| **`check:asset`** | **6/9 — 3 FAILED. Not part of `check:harnesses`.** See P2-5. |
| `VERTIGO_SKIP_BUDGETS=1 vite build` | pass — app entry **316,247 B of a 320,000 B budget (98.8%)** |

Two corrections the report owes the brief, both verified above:

- The brief's Phase 1 names "five sibling harnesses". There are **six** gated siblings
  (`audit`, `navigation`, `footprint`, `district`, `warp`, `space`) alongside `architecture`, and a
  **seventh, `city-asset.ts`, that is not gated at all and does not pass**.
- Phase 27 says "the six `checks/` harnesses". There are eight files in `checks/` (seven harnesses
  plus `lib/`).

**The entry chunk has 3,753 bytes of headroom.** ARCHITECTURE §17's note on what the import graph
cannot tell you is not a historical anecdote; it is the current operating condition.

---

## 1. Executive architecture assessment

### Healthy but accumulating complexity

This is a genuinely well-built codebase, and the classification is not a hedge. The evidence for
"healthy" is unusually concrete: dependency rules are executable rather than documented, resource
disposal is deliberate down to `UnrealBloomPass`'s five mip targets, the render authority is
singular and says so, and 227 harness assertions cover behaviour no type system reaches. Modules
like `graphics/`, `app/navigation/` and the root `content/` pipeline are textbook deep modules —
small interfaces over substantial hidden complexity, with the reasoning preserved in the file rather
than in a commit message.

The qualification is specific, and it is the finding this report is really about:

> **Complexity is accumulating precisely where the enforcement cannot see.**

`checks/architecture.ts` exists because "a rule that only lives in this file is a rule the code will
drift past." That argument is correct and it has been applied unevenly. The harness matches on
**directory prefixes**, so its reach is a property of where a file sits rather than of what it does.
Thirty of the 129 modules under `src/` — `components/` (14), `app/` (12), and four at the `src/`
root — are the source of no rule at all. Two of those thirty are experience layers and one is shared
mutable state that an experience reads every frame.

The result is not yet damage. It is that the strongest guarantee in the repository has a shape, and
code has begun to collect in the places the shape does not cover. Nothing here requires
restructuring. Most of it is answered by extending harnesses that already run.

**What is not wrong, and should not be reported as such by a future pass:** the two experiences
having different lifecycle shapes (ADR 003, ARCHITECTURE §7); both worlds staying permanently
mounted (ADR 001/003); `active` being a boolean rather than a lifecycle phase (ADR 003); Murcia
bypassing the composer (ADR 001/005); the transition driving no camera (ADR 005); `orbitId` living
in scene code rather than in content (ADR 010). All were argued and settled.

---

## 2. Current architecture map

### 2.1 Layers, as they actually are

```text
index.html
├── intro-draw/            boot entry — separate Rollup input, 14,057 B, imports NOTHING (7 modules)
└── main.tsx → App.tsx     application orchestration
    ├── app/                 experience id, transition, warp curves, navigation   (12)
    ├── components/          chrome + the render host + two experience layers     (14)
    ├── experiences/earth/   R3F component tree                                   (37)
    ├── experiences/murcia/  class, own THREE.Scene                               (31)
    ├── graphics/            render pipeline, decoders, disposal, context loss     (7)
    ├── content/             types, invariants, lookup, generated collections      (6)
    ├── corner-logo/         application chrome, overlay pass                      (4)
    ├── interaction/ utils/ loading/                                               (7)
    └── (src root)           App.tsx, main.tsx, auditView.ts, glsl.d.ts            (4)

content/  (repository root, Node-only)  →  emits the generated collections  [build output, gitignored]
```

129 modules, 346 relative imports, no cycles.

### 2.2 Ownership, per module that owns something

| Module | Owns | Mutable state | Resources | Consumers |
|---|---|---|---|---|
| `App.tsx` | Application orchestration **and Earth's intro sequencing** | `activeExperience`, 4 overlay flags, `config`, `replayKey`, `selectedCase`, `contextLost` | one `keydown` listener | root |
| `graphics/RenderPipeline.tsx` | The single render authority | none | `EffectComposer` + 4 passes, context-loss listener | `SceneCanvas` |
| `graphics/decoders.ts` | Draco + KTX2 worker pools | two ref counts | 2 worker pools | Murcia, corner logo, satellites |
| `app/useExperienceTransition.ts` | The Earth⇄Murcia warp | writes into **Earth's** `SequenceState` | one GSAP timeline, visibility listener | `App` |
| `app/navigation/createNavigationInput.ts` | **The only wheel authority** | gesture, machine, spring | 6 listeners + **its own rAF** | `useSceneNavigation` |
| `MurciaExperience` | City lifecycle, composition, disposal | rig, controller, districts, warp pose | own `THREE.Scene`, GLTF, `pointerup` | `MurciaLayer` |
| `DistrictInteraction` | One district's 4-state machine | state, hover, flight | **4 canvas + 1 window listener each** | `MurciaExperience` |
| `EarthExperience` | Earth composition and layer order | none (props) | none | `SceneCanvas` |
| `intro-draw/boot.ts` | Boot, readiness, the drawing | `BootState` | rAF, own DOM | `window.__vertigoIntro` |
| `src/auditView.ts` | Audit-panel scene recomposition | **module-level singleton** | none | written by `components/`, read by **Earth** |
| `interaction/cursorSignal.ts` | Cursor hint fan-out | **module-level singleton + listener set** | none | `CustomCursor` |

### 2.3 Frame loops — inventoried, because §11 asks

Three loops can be live at once, all deliberate, none permanent:

1. **R3F's** — the render authority. Ten `useFrame` callbacks; `RenderPipeline` at priority 1.
2. **`createNavigationInput`'s rAF** — starts on first input, stops when travel, cooldown and
   spring are all settled. An idle Earth costs zero frames here.
3. **`CustomCursor`'s rAF** — wakes on `pointermove`, stops inside a 0.1 px² settle epsilon.

`intro-draw` and `DebugOverlay` each own a fourth, both bounded (boot handover; `/debug` only).
No invariant is broken. **ARCHITECTURE §11 and §29 have not been updated to say so** — see P3-3.

---

## 3. Complexity hotspots

Ranked by the brief's three symptoms.

| # | Area | Amplification | Cognitive load | Unknown unknowns |
|---|---|---|---|---|
| 1 | **The enforcement boundary itself** (`checks/architecture.ts` prefixes; root `content/` unwalked) | high | low | **highest** |
| 2 | **`App.tsx`** — orchestration + Earth intro + four overlay flags | high | high | medium |
| 3 | **The four global-publish channels** (`SequenceState`, `auditView`, `cursorSignal`, `window.__vertigoIntro`) | low | medium | **high** |
| 4 | **Platform/capability detection** — no owner, 12 sites | medium | low | medium |
| 5 | **`DistrictInteraction` + `DragPanController`** (1,345 lines, 16-field deps, per-district listeners) | medium | high | low |
| 6 | **Documentation surface** — 5,975 lines of docs + 7,129 comment lines vs ~13,500 code lines | low | low | medium |

Hotspot 6 needs care. The comment density (35% of `src/`) is not a defect — PRINCIPLES §24 asks for
exactly these comments and they are overwhelmingly *why*, not restatement. The risk is arithmetic:
at roughly 1:1 prose-to-code, drift is the default outcome and only a harness prevents it. Three
concrete drifts are recorded in P3-3.

---

## 4. Refactoring findings

---

### P1 — Architectural liability

---

#### P1-1 · The dependency harness matches directories, so two experience layers and one shared global sit outside every rule

**Files:** `checks/architecture.ts` (lines 71–83, 85–163) · `src/components/MurciaLayer.tsx:5` ·
`src/components/CornerLogoLayer.tsx` · `src/components/SceneCanvas.tsx:15` · `src/auditView.ts`

**Current responsibility.** `forbid(label, fromPrefix, toPrefix, why)` scans modules whose path
starts with `fromPrefix`. Every rule is therefore a statement about a *location*.

**Complexity mechanism.** `MurciaLayer.tsx` is Murcia's R3F host: it constructs the experience,
drives its frame, applies its warp pose and owns its DOM container. It is Murcia in every sense
except its path. It imports Earth:

```ts
// src/components/MurciaLayer.tsx:5
import type { SequenceState } from '../experiences/earth/config/sequenceState'
```

The rule `murcia does not import earth` passes, because the rule reads `src/experiences/murcia/`.
`SceneCanvas.tsx:15` does the same thing with `CornerLogoHandle`, imported out of
`experiences/earth/timeline/useMasterTimeline`, on behalf of a corner logo that ADR 002 explicitly
classifies as *not part of either experience*.

`src/auditView.ts` is worse in kind: it is a module-level mutable object written by
`components/AuditSection.tsx` and read **per frame** by two Earth layers
(`camera/AuditCameraShift.tsx:40`, `interaction/InteractionLayer.tsx:138`). Sitting at the `src/`
root, it is the source and target of no rule, and could import anything at all.

**Why the abstraction leaks.** The harness's own header says it is "deliberately a source-level
check rather than a bundler one" so it can name the offending file. That is right. What it encodes
is *where a file lives*, and it is being asked to guarantee *what a file is*. Those agreed when it
was written and no longer do.

**Concrete amplification.** Moving `MurciaLayer.tsx` to `src/experiences/murcia/` — the move that
makes its name true — **fails `check:architecture` immediately**, on the import above. The rule was
always being violated; the file was simply standing outside the room. Any future contributor who
tidies `components/` will discover this as a build failure with no context.

**Proposed owner.** The layers belong to their experiences: `experiences/murcia/MurciaLayer.tsx`
and `experiences/earth/CornerLogoLayer.tsx` — or, for the logo, `corner-logo/`, which already has a
rule. `src/components/` keeps only DOM chrome.

**Proposed boundary.** Two things, in this order:

1. Add a **positive** rule to `checks/architecture.ts`: nothing may live at the `src/` root except
   `App.tsx`, `main.tsx` and ambient declarations. That single assertion makes the unreachable
   region unreachable.
2. Resolve the import the move exposes, by way of P2-1 (`transitionProgress` leaving Earth's state
   object). Then perform the move; the existing rules then cover both layers for free.

**Expected reduction.** `murcia → earth` becomes true rather than true-by-location. The number of
modules the harness cannot reason about falls from 30 to ~26 (`app/` legitimately remains, as the
top of the arrow).

**Migration risk.** Low for the harness rule (additive, one assertion). Medium for the file moves —
they are pure moves, but they must follow P2-1 or they cannot be made green.

---

#### P1-2 · The newest architectural boundary is the only one with no harness at all

**Files:** `checks/architecture.ts:22` (`const SRC = 'src'`) · `content/` (root, 13 modules) ·
`src/content/invariants.ts` · `docs/adr/010-content-is-generated-at-build-time.md`

**Current responsibility.** ARCHITECTURE §3 states the rule plainly:

> the arrow points `content/ → src/content/` and never back — anything `src/content/` reached for
> would be bundled for Node by esbuild, which is how `fetch`, `fs` or a DOM global would arrive
> somewhere none of them exist.

`src/content/invariants.ts` restates it as a file-level contract: "Pure by rule: no Node APIs, no
DOM, no imports beyond types."

**Complexity mechanism.** `checks/architecture.ts` walks `listSources('src')` and nothing else. The
three `content/` rules it does have all constrain `src/content/` as a *source* (must not import
experiences, app, graphics). **None of the following is checked by anything:**

- `src/content/` importing `node:fs`, `node:path` or any Node builtin
- `src/content/` touching a DOM global
- root `content/` importing `src/experiences/`, `src/app/` or `src/graphics/`
- root `content/` being reachable from the browser bundle at all

**Why the abstraction leaks.** ADR 010 was accepted **today**, and its failure mode is the one the
document itself calls out: a module bundled for the wrong runtime. The harness that exists to stop
documented rules drifting was not extended to the newest documented rule. The check's own header
supplies the argument against this: two rules "had already been broken… and both were found by
reading the code rather than by anything failing."

**Concrete amplification.** Adding the next collection — the extension point
`content/collections/index.ts` advertises — means a new mapper in `content/collections/`, a type in
`src/content/types.ts` and predicates in `src/content/invariants.ts`. A predicate that reaches for
`node:crypto` to hash an id compiles, passes `tsc`, passes every harness, passes vitest (the unit
tier runs `content/**` in Node), and fails at **runtime in the browser** — the one place nothing
tests. Nothing between the edit and production says no.

**Proposed owner.** `checks/architecture.ts`. Widening the walk is a handful of lines: it already
resolves relative specifiers and already reports file plus specifier.

**Proposed boundary.** Three assertions:

- `src/content/` imports no bare specifier beginning `node:` and references no DOM global
- root `content/` imports nothing under `src/` except `src/content/`
- no module under `src/` outside the generated collections' consumers imports root `content/`

**Expected reduction.** The one boundary whose violation is silent and runtime-only becomes a named
build failure. The extension point becomes safe to use by someone who has not read ADR 010.

**Migration risk.** None. Purely additive; the rules pass today.

---

### P2 — Important improvement

---

#### P2-1 · `SequenceState` is Earth's intro state and the application's transition channel at the same time

**Files:** `src/experiences/earth/config/sequenceState.ts:18,22` ·
`src/app/useExperienceTransition.ts:3,74,114` · `src/components/MurciaLayer.tsx:5,187` ·
`src/components/SceneCanvas.tsx:11,73` · `src/experiences/earth/camera/CameraController.tsx:88`

**Current responsibility.** The file's own comment: "Continuous values shared between the GSAP
master timeline and the R3F render loop." Eight of its fields are Earth's intro. Two —
`transitionProgress`, `transitionOverlay` — are the application's.

**Complexity mechanism.** The two application fields are **written by `src/app/`** and **read by
Murcia's layer**. So the object is created in `App.tsx`, its type is defined three directories deep
inside Earth, and its most cross-cutting values are owned by neither. The file acknowledges this
inline ("Owned by the transition controller, not the intro timeline") — the ownership is documented
where it cannot be enforced.

**Why the abstraction leaks.** ADR 005 is emphatic that the transition "drives no camera" so that
"Earth and Murcia still know nothing about each other". The mechanism chosen to carry that progress
is a data structure that *belongs to Earth*. The decision is right; the container undermines it.

**Concrete amplification.** This is the import that blocks P1-1: `MurciaLayer` cannot move into
`experiences/murcia/` while its type comes from `experiences/earth/`. It also means any change to
Earth's intro state — adding a phase field, renaming an overlay contributor — touches a type that
Murcia's per-frame path depends on.

**Proposed owner.** `src/app/`. A small `TransitionState` (`progress`, `overlay`) created by
`App.tsx` and passed to `useExperienceTransition`, `MurciaLayer`, `SceneCanvas` and
`CameraController` alongside `SequenceState` rather than inside it.

**Proposed boundary.** Earth's `SequenceState` loses two fields. `CameraController`'s
`Math.max(warpOverlay, swapOverlay, transitionOverlay)` becomes a max over two objects — the same
arithmetic, with the third contributor arriving from the layer that owns it.

**Expected reduction.** Murcia stops importing Earth, in fact and not only by path. The transition's
ownership stops being a comment. The `max()` rule keeps its single site.

**Migration risk.** Low–medium. Mechanical, touches five files, and `check:warp` (36 assertions,
including "both worlds return exactly to rest" at p=0 and p=1) already covers the behaviour that
could break.

---

#### P2-2 · Four different mechanisms solve the same problem: publish a value to a per-frame reader without a React render

**Files:** `src/experiences/earth/config/sequenceState.ts` · `src/auditView.ts` ·
`src/interaction/cursorSignal.ts` · `src/loading/progress.ts` (via `window.__vertigoIntro`)

**Current responsibility.** All four exist for one reason, stated almost identically in each:
per-frame values must not become React state. Each solves it differently.

| Channel | Mechanism | Writer | Per-frame reader |
|---|---|---|---|
| `SequenceState` | object passed by reference | timeline, transition | 8 Earth layers, Murcia, pipeline |
| `auditView` | **module-level mutable singleton** | `components/AuditSection.tsx` | 2 **Earth** layers |
| `cursorSignal` | **module singleton + pub/sub** | two `CursorManager`s | `CustomCursor` |
| `loadProgress` | **browser global** `window.__vertigoIntro.boot` | scene, logo, city | boot's own loop |

**Complexity mechanism.** PRINCIPLES §16 names this exactly: "do not arbitrarily mix callbacks /
custom events / polling / global state / promises for equivalent asynchronous responsibilities."
Each choice is defended in its own file, and each defence is sound in isolation —
`window.__vertigoIntro` in particular is genuinely load-bearing, because a static import would hoist
`intro-draw` into a shared chunk and fail the standalone assertion in `vite.config.ts`. Nobody has
looked at all four together.

**Why the abstraction leaks.** Two of the four are *invisible in the type system*. `auditView.open`
is a dependency of Earth's satellite selection (`InteractionLayer.tsx:138`) that appears in no prop,
no ref and no import graph rule. A developer changing the audit panel has no signal that satellite
picking depends on it — which is precisely the failure `auditView.ts`'s own header records happening
once already ("nothing wrote false again once the phase reached 'closed'… satellite selection stayed
dead with it").

**Concrete amplification.** Adding a fifth overlay that must recompose the scene means choosing one
of four patterns with nothing to guide the choice, and the cheapest — another module singleton — is
the one with no discoverability at all.

**Proposed owner.** Do **not** build a fifth, unified mechanism; that is the speculative framework
PRINCIPLES §14 forbids. Instead: **write the rule down and make one of the four the default.**
`SequenceState`'s passed-object shape is the right default — it is typed, it appears in the import
graph, and its lifetime is the component tree's.

**Proposed boundary.** A short section in `ARCHITECTURE.md` §14 naming the four channels, what each
is for, and which to reach for; plus folding `auditView` into the passed-object pattern, since its
two readers are both inside `EarthExperience` and already receive props.

**Expected reduction.** One fewer invisible cross-layer dependency. A stated default removes the
per-decision cost for the next contributor.

**Migration risk.** Low. `auditView`'s writer/reader set is three files and `shiftsFor` — the actual
policy — is already pure and unit-tested.

---

#### P2-3 · Platform and capability knowledge has no owner; ARCHITECTURE §15 names the owner that was never built

**Files:** 12 sites. Reduced motion: `app/warpTransition.ts:180` (the helper),
`app/navigation/createNavigationInput.ts:106`, `components/AuditSection.tsx:258`,
`components/CustomCursor.tsx:46`, `experiences/earth/timeline/useMasterTimeline.ts:53`,
`experiences/murcia/MurciaExperience.ts:492`, `intro-draw/boot.ts:52`. Touch:
`murcia/interaction/DistrictInteraction.ts:148` `(hover: none)`, `murcia/ui/districtLabel.ts:28`
`(hover: none)`, `murcia/ui/overlays.ts:84` `(pointer: coarse)`, `components/CustomCursor.tsx:33`
`(pointer: fine)`. Breakpoint: `components/AuditSection.tsx:30`,
`experiences/earth/config/earthConfig.ts:37`, `experiences/earth/scene/space/spaceConfig.ts:112`,
`experiences/murcia/ui/districtPanel.ts:31`, plus `styles.css` and `murcia.css`.

**Current responsibility.** Nothing owns it. ARCHITECTURE §15 lists `graphics/capabilities/` and
"GPU capability detection" among shared responsibilities. That directory does not exist.

**Complexity mechanism.** Three separate duplications, each with a different failure shape:

1. **Reduced motion, seven sites, three spellings.** A correct owner exists —
   `prefersReducedMotion()` in `app/warpTransition.ts` — and **four of the seven bypass it**,
   including `createNavigationInput.ts`, which is in the same directory tree. The guards are not
   equivalent: `warpTransition`, `createNavigationInput` and `MurciaExperience` test
   `typeof matchMedia === 'function'` first; `AuditSection`, `CustomCursor` and `useMasterTimeline`
   do not, and throw where it is absent.

2. **"Is this a touch device", three sites, three different questions.** `(hover: none)`,
   `(pointer: coarse)` and `(pointer: fine)` are not synonyms — a touchscreen laptop answers them
   inconsistently. Three modules make the same product decision on three different predicates.

3. **The mobile breakpoint, written five times.** 767 in `earthConfig.ts` and again in
   `spaceConfig.ts`; 768 in `AuditSection.tsx` and again in `districtPanel.ts`; 767/768 in two
   stylesheets. `earthConfig.ts:32` says it out loud: "`narrowMaxWidth` is deliberately the same 767
   the sky panorama and the CSS use" — a comment doing the job of an owner. All four TS sites read
   `window.innerWidth` at different moments, so they can also disagree across a resize.

**Why the abstraction leaks.** This is the §4 case exactly: implementation knowledge with no
authoritative owner, duplicated until the copies stop agreeing. Two of the three already do not.

**Concrete amplification.** Scenario 8 (add another device capability rule) currently means finding
every site by grep and choosing, per site, which of three predicates to match. Moving the breakpoint
means five edits in three languages, and missing one is silent.

**Proposed owner.** A single `src/platform/` leaf module — the directory ARCHITECTURE §15 already
anticipates, at the layer `utils/` occupies. It should expose *product questions*, not media
queries: `prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`, and the breakpoint
constant the stylesheets are asserted against.

**Proposed boundary.** Each predicate resolves the query once and answers a domain question.
`intro-draw/boot.ts` is exempt and must stay so — it may import nothing (asserted by
`checks/architecture.ts` §3 *and* by the emitted bundle).

**Expected reduction.** Twelve sites become one. Callers stop knowing which media query encodes
which product decision — the §5 test. Adds one `forbid`-adjacent rule: `platform/` imports nothing
but types.

**Migration risk.** Low, with one real trap: the three unguarded `matchMedia` calls change behaviour
under jsdom. `AuditSection.test.tsx` runs in jsdom and must be checked.

---

#### P2-4 · "Something has the viewer's attention" is written three times in `App.tsx`, and one of the three fails silently

**Files:** `src/App.tsx` — the `canNavigate` predicate, the `navigationContextChanged` effect
dependency array, and the global Escape handler.

**Current responsibility.** Nothing owns the concept. Four React flags — `auditOpen`, `contactOpen`,
`legalDoc`, `selectedCase` — plus one imperative source (`murciaRef.current?.hasFocusedDistrict`)
express it, and three separate expressions enumerate them:

- `canNavigate`, which refuses a warp while any is set
- the effect dependency array that calls `navigationContextChanged()` when any changes
- the Escape handler, which stands down while any is set

**Complexity mechanism.** The same list, three times, in three orders. Two of the three failure
modes are loud; the third is not. If a fifth overlay is added to `canNavigate` and forgotten in the
dependency array, `canNavigate` is correct but the **rail is never repainted** — it goes on
advertising a navigation the context refuses. `App.tsx` records this having already happened: "it
used to sit fully visible behind every open panel."

**Why the abstraction leaks.** The predicate is derived state with no owner, so it is re-derived at
each use site. The one use site that is a *notification* rather than a *value* cannot be checked by
the compiler, which is what makes the failure silent.

**Concrete amplification.** Every new overlay costs three coordinated edits, one of which fails
quietly. The site already has four such overlays and is a marketing page that will gain more.

**Proposed owner.** `App.tsx`, but as one value: a `useMemo`'d `attention` object, or a small
`useAttention()` hook holding the four flags and exposing `{ anyOpen, closeAll }`. The dependency
array then names the object, and adding a flag means adding it to the hook and nowhere else.

**Proposed boundary.** `canNavigate` reads
`!attention.anyOpen && !murciaRef.current?.hasFocusedDistrict`. The Escape handler reads
`!attention.anyOpen`. The effect depends on `attention`.

**Expected reduction.** Three coordinated edits become one. The silent failure becomes structurally
impossible rather than remembered.

**Migration risk.** Low, and `e2e/navigation.spec.ts` covers the rail's suppressed state.

---

#### P2-5 · `check:asset` is outside the gate and is currently failing

**Files:** `package.json:17,25` · `checks/city-asset.ts` (310 lines) ·
`public/models/city-prototype.glb` · `public/models/city-backdrop.glb` (added, unchecked)

**Current responsibility.** `check:harnesses` chains seven harnesses. `check:asset` is defined and
not chained.

**Complexity mechanism.** Run manually today it reports **6/9, 3 failed**:

- `every primitive carries TEXCOORD_0` — 73 of 257
- `nodes carry glTF extras` — none; "Include → Custom Properties" was unchecked on export
- `at least one node tagged district=` — none, so `resolveDistrict` falls back to node names

Those three failures are the runtime contract behind `cityDistrictBindings.ts`, whose `tag` field is
documented as "the target identity mechanism" while `nodeNames` is the fallback. The asset has never
satisfied the primary mechanism, and the only thing that says so is a command nothing runs.

The harness also checks `city-prototype.glb`. The working tree adds `city-backdrop.glb`, which no
harness inspects at all.

**Why the abstraction leaks.** This is the failure `checks/architecture.ts` was written to prevent,
one level up: a rule that exists, is executable, and is not wired to anything. A harness outside the
gate is a document with a shebang.

**Concrete amplification.** Every re-export of the city from Blender can silently drop UVs,
instancing or custom properties, and the first symptom is a district that "is inert" — logged to a
console nobody has open in production.

**Proposed owner.** `check:harnesses`, with the failures either fixed at the asset or converted to
explicitly-pending assertions that name what is missing and why.

**Proposed boundary.** Two changes: chain `check:asset` into `check:harnesses`, and parameterise the
model path so both GLBs are covered.

**Expected reduction.** The asset export contract (`docs/murcia/blender-export-contract.md`) becomes
enforced rather than described.

**Migration risk.** **Medium, and this is the one finding that cannot simply be applied.** Chaining
it today turns `npm run check` red, which fails `npm run build`, which fails the Vercel build. It
must be sequenced: decide per failure whether the asset is fixed or the assertion is restated, then
chain. Do not chain first.

---

#### P2-6 · `app/warpTransition.ts` is a pure curve module living in the orchestration layer, and it blocks a broader rule — as the harness already records

**Files:** `checks/architecture.ts:153–163` (the note) · `src/app/warpTransition.ts` ·
`src/experiences/earth/camera/CameraController.tsx:14` ·
`src/experiences/earth/scene/SpaceBackdrop.tsx:7`

**This is not a discovery.** `checks/architecture.ts` states it in full, under the heading
"NARROWER THAN IT SHOULD BE", and names the fix. It is ranked here because it is a real constraint
on the enforcement, not because it is unknown.

**Current responsibility.** `warpTransition.ts` holds pure curves — `cinematicTravel`,
`cinematicSpeed`, `narrowPeak`, `flash`, `dollyAmount`, `motionBlur` — plus
`prefersReducedMotion()`. No DOM, no React, no state.

**Complexity mechanism.** The rule that belongs in the harness is ARCHITECTURE §17's stated
direction: *no experience imports the application layer*. It cannot be written, because both Earth
layers import `app/warpTransition` deliberately and correctly (ADR 005 has each experience read the
progress and move its own camera). The harness settles for the narrower "no experience imports
`app/navigation/`".

**Concrete amplification.** Until it moves, an experience may import anything under `src/app/` and
nothing will object — including, in future, orchestration state that genuinely does couple the two
worlds.

**Proposed owner.** `src/utils/`, which already has a `does not import the application layer` rule
and is the correct home for a pure curve library. `prefersReducedMotion()` goes to `platform/` under
P2-3 instead — it does not belong in a curve module either, which is a naming problem in its own
right (Phase 25).

**Proposed boundary.** After the move: replace the narrow rule with
`forbid('no experience imports the application layer', 'src/experiences/', 'src/app/')`.

**Expected reduction.** One broad rule replaces one narrow one, and the widest remaining hole in
§17's enforcement closes.

**Migration risk.** Low. A path change in five files plus one harness edit; `check:warp` (36
assertions over exactly these curves) and `warpTransition.test.ts` (14 tests) both cover it.

---

### P3 — Opportunistic improvement

---

#### P3-1 · Three modules silently dropped out of the coverage gate when their files moved

**Files:** `vitest.config.ts` — coverage `include` names `src/sceneVisibility.ts`,
`src/sequenceState.ts`, `src/orbit-system/geoUtils.ts`. **None of the three exists.** They are now
`experiences/earth/config/sceneVisibility.ts`, `experiences/earth/config/sequenceState.ts` and
`experiences/earth/orbit/geoUtils.ts`.

All three still have tests — 221, 3 and 7 respectively, all passing — and all three are **absent
from the coverage report**, verified by running `npx vitest run --coverage`. The 85/80/85/85
thresholds are computed over a set three modules smaller than the file claims.

The irony is instructive: this file already reasons about exactly this failure mode, arguing that
`.tsx` was added to `include` because omitting it gives "a green run that proves nothing". The same
thing arrived through a different door — file moves rather than file extensions.

**Fix:** correct the three paths. **Risk:** none, beyond possibly revealing that a threshold was
being met by absence.

---

#### P3-2 · `CameraRig`'s documentation says its obvious method is almost always the wrong one

**Files:** `src/experiences/murcia/camera/CameraRig.ts:56–76` and its five call sites.

`getPose()` returns the configured pose; `getEffectivePose()` folds in the flight's distance scale.
The doc comment on `getPose()` reads: *"Almost always the wrong one to read."*

That is PRINCIPLES §25 in one sentence. The consequences are visible: `MurciaExperience:678–679`
calls both, one line apart, for two fields of the same debug readout; `DistrictInteraction:333–334`
needed a five-line comment at the call site explaining which; `checks/district-flight.ts:487` needed
the same explanation again in the harness.

The names describe *provenance* (configured vs. effective) where callers ask a *question* (what is
the camera actually doing). Renaming to `configuredPose()` / `pose()` — making the safe one the
short one — costs six call sites and removes the trap. **Risk:** low; 68 assertions cover this rig.

---

#### P3-3 · Three concrete documentation drifts, on load-bearing text

1. **ADR 008 declares a contract that has since gained a third member.** Line 62 states
   `export type RenderRoute = 'composer' | 'direct'`. The shipped type in
   `graphics/renderableExperience.ts` has three: `'composer' | 'direct' | 'direct-composited'`.
   The third is the composer-borrowing route ADR 005 requires. ADR 008 extends ADR 005 and does not
   mention it; ADR 005 predates it. **The pipeline's public contract is misquoted in the ADR that
   defines it.**

2. **ARCHITECTURE §11 and §29 do not record the second application rAF.** §11 warns against
   accumulating loops "without explicit coordination" and §29 asserts "No uncontrolled permanent RAF
   loops exist". `createNavigationInput` owns a real, deliberate, self-stopping rAF (ADR 009). The
   invariant is *satisfied* — but a reader checking §11 against the code finds a loop the document
   does not name, and cannot tell intended from accidental. ADR 009 does not list it either.

3. **Two stale file paths in the docs.** `checks/navigation-zoom.ts` (renamed to
   `checks/footprint.ts` in this tree) and `src/space/pointSprite.ts` (now
   `experiences/earth/scene/space/pointSprite.ts`).

**Fix:** amend the three texts. A Stage-0 harness rule — assert every backticked repo path in
`docs/**` resolves — would have caught item 3 and costs about fifteen lines beside
`checks/audit-hygiene.ts`, which already walks Markdown.

---

#### P3-4 · `DistrictInteraction` is a deep module with a 16-field constructor, and its per-district cost is linear in a count that has never exceeded one

**Files:** `src/experiences/murcia/interaction/DistrictInteraction.ts:29–61,150–156` ·
`src/experiences/murcia/scene/cityDistrictBindings.ts` (one entry) ·
`src/experiences/murcia/MurciaExperience.ts:494–566`

The class is genuinely deep — a four-state machine, flight cancellation, panel, label, highlight and
a scoped raycast, behind `update`/`setEnabled`/`dispose`. It is **not** a shallow module and should
not be split. Two narrower observations:

- **The dependency object has 16 fields**, and seven of them (`camera`, `rig`, `getPose`,
  `getAspect`, `resolveBounds`, `groundPlaneHeight`, `focusFlight`) are one question: *how is the
  camera framed at this district?* That cluster is a missing owner — a `FramingContext` the
  experience constructs once and hands to every district — not sixteen unrelated parameters.

- **Cost is linear per district, in both listeners and raycasts.** Each instance attaches four
  canvas listeners plus one window listener in its constructor, and `MurciaExperience.update` runs
  `for (const district of this.districts) district.update(delta)` — one hover raycast each, per
  frame. With the single shipped binding that is 5 listeners and 1 raycast. The design is deliberate
  and well argued ("never the Scene"), but it has only ever run at N=1. At N=8 it is 40 pointer
  listeners and 8 raycasts per frame, and the crossover against a single scene-level raycast against
  a merged pickable set is somewhere in that range. It has not been measured, and PRINCIPLES §28
  says measure before optimising — so this is a **note to measure at N=3**, not a change to make now.

---

#### P3-5 · `src/components/` is a generic directory holding four unrelated kinds of thing

**Files:** `src/components/` — 14 modules.

It currently contains DOM chrome (`CasePanel`, `AuditSection`, `ContactSection`, `LegalPanel`,
`SiteFooter`, `NavigationRail`, `CustomCursor`, `CaseChart`), the render host (`SceneCanvas`,
`LazyScene`, `SceneErrorBoundary`), **two experience layers** (`MurciaLayer`, `CornerLogoLayer`) and
a dev tool (`DebugOverlay`).

Phase 26 asks whether the directory communicates architecture. It does not — and the cost is not
aesthetic, it is P1-1: the two experience layers are outside every dependency rule *because* the
directory is generic. Moving them (P1-1) and leaving the rest is sufficient; there is no case for
reorganising the chrome, which is coherent as it stands.

---

## 5. Required analysis scenarios

Files that must change today, against the real tree. "After" assumes P1-1, P1-2, P2-1, P2-3 and
P2-4 only.

| # | Scenario | Now | After | Notes |
|---|---|---|---|---|
| 1 | **Add another interactive district** | **2 files** — one entry in `cityDistrictBindings.ts`, one record in the content source | 2 | **Already excellent.** The binding table is a genuine data change. Caveats: the asset must carry the `district=` tag (P2-5 says it does not), and cost is linear (P3-4). |
| 2 | **Add another city** | **~14 files** — new experience dir, `ExperienceId` union, `App.tsx` state, `SceneCanvas` mount + route, `useExperienceTransition`, `navigationMachine.intentFor`, `isIntentLegal`, `towardOther`, `paint` direction, rail | ~12 | ADR 009 §3 designed the machine not to grow by scene, and it holds — but `ExperienceId` is a two-member union that four modules pattern-match as a binary. The third world is the change that turns six ternaries into six switches. Not a defect yet; the honest note is that "never grows by scene" is true of the *machine* and not of its edges. |
| 3 | **Change renderer quality policy** | **1–2 files** — `SceneCanvas`'s `gl`/`dpr`, `FrameSettings` | 1–2 | Clean. ADR 008's contract does its job; the pipeline takes numbers. |
| 4 | **Replace the camera transition implementation** | **~6 files** — `warpTransition.ts`, `useExperienceTransition`, `CameraController`, `MurciaLayer`, `murcia/camera/warpPose.ts`, `checks/warp-transition.ts` | ~6 | Inherent. ADR 005 deliberately spreads the *application* of one progress value across both worlds so neither knows the other. The six are conceptually related and the harness is one of them, which is correct. |
| 5 | **Add a post-processing effect** | **2 files** — `RenderPipeline.tsx`, `FrameSettings` | 2 | Clean, including disposal, which the pipeline enumerates by hand for exactly this reason. |
| 6 | **Change GLTF decoder infrastructure** | **1 file** — `graphics/decoders.ts` | 1 | **The best-factored change in the codebase.** Three call sites previously each owned a decoder; §6 was applied once and the knowledge has one home. |
| 7 | **Add a new type of clickable scene object** | **~5 files** — probe/interaction, cursor priority table in `interaction/cursorManager.ts`, content type, invariants, mapper | ~5 | The `PRIORITY` map is a small central policy that every new hover source must edit. That is correct centralisation, not amplification. |
| 8 | **Add another device capability rule** | **grep, then 3–12 sites** | **1–2** | The worst scenario today, and the one P2-3 fixes outright. There is no place to put the rule, so it goes wherever it is needed and diverges. |

Scenarios 1, 3, 5 and 6 are already at or near the floor. Scenario 8 is the outlier by a wide
margin, and scenario 2 is the one that will expose `ExperienceId`'s binary assumptions the first
time it is attempted.

---

## 6. Proposed target architecture

The smallest change that meaningfully improves the system. **No new layers, no rewrite, three
directory moves and one new leaf module.**

### `src/platform/` — NEW

- **Responsibility.** Every question about the device, the viewport and the visitor's stated
  preferences. Answers product questions, not media queries.
- **Interface.** `prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`,
  `NARROW_MAX_WIDTH`.
- **Hidden knowledge.** Which media query encodes which decision; the `typeof matchMedia` guard;
  the 767/768 boundary and its agreement with the stylesheets.
- **Dependencies.** None. Leaf, like `utils/`.
- **Lifecycle.** None; pure functions, resolved per call.
- **Not in scope:** `intro-draw/`, which must keep its own copy and import nothing.

### `src/utils/` — GAINS the warp curves

- **Responsibility.** Adds the pure curve library from `app/warpTransition.ts`
  (`cinematicTravel`, `cinematicSpeed`, `narrowPeak`, `flash`, `dollyAmount`, `motionBlur`).
  `prefersReducedMotion()` goes to `platform/` instead.
- **Why here.** Both experiences legitimately need it (ADR 005) and `utils/` already carries the
  rule that lets them.
- **What it unblocks.** `no experience imports the application layer`, stated in full.

### `src/app/` — GAINS `TransitionState`

- **Responsibility.** Unchanged, plus explicit ownership of the two fields it already writes.
- **Interface.** `{ progress: number; overlay: number }`, created in `App.tsx`.
- **Hidden knowledge.** That a transition is a warp with a flash. Consumers read two numbers.
- **Also gains** an `attention` value (P2-4) so the overlay set is enumerated once.

### `src/experiences/murcia/` and `corner-logo/` — GAIN their layers

- `components/MurciaLayer.tsx` → `experiences/murcia/MurciaLayer.tsx`
- `components/CornerLogoLayer.tsx` → `corner-logo/CornerLogoLayer.tsx`
- **Why.** Both are already governed by rules they currently stand outside of. The move is what
  makes the existing rules true.

### `src/components/` — NARROWS to DOM chrome and the render host

- **Responsibility.** React DOM the visitor sees, plus
  `SceneCanvas`/`LazyScene`/`SceneErrorBoundary`.
- **Interface.** Props from `App`. No experience internals.

### `checks/architecture.ts` — GAINS four rules and a wider walk

- Walk root `content/` as well as `src/`
- `src/content/` imports no `node:` builtin and no DOM global
- root `content/` imports nothing under `src/` except `src/content/`
- nothing lives at the `src/` root except `App.tsx`, `main.tsx` and ambient declarations
- (after the move) `no experience imports the application layer`

---

## 7. Dependency direction

### Proposed

```text
                    App.tsx  (orchestration)
                       │
        ┌──────────────┼──────────────┬─────────────────┐
        ▼              ▼              ▼                 ▼
  components/       app/         experiences/       corner-logo/
  (DOM chrome)  (id, transition,  earth/ murcia/    (overlay pass)
                  navigation)          │
        └──────────────┴───────────────┴─────────────────┘
                       │
                       ▼
                   graphics/
                       │
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
     utils/        platform/      content/     interaction/  loading/
    (curves,      (device Qs)    (types,      (cursor, NDC)
     easing)                      copy)

   intro-draw/  ── imports NOTHING. Asserted at source AND on the emitted bundle.

   content/  (root, Node)  ──▶  src/content/     one way, now asserted
```

### Dependencies to remove or invert

| Edge | Status | Action |
|---|---|---|
| `components/MurciaLayer` → `experiences/earth/` | **live, unenforced** | Remove via P2-1, then move the file (P1-1) |
| `components/SceneCanvas` → `experiences/earth/timeline` (for the logo) | live | Move `CornerLogoHandle` to `corner-logo/` |
| `components/AuditSection` → `src/auditView` ← `experiences/earth/` | **invisible, per-frame** | Fold into the passed-object pattern (P2-2) |
| `experiences/*` → `app/warpTransition` | live, correct, blocks a rule | Move to `utils/` (P2-6) |
| root `content/` ↔ `src/` | one-way, **unasserted** | Assert (P1-2) |

No inversions are required. The direction is already right everywhere; what is missing is
enforcement and, in two places, the file's location matching its role.

---

## 8. State ownership model

| State | Should live | Today | Action |
|---|---|---|---|
| `activeExperience` | `App` | `App` | none |
| Transition progress / overlay | **`app/`** | inside Earth's `SequenceState` | **P2-1** |
| Earth intro phase, warp, overlays, `orbitsStarted` | Earth | `SequenceState` | none |
| Overlay/attention flags (4) | `App`, as one value | three separate enumerations | **P2-4** |
| Murcia focus, yaw, districts, bounds | `MurciaExperience` | correct | none |
| Selected case | `App` | `App` | none — discrete, React state is right |
| Hover | interaction controllers | correct, per-frame, never React | none |
| Audit recomposition | Earth (both readers are Earth layers) | **module singleton at `src/` root** | **P2-2** |
| Cursor hint | `interaction/` | module singleton + pub/sub | acceptable; document as one of the four |
| Boot readiness | `intro-draw`, via `window.__vertigoIntro` | correct and load-bearing | none — a static import breaks the chunk split |

### Duplicate sources of truth

Only one true duplicate exists, and it is small: **the mobile breakpoint**, held independently in
`earthConfig.ts` (767), `spaceConfig.ts` (767), `AuditSection.tsx` (768), `districtPanel.ts` (768)
and two stylesheets. P2-3.

Two near-misses worth naming so a later pass does not re-report them as duplicates:

- `ExperienceId` is deliberately *not* duplicated into `navigationMachine` — the machine is told,
  and `navigationMachine.ts` documents why at length.
- The re-entrancy guard exists only in `useExperienceTransition`; the machine explicitly declines to
  duplicate it, on the grounds that "a second guard that could disagree with it is worse than one."

Both are correct and both are the right instinct applied deliberately.

---

## 9. Resource ownership model

Explicit owners for every long-lived GPU and DOM resource. This section describes what is already
true — resource ownership is the strongest part of the current architecture and needs no change.

| Resource | Owner | Created | Disposed | Notes |
|---|---|---|---|---|
| `WebGLRenderer`, canvas | R3F, via `SceneCanvas` | `<Canvas>` mount | R3F unmount | ADR 001/002. `dpr`, `alpha`, `powerPreference` and clear colour are all explicit. |
| `EffectComposer` + 4 passes | `RenderPipeline` | `useMemo` on `gl/scene/camera` | explicit effect | Enumerated by hand because `composer.dispose()` does not walk its passes. |
| Draco / KTX2 worker pools | `graphics/decoders.ts` | first `acquire` | last `release` | Ref-counted. At most one pool of each; the last consumer frees it. |
| Earth's `THREE.Scene` | R3F | mount | unmount | |
| Murcia's `THREE.Scene` | `MurciaExperience` | `load()` | `dispose()` | Separate Scene, ADR 001. |
| City GLTF, terrain, skirt | `MurciaExperience` | `loadAndSetup` | `disposeLoadedCity` | |
| Per-district materials/proxies | `DistrictInteraction` | constructor | `dispose()` | Clones share textures by reference — asserted, 68 checks. |
| Corner logo GLTF | `createCornerLogo` | load | `disposeObject3D` | Shared traversal; the version that leaked textures is why it is shared. |
| Wheel + rail listeners, navigation rAF | `createNavigationInput` | factory | `dispose()` | The only wheel handler in the application. |
| District canvas/window listeners | each `DistrictInteraction` | constructor | `dispose()` | Left attached while inactive; `setEnabled` gates. Linear in N — P3-4. |
| Context-loss listener | `RenderPipeline` | effect | effect cleanup | Reports; deliberately does not recover. |
| GSAP timelines | `useMasterTimeline`, `useExperienceTransition` | hook | `kill()` on unmount | Both pause on `visibilitychange`. |
| Murcia DOM overlay host | `MurciaLayer` | effect | `host.remove()` | |

**One rule is stated and unenforced:** disposal completeness. `disposal.ts` enumerates material
texture slots by reflection *specifically* because a hardcoded list "fails as a leak rather than as
an error". The same reasoning applies one level up — nothing asserts that `MurciaExperience.dispose`
covers every field it constructs. A Stage-0 harness could count GPU objects before and after a
build/dispose cycle. Worth doing; not urgent.

---

## 10. Refactoring roadmap

Incremental. **Every stage leaves the application deployable**, and every stage is independently
valuable — stopping after Stage 1 leaves the codebase better than it is now.

### Stage 0 — Safety (do first; nothing depends on it, everything benefits)

Extend `checks/`. No source changes.

1. **Widen `checks/architecture.ts` to root `content/`** and add the three purity rules (P1-2).
2. **Add the `src/`-root rule** — nothing but `App.tsx`, `main.tsx`, ambient declarations (P1-1).
3. **Fix `vitest.config.ts`'s three stale coverage paths** (P3-1).
4. **Add a docs-path rule** beside `audit-hygiene.ts`: every backticked repo path in `docs/**`
   resolves (P3-3).
5. **Triage `check:asset`'s three failures** — decide per failure: fix the asset, or restate the
   assertion as explicitly pending with the reason. **Do not chain it yet** (P2-5).

*Deployable: yes. Nothing but check configuration changes.*

### Stage 1 — Clarify ownership (behaviour-preserving moves)

6. **Extract `TransitionState` out of `SequenceState`** (P2-1). `check:warp`'s 36 assertions cover
   the behaviour.
7. **Move `MurciaLayer` → `experiences/murcia/`, `CornerLogoLayer` → `corner-logo/`** (P1-1). Only
   possible after 6.
8. **Move the warp curves to `utils/`; replace the narrow harness rule with the broad one** (P2-6).

*Deployable: yes. Pure moves plus one type split; every step verifiable by `npm run check`.*

### Stage 2 — Remove duplicated knowledge

9. **Create `src/platform/`**; migrate all twelve capability sites; pick one predicate for "touch"
   and one breakpoint constant, asserted against the stylesheets (P2-3).
10. **Give `attention` one owner in `App.tsx`** (P2-4).

*Deployable: yes. Step 9 changes behaviour in exactly one direction — three sites gain a
`typeof matchMedia` guard they lacked. Check `AuditSection.test.tsx` under jsdom.*

### Stage 3 — Deepen abstractions

11. **Fold `auditView` into the passed-object pattern** and document the four channels in
    ARCHITECTURE §14 (P2-2).
12. **Rename `CameraRig.getPose` / `getEffectivePose`** so the safe one is the short one (P3-2).
13. **Group `DistrictInteraction`'s seven framing dependencies into a `FramingContext`** (P3-4).

*Deployable: yes. Each is independently revertible.*

### Stage 4 — Remove obsolete layers and special cases

14. **Chain `check:asset` into `check:harnesses`** — only once Stage 0 item 5 is resolved (P2-5).
15. **Measure `DistrictInteraction`'s per-district cost at N=3** and decide about a merged raycast
    then, not before (P3-4, PRINCIPLES §28).

*Deployable: yes — item 14 is precisely the step that must not be taken until the gate is green.*

### Stage 5 — Documentation

16. **Amend ADR 008** with the third `RenderRoute` member.
17. **Amend ARCHITECTURE §11 and §29** to name the navigation rAF and why it is bounded; add a line
    to ADR 009.
18. **Update ARCHITECTURE §15** — `platform/` now exists and is where "capability detection" lives.
19. **Update `checks/architecture.ts`'s "NARROWER THAN IT SHOULD BE" note** to record that the move
    happened and the broad rule is now stated.

---

## Appendix — what this audit deliberately did not report

Recorded so a later pass does not spend the effort again.

- **Both experiences permanently mounted** — ADR 001, ADR 003. Deliberate; the transition's freedom
  from stalling depends on it.
- **Earth and Murcia having different lifecycle shapes** — ARCHITECTURE §7 argues it explicitly, and
  ADR 003 makes `active` a boolean rather than a phase. Wrapping Earth in a class to match Murcia
  would be a shallow module.
- **Murcia bypassing the composer** — ADR 001, amended by ADR 005 for warps only. The MSAA/HalfFloat
  trade-off is documented in `RenderPipeline.tsx`.
- **The transition writing into a shared mutable object rather than React state** — plan 002 §1.2.
  Per-frame React state would re-render the whole tree. *Which* object it writes into is P2-1; that
  it writes into one is correct.
- **`window.__vertigoIntro`** — a genuine browser global, and load-bearing. A static import hoists
  `intro-draw` into a shared chunk and fails the standalone assertion in `vite.config.ts`.
- **35% comment density** — PRINCIPLES §24 asks for these comments and they are `why`, not
  restatement. Only the drift is a finding (P3-3).
- **`MurciaExperience` at 733 lines and `DragPanController` at 845** — both are deep modules with
  small interfaces over substantial hidden complexity. Splitting them for size is an explicit
  anti-goal, and neither shows the shallow-module symptoms.
- **`cityDistrictBindings.ts` holding one entry** — incomplete, not wrong. The table is the correct
  shape; the asset is what is unfinished (P2-5).
- **The `intro-draw` duplication of reduced motion and easing** — required. It may import nothing,
  asserted twice over.
