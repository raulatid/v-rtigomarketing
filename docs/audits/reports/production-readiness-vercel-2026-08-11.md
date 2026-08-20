# Production Readiness Re-Audit — Vercel

Audited: 2026-08-11 · against the working tree at commit `b418b5f` + uncommitted changes
Scope: `docs/plans/000-audit-vercel-deploy.md`, re-run
Supersedes nothing — this is a **delta** against `production-readiness-vercel-2026-08-07.md` (2026-08-07),
which remains the record of that pass and is still accurate for everything not restated here.

> **A further re-audit exists: `production-readiness-vercel-2026-08-20.md`.** It covers the
> build-time content pipeline (ADR 010), the `check` gate on the deploy path (closes VER-1
> below), and the first push to GitHub. Where the two disagree, the newer one wins.

> **This audit was taken of a moving tree.** A second agent landed eight commits of
> galaxy/nebula work during the session and was still writing files ten minutes before this
> began. Findings about `src/space/**` and `NebulaShell` are therefore marked **provisional**
> and should be re-checked when that work settles. Everything else was verified against a
> source fingerprint that was confirmed unchanged across the test.

---

## Executive Summary

**Status: `READY WITH NON-BLOCKING FINDINGS` — technically. `NOT READY` to publish.**

Unchanged in shape from 2026-08-07, and for the same reason: the deployment path is sound and
the content is not.

**The deployment surface has barely moved.** `vercel.json`, `vite.config.ts`, `tsconfig.json`,
`index.html`, `scripts/`, the lockfile and `public/` are byte-identical to the audited commit.
The only change is `package.json` gaining a `check:space` script. So the prior audit's
conclusions about install, configuration, headers and caching carry forward intact, and this
pass concentrated on what actually changed: ~7 000 lines of source, and two behavioural
changes with production consequences.

**Newly verified this pass, and not verified before:**

- **The production SEO branch actually works.** No one had ever executed it — every previous
  build ran the development path. Built with `VERCEL_ENV=production` it emits a correct
  `robots.txt` (`Allow: /`, `Disallow: /debug`, sitemap URL), a valid `sitemap.xml`, and
  canonical/`og:url` on the production origin with no `noindex`. The debug console is dropped
  from the bundle (5.4 KB smaller).
- **Every documented failure path behaves as designed, on the production build.** A blocked
  required asset reaches a terminal Spanish caption rather than hanging; an optional failure
  never touches readiness; and the 20 KB `model.glb` that trapped every visitor in the last
  audit now lands `ready` when blocked.
- **The build is deterministic.** Two clean builds produced byte-identical chunk hashes with a
  verified-stable source fingerprint.
- **Touch works.** The prior audit's A11Y-1 concealed a larger defect — the site was
  unusable on any phone or tablet. Fixed and verified on the production build, desktop and
  mobile.

**Four findings are new.** None blocks deployment; three block a confident public launch.

- **The project's five behavioural harnesses do not run on the deploy path.** `npm run build`
  runs the typecheck and the intro simulation only, so a regression in the warp, navigation,
  district or space assertions reaches Production silently. There is no CI at all. Every
  finding in this report was produced by running the gate that nothing currently runs.
- **The city GLB in the working tree is ~3× larger than the committed one** — 456 KB → 1.19 MB,
  294 → 1 070 nodes — uncommitted, unreviewed, and on the intro's prefetch path. Not changed by
  this audit; provenance unknown.
- **Production failures will be completely invisible.** No analytics, no error reporting.
- **A diagnostic probe was wired into the production click path**, inert today only because the
  GLB happens to carry no `extras`. Fixed.

---

## Deployment Architecture

Confirmed unchanged from the previous audit and re-verified:

| | |
|---|---|
| Framework | Vite 5 SPA, React 19 + `@react-three/fiber` 9.6 + three 0.174. Not Next.js; no SSR, no serverless functions, no API routes. |
| Package manager | npm, `package-lock.json` v3 committed and consistent — `npm ci` from the lockfile alone succeeds in 6 s, 167 packages, exit 0. |
| Node | `engines.node: 22.x`. Verified on 22.20.0. |
| Build | `npm run build` → `tsc -b && node scripts/simulate-intro.mjs && vite build`. Vercel uses this by default; `vercel.json` sets no `buildCommand`. |
| Output | `dist/` — static only. |
| Routing | **No client-side router.** Exactly two URLs: `/` and `/debug`, the latter a rewrite to `index.html`. No SPA catch-all, deliberately: unknown paths should 404 rather than serve the app under a wrong URL. |
| Runtime deps | None. Zero `fetch`, zero external origins, zero secrets. |
| Assets | 5.24 MB in `public/` served statically. All 10 referenced paths resolve case-correctly. |

---

## Vercel Configuration

No change required. `vercel.json` remains minimal and every entry earns its place: one
rewrite, four security headers, a report-only CSP, and two cache rules. The only edit this
pass is `/logos/` joining the asset cache rule, which the logo pipeline needs.

**Environment variables: still none required.** The build reads `VERCEL_ENV` and
`VERCEL_PROJECT_PRODUCTION_URL`, both of which Vercel injects automatically when *System
Environment Variables* are enabled in project settings. That checkbox remains the single
deployment setting this repo genuinely depends on — without it every build self-identifies as
`development`, which means `Disallow: /` and a shipped debug console on the production domain.

---

## Findings

### VER-1 · P1 · Verification · The behavioural harnesses do not run on the deploy path

**Affected:** `package.json` (`build`, `check`), absence of `.github/`

**Evidence.** `build` is `tsc -b && node scripts/simulate-intro.mjs && vite build`. Of the
five harnesses, only `test:intro` is in it. `check:navigation` (25), `check:district` (52),
`check:warp` (32) and `check:space` (28) — **137 assertions** — run only when a human types
`npm run check`. There is no `.github/` directory and no other CI configuration in the
repository.

**Impact.** These harnesses are the project's only tests, and `PROJECT_MEMORY` §2 calls
`npm run check` "the whole gate, deliberately". That gate is not attached to anything. A
regression in the warp envelope, the navigation footprint or the district flights builds
cleanly and deploys to Production. This directly contradicts `DECISIONS.md` §12, *"Guard
behaviour on the artifact, not on review."*

**Recommended action.** Attach the gate to the deploy path. Two options, and the choice is
yours because it has a real trade-off:

- **CI (recommended).** A GitHub Actions workflow running `npm ci && npm run check` on push
  and pull request. Keeps Vercel builds fast, and gives Preview deployments a pass/fail signal.
- **Build-time.** Change `build` to `npm run check && vite build`. Simpler and impossible to
  bypass — but it puts the harnesses on every deploy, and `check:space` was observed to be
  timing/tuning-sensitive during this session (it failed once against a mid-edit
  `spaceConfig.ts` at ratio 1.107 against a 1.15 threshold, then passed 5/5 once the file
  settled). A harness that can fail for a reason unrelated to the change is a bad deploy gate.

**Not implemented.** Both options are infrastructure choices, and the plan says not to
introduce infrastructure without justification. Flagging for your decision.

**Status:** OPEN

---

### OBS-1 · P1 · Observability · Production failures will be completely invisible

**Affected:** whole application

**Evidence.** No analytics, no error reporting, no Sentry/equivalent, no
`@vercel/analytics`, no `window.onerror` reporter. The boot coordinator tracks readiness and
`markFatal` reasons in memory and logs them to the console — where nobody will ever see them.

**Impact.** The failure mode this codebase is most carefully designed around — a required
asset dying and stranding a visitor — is precisely the one that produces *no signal at all*
after launch. The plan's §13 sets the bar explicitly: *"At minimum, ensure production failures
will not be completely invisible after launch."* That bar is not met.

**Recommended action.** The smallest honest fix is Vercel Web Analytics plus a `window.onerror`
/ `unhandledrejection` hook that reports the boot coordinator's `fatalReason()`. The
instrumentation already exists — `bootState.fatalReason()`, `pending()`, `readiness()` — so
this is a reporting sink, not new diagnostics. Do not add a third-party monitoring platform
for this.

**Status:** OPEN

---

### LOG-1 · P2 · Diagnostics · The production console is not silent on load

**Affected:** `src/experiences/murcia/scene/cityDistrictBindings.ts`,
`src/experiences/murcia/environment/createTerrainTransition.ts`

**Evidence.** A production build, loaded in Chromium, with no interaction, emits three
multi-line `console.warn` groups before the visitor touches anything:

```
[terrain transition] Plate outline covers 88.5% of its bounding rectangle; collar fills the remainder.
[district] servicios: District node "blog_edificios.001" matched only as "blog_edificios001" …
[district] servicios: District "servicios" resolved by node name, not by tag. Add the custom
                      property district = "servicios" in Blender and re-export …
```

Murcia is prefetched during the intro, so these fire for **every visitor**, including those
who never enter the city. Zero `error`, zero `info`, zero `log` — the noise is entirely
`warn`.

**Impact.** Low, and honest about it: these are our own Blender node names, and the GLB they
describe is publicly downloadable anyway, so this is not a disclosure of consequence. It is
console noise on a public marketing site, and it contradicts the invariant `DECISIONS.md` §16
states as its own break-detector: *"Or the console is not silent on load."*

The messages are genuinely useful, which is why they exist — they are the guard rail for the
`extras` re-export. The fix is not to delete them.

**Recommended action.** Gate both behind `DEBUG_TOOLS_ENABLED`, exactly as the Murcia debug
overlay and the `?model=` override already are. They remain visible in dev and in every
Preview deployment, which is where the re-export will actually be verified.

**Not implemented.** These sit in the asset-diagnostics path that the concurrent nebula work
also touches, and gating them changes what a developer sees. Yours to confirm.

**Status:** OPEN

---

### DBG-1 · P2 · Development artifact · A diagnostic probe was wired into the production click path

**Affected:** `src/experiences/murcia/interaction/InteractionProbe.ts`,
`src/experiences/murcia/MurciaExperience.ts`

**Evidence.** `InteractionProbe.probe()` returns `void` and its only effect is
`console.info('[interaction] selected', { name, type, id, point })`. Nothing in the product
reads it. It was called from `MurciaExperience`'s `pointerup` handler on every left-click,
gated on `active` and drag state but **not** on `DEBUG_TOOLS_ENABLED` — unlike every other
debug affordance in the repo.

It emitted nothing today, but only by accident: the GLB ships **zero `extras`**, so
`collectFrom` caches nothing and `probe()` returns at its first line. Confirmed in the browser
— entering Murcia on the production build produced no `info` output.

**Impact.** Latent, and the reason it is worth fixing now rather than later: the planned
Blender re-export (`murcia/blender-export-contract.md`) exists specifically to add the
`extras` this probe keys on. The moment that lands, a public production site starts logging
node metadata on every click — as an invisible side effect of an unrelated asset change.

**Action taken.** `InteractionProbe` now takes an `enabled` flag, wired to the same
`debugTools` value as everything else, and `probe()` returns immediately when false. Behaviour
in dev and Preview is unchanged.

**Status:** **RESOLVED**

---

### ASSET-2 · P1 · Assets · The city GLB has been re-exported ~3× larger, uncommitted and unreviewed

**Affected:** `public/models/city-prototype.glb`

**Evidence.** The working copy differs from `HEAD` and is not committed:

| | `HEAD` | working copy |
|---|---|---|
| Size | 455 616 B (456 KB) | **1 245 164 B (1.19 MB)** |
| Nodes | 294 | **1 070** |
| Meshes | 111 | **257** |
| `extensionsRequired` | `KHR_draco_mesh_compression` | unchanged |
| Materials / textures | 0 / 0 | unchanged |
| Nodes carrying `extras` | 0 | **still 0** |
| Generator | Blender glTF I/O v5.1.20 | unchanged |

Draco compression is intact, so this is genuinely more geometry, not a compression regression.

**Impact.** Three separate consequences:

1. **+790 KB on the critical prefetch path.** This is the single largest asset and it is
   fetched *during the intro* as `murcia:model`, competing with the 2.43 MB of Earth textures
   for bandwidth. It is `required: false`, so it cannot trap a visitor — but on a slow
   connection it now takes meaningfully longer to arrive, and the whole reason for prefetching
   it is that the transition must never wait (`adr/004`).
2. **`extras` are still absent.** The re-export did *not* add the `district` custom properties
   that `murcia/blender-export-contract.md` calls for, so district resolution still falls back
   to node-name matching — now across 1 070 nodes instead of 294. The production build already
   warns that `servicios` resolved by name and matched only after sanitisation (LOG-1); a
   3.6× larger name space makes that heuristic materially more fragile, and
   `PROJECT_MEMORY` §11 records what a silent name-lookup failure costs here.
3. **Documentation is now wrong.** `PROJECT_MEMORY` §9 states 456 KB / 294 nodes / 111 meshes /
   957 instanced buildings. All four numbers are stale, and they are cited from source.

**This asset was not changed by this audit and its provenance is unknown to me** — it was
already in the working tree when the pass began. It may be deliberate work in progress.

**Recommended action.** Do not ship it unreviewed. Decide whether the extra geometry is
intended; if it is, commit it deliberately, re-measure the Murcia warm/prefetch timings, and
update `PROJECT_MEMORY` §9. If the re-export was going to happen anyway, it is also the moment
to add the `extras` — doing both in one export costs nothing extra and closes a documented gap.
**Deliberately not reverted:** reverting someone else's uncommitted asset is not this audit's
call.

**Status:** OPEN — needs an owner's decision

---

### ASSET-1 · P3 · Assets · `public/logos/.gitkeep` shipped with prose in it

**Evidence.** The placeholder file carried a Spanish sentence pointing at internal docs and
was emitted to `dist/logos/.gitkeep`.

**Action taken.** Truncated to 0 bytes.

**Status:** **RESOLVED**

---

### DEP-1 · P3 · Dependencies · Nine advisories, all development-only

**Evidence.** `npm audit --omit=dev` → **0 vulnerabilities**. Full tree → 9 (2 high, 7
moderate), reached through `potrace` → `phin`, which npm also reports as deprecated. `potrace`
is a devDependency used by `scripts/trace-isotype.mjs` to generate the isotype paths; nothing
it touches is in the shipped bundle.

**Recommended action.** None urgent. Worth noting that `potrace` is a one-off authoring tool —
if the isotype is final, it could be dropped from `devDependencies` and the advisories with it.

**Status:** OPEN (accepted)

---

### Carried forward, unchanged in substance

| ID | Severity | State |
|---|---|---|
| **CONTENT-1** | P1 | **Still blocking publish.** Every case study, metric and district service is invented, under real company names. `data/caseStudies.ts` says so at the top. The `logo` pipeline is now wired but every value is deliberately still `null` for the same reason. |
| **LEAD-1** | P1 | Audit form still has no endpoint and no privacy notice. |
| **A11Y-1** | P1 → narrowed | **The touch half is closed** (see below). The keyboard half is untouched: geo tags are divs with no `role`/`tabindex`, satellites have no DOM affordance. Annotated in place in the 2026-08-07 audit. |
| **SEC-1** | P1 | `?model=` same-origin guard is bypassable with a backslash. Found by the concurrent security audit (`security-wordpress-api-2026-08-11.md`), gated behind `DEBUG_TOOLS_ENABLED`, so production is unaffected but Preview is not. **Owned by that audit, not restated here.** |

---

### Resolved since the last audit (verified, not assumed)

- **The site was unusable without a mouse.** Both 3D entry points dispatched from a hover that
  a tap can never produce. Measured: 460 emulated taps across the globe produced no response
  on the audited code. Now fixed and verified on the production build — satellites select on
  desktop and mobile, and a tap entered Murcia on the mobile profile. `DECISIONS.md` §17.
- **Four GPU/resource leaks and six crash paths** closed in the same pass, all
  behaviour-neutral. `PROJECT_MEMORY` §11 (23–30).

---

## Environment Variables

| Name | Environment | Source | Required |
|---|---|---|---|
| `VERCEL_ENV` | Production, Preview | Vercel system variable | Yes, implicitly |
| `VERCEL_PROJECT_PRODUCTION_URL` | Production, Preview | Vercel system variable | Yes, implicitly |

No application secrets. No `.env` file is needed or present, and none is read at runtime.
Both variables are consumed **at build time only**, in `vite.config.ts`. `VITE_VERCEL_ENV` is
accepted as a manual override for local verification of the production path.

**The one setting that must be right:** *Settings → Environment Variables → Automatically
expose System Environment Variables* must be enabled. Without it, a Production build emits
`Disallow: /` and ships the debug console on the public domain. This is a silent failure —
the deploy succeeds.

---

## Verification Results

| Check | Result |
|---|---|
| Clean install from lockfile (`npm ci`, isolated dir) | **PASS** — 167 packages, 6 s, exit 0, lockfile v3 |
| Production build | **PASS** — 3.2–3.7 s |
| Build determinism | **PASS** — two builds, byte-identical hashes for all 8 chunks, source fingerprint verified stable across the test |
| Typecheck (`tsc --noEmit`) | **PASS** |
| Behavioural harnesses | **PASS** — 25 + 52 + 32 + 28 + intro. Not on the deploy path (VER-1) |
| Lint | N/A — no ESLint, deliberately (`PROJECT_MEMORY` §2) |
| Bundle budgets | **PASS** — intro 13 325/16 000 B; app entry 302 381/320 000 B (~17 KB headroom, dev build). Production build is 296 989 B with the debug console dropped |
| Asset references | **PASS** — all 10 referenced paths exist, case-correct |
| Production SEO branch | **PASS** — robots/sitemap/canonical/og:url correct under `VERCEL_ENV=production`; **first time this branch has ever been executed** |
| Development SEO branch | **PASS** — `Disallow: /` + `noindex` |
| Secrets in bundle | **PASS** — one `AKIA` hit investigated and confirmed a false positive inside base64 WASM in the three chunk |
| Debug gating | **PASS** — `/debug` panel absent from the production bundle; Murcia's overlay unreachable (class ships in the lazy chunk, gate verified) |
| Console on load (production) | **PARTIAL** — 0 errors, 0 info/log; 3 warn groups (LOG-1) |
| Failure paths | **PASS** — required-asset block → `readiness=fatal` + Spanish caption; optional block → `ready`, site usable; `model.glb` block → `ready`, progress 1 |
| Smoke: Chromium desktop 1440×900 | **PASS** — 1 canvas, 0 errors, 0 failed requests, case selection works |
| Smoke: mobile (Pixel 7 profile) | **PASS** — 1 canvas, 0 errors, touch selection works, entered Murcia |
| Smoke: WebKit / Firefox | **NOT RUN** — not installed in this environment. See Deferred |
| Preview deployment | **NOT RUN** — no Vercel access from this environment |
| Production smoke | **N/A** — not deployed |

---

## Deferred Improvements

Valid, deliberately out of scope:

- **WebKit and Firefox smoke tests.** Only Chromium is installed here. Safari matters
  disproportionately for a WebGL site on iOS, and it is also where the KTX2/basis transcoder
  and `compileAsync` are most likely to behave differently. **This is the largest remaining
  verification gap** and needs a real device or a browser install, not a code change.
- **The nebula/galaxy work** (`src/space/**`, `NebulaShell`, the baked cubemap). In flight
  during this audit and deliberately not reviewed. It adds a runtime cubemap bake at boot and
  grew the `SceneCanvas` chunk from 199 KB to 212 KB; both want a look once it settles,
  particularly on mobile GPUs.
- **Keyboard access to the 3D** (A11Y-1's remaining half). Real feature work.
- **`noUncheckedIndexedAccess`** still off; still the reason a whole class of indexing bug is
  invisible to `tsc`.
- **Bundle:** `three` is 814 KB / 219 KB gzipped and dominates the payload. Reducing it means
  a custom three build — a project, not a fix.
- **Dropping `potrace`** from devDependencies if the isotype is final (DEP-1).

---

## Rollback Procedure

Static site, no database, no runtime state, no external schema. Rollback is therefore complete
and instant — there is nothing that can be left half-migrated.

1. **Identify the last good deployment.** Vercel dashboard → Deployments, filter to Production
   and `Ready`. Each row shows its commit SHA; cross-check against `git log`.
2. **Restore it.** Open that deployment → **⋯ → Promote to Production** (Instant Rollback).
   This re-points the production alias at an already-built immutable deployment; it does not
   rebuild, so it cannot fail for a reason the original did not have. Expect seconds.
3. **The domain follows automatically.** The production alias moves with the promotion; DNS is
   untouched, so there is no propagation wait.
4. **Environment variables do not roll back with a deployment.** They are project-level and
   applied at build time. If the bad deploy was caused by an env change — realistically, the
   System Environment Variables checkbox being turned off — promoting an old build fixes the
   symptom, but the next build reintroduces it. Fix the setting, then redeploy.
5. **No backward-compatibility concerns.** No API, no persisted client state, no cache keyed
   on anything but content hashes. Asset caching is `max-age=86400` with
   `stale-while-revalidate`, so a rolled-back asset is served within a day at worst; `/assets/*`
   is content-hashed and immutable, so it can never serve a stale mismatched chunk.
6. **Verify.** Load the production URL, confirm the intro completes, one canvas, no console
   errors, and `curl https://<domain>/robots.txt` returns `Allow: /`.

**Recovery from a bad *content* deploy is the same procedure** — there is no separate content
system.

---

## Final Production Checklist

| | | |
|---|---|---|
| ☑ | Clean install succeeds | `npm ci` from lockfile, 167 pkgs |
| ☑ | Production build succeeds | and is byte-for-byte deterministic |
| ☑ | Type checking succeeds | |
| ☐ | Linting | N/A — none configured, deliberately |
| ☑ | Automated tests succeed | 137 + intro assertions — **but not on the deploy path (VER-1)** |
| ☑ | Required environment variables identified | two, both Vercel-injected |
| ☑ | No secrets committed or client-exposed | one candidate investigated, false positive |
| ☑ | Routing / direct URLs verified | two URLs by design; no SPA catch-all, intentionally |
| ☑ | Critical assets verified | all paths resolve, case-correct, 5.24 MB |
| ☑ | Critical Three.js/WebGL flows verified | desktop + mobile, production build |
| ☑ | Production error paths reviewed | all three classes exercised and correct |
| ☑ | Security review completed | this pass + `security-wordpress-api-2026-08-11.md` |
| ☑ | Basic performance review completed | budgets asserted; `three` dominant, deferred |
| ☑ | Basic SEO review completed | **production branch executed for the first time** |
| ☑ | Basic accessibility review completed | touch closed; **keyboard open (A11Y-1)** |
| ☐ | Preview deployment verified | no Vercel access from this environment |
| ☑ | Production Vercel configuration verified | unchanged and minimal |
| ☐ | Domain assumptions verified | canonical falls back to `vertigo-marketing-web.vercel.app`; real domain not yet decided |
| ☐ | Analytics / diagnostics verified | **none exist (OBS-1)** |
| ☑ | Rollback procedure documented | above |
| ☐ | Final production smoke test passed | requires a deployment |

### Remaining blockers

**To deploy:** none. The technical path is verified and reproducible.

**To publish:** four.

1. **CONTENT-1** — invented results under real company names. This is the one that carries
   legal risk, not just embarrassment.
2. **LEAD-1** — a form that appears to work and discards the submission, with no privacy
   notice.
3. **OBS-1** — launching with no way to see failures. Cheap to fix, and the only one on this
   list that gets harder to add after traffic arrives.
4. **ASSET-2** — a 790 KB unreviewed increase to the most-prefetched asset, sitting
   uncommitted in the working tree. Needs a decision, not necessarily a change.

**Strongly recommended alongside:** VER-1, because every finding in this report was found by
running the gate that nothing currently runs.
