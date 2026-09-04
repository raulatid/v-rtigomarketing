# Mobile Responsiveness & Device Compatibility — Audit

**Date:** 2026-09-02 · **Against:** working tree at `528dd42` (plus the uncommitted blog
mobile phase in `src/blog/` and `e2e/mobile.spec.ts`, which was audited as it stands)
**Brief:** `audits/mobile-responsiveness-device-compability.md`
**Supersedes where it disagrees:** `mobile-responsiveness-2026-08-14.md`. This is a delta. The
08-14 report remains accurate for everything not restated here, and §6 below revalidates each of
its findings against today's tree. Platform-specific risks stay with the iOS brief
(`ios-safari-2026-08-14.md`) and are only pointed at, not restated.

---

## 1. Executive summary

**Not safe to release as a mobile experience today, for one reason that is an asset and not a
design — and mostly mobile-compatible with specific defects once that asset is fixed.**

The 08-14 verdict was "functionally usable, architecturally sound, blocked on two content
surfaces". Both of those surfaces were fixed the same day and the fixes hold: the case panel is a
two-stop sheet on every phone-shaped viewport tested, district taps use a per-pointer tolerance,
the forms are 16 px, the loading caption wraps. What has happened since is that the product grew
three new surfaces — the pinch navigation, the projected services display, and the blog — and
two of the three were built with the mobile rules already in hand. The pinch works on every touch
profile tested, in both directions, down to 320 px. The blog is the most complete mobile layout in
the codebase.

What blocks release is the sky. **Every viewport at or below 767 px renders a black sky**, because
the narrow panorama pair was committed on 2026-08-31 with spaces in its filename
(`sky-panorama - narrow.avif`) while the config asks for `sky-panorama-narrow.avif`. The loader
tries the AVIF, tries the WebP, gives up, and correctly declines to fail the boot over a
decorative texture — so the Earth floats in flat black with no error anywhere a visitor could see.
The wide pair that landscape phones and tablets do receive is 10000 × 5000 px, which three.js
resamples on the CPU to 8192 × 4096 before uploading 134 MB to a phone GPU. `PROJECT_MEMORY`
§11.64–65 (uncommitted) already records both facts; this pass confirms them live on four device
profiles and adds one more: the screenshot test that exists for exactly this viewport
(`e2e/backdrop.spec.ts` › *narrow viewport uses the small panorama*) **passes against the black
sky**. Its baseline predates the asset, and a black-dominant panorama differs from no panorama by
less than the 2 % pixel tolerance. Nothing automated in the repository can currently see that the
sky is missing.

Below that, the findings cluster on **the one surface that has never had an aspect term**: the
services display. The district's only content is now a 48-unit plane in world space, framed at a
fixed distance. On a 393 × 852 phone the plane is wider than the frame — its top edge and the
"next" arrow leave the screen, the body copy is roughly 9 CSS px tall, and every control's hit
rectangle is under 44 px. In landscape the copy is about 6 px. This is the 08-14 M9 finding
("Murcia's camera is tuned for wide viewports and the portrait override is switched off") coming
back with content on it, and it is again the architectural item rather than a coordinate to
patch.

The rest is ordinary responsive debt of the kind the 08-14 pass also found, now on the surfaces
added since: a rotation that re-downloads the desktop Earth textures, a footer that overprints
the case sheet, four new controls under 44 px, nine unguarded `:hover` rules in the blog
stylesheet, and a peek stop that assumed one screen height.

### What this audit did and did not do

Source inspection, then a **driven production build** (`vite build` of the working tree, served
by `vite preview`) on seven emulated profiles: 320 × 568 @2×, 393 × 852 @3×, Pixel 7
(412 × 839 @2.625×), 430 × 932 @3× (the scene half only), 844 × 390 @3× landscape,
768 × 1024 @2×, and 1600 × 900 @1× as the desktop control. Each mobile run booted to `site`, opened the audit form,
the legal panel and the contact dialog, clicked a real satellite to open a real case panel, rotated
with it open, pinched into Murcia, entered the services district through its keyboard surface,
opened the detail, rotated, and pinched back — then loaded `/blog` cold, read an article, scrolled,
and rotated. Every control on screen was measured, every asset request logged, every console
warning kept.

**All of it is Chromium with software GL.** No WebKit, no physical device, no thermal or frame-rate
measurement, no browser chrome appearing and disappearing (so `dvh` behaviour is asserted from
CSS, not observed). Those limits are the same ones the 08-14 pass and the playwright config state,
and nothing here narrows them. Type sizes on the 3D display were measured from the captured
frames, not from the DOM, and are ±1 px.

---

## 2. Findings

Numbering continues from the 08-14 report (M1–M11) so the lineage stays addressable.

### P0 — Release blocker

---

#### M12 · The sky is black on every phone in portrait, and 200 MB of texture on every phone in landscape

**Evidence, part one — the narrow pair does not exist at the path the code asks for.**

```
public/textures/sky-panorama - narrow.avif   294 470 B   10000 x 5000
public/textures/sky-panorama - narrow.webp   426 968 B   10000 x 5000
public/textures/sky-panorama.avif            294 470 B   10000 x 5000
public/textures/sky-panorama.webp            426 968 B   10000 x 5000
```

`spaceConfig.ts:111-114` requests `/textures/sky-panorama-narrow.avif` and `.webp`;
`index.html` preloads the same hyphenated path under `media="(max-width: 767px)"`. The two
"narrow" files are byte-identical to the wide ones — the narrow variant has been undone as well as
misnamed.

Measured on the 320, 393, Pixel 7 and 430 profiles, identically:

```
[sky] /textures/sky-panorama-narrow.avif did not decode, falling back to /textures/sky-panorama-narrow.webp
[sky] no panorama variant loaded, last tried /textures/sky-panorama-narrow.webp
```

Under `vite preview` the two requests return `200 text/html` (the SPA fallback), which is why
nothing in the network log looks like a 404; on Vercel, which has no catch-all rewrite
(`vercel.json`), they are real 404s. Either way `loadFirstAvailable` (`SkyShell.tsx:83-100`)
exhausts its list, `markDone` declines to fail the boot over an optional texture, and the
1 × 1 black placeholder (`SkyShell.tsx:110-114`) is what ships. Screenshots at rest on every
portrait profile show the Earth against flat black with the star shell but no panorama.

**Evidence, part two — the wide pair is over the ceiling.** The 844 × 390 landscape profile is
wider than 767, so it received the wide AVIF (294 KB — over the 200 000-byte client budget
`spaceConfig.ts` documents) and the console recorded:

```
THREE.WebGLRenderer: Texture has been resized from (10000x5000) to (8192x4096).
```

That is a 50-megapixel decode (200 MB RGBA) followed by a CPU resample and a 134 MB upload, on
the platform the 08-14 I2 fix was written to spare. The same warning appeared on the 768 × 1024
and 1600 × 900 runs, so the wide half is not mobile-specific — it is worst on mobile. On GPUs
whose `MAX_TEXTURE_SIZE` is 4096 — common on older mobile — three resizes further or the
upload fails, and the outcome is the same black sky by a different route. The standing decision
is 4096 × 2048 (`spaceConfig.ts:120-133`).

**Affected.** Part one: every viewport ≤ 767 px wide — every phone in portrait. Part two: every
viewport ≥ 768 px, which includes every phone in landscape and every tablet.

**Consequence.** The sky is the backdrop the intro waits on and the thing the 2026-08 sky work
was all about; on the device class most visitors will use, it is absent, silently. On the other
device class it costs more memory than the Earth trio and the post chain together.

**Root cause.** `4e590d0` / `528dd42` committed a new source image directly into `public/`
without running `scripts/prepare-sky-panorama.mjs`, which is the only thing that names, sizes and
levels the four files. Nothing verifies that the URLs in `SPACE_CONFIG` resolve to files
(`PROJECT_MEMORY` §11.64), and the one test aimed at this viewport does not see it either:
`e2e/backdrop.spec.ts` › *narrow viewport uses the small panorama without banding* was run
during this audit against the current build and **passed** (1 passed, 9.4 s). Its baseline was
last committed on 2026-08-20 with a sky in it, and `maxDiffPixelRatio: 0.02` with Playwright's
default per-pixel threshold absorbs the difference between a faint black-dominant panorama and
none. A screenshot diff is the wrong instrument for "did the texture load"; a request-status or
a console-warning assertion is the right one.

**Direction.** Run the prep script on the source — that is an asset operation, not a code edit.
Then close the gap that let it through: a build-time check that every path in `SPACE_CONFIG.sky`
and `EARTH_TEXTURES` exists under `public/` (the same shape as `checks/city-asset.ts`), so a
misnamed file fails `npm run build` rather than a visitor's first frame. The dimension ceiling
belongs in the same check.

**Complexity.** Trivial for the asset; small for the check. **Local.**

---

### P1 — Major

---

#### M13 · The services display has no aspect term, so on a phone its copy is 6–10 px and its controls are under 44 px

**Evidence.** The district's entire UI is one 48 × 48 world-unit plane (`servicesDisplay.ts:80-81`),
tilted, 28 units above the plaza (`:90`), whose copy is a `CanvasTexture` drawn at fractions of a
`TYPE_UNIT` of 1040 canvas px (`:116, :513-539`). The camera flies to the plaza at
`focusDistanceScale: 0.78` (`cityDistrictBindings.ts:114`), and `computeDestination`
(`DistrictInteraction.ts:434-479`) solves only *where* the plaza lands in the frame — the distance
is the constant, and nothing in the solve reads the aspect ratio. The comment on the binding does
the arithmetic for the vertical axis: "at fov 35 the visible height at the focus is ~96 units
against a 48-unit panel".

The horizontal axis is the one a phone constrains. Visible width at the focus is 96 × aspect:

| Viewport | Aspect | Visible width at focus | 48-unit panel | Measured |
|---|---|---|---|---|
| 1600 × 900 | 1.78 | 171 units | 28 % of frame | fits |
| 320 × 568 | 0.56 | 54 units | 89 % | fits, top edge at y ≈ 20 px |
| 412 × 839 | 0.49 | 47 units | **102 %** | wider than the frame |
| 393 × 852 | 0.46 | 44 units | **109 %** | top edge and right arrow off-screen |
| 430 × 932 | 0.46 | 44 units | **109 %** | same |

At 393 × 852 the captured frame shows the panel's top edge above the viewport, the "›" (next)
glyph at x ≈ 294 of 393 with the panel continuing past the right edge, and the corner logo's 3D
mark drawn over the VOLVER control in detail mode (the mark sits at `cornerMarginX/Y: 48`,
`introConfig.ts:232-233`, which is exactly where `BACK_RECT` lands when the panel fills the width).

Type, measured from the captures: summary body ≈ 9–10 CSS px at 393 portrait, ≈ 8 px at 320,
≈ 6 px at 844 × 390 landscape; the title ≈ 17 px portrait. Hit rectangles are authored as
fractions of the readable core (`displayConfig.ts:45-57`): with the core ≈ 300–390 CSS px wide on
a phone, VOLVER is ≈ 80–100 × 26–33 px, the arrows ≈ 48–62 × 29–37 px and SABER MÁS ≈ 108–140 × 29–37 px.
All are under 44 px tall, on a plane leaning 45° away so the projected height is the smaller
number, and there is no per-pointer expansion because the hit test is a raycast
(`DistrictInteraction.ts:552-574`).

**Affected.** Every phone; worst on 9:19.5 portrait and on any landscape phone.

**Consequence.** The services are the only content in Murcia (`DECISIONS` §34). On a phone the
text is at or below the size a visitor can read without pinching — and pinching is claimed by the
navigation (`ADR 012`), so it navigates *away* instead. The controls are fiddly at best; the one
that exits is under the corner logo.

**Root cause.** The same one as 08-14 M9 and M2: a composition tuned at one aspect, expressed as
constants. `DECISIONS` §34 says `focusDistanceScale` and `PANEL_ELEVATION` are "a tuning pair that
arithmetic cannot settle", which is true of *where* the panel sits in the frame and false of
*whether it fits*: fit is `min(hHalfFov, vHalfFov)` against the panel's angular size, and that is
arithmetic. The DOM panel this replaced had a bottom-sheet breakpoint; the shader has nothing.

**Direction.** Architectural, and it should be one helper rather than three retunes:
"fit an angular subject into the frame with a margin, on the shorter half-FOV". The district flight
would derive its distance from that (portrait dollies out; the plaza is still centred by the
existing `computeFramedFocus`), and the close-up in M19 would use the same term. Separately, the
display needs a minimum on-screen size for its controls and its type — either a viewport-derived
`TYPE_UNIT` and rect inflation on coarse pointers, or, cheaper and already built, unclip the
`district-a11y` DOM controls on `(pointer: coarse)` so a phone gets real 44 px buttons and the
plane stays presentation. That second option also answers the wayfinding gap §34 leaves open.

**Complexity.** Moderate. **Architectural** (the fit helper), plus a local decision on the
controls.

---

#### M14 · Rotating across 767 px downloads and uploads the other Earth texture set

**Evidence.** `EarthScene.tsx:62-69` declares `earthTextureUrls()` with a comment that begins
"Read ONCE at load, deliberately" and ends "A phone that rotates keeps the narrow set". It is
called at `:79-81` — inside the component body, as the argument to `useLoader` — so it is
evaluated on **every render**, and `useLoader` fetches whatever URLs it is handed.

Measured with a targeted probe (393 × 852 → 852 × 393 at rest on Earth, nothing open):

```
+363 ms  /earth/day.jpg
+363 ms  /earth/night.jpg
+363 ms  /earth/specularClouds.jpg
```

Rotating back fetched nothing (both sets are now cached). The full runs confirm it in both
directions: the 393, Pixel 7 profiles ended their sessions holding both trios; the 844 × 390
landscape profile loaded the **wide** trio at boot (it is wider than 767) and then the narrow trio
after rotating to portrait. The 320 × 568 profile, whose landscape is 568 px, never crossed the
breakpoint and never double-loaded. The sky does not have this bug: `skyCandidates()` is called
once inside an effect (`SkyShell.tsx:192-197`).

**Affected.** Any phone whose landscape width is ≥ 768 px — every current iPhone and most
Android phones — on the first rotation, in either direction. Any phone that is *first opened* in
landscape gets the desktop set outright.

**Consequence.** 2.43 MB more on the wire and 134 MB more on the GPU (the wide trio at
4096 × 2048 with mipmaps, per the perf report §2.3), added to the 34 MB the narrow set already
holds — `useLoader` caches both and nothing disposes the first. That is the 08-14 I2 saving
(134 → 34 MB) undone by turning the phone sideways, on the device the iOS report puts nearest
to context loss (I1). The frame did not blank during the swap in the probe (the narrow textures
keep drawing until the wide ones upload), so nothing visible tells the visitor why the phone got
warm.

**Root cause.** The choice of set is a *device* decision that was implemented as a *width* read,
and the width read was placed where React re-runs it. `DECISIONS` §25 says width decides layout
and capability decides input; asset weight is a third thing, and it should follow the device's
shorter side, which does not change when the device rotates.

**Direction.** Decide the set once — `useState(() => earthTextureUrls())` or a module-level
constant like the sky's — and decide it on `Math.min(innerWidth, innerHeight)` rather than width,
with the `index.html` preload `media` moved to the matching `(max-width)` **and** `(max-height)`
pair so the two keep agreeing. Extend `e2e/mobile.spec.ts` with a request-count assertion across a
rotation; that is the negative control `PROJECT_MEMORY` §10 asks for.

**Complexity.** Trivial. **Local.**

---

#### M15 · The site footer prints over the case sheet on every phone

**Evidence.** `.site-footer` is `position: fixed; bottom: max(14px, …); z-index: 42`
(`styles.css:1742-1747`). `.case-panel` is `z-index: 35` (`:118`) and, below 767 px or 500 px
tall, `bottom: 0` (`:463-470`). Both are bottom-anchored on the same screens and the footer is on
top. Measured: at 320 × 568 the copyright line sits across the metric tiles at the peek stop; at
393 × 852 across the description paragraph; at the expanded stop across the chart's bottom-right
corner; in 844 × 390 landscape across the meta line. `pointer-events: none` on the footer means it
never blocks a tap, so this is text over text, not a dead zone.

**Affected.** Every viewport that gets the sheet.

**Consequence.** The case study's copy — the site's proof — has "© 2026 Vértigo" written through
it wherever the sheet's content happens to scroll to.

**Root cause.** The footer landed (`DECISIONS` §30) after the sheet, at a z-index chosen against
the desktop dock, which it never overlaps.

**Direction.** The footer is Earth chrome and the sheet is Earth content; hide the footer while a
sheet is open (the same `contextChanged` push the rail used), or move it below z 35 so the sheet
covers it. Trivial. **Local.**

---

### P2 — Moderate

---

#### M16 · Four controls added since 08-14 are under the 44 px touch minimum

| Control | Rendered | Where | Why the existing fix missed it |
|---|---|---|---|
| `.contact-trigger` | 80 × 38 | `styles.css:1793`, and the ≤767 block at `:2147-2156` sets `height: 38px` explicitly | not in the `(pointer: coarse)` hit-area list at `:1707-1720`, which names only `.case-panel__close, .audit-close` |
| `.modal-close` (contact and legal dialogs) | 34 × 34 | `styles.css:1879-1884` | same |
| `.blog-topbar__home` above 767 px | 26 × 44 | the 44 px width is in the `(max-width: 767px)` block, `blog.css:842-846`; an 844 px landscape phone and a 768 px iPad both miss it | the `(pointer: coarse)` block at `blog.css:558` covers only `.blog-related__all` — the comment there explains exactly this trap for the other control |
| `.audit-legal__link` | 130 × 39 / 75 × 39 | audit form footer | borderline; listed for completeness |

Measured on all five touch profiles. Everything else on screen — 44 px handles, 44 px pills,
48 px inputs, the 44 px audit trigger on mobile — clears the line, which is the 08-14 M4 fix
holding on the surfaces it was applied to.

**Direction.** Add the three selectors to the coarse-pointer block that already exists; move the
blog mark's width rule beside `.blog-related__all`. Trivial. **Local.** The larger point is in
§3: the rule has a checklist and no harness.

---

#### M17 · The case sheet's peek stop is a fraction of the screen, and the case's headline is not

**Evidence.** `height: 40dvh` at peek (`styles.css:478`), justified in the comment above it against
393 × 852: "peek is 341 px, which holds the header, the name, the meta line and both metric
tiles". Measured elsewhere:

| Viewport | Peek height | Body visible | What the peek shows |
|---|---|---|---|
| 393 × 852 | 341 | 228 | header, name, meta, tiles — as designed |
| 412 × 839 | 336 | 223 | same |
| 320 × 568 | 227 | 114 | the tiles cut in half |
| 844 × 390 (landscape) | 156 | **43** | handle, eyebrow, name; the meta line is clipped under the footer |

**Consequence.** On a short phone the "headline of the case" that the peek exists to show is
cut; in landscape the peek is a title bar. Not broken — the handle raises it — but the design
intent of the first stop does not survive the screens it was not measured on.

**Direction.** Give the peek a content floor (`max(40dvh, <header + tiles>)`, or size it from the
header's measured height), and under `(max-height: 500px)` either open at `expanded` or make the
peek honestly a header-only stop. Low. **Local.**

---

#### M18 · The blog's hover rules are unguarded, so a tap leaves the hover state behind

**Evidence.** Nine `:hover` rules in `blog.css` (`:152, :179, :200, :347, :457, :546, :634, :725,
:781`), none inside `@media (hover: hover)`. `styles.css` had the same defect on 2026-08-14 (M6)
and fixed it; the new stylesheet did not inherit the fix. Measured: after a `touchscreen.tap` on a
topic pill, `pill.matches(':hover')` is `true` on every touch profile.

**Consequence.** Mild — border and colour shifts (`.blog-card:hover .blog-card__title`,
`.blog-body a:hover`, `.blog-back:hover`) that read as a stuck selection on iOS, which holds
`:hover` until the next tap elsewhere.

**Direction.** Wrap them, as M6 did. Trivial. **Local.**

---

#### M19 · The satellite close-up fits the offset to the aspect but not the distance

**Evidence.** 08-14 M2 moved the *look-at offset* into `closeUpFraming.ts` as a fraction of the
half-width, and zeroed it below the breakpoint — measured working: the satellite is centred on
every phone profile. The *distance* is still `closeUp.distance: 1.05 * R`
(`interactionConfig.ts:63-72`), a constant whose own comment says it was retuned when the model
doubled "to hold the composition" — at 16:9. In portrait the horizontal half-FOV is 10.8° instead
of 36.4°, so the same subject fills three times the frame width: at 320 × 568 the satellite's
solar panels leave both edges; at 393 × 852 the brand hologram's wordmark is clipped at the right
edge; at 320 the hologram's top edge sits 19 px below the header chrome.

**Consequence.** The close-up is legible but crowded, and the hologram — the redesigned brand
panel the split-plate work was about — is the thing that gets cropped.

**Direction.** The same aspect term as M13: derive the close-up distance so the hologram's known
angular width fits the horizontal half-FOV with the margin the 16:9 composition has. This is a
composition judgement once the arithmetic is in place, and it belongs beside
`CLOSE_UP_OFFSET_FRACTION` in the module that already owns the other half. Moderate. **Local.**

---

#### M20 · Murcia's rest pose in portrait — M9, restated with the display in view

`cameraPortraitOverrides: null` (`murciaConfig.ts:119`), `resolveCameraPose` returns the landscape
pose at every aspect (`environmentConfig.ts:394-402`), and the reasons the 08-14 report gave for
not patching it still hold (the azimuth sweep, a judged composition). What this pass adds is that
the district is now a thing a visitor has to *find* in that cropped frame: at rest on 393 × 852 the
city shows roughly a third of its width, the services buildings are off to one side, and — per
`DECISIONS` §34's own "Left open" — nothing at rest marks where the services are, which on a touch
device with no hover means nothing at all. The district was reachable in every run only because
this audit entered it through the keyboard surface.

Product and architectural, not a coordinate to patch. Named again; not re-argued.

---

### P3 — Minor

**M21 · Dialogs stack under the header triggers.** `.modal-scrim` is `z-index: 62`
(`styles.css:1833`); `.audit-trigger` and `.contact-trigger` are `70` (`:732, :1783`). The
AUDITORÍA button is clickable above the contact and legal dialogs' scrim, and in 844 × 390
landscape it visibly overlaps the dialog's top-right corner. The contact trigger stands down
while the audit is open (`suppressed`); the reverse is not true.

**M22 · The Murcia controls hint stacks.** `#controls-hint` is a pill built for one row; at
≤ 430 px its three spans wrap to three rows (197 × 118 px at 393, 160 × 118 at 320; the third
span itself wraps at 393). It was `opacity: 0` in every mobile run by the time the city was at rest
— fading on the first interaction is by design, but whether the arriving pinch's own `pointerup`
should count as that interaction is worth a look: on touch the hint is the only place the
two-finger rotate is taught.

**M23 · `AuditCameraShift.panelWidth` still mirrors the desktop clamp only** (08-14 M11): at
844 × 390 the CSS curtain is 472 px (`clamp(420px, 56vw, 640px)`) against the JS's 480; at
768 × 1024 it is 430 against 480 — a 50 px framing error on iPad portrait, the one tablet
composition the shift is for.

**M24 · `viewport-fit=cover` is still absent** on both documents (`index.html:8`, `blog.html:22`)
while `styles.css` carries twelve `env(safe-area-inset-*)` declarations. iOS I10, unchanged;
listed only because the count grew. `-webkit-tap-highlight-color` is now set (`styles.css:42`),
closing that half of M11.

**M25 · The desktop dock has no scroll, and on a tablet it has no room.** At 768 × 1024 the case
panel is the right-hand dock (the sheet starts below 768 wide), 292 × 881 px with
`overflow-y: visible`; rotated to 1024 × 768 it is 760 px tall in a 768 px viewport — 4 px to
spare, and the body is not scrollable. The case that was measured is the shortest shape the
CMS allows; a longer description or a fifth bullet overflows the bottom of the screen with no way
to reach it. The `(max-height: 500px)` branch that catches landscape phones does not catch this.
Either extend that branch to the heights the dock cannot fit, or give the dock body the
`overflow-y: auto` the sheet body already has.

**M26 · Two seeds from `window.innerWidth/Height` remain** (`logoMotion.ts:82-83`) where
everything around them reads R3F's `size` — identical today, wrong by construction (08-14 M11),
and now the corner logo is a thing the district's VOLVER control has to avoid (M13).

---

### Verified not to be problems

Recorded so they are not rediscovered.

- **No horizontal overflow anywhere.** `scrollWidth === clientWidth` on the document and on
  `.blog-root` on every profile, every state, including rotated. The blog's own concern — a
  full-bleed figure one pixel too wide — did not reproduce.
- **The audit form is reachable on a 568 px phone.** The form is 1006 px tall and `.audit-panel`
  scrolls it (`styles.css:927-931`); a dispatched touch drag moved it 235 px and the CTA landed at
  y 380. The 08-14 report's scroll concern was about the sheet, not this.
- **Every input is 16 px** — audit, contact, blog search — and 48 px tall. M3 holds.
- **The DPR cap holds** on the 3× profiles: a 393 × 852 @3× viewport draws 786 × 1704.
- **Rotation re-lays out everything that should:** canvas buffer and CSS size swap, the camera
  aspect follows (`MurciaExperience.setViewport`), the case sheet keeps its stop, the blog
  reflows, and the audit section's breakpoint subscription (M8's fix) recomposes. The one thing
  that re-evaluates and should not is M14 — the opposite failure from M8.
- **The pinch navigates** in both directions on all five touch profiles, including 320 × 568 where
  the commit growth is 239 px, and the accessible control names its destination.
- **The gesture hint** appears after five seconds idle with the spread glyph on coarse pointers and
  the mouse glyph hidden, 40 × 40 at `bottom: 48px`, clear of the footer on 568 px.
- **The blog** reads at the artboard scale at 320, 393, 412 and 844 (title 29.6 px, body
  18 / 28.8 px), the cover bleeds edge to edge, the top bar is sticky at 56 px, scrolling is
  contained (`window.scrollY` stays 0), and the tap targets the uncommitted spec asserts all
  measure ≥ 44 px in portrait.
- **The chrome at 320 px** does not collide: the contact trigger ends at x 147, the audit trigger
  starts at 179; the corner mark and CONTACTO are 7 px apart, which is tight but not touching.

---

## 3. Mobile architecture assessment

| Responsibility | Owner today | Verdict |
|---|---|---|
| Responsive UI | `styles.css` (767 / 1024, plus `(max-height: 500px)` and `(pointer: coarse)`), `blog.css` (767 plus `(pointer: coarse)`), `murcia.css` (none needed now) | **Coherent, and applied unevenly.** The rules are right and they are written down; the surfaces added since 08-14 each missed one (M15, M16, M18). The 44 px rule in particular has a checklist in a CSS comment and no harness — `e2e/mobile.spec.ts` asserts it control by control, so a new control is untested by default. A generic sweep ("every visible control ≥ 44 px on a coarse pointer") would have caught all four of M16 and costs one test. |
| Responsive 3D framing | Earth: `closeUpFraming.ts` (offset only). Murcia: `cameraFraming.ts` (position only), `focusDistanceScale` (constant), `cameraPortraitOverrides: null` | **The aspect term is missing in three places** — the close-up distance, the district distance, the rest pose — and each is a constant tuned at 16:9. Two of the three produce visible defects on a phone today (M13, M19). One helper owns this: fit an angular subject into `min(hHalfFov, vHalfFov)`. Per `ENGINEERING_PRINCIPLES` §12 the two experiences keep their own camera modules, but the arithmetic is one function and both should call it. |
| Touch interaction | `createNavigationInput` + `pinchClassifier` (app), `DragPanController` + `DistrictInteraction` (Murcia), `createFocusCameraRig` (Earth) | **Good.** Pointer Events throughout, per-pointer tolerances everywhere now (M1 closed in both experiences), pinch verified live. The hole is that the display's hit test is a raycast against authored UV rectangles with no minimum on-screen size (M13); every other control in the project has one. |
| Input capability detection | `matchMedia` + `pointerType`, per feature; the layout-mode reads subscribed where the decision outlives the gesture | **Right pattern, holding.** No `userAgent` anywhere. |
| Asset tier | `EarthScene.earthTextureUrls()` (per render), `SkyShell.skyCandidates()` (once), `index.html` preload `media` (width) | **Three readers, no owner, one of them wrong** (M14). The decision "which weight of asset does this device get" is made by width, in three places that can disagree, and one of them re-decides on rotation. It should be one value, decided once at boot from the shorter side, that both loaders and the preload media agree on. |
| Adaptive rendering quality | Nobody | **Absent, as on 08-14** and as the perf report §6 proposes. The DPR cap is a constant; the brand atlases are viewport-independent (perf P1-E). M12 part two is what "no gate" looks like: a 200 MB texture reached the phone path because nothing between `public/` and `gl.texImage2D` asks how big a texture may be. |
| Asset delivery integrity | Nobody | **New gap, and the one that produced the P0.** URLs live in config, files live in `public/`, and no check joins them; the screenshot test that covers the viewport passes with the sky missing. `checks/city-asset.ts` does this for the GLB; the textures need the same, plus a load-status assertion in e2e. |
| Viewport changes | R3F `size` → `MurciaExperience.setViewport`, the composer, the sheet CSS | **Correct** (unchanged). |

`ARCHITECTURE.md` still contains no mention of mobile, responsive, viewport, touch or breakpoint
beyond the ADR index line; three mobile-specific decisions have shipped since 08-14 without that
changing.

---

## 4. Implementation plan

Ordered by the brief: functional blockers, interaction correctness, framing, layout, rendering
stability, polish.

1. **M12** — run `prepare-sky-panorama.mjs` on the source (asset, no code), then add the
   config-URL-exists-in-`public/` check with a dimension ceiling, chained into `check:harnesses`.
   Add a "no `[sky]` warning and both sky requests are `image/*`" assertion to
   `e2e/mobile.spec.ts`; the screenshot test is not the proof (see M12).
2. **M14** — decide the Earth set once, on the shorter side; align the preload `media`. Assert
   "no second trio after a rotation" in `e2e/mobile.spec.ts` with a request count.
3. **M13** — the fit-to-frame helper, applied to the district flight; a minimum on-screen size for
   the display's controls (or the coarse-pointer DOM fallback, which also answers M20's
   wayfinding half). Needs eyes on a device for the composition; the fit is arithmetic and can be
   unit-tested like `closeUpFraming` is.
4. **M19** — the same helper for the close-up distance. Ships with the desktop-parity test the
   offset already has.
5. **M15** — footer below the sheet or hidden while one is open. **M17** — peek floor and the
   landscape stop. **M16** — three selectors into the existing coarse block, one into the blog's.
   **M18** — wrap the nine hover rules. **M21** — scrim above the triggers.
6. **M22, M23, M25, M26** — polish, in the files the above already opens.
7. **Validation** — a generic control sweep in `e2e/mobile.spec.ts` (every visible control ≥ 44 px
   on `pointer: coarse`) replacing per-control assertions for chrome, plus the request-count and
   sky assertions above. Both mobile projects are still Chromium; the WebKit gap is the iOS
   report's device matrix and nothing here closes it.

Deferred with reasons: **M20 / M9** (architectural, needs the azimuth sweep and a judged
composition — unchanged since 08-14). **M24** goes with I10 in the iOS brief.

---

## 5. What remains unverified

- **The 430 × 932 profile** was driven through the scene only, not the blog; it reproduced the
  black sky, the M13 overflow (same 0.46 aspect as 393) and the M15 footer overlap.
- **Physical feel** of the pinch, the display's controls and the sheet stops on a real phone —
  every gesture here was dispatched in-page. **Thermal and frame-rate** behaviour on mobile
  hardware: every rendering-cost statement is a byte or texel count.
- **Browser chrome appearing and disappearing**, and therefore `dvh` in motion; the emulator's
  viewport is fixed.
- **WebKit, at all.** The iOS report's device matrix is what closes this, and M12's two halves
  (a 404'd texture and a 10000 px upload) are exactly the kind of thing that will differ there.
- **The trim-sheet look of the city** in every Murcia capture (red-edged roofs, striped trees) is
  the current art state, not a mobile defect; identical on the desktop control.

---

## 6. Revalidation of the 2026-08-14 findings

| 08-14 | Status on 2026-09-02 |
|---|---|
| **M1** — district tap discarded as a drag | **Holds.** Per-pointer tolerance in both `DragPanController` and the new `DistrictInteraction` (`tapThresholdPx.touch`, `MurciaExperience.ts:567`). Taps not driven live on the display (its controls were reached through the a11y surface), so the tolerance is verified by the harness, not by touch. |
| **M2** — satellite off-screen, 142 px column | **Holds for the offset; the distance was never covered** → M19. Sheet verified on five profiles. |
| **M3** — form fields zoom | **Holds.** 16 px on every input, including the two forms added since. |
| **M4** — six controls under 44 px | **Holds on the six; regressed on the new chrome** → M16. |
| **M5** — hint teaches mouse gestures | **Holds** (`overlays.ts:83-89`). The pill wraps at phone widths → M22. |
| **M6** — hover states stick | **Holds in `styles.css`; regressed in `blog.css`** → M18. |
| **M7** — caption clips | **Holds**, asserted in `e2e/mobile.spec.ts`. |
| **M8** — layout reads not re-evaluated | **Holds.** The opposite failure appeared instead → M14. |
| **M9** — rest pose tuned wide | **Open** → M20. |
| **M10** — six markers invisible on touch | **Superseded.** Satellites now rest on a visible isotype (`DECISIONS` §26, 2026-08-25); the markers are on screen at rest on every profile. |
| **M11** — tap highlight, `panelWidth`, `innerWidth` seeds, label clamping | **Split.** Tap highlight fixed (`styles.css:42`); `panelWidth` open → M23; `innerWidth` seeds open → M26; the district label no longer exists (§34). |
