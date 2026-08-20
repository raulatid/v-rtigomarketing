# Mobile Responsiveness & Device Compatibility — Audit

**Date:** 2026-08-14 · **Against:** working tree at `3b37f87`
**Brief:** `audits/mobile-responsiveness-device-compability.md`
**Companion:** `audits/ios-safari-2026-08-14.md` — platform-specific risks live there, per the
brief's instruction not to confuse responsive-design problems with iOS problems.

---

## 1. Executive summary

**Functionally usable, architecturally sound, and blocked on two content surfaces.**

Not "architecturally desktop-first", which is the verdict the brief offers and which the code
does not support. The project has a coherent, capability-based mobile strategy that is visible
throughout: `(hover: none)` disables Murcia's hover raycast and makes the district label
permanent (`DistrictInteraction.ts:129`, `districtLabel.ts:28`); `(pointer: fine)` gates the
custom cursor so a phone never gets `cursor: none` (`CustomCursor.tsx:33`); tap tolerances are
already per-pointer-type on both Earth click paths; `DragPanController` is a complete Pointer
Events implementation with pinch, two-finger rotate, pointer capture, `pointercancel` and
Safari's non-standard `gesture*` events; and the district panel is a two-stop bottom sheet
whose camera framing is solved by raycasting an NDC target, which is correct in portrait by
construction. There is no `userAgent` sniffing anywhere in `src/`.

What the audit found is not an absent strategy. It is **specific gaps in that strategy, and
they cluster on the two surfaces that carry the product's actual content.**

1. **Murcia's districts cannot reliably be tapped.** A single 6 px drag threshold serves both
   mouse and finger, so a normal tap is classified as a drag and discarded. The lesson was
   learned, written down and applied to Earth on 2026-08-11; Murcia never received it.
2. **The Earth case panel is unusable in portrait, twice over.** The camera deliberately flies
   the selected satellite off the side of the frame to clear room for a panel that — at 375 px
   — is a 142 px column with roughly 70 px of usable content.

Both are P0. Both are local fixes. Neither requires touching the camera pose, the judged drag
feel, or the terrain-skirt geometry.

Below P0 the picture is ordinary responsive debt: a form that triggers iOS zoom, six touch
targets under 44 px, hover states that stick after a tap, and a loading caption that clips at
375 px precisely in its slow-network and failure states.

One finding is deliberately **not** treated as a defect to patch: Murcia's camera pose is tuned
against wide viewports and the portrait-override mechanism is built, tested and fed `null`.
That is the architectural issue the brief asks to be named rather than patched, and §4 does so.

### What this audit did not do

Source inspection plus emulated viewports. No physical device. No WebKit — `PROJECT_MEMORY`
§12 and the 2026-08-11 readiness audit both record that only Chromium has ever been tested, and
this audit does not change that. Frame rate and thermal behaviour on real mobile hardware are
unmeasured; every rendering-cost statement here is a static count, not a profile.

---

## 2. Findings

### P0 — Release blockers

---

#### M1 · A finger tap on a Murcia district is discarded as a drag

**Evidence.** `DragPanController.ts:623-636` compares pointer travel against one threshold
regardless of input:

```ts
if (!this.exceededThreshold) {
  const movedX = Math.abs(event.clientX - this.pointerDownX)
  const movedY = Math.abs(event.clientY - this.pointerDownY)
  if (Math.hypot(movedX, movedY) < this.config.dragThresholdPx) return
  this.exceededThreshold = true
```

`dragThresholdPx: 6` — `murciaConfig.ts:93`. `DistrictInteraction.onPointerUp` then refuses to
select while the controller reports a drag (`DistrictInteraction.ts:362`).

The controller already knows the pointer type — it reads `event.pointerType` at
`DragPanController.ts:556` to route one finger to pan and two to pinch/rotate — and does not
use it here.

**Affected.** Every touch device. Not viewport-dependent.

**Consequence.** Districts are the only *content* in Murcia; everything else is navigation.
A visitor who taps a lit district and misses by 7 px gets nothing, with no error and no
feedback. Because the failure is probabilistic rather than total, it reads as an unresponsive
site rather than a broken one — which is worse, since it is not reproducible on demand.

**Root cause.** The 2026-08-11 touch work fixed the *picking* half of this bug repo-wide
(raycast from the event's own coordinates) and the *tolerance* half only on Earth.
`interactionConfig.ts:26-30` carries both numbers and the reasoning:

> Touch needs its own number, not a retune of the one above. A finger tap routinely wanders
> 5–15px between contact and release — at 4px nearly every tap was classified as a drag and
> swallowed, which is half of why the site was mouse-only.

`createGeoMarkers.ts:59-60` has the same pair. `DECISIONS.md` §17 states the rule in general
form — *"tap tolerances are per pointer type… One threshold for both input classes is not a
compromise, it is a bug for one of them"* — and lists, under *How you would know it broke*, "a
`getDragClickThreshold()` that ignores pointer type". Murcia's does. The decision was recorded
without being carried into the module that most needed it.

**Direction.** `touchDragThresholdPx: 12` beside `dragThresholdPx: 6`, selected on
`pointerType`. This *implements* an existing decision; it does not overturn a judged value. The
drag feel constants (`PROJECT_MEMORY` §7, §11.15) are untouched — a tap tolerance is not a feel
number.

**Complexity.** Trivial. Two files, ~6 lines. **Local**, not architectural.

---

#### M2 · In portrait the camera flies the satellite off-screen, to clear room for an unreadable panel

**Evidence, part one — the camera.** `interactionConfig.ts:44-48`:

```ts
// Look-at offset to the camera's right, in world units at the satellite's
// depth: pushes the satellite LEFT on screen, clearing the right side of
// the viewport for the case panel.
screenOffset: 0.16 * R,
```

Applied unconditionally at `createFocusCameraRig.ts:205-215`. With `R = 2`, that is a 0.32-unit
lateral shift at a subject distance of `closeUp.distance = 0.55 * R = 1.1`, i.e. an angular
displacement of `atan(0.32 / 1.1) ≈ 16.2°` off the view axis.

Horizontal half-FOV, at the scene's vertical FOV of 45° (`introConfig.ts:126`):

| Viewport | Aspect | Horizontal half-FOV | Offset as % of half-width |
|---|---|---|---|
| 1600×900 | 1.78 | 36.4° | 45% — the intended composition |
| 768×1024 (iPad portrait) | 0.75 | 19.3° | 84% — at the frame edge |
| 390×844 (iPhone) | 0.46 | 10.8° | **150% — outside the frustum** |

The subject of the close-up leaves the screen.

**Evidence, part two — the panel.** `.case-panel` is declared once at `styles.css:62-85` and
**no media query anywhere in the file modifies it.** The only `@media` blocks in `styles.css`
are at `:385`, `:989`, `:996`, `:1021` and `:1239`, and none of them mention `.case-panel`.

```css
right: 20vw;              /* styles.css:67 */
width: min(420px, 38vw);  /* styles.css:69 */
padding: 2.25rem;         /* styles.css:71 */
```

At 375 px: `right: 75px`, `width: 142.5px`, `padding: 36px` each side — **≈ 70 px of content**,
holding a `1.5rem` title (`:132`), a two-column flex metric row (`:149-153`), a four-item
bullet list (`:186-194`) and a 158 px-tall chart box (`:216`) containing either a bar chart
with tick labels or a 96 px donut beside a legend (`CaseChart.tsx`, `styles.css:280-288`). The
donut alone is wider than the column.

**Affected.** Every viewport below ~768 px, and iPad portrait for the camera half.

**Consequence.** The case studies are the site's proof — the reason the Earth has satellites at
all. On a phone, tapping one moves the subject out of frame and opens a column too narrow to
read. Both halves fail in the same gesture.

**Root cause.** The two are one decision, and it was made for one viewport. `styles.css:57-60`
says so explicitly, calling the panel width *"a composition contract with the camera"* — which
is exactly why the panel was never made responsive, and exactly why fixing either half alone
would break the other.

**Direction.** Change both together.
- Below 767 px the panel becomes a bottom sheet. The pattern already exists and is already
  reasoned about: `murcia.css:316-352` and `PROJECT_MEMORY` §8, *"a bottom sheet covers the
  cheapest part of the image, where a side panel on a narrow screen would cover the city"*. The
  same argument holds for a globe.
- With the panel no longer on the right, `screenOffset` has nothing to clear and should go to
  zero there. Above the breakpoint it should be derived from the horizontal half-FOV rather
  than assumed constant, so it degrades continuously instead of at a threshold.

`cameraFraming.computeFramedFocus` (`cameraFraming.ts:135-155`) is the reference for how this
is done correctly — it raycasts the centre of the unobstructed rect to the ground plane, which
is aspect-correct in both axes by construction. Earth keeps its own implementation
(`ENGINEERING_PRINCIPLES` §12: the two camera systems are different responsibilities), but the
technique transfers.

**Complexity.** Moderate. One CSS block, one config value, one call site. **Local**, but the
two edits are coupled and must ship together.

---

### P1 — Major

---

#### M3 · Focusing any form field zooms the page and does not zoom back

**Evidence.** `styles.css:843-853` and `:888-892` — `.audit-input` and `.audit-select` are
`font-size: 0.9rem`, i.e. **14.4 px**. All five fields in `FIELD_DEFS`
(`AuditSection.tsx:69-109`) use the class.

`index.html:8` is `width=device-width, initial-scale=1.0` with no `maximum-scale`.

**Affected.** iOS Safari, all iPhone and iPad viewports.

**Consequence.** iOS auto-zooms on focus of any control below 16 px, and without a
`maximum-scale` it does not zoom back out on blur. The visitor is left at ~1.4× on a page whose
canvas is `position: fixed; inset: 0` with `touch-action: none` — so **they cannot pinch back
out either**. This is the site's only lead-capture form; it is the conversion path.

**Root cause.** A desktop type scale applied to form controls. Nothing device-specific was
considered because nothing about the number looks wrong on a desktop.

**Direction.** `font-size: 1rem` on `.audit-input`/`.audit-select`, with the 46 px control
height re-checked against the larger text. Do **not** reach for `maximum-scale=1` — suppressing
zoom is a WCAG 1.4.4 failure and treats the symptom.

**Complexity.** Trivial. **Local.**

---

#### M4 · Six controls are below the 44 px touch target minimum

**Evidence.**

| Control | Size | Where |
|---|---|---|
| `.case-panel__close` | 28 × 28 | `styles.css:116-117` |
| `.district-panel-close` | 32 × 32 | `murcia.css:173-174` |
| `.district-panel-handle` | 26 tall | `murcia.css:333` |
| `.district-label` | ≈ 31 tall | `murcia.css:128-133` |
| `.audit-close` | ≈ 36 tall | `styles.css:648, 665-666` |
| `.experience-switch` | ≈ 42 tall | `styles.css:1197-1198` |

**Affected.** All touch devices; worst on small phones.

**Consequence.** `.district-label` and `.experience-switch` are the ones that matter. The label
is the *only* district affordance on a touch device — `districtLabel.ts:38` makes it permanent
precisely because there is no hover — and `PROJECT_MEMORY` §11.24 records the rule it is meant
to satisfy: *"a label made visible must also be made activatable… a visible control that
ignores taps is worse than no control."* At 31 px it is activatable but fiddly.
`.experience-switch` is the only way out of Murcia.

**Root cause.** The 44 px rule was applied deliberately in exactly one place —
`murcia.css:234-236` calls `min-height: 46px` on the service headers *"the one place in this
interface where that figure genuinely applies"* — and that judgement was not revisited when
the other controls became touch surfaces.

**Direction.** Expand hit areas via padding or a `::before` overlay rather than growing the
visuals, so the design is unchanged. `.district-label` should grow honestly, since it is a
primary affordance rather than a chrome control.

**Complexity.** Low. **Local.**

---

#### M5 · The controls hint teaches mouse gestures to touch users

**Evidence.** `overlays.ts:66-70`:

```html
<span><kbd>Arrastra</kbd> mover</span>
<span><kbd>Botón derecho</kbd> girar</span>
<span><kbd>Rueda</kbd> acercar</span>
<span><kbd>Clic</kbd> en un distrito iluminado</span>
```

There is no `(hover: none)` or `(pointer: coarse)` variant. Meanwhile
`DragPanController.ts:730-752` implements two-finger centroid rotation and pinch zoom, and
`PROJECT_MEMORY` §7 documents the full gesture table.

**Affected.** All touch devices.

**Consequence.** Three of four instructions name inputs the device does not have. The two
gestures that *do* exist — two fingers to turn, pinch to zoom — are never communicated, so the
most capable half of the navigation is undiscoverable. Secondary: at 375 px the four spans wrap
to two or three lines at `bottom: 16px` (`murcia.css:91-105`), directly under the home
indicator.

**Root cause.** The hint predates the touch gesture work and was not revisited when the
gestures landed.

**Direction.** A `(hover: none)` variant naming the real gestures. The copy is Spanish
(`DECISIONS.md` §11).

**Complexity.** Trivial. **Local.**

---

#### M6 · Hover states stick after a tap

**Evidence.** Thirteen `:hover` rules, none wrapped in `@media (hover: hover)`:
`styles.css:125, 440, 441, 442, 546, 672, 723, 859, 938, 983, 1213`; `murcia.css:182, 247`.

**Affected.** All touch devices.

**Consequence.** iOS applies `:hover` on tap and holds it until another element is tapped. Most
visible: `.audit-close:hover { transform: translateX(-4px) }` (`styles.css:674`) leaves the
close arrow permanently displaced after use. The rest are colour and border shifts that read as
a stuck selection.

**Root cause.** Hover styling written before touch was a target, never audited afterwards.

**Direction.** Wrap them. This is the CSS half of the same rule `PROJECT_MEMORY` §11.24 states
for JS.

**Complexity.** Trivial, but touches many lines. **Local.**

---

#### M7 · The loading caption clips at 375 px — in exactly the states a phone reaches

**Evidence.** `introDraw.ts:68` sets `white-space: nowrap` on `.intro-caption`. The longest
strings (`introDraw.ts:36-37`) are:

- `Esto está tardando más de lo habitual` — 38 chars
- `No se pudo cargar la experiencia` — 32 chars

at `0.82rem` uppercase with `letter-spacing: .14em`, which measures roughly 430–450 px. The
page is `body { overflow: hidden }` (`styles.css:18`), so the overflow is clipped, not
scrollable.

**Affected.** Viewports below ~460 px — every phone in portrait.

**Consequence.** The two clipped captions are the slow-network warning and the hard-failure
message. A visitor on a poor cellular connection — the population most likely to see them — is
the population least able to read them. `DECISIONS.md` §10 makes the honesty of these captions
a decision; a truncated caption is a broken one.

**Root cause.** `nowrap` was chosen for a single centred line under the mark. It holds at every
desktop width.

**Direction.** Allow wrapping with a `max-width` and centred text. Note the constraint:
`introDraw.ts` injects its own stylesheet because it runs before `styles.css` resolves, and the
intro chunk is asserted against a **16 000 B budget that fails the build** (currently
13 325 B). The fix must be a few characters of CSS, not a layout system.

**Complexity.** Trivial. **Local.**

---

#### M8 · Layout-mode decisions are never re-evaluated after rotation

**Evidence.** `AuditSection.tsx:232` — `auditView.open = window.innerWidth >= MOBILE_MAX` — is
read once, when the section opens, and then drives `AuditCameraShift`'s `setViewOffset`
recomposition for as long as the section stays open.

More broadly, **every `matchMedia` call in the repo is a one-shot `.matches` read** with no
`change` subscription: `CustomCursor.tsx:33,46`, `AuditSection.tsx:229`,
`warpTransition.ts:183-184`, `useMasterTimeline.ts:45`, `boot.ts:52`,
`MurciaExperience.ts:467-468`, `districtLabel.ts:28`, `DistrictInteraction.ts:129`.

**Affected.** Any device that rotates, and iPad multitasking.

**Consequence.** Open the audit section in portrait on a phone, rotate to landscape: the
viewport crosses 768 px, but the camera keeps the decision it made in portrait and never
recomposes. Toggling Reduce Motion mid-session likewise has no effect until reload.

**A second candidate was investigated and rejected.** `districtPanel.isDesktopLayout`
(`:132-134`) is read the same way, but only at `:335`, to decide whether opening an accordion
section should also raise the sheet. That decision **ends with the gesture**, so a one-shot
read is correct there and subscribing it would change nothing. The related question — whether
the camera should re-frame when rotation changes the sheet's `dvh` height — is answered *no* by
`PROJECT_MEMORY` §8, which rejects re-framing on sheet expansion because "chasing the remaining
strip reads as instability". The same argument covers rotation. Recorded because the difference
between the two reads is the whole finding: **the distinction is not one-shot versus subscribed,
it is whether the decision outlives the gesture that made it.**

Note this is *not* a canvas resize bug — the WebGL side handles rotation correctly. R3F's
`react-use-measure` observes `resize` and `orientationchange` transitively, `MurciaExperience.setViewport`
re-resolves aspect, pose and bounds (`:546-572`), and the composer resizes with the DPR
(`RenderPipeline.tsx:117-120`). The stale state is DOM-layout state only.

**Root cause.** A one-shot read is correct for a decision made at open time and wrong for one
that outlives the gesture. The distinction was never drawn.

**Direction.** Subscribe the layout-mode reads to `change`. Leave the genuinely one-shot ones
alone (`SkyShell.tsx:52-57` documents why the sky variant is deliberately read once — swapping
an 18.9 MB texture for a 75.5 MB one mid-session is not a rotation behaviour anyone wants).

**Complexity.** Low. **Local**, but it is a small ownership question: the subscription belongs
to whoever owns the layout decision, not to a shared hook.

---

### P2 — Moderate

**M9 · Murcia's camera pose is tuned for wide viewports, and the portrait override is built,
tested and switched off.** `murciaConfig.ts:88-89` sets `cameraPortraitOverrides: null`, and
`resolveCameraPose` (`environmentConfig.ts:334-343`) short-circuits to the landscape pose at
every aspect — asserted as current behaviour by `environmentConfig.test.ts:10-17`. Every
justification in the config file is a landscape one (`:263-267`: *"50-85 units of corner margin
on wide viewports (portrait barely notices…)"*), and the safety analysis is one-sided: it
guards the footprint being too *large*, never too *narrow*. At 9:19.5 the horizontal half-angle
falls from 28.2° to 8.2° at fixed vertical FOV 35°, so the city is framed ~3.4× narrower.

**This is the architectural finding the brief asks to be named rather than patched**, and it is
deliberately excluded from remediation. `PROJECT_MEMORY` §5 is unambiguous: any resting-pose
change invalidates the terrain-skirt margin and requires re-running the full azimuth sweep
across every aspect, and it *"is a much larger job than it looks"*. It also needs a composition
judged by a person, which no harness can supply. The mechanism is already the right one — it
wants data, a sweep, and an owner's eye, as its own change.

**M10 · Six case markers are invisible forever on touch.** `.geo-tag` is `opacity: 0` revealed
by hover (`styles.css:337-368`), and only `--destination` has a `(hover: none)` fallback
(`:385-393`). `styles.css:374-377` documents this as deliberate. Flagged as a product question,
not a bug: it means the case studies are discoverable only by tapping unmarked satellites.

### P3 — Minor

**M11.** No `-webkit-tap-highlight-color` or `-webkit-touch-callout`, and `user-select` is
declared exactly once (`murcia.css:49`) — grey tap flash and long-press selection on every
control. `AuditCameraShift.panelWidth()` (`:19-21`) does not mirror the 768–1024 px CSS
override at `styles.css:989-993`, giving ~25 px of framing error on iPad portrait.
`GeoMarkersLayer.tsx:48` and `logoMotion.ts:82-83` seed from `window.innerWidth/Height` while
everything around them uses R3F's `size` — identical today, wrong by construction.
`.district-label` is positioned with `translate(-50%, -100%)` and no viewport clamping
(`districtLabel.ts:41-54`), so a label near the screen edge can sit half off-screen.

### Corrections to claims made during this audit

Two plausible findings were investigated and are **false**; recorded so they are not
rediscovered.

- **The renderer does not run at 3× DPR on iPhones.** `SceneCanvas.tsx:81-85` passes no `dpr`,
  but R3F's default is `dpr = [1, 2]` — verified at
  `node_modules/@react-three/fiber/dist/events-b389eeca.esm.js:15604`, and already recorded in
  `PROJECT_MEMORY` §11.38. The cap exists; what it lacks is an owner (see the iOS report, I4).
- **There is no missing resize handling.** `murcia/core/resize.ts` is a type-only module and
  `src/` contains no `ResizeObserver`, but that is by design: R3F's `react-use-measure`
  installs one on the container *and* listens for `resize` and `orientationchange`. The WebGL
  resize path is correct end to end.

---

## 3. Mobile architecture assessment

| Responsibility | Owner today | Verdict |
|---|---|---|
| Responsive UI | `styles.css` + `murcia.css`, two breakpoints (767 / 1024), mirrored by three JS constants | **Coherent but thin.** The breakpoints agree across CSS, JS and the `index.html` preload `media` attributes, which is more discipline than most projects manage. `.case-panel` is simply missing from it. |
| Responsive 3D framing | Murcia: `cameraFraming.ts` (correct — solves an NDC target by raycast). Earth: `interactionConfig.closeUp` (fixed world-space constants) | **Split, and only half of it is right.** Murcia's approach is aspect-correct by construction. Earth's is a set of numbers tuned at one aspect. |
| Touch interaction | `DragPanController` (Murcia), `createFocusCameraRig` + `createSatelliteFocus` + `createGeoMarkers` (Earth) | **Good, with one hole.** Pointer Events throughout, no `mouse*` listeners anywhere, capture and cancellation handled. The hole is M1. |
| Input capability detection | Per-feature `matchMedia` and `pointerType` checks | **The right pattern**, explicitly preferred by the brief over device detection. Its weakness is that it is one-shot (M8), not that it is capability-based. |
| Adaptive rendering quality | Nobody | **Absent.** Covered in the iOS report; the only device-conditional asset in the project is the sky panorama. |
| Viewport changes | R3F `useThree().size`, fanned out to Murcia, the composer, the CSS2D renderer and the corner logo | **Correct.** Single source of truth, one subscriber per consumer. |

**The one thing that has no owner is Earth's responsive framing.** Murcia has a module whose
job is "frame this target around that obstruction". Earth has constants. M2 is the symptom;
the absence of that boundary is the cause, and it is why the panel width had to be documented
as "a composition contract with the camera" rather than derived. Fixing M2 does not require
building Murcia's module for Earth — but if a second Earth framing case ever appears, that is
the abstraction to reach for, and `ENGINEERING_PRINCIPLES` §12 says to wait until then.

`ARCHITECTURE.md` contains **no mention of mobile, responsive, viewport, touch or breakpoint**.
Given that the responsive behaviour is real and distributed across both experiences, that is a
documentation gap worth closing once this work lands.

---

## 4. Implementation plan

Ordered by the brief's priority: functional blockers, interaction correctness, framing, layout,
rendering stability, polish.

1. **M1** — per-pointer-type tap tolerance in Murcia. Assert it with a negative control: a 9 px
   touch gesture must select, a 9 px mouse gesture must still drag. `PROJECT_MEMORY` §10 —
   *"a verification with no negative control cannot tell 'fixed' from 'never broken'"*.
2. **M2** — `.case-panel` bottom sheet below 767 px **and** aspect-aware `screenOffset`, as one
   change.
3. **M3** — 16 px form fields.
4. **M5** — touch gesture copy in the controls hint.
5. **M4** — touch target sizes.
6. **M6** — gate `:hover` on `@media (hover: hover)`.
7. **M7** — let the intro caption wrap.
8. **M8** — subscribe layout-mode media queries to `change`.
9. **Validation** — emulated mobile Playwright projects. `PROJECT_MEMORY` §11.25: a context
   with `hasTouch: true` still reports `hover: hover`, so a device profile is required or every
   `(hover: none)` rule stays inert and the fixes look verified when they are not.

Deferred with reasons stated above: **M9** (architectural, needs a sweep and a judged
composition), **M10** (product decision), **M11** (polish).

## 5. What remains unverified

- Frame rate and thermal behaviour on real mobile hardware. Every performance statement in the
  companion report is a static count.
- Physical touch feel: whether 12 px is the right tolerance for *this* interaction. ~~whether the
  bottom sheet's stops suit the case panel as they suit the district panel.~~

  **Answered 2026-08-18, by use.** They do, and the single-stop sheet M2 shipped did not: at one
  fixed 60dvh its top edge sat at 40% of the screen while the close-up centres the satellite at
  50%, so the panel covered its own subject, and 28–38% of the case sat behind a scroll with
  nothing to indicate one. The case panel now carries the same peek/expanded stops and the same
  44 px handle. The audit also missed that the M2 breakpoint was width-only: a phone in landscape
  is 852×393 and kept the desktop dock, 820 px tall on a 393 px screen and unscrollable. See
  DECISIONS 26.19.
- WebKit, at all. See the companion report's device matrix.

---

## 6. Remediation status — 2026-08-14, same day

P0 and P1 were implemented in the same pass as this audit. Recorded here rather
than in a separate document so the finding and its fix stay in one place.

| # | Status | What shipped |
|---|---|---|
| M1 | **Fixed** | `touchDragThresholdPx: 12` beside the mouse `6`, selected on `event.pointerType`. Guarded by `checks/navigation-feel.ts` §12, five assertions, **verified against a negative control**: reverting the selection makes the touch assertion fail and the mouse one pass. |
| M2 | **Fixed** | `.case-panel` gets a `max-width: 767px` bottom sheet, and `closeUp.screenOffset` became `camera/closeUpFraming.ts` — a fraction of the horizontal half-width, zero below the breakpoint. Unit-tested for desktop parity (reproduces the old 0.32 world units at 16:9 to three decimals) and for staying inside the frustum at every aspect the dock is used at. |
| M3 | **Fixed** | Form fields to `1rem`/16 px, control height 46 → 48 px. Measured on an emulated Pixel 7 at 390 px: `fontSize: 16px`, height 48. |
| M4 | **Fixed** | `.district-label` grew honestly (31 → 44 px) because it is a primary affordance; the five chrome controls gained an invisible 44 px hit area under `(pointer: coarse)`. Verified with `elementFromPoint`: `.audit-close` responds 21 px from its centre, against an 18 px box half-height. |
| M5 | **Fixed** | `ControlsHint` gains a `(pointer: coarse)` variant naming the real gestures — *Arrastra / Dos dedos / Pellizca / Toca*. |
| M6 | **Fixed** | Nine `:hover` rules wrapped in `@media (hover: hover)`, with `:focus-visible` split out where the two shared a selector. Four were deliberately left: three debug-console rules that never reach production, and a `::-webkit-scrollbar-thumb` that has no touch equivalent. |
| M7 | **Fixed** | `white-space: nowrap` → `max-width: calc(100vw - 2rem)` and centred. Asserted in `e2e/mobile.spec.ts` against the longest caption. |
| M8 | **Fixed, and narrowed** | The audit section's breakpoint read is now subscribed to `change`. The `districtPanel` half was investigated and rejected — see the finding. |
| M9, M10, M11 | **Open** | Deferred with reasons stated above. |

Also fixed while in the same files, and flagged as scope: the six
`backdrop-filter` declarations gained `-webkit-` prefixes and `.audit-select`
gained `-webkit-appearance` (the companion report's I9, a P2). One line each, and
leaving one prefixed site beside five unprefixed ones would have been worse than
either state.

**Validation.** Two emulated mobile Playwright projects were added
(`mobile-android` on `devices['Pixel 7']`, `mobile-ios-shaped` at 393×852/DPR 3),
scoped to `e2e/mobile.spec.ts`. Both are Chromium and the config says so: **this
does not close the Safari gap.** 18 e2e tests pass across the three projects, all
426 unit tests and all 185 harness assertions pass, and the desktop screenshot
baselines are unchanged. Screenshots were read back at 320, 390, 430, landscape
844×390 and 768×1024.
