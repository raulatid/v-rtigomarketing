# Architecture, dead code and technical debt audit — 2026-09-15

**Date:** 2026-09-15 · **Against:** working tree at `06d8bd8b78531670ef4001fd049c26ad8a85f97a`
**Brief:** `audits/architecture-complexity-refactoring.md`

> **Translation note:** This English version preserves the original audit's baseline, findings, measurements and historical source paths. References to `records/` describe its original location; the report now lives in `reports/`. Some cited files were subsequently moved or removed. For implementation outcomes, see the [stages 0–5 closeout](../../plans/031-architecture-audit-stage-5.md). This translation is not a new audit.

Fourth pass, written as a delta against the [September 2 report](../reports/architecture-complexity-refactoring-2026-09-02.md), which continues the August passes. This report takes precedence on the points it reassesses; the remaining historical findings are not considered reverified. It is saved in `records/` at the user's explicit request; previous passes remain in `reports/`.

**Scope:** architecture and maintainability review, with no changes to implementation, dependencies, assets or configuration. At the start, the only unrelated untracked file was `.claude/settings.local.json`; it was neither read nor modified. No commit was created.

## 1. Executive assessment

**Classification: healthy, but accumulating complexity.** The fundamental boundaries remain protected and tests pass. Debt is concentrated in remnants of replaced features, shared responsibilities with the wrong owner, and repeated rules that require coordinated changes.

There is **one verified build blocker**: initial JavaScript exceeds the configured budget. This is neither an estimate nor a style proposal. The other findings distinguish maintenance debt, future functionality and removal candidates; they are not presented as demonstrated runtime errors.

Priorities:

1. Restore compliance with the build budget (AR-01).
2. Remove code without consumers and finish retiring the old banner (AR-02, AR-12).
3. Share LED screen coordination and the forms' response protocol (AR-03, AR-07).
4. Correct ownership and safeguards: navigation state, directory boundaries and coverage selection (AR-04 through AR-06).

The assessment follows the repository's own criterion: reduce the knowledge each consumer needs, rather than indiscriminately reducing lines. Sources: [Engineering Principles](../../ENGINEERING_PRINCIPLES.md), especially §§5–17, 21, 31, 33 and 39; [architecture brief](../architecture-complexity-refactoring.md).

## 2. Method and checks

The review inspected entry points, static imports and literal dynamic imports, consumers, implementations and tests for the identified modules, build scripts, content contracts, Studio, documentation and tracked assets. Imports and reexports were traversed using the installed TypeScript AST to cross-check the regex-based harness, without adding dependencies.

The search for files without consumers started from `src/main.tsx`, `src/entries/blog.tsx` and `src/intro-draw/boot.ts`; references in tests, harnesses, scripts and content were also checked. Having a test does not make a module production code. An export without an external consumer is not necessarily dead code either: it may be used within its own file.

| Check executed | Result and limitation |
|---|---|
| `npm run typecheck` | Passes. |
| `npm run test -- --reporter=dot` | **120 files, 1,792 tests; all pass.** |
| `npm run check:harnesses` | Passes: architecture, hygiene, navigation, footprint, campus, Earth, warp, space, asset contract and Studio typecheck. |
| `node_modules/.bin/vite.cmd build` | **Fails** the initial JS budget: 1,613,978 B against 1,610,000 B; excess of 3,978 B. |
| AST analysis and reference searches | Reachability findings manually cross-checked; not a substitute for tree shaking or execution coverage. |
| Asset inventory | 65 tracked files under `public/`; two older GLBs with no textual references found, described as candidates rather than safe deletions. |
| New report hygiene and links | **16/16 checks pass; 41 local links, all resolve.** The harness was reused with only its input directory changed in a temporary execution copy. |

`check:audit` still targets `reports/`; its normal execution does not automatically include `records/`. This report's check did cover `records/`, without modifying project configuration. If that directory is adopted for future audits, it must be added to the gate.

No E2E tests, instrumented coverage, publishing or CMS queries were run. The build used the generated content already available: **this does not verify fresh generation from Sanity or a production deployment**. The failed build does not establish final delivery sizes or verify all subsequent output. Budgets were not disabled to obtain a passing result.

The plugin search found no callable `/review` in this session; the audit was performed directly against the repository. No plugin was installed.

## 3. Current map and owners

| Area / entry point | Responsibility and interface | State, resources and lifecycle |
|---|---|---|
| `intro-draw/boot.ts` | Visual startup before React; handoff through the boot contract. | Drawing and readiness signals; must preserve independence from external imports. |
| `main.tsx` → `App.tsx` | Site composition, experience selection, panels, navigation and blog access. | Discrete React state; shared continuous signals and engine references. |
| `entries/blog.tsx` → `BlogRoute` | Second HTML entry; article navigation through `useRoute` and the `host` contract. | History and scroll; the header logo has its own runtime. |
| `SceneCanvas` → `graphics/` | Mounts experiences and adapts state to rendering policy. | R3F owns the main canvas; `RenderPipeline` owns the composer and effects. |
| `EarthExperience` | R3F tree for the intro, orbits, camera and interaction. | React controls mounting; the timeline and layers read/mutate continuous signals. |
| `MurciaLayer` → `MurciaExperience` | City loading and lifecycle: `load`, activation, `update`, `dispose`. | The city's scene, camera, rig, interactive content, resources and imperative UI. |
| `campus/createServicesCampus` | Assembles the lake, particles, content, accessible input and section camera. | Subsystem owner; releases interaction, accessibility and campus resources. |
| `landmark/towerScreen` and `campusScreen` | LED screens; content → composition → facade, with a carousel. | Shared engine, but duplicated coordination; AR-03. |
| `src/content/` | Types, invariants, lookups and generated browser content. | Data; must not know about scenes or Node infrastructure. |
| `content/` and `scripts/build-content.ts` | Content retrieval, normalization, validation and generation. | Build IO; depends on the `src/content/` contract, never the reverse. |
| `api/` → `server/` | HTTP adapters and form processing. | Server-side validation, configuration and delivery; the browser accesses it over HTTP. |
| `sanity-studio/` | CMS contract and editing, in an independent package. | Its own compilation; preserve this boundary. |
| Vite, `scripts/`, `checks/` | Builds, static routes, budgets and executable contracts. | IO and checks; Vite still accumulates publication policy, AR-08. |

Primary sources: [App](../../../src/App.tsx), [SceneCanvas](../../../src/components/SceneCanvas.tsx), [MurciaExperience](../../../src/experiences/murcia/MurciaExperience.ts), [campus](../../../src/experiences/murcia/campus/createServicesCampus.ts), [architecture harness](../../../checks/architecture.ts).

### Changes since the previous pass

- **Boundary protection improved:** the harness now traverses `src`, `server`, `api` and `content`, and Studio compiles within `check:harnesses`. The previous claim that the entire content build remained outside the checks is no longer valid.
- **Article-head logic has a tested module:** `scripts/blogShell.ts` and its tests. The claim that all this logic is inaccessible to tests should not be repeated. Responsibilities and a local copy remain in Vite, AR-08.
- **Coverage expanded, but drifted again:** the comment promises all modules with an adjacent test; the list remains manual, AR-06.
- **`warpTransition` is in `utils/`:** the move is complete. Other experience-to-`app/` imports remain, AR-05.
- **The previous services district was replaced by the campus:** its main implementation and harness were removed; some remnants remain. [Plan 024](../../plans/024-services-campus.md).
- **The blog does have its own 3D logo:** the September 4 amendment to [ADR 013](../../adr/013-the-blog-is-a-second-document.md) accepts it. Loading Three.js is not, by itself, reported as a regression.

## 4. Prioritized findings

### AR-01 · P1 · The current tree exceeds its build budget

**Evidence:** [vite.config.ts](../../../vite.config.ts), check at line 483. Execution reports `initial JS for / is 1613978B over 11 requests`, budget `1610000B`, excess `3978B`. This happened before the report was written and without code changes.

**Mechanism and impact:** the safeguard measures an initial loading closure, not just the entry file. An addition to one section can block the entire build. The largest counted chunks are Three.js (820,921 B), SceneCanvas (261,077 B), useRoute (227,998 B) and MurciaExperience (162,145 B). Their names alone cannot attribute all their bytes to a single functional owner.

**Proposal:** ownership remains with the existing loading/build policy. Attribute growth by module and review what belongs in that closure, using the loading contract as the boundary. Compare two options: reduce code that is actually emitted, or reconsider preloading that the product no longer requires. Raising the limit requires a separate measured justification; it does not itself address the cause.

**Expected reduction / risk:** restore successful builds and room for changes without degrading startup. Medium/high risk if lazy boundaries move. Validate with a complete build and a behavioral check of the affected route. **Deleting files that are already excluded from bundles is not promised to recover these bytes.**

### AR-02 · P2 · Interaction remnants without production consumers

**Evidence:** [touchTarget.ts](../../../src/interaction/touchTarget.ts), lines 21–108, is imported only by its test. In [navigationBounds.ts](../../../src/experiences/murcia/navigation/navigationBounds.ts), `unionRect` at line 42 and `containsRect` at line 52 have no internal calls or external references in the inspected code.

**Mechanism:** the touch module retains the replaced display's contract; the rectangle helpers retain knowledge of a firm boundary and an extended one that the file itself says were retired. They look like current utilities and continue to increase the maintenance surface. An interaction adjustment could lead someone to modify or reuse the wrong implementation.

**Proposal:** remove the touch module and its test if no current consumer needs to adopt it; remove the two uncalled helpers. Current interaction remains owned by `campusInteraction`, `panelPointer` and their respective contracts, without creating a universal utility.

**Reduction / risk:** three files affected through deletions and editing, with one obsolete API removed. Low risk for the known runtime; verify references and typecheck. The absence of consumers **does not demonstrate** a touch-target sizing defect in the current controls.

### AR-03 · P2 · Tower and campus duplicate the LED screen lifecycle

**Evidence:** [attachCampusScreen.ts](../../../src/experiences/murcia/campus/campusScreen/attachCampusScreen.ts), lines 104–193, and [attachTowerScreen.ts](../../../src/experiences/murcia/landmark/towerScreen/attachTowerScreen.ts), from line 120. Mesh lookup, composition creation, default playlist, carousel, composition selection, `ready`, updates and cleanup are repeated. The campus file's header acknowledges the copy.

**Mechanism:** the graphics engine is already shared, but a fix to asynchronous readiness or disposal must be applied to both adapters. Campus also imports helpers from the tower adapter, learning a consumer's name to use a shared capability.

**Proposal:** one LED player owner within Murcia, with a `ready / update / dispose` interface. It hides the carousel, compositions and `disposed` state; it receives a mesh, document and rendering options. Adapters retain their nodes, palette, resolution, UV/orientation and material restoration policy. Comparison: reusing `attachTowerScreen` directly adds options unrelated to the campus; extracting shared coordination preserves distinct responsibilities.

**Reduction / risk:** changes to the common lifecycle happen in one place. Medium risk: material and resolution policies legitimately differ. Preserve and run both adapters' tests; add only shared `ready` and disposal contracts. Visually inspect both screens during implementation.

### AR-04 · P2 · Global navigation state still lives in Earth

**Evidence:** [sequenceState.ts](../../../src/experiences/earth/config/sequenceState.ts), lines 15–82, contains `transitionOverlay`, `transitionProgress`, `transitionCommitted`, `zoomDepth`, `approach` and `hintAllowed`. The application writes or coordinates them; [MurciaLayer](../../../src/components/MurciaLayer.tsx), lines 269–284, consumes transition and zoom. [App](../../../src/App.tsx), line 277, publishes hint permission. This continues September's P2-A with a broader scope.

**Mechanism:** changing shared navigation requires knowledge of a specific intro's state. A mutable object is appropriate for high-frequency updates; its conceptual owner is not. Adding another city would extend this knowledge of Earth to a third consumer.

**Proposal:** separate continuous navigation state into the application layer and provide narrow views to the experience adapters. Keep phase, intro warp and orbits under Earth. Hint permission should arrive as an explicit orchestration signal. Comparison: renaming everything as global state preserves the coupling; separating by writer/responsibility reduces the exposed information.

**Reduction / risk:** a shared policy no longer requires changes inside Earth. Medium/high risk because of reference identity and per-frame updates. Preserve the mutable channel; validate transition, zoom, navigation and warp. Do not introduce per-frame React state or a store library.

### AR-05 · P2 · The directory structure permits reverse imports that the harness does not forbid

**Evidence:** there are **13 imports from experiences into `src/app/`**: `buildFlags`, `protoSky`, `protoHolo`, `protoHint` and `protoTutorial`. Two other Earth imports reach `src/auditView.ts`. Section 2 of the [harness](../../../checks/architecture.ts) explains why it only forbids `experiences → app/navigation`. [MurciaLayer](../../../src/components/MurciaLayer.tsx) lives among general components; [CornerLogoLayer](../../../src/components/CornerLogoLayer.tsx) and [auditView](../../../src/auditView.ts) are also separated from the domains they represent.

**Mechanism:** the directory no longer communicates dependency direction and ownership. Someone adding a scene flag finds a precedent in `app/`, and the safeguard allows that inversion to continue. This carries forward P1-B/P2-B from the previous pass; the new server/content protection narrows its scope but does not resolve these imports.

**Proposal:** put build/debug policy in shared infrastructure, Earth-only parameters inside Earth, the Murcia adapter alongside Murcia and the logo layer alongside `corner-logo`. Explicitly decide the `auditView` interface between orchestration and Earth; do not hide it by moving it to a generic directory. Then expand the harness to prevent experiences from importing the application.

**Reduction / risk:** flag and lifecycle changes become locatable within their domains; exceptions at the boundary disappear. Medium risk because of chunking: move files and update imports in stages, with the harness, typecheck and build. Do not impose a blanket prohibition that breaks deliberate lazy boundaries.

### AR-06 · P2 · Declared coverage no longer includes every tested module

**Evidence:** `coverage.include` in [vitest.config.ts](../../../vitest.config.ts) promises all modules with an adjacent test, but lists paths manually. Cross-checking it against tracked files under `src/` shows that **27 of 94 modules with a same-name test are excluded**. Examples: `backgroundMusic`, `introSkip`, `NavigationControl`, `lightmapManifest`, `blogTransition`, `campusCamera`, `attachTowerScreen`, `attachCampusScreen` and `mediaFacade`.

**Mechanism:** adding tests does not add the module to measurement, despite what the comment claims. The policy requires coordinating each addition with another file and keeps accumulating omissions. The tests do run; the defect is coverage selection, not test discovery.

**Proposal:** derive selection from the actual adjacent-test convention, with explicit exceptions, or add an equality check that fails when a path is missing. Keep modules without justifiable unit coverage outside the selection. `package.json` runs `vitest run` without coverage: decide and document whether thresholds are a manual tool or a gate; do not describe them as an existing automatic safeguard.

**Reduction / risk:** a new test no longer requires remembering a second list. Low runtime risk, medium risk to gate expectations: run coverage once when correcting selection and explain any adjustment; do not automatically lower thresholds. No percentages were measured in this audit.

### AR-07 · P2 · Forms repeat an identical response protocol

**Evidence:** [auditSubmission.ts](../../../src/app/auditSubmission.ts), from line 80, and [contactSubmission.ts](../../../src/app/contactSubmission.ts), from line 40, repeat `codeForStatus`, `fieldsIn`, timeout, JSON reading and the requirement for `{ ok: true }`. They already share [SubmissionError](../../../src/app/submissionError.ts); both endpoints delegate to the shared server.

**Mechanism:** changing an HTTP status's meaning or error normalization requires updating two implementations and their tests. The Contact comment justifies separating payloads and endpoints, which remains valid; it does not require duplicating interpretation of the same response.

**Proposal:** retain `AuditRequest`, `ContactRequest`, their endpoints and public factories. Share response interpretation first, within the submission protocol owner; share timeout/POST only if that boundary is preserved. Comparison: a form factory that knows both payloads couples domains; a response reader needs to know neither.

**Reduction / risk:** one HTTP → `SubmissionError` translation; a protocol change in one place. Low/medium risk. Preserve transport tests for both endpoints, especially errors, non-JSON bodies and 2xx responses that do not confirm receipt. This challenges documented duplication, not an inadvertent decision.

### AR-08 · P2 · Vite still contains publication policy and a copy of a tested utility

**Evidence:** [vite.config.ts](../../../vite.config.ts): `blogRouting` (564), `apiRouting` (638), `introEntry` (740), `seoAssets` (906), `blogRoutes` (1008) and `replaceExactlyOnceOrThrow` (1085). The last is described as a local copy of [blogShell.ts](../../../scripts/blogShell.ts). The import harness does not traverse `scripts/` or Vite. Existing [Vercel configuration tests](../../../scripts/vercelConfig.test.ts) verify headers, not complete route equivalence.

**Mechanism:** routes, canonicals, the sitemap and HTML replacements require understanding bundler hooks and the frontend contract. Changing a URL's shape affects the router, hosting configuration and HTML generation. This partially continues the earlier P1-A/P1-C findings; it is lowered to P2 because of the extraction and testing already completed.

**Proposal:** keep Vite adapters thin and extract pure document/URL policy into testable build tools with explicit inputs. Reuse the existing exact-replacement operation instead of maintaining another copy. Establish a shared contract comparing emitted and expected routes, including the index, valid/unknown slugs and encoding. Do not create a plugin framework.

**Reduction / risk:** changing policy no longer requires interpreting hook order across all its variants. Medium risk: preserve emission order, chunk boundaries and aborted-build handling. Verify HTML output and routes; preserve existing tests.

### AR-09 · P2 · Motion preference is captured under different policies

**Evidence:** [boot.ts](../../../src/intro-draw/boot.ts), line 52, captures the preference; [SceneCanvas](../../../src/components/SceneCanvas.tsx), line 132, stores its own reading through `prefersReducedMotion()` in a ref. [MurciaExperience](../../../src/experiences/murcia/MurciaExperience.ts), lines 268–269, reads it again during construction; [AuditSection](../../../src/components/AuditSection.tsx), line 440, reads it on opening; [headerLogoRuntime](../../../src/blog/headerLogoRuntime.ts), line 181, creates its own query. Navigation, timeline, cursor and blogTransition also query it.

**Mechanism:** the same system setting can be observed at different times. Changing when the preference is respected requires reviewing multiple layers. The example of divergence is a preference change between startup and panel opening; this was not visually reproduced in this pass.

**Proposal:** first define whether the policy is a per-document snapshot or an updatable signal; share it within the app and pass it to engines. Preserve the small boot entry's independence and the blog document's independence through a handoff contract, not an import that breaks isolation. Sharing the JavaScript decision does not remove CSS media queries.

**Reduction / risk:** one owner per document and explicit temporal semantics. Medium risk because changes may be perceptible; preserve the chosen policy and check preference changes, late mounting and navigation. Do not collapse every width, hover or memory query into a single `isMobile` flag: these are distinct capabilities.

### AR-10 · P3 · The tower content parser is unused infrastructure for a future integration

**Evidence:** [parseTowerContent.ts](../../../src/experiences/murcia/landmark/towerScreen/content/parseTowerContent.ts), lines 7–11, explains that defaults do not pass through it and that it is being prepared for a future CMS. Only its test imports it; `parseBlocks.ts` and `guards.ts` form that subgraph. `attachTowerScreen` receives a typed `FacadeContentDocument` directly.

**Mechanism:** future format evolution must maintain a parser that the product does not need today. Having tests does not demonstrate CMS integration. This is deliberate provision for future work, not accidentally forgotten validation.

**Proposal:** remove the parser, its exclusive helpers and tests if there is no committed integration; reintroduce them with the external boundary when it exists. Alternatively, retain them with an explicit activation task/criterion. Do not arbitrarily route internal data through the parser merely to justify its existence.

**Reduction / risk:** four fewer files of speculative infrastructure; low risk for the current application, subject to checking consumers and shared types first. Do not remove content types that the engine still uses.

### AR-11 · P3 · Two older models remain in the publishable asset tree

**Evidence:** `public/models/murcia-v2-vertexcolor.glb` (**3,912,228 B**) and `public/models/murcia-v5.glb` (**3,323,824 B**) have no references by name in the inspected code, configuration, scripts or tracked documentation. Both also appear in `dist/models` after the build attempt. Together they total **7,236,052 B (~6.90 MiB)**. The executed asset contract uses `murcia-v7.glb`.

**Mechanism:** `public/` mixes delivery assets with working versions. Keeping another version there expands the publishable files even if the application does not download it initially.

**Proposal:** check their authoring purpose and remove historical models with no current purpose from the publishable tree. An asset that is still used for authoring needs an explicit location/workflow. Do not delete historical documentation or models merely because their names contain an earlier version.

**Reduction / risk:** a smaller static deployment surface; **no claim of saving 7.24 MB on initial loading**. Medium confidence: `appConfig.ts` permits `?model=/models/...` for debugging, and those URLs may be used outside the repository. They are therefore candidates, not demonstrated dead code. Verify that use before removing them.

### AR-12 · P2 · The retired banner is still validated and downloaded during the build

**Evidence:** Studio's [siteSettings.ts](../../../sanity-studio/schemas/siteSettings.ts), lines 350–373, states that nothing on the site has read those fields since September 10 and hides them. [site.ts](../../../src/content/site.ts), line 90, still exports `BUILDING_BANNER` without a consumer. [siteSettings.collection.ts](../../../content/collections/siteSettings.collection.ts), lines 299, 314–315 and 380, still projects, mirrors and validates `bannerImage` / `bannerEnabled`. Its types, invariants and tests remain.

**Mechanism:** this is more than a leftover export: a retired capability retains IO and validation dependencies in the active pipeline. Studio's own comment acknowledges the pending cleanup. A failure of this obsolete resource can still affect generation even though rendering no longer uses it; that failure was not induced during this audit.

**Proposal:** finish removal across projection, mirroring, normalization, the generated contract, invariants and tests; preserve existing CMS values non-destructively while deciding their migration. The current owner of visible content is `towerContent.ts`; do not make it depend on the old banner again.

**Reduction / risk:** eliminate an external dependency and its contract, which is dead at runtime. Medium risk because of persisted data and regeneration: update all layers consistently and run the content build in an authorized environment during implementation. Do not delete Sanity data as part of code cleanup.

## 5. Inventory of exclusions and exceptions

| Item | Classification | Action |
|---|---|---|
| `touchTarget.ts` + test; `unionRect`, `containsRect` | No current consumers, confirmed | AR-02. |
| Tower parser + helpers | Test-only; future CMS intent acknowledged | AR-10; distinguish future intent from current use. |
| `BUILDING_BANNER` | No runtime reader; pipeline still active | AR-12; deleting the export is not enough. |
| `viewportFootprint.ts` | Outside application entries, used by `checks/footprint.ts` and `checks/warp-transition.ts` | Retain. A mathematical verification tool is not dead code. |
| `district/serviceCopy.ts`, `district/ui/districtA11y.ts` | Legacy names, used by campus | Preserve behavior. Optional local relocation when working on campus; do not delete the entire `district` directory. |
| `frustumExtents`, `readMusicStatus`, `createDefaultWarpLimits` | No external consumers, but called within their modules | Not dead code. Reduce exports only if that improves clarity. |
| `proto*`, debug modules, shaders and sky tools | Entered through flags, dynamic imports or authoring scripts | Do not classify by name or absence from the normal route. |
| `dist/`, `out/`, `coverage/`, `test-results/` | No tracked files under these paths | Not tracked duplication of the product. The user's local outputs were not deleted. |
| WordPress documentation and earlier audits | History marked as superseded | Retain; ADR 011 explicitly requires it. |
| npm dependencies | No production dependency has been demonstrated to be entirely unused | Do not recommend uninstalling based solely on the main route. |

This does not claim an exhaustive review of every CSS selector or dynamically read property. A static export inventory produces candidates; the deletions recommended here also require the documented manual checks.

## 6. Minimal target architecture and dependency direction

| Proposed owner | Interface and hidden knowledge | Dependencies / lifecycle |
|---|---|---|
| Navigation orchestration | Narrow transition/zoom views; hides writers and progress rules | Shared infrastructure. Continuous document state, without per-frame React updates. |
| Platform/build infrastructure | Debug policy and explicit motion preference | Does not import experiences. If it listens for changes, it also owns subscription and cleanup. |
| Murcia LED player | `ready`, `update`, `dispose`; hides composition/carousel coordination | Facade engine and content types. Each screen's adapter retains its visual policy. |
| Form protocol | HTTP response → resolution or `SubmissionError` | Browser-side, without Audit/Contact payloads or server imports. |
| Static document tools | Expected documents/URLs derived from data | Tested Node code; Vite adapts hooks and IO. |

Resulting direction: **entry points → orchestration → experience adapters → experience modules / infrastructure**. Experiences do not depend on `app/`. **Content build → content contract**; the browser never reaches the build. **Campus and tower → shared LED engine**, not campus → concrete tower adapter. **Specific transports → shared protocol**, not one form → another.

No third experience abstraction, universal scene framework or standardization of the Earth and Murcia cameras is proposed. The boundaries accepted in [ADR 001](../../adr/001-renderer-and-scene-ownership.md), [ADR 003](../../adr/003-experience-lifecycle.md) and ADR 013 remain.

### State and resources

- Discrete navigation, route and attention: application. `App` already computes `attentionIsFree`; extend that policy when panels change, preserving the distinctions between Escape, panel visibility and permission to navigate, rather than blindly extracting all its booleans.
- Intro and orbits: Earth. Campus visit: campus. Camera takeover and return through `campusCameraAdapter` are justified by [plan 024](../../plans/024-services-campus.md), not presented as accidental duplication.
- Main renderer: R3F; composer and targets: `RenderPipeline`; Murcia scene and rig: `MurciaExperience`; decoder pools: `graphics/decoders` with acquisition/release; facade and compositions: the owning screen.
- Explicit `dispose` paths were observed in MurciaLayer, campus and screens. This is not a measurement proving the absence of GPU leaks. Preserve current differences in material restoration during AR-03.
- Freezing the site when opening the blog while keeping resources resident is an accepted decision; do not demand unmounting for symmetry.

## 7. Change amplification scenarios

The numbers count **the minimum architectural areas that would need review**, not files or effort estimates. Adding a capability may require legitimate changes; the aim is only to eliminate duplicated coordination.

| Hypothetical change | Today | With the minimal proposal |
|---|---|---|
| Another interactive district | 4: content, GLB composition/bindings, Murcia mounting, navigation/accessible input. `cityDistrictBindings[0]` is selected during mounting and in the compass. | 4: interaction design is still required. Localize selection/composition; do not manufacture multi-district support in advance. |
| Another city | 5: experience module, orchestration, navigation, adapter/pipeline, loading/contract | 5, but without knowing the Earth intro's internal state (AR-04). |
| Another quality policy | 3: capabilities, SceneCanvas/render, local resource allocation | 3 with shared policy and local allocation; do not move every size into one large config. |
| Replace the camera transition | 4: navigation/progress, shared transition, Earth adaptation and Murcia adaptation | 4 with clear interfaces; AR-04 removes the need to edit intro state when changing shared navigation. |
| Another postprocessing effect | 2: graphics composition and its controlling signal | 2; the current boundary is already appropriate. |
| Another GLTF decoder | 3: decoder pools, consuming loader and decoder file delivery | 3; retain the existing owner. |
| Another clickable object | 3: scene binding, that experience's interaction, action/accessible input | 3; do not merge raycasts from different domains because of technical similarity. |
| Another device capability rule | 3: detection, policy, affected consumers; detection is currently repeated | 3, with one explicit owner per document (AR-09). |

Cases with immediate reduction: HTTP response interpretation from two implementations to one; LED coordination from two to one; coverage inclusion from adding a test plus a manual edit to a verified addition; banner removal from several active layers to none.

## 8. Incremental roadmap

| Stage | Work | Completion evidence |
|---|---|---|
| 0. Restore the baseline | AR-01; resolve the excess without weakening the gate. Establish coverage scope, AR-06. | Build within budget; consistent coverage selection and a measured result after correcting it. |
| 1. Verified cleanup | AR-02. AR-10 if removing preparation for future functionality is chosen. | Consumer search, typecheck and relevant tests. Do not promise bundle savings. |
| 2. Finish retiring the banner | AR-12 as an independent change. | Consistent content contract/generation, collection tests and build. CMS data preserved. |
| 3. Owners | AR-05, then AR-04, through small moves/changes. | Expanded boundary harness; navigation/warp and build preserved. |
| 4. Shared knowledge | AR-07 and AR-03 as separate changes; AR-09 with defined semantics. | Tests of the shared contract and both consumers; visual validation when integration changes. |
| 5. Tools and archive | AR-08; resolve the purpose of the two AR-11 assets; update current documentation. | Static output and routes verified; intentional publishable inventory; historical audits intact. |

After restoring the baseline, each stage must leave the application buildable and deployable. Do not combine moves, visual changes and data migration into a single refactor. The proposed improvements require no new dependencies.

## 9. Delivery and limitations

Only this report was added. All findings remain pending implementation because the assignment is an audit. No user clarification is needed to deliver the analysis.

Before implementation, removing the two GLBs requires confirming authoring uses outside the code; removing the parser requires deciding whether its future integration remains committed. These are decisions for subsequent tasks, not blockers for this audit.

The conclusions are sourced from the cited local files and executions. No external claims about versions, security, browsers or platforms were used to justify findings.
