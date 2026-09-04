# Edge Cases, Race Conditions & Failure Modes Audit

## Objective

Perform an exhaustive **edge-case, race-condition, state-combination and failure-mode audit** of the Vertigo Marketing Website repository.

This audit is not a generic bug hunt and must not duplicate the existing Architecture, Performance, Cybersecurity or Mobile/Responsive audits.

Its purpose is to answer a different question:

> **Under which unusual but plausible sequences of events can individually-correct subsystems combine into an invalid application state?**

The audit must actively search for failures caused by:

- unusual ordering;
- interrupted transitions;
- repeated input;
- simultaneous input sources;
- partial loading;
- asynchronous completion in unexpected orders;
- resource failure;
- component remounting;
- stale shared state;
- lifecycle transitions;
- viewport/device changes;
- boundary content;
- missing browser capabilities;
- context loss/restoration;
- repeated navigation;
- user actions occurring at inconvenient times.

Do not assume that because the normal path works, nearby states are valid.

---

# 0. Rules of engagement

## Read-only audit

Do **not** modify production source code.

Temporary instrumentation, throwaway scripts and external Playwright/CDP harnesses are allowed, preferably outside the repository or in temporary directories.

Do not mutate:

- the production Sanity dataset;
- the development Sanity dataset unless a dedicated disposable dataset is explicitly available;
- Vercel configuration;
- GitHub settings;
- production deployment state.

Use fixtures, interception, mocks or generated temporary content for destructive/content-boundary tests.

## Evidence over speculation

A finding must have at least one of:

- reproducible runtime evidence;
- a deterministic source-level state path proving the failure;
- a failing existing test/harness;
- a temporary reproduction test;
- measurable resource/state leakage;
- a demonstrably violated invariant.

Do not report purely theoretical possibilities as confirmed defects.

Label evidence as:

- **Observed**
- **Source-proven**
- **Synthetic reproduction**
- **Inferred but not reproduced**
- **Not verifiable in this environment**

## Existing audits

Before testing, locate and read the latest reports under `docs/audits/reports/` for at least:

- architecture / complexity / refactoring;
- performance / optimization;
- cybersecurity / project security;
- mobile responsiveness, if present;
- production readiness, if present.

Use their findings as context.

Do **not** simply repeat their findings.

If an edge case is caused or amplified by an existing finding, report the relationship explicitly:

> `EC-X is a runtime manifestation of / is amplified by ARCH-P2-X`

The value of this audit is finding **interactions between findings and systems** that previous vertical audits may have missed.

---

# 1. Establish the real baseline

Before adversarial testing, record:

- commit / working-tree state;
- modified and untracked files;
- Node/npm versions;
- relevant browser versions;
- current build mode;
- available Playwright browsers;
- whether a real GPU is available;
- viewport and DPR;
- content source used;
- relevant environment variables by **name only**, never secret values.

Run the repository's existing verification suite.

At minimum identify and execute the currently defined equivalents of:

- typecheck;
- unit tests;
- architecture harness;
- navigation harnesses;
- Earth harness;
- Murcia/district harness;
- warp/transition harness;
- asset harness;
- audit hygiene;
- production build;
- relevant Playwright suites.

Record failures before starting the audit.

Do not silently treat pre-existing failures as edge-case findings.

---

# 2. Define application invariants first

Before searching for failures, derive the invariants the application appears to promise.

Examples include, but are not limited to:

### Navigation

At any instant:

- exactly one navigation authority decides the intended experience transition;
- repeated input cannot create multiple concurrent transitions;
- transition progress remains bounded;
- a cancelled/reversed gesture cannot leave the application between worlds;
- the final camera/state corresponds to the committed experience;
- input cannot remain disabled permanently after interruption.

### Earth / Murcia transition

At stable endpoints:

- Earth and Murcia return to their canonical poses;
- transition-only effects return to rest;
- overlays belonging to the inactive interaction context do not remain actionable;
- transition state cannot say "committed Murcia" while visual/camera state is Earth, or vice versa.

### Attention / overlays

Opening or closing:

- audit;
- contact;
- legal;
- case study;
- district panel;

must leave navigation, focus, cursor and keyboard ownership coherent.

There must not be two independent UI surfaces believing they have exclusive user attention.

### Loading

Required-resource failure must result in the documented fatal path.

Optional-resource failure must not prevent the application from becoming usable.

Readiness events must represent **edges**, not repeatedly-reported latched states.

### Resource lifecycle

Repeated transitions and remounts must not monotonically increase:

- event listeners;
- workers;
- WebGL textures;
- buffers;
- shader programs;
- frame loops;
- DOM overlays;
- canvases;
- requestAnimationFrame loops.

### Content

Valid CMS content must never create an impossible runtime state.

Invalid CMS content must fail at the earliest intended validation boundary.

Publishing more valid content must not silently violate a hard WebGL/browser limit.

Add the actual invariants you discover from ADRs, source comments, checks and tests.

Use these invariants as the basis for the rest of the audit.

---

# 3. Transition and navigation race-condition matrix

This is one of the highest-priority sections.

Test Earth ↔ Murcia transitions under adversarial sequences.

Do not test only start and end states.

Sample transition progress around at least:

`0.00, 0.01, 0.10, 0.25, 0.49, 0.50, 0.51, 0.75, 0.90, 0.99, 1.00`

At representative intermediate points attempt:

- reverse direction;
- wheel again in the same direction;
- wheel rapidly in alternating directions;
- start pinch;
- abort pinch;
- change pinch direction;
- pointer down/up;
- click interactive content;
- press Escape;
- open an overlay;
- close an overlay;
- resize;
- hide the page;
- restore the page.

Look specifically for:

- multiple GSAP/timeline owners;
- stale `transitionCommitted`;
- progress and committed-state disagreement;
- camera discontinuities;
- temporary black/empty frames;
- navigation becoming permanently locked;
- interaction with the wrong world;
- transition completion callbacks firing for obsolete transitions;
- old promises/effects overwriting newer state;
- click-through during visual transitions;
- duplicated navigation events.

Include rapid repeated transitions:

Earth → Murcia → Earth → Murcia...

Run at least:

- 5 cycles;
- 20 cycles;
- 50 cycles if runtime permits.

Compare canonical state after the final cycle with a clean load.

---

# 4. Mixed input and gesture edge cases

Do not assume mouse, touch and wheel are mutually exclusive.

Test combinations involving:

- wheel + pointer;
- wheel + pinch;
- touch followed immediately by mouse;
- multi-touch reduced to single-touch mid gesture;
- second finger added late;
- `pointercancel`;
- pointer leaving the viewport;
- lost pointer capture;
- window blur during drag;
- tab switch during gesture;
- gesture ending during transition;
- very small movement around the tap/drag threshold;
- exact threshold ±1 px;
- zero-duration tap;
- very long press;
- extremely fast fling;
- trackpad-like high-frequency small wheel deltas;
- one very large wheel delta.

Boundary-test all explicit thresholds discovered in source.

For a threshold `N`, test where meaningful:

- `N - 1`
- `N`
- `N + 1`

Also inspect whether threshold units remain meaningful across different DPR values.

---

# 5. Overlay, focus and UI ownership combinations

Construct a state matrix for:

- no overlay;
- audit;
- contact;
- legal;
- case study;
- Murcia district/service panel;
- transition in progress.

Attempt invalid or awkward combinations intentionally.

Examples:

1. Open case study → Escape → immediately navigate.
2. Open audit → attempt wheel navigation.
3. Open overlay while a transition is completing.
4. Escape during transition.
5. Escape repeatedly.
6. Open district → immediately click next/previous repeatedly.
7. District panel open → resize desktop→mobile.
8. Panel open → page hidden → page restored.
9. Overlay open → browser back/forward.
10. Focused control removed while focused.

Verify:

- only the correct surface receives Escape;
- focus never disappears into removed DOM;
- hidden scene elements do not intercept input;
- navigation rails accurately reflect whether navigation is possible;
- cursor state resets;
- `aria-hidden` / inert state remains consistent where applicable;
- closing all overlays really produces the base state.

Explicitly search for stale state caused by separate enumerations of "something currently owns attention".

---

# 6. Boot/readiness timing adversaries

Use request interception or equivalent controls.

Repeat boot while individually delaying:

- app entry;
- SceneCanvas chunk;
- Three.js chunk;
- Earth textures;
- sky;
- city GLB;
- satellite GLB;
- Draco decoder;
- Basis decoder;
- CMS-mirrored logos.

Test delays such as:

- 0 ms;
- 10 ms;
- 100 ms;
- 1 s;
- 5 s;
- long enough for other resources to complete first.

Then test completion in deliberately unusual orders.

Test failures individually and in combinations:

- one required asset fails;
- two required assets fail;
- required + optional fail;
- all optional assets fail;
- decoder fails after model fetch;
- model succeeds but texture fails;
- scene code succeeds but WebGL initialization fails.

Check:

- fatal/ready state is deterministic;
- no infinite loading state;
- no retry storm unless retry is explicitly designed;
- progress never goes backwards unexpectedly;
- optional late completion does not re-trigger readiness;
- `vertigo:scene-ready` and similar marks occur exactly as their contracts specify;
- intro completion cannot precede the required readiness edge.

Pay particular attention to subscribers observing **latched state versus state transitions**.

---

# 7. WebGL context-loss and renderer lifecycle

Use `WEBGL_lose_context` or an equivalent browser capability where available.

Trigger context loss:

1. during boot;
2. immediately after Earth becomes ready;
3. during satellite deployment;
4. during Earth→Murcia transition;
5. while Murcia is active;
6. with a district panel open;
7. during Murcia→Earth;
8. during post-processing activity.

Then restore the context where supported.

Verify:

- no permanent black screen unless explicitly documented;
- context restoration does not duplicate scene resources;
- no duplicated frame loop;
- no duplicated DOM overlay;
- input still works;
- post-processing restores correctly;
- debug/prototype systems do not become active incorrectly;
- resource counters return to the expected baseline.

If restoration is intentionally unsupported, verify that failure is controlled and comprehensible rather than producing undefined state.

---

# 8. WebGL/browser capability boundaries

Inspect all assumptions about:

- `matchMedia`;
- pointer media queries;
- touch capability;
- ResizeObserver;
- devicePixelRatio;
- WebGL2;
- compressed texture support;
- maximum texture size;
- maximum renderbuffer size;
- hardware concurrency;
- device memory;
- visibility API;
- requestAnimationFrame.

Where possible, simulate absence or unusual values.

Important cases:

- `matchMedia` unavailable;
- no fine pointer;
- no hover;
- coarse pointer + mouse events nevertheless occurring;
- DPR 0.75 / 1 / 1.25 / 1.5 / 2 / >2;
- very small `MAX_TEXTURE_SIZE`;
- no supported compressed KTX2 target;
- WebGL context creation failure.

Do not merely confirm browser feature detection exists.

Confirm the **fallback state remains functional**.

---

# 9. Resize, orientation and viewport discontinuities

Test live resizing, not only fresh loads at different resolutions.

Important transitions:

- 1440×900 → 390×844;
- 390×844 → 1440×900;
- portrait → landscape;
- landscape → portrait;
- width 768 → 767;
- width 767 → 768;
- width 769 → 767;
- height collapse caused by mobile browser chrome;
- very short landscape viewport;
- very narrow desktop-style viewport.

Perform these transitions while:

- Earth is idle;
- satellite selected;
- transition is active;
- Murcia is active;
- district panel is open;
- drag is active;
- pinch is active.

Look for disagreement between JS breakpoints and CSS breakpoints.

Check camera framing, hit areas, panel layout and navigation state after the resize settles.

---

# 10. Background/foreground lifecycle

Test actual or simulated:

- `visibilitychange`;
- window blur/focus;
- page hidden for several seconds;
- restore after transition started;
- restore after input was active;
- restore after loading was incomplete.

Check:

- frame loops stop/resume according to design;
- delta time does not explode on return;
- animation does not jump several seconds forward incorrectly;
- drag/pinch state is cancelled safely;
- input ownership is restored;
- timeline callbacks do not replay;
- audio is irrelevant unless added;
- no large resource reallocation occurs solely from returning to foreground.

Where Playwright cannot create a genuine hidden document, explicitly label the limitation rather than pretending it was tested.

---

# 11. React lifecycle / remount / StrictMode cases

Determine what happens under:

- React StrictMode double invocation;
- SceneCanvas remount;
- experience-layer remount;
- error-boundary recovery where applicable;
- HMR/dev remount if relevant to developer correctness.

Count before and after:

- listeners;
- rAF loops;
- global handles;
- WebGL resources;
- decoder workers;
- DOM nodes;
- body-level overlays.

Specifically inspect all module-level mutable/shared resources.

A construct that is correct because "there is only ever one instance" must be checked against accidental double construction.

---

# 12. Resource-exhaustion and accumulation tests

Perform a soak focused specifically on **accumulation**, not average performance.

Useful scenarios:

- 50 Earth↔Murcia transitions;
- 100 open/close cycles of a lightweight overlay;
- repeated case-study selection;
- repeated district/service navigation;
- resize desktop↔mobile repeatedly;
- context loss/restore several times if supported.

Track:

- JS heap;
- WebGL textures;
- WebGL buffers;
- programs;
- worker count;
- active event listener count where observable;
- DOM node count;
- active animations/tweens;
- pending timers;
- rAF producers.

The relevant result is not merely "memory looks stable".

State which resource classes were measured and whether each returned to baseline.

---

# 13. Asset-contract edge cases

Audit the runtime assumptions connecting Blender/glTF assets to source bindings.

For each contract determine behaviour when:

- expected node is absent;
- node is duplicated;
- object renamed;
- unexpected suffix appears;
- hierarchy changes;
- mesh exists but contains no primitives;
- material missing;
- UVs missing;
- texture missing;
- geometry has zero-area or degenerate triangles;
- GLB is zero-byte;
- GLB is truncated;
- GLB is valid but semantically incompatible.

Pay particular attention to Murcia district/service building lookup.

The important question is:

> Does an asset-contract violation fail loudly at build time, degrade explicitly at runtime, or silently remove interaction?

Classify each outcome.

Do not modify the production Blender asset for the audit. Use temporary copies or loader interception.

---

# 14. CMS/content cardinality edge cases

This section is critical because valid CMS changes can alter runtime structure without changing source code.

Use generated temporary fixtures/mocks.

Test collections with:

- 0 entries;
- 1 entry;
- current entry count;
- exact documented maximum;
- maximum +1;
- materially larger counts where validation allows them.

Particularly inspect:

- case studies;
- satellites/orbits;
- services;
- districts;
- blog posts;
- site settings;
- legal documents.

Check assumptions such as:

- `array[0]` always exists;
- at least one service exists;
- every reference resolves;
- every district has services;
- every case study has media;
- IDs/slugs are unique;
- case count fits a visual or GPU structure.

Calculate where generated GPU atlases reach:

- expected budget;
- 4096 px;
- 8192 px;
- common `MAX_TEXTURE_SIZE` limits.

If a valid CMS state can produce a texture larger than a plausible mobile GPU limit, report the exact cardinality at which that happens.

---

# 15. CMS field-value boundaries

For every editorial bound defined by Studio and/or build validation, test:

- empty;
- minimum valid;
- maximum valid;
- maximum +1.

Also test strings containing:

- accented Spanish characters;
- emoji;
- combining Unicode characters;
- non-breaking spaces;
- newline sequences;
- leading/trailing whitespace;
- very long unbroken words;
- URLs;
- `< > & " '`;
- `${`;
- backticks;
- U+2028 / U+2029 where generated JS is involved.

For slugs/IDs:

- uppercase;
- spaces;
- accents;
- `&`;
- duplicate slug;
- 63/64/65-character boundary as applicable.

Differentiate:

1. Studio rejects it;
2. Studio accepts but build rejects;
3. build accepts but runtime fails.

Case 2 is especially important.

---

# 16. Portable Text and structured-content cases

Without repeating the security audit, test functional robustness of the closed Portable Text vocabulary.

Include:

- empty body;
- one block;
- maximum block count;
- mark without expected definition;
- reference to missing definition;
- unknown block type;
- unknown mark type;
- empty children;
- consecutive empty paragraphs;
- unusually long link text;
- legal document with only headings;
- legal document with no headings.

Verify:

- validation fails at the intended boundary;
- rendering never enters an impossible branch;
- generated modules remain syntactically valid;
- UI remains navigable.

---

# 17. Environment/configuration state matrix

Enumerate meaningful combinations of:

- local/non-Vercel;
- Vercel Preview;
- Vercel Production;
- `VERCEL` present/absent;
- `VERCEL_ENV` present/absent/invalid;
- Sanity configuration present/absent;
- fixture source;
- seed source;
- CMS source;
- empty dataset;
- unreachable CMS.

Do not expose secret values.

For every combination state whether the intended result is:

- build permitted;
- build rejected;
- warning;
- runtime fallback.

Search for configurations that silently degrade to a less-safe or incorrect mode.

This is **not another security audit**: report these here when they can cause an application/build state that differs from what the operator believes was built.

---

# 18. Network/cache/offline edge cases

Use request interception.

Test:

- offline immediately;
- offline after HTML;
- offline after required JS but before textures;
- connection restored during boot;
- cached JS + uncached assets;
- cached assets + new JS;
- 404;
- 500;
- connection reset/abort;
- extremely slow response;
- zero-byte 200 response;
- wrong MIME type where meaningful.

Check that the site's static caching assumptions do not create an impossible version combination.

Do not report generic "offline does not work" unless offline support is promised.

Report only failures that violate an existing fallback or state contract.

---

# 19. Browser history and reload edge cases

Test where applicable:

- reload on Earth;
- reload while Murcia is active;
- reload with an overlay open;
- browser back;
- browser forward;
- bfcache restore if available;
- reload while loading;
- reload immediately after interaction.

Determine whether URL-independent state intentionally resets.

Do not classify reset as a bug unless the project promises persistence.

Focus instead on stale globals, duplicated listeners or invalid restored state.

---

# 20. Error propagation

Inventory major asynchronous boundaries and identify what happens when each throws/rejects.

Examples:

- dynamic imports;
- loaders;
- decoder initialization;
- texture upload;
- shader/material creation;
- content generation;
- event callbacks;
- promises used during warmup;
- WebGL setup.

For each boundary classify:

- caught and recovered;
- caught and fatal;
- logged but application continues;
- unhandled rejection;
- swallowed;
- leaves partial state.

Particularly investigate cases where cleanup occurs only on the success path.

---

# 21. Sequence fuzzing

After deterministic cases, construct a small model-based or randomized interaction sequence runner.

This is not uncontrolled fuzzing.

Use a fixed seed and an explicit action vocabulary such as:

- wheel forward;
- wheel backward;
- pinch in;
- pinch out;
- click case;
- close case;
- enter district;
- next service;
- previous service;
- Escape;
- resize narrow;
- resize wide;
- hide;
- show.

After every action, assert basic invariants.

Run multiple deterministic seeds and preserve any seed that produces a failure.

A sequence failure is valuable only if it can be replayed exactly.

---

# 22. Required cross-system scenarios

Regardless of what else is tested, explicitly execute these scenarios:

### Scenario A — Transition reversal
Begin Earth→Murcia and reverse at 10 %, 49 %, 51 % and 90 %.

### Scenario B — Attention during transition
Open/close an overlay as close as possible to transition commit.

### Scenario C — Gesture interruption
Start pinch/drag, trigger blur or visibility change, restore and continue navigation.

### Scenario D — Late optional resource
Required scene becomes ready while the city/decoder remains deliberately delayed.

### Scenario E — Context loss mid-transition
Lose WebGL context during Earth→Murcia and inspect the state before and after restoration.

### Scenario F — Resize with district open
Desktop Murcia district → resize to mobile → navigate services → resize back.

### Scenario G — High content cardinality
Generate enough case studies to exercise multiple atlas rows and calculate GPU limits.

### Scenario H — Repeated world changes
50 Earth↔Murcia round trips with resource census.

### Scenario I — CMS boundary mismatch
Find whether any field is accepted by Studio but rejected by build validation.

### Scenario J — Partial asset contract
Remove one temporarily-mocked service-building node and inspect whether the problem is detected before runtime.

---

# 23. Existing-test adequacy

For every confirmed P0/P1/P2 edge-case finding answer:

> Why did the current test/harness suite not detect this?

Classify the missing coverage as:

- missing unit boundary;
- missing state combination;
- missing sequence test;
- missing runtime test;
- missing browser/device configuration;
- missing build-time invariant;
- missing asset-contract assertion;
- missing content-cardinality assertion.

Recommend the **smallest permanent regression test** capable of detecting it.

Do not recommend large e2e tests where a ten-line pure-state unit test would suffice.

---

# 24. Severity model

Use IDs:

- `EC-P0-*`
- `EC-P1-*`
- `EC-P2-*`
- `EC-P3-*`

## P0 — Critical

Examples:

- normal user interaction can reliably brick navigation for the session;
- data/resource corruption;
- uncontrolled unbounded accumulation leading to crash;
- valid production content causes deterministic site failure;
- common recovery path results in an unusable site.

## P1 — High

Examples:

- plausible race creates a persistent inconsistent state;
- common mobile gesture sequence breaks interaction;
- resource/context failure cannot recover as documented;
- valid CMS cardinality exceeds a real browser/GPU hard limit;
- repeated navigation leaks materially.

## P2 — Moderate

Examples:

- uncommon interaction sequence causes recoverable incorrect behaviour;
- resize/orientation temporarily corrupts interaction;
- partial asset failure silently removes a feature;
- validation mismatch creates preventable failed deployments;
- browser capability absence causes local failure.

## P3 — Low

Examples:

- misleading state/metric;
- harmless duplicated callback;
- cosmetic recovery defect;
- defensive hardening where no present user-visible failure was demonstrated.

Severity must reflect **impact × plausibility**, not how interesting the implementation is.

---

# 25. Finding format

Every confirmed finding must include:

### `EC-Px-N · Short title`

**Invariant violated**

State the expected invariant.

**Preconditions**

Exact state needed before the failure.

**Sequence**

Numbered, deterministic reproduction.

**Observed result**

What actually occurred.

**Expected result**

What should have occurred.

**Evidence**

Runtime logs, state snapshots, screenshots, counters, source paths, test output or measurements.

**Root cause**

Mechanism, not symptom.

**Cross-system interaction**

Name all involved subsystems.

**Relationship to existing audits**

Reference previous findings when relevant without duplicating them.

**User impact**

Concrete impact.

**Likelihood**

Common / plausible / rare / synthetic-only.

**Persistence**

- one frame;
- until next interaction;
- until navigation reset;
- until reload;
- permanent build failure.

**Minimal remediation direction**

Describe the smallest robust design change.

Do not implement it.

**Regression test**

Specify exactly what permanent test should be added.

**Confidence**

High / medium / low, with justification.

---

# 26. Required final report

Produce the report in this order.

## 1. Executive assessment

State:

- whether the normal path is robust;
- whether edge-state robustness is robust;
- the most dangerous state combinations;
- whether failures cluster around one subsystem or system boundaries.

## 2. Tested state-space

Table showing every class of edge case tested and whether it produced findings.

## 3. Invariant catalogue

List the important inferred/explicit invariants.

## 4. Findings

P0 → P3.

## 5. Cross-system interaction map

Example structure:

| System A | System B | Failure tested | Result |
|---|---|---|---|
| transition | overlay | overlay opens near commit | pass/fail |
| navigation | visibility | hidden during pinch | pass/fail |
| CMS | GPU atlas | high case count | pass/fail |
| GLB contract | district | missing node | pass/fail |

## 6. Sequence/race matrix

Document the major temporal combinations tested.

## 7. Resource/lifecycle census

Before/after values for repeated-interaction tests.

## 8. Content-boundary matrix

Studio → mapper/build → generated data → runtime.

Identify mismatched boundaries explicitly.

## 9. Browser/capability matrix

What was genuinely tested versus emulated/inferred.

## 10. Existing coverage gaps

Map each finding to the missing test type.

## 11. Recommended regression suite

Prioritised set of permanent tests/harness checks.

Separate:

- pure unit tests;
- architecture/build harnesses;
- Playwright integration;
- asset-contract tests;
- content-generation tests.

## 12. Remediation roadmap

Group by:

- Immediate;
- Short term;
- Structural;
- Opportunistic.

Prioritise fixes that eliminate **classes of impossible states**, rather than adding local defensive conditionals.

## 13. Negative results

Record important hypotheses that were tested and found safe.

This section is mandatory.

Examples:

- 50 transitions did not leak;
- pointercancel correctly resets drag;
- WebGL context restoration succeeded;
- empty optional collection is handled;
- repeated Escape is idempotent.

These negative findings prevent future auditors from repeating the same work.

## 14. Not verified

Be explicit about anything requiring:

- real iOS;
- real Android;
- actual background-tab throttling;
- constrained mobile GPU;
- Vercel dashboard;
- Sanity admin permissions;
- physical network interruption;
- browser capabilities unavailable in the environment.

Never convert an untested case into a pass.

---

# 27. Audit philosophy

The main target is not code that obviously throws.

Look for situations where:

> **A remains internally valid. B remains internally valid. But A + B + timing C creates a state nobody owns.**

Pay particular attention to:

- ownership boundaries;
- state duplicated between layers;
- asynchronous completion;
- permanent mounting;
- module-level mutable state;
- latched state observed as an event;
- cleanup tied to destruction when destruction rarely occurs;
- browser APIs assumed to exist;
- content-controlled resource growth;
- fallback paths rarely exercised;
- transition progress versus committed state;
- multiple independent definitions of whether user interaction is currently allowed.

A robust result is not "all tests pass."

A robust result is:

> **The system's important invariants remain true when actions occur in the wrong order, at the wrong time, more than once, or while another subsystem is failing.**