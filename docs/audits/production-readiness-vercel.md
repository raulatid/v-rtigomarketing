# Production Readiness Audit — Vercel

Audited: 2026-08-07 · against working tree at commit `2758ada` + uncommitted changes
Scope: `docs/plans/000-audit-vercel-deploy.md`

> **A re-audit exists: `production-readiness-vercel-2026-08-11.md`.** This file is left as the
> record of the 2026-08-07 pass and is still accurate for everything the re-audit does not
> restate — the deployment surface it describes (`vercel.json`, `vite.config.ts`, the lockfile,
> `public/`) is byte-identical at the time of the re-audit. Read this one for the architecture
> and the original findings; read the re-audit for what has changed, what was verified for the
> first time, and the current blocker list. Where the two disagree, the re-audit wins.

---

## Executive Summary

**Status: `READY WITH NON-BLOCKING FINDINGS` — technically. `NOT READY` to publish.**

Those are two different questions and this audit answers both, because the answers differ.

**The deployment path is sound.** A clean-room install from the lockfile and a production
build both succeed, reproducibly, with byte-identical chunk hashes. Type checking passes,
all four behavioural harnesses pass, the bundle-size budgets pass with headroom, and a real
browser driving the real production build passes a 10-point smoke test including every
failure path fixed in this pass. There are **no secrets, no external origins, no dangerous
HTML sinks, no case-sensitivity hazards, and zero vulnerabilities in production
dependencies**. Vercel needs no environment variables and no configuration beyond the
`vercel.json` already committed.

**Seven P0 defects were found and fixed** (§Findings). The most serious was not a
deployment issue at all: **a 404 on a single 20 KB file trapped every visitor on the loading
screen forever**, with no error, indefinitely. Two more required boot steps could do the same,
a missing WebGL context produced a silent black screen, and the public origin shipped a
tuning console plus a console dump of internal scene geometry on every page load.

**What makes it not ready to publish is content, not engineering.** The page markets
*"Casos reales, métricas reales"* while every case study, district and metric in the source
is explicitly flagged `PLACEHOLDER — NOT REAL CLIENTS, NOT REAL RESULTS`. The lead-capture
form collects name, email, company and phone, and discards them. And roughly half the site —
the Murcia experience and all case-study content — cannot be reached without a mouse.

Deploy it to Preview today. Do not point a public domain at it until CONTENT-1, LEAD-1 and
A11Y-1 are answered. Those are decisions for you, not defects for me; they are documented
below with evidence and a recommended action, and deliberately left unimplemented per the
agreed scope.

---

## Deployment Architecture

Discovered from the repository, not assumed.

| | |
|---|---|
| **Type** | Fully static SPA. No server, no API routes, no functions, no SSR, no database. |
| **Framework** | Vite 5 + React 19 + `@react-three/fiber` 9.6 + three 0.174 |
| **Package manager** | npm, `package-lock.json` v3 committed. Exactly one lockfile. |
| **Node** | Pinned to `22.x` in `engines` and `.nvmrc` (was `>=20`, unpinned — see P0-6) |
| **Install** | `npm ci` (Vercel default from the lockfile) |
| **Build** | `npm run build` → `tsc -b` + `scripts/simulate-intro.mjs` + `vite build` |
| **Output** | `dist/` — 6.1 MB total: ~1.4 MB JS/CSS, 4.7 MB static assets copied from `public/` |
| **Routing** | **No router.** One real URL (`/`) plus `/debug`, matched by `window.location.pathname`. No history API, no hash routing. A catch-all SPA rewrite is **not** required and would be wrong. |
| **Env vars** | **None required.** No `.env` files exist; nothing reads `import.meta.env` at runtime. |
| **External services** | **None.** The page contacts exactly one origin: its own. |
| **CI** | None. `npm run check` is manual-only (see CI-1). |
| **Production branch** | **Undetermined — there is no git remote and only a `development` branch.** |

**Notable build invariants**, both enforced in `vite.config.ts` and worth preserving:

1. The intro drawing (`src/intro-draw/boot.ts`) is a separate Rollup entry that **must import
   nothing**. The build fails if that stops being true. It is what puts something on screen
   before 1.2 MB of three.js evaluates.
2. Two hard size budgets: intro ≤ 16,000 B (now 13,325 B) and app entry ≤ 320,000 B (now
   296,464 B). These `error` the build; they do not warn.

**`VERTIGO_SKIP_BUDGETS` must never be set in Vercel's environment.** It disables both
budgets *and* the intro-standalone assertion.

---

## Vercel Configuration

Everything below is either already committed or a project-settings action for you.

### Project settings

| Setting | Value | Source |
|---|---|---|
| Framework Preset | **Vite** | auto-detected; matches `npm run build` → `dist` |
| Root Directory | `.` | the repo root is the project root |
| Build Command | *(default)* | `npm run build` |
| Output Directory | *(default)* | `dist` |
| Install Command | *(default)* | `npm ci` |
| Node.js Version | **22.x** | `engines` + `.nvmrc` |
| **System Environment Variables** | **must be ENABLED** | see below |

Enabling system environment variables is **required**, not optional. `vite.config.ts` reads
`VERCEL_ENV` and `VERCEL_PROJECT_PRODUCTION_URL` at build time to decide the debug gate, the
canonical URL and the robots policy. Without them every build behaves as `development`:
the debug console would ship and `robots.txt` would say `Disallow: /` on production.

Verified against current Vercel documentation (2026-07-15 revision): `VERCEL_ENV` is
available at build time with values `production | preview | development`;
`VERCEL_PROJECT_PRODUCTION_URL` is set on *every* deployment including previews and always
names the production domain — which is exactly the semantics a canonical link needs.

### `vercel.json` (committed)

- **Rewrite** `/debug` → `/index.html`. The only deep URL that exists. In a production build
  the panel is compiled out, so the route renders the ordinary site.
- **Cache headers.** `/assets/*` immutable for a year (content-hashed filenames, safe);
  `/(earth|models|textures|libs|draco)/*` one day with a week of `stale-while-revalidate`.
  The dead `icons` group was removed — no such directory exists.
- **Security headers** on `/(.*)`: `nosniff`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy`, and a CSP in **Report-Only**.
- **`.wasm` Content-Type**, retained as belt-and-braces for the Draco and Basis decoders.

**HSTS is deliberately not set.** Vercel's own documentation does not describe HSTS as a
`vercel.json` concern, and it manages TLS policy on its domains. Adding an unverified header
here risks conflicting with platform behaviour — the audit brief's instruction was to verify
rather than assume, and the answer to verification was "not documented", so it stays out.

---

## Findings

Resolution status is honest: `FIXED` means fixed and verified in this pass.

### P0 — deployment blockers (all FIXED)

---

**P0-1 · Correctness · The site could hang on the loading screen forever**

*Affected:* `src/corner-logo/createCornerLogo.ts`, `src/components/EarthScene.tsx`,
`src/components/OrbitSystemLayer.tsx`, `src/components/CornerLogoLayer.tsx`,
`src/components/MurciaLayer.tsx`, `src/intro-draw/boot.ts`, `src/intro-draw/drawConfig.ts`

*Evidence:* Readiness is `REQUIRED.every(fraction >= 1)` and `fatal` is reached only by an
explicit `markFatal`. Three of the five **required** boot resources could do neither:

- `logo:assets` — the GLB error branch called `onFailed()`, which only ran `console.warn`
  (`App.tsx:45-49`). Neither done nor fatal.
- `gpu:warmup` — `gl.initTexture()` sat outside the `try`, and `warmUp()` was invoked with
  neither `await` nor `.catch`.
- `orbits:build` — a bare `markDone` after a synchronous build that rasterises a 2048×1536
  atlas and can throw.

*Impact:* **Total, for every visitor, on a single failed request.** The symptom is
indistinguishable from a slow connection: the outline holds at the pre-ready limit, the dot
pulses, and the caption sits on *Esto está tardando más de lo habitual* forever. The correct
message — *No se pudo cargar la experiencia* — existed but was unreachable from all three.
`/models/model.glb` is 20 KB and purely decorative.

*Action taken:* A failure path per step, chosen per step: `logo:assets` and `gpu:warmup`
**degrade** (the site is fine without a 3D corner mark or a warm GPU); `orbits:build` is
**fatal** (the orbits carry the case studies). Both uncaught dynamic imports now catch. Plus
a 45s hard deadline that marks fatal and names the stuck resource — because these three were
the instances, and the *class* is "a required step that forgets to report". Recorded as
**ADR 007**, which narrowly amends the existing "a timeout is not a readiness signal" rule:
a timeout still may not report *ready*; it may now report *fatal*.

*Verified:* blocking `/models/model.glb` in a real browser now reaches `readiness=ready`;
blocking `/earth/*` reaches the Spanish failure caption.

---

**P0-2 · Reliability · No WebGL and no error boundary meant a silent black screen**

*Affected:* new `src/components/SceneErrorBoundary.tsx`, new `src/graphics/webglSupport.ts`,
`src/components/LazyScene.tsx`

*Evidence:* No error boundary existed anywhere in the app (`main.tsx` renders `<App/>` bare),
no `webglcontextlost` handling, no try/catch around R3F renderer creation. Any throw below
`<Canvas>` unmounts the React tree, leaving `index.html`'s inline `background: #050507`.

*Impact:* A visitor on a device without WebGL 2, or after a GPU driver reset, sees a black
page with no message and no indication anything went wrong.

*Action taken:* A WebGL 2 probe before the scene chunk is even downloaded, plus one error
boundary wrapping everything that touches three.js. Neither renders a fallback UI: they mark
the boot fatal, which surfaces the existing Spanish caption. That already worked by accident
— the intro drawing is not React-owned, so it survives the unmount — and is now the designed
path rather than a happy coincidence.

*Verified:* with `getContext('webgl*')` forced to return null, the page shows
*No se pudo cargar la experiencia*.

---

**P0-3 · Exposure · The public origin shipped a debug console and a geometry dump**

*Affected:* new `src/app/buildFlags.ts`, `vite.config.ts`, `src/App.tsx`,
`src/experiences/murcia/config/appConfig.ts`, `.../environmentQueryOverrides.ts`,
`src/experiences/murcia/MurciaExperience.ts`, `src/components/MurciaLayer.tsx`

*Evidence:* `vercel.json` rewrites `/debug` to a 210-line GSAP tuning panel with ~40 sliders.
`?stats=1`, `?debug=1`, `?debugNavigation=1`, `?grid=1`, `?dragGain=`, `?yawDeg=`, `?smooth=`,
`?release=`, `?inertia=` and `?model=` all worked for any visitor. Separately, 26
unconditional `console.info` / `groupCollapsed` / `table` calls in `MurciaExperience` printed
a mesh/material table, the model bounding box and eight lines of bounds rectangles into the
console on **every page load**.

*Impact:* Presentational rather than a vulnerability — none of it can execute foreign code,
and `?model=` is correctly constrained to same-origin paths. But an unlisted tuning console
and a geometry dump are not what a marketing site should hand a visitor who opens devtools,
and `?dragGain=99999` in a shared link makes the city unnavigable.

*Action taken:* One build-time flag, `DEBUG_TOOLS_ENABLED`, false only in production. It
gates `/debug`, every query override, and all diagnostic logging. `console.error` and
`console.warn` are untouched — real failures still report everywhere. The flag is threaded as
a **parameter** into `src/experiences/**` rather than read there, because those modules are
bundled for Node by `checks/` where `import.meta.env` does not exist, and because
`src/experiences` may not import upward from `src/app`.

*Side benefit:* the panel is now dead code in production and the minifier drops it — the app
entry chunk fell from 300,797 B to **296,464 B**, taking budget headroom from 6% to 7.4%.

*Verified:* `/debug` on a production build returns 200 and renders no panel; the console is
clean on load.

*Residual:* the query-parameter *names* remain as strings in the Murcia chunk (~1 KB). The
parameters are inert; the code is retained because the flag is a runtime field there.

---

**P0-4 · Security · No security headers at all** — *Affected:* `vercel.json`

*Evidence:* the file set only `Cache-Control` and a `.wasm` `Content-Type`.

*Action taken:* `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a `Permissions-Policy` denying
camera/microphone/geolocation/payment/USB, and a CSP **derived from what the app actually
does** — every clause is load-bearing:

| Clause | Why it is required |
|---|---|
| `script-src 'wasm-unsafe-eval'` | Draco and Basis instantiate WebAssembly at runtime |
| `script-src blob:` + `worker-src 'self' blob:` | three creates decoder workers from `URL.createObjectURL` (`DRACOLoader.js:309,323`; `KTX2Loader.js:209,214`) |
| `style-src 'unsafe-inline'` | the inline `<style>` in `index.html` and the one `introDraw.ts` injects at runtime |
| `img-src data:` | the favicon is an inline SVG data URI |
| `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` | nothing embeds this, nothing needs plugins |

**Shipped as `Content-Security-Policy-Report-Only` on purpose.** A wrong CSP here breaks
WebGL *silently*. Promote it to the enforcing header only after a Preview deployment confirms
the city, corner logo and satellites all decode with no violations reported — the exact step
is in the runbook below.

---

**P0-5 · SEO · No robots.txt, no sitemap, no canonical, and a broken social card**

*Affected:* `vite.config.ts` (new `seoAssets` plugin), `index.html`

*Evidence:* neither file existed. No `<link rel="canonical">`. `twitter:card` was
`summary_large_image` with **no `og:image`**, so every share rendered a blank card.

*Action taken:* `robots.txt` and `sitemap.xml` are **generated at build time** from
`VERCEL_ENV` — production allows and points at the sitemap; **preview serves `Disallow: /`
and a `<meta name="robots" content="noindex, nofollow">`**. A static file cannot vary by
environment, which is why this is a plugin. Canonical and `og:url` come from
`VERCEL_PROJECT_PRODUCTION_URL`, so a preview points at production rather than itself, and
attaching a custom domain later needs no code change. `twitter:card` downgraded to `summary`
with `twitter:title`/`description`, `og:site_name` and `og:locale` added.

*Verified:* production build → `Allow: /` + sitemap + canonical, no noindex. Preview build →
`Disallow: /` + noindex, no sitemap.

---

**P0-6 · Reproducibility · Unpinned Node and gitignore gaps before the first push**

*Affected:* `package.json`, new `.nvmrc`, `.gitignore`

*Evidence:* `engines: ">=20"` with no `.nvmrc` — Vercel resolves an open range to its current
default, so a platform-side bump silently changes your build. `.gitignore` covered `.env`,
`.env.local` and `.env.*.local` but **not `.env.production` or `.env.development`**, and did
not cover the untracked `.codegraph/` directory that `git add -A` would sweep into the first
commit.

*Action taken:* pinned `22.x` in both places. `.gitignore` now ignores `.env.*` with an
explicit `!.env.example` exception, plus `.vercel/` and `.codegraph/`.

---

**P0-7 · Correctness · Murcia's input listeners were never gated on `active`**

*Affected:* `src/experiences/murcia/MurciaExperience.ts`,
`src/experiences/murcia/interaction/DistrictInteraction.ts`

*Evidence:* both the click probe and the district `pointerdown`/`move`/`up` listeners attach
to the **shared** canvas and never checked `this.active`. Per-frame work was correctly gated
everywhere; input was not.

*Impact:* every click on the Earth globe raycast the hidden city, and a district hit would
**fly Murcia's camera** while Earth was on screen — so the next warp arrived at a city that
had moved. `DragPanController` already solved this via `beginExternalControl()`; the district
and click paths never got the same treatment.

*Action taken:* `DistrictInteraction.setEnabled()`, driven from `setActive()`, plus an
`active` check on the click probe. New districts are **seeded** with the current active state
because they are constructed during the Earth intro, when `setActive` will not fire again.

---

### P1 — fix before public launch (NOT implemented, per agreed scope)

---

**CONTENT-1 · Truthfulness · The site advertises real results it does not have**

`index.html:12` says *"Casos reales, métricas reales"*. `src/data/caseStudies.ts:3` says
`⚠️ PLACEHOLDER DATA — NOT REAL CLIENTS, NOT REAL RESULTS`. Also placeholder: district copy
(`content/districts.ts:45`), orbit metrics (`orbitConfig.ts:162`), case-study logos
(`orbitUtils.ts:53`), and the return-to-Earth control.

**Recommendation: do not attach a public domain until the copy and the data agree.** Either
ship real case studies or reword the claim. This is the single item most likely to cause
real-world harm, and it is not a code change.

---

**LEAD-1 · Data / Legal · Every lead is silently discarded**

`AuditSection.tsx:149-165` — a valid submission validates, then calls `close()`. Name, email,
company URL and phone are collected and dropped. `TODO(integration)` at `:57` notes that
wiring an endpoint requires a privacy notice first (GDPR / LOPDGDD).

To its credit the form deliberately does **not** log the payload; a previous version did, and
the comment at `:50-55` records removing it. So there is no PII leak — the data simply
evaporates.

**Recommendation:** until an endpoint and a consent notice exist, either disable the form or
replace it with a `mailto:`. A form that appears to work and does nothing is worse than no
form.

---

**A11Y-1 · Accessibility · Murcia and all case studies are keyboard-unreachable**

Both entry points depend on a raycast `hoveredId`/`hoveredMarker` that only `pointermove`
can set (`createSatelliteFocus.ts:120-123`, `createGeoMarkers.ts:147-157`). The geo tag layer
is `pointer-events: none` with no `role` and no `tabindex`. There is no keyboard path into
the Murcia experience at all.

The pattern to copy already exists in this repo: `districtLabel.ts:9-10` — *"A WebGL raycast
cannot be tabbed to or activated by Enter, so accessibility cannot depend on picking"* — and
solves it with a real focusable `<button>` positioned over the 3D element.

**Recommendation:** apply that same treatment to the globe markers and the satellites. It is
real work, which is why it was scoped out, but roughly half the site is currently mouse-only.

> **Status 2026-08-11 — PARTIALLY RESOLVED. Still open for keyboard.**
>
> This finding turned out to describe two defects sharing one cause, and the larger of the
> two was not accessibility — it was that **touch devices could not use the site at all**.
> The same `hoveredId`/`hoveredMarker` read that blocks keyboard also blocks every phone and
> tablet, because a tap fires `pointerdown → pointerup → click` with no `pointermove`, so the
> hover it needs is never computed. Measured on the code as audited: 460 emulated taps across
> the globe, zero response.
>
> **Fixed:** both call sites now raycast from the event's own coordinates
> (`DECISIONS.md` §17), tap tolerances are per pointer type, and the Murcia tag is visible and
> activatable under `(hover: none)`. Verified against a pre-fix control and on an emulated
> Pixel, against dev and the production build.
>
> **Not fixed:** the keyboard path, which is what this finding is titled for. The geo tags are
> still divs with no `role` and no `tabindex`, and the satellites have no DOM affordance at
> all. The `districtLabel.ts` recommendation above stands unchanged — it needs real markup,
> so it remains a launch item.
>
> The audit's own summary line ("roughly half the site is currently mouse-only") should now
> read *keyboard-only-unreachable*; the mouse-only half is closed.

---

**SEO-1 · Discoverability · There is no crawlable content**

`dist/index.html`'s `<body>` is one empty `<div id="root">`. No `<noscript>`, no `<h1>`
anywhere in the project, no `<main>`/`<nav>`/`<header>`. All real copy requires WebGL boot,
the intro timeline, *and* a 3D click. A crawler sees the title and description and nothing
else.

**Recommendation:** a `<noscript>` block plus a visually-hidden `<h1>` and a paragraph of the
real value proposition costs almost nothing and changes the page from "no content" to "some
content". Pre-rendering is the larger answer, deliberately out of scope.

---

### P2 — safe to fix after launch

| ID | Finding | Evidence |
|---|---|---|
| **BUDGET-1** | App entry at 296,464 / 320,000 B — **7.4% headroom**. The next feature *fails the build*. Improved from 6% by P0-3. | `vite.config.ts` |
| **ASSET-1** | `specularClouds.jpg` is 1.69 MB, 36% of all assets, with no KTX2 variant — while the logo and satellite bakes are KTX2. | `public/earth/` |
| **ASSET-2** | `draco_decoder.js` (512 KB) is a JS fallback the WASM path makes unreachable on any browser that can run this site. Deployed, never fetched. | `public/draco/` |
| **CI-1** | No CI. Vercel runs `tsc -b` only; the four harnesses (25 + 52 + 32 assertions + the intro sim) never run automatically. | no `.github/` |
| **CSS-1** | `'Inter'` is the first font in `styles.css:16` and `introDraw.ts:71`, but there is no `@font-face` and no font link — it silently never loads and the site renders in `system-ui`. | — |
| **DEP-1** | 8 dev-dependency vulnerabilities (1 high: `vite` path traversal; moderate: `esbuild`, `potrace`→`jimp`). **0 in production dependencies.** Dev-server-only exposure. | `npm audit` |
| **GIT-1** | `docs/murcia/PROJECT_MEMORY.md` is tracked in git but deleted on disk. The deletion is unstaged. | `git ls-files` vs disk |
| **SEO-2** | No `og:image`, no `apple-touch-icon`, no web manifest, no JSON-LD. Favicon is a self-described placeholder. | `index.html` |
| **A11Y-2** | `CaseChart` is `aria-hidden` and carries the case studies' performance numbers with no text equivalent. Geo tag content is hover-only. | `CaseChart.tsx:45,66,110` |

---

## Environment Variables

**The application requires none.** No `.env` file exists, nothing reads `import.meta.env` at
runtime, and there are no API keys, tokens or secrets anywhere in `src/`, `public/` or the
config. No values are exposed in this document because there are none to expose.

Two **build-time** variables are consumed, both supplied by Vercel itself:

| Name | Environments | Purpose | If missing |
|---|---|---|---|
| `VERCEL_ENV` | Production, Preview | Selects the debug gate and the robots policy | Build behaves as `development`: **debug console ships, production is `Disallow: /`** |
| `VERCEL_PROJECT_PRODUCTION_URL` | Production, Preview | Canonical URL, `og:url`, sitemap | Falls back to `vertigo-marketing-web.vercel.app` |

**Action required:** enable *Settings → Environment Variables → Enable access to System
Environment Variables*. Nothing else to set.

**Never set:** `VERTIGO_SKIP_BUDGETS` — it disables the chunk budgets and the
intro-standalone assertion.

---

## Verification Results

Everything below was executed. Nothing is inferred.

| Check | Result |
|---|---|
| Clean-room `npm ci` from lockfile | **PASS** — fresh copy of tracked+new files in a temp dir |
| Clean-room `npm run build` | **PASS** — byte-identical chunk hashes to the local build |
| `npm run typecheck` | **PASS** |
| `npm run test:intro` | **PASS** — all playhead cases |
| `npm run check:navigation` | **PASS** — 25/25 |
| `npm run check:district` | **PASS** — 52/52 |
| `npm run check:warp` | **PASS** — 32/32, incl. a 19,296-pose ground-footprint sweep |
| Lint | **N/A** — no linter configured, deliberately (`npm run check` is the gate) |
| Chunk budgets | **PASS** — intro 13,325/16,000 · app entry 296,464/320,000 |
| `npm audit --omit=dev` | **PASS** — 0 vulnerabilities in production dependencies |
| Asset references vs disk | **PASS** — all 12 root-absolute paths match byte-for-byte; no case hazard |
| robots/canonical, production build | **PASS** — `Allow: /`, sitemap, canonical, no noindex |
| robots/canonical, preview build | **PASS** — `Disallow: /`, noindex meta, no sitemap |

### Browser smoke test — 10/10 PASS

Chromium 1234 via Playwright, driving `vite preview` against the **real production `dist/`**.
(The Claude Chrome extension is not connected and no `chrome` channel is installed; Chromium
was driven directly.)

| Check | Result |
|---|---|
| Boot reaches `ready` | PASS |
| Exactly one WebGL canvas | PASS — 1 |
| No required resource left pending | PASS — all 7 manifest steps completed |
| No console errors on the happy path | PASS — clean |
| Murcia prefetch completes during the intro | PASS |
| **Blocked `/models/model.glb` degrades to ready** | PASS — *was a permanent hang* |
| **Blocked `/earth/*` shows the failure caption** | PASS |
| **No WebGL shows the failure caption** | PASS — *was a black screen* |
| `/debug` serves the app | PASS — 200 |
| **`/debug` panel is inert in production** | PASS — not in the DOM |

Screenshot confirms the rendered site: Earth, orbit rings, satellites and corner logo.

### Not verified

- **Safari/WebKit, Firefox, and real mobile devices.** Only Chromium is installed on this
  machine. The matrix in the runbook below must be run on a Preview deployment.
- **The CSP under a real Vercel deployment.** `vite preview` does not apply `vercel.json`
  headers, so Report-Only violations have not been observed yet. This is the first thing to
  check on Preview.
- **Preview and Production deployments.** No git remote exists; nothing has been deployed.
- **The 45s hard deadline firing.** Reasoned and code-reviewed, but no test drives a step
  that never resolves.

---

## Deferred Improvements

Valid, deliberately excluded, with the reason:

- **Keyboard paths for the globe markers and satellites** (A11Y-1) — real feature work,
  scoped out; the pattern to copy is in `districtLabel.ts`.
- **Pre-rendering or a `<noscript>` fallback** (SEO-1) — changes the content architecture.
- **KTX2 for the Earth maps** (ASSET-1) — the brief says not to recompress assets absent a
  production blocker. It would cut ~1.2 MB.
- **Dropping `draco_decoder.js`** (ASSET-2) — 512 KB of deploy for a fallback that will never
  be fetched, but removing it is a behaviour change on ancient browsers.
- **A GitHub Action running `npm run check`** (CI-1) — highest-value single addition, but it
  needs the remote to exist first.
- **Loading Inter, or removing it from the font stack** (CSS-1) — a design decision.
- **`og:image` and a real favicon** (SEO-2) — needs design assets.
- **Dev-dependency upgrades** (DEP-1) — a `vite` major touches the build; not during a
  deployment pass.

---

## Rollback Procedure

Vercel keeps every deployment immutable and addressable, so rollback is a promotion, not a
rebuild.

**To roll back:**

1. Vercel Dashboard → the project → **Deployments**.
2. Find the last deployment that was healthy — the list shows commit SHA, branch and time.
3. **⋯ → Promote to Production** (or **Instant Rollback**). The production domain repoints
   in seconds; the deployment is not rebuilt.
4. Confirm: load the production URL, check `window.__vertigoBootDebug.state()` returns
   `'ready'`, and confirm the console is clean.

**What you need to know about this project specifically:**

- **The production domain follows the promotion immediately.** No DNS change, no propagation.
- **No environment variables to roll back** — the app requires none. But note that changing
  the *System Environment Variables* toggle affects **new builds only**; a promoted old
  deployment keeps the values it was built with.
- **No database, no external API, no schema.** There is no state to be backward-compatible
  with. This is the main reason rollback here is trivially safe.
- **Assets are content-hashed and immutable**, so a rolled-back deployment serves its own
  `/assets/*` correctly. Files under `public/` are shared by path — if you ever delete or
  rename one, an older deployment can 404 on it. Today every such failure degrades
  gracefully or shows the failure caption (P0-1), rather than hanging.
- **`git revert` then push** is the durable fix once the incident is over; the promotion is
  the stop-the-bleeding step.

---

## Preview → Production Release Workflow

Git is the source of truth. Nothing is ever uploaded from a local `dist/`.

```
feature branch  →  push  →  Preview Deployment  →  npm run check + smoke test
                                                        ↓
                              merge to production branch  →  Production Deployment
                                                        ↓
                                              post-deploy verification
```

### First-time setup (yours to run — I created no remote and pushed nothing)

1. **Commit the working tree.** It currently holds 55 changed files across three unrelated
   pieces of work: this audit, the warp ascent (ADR 006), and an in-flight cursor feature
   across `App.tsx`, `SceneCanvas.tsx`, `cursorManager.ts`, `GeoMarkersLayer.tsx`,
   `createGeoMarkers.ts`, `DragPanController.ts`, `DistrictInteraction.ts`. **Review the
   cursor work before committing — it is not mine and I have not audited it.** Also stage the
   `docs/murcia/PROJECT_MEMORY.md` deletion (GIT-1).
2. **Decide the production branch.** There is only `development`. Vercel will treat the
   repo's default branch as production; if you push `development` as the default, that
   becomes production. Recommended: create `main` as the default/production branch and keep
   `development` for previews.
3. `gh repo create` (private), `git remote add origin`, `git push -u origin main`.
4. Vercel → **Add New → Project** → import the repo. The Vite preset is correct as detected.
5. **Enable system environment variables** (Settings → Environment Variables). Required.
6. Push a branch to get a Preview deployment.

### On every Preview, before promoting

- `npm run check` locally — Vercel does **not** run the harnesses (CI-1).
- **Open devtools and look for CSP violations.** Report-Only will name anything the policy
  would have blocked. The Draco and Basis workers are the ones at risk.
- Walk the flow: intro → Earth → click a satellite → open the audit panel → click the Murcia
  marker → drive the city → return to Earth.
- Verify `/debug` renders the tuning panel on Preview (it should) and confirm
  `curl <preview-url>/robots.txt` returns `Disallow: /`.
- Run the browser matrix here — Safari, Firefox, a real phone. This is the step that cannot
  be done locally.

### Promoting the CSP

Once a Preview reports zero violations, rename `Content-Security-Policy-Report-Only` to
`Content-Security-Policy` in `vercel.json`, deploy to Preview once more, confirm the site
still renders, then promote. Do not do this directly on production.

---

## Final Production Checklist

| | Item | Status |
|---|---|---|
| ☑ | Clean install succeeds | `npm ci` from lockfile, clean room |
| ☑ | Production build succeeds | reproducible, identical hashes |
| ☑ | Type checking succeeds | `tsc --noEmit` clean |
| ☐ | Linting succeeds | **N/A** — no linter, deliberately |
| ☑ | Automated tests succeed | 109 assertions + intro sim, all pass |
| ☑ | Required environment variables identified | none for the app; two Vercel system vars |
| ☑ | No secrets committed or client-exposed | none found anywhere |
| ☑ | Routing / direct URLs verified | `/` and `/debug`; no router, no catch-all needed |
| ☑ | Critical assets verified | all 12 references match disk; no case hazard |
| ☑ | Critical Three.js / WebGL flows verified | smoke test renders Earth, orbits, logo |
| ☑ | Production error paths reviewed | all seven fixed and browser-verified |
| ☑ | Security review completed | headers added; CSP in Report-Only pending Preview |
| ☑ | Basic performance review completed | budgets pass; ASSET-1/2 deferred |
| ☑ | Basic SEO review completed | robots/sitemap/canonical done; SEO-1 open |
| ☑ | Basic accessibility review completed | **A11Y-1 open and significant** |
| ☐ | **Preview deployment verified** | **blocked — no git remote exists** |
| ☑ | Production Vercel configuration verified | `vercel.json` + settings documented |
| ☑ | Domain assumptions verified | canonical from `VERCEL_PROJECT_PRODUCTION_URL` |
| ☑ | Analytics / diagnostics verified | see below |
| ☑ | Rollback procedure documented | above |
| ☐ | **Final production smoke test passed** | **blocked — nothing deployed yet** |

### Remaining blockers

1. **No git remote.** Nothing can deploy. Yours to create.
2. **Preview deployment and the browser matrix** — Safari, Firefox and mobile are unverified.
3. **CONTENT-1, LEAD-1, A11Y-1** — not deployment blockers, but launch blockers. Placeholder
   data presented as real results, a lead form that discards leads, and half the site
   unreachable without a mouse.

### Note on diagnostics

There is no analytics and no error-reporting service, which is consistent with the site's
zero-external-origin posture and its lack of a cookie banner. What exists instead:
`window.__vertigoBootDebug` ships in production deliberately and answers "which resource is
pending" from the console, and Vercel's build and function logs cover deployment failures.
After P0-1 and P0-2, a client-side failure now always produces a visible Spanish caption
rather than a silent hang, which was the real gap. Adding Vercel Web Analytics is a
one-package change if you later want traffic data; a third-party error tracker was not added
because nothing justified the first external origin.
