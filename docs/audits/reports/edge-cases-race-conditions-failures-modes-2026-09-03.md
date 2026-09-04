# Edge Cases, Race Conditions & Failure Modes — 2026-09-03

Read-only audit. No production source was modified. Temporary instrumentation
was not left in the tree. Sanity datasets, Vercel, and GitHub were not touched.

This report does **not** re-litigate Architecture, Performance, Cybersecurity or
Mobile findings. Where an edge case is a runtime manifestation of one of those,
the relationship is named.

---

## 0. Baseline

| Item | Value |
|---|---|
| HEAD | `528dd42` *change sky panorama image* |
| Working tree | User WIP: `docs/DECISIONS.md`, `docs/PROJECT_MEMORY.md`, `e2e/mobile.spec.ts`, `src/blog/BlogRoute.tsx`, `src/blog/blog.css`; untracked prior audit reports and this brief |
| Node / npm | v22.22.0 / 10.9.3 |
| Playwright | 1.62.1 |
| GPU | Not queried in this environment |
| Content source | Generated modules already in-tree (not mutated) |
| Env names observed | `VERCEL`, `VERCEL_ENV`, `CONTENT_SOURCE`, `SANITY_*` — values not reproduced |
| Build mode for gates | Development / local harness + `tsc` |

### Existing gates run before adversarial work

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npx vitest run` | 68 files / **1114 tests pass** |
| `npm run check:harnesses` | All pass: architecture 26, audit-hygiene 16, navigation 55, footprint 8, district 71, earth 25, warp 47, space 36, asset-contract 5 |
| Production `vite build` | **Not run** (see §14) |
| `e2e/mobile.spec.ts` | **30/30 pass** (7.2 min) — Chromium `mobile-android` and `mobile-ios-shaped`. Includes WebGL-loss copy and two-finger Earth↔Murcia. |

No pre-existing failing gate was reclassified as an edge-case finding.

---

## 1. Executive assessment

The **normal path is robust**. The navigation machine, warp curves, district
flight, Earth orbit, and pinch classifier are unusually well guarded: 1114 unit
tests plus 289 harness assertions already cover many of the sequences this brief
asks for — including reversal-safe scrub, pointercancel, second-finger
passengers, and exact rest poses at `p = 0` and `p = 1`.

**Edge-state robustness is good inside a single owner, weaker at ownership
boundaries.** Failures do not cluster inside `navigationMachine` or
`warpTransition`. They cluster where:

- an optional subsystem fails but the UI that would explain it is unreachable;
- two input devices write the same accumulator;
- content/GPU growth is gated by developer orbit slots, not by a texture limit;
- attention is enumerated in more than one place (already ARCH-P2-F).

No P0 was confirmed. No session-bricking path was source-proven for a normal
single-input user. The most dangerous *plausible* combinations are:

1. **Murcia fails or hangs after Earth is ready** — the globe stays usable, the
   city is never offered, and the failure copy lives on an overlay the visitor
   cannot open.
2. **Touch pinch + physical wheel** on the same accumulator — exotic hardware,
   but the code path is unguarded.
3. **Orbit-slot growth without a `MAX_TEXTURE_SIZE` gate** — not a CMS publish
   of extra unused case studies; that path is safe.

---

## 2. Tested state-space

| Class | How tested | Findings? |
|---|---|---|
| Transition / warp races | Warp harness (continuous `p`), `useExperienceTransition` + machine source, existing unit tests | No new P0/P1. See negative results. |
| Mixed input / gesture | Source of `onWheel` vs `pinchOwnsProgress`; existing pinch/navigation tests | **EC-P2-1** |
| Overlay / attention | `App.tsx` `getContext` vs Escape; overlay components | Residual of ARCH-P2-F; **EC-P3-1** |
| Boot / readiness | `bootState.ts` + `boot.ts` + loaders | Designed latch/edge split. **EC-P2-2** (optional hang/fail) |
| WebGL context loss | Source + existing mobile e2e copy test | Controlled failure. Restoration unsupported (documented). |
| Capability absence | Source of `webglSupport`, `prefersReducedMotion` | Inferred; not emulated live |
| Resize / orientation | District harness discrete viewports; no live mid-transition resize | Not verified live — §14 |
| Visibility / bfcache | Source (`visibilitychange` pauses GSAP; `clampFrameDelta`) | Not verified with a real hidden document |
| React remount / StrictMode | `main` StrictMode on; dispose paths present | Inferred safe if cleanup runs |
| Resource soak (50 cycles) | **Not run live** | Warp math is cycle-agnostic; GPU census not taken |
| Asset contract | `check:asset:contract` + bindings comments | **EC-P2-3** |
| CMS cardinality | Atlas built from `orbitCases`, not `CASE_STUDIES.length` | Extra CMS cases: **safe**. Orbit growth: **EC-P2-4** |
| CMS field bounds | Studio vs `invariants` / mappers (source) | Duplicated rules = ARCH-P2-C class. No new live Studio mismatch run |
| Portable Text | Existing `portableText` / `PostBody` tests | No new finding |
| Env / config | `readConfig` + tests | Preview fixture default is intentional. Unknown `VERCEL_ENV` → fixture (**EC-P3-2**) |
| Network / offline | Not intercepted live | §14 |
| History / reload | Source: URL-independent scene state | Reset on reload is intended |
| Error boundaries | Inventory of `markFatal` / catch | See §20 notes in §4 |
| Sequence fuzz | **Not run** | Existing pinch/nav tests are the closest substitute |

---

## 3. Invariant catalogue

Inferred from ADRs, comments, harnesses and tests:

1. Exactly one navigation authority (`navigationMachine`) may commit a warp.
2. A second `transitionTo` is refused while a GSAP timeline is live.
3. Gesture scrub stays in the departing leg and cannot darken the flash band.
4. At `p = 0` and `p = 1`, Earth and Murcia rest poses and overlays are exactly
   canonical (warp harness).
5. `getContext()` is re-read on every event and at commit — not sampled once.
6. Overlays (audit, contact, legal, case, district, blog) refuse `canNavigate`.
7. Required boot failure is fatal and unrecoverable; optional failure must not
   hold the intro.
8. `sky:panorama` is required for *waiting*, but a load miss must `markDone`,
   not `markFatal` (black sky is preferred to a 45 s deadlock).
9. Murcia is offered only when `experience.isUsable` and `onReady` has fired.
10. Brand atlas cell index equals orbit index by construction.
11. CMS may hold unused case studies; unpublished *assigned* cases fail the
    build (`resolveOrbitCases`).
12. Missing service-building GLB nodes skip that building; they do not fail
    the city load.
13. WebGL context loss is a stated failure; restoration is not implemented.
14. Progress is monotonic (`bootState.setStep`).
15. Production must name a content source; fixtures are forbidden there.

---

## 4. Findings

No **EC-P0** confirmed.

### EC-P2-1 · Wheel and touch-pinch write the same travel accumulator

**Invariant violated**

While a claimed navigation pinch owns progress, other pointing devices must not
add travel to the same gesture.

**Preconditions**

Earth, `canNavigate === true`, two-finger pinch claimed (`pinchOwnsProgress`).

**Sequence**

1. Begin a qualifying pinch (contacts ≥ `minStartDistancePx`, growth ≥ 16 px).
2. While both contacts remain, deliver a non-`ctrlKey` `wheel` event whose
   target is not a scrollable overlay.

**Observed result**

`onWheel` never consults `pinchOwnsProgress`. It `preventDefault()`s and
`gesture.push(...)`s. The pinch tick can also `push(0)` to hold position. The
two writes share one accumulator.

**Expected result**

A claimed pinch is the sole writer until `endPinch`.

**Evidence**

- **Source-proven.** `createNavigationInput.ts` `onWheel` (~419–448) vs
  `pinchOwnsProgress` (~545, 770, 234, 289).
- Trackpad pinch-as-`ctrl+wheel` is already excluded. This is the remaining
  mixed-device hole.

**Root cause**

Two input adapters, one accumulator, one ownership flag that only the pinch
side honours.

**Cross-system interaction**

Navigation input × pointer × wheel × machine commit.

**Relationship to existing audits**

Not a repeat of mobile/perf findings. Adjacent to ARCH attention ownership:
this is *input* ownership, not overlay ownership.

**User impact**

On a laptop with a touchscreen (or a wheel firing during a trackpad-adjacent
gesture), travel can jump and commit earlier than the fingers imply.

**Likelihood**

Rare / synthetic-on-most-desktops. Plausible on 2-in-1s.

**Persistence**

Until the gesture ends or the warp commits.

**Minimal remediation direction**

If `pinchOwnsProgress`, ignore or swallow wheel deltas (still `preventDefault`
to stop page zoom/scroll). Do not `push` them.

**Regression test**

Unit test on the input factory: with a claimed pinch and `contacts.size === 2`,
a wheel event does not change `gesture` travel. Ten-line extension of
`createNavigationInput.test.ts` / `pinchInput.test.ts`.

**Confidence**

High (deterministic source path). Not live-reproduced on hardware.

---

### EC-P2-2 · Failed or hung Murcia is never offered, and its error UI is unreachable

**Invariant violated**

Optional-resource failure must leave the app usable **and** must not hide the
only explanation behind a transition that the failure itself disables.

**Preconditions**

Earth intro reaches `site`. `murcia:model` load throws, `isUsable === false`,
or `build()` never settles.

**Sequence**

1. Boot required resources to `ready`.
2. City `load()` rejects or hangs; or `isUsable` is false.
3. Visitor looks for a way to Murcia (rail / pinch / keyboard).

**Observed result**

- `onReady` is not called (`MurciaLayer.tsx` ~157–164, 190–192).
- `murciaReady` stays `false`.
- `canNavigate` stays false after `site`.
- Status overlay copy (`No se pudo cargar la ciudad`) is mounted on
  `.murcia-ui` with `display: none` until the experience is active — which
  never happens.
- There is no boot deadline for optional resources. A hung XHR never
  `markFatal`s and never `markDone`s.

**Expected result**

Earth remains usable (this holds). The visitor is told the city is unavailable,
or a timeout marks the optional step failed and the chrome stops implying a
destination that cannot be reached.

**Evidence**

- **Source-proven.** `MurciaLayer.tsx` 157–192; `MurciaExperience.ts` 221–242;
  `App.tsx` 199–216; `bootState.ts` optional `murcia:model`.
- **Not live-reproduced** with request interception in this session.

**Root cause**

Readiness of the *offer* (`murciaReady`) and the *error surface* (Murcia host
overlay) share the same activation bit. Failure clears the offer and therefore
the surface.

**Cross-system interaction**

Boot optional path × Murcia load × navigation `canNavigate` × overlay host
visibility.

**Relationship to existing audits**

Amplified by PERF late-city-load work (city is deferred until intro
`completed`). That deferral is correct; it makes a subsequent hang invisible
for the entire session.

**User impact**

Murcia is silently missing. Keyboard/pinch do nothing. No in-page explanation.

**Likelihood**

Plausible on a broken/stalled `/models` or decoder; rare on a healthy CDN.

**Persistence**

Until reload.

**Minimal remediation direction**

On `!isUsable` or `build().catch`, set an explicit `murciaUnavailable` (not
`murciaReady`) so chrome can hide the destination **and** show a one-line
Earth-side notice. Add an optional-resource timeout that cannot fatal the
intro.

**Regression test**

Unit or thin integration: mock `load()` reject → `onReady` not called, and an
observable “city unavailable” flag is set. Do not require a full e2e.

**Confidence**

High for the unreachable-overlay path. Medium for hang-without-timeout (no
live stall).

---

### EC-P2-3 · Missing service-building node degrades to a skipped binding, not a contract failure at boot

**Invariant violated**

An asset-contract violation should fail at the earliest *intended* boundary.
Runtime skip is acceptable only if that is the stated contract — and it is —
but then a published service can have no building without failing
`content:build` or the city boot.

**Preconditions**

GLB missing one `edificio-servicio-*` (or renamed). Content still lists that
`serviceId`.

**Sequence**

1. Keep generated district/services content unchanged.
2. Resolve bindings against a tree missing that node (harness already models
   this: “nothing found leaves the feature inert”).

**Observed result**

`cityDistrictBindings.ts`: a row whose node is missing is “reported at load
and skipped”. City still `isUsable`. District can open; that service has no
mesh.

**Expected result**

Either: (a) `check:asset:contract` / load fails loudly (preferred if the
service is published), or (b) documented skip — which is today’s choice.

The edge-case issue is **(a) is not what production load does**, so CMS and
GLB can drift independently until a visitor notices a dark building.

**Evidence**

- **Source-proven** + harness: `checks/district-flight.ts` “nothing found
  leaves the feature inert”; asset-contract currently asserts 5/5 names
  present on the *committed* GLB only.
- Temporary GLB mutation was not performed (forbidden).

**Root cause**

Three identities: Studio service id, `cityDistrictBindings.nodeName`, GLB
object name. Only the last two are paired in code; a missing name is a
runtime skip.

**Cross-system interaction**

CMS services × bindings table × GLB × district interaction.

**Relationship to existing audits**

Complements ARCH asset-contract comments; not a repeat of the panorama
P0/P1 “green screenshot” issue. Same *class*: contract checked in one
place, runtime accepts another.

**User impact**

A service pages in the display with no corresponding building highlight.

**Likelihood**

Plausible after a Blender rename; rare if the contract check runs in CI on
the same GLB.

**Persistence**

Until the next deploy with a matching GLB or binding.

**Minimal remediation direction**

If any *published* service id has `source: not-found`, fail `check:asset`
(or city load) rather than skip. Keep skip only for unbound extra meshes.

**Regression test**

Extend `cityDistrictBindings` / asset-contract: published `serviceId` +
missing node is a failing assertion, not a warning-only skip.

**Confidence**

High (source + existing harness language).

---

### EC-P2-4 · Brand atlas has no GPU size cap if orbit slots grow

**Invariant violated**

Publishing or composing more featured brands must not silently exceed a
plausible `MAX_TEXTURE_SIZE`.

**Preconditions**

Developer adds orbit presets/assignments (atlas is **not** `CASE_STUDIES.length`).

**Sequence / calculation**

`COLUMNS = 2`. Logo cell 1024×512 → atlas width 2048, height `512 * ceil(n/2)`.
Isotype 512×512 → width 1024, same height.

| Featured orbits `n` | Logo atlas | Hits 4096 tall | Hits 8192 tall |
|---|---|---|---|
| 6 (current) | 2048×1536 | no | no |
| 16 | 2048×4096 | yes | no |
| 32 | 2048×8192 | yes | yes |

VRAM already scales at +8 MiB per two extra featured cases (PERF-P1-F). The
*new* edge-case statement: **extra unassigned CMS case studies do not grow
the atlas** (`createOrbitSystem` builds plates from `orbitCases` only). The
limit is an orbit-composition limit, not an editorial cardinality limit.

**Observed result**

`rowsFor` has no cap. `createBrandAtlas.test.ts` checks a 3-plate grid, not
4096.

**Expected result**

A build-time or atlas-time refusal before a mobile GPU drops the texture.

**Evidence**

- **Source-proven / calculated.** `createBrandAtlas.ts` 36–52, 82–85;
  `createOrbitSystem.ts` 62–79.
- **Synthetic calculation**, not uploaded to a 4096-limit GPU.

**Root cause**

Atlas height is a pure function of featured count; GPU limits are not a
parameter.

**Cross-system interaction**

Orbit composition × atlas × WebGL texture limits. **Not** CMS publish of
unused cases.

**Relationship to existing audits**

Runtime manifestation / refinement of **PERF-P1-F**. Previous wording implied
the 7th *published* case study. The 7th unused CMS document is safe; the 7th
*orbit slot* is not.

**User impact**

On a 4096-limit GPU, panels can go blank or the context can be lost after a
composition change that never failed CI.

**Likelihood**

Rare today (n = 6). Certain if orbits are extended without a new gate.

**Persistence**

Until reload / redeploy with fewer slots or smaller cells.

**Minimal remediation direction**

Assert `logoHeight <= 2048` (or `<= 4096` with an explicit mobile budget) in
`createBrandAtlas.test.ts` and/or `content:build` when assignments grow.

**Regression test**

Pure unit: `createBrandAtlas` of 16 plates records canvas 2048×4096 and a
new guard fails the build at the chosen budget.

**Confidence**

High on the math and the orbit-vs-CMS distinction.

---

### EC-P3-1 · Legal panel `onClose` is an inline lambda; Escape effect re-subscribes every App render

**Invariant violated**

While a modal owns Escape, its listener identity should be stable.

**Preconditions**

Legal panel open.

**Sequence**

Any parent re-render (`App.tsx` `onClose={() => setLegalDoc(null)}`).

**Observed result**

`LegalPanel` effect depends on `[doc, onClose]` and rebinds `window` keydown.

**Expected result**

Same handler for the open lifetime (`useCallback`, as `handleClosePanel` is).

**Evidence**

**Source-proven.** `App.tsx` ~447; `LegalPanel.tsx` Escape effect.

**Root cause**

Inconsistent memoization of close handlers.

**User impact**

None demonstrated. Listener churn only.

**Likelihood**

Certain while the panel is open and App re-renders (timeline, navigation).

**Persistence**

One render.

**Minimal remediation direction**

`const handleCloseLegal = useCallback(() => setLegalDoc(null), [])`.

**Regression test**

Optional; not worth an e2e.

**Confidence**

High. Severity is impact×plausibility = P3.

---

### EC-P3-2 · Unrecognised `VERCEL_ENV` (non-empty, not `production`) silently selects fixtures

**Invariant violated**

A named environment the operator believes is “real” must not ship demo
content without saying so.

**Preconditions**

`VERCEL_ENV` is e.g. `staging`. `CONTENT_SOURCE` unset. `SANITY_PROJECT_ID`
unset.

**Sequence**

`readConfig` skips the empty-`VERCEL_ENV` refuse, skips the production
refuse, returns `{ mode: 'fixture' }`.

**Observed result**

Same path as Preview/local — fixtures. Vercel itself only sets
`production|preview|development`, so this is a custom/typo case.

**Expected result**

Fail closed (same spirit as missing `VERCEL_ENV`).

**Evidence**

**Source-proven.** `content/lib/config.ts` 87–97. Tests cover missing
`VERCEL_ENV` and production omission, not `staging`.

**Relationship**

Refinement of SEC fail-closed work, not a new secret leak.

**User impact**

A misnamed env deploys demo case studies.

**Likelihood**

Rare.

**Persistence**

That deployment.

**Minimal remediation direction**

Allowlist `production|preview|development`; anything else `fail()`.

**Regression test**

One case in `config.test.ts`.

**Confidence**

High.

---

### Residual, not re-filed as new defects

| Existing ID | Edge-case status |
|---|---|
| ARCH-P2-F (five attention flags, multiple enumerations) | Still true. Escape skip path omits `hasFocusedDistrict` but is gated by `earthActive` / `blogOpen`, so today’s matrix is consistent. Drift remains a future-overlay bug. |
| ARCH-P2-A (`transition*` on `SequenceState`) | Same-stack `transitionCommitted = true` before `timelineRef` is assigned; not user-exploitable. Unmount cleanup resets all three. |
| PERF-P1-F atlas VRAM | Refined as EC-P2-4. |
| PERF sky / screenshot | `markDone` on sky failure is **intentional**. A broken panorama can still reach `ready`. That is a vertical audit finding, not a new race. |
| Context restore | `RenderPipeline` logs that rebuild is impossible; `setContextLost(true)` is sticky. **Controlled**, matches `contextLoss.ts`. |

---

## 5. Cross-system interaction map

| System A | System B | Failure tested | Result |
|---|---|---|---|
| transition | overlay | `canNavigate` includes all five flags; warp refused while open | Pass (source + existing tests) |
| transition | navigation machine | double `transitionTo` | Pass — timeline ref guard |
| transition | visibility | GSAP pause on `visibilitychange` | Source-present; **not** live-hidden |
| pinch | wheel | claimed pinch + wheel | **Fail EC-P2-1** |
| pinch | third finger | `endPinch(true)` | Pass (unit) |
| pinch | pointercancel | cleanup present | Pass (tests) |
| navigation | district attention | `hasFocusedDistrict` live on instance | Pass (source) |
| Escape | overlays | four flags + blog + earthActive | Pass today; drift risk ARCH-P2-F |
| boot required | boot optional | city deferred until intro `completed` | Pass (designed) |
| optional city | navigation rail | fail/hang → `murciaReady` false | **Fail EC-P2-2** (explanation unreachable) |
| CMS cases | GPU atlas | unused extra cases | **Pass** (not in plates) |
| orbit slots | GPU atlas | n → 16 / 32 | **Fail EC-P2-4** (calculated) |
| GLB contract | district | missing node | **Fail EC-P2-3** (skip) |
| WebGL loss | boot fatal | `markFatal('chunk:scene')` + reload copy | Pass (`e2e/mobile.spec.ts` on both mobile projects) |
| WebGL restore | scene resources | no rebuild | Controlled / documented |
| env | content mode | unknown `VERCEL_ENV` | **Fail EC-P3-2** |
| StrictMode | navigation listeners | dispose in effect | Inferred pass |

---

## 6. Sequence / race matrix

Sampled in **source + existing harness**, not a new live matrix at
`p ∈ {0.01, 0.49, 0.51, …}` in a browser this session.

| Sequence | Result |
|---|---|
| Reverse inside scrub band (`p ≤ 0.33`) | Pass — warp harness: flash 0, still departing, strictly increasing |
| Reverse after cinematic commit | Refused — machine `locked` + timeline guard |
| Rapid Earth↔Murcia | Machine cooldown 0.35–1.2 s; not soak-tested to 50 live cycles |
| Overlay open near commit | `getContext` re-read at commit; refuse if flag true |
| Escape during transition | Earth skip handler stands down while overlays open; Murcia owns Escape when `!earthActive` |
| Pinch + blur/visibility | `visibilitychange` on nav input; GSAP pause. **Not** live-tab-hidden |
| Late optional city | Navigation waits on `murciaReady` — correct. Fail/hang → EC-P2-2 |
| Context loss mid-transition | Handler is session-global; would fatal + overlay. **Not** fired mid-warp here |
| District open + resize | Harness frames 390 / 844 / 1440. **Not** live desktop→mobile with panel open |
| 50 world changes + census | **Not run** |

Scenario letters from the brief:

| ID | Status |
|---|---|
| A Transition reversal | Covered by warp harness (band) + machine lock (after commit). Live mid-cinematic reverse not separately driven. |
| B Attention near commit | Source-pass |
| C Gesture + visibility | Source only |
| D Late optional resource | Designed wait; failure UX = EC-P2-2 |
| E Context loss mid-transition | Not live |
| F Resize with district | Not live |
| G High content cardinality | Calculated; CMS extras safe; orbit growth = EC-P2-4 |
| H 50 round trips | Not run |
| I Studio vs build | Class exists (ARCH-P2-C). No new field exercised in Studio this session |
| J Partial asset contract | EC-P2-3 |

---

## 7. Resource / lifecycle census

**Not measured in a live session.** No JS heap, texture, buffer, program,
worker, or rAF producer counts were taken before/after repeated warps.

What the source *does* show:

| Resource | Cleanup path | Census |
|---|---|---|
| Navigation rAF | `reset` / `dispose` cancel | — |
| Hint timer | cleared | — |
| GSAP warp timeline | `kill` on unmount + onComplete | — |
| Context-loss listeners | effect detach | — |
| Murcia host + experience | effect dispose | — |
| Draco / Basis workers | Known residual from PERF (workers not terminated) — not re-measured | **Not this audit’s GPU soak** |
| `hintRetired` Set | Never cleared in-session | By design (one teach per world per page) |
| `bootState` / `intro` | `globalThis` / `window` singletons | Intentional |

---

## 8. Content-boundary matrix

| Layer | Case studies | Services / districts | Site settings | Legal | Blog |
|---|---|---|---|---|---|
| Studio | Field maxima; no orbit count; paired marks | District max 12 services | Singleton-ish in schema | Two linked ids are app-owned | Body / tags maxima |
| Mapper / build | `caseStudyProblems`; unused extras allowed | Binding ids must exist in tests | **Exactly one** or build fails | Required `terminos` / `aviso` | `ID_PATTERN` |
| Generated module | `CASE_STUDIES` | lists | `SITE_SETTINGS[0]` honest iff audit | `LEGAL_DOCS` throws if missing | chunked |
| Runtime | Atlas from **orbits**, not list length | Missing GLB node skipped | Crash only if generated module hand-edited empty | — | Route slug copy of `ID_PATTERN` |

**Mismatches**

- Studio/build identifier copies: ARCH-P2-C (not re-opened).
- Featured-orbit GPU size: no layer refuses n = 16 (EC-P2-4).
- Published service without GLB node: build of *content* can pass; asset
  contract passes only if the committed GLB still has the names (EC-P2-3).

`SITE_SETTINGS[0]` is **not** an edge-case hole in a real build: collection
audit + `site.test.ts` require length 1.

---

## 9. Browser / capability matrix

| Capability | Genuinely tested here | Emulated / inferred |
|---|---|---|
| Chromium desktop unit/jsdom | Yes (vitest) | — |
| Chromium Android Playwright | Partial (suite unfinished) | — |
| WebGL2 | Inferred via existing code/e2e | No forced create-fail |
| `WEBGL_lose_context` | Existing e2e test exists | Not re-driven mid-transition |
| `matchMedia` absent | No | Inferred |
| DPR 0.75 / >2 | No | Thresholds are CSS pixels |
| Real iOS / Android GPU | No | — |
| Hidden document / bfcache | No | Source only |
| Compressed texture absence | No | Satellite optional path exists |

---

## 10. Existing coverage gaps

| Finding | Why the suite missed it | Gap type |
|---|---|---|
| EC-P2-1 | Pinch tests never inject wheel during a claimed pinch | Missing state combination |
| EC-P2-2 | Murcia failure tests don’t assert Earth chrome / `onReady` | Missing sequence + UI ownership |
| EC-P2-3 | Contract check uses the good GLB; skip path is the success case for “not found” | Missing asset-contract assertion for *published* services |
| EC-P2-4 | Atlas tests use 3 plates; no 4096 assertion | Missing content/composition cardinality |
| EC-P3-1 | No listener-identity test | Missing unit boundary (low value) |
| EC-P3-2 | `config.test.ts` allowlists the happy Vercel cases only | Missing env combination |

---

## 11. Recommended regression suite

**Pure unit (do these first)**

1. Pinch-owns-progress ⇒ wheel does not `push` (EC-P2-1).
2. `readConfig({ VERCEL_ENV: 'staging' })` fails (EC-P3-2).
3. Atlas height at n = 16 / budget assertion (EC-P2-4).
4. Murcia `load()` reject ⇒ `onReady` not called + unavailable flag (EC-P2-2).

**Architecture / build harness**

5. Published `serviceId` ⇒ binding node must exist in the GLB (EC-P2-3).

**Playwright**

6. Only if (4) cannot be unit-tested: intercept city GLB 500, assert Earth
   usable and a visible “city unavailable” (after remediation). Not before.

**Do not add**

- A 50-cycle e2e soak as the first regression for any finding above.
- A second Escape-matrix e2e; fix ARCH-P2-F with one `Attention` helper and
  unit-test that helper.

---

## 12. Remediation roadmap

**Immediate**

- Ignore wheel while `pinchOwnsProgress` (EC-P2-1).
- Allowlist `VERCEL_ENV` (EC-P3-2).
- Memoize legal `onClose` (EC-P3-1).

**Short term**

- Split `murciaReady` from `murciaUnavailable` and surface failure on Earth
  (EC-P2-2).
- Fail asset-contract when a published service node is missing (EC-P2-3).
- Atlas dimension budget (EC-P2-4).

**Structural**

- Single attention owner (closes ARCH-P2-F and the Escape-duplication class).
- Move `transitionProgress | Overlay | Committed` off experience `SequenceState`
  (ARCH-P2-A) so commit/timeline/camera cannot drift by type.

**Opportunistic**

- Optional-resource timeout.
- `onRestored` still only logs — keep it until a real GPU rebuild exists.

---

## 13. Negative results

These were tested (source, unit, or harness) and found **safe**. Do not re-do
them without new code.

- 1114 unit tests and all listed harnesses were green on this tree.
- Warp endpoints: rest pose, FOV, flash, blur all return to 0 at `p = 0` and
  `p = 1`; flash covers the cut.
- Scrub band cannot produce flash or cross the cut; more gesture is always
  more travel.
- `transitionTo` re-entrancy is refused while a timeline exists.
- Machine `commit` is synchronous into `locked`; cooldown has a max (anti
  deadlock).
- `ctrl+wheel` (trackpad pinch) does not navigate.
- Third finger retreats a claimed pinch.
- `pointercancel` / passenger second finger on Earth orbit: harness pass.
- Murcia `pointercancel` does not leak tap suppression.
- `bootState.markDone` is monotonic and idempotent; optional `markFatal` is a
  warn, not a site-down.
- Subscribers to boot state fire on every change; `boot.ts` latches
  `vertigo:scene-ready` with `sawReady` (edge, not raw latch).
- After `fatal`, further `setStep` is ignored (late required completion cannot
  resurrect).
- Extra unused CMS case studies do not enlarge the brand atlas.
- `SITE_SETTINGS[0]` cannot be empty in a build that passed collection audit.
- Production refuses unnamed source and named fixtures.
- `VERCEL` set without `VERCEL_ENV` refuses to guess.
- Context loss is not silent; preventDefault is called; restore does not
  pretend to rebuild.
- Legal/contact Escape listeners are removed on close.
- `hintRetired` persistence across worlds is intentional, not a leak.
- District Escape closes detail then district (unit).
- Repeated Escape skip is gated after `site` / overlays (idempotent skip).

---

## 14. Not verified

Do not treat these as passes.

- Real iOS Safari and real Android Chrome / WebViews.
- Genuine background-tab throttling, bfcache, and multi-second `hidden`.
- Live mid-cinematic reverse at p = 0.51 / 0.90 in a browser.
- 5 / 20 / 50 Earth↔Murcia cycles with WebGL / heap census.
- Sequence fuzzer with fixed seeds.
- Request interception of every boot asset (0 ms … 5 s, fail combinations).
- `WEBGL_lose_context` during satellite deploy, district open, or warp.
- Live resize 1440↔390 with district or pinch active.
- Constrained `MAX_TEXTURE_SIZE` GPU.
- Studio UI accepting a document the mapper then rejects (Scenario I live).
- Temporary mutilated GLB (Scenario J runtime); only source + committed-GLB
  contract.
- Offline / cache version skew.
- Production `vite build` and Playwright suites other than `e2e/mobile.spec.ts`.
- Vercel dashboard and Sanity admin permissions.

---

## Appendix A — Environment note

Content of `docs/audits/reports/` from 2026-09-02 was used as context
(architecture, performance, cybersecurity, mobile). Production-readiness
latest dated file in-tree is older (2026-08-20) and was not re-executed.

This report names environment **variables** only.
