# Architecture, Complexity & Refactoring — 2026-08-27

**Date:** 2026-08-27 · **Against:** working tree at `2f7d082`
**Brief:** `audits/architecture-complexity-refactoring.md`

**Second pass. Written as a delta against `architecture-complexity-refactoring-2026-08-20.md`.**
That report remains accurate for everything this one does not restate; where the two disagree,
this one wins. Findings carried forward keep their old identifiers in parentheses so the two can
be read side by side.

The tree audited is the working tree, not `2f7d082` itself: nineteen files are uncommitted plus
two new test files, all of them the one-service-per-building rework of Murcia's district
interaction. It is treated as intended architecture — it is complete, it is tested, and the
export contract it depends on has already been amended in the same change.

**The headline of this pass is short.** Between 2026-08-20 and today the repository added
**36,734 lines across 312 files** — the Sanity content pipeline, the Studio package, the split-plate
hologram, pinch navigation, the sky-cubemap prototype, and the district rework. **None of the
twenty-item roadmap in the previous report was executed.** Every P1 and P2 finding is still open,
verbatim, and four of them are measurably larger than they were seven days ago. One P3 was
resolved — structurally, and as a side effect of a feature.

---

## 0. Verified baseline

Nothing here is hand-derived where the repository already asserts it. Full run, 2026-08-27:

| Gate | Result | 2026-08-20 |
|---|---|---|
| `npm run typecheck` | pass | pass |
| `npm run test` (vitest) | **905 tests, 53 files, all pass** | 593 / 35 |
| `check:architecture` | 19/19 — **142 modules, 386 relative imports**, acyclic | 18/18 — 129 / 346 |
| `check:audit` | 16/16 | 16/16 |
| `check:navigation` | 55/55 | 52/52 |
| `check:footprint` | 8/8 | 8/8 |
| `check:district` | 75/75 | 68/68 |
| `check:earth` | 25/25 | — (new harness) |
| `check:warp` | 47/47 | 36/36 |
| `check:space` | 36/36 | 29/29 |
| **`check:asset`** | **6/9 — 3 FAILED. Still not part of `check:harnesses`.** | 6/9, same three |
| `npx vite build` | pass — app entry **323,236 B of a 332,000 B budget (97.4%)**, 108,100 B gzipped | 316,247 / 320,000 |
| `npx playwright test --list` | 36 tests in 5 files | 36 |

**281 gated harness assertions** (was 227), across **eight** chained harnesses — `check:earth`
joined since the last pass. A ninth, `check:asset`, is still defined, still unchained, and still
failing the same three assertions.

Two corrections this pass owes its predecessor, both verified above:

- The 2026-08-20 report said "six gated siblings". There are now **seven** alongside
  `architecture`. The brief's Phase 1 text ("five sibling harnesses", "the six `checks/`
  harnesses" in Phase 27) is two revisions behind reality. The brief is the thing to amend.
- The entry budget is **332,000 B**, not the 320,000 B the previous report and
  `ARCHITECTURE.md` §17 both quote. It was raised on 2026-08-26 with a written, measured
  justification in `vite.config.ts` — the raise is fine; the two documents that still quote the
  old number are P3-D.

**Scale, for the sections that need it.** 142 modules and ~25,100 lines under `src/` of which
**9,554 are comment lines (38%)**; 19 modules under root `content/`; 19 tracked files under
`sanity-studio/`; **28,642 lines of Markdown under `docs/`**. Prose to code is now roughly
**2.4 : 1**.

---

## 1. Executive architecture assessment

### Healthy but accumulating complexity — same classification, weaker margin

The classification is unchanged, and repeating it is not a formality. Everything the previous pass
called strong is still strong, and some of it got stronger:

- Resource ownership remains the best part of the codebase. The orbit system's two module-level
  shared geometries each name their owner in the file, and `createOrbitSystem.dispose()` releases
  them. `graphics/decoders.ts` is still a one-file answer to a three-site problem.
- The root `content/` pipeline is a textbook deep module. Six collections, one `collection<T>()`
  contract, one emitter, fail-closed by design — and the argument for failing closed is written
  where the decision lives (`scripts/build-content.ts`).
- The district rework **structurally removed** the previous pass's P3-4. `DistrictInteraction` is
  now one interaction holding N sites rather than one instance per building; the per-district
  listener and raycast cost stopped being linear before it ever had to be measured. That is the
  right kind of fix and it was made for product reasons, which is better still.
- 905 unit tests and 281 harness assertions is a genuinely refactor-safe base.

What has changed is the ratio between what the enforcement covers and what has been built beside
it. The previous pass's central claim was:

> **Complexity is accumulating precisely where the enforcement cannot see.**

Seven days and 36,734 lines later that is no longer a warning. It is a measurement:

| | 2026-08-20 | 2026-08-27 |
|---|---|---|
| Modules under `src/` that are the source of no rule | 30 of 129 (23%) | **33 of 142 (23%)** |
| `experiences/` → `app/` edges (the rule that cannot be stated) | 2 | **10** |
| Application-owned fields inside Earth's `SequenceState` | 2 | **3** |
| Code outside `src/` with no harness at all | 13 modules (`content/`) | **19 modules + a second npm package** |
| Tested modules outside the coverage gate | not measured | **30 of 46** |
| Enumerations of "something has the viewer's attention" in `App.tsx` | 3 | **4** |

And one new class of problem arrived with the CMS, which is the single most important finding in
this pass: **editorial validation now has two owners in two packages, and the one a human
interacts with is not the one that decides.** An editor can save content the build refuses. The
build is fail-closed by design, so the consequence is a red deployment produced by someone who
cannot read the error. That is P1-A.

**Still not wrong, and still should not be reported as such:** both worlds permanently mounted
(ADR 001/003); the two experiences having different lifecycle shapes (ADR 003, ARCHITECTURE §7);
`active` as a boolean (ADR 003); Murcia bypassing the composer (ADR 001/005); the transition
driving no camera (ADR 005); orbit assignment living in scene code rather than in content
(`orbitAssignments.ts`, argued at length and gated by a test against the real content); the
Studio's separate `tsconfig.json` (argued in the file — coupling `npm run check` to the Studio's
dependencies would be worse); `window.__vertigoIntro` (load-bearing, a static import breaks the
chunk split).

---

## 2. Current architecture map — delta

### 2.1 Layers, as they actually are

```text
index.html
├── intro-draw/            boot entry — separate Rollup input, 14,057 B, imports NOTHING (10)
└── main.tsx → App.tsx     application orchestration
    ├── app/                 experience id, transition, warp curves, build flags,
    │   │                    TWO prototype gates                                    (8)
    │   └── navigation/      wheel + pinch authority, machine, spring               (7)
    ├── components/          chrome + the render host + two experience layers      (14)
    ├── experiences/earth/   R3F component tree (orbit/ is now 12 modules)          (49)
    ├── experiences/murcia/  class, own THREE.Scene, own DOM overlay + CSS          (37)
    ├── graphics/            render pipeline, decoders, disposal, context loss       (7)
    ├── content/             types, invariants, lookup, six generated collections   (11)
    ├── corner-logo/         application chrome, overlay pass                        (4)
    ├── interaction/ utils/ loading/                                                 (7)
    └── (src root)           App.tsx, main.tsx, auditView.ts, glsl.d.ts              (4)

content/          (repo root, Node-only, 19 modules)  →  src/content/generated/
                                                        [build output, not committed]
sanity-studio/    (a SECOND npm package, 19 tracked files, its own tsconfig + lockfile)
```

142 modules, 386 relative imports, no cycles.

### 2.2 What is new since 2026-08-20

| Added | Where | Architectural note |
|---|---|---|
| Sanity content pipeline | root `content/` 13 → 19 modules, 6 collections | Deep module, well factored. Unwalked by any harness (P1-C). |
| `sanity-studio/` | new package | A second source of truth for editorial validation (**P1-A**). Its `typecheck` script is run by no gate. |
| `app/buildFlags.ts` | `app/` | Correct seam, wrong layer — it is a build fact, not orchestration (P2-B). |
| `app/protoSky.ts`, `app/protoHolo.ts` | `app/` | Dev-gated prototype switches whose only consumers are inside Earth (P2-B). |
| `earth/orbit/` 8 → 12 modules | Earth | Two module-level shared geometries with declared external owners (P3-A). |
| `murcia/navigation/` pinch | Murcia | ADR 012. Clean; the machine did not grow. |
| `earth/camera/debugCameraHook.ts` | Earth | A **fifth** publish-to-a-per-frame-reader channel (`window.__vertigoProto`), dev-gated. |
| `check:earth` harness | `checks/` | 25 assertions. The right response to new scene code. |
| `transitionCommitted` | Earth's `SequenceState` | A **third** application-owned field in Earth's state object (P2-A). |

### 2.3 Frame loops — re-inventoried

Unchanged in kind. R3F's loop (now **11** `useFrame` callbacks, `RenderPipeline` at priority 1);
`createNavigationInput`'s self-stopping rAF; `CustomCursor`'s settle-epsilon rAF; `intro-draw`'s
boot loop; `DebugOverlay`'s dev-only loop. Every other `requestAnimationFrame` in `src/` is a
one-shot deferral, not a loop. **ARCHITECTURE §11 and §29 still do not name the navigation rAF** —
carried from P3-3.

---

## 3. Complexity hotspots

Ranked by the brief's three symptoms. Changes from 2026-08-20 marked.

| # | Area | Amplification | Cognitive load | Unknown unknowns | Δ |
|---|---|---|---|---|---|
| 1 | **Editorial validation split across two packages** | high | medium | **highest** | **NEW** |
| 2 | **The enforcement boundary** (`checks/architecture.ts` prefixes; `content/` and `sanity-studio/` unwalked) | high | low | high | ↔ |
| 3 | **`experiences/` → `app/`** — 10 edges, 4 target modules, no rule possible | medium | medium | high | **↑ from 2** |
| 4 | **`App.tsx`** — orchestration + Earth intro + four overlay flags enumerated four times | high | high | medium | ↔ |
| 5 | **Platform/capability detection** — no owner, ~16 sites | medium | low | medium | ↑ |
| 6 | **The palette** — no token layer, two notations, two stylesheets | medium | low | medium | **NEW** |
| 7 | **The five global-publish channels** | low | medium | high | ↑ from 4 |
| 8 | **Documentation surface** — 28,642 doc lines + 9,554 comment lines vs ~15,600 code lines | low | low | medium | ↑ |

Hotspot 8 still needs the same care it needed last time. The comments are overwhelmingly *why*,
PRINCIPLES §24 asks for exactly them, and they are the reason this audit could be done from the
source at all. The risk is arithmetic, and the arithmetic got worse: at 2.4 : 1 prose to code,
drift is the default and only a harness prevents it. Four concrete drifts are recorded in P3-D
and P3-E.

---

## 4. Refactoring findings

---

### P1 — Architectural liability

---

#### P1-A · NEW · Editorial validation has two owners in two packages, and the one the editor uses is not the one that decides

**Files:** `sanity-studio/schemas/*.ts` (7 document schemas, 31 validation rules) ·
`content/collections/*.collection.ts` (6 mappers, ~24 bound constants) ·
`src/content/invariants.ts` · `scripts/build-content.ts:96–101` ·
`sanity-studio/schemas/lib/locked.ts`

**Current responsibility.** Nothing owns "what a valid piece of content is". Three tiers each hold
part of the answer:

| Tier | Where | What it does when a rule is broken |
|---|---|---|
| Studio schema | `sanity-studio/schemas/` | Shows the editor a Spanish error and refuses to publish |
| Collection mapper | `content/collections/` | Fails the content build |
| Invariants | `src/content/invariants.ts` | Fails the content build *and* the vitest tier |

**Complexity mechanism, part one — the numbers are written twice.** Roughly two dozen editorial
bounds exist as a Studio `rule.max(n)` **and** as a mapper constant, with no link between them:

```
service       title 60 / body 900   sanity-studio/schemas/service.ts:32,43
                                    content/collections/serviceBounds.ts:11,18
district      label 40 / summary 140 / intro 600 / services 12
case study    chart title 80 / chart label 24 / values 16 / details 4 / summary 400 …
blog post     title 120 / excerpt 300 / tags 8 / body blocks 400
site settings display 40 / phones 4 / copyright 120
media         alt 200
```

Every pair agrees **today**. That is the point: this is duplicated knowledge caught before it
diverged, not after. The irony is that `content/collections/serviceBounds.ts` exists *specifically*
to stop two copies of 60/900 drifting between two mappers — and its own header makes the argument:

> "Two copies of these numbers is the arrangement where one gets relaxed and the other quietly
> does not."

There is a third copy, in another package, that the file does not know about.

**Complexity mechanism, part two — and this is the liability.** The two tiers are not merely
duplicated, they are **asymmetric**. At least one rule the build enforces has no Studio
counterpart at all:

- `ID_PATTERN` (`/^[a-z0-9][a-z0-9-]{0,63}$/`) is enforced by `slug()` in every mapper.
- **None of the four `type: 'slug'` fields validates against it.** All four carry
  `validation: (rule) => rule.required()` and `options: { source: …, maxLength: 64 }`. No
  `slugify` override, no pattern rule.

The slug input is a free text field. A Spanish-language agency's content is exactly where
`Análisis Web`, `Diseño & Marca` or a hand-typed identifier with a space arrives. The editor sees
a green checkmark; `collectionProblems` refuses it.

**Why the abstraction leaks.** `scripts/build-content.ts` is deliberately fail-closed, and the
reasoning is correct and worth keeping:

> "A sync that cannot reach or cannot validate the CMS EXITS NON-ZERO. On Vercel that fails the
> build, which leaves the existing deployment serving."

`package.json`'s `build` is `npm run check && vite build`, and `vercel.json` sets no
`buildCommand`. So the failure path is: editor publishes → deploy runs → `content:build` exits 1
→ **the deployment fails**, and the person who caused it is looking at a CMS that told them
everything was fine. The architecture converted a validation error into a build outage owned by
someone with no access to the build.

**Concrete amplification.** Adding a field to any document is a **four-place change** today: the
Studio schema, the GROQ projection, the mapper with its bound, and the type. Three of the four are
in one package and one is in another, with a separate lockfile, a separate `tsconfig.json`, a
separate `npm install`, and no gate that runs its `typecheck`. Nothing fails if the fourth is
forgotten or if the two numbers stop matching — until an editor writes 61 characters.

**Proposed owner.** `src/content/invariants.ts`, extended from *predicates* to *bounds*, and the
Studio importing them. This is a smaller change than it sounds, because `invariants.ts` is already
built for exactly this: "Pure by rule: no Node APIs, no DOM, no imports beyond types", precisely so
it can be consumed by two runtimes. A third consumer is the same argument again.

**Proposed boundary.** Three steps, in this order and independently valuable:

1. **Close the asymmetry first, without moving anything.** Add
   `rule.regex(/^[a-z0-9][a-z0-9-]{0,63}$/)` and a `slugify` to all four slug fields. This alone
   removes the only known way for an editor to produce a red deployment. One file, four fields.
2. **Give `invariants.ts` the bounds** it does not already hold (`SERVICE_TITLE_MAX`,
   `DISTRICT_LABEL_MAX`, … — the ~24 above), and have the mappers import them from there rather
   than declaring local `const`s.
3. **Have the Studio import them too**, via a relative path into `src/content/invariants.ts`. The
   Studio's `tsconfig.json` argues that `npm run check` must not depend on the Studio's
   dependencies — that argument is about the *direction* of the dependency and is unaffected: the
   Studio would import a dependency-free module out of the app, not the other way round.

If step 3 is judged too coupling for a separately deployed package, the fallback is a harness:
assert that every `rule.max(n)` in `sanity-studio/schemas/` has a matching constant. That is
strictly worse than one definition, and it is still much better than nothing.

**Expected reduction.** One definition instead of three. The four-place change becomes a
three-place change with the fourth checked. Most importantly: the class "editor publishes
something the build refuses" stops existing, rather than being caught later.

**Migration risk.** Step 1: none, and it is the one to do first. Step 2: low, mechanical, covered
by `content/collections/collections.test.ts`. Step 3: medium — it makes the Studio's build depend
on a path outside its own package, which must be verified against `sanity build` and `sanity
deploy`, not just `tsc`.

---

#### P1-B · CARRIED (P1-1) · The dependency harness still matches directories, so two experience layers and one shared global sit outside every rule

**Status: unchanged in substance, marginally larger.** 33 of 142 modules (was 30 of 129) are the
source of no rule: `components/` (14), `app/` (15), `src/` root (4).

Everything the previous report established is still true and still verifiable:

```ts
// src/components/MurciaLayer.tsx:5   — still there
import type { SequenceState } from '../experiences/earth/config/sequenceState'
```

`murcia does not import earth` passes because the rule reads `src/experiences/murcia/`.
`MurciaLayer.tsx` is Murcia's R3F host in every sense except its path — it constructs the
experience, drives its frame, applies its warp pose and owns its DOM container.
`SceneCanvas.tsx:15` still does the same with `CornerLogoHandle` out of `experiences/earth/timeline`.
`src/auditView.ts` is still a module-level mutable object written by `components/AuditSection.tsx`
and read per frame by two Earth layers, sitting at the `src/` root where no rule can reach it.

**One new instance of the same shape,** small and cheap to remove — see P3-B:
`components/CasePanel.tsx:2` imports `SatelliteDef` from `experiences/earth/orbit/orbitConfig`,
where `SatelliteDef` is `type SatelliteDef = CaseStudy`. DOM chrome reaching through a scene module
for a content type.

The proposal is unchanged: add the positive `src/`-root rule (additive, one assertion, passes
today), then resolve P2-A, then move the two layers. The additive half costs nothing and can be
done this week.

---

#### P1-C · CARRIED and GROWN (P1-2) · The two newest boundaries have no harness; one of them is a second npm package

**Files:** `checks/architecture.ts:22` (`const SRC = 'src'`) · root `content/` (19 modules) ·
`sanity-studio/` (19 tracked files) · `src/content/invariants.ts` ·
`docs/adr/010-content-is-generated-at-build-time.md` · `docs/adr/011-the-cms-is-sanity.md`

**Unchanged half.** `checks/architecture.ts` still walks `listSources('src')` and nothing else.
Verified today, none of the following is checked by anything:

- `src/content/` importing a `node:` builtin or touching a DOM global — it does not today, and
  `invariants.ts` states the rule as a file-level contract, which is where the previous drift
  always starts
- root `content/` importing `src/experiences/`, `src/app/` or `src/graphics/`
- root `content/` being reachable from the browser bundle

The allowed edge is real and load-bearing — eleven files under `content/` import
`src/content/types` or `src/content/invariants`, which is exactly the arrangement ADR 010
prescribes. Nothing asserts it stays one-way.

**The grown half.** `sanity-studio/` is a **second npm package** inside the repository: its own
`package.json`, its own `package-lock.json`, its own `tsconfig.json`, its own `node_modules`. It
holds the schemas that decide what an editor may publish (P1-A). Nothing in `npm run check` touches
it. Its own `tsconfig.json` says what is at stake, and then nothing runs it:

> "What this buys: `npm run typecheck` in here checks the schemas and both config files against the
> installed Sanity version. **It is the only thing standing between a schema edit and discovering
> the breakage during a client's editing session.**"

That is a check that exists and is wired to nothing — the same shape as `check:asset` (P2-C), one
package over. The separate `tsconfig` is right and should stay; what is missing is a gate that runs
the Studio's own script.

**Concrete amplification.** Adding the next collection — the extension point
`content/collections/index.ts` advertises — is now a **five-place** change: a Studio schema, a
mapper, a type, a predicate set, and a consumer. A predicate reaching for `node:crypto` to hash an
id compiles, passes `tsc`, passes all 281 harness assertions, passes 905 unit tests (the unit tier
runs `content/**` in Node), and fails **at runtime in the browser**. Nothing between the edit and
production says no.

**Proposed owner.** `checks/architecture.ts`, widened. It already resolves relative specifiers and
already reports file plus specifier; the walk is parameterised on one constant.

**Proposed boundary.** Four assertions plus one script line:

- `src/content/` imports no bare specifier beginning `node:` and references no DOM global
- root `content/` imports nothing under `src/` except `src/content/`
- no module under `src/` imports root `content/`
- nothing lives at the `src/` root but `App.tsx`, `main.tsx` and ambient declarations (P1-B)
- **`check:studio`** — `cd sanity-studio && npm run typecheck`, chained into `check:harnesses`,
  guarded so it skips with a clear message when `sanity-studio/node_modules` is absent (it must not
  make a Vercel deploy depend on the Studio's install; that is the constraint its `tsconfig.json`
  is protecting)

**Expected reduction.** The two boundaries whose violation is silent — one runtime-only, one
visible first to a client mid-edit — become named build failures.

**Migration risk.** None for the four assertions; they pass today. Low for `check:studio`, provided
the skip path is written first and verified in a clean checkout.

---

### P2 — Important improvement

---

#### P2-A · CARRIED and GROWN (P2-1) · `SequenceState` now carries three application fields, not two

**Files:** `src/experiences/earth/config/sequenceState.ts:18,26,34` ·
`src/app/useExperienceTransition.ts:86–88,143–183` · `src/components/MurciaLayer.tsx:5,199,200` ·
`src/components/SceneCanvas.tsx:11,73,74` · `src/experiences/earth/camera/CameraController.tsx:115–122,241` ·
`src/experiences/earth/interaction/InteractionLayer.tsx:146–170`

`transitionCommitted` joined `transitionProgress` and `transitionOverlay` since the last pass, with
the pinch scrub (ADR 012): a scrubbed gesture moves `transitionProgress` without committing, so
three consumers now branch on the pair. The field is correct and the distinction it draws is
necessary. It is in the wrong object.

The shape of the finding is unchanged and the count is worse: three fields **written by `src/app/`**,
**read by Murcia's layer and by three Earth layers**, living in a type defined three directories
deep inside Earth. `sequenceState.ts` still documents the ownership inline — where it cannot be
enforced.

This is still the import that blocks P1-B. Extracting a `TransitionState`
(`{ progress, overlay, committed }`) created by `App.tsx` is now a five-file mechanical change
covered by `check:warp`'s **47** assertions (was 36), including "both worlds return exactly to rest"
at p=0 and p=1.

---

#### P2-B · GROWN, and the previous fix is no longer sufficient (revises P2-6) · `experiences/` → `app/` went from 2 edges to 10

**Files:** `checks/architecture.ts:153–163` (the "NARROWER THAN IT SHOULD BE" note) ·
`src/app/warpTransition.ts` · `src/app/buildFlags.ts` · `src/app/protoSky.ts` ·
`src/app/protoHolo.ts` · eight consumers under `src/experiences/earth/`

**What changed.** The previous report ranked this as a known constraint with a one-line fix: move
`app/warpTransition.ts` to `utils/`, then state
`forbid('no experience imports the application layer', 'src/experiences/', 'src/app/')`. That fix
no longer works, because three more `app/` modules joined the edge:

```
earth/camera/CameraController.tsx      -> app/warpTransition
earth/camera/scrubPose.ts              -> app/warpTransition
earth/scene/SpaceBackdrop.tsx          -> app/warpTransition, app/protoSky
earth/orbit/createHoloPanel.ts         -> app/warpTransition, app/protoHolo
earth/camera/debugCameraHook.ts        -> app/buildFlags, app/protoSky
earth/EarthExperience.tsx              -> app/protoSky
earth/scene/SkyShellCube.tsx           -> app/protoSky
```

Ten edges, eight files, four target modules. Murcia has zero — the growth is entirely Earth's, and
entirely from work added since 2026-08-20.

**Why the abstraction leaks.** Each of the four is in `app/` for a defensible local reason and none
of them is orchestration:

| Module | What it actually is | Consumers |
|---|---|---|
| `warpTransition.ts` | a pure curve library (`cinematicTravel`, `flash`, `motionBlur`, …) | both experiences, `app/` |
| `buildFlags.ts` | one build-time boolean, `DEBUG_TOOLS_ENABLED` | `App`, `components/`, `app/`, Earth |
| `protoSky.ts` | Earth's sky prototype URL gate | **Earth only** (4 files) + `protoHolo` |
| `protoHolo.ts` | Earth's hologram prototype URL gate | **Earth only** (1 file) |

`app/` has become where a module goes when it is shared and has nowhere obvious to live. That is
what a generic directory is, and ARCHITECTURE §17's stated direction — *no experience imports the
application layer* — gets further from being statable with each one.

**Concrete amplification.** Until this resolves, an experience may import **anything** under
`src/app/` and nothing objects: `useExperienceTransition`, `experience.ts`, the navigation machine.
Those are the modules that genuinely couple the two worlds, and ADR 005's central guarantee — "Earth
and Murcia still know nothing about each other" — currently rests on nobody having tried.

**Proposed owners.** One rule, three destinations, chosen by what each module *is*:

- `warpTransition.ts` → `src/utils/`. Unchanged from P2-6. `utils/` already carries
  `does not import the application layer`, and both experiences legitimately need the curves (ADR
  005). `prefersReducedMotion()` leaves it for `platform/` under P2-D — it does not belong in a
  curve module, which is a naming problem in its own right.
- `buildFlags.ts` → a leaf beside `utils/`, or into `platform/` with P2-D. It answers "what is this
  build allowed to do", which is the same category of question as "what is this device".
- `protoSky.ts`, `protoHolo.ts` → `src/experiences/earth/config/`. Every consumer is Earth's. They
  are Earth's prototype switches and reading them from `app/` states a sharing that does not exist.

**Proposed boundary.** After the three moves, the narrow rule is replaced by the broad one:

```ts
forbid('no experience imports the application layer', 'src/experiences/', 'src/app/',
       'the arrow is app -> experiences; ADR 005 has each world read progress and move its own camera')
```

**Expected reduction.** One broad rule replaces one narrow one and the widest hole in §17's
enforcement closes — this time in a way that stays closed, because after the move `app/` contains
only things that genuinely are orchestration.

**Migration risk.** Low. Eleven import paths across eight files, plus one harness edit.
`check:warp` (47), `check:earth` (25) and `warpTransition.test.ts` cover the behaviour. Do the
prototype gates first — they are Earth-internal and cannot break anything else.

---

#### P2-C · REVISED (was P2-5) · `check:asset` is not merely ungated any more — a third of it is asserting a retired contract

**Files:** `package.json:17,25` · `checks/city-asset.ts` · `public/models/city-prototype.glb` ·
`public/models/city-backdrop.glb` · `docs/murcia/blender-export-contract.md` (amended, uncommitted) ·
`src/experiences/murcia/interaction/resolveDistrict.ts:44–52`

**What the previous report said.** Chain `check:asset` into `check:harnesses` once its three
failures are triaged; do not chain first, because it would turn `npm run check` red and fail the
Vercel build.

**What changed, and it changes the recommendation.** Two of the three failures are now assertions
against a contract the architecture has **deliberately abandoned**. The uncommitted amendment to
`docs/murcia/blender-export-contract.md` says so directly:

> "These are identified by **object name**, not by tag — a per-building custom property would add
> nothing the name does not already say, and the names are dot-free so sanitisation cannot bite."

And `cityDistrictBindings.ts` implements it: `DistrictSceneBinding` no longer carries `tag` or
`nodeNames` at all; `MurciaExperience.setupDistricts` synthesises a `DistrictLookupSpec` with
`tag: ''` per building, which is documented as "an empty tag also silences the 'add the custom
property' warning".

So today's run reads:

| Assertion | Result | What it means now |
|---|---|---|
| `every primitive carries TEXCOORD_0` | **FAIL** 39/222 | Genuinely pending — the trim sheet is not applied (0 materials, 0 textures in the GLB) |
| `nodes carry glTF extras` | **FAIL** none | **Obsolete.** Nothing reads extras for service buildings any more |
| `at least one node tagged district=` | **FAIL** none | **Obsolete.** `resolveDistrict` is called with an empty tag by design |

**Why this is worth a finding rather than a cleanup.** A harness that is red for reasons that are
no longer defects can never be chained, and a harness that can never be chained is the document
with a shebang the previous report named. The obsolescence is what makes the ungating permanent.
Meanwhile the assertions that *would* be valuable do not exist: nothing checks that every
`nodeName` in `cityDistrictBindings.buildings` is present in the shipped GLB, which is now **the**
runtime contract for the whole services district, and `city-backdrop.glb` is still inspected by
nothing.

**Proposed owner.** `checks/city-asset.ts`, rewritten against the current contract, then chained.

**Proposed boundary.** Four changes, in this order:

1. **Delete** the two tag assertions. They test a mechanism the design retired; keeping them as
   "pending" would be worse, because pending implies someone intends to satisfy them.
2. **Add** the assertion the new design actually needs: every `nodeName` in
   `cityDistrictBindings.ts` resolves to a node in the GLB. That is the check that would catch the
   next Blender re-export dropping a building — today's symptom is a `console.error` in production
   and one service silently absent from the city.
3. **Restate** the TEXCOORD_0 assertion as explicitly pending, naming the trim-sheet plan, so its
   red state carries its reason.
4. **Then** chain `check:asset` into `check:harnesses`, and parameterise the model path so
   `city-backdrop.glb` is covered too.

**Expected reduction.** The export contract becomes enforced rather than described, and the one
mechanism the district interaction now depends on entirely gets a gate.

**Migration risk.** Low, now — lower than the previous pass estimated, because step 1 removes two
of the three blockers outright rather than negotiating with them. Step 4 must still come last.

---

#### P2-D · CARRIED (P2-3) · Platform and capability knowledge still has no owner; `src/platform/` still does not exist

**Status: unchanged, slightly larger.** Re-verified today, ~16 sites:

- **Reduced motion, seven sites, three spellings.** `app/warpTransition.ts:242` is still the
  correct owner and is still bypassed by `createNavigationInput.ts:135`,
  `AuditSection.tsx:264`, `CustomCursor.tsx:46`, `useMasterTimeline.ts:53`,
  `MurciaExperience.ts:500` and `intro-draw/boot.ts:52`. Three of them still call `matchMedia`
  with no `typeof` guard and throw where it is absent.
- **"Is this a touch device", three sites, three different questions.** `(hover: none)` in
  `DistrictInteraction.ts:189` and `districtLabel.ts:28`, `(pointer: coarse)` in
  `overlays.ts:84`, `(pointer: fine)` in `CustomCursor.tsx:33`. Not synonyms.
- **The breakpoint, still written six times.** `earthConfig.ts` and `spaceConfig.ts` (767, read
  via `EARTH_TEXTURES.narrowMaxWidth` in `EarthScene.tsx:64` and `SkyShell.tsx:60`);
  `AuditSection.tsx:30`; `districtPanel.ts` (`DESKTOP_MIN_WIDTH`, :144); plus `styles.css` and
  `murcia.css`. All the TS sites read `window.innerWidth` at different moments, so they can
  disagree across a resize.

`ARCHITECTURE.md:442` still lists `graphics/capabilities/` among shared responsibilities. It still
does not exist. Scenario 8 is still the worst in the codebase by a wide margin.

The proposal is unchanged: `src/platform/` as a leaf exposing product questions —
`prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`, `NARROW_MAX_WIDTH` — with
`intro-draw/` exempt and required to stay so. **New:** it is also the right home for
`buildFlags.ts` under P2-B, which makes the module worth slightly more than it was.

---

#### P2-E · NEW · The palette is knowledge with no owner, in two notations across two stylesheets and the scene code

**Files:** `src/styles.css` (2,203 lines) · `src/experiences/murcia/styles/murcia.css` (479) ·
`src/experiences/murcia/interaction/DistrictInteraction.ts:100–113` (`SITE_HIGHLIGHT`) ·
`src/experiences/earth/orbit/orbitConfig.ts` · `src/experiences/murcia/config/environmentConfig.ts`

**Current responsibility.** Nothing owns it. Measured today:

- **8 CSS custom-property declarations in 2,682 lines of CSS**, and all of them are dynamic values
  written from JS (`--case-brand`, `--hx`, `--hy`, `--header-inset`). There is no token layer at
  all — no `--color-*`, no `--space-*`, no `--font-*`.
- **15 distinct hex literals** and **147 `rgba()` calls** across the two stylesheets.
- **13 distinct `0x` colours** in TypeScript, for the same design system in a different notation.
- The two sets **overlap**: `#4fb0ff` appears twice in CSS and `0x4fb0ff` five times in TS;
  `#050507` appears in both.

**Why the abstraction leaks.** This is Phase 4 exactly — implementation knowledge with no
authoritative owner — with an aggravating factor the other findings do not have: **the value is
known to be provisional.** The project's open decisions include the brand webfont (none loads
today; `Inter` is declared and falls back to the OS) and the atmosphere twilight colour being
off-brand. Two stylesheets and thirteen scene constants is the state in which "apply the brand
palette" is a grep, in two notations, with no way to tell a brand colour from a shader constant
that happens to be blue.

**Concrete amplification.** Changing the interaction blue means editing `murcia.css`, `styles.css`
and `SITE_HIGHLIGHT`'s two fields, and knowing that `0x4fb0ff` in three other orbit files is the
same decision. Changing the type scale means reading 2,682 lines. Neither has a gate; the failure
is a page where two blues are one hex apart and nobody can say which is correct.

**Proposed owner.** A token layer — `:root` custom properties in `styles.css` for the CSS side, and
a small `src/design/palette.ts` exporting the same values as `0x` ints for the scene side, with a
comment in each pointing at the other. **Not** a design-system framework, and not a build-time
token pipeline: this is roughly 20 named constants.

**Proposed boundary.** CSS reads `var(--color-*)`. Scene code imports from `palette.ts`. The two
files state that they are two notations of one decision. A harness rule beside
`checks/audit-hygiene.ts` — which already walks text files — can assert that every `0x` colour in
`palette.ts` has a matching `--color-*` in `styles.css`, which is the whole enforcement this needs.

**Expected reduction.** "Apply the brand palette" becomes an edit to one file and a mechanical
check, instead of a grep across three languages. It also makes the open brand decisions
*answerable* — today there is no artefact to put a brand colour into.

**Migration risk.** Low but tedious, and it is behaviour-preserving only if done literally: replace
each literal with a token holding the identical value, in one commit, with the e2e screenshot
baselines as the evidence. Do not adjust any colour in the same change. **Do not pick new colours
here** — the palette itself is a product decision, and this finding is only about where it lives.

---

#### P2-F · CARRIED and GROWN (P2-4) · "Something has the viewer's attention" is now written four times in `App.tsx`

**Files:** `src/App.tsx:196–199` (`canNavigate`), `:226–232` (effect dependency array), `:312`
(the global Escape handler), `:365` (`suppressed={auditOpen}`)

Unchanged in mechanism, with a fourth site since the last pass. The same four flags — `auditOpen`,
`contactOpen`, `legalDoc`, `selectedCase` — plus `murciaRef.current?.hasFocusedDistrict` are
enumerated three times in three orders, and a fourth site now enumerates a **subset** of them
(`suppressed={auditOpen}` alone).

The silent failure the previous report described is unchanged: add a fifth overlay to `canNavigate`
and forget the dependency array, and `canNavigate` is correct while the rail is never repainted —
it goes on advertising a navigation the context refuses. `App.tsx` still records this having
already happened once.

Proposal unchanged: one `useAttention()` value exposing `{ anyOpen, closeAll }`; the dependency
array names the object; adding a flag means adding it to the hook and nowhere else.
`e2e/navigation.spec.ts` covers the rail's suppressed state.

---

#### P2-G · CARRIED and SHARPENED (P3-1, promoted) · The coverage gate covers 16 of the 46 modules that have unit tests, and three of the sixteen do not exist

**Files:** `vitest.config.ts:75–92`

The three stale paths the previous report named are **still there, unchanged**:

```
src/sceneVisibility.ts        → experiences/earth/config/sceneVisibility.ts
src/sequenceState.ts          → experiences/earth/config/sequenceState.ts
src/orbit-system/geoUtils.ts  → experiences/earth/orbit/geoUtils.ts
```

**What is new is the scale.** 46 modules under `src/` now have a sibling `.test.ts`. Sixteen are in
the coverage `include`. **Thirty are not**, including every pure module added since the last pass:

```
app/navigation/progressSpring.ts   app/navigation/pinchClassifier.ts
earth/orbit/panelExpansion.ts      earth/orbit/holoDeployment.ts
earth/orbit/resolveOrbitCases.ts   earth/orbit/orbitConfig.ts
earth/camera/scrubPose.ts          earth/camera/closeUpFraming.ts
murcia/navigation/navigableArea.ts murcia/scene/cityDistrictBindings.ts
content/site.ts                    app/auditSubmission.ts            … and 18 more
```

These are tested — 905 tests pass — but the 85/80/85/85 thresholds are computed over a set that
has not grown since August 20 while the tested surface roughly doubled. The threshold's stated
purpose is "to notice a REGRESSION — a module added to the list above with no tests". It cannot
notice one in thirty modules.

This is promoted from P3 to P2 for one reason: the previous report called the same file's own
reasoning "instructive", and it still is —

> "`.tsx` is included even though no component test exists yet: the failure mode of omitting it is
> a file named `AuditSection.test.tsx` that is silently never collected — no error, no warning, a
> green run that proves nothing."

— and the same failure mode has now arrived through the door the file did not guard, thirty times.

**Fix.** Correct the three paths, add the pure modules from the list, and re-baseline the
thresholds at what the suite actually achieves. **Risk:** none beyond discovering that a threshold
was being met by absence, which is the information the change exists to produce.

---

### P3 — Opportunistic improvement

---

#### P3-A · NEW · Two shared GPU geometries use a declared-owner singleton where the codebase already has a ref-counted answer to the same problem

**Files:** `src/experiences/earth/orbit/createHoloPanel.ts:369–387` ·
`src/experiences/earth/orbit/createEmitterCone.ts:166–202` ·
`src/experiences/earth/orbit/createOrbitSystem.ts:298–313` · `src/graphics/decoders.ts`

Both files hold `let sharedGeometry: THREE.…Geometry | null = null` at module level, lazily
constructed and released by `createOrbitSystem.dispose()` — never by the panels or cones
themselves. Both document the arrangement clearly and both are correct today.

`graphics/decoders.ts` solves the identical problem — one resource, many consumers, no natural
owner — with **ref-counted `acquire`/`release` pairs**, and the previous audit called it "the
best-factored change in the codebase". PRINCIPLES §31 states the pattern as the house rule:
"Acquire and release in pairs, like any other resource here."

Two solutions to one problem is the Phase 22 case. The functional difference only appears with two
concurrent orbit systems, and there is exactly one construction site (`OrbitSystemLayer`), whose
effect is deliberately narrow — so **this is not reachable today**, and React's StrictMode
double-invoke is sequential (dispose then rebuild), which the lazy getter handles by design.

The finding is the divergence, not a bug. `acquireSharedQuad()` / `releaseSharedQuad()` would make
these two modules read like `decoders.ts`, remove the need for `createOrbitSystem` to know that two
of its dependencies keep module state, and make a second orbit system safe rather than merely
absent. **Risk:** low; `check:earth` (25 assertions) covers the orbit system.

---

#### P3-B · NEW · `SatelliteDef` is an alias that gives DOM chrome an import into Earth's scene config

**Files:** `src/experiences/earth/orbit/orbitConfig.ts:267` · `src/components/CasePanel.tsx:2,6,44` ·
`src/App.tsx:56` · `src/components/SceneCanvas.tsx:13`

```ts
export type SatelliteDef = CaseStudy
```

A pure alias. `CasePanel` is DOM chrome rendering editorial copy; its data is a `CaseStudy` from
`src/content/types`. It reaches for it through a 3D scene module, under a name that describes where
it is drawn rather than what it is — Phase 25's exact signal, and Phase 3's pass-through.

Deleting the alias and importing `CaseStudy` directly removes one `components/ → experiences/`
edge, at the cost of four import lines. `orbitConfig.ts` keeps its careful "NO CONTENT RE-EXPORT
HERE" comment, which is about *values* and stays true — a type alias costs no bytes, which is
precisely why nobody noticed the coupling. **Risk:** none; type-only.

---

#### P3-C · CARRIED (P3-2) · `CameraRig.getPose` / `getEffectivePose`

Unchanged. `getPose()`'s own doc comment still reads *"Almost always the wrong one to read."*
Renaming to `configuredPose()` / `pose()` — making the safe one the short one — still costs six
call sites and removes the trap. 75 `check:district` assertions cover this rig.

---

#### P3-D · CARRIED, one item resolved, one new (P3-3) · Documentation drift on load-bearing text

1. **ADR 008 still misquotes the contract it defines.** `docs/adr/008-…:62` states
   `export type RenderRoute = 'composer' | 'direct'`. The shipped type at
   `graphics/renderableExperience.ts:60` has three members; the third is the composer-borrowing
   route ADR 005 requires. **Unchanged since 2026-08-20.**
2. **ARCHITECTURE §11 and §29 still do not name the navigation rAF.** §29 asserts "No uncontrolled
   permanent RAF loops exist" and §11 warns against loops accumulating "without explicit
   coordination". `createNavigationInput` owns a real, deliberate, self-stopping rAF (ADR 009) that
   neither document lists. ADR 009 does not list it either. **Unchanged.**
3. **NEW: two documents quote a superseded entry budget.** `ARCHITECTURE.md` §17 and the
   2026-08-20 report both say "320,000 B entry chunk". It is 332,000 B since 2026-08-26. §17's
   anecdote about `orbitConfig.ts` is one of the most useful paragraphs in the file and its
   punchline is a number that is now wrong by 12 KB.
4. **RESOLVED: the two stale doc paths.** `checks/navigation-zoom.ts` and `src/space/pointSprite.ts`
   now appear only inside dated reports and a quoted decision in `DECISIONS.md` — historical
   records, which are correct to leave alone.

The Stage-0 harness rule the previous report proposed — assert every backticked repo path in
`docs/**` resolves, excluding `docs/audits/reports/` — is still worth about fifteen lines beside
`checks/audit-hygiene.ts`, which already walks Markdown.

---

#### P3-E · NEW · `resolveDistrict` still calls the tag "the production mechanism"

**Files:** `src/experiences/murcia/interaction/resolveDistrict.ts:44–52`

The resolution-order doc comment reads:

> "1. `userData.district === binding.tag` — a Blender custom property, exported into glTF `extras`.
> **This is the production mechanism.**"

As of the same uncommitted change, it is not: the only shipped binding passes `tag: ''`, the tag
branch is skipped by construction, and the amended export contract says buildings are identified by
name. The tag path is still correct code and is still the right mechanism for a *district-as-cluster*,
if one is ever bound that way — so this is a comment fix, not a deletion. One paragraph, saying
which mechanism serves which shape. It belongs in the same commit as the rework.

---

#### P3-F · CARRIED (P3-5) · `src/components/` is still four unrelated kinds of thing

14 modules: DOM chrome (`CasePanel`, `AuditSection`, `ContactSection`, `LegalPanel`, `SiteFooter`,
`NavigationControl`, `CustomCursor`, `CaseChart`), the render host (`SceneCanvas`, `LazyScene`,
`SceneErrorBoundary`), **two experience layers** (`MurciaLayer`, `CornerLogoLayer`) and a dev tool
(`DebugOverlay`). Unchanged, including the cost: the two layers are outside every dependency rule
*because* the directory is generic (P1-B). Moving them is sufficient; the chrome is coherent as it
stands.

---

### Resolved since 2026-08-20

**P3-4 · `DistrictInteraction`'s per-district linear cost — resolved structurally.** The
one-service-per-building rework replaced N interactions with one interaction holding N sites:
five canvas listeners total instead of five per building, one hover raycast per frame instead of
one per district. The previous report said "measure at N=3 before optimising"; the measurement is
no longer needed because the shape that would have grown does not exist. The dependency object,
however, **grew from 16 fields to 17** — the `FramingContext` cluster the same finding named
(`camera`, `rig`, `getPose`, `getAspect`, `resolveBounds`, `groundPlaneHeight`, `focusFlight`) is
still seven parameters answering one question, now joined by `controller` and `tapThresholdPx`.
That half of P3-4 carries forward into Stage 3 unchanged.

---

## 5. Required analysis scenarios

Files that must change today, against the real tree. "After" assumes P1-A, P1-B, P1-C, P2-A, P2-B,
P2-D and P2-F.

| # | Scenario | Now | After | Notes |
|---|---|---|---|---|
| 1 | **Add another interactive district** | **3 files** — one row in `cityDistrictBindings.ts`, one district + N services in Sanity, one binding row per service | 3 | Still excellent, and *better* than 2026-08-20: services became documents, so a district reuses existing ones. The binding table is a genuine data change. |
| 2 | **Add another city** | **~16 files** — new experience dir, `ExperienceId` union, `App.tsx` state, `SceneCanvas` mount + route, `useExperienceTransition`, `navigationMachine.intentFor`, `isIntentLegal`, `towardOther`, pinch rival, paint direction, rail | ~14 | Was ~14. `ExperienceId` is still a two-member union, and there are now **9 binary ternaries in 5 files**, plus a `NavigationIntent` vocabulary (`enter-murcia`/`exit-murcia`) that names the second world in the type. ADR 009 §3's "the machine does not grow by scene" is still true *of the machine*; its edges grew. Not a defect — a cost to know before quoting a third world. |
| 3 | **Change renderer quality policy** | **1–2 files** — `SceneCanvas`'s `gl`/`dpr`, `FrameSettings` | 1–2 | Clean. ADR 008's contract does its job. |
| 4 | **Replace the camera transition implementation** | **~7 files** — `warpTransition.ts`, `useExperienceTransition`, `CameraController`, `scrubPose`, `MurciaLayer`, `murcia/camera/warpPose.ts`, `checks/warp-transition.ts` | ~7 | Inherent, +1 for the scrub. ADR 005 deliberately spreads one progress value across both worlds. |
| 5 | **Add a post-processing effect** | **2 files** — `RenderPipeline.tsx`, `FrameSettings` | 2 | Clean, including disposal. |
| 6 | **Change GLTF decoder infrastructure** | **1 file** — `graphics/decoders.ts` | 1 | Still the best-factored change in the codebase. |
| 7 | **Add a new type of clickable scene object** | **~5 files** — probe/interaction, `cursorManager`'s `PRIORITY` map, content type, invariants, mapper | ~5 | Correct centralisation, not amplification. |
| 8 | **Add another device capability rule** | **grep, then 3–16 sites** | **1–2** | Still the worst scenario, and the one P2-D fixes outright. |
| 9 | **Add a field to a content document** | **4 files in 2 packages** — Studio schema, GROQ projection, mapper + bound, type — with **no gate** on the pair agreeing | **3, gated** | **NEW scenario, and the one this pass adds.** See P1-A. |
| 10 | **Change the brand colour** | **grep across 2 stylesheets, 3 scene files, 2 notations** | **1–2** | **NEW scenario.** See P2-E. The brand palette is an open product decision, so this is a change that *will* happen. |

Scenarios 1, 3, 5, 6 and 7 are at or near the floor and have stayed there through 36,000 lines of
growth — that is the strongest evidence in this report that the architecture is sound. Scenarios
8, 9 and 10 are the outliers, and all three are missing-owner problems rather than structural ones.

---

## 6. Proposed target architecture

Unchanged in shape from 2026-08-20 — **no new layers, no rewrite** — with three additions the last
seven days made necessary.

### `src/platform/` — NEW (carried; now slightly larger)

- **Responsibility.** Every question about the device, the viewport, the visitor's stated
  preferences, **and what this build is allowed to do**.
- **Interface.** `prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`,
  `NARROW_MAX_WIDTH`, `DEBUG_TOOLS_ENABLED`.
- **Hidden knowledge.** Which media query encodes which decision; the `typeof matchMedia` guard;
  the 767/768 boundary and its agreement with the stylesheets; the `__VERTIGO_ENV__` define and its
  `typeof` guard for the esbuild-bundled harnesses.
- **Dependencies.** None. Leaf, like `utils/`.
- **Not in scope:** `intro-draw/`, which must keep its own copy and import nothing.

### `src/design/palette.ts` — NEW

- **Responsibility.** The colours the scene draws with, as the same decisions the stylesheets make.
- **Interface.** ~20 named constants as `0x` ints, mirrored by `--color-*` custom properties in
  `styles.css`.
- **Hidden knowledge.** That a design decision has two notations.
- **Dependencies.** None.
- **Not a design-system framework.** Twenty constants and one harness assertion.

### `src/content/invariants.ts` — GAINS the editorial bounds

- **Responsibility.** Extends from predicates to **bounds**: the ~24 lengths and counts currently
  duplicated between `content/collections/` and `sanity-studio/schemas/`.
- **Interface.** Named constants plus the existing predicates.
- **Hidden knowledge.** What "too long" means, once.
- **Dependencies.** Types only — the existing rule, and it is what makes a third consumer possible.
- **Consumers.** The vitest tier, the Node content build, **and the Studio**.

### `src/utils/` — GAINS the warp curves · `src/experiences/earth/config/` — GAINS the prototype gates

Per P2-B. What it unblocks: `no experience imports the application layer`, stated in full.

### `src/app/` — GAINS `TransitionState` and `attention`; LOSES four modules

- `{ progress, overlay, committed }`, created in `App.tsx` (P2-A).
- One `attention` value so the overlay set is enumerated once (P2-F).
- After P2-B, `app/` contains only orchestration, which is what makes the broad rule stay true.

### `src/experiences/murcia/` and `corner-logo/` — GAIN their layers · `src/components/` — NARROWS

Unchanged from 2026-08-20.

### `checks/` — GAINS a wider walk, six rules and one harness

- Walk root `content/` as well as `src/`
- `src/content/` imports no `node:` builtin and no DOM global
- root `content/` imports nothing under `src/` except `src/content/`
- nothing at the `src/` root but `App.tsx`, `main.tsx`, ambient declarations
- (after P2-B) `no experience imports the application layer`
- every `0x` colour in `palette.ts` has a `--color-*` twin in `styles.css`
- every `nodeName` in `cityDistrictBindings.ts` resolves in the GLB (**into `check:asset`**)
- **`check:studio`** — the Studio's own `typecheck`, skipping cleanly when it is not installed

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
   ┌───────────┬───────┼───────────┬────────────┬───────────┐
   ▼           ▼       ▼           ▼            ▼           ▼
 utils/    platform/  design/   content/   interaction/  loading/
(curves)  (device +  (palette)  (types,    (cursor, NDC)
           build Qs)             bounds)
                                    ▲
   intro-draw/ ── imports NOTHING.  │  Asserted at source AND on the emitted bundle.
                                    │
   content/ (root, Node) ───────────┤   one way, TO BE asserted
   sanity-studio/ (package) ────────┘   one way, TO BE asserted
```

### Dependencies to remove or invert

| Edge | Status | Action |
|---|---|---|
| `sanity-studio/` ↔ `src/content/invariants` | **absent — and the absence is the bug** | **Create it** (P1-A). One definition, three consumers. |
| `components/MurciaLayer` → `experiences/earth/` | live, unenforced | Remove via P2-A, then move the file (P1-B) |
| `components/SceneCanvas` → `experiences/earth/timeline` (for the logo) | live | Move `CornerLogoHandle` to `corner-logo/` |
| `components/CasePanel` → `experiences/earth/orbit` | live, **type-only, free to remove** | Delete the `SatelliteDef` alias (P3-B) |
| `components/AuditSection` → `src/auditView` ← `experiences/earth/` | invisible, per-frame | Fold into the passed-object pattern |
| `experiences/earth/` → `app/` (**10 edges, 4 modules**) | live, blocks the rule | Three moves (P2-B) |
| root `content/` ↔ `src/` | one-way, **unasserted** | Assert (P1-C) |
| `sanity-studio/` typecheck ↔ any gate | **absent** | `check:studio` (P1-C) |

No inversions are required. The direction is right everywhere; what is missing is enforcement,
one dependency that should exist and does not, and in three places a file's location matching its
role.

---

## 8. State ownership model

Delta only; everything not listed is unchanged from 2026-08-20 §8 and correct.

| State | Should live | Today | Action |
|---|---|---|---|
| Transition progress / overlay / **committed** | `app/` | **three** fields inside Earth's `SequenceState` | **P2-A** |
| Overlay/attention flags (4) | `App`, as one value | **four** separate enumerations | **P2-F** |
| **Editorial bounds** | `src/content/invariants.ts` | **duplicated across two packages, ~24 pairs** | **P1-A** |
| **Palette** | `design/palette.ts` + `:root` | 15 CSS hexes, 13 TS ints, 147 rgba, no tokens | **P2-E** |
| Build environment | `platform/` | `app/buildFlags.ts` | P2-B |
| Prototype gate params | `experiences/earth/config/` | `app/protoSky.ts`, `app/protoHolo.ts` | P2-B |
| Audit recomposition | Earth (both readers are Earth layers) | module singleton at `src/` root | carried |
| Debug camera handle | Earth, dev-only | `window.__vertigoProto` | none — gated on `DEBUG_TOOLS_ENABLED`, correct |

### Duplicate sources of truth

The previous pass found exactly one (the breakpoint). There are now **three**, and the two new ones
are larger:

1. **Editorial bounds** — ~24 pairs across two packages (**P1-A**)
2. **The palette** — two notations, no owner (**P2-E**)
3. **The mobile breakpoint** — still six sites in three languages (**P2-D**)

Near-misses worth naming so a later pass does not re-report them: `ExperienceId` is deliberately
not duplicated into `navigationMachine`; the re-entrancy guard lives only in
`useExperienceTransition`; `tapThresholdPx` is passed to `DistrictInteraction` from the same config
the drag controller reads, and the file explains why measuring in both places is deliberate. All
three are the right instinct applied on purpose.

---

## 9. Resource ownership model

The strongest part of the architecture, and it survived the growth. Additions since 2026-08-20:

| Resource | Owner | Created | Disposed | Notes |
|---|---|---|---|---|
| Shared holo-panel quad | **module-level, owner declared** | first `getGeometry()` | `createOrbitSystem.dispose()` | Documented; safe sequentially. P3-A proposes ref-counting for consistency with `decoders.ts`. |
| Shared emitter-cone frustum | same | same | same | same |
| Brand atlases (isotype, logo) | `createOrbitSystem` | construction | `dispose()` | Canvas raster, deferred flush via one-shot rAF, guarded by a `disposed` flag. |
| Per-site highlight + label | `DistrictInteraction` | constructor | `dispose()` | **N sites, one owner** — the rework's structural win. |
| Murcia DOM overlay + panel listeners | `districtPanel` / `MurciaLayer` | effect | `host.remove()` | 4 listeners in the panel, disposed with it. |
| `window.__vertigoProto` | `debugCameraHook` | effect, dev only | `delete` on cleanup | Installed only when `DEBUG_TOOLS_ENABLED`. |

**One rule is still stated and unenforced**, carried from 2026-08-20: disposal completeness.
`disposal.ts` enumerates material texture slots by reflection *specifically* because a hardcoded
list "fails as a leak rather than as an error". Nothing asserts that `MurciaExperience.dispose` or
`createOrbitSystem.dispose` covers every field they construct. A harness that counts GPU objects
across a build/dispose cycle is worth doing and is not urgent — and it is now worth slightly more,
because `createOrbitSystem.dispose()` has grown to twelve explicit releases enumerated by hand.

---

## 10. Refactoring roadmap

Incremental. **Every stage leaves the application deployable**, and every stage is independently
valuable.

The previous roadmap was not executed, so this one is re-ordered around a blunter question: *what
can break in production, and what costs nothing to prevent?* Stage 0 is now a few hours of work
that removes the only known way for a non-engineer to break the deployment.

### Stage 0 — Stop the bleeding (do first; nothing depends on it)

1. **Add `ID_PATTERN` and a `slugify` to the four Studio slug fields** (P1-A step 1). One file.
   This alone closes the editor-breaks-the-deploy path.
2. **Widen `checks/architecture.ts` to root `content/`** and add the four purity rules (P1-C).
   Additive; they pass today.
3. **Add `check:studio`** to `check:harnesses`, with a clean skip when `sanity-studio/node_modules`
   is absent (P1-C).
4. **Fix `vitest.config.ts`'s three stale paths and add the thirty tested modules**; re-baseline
   the thresholds (P2-G).
5. **Delete `check:asset`'s two obsolete tag assertions**, add the `nodeName` resolution assertion,
   restate TEXCOORD_0 as pending. **Do not chain it yet** (P2-C).

*Deployable: yes. One CMS schema change, everything else is check configuration.*

### Stage 1 — Give the duplicated knowledge an owner

6. **Move the ~24 editorial bounds into `src/content/invariants.ts`**; mappers import them
   (P1-A step 2).
7. **Have the Studio import them** — or, if that coupling is rejected, add the pairing harness
   (P1-A step 3).
8. **Create `src/platform/`**; migrate the ~16 capability sites and `buildFlags.ts`; pick one
   predicate for "touch" and one breakpoint constant, asserted against the stylesheets (P2-D, P2-B).

*Deployable: yes. Step 8 changes behaviour in exactly one direction — three sites gain a
`typeof matchMedia` guard they lacked. Check `AuditSection.test.tsx` under jsdom.*

### Stage 2 — Clarify ownership (behaviour-preserving moves)

9. **Extract `TransitionState` out of `SequenceState`** (P2-A). `check:warp`'s 47 assertions cover it.
10. **Move the warp curves to `utils/` and the prototype gates into `experiences/earth/config/`;
    replace the narrow harness rule with the broad one** (P2-B).
11. **Move `MurciaLayer` → `experiences/murcia/`, `CornerLogoLayer` → `corner-logo/`**; add the
    `src/`-root rule (P1-B). Only possible after 9.
12. **Delete the `SatelliteDef` alias** (P3-B). Type-only, five minutes.

*Deployable: yes. Pure moves plus one type split; every step verifiable by `npm run check`.*

### Stage 3 — Deepen abstractions

13. **Give `attention` one owner in `App.tsx`** (P2-F).
14. **Introduce the palette tokens**, literal-for-literal, with the e2e baselines as evidence
    (P2-E). Do not change a colour in this commit.
15. **Fold `auditView` into the passed-object pattern** and document the five publish channels in
    ARCHITECTURE §14 (carried).
16. **Rename `CameraRig.getPose` / `getEffectivePose`** so the safe one is the short one (P3-C).
17. **Group `DistrictInteraction`'s framing dependencies into a `FramingContext`** (carried from
    P3-4's surviving half).
18. **Ref-count the two shared orbit geometries**, matching `decoders.ts` (P3-A).

*Deployable: yes. Each is independently revertible.*

### Stage 4 — Close the last gate

19. **Chain `check:asset` into `check:harnesses`** — only once Stage 0 item 5 is done (P2-C).
20. **Add the disposal-completeness harness** (§9).

### Stage 5 — Documentation

21. **Amend ADR 008** with the third `RenderRoute` member.
22. **Amend ARCHITECTURE §11 and §29** to name the navigation rAF; add a line to ADR 009.
23. **Correct the 320,000 B entry budget** in ARCHITECTURE §17 to 332,000 B.
24. **Update ARCHITECTURE §15** — `platform/` exists and is where capability detection lives.
25. **Fix `resolveDistrict`'s "production mechanism" paragraph** (P3-E) — ideally in the same
    commit as the district rework, not here.
26. **Amend this brief's Phase 1 and Phase 27** — there are eight gated harnesses, not five or six.
27. **Add the docs-path harness rule** beside `audit-hygiene.ts` (P3-D).

---

## Appendix — what this audit deliberately did not report

Carried from 2026-08-20 and re-verified, plus what this pass adds. Recorded so a later pass does
not spend the effort again.

- **Both experiences permanently mounted** — ADR 001, ADR 003.
- **Earth and Murcia having different lifecycle shapes** — ARCHITECTURE §7, ADR 003.
- **Murcia bypassing the composer** — ADR 001, amended by ADR 005 for warps only.
- **The transition writing into a shared mutable object rather than React state** — plan 002 §1.2.
  *Which* object is P2-A; that it writes into one is correct.
- **`window.__vertigoIntro`** — load-bearing; a static import hoists `intro-draw` into a shared
  chunk and fails the standalone assertion in `vite.config.ts`.
- **`window.__vertigoProto`** — dev-only, gated on `DEBUG_TOOLS_ENABLED`, and it closes a gap
  `e2e/backdrop.spec.ts` names out loud. Correct.
- **38% comment density** — PRINCIPLES §24 asks for these comments and they are `why`, not
  restatement. Only the drift is a finding (P3-D, P3-E).
- **`MurciaExperience` at 783 lines, `DragPanController` at 890, `createNavigationInput` at 932** —
  deep modules with small interfaces over substantial hidden complexity. Splitting for size is an
  explicit anti-goal, and none shows shallow-module symptoms.
- **`cityDistrictBindings.ts` holding one district** — incomplete, not wrong.
- **`intro-draw`'s duplication of reduced motion and easing** — required; it may import nothing.
- **The entry budget raised 320,000 → 332,000 B** — raised with a measurement and a written
  argument in `vite.config.ts`, including the check that three.js had not leaked back in. That is
  how a budget should be raised. Only the two documents still quoting the old number are a finding.
- **`orbitAssignments.ts` living in scene code rather than in content** — argued at length in the
  file, and gated: `resolveOrbitCases.test.ts` resolves the real table against the real presets and
  the real generated content, and `npm run build` runs `npm run check` before `vite build`.
  Unpublishing a case study fails the build, loudly, which is the intent.
- **The Studio's separate `tsconfig.json` and lockfile** — argued in the file, and the argument is
  right: coupling `npm run check` to the Studio's dependencies would make every Vercel deploy
  depend on installing Sanity. What is missing is a gate that runs the Studio's *own* check
  (P1-C), which is a different thing.
- **The content build being fail-closed** — `scripts/build-content.ts` states the case and it is
  correct. P1-A is not an argument against failing closed; it is an argument that the editor should
  never be able to reach the failure.
- **`ExperienceId` as a two-member union** — the third world does not exist and speculative
  generalisation is an explicit anti-goal. Its cost is quantified in scenario 2 so it can be
  priced, not fixed.
- **`sanity-studio/dist/`, `.sanity/` and `.env`** — build output and local configuration, all
  correctly gitignored; 19 tracked files in that package, none of them generated.
