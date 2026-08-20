# Production Readiness Re-Audit — Vercel (GitHub → Vercel)

Audited: 2026-08-20 · against the working tree at commit `a207f2b` (`main` = `origin/main`) + ~123 uncommitted changes
Scope: `docs/plans/000-audit-vercel-deploy.md`, re-run for the first GitHub-connected deployment
This is a **delta** against `production-readiness-vercel-2026-08-07.md` (2026-08-07) and
`production-readiness-vercel-2026-08-11.md`. Both remain accurate for everything not restated here;
where they disagree with this one, this one wins.

---

## Executive Summary

**Status: `READY WITH NON-BLOCKING FINDINGS` — technically. `NOT READY` to publish.** Same shape as
both previous passes, for the same reason: the deployment path is sound and the content is not.

**What changed since 2026-08-11, and matters for deployment:**

- **The gate is on the deploy path.** `npm run build` is `npm run check && vite build` — typecheck,
  593 unit tests, six behavioural harnesses — and Vercel runs `npm run build` (VER-1 **closed**).
- **Content is generated at build time from WordPress** (ADR 010). `precheck` runs `content:build`
  before the gate, which fetches, validates and writes `src/content/generated/` (gitignored by
  design). The browser still never contacts the CMS: zero runtime fetches, no CSP change.
- **The repository has a remote.** `origin` = `github.com/miguelvihto/vertigo-marketing-website`,
  production branch `main`. Both earlier audits' "no git remote" blocker is gone.
- **The forms are honest.** Both transports *reject* in production and demo-resolve everywhere
  else; nothing leaves the browser; nothing fakes success.

**What was found, and fixed in this pass (two P1, both in the new pipeline):**

- **CMS-1** — a WordPress logo URL would have **failed the production build** the first time an
  editor uploaded one: the mapper passed it through, the self-check rejected it as non-local, and
  one rejected record fails the collection. The documented behaviour ("degrade to `null`") is now
  the implemented behaviour.
- **CMS-2** — a production build with `WP_CONTENT_BASE` missing, typo'd or scoped to Preview only
  **shipped fixtures with a green deployment**. Production now has to name its source or the build
  fails.

**The single P0 is process, not code: nearly everything above is uncommitted.** `origin/main` has
none of the content pipeline, none of the new components, and a different `package.json`. What
GitHub would build today and what the working tree builds are different projects. Verified path by
path: once committed with `git add -A`, the tree is complete — nothing the build reads is ignored
except `src/content/generated/`, which is regenerated before it is read.

**To publish** the blockers are unchanged: CONTENT-1, LEAD-1, OBS-1 (below).

---

## Deployment Architecture

| | 2026-08-11 | Now |
|---|---|---|
| Build | `tsc -b && node scripts/simulate-intro.mjs && vite build` | **`npm run build` = `npm run check && vite build`**, where npm's `precheck` hook runs `content:build` first. Effective chain: **`content:build → tsc --noEmit → vitest run → 6 harnesses → vite build`** |
| Intro simulation | `scripts/simulate-intro.mjs` | Ported into `src/intro-draw/playhead.test.ts` (40 cases vs the script's 23). Not lost. |
| Content | static TS modules | WordPress → Node at build time → `src/content/generated/*.ts`. Sources: `wp` (REST, `AbortController` deadline, torn-snapshot check), `fixture` (`content/fixtures/`, committed), `seed` (`content/seed/`, committed, banner). |
| Runtime network | none | **still none** — verified: zero `fetch`/XHR/beacon/WebSocket/Worker in `src/`; media is (to be) mirrored, never hotlinked |
| Routing | `/` + `/debug` | **unchanged** — the new navigation rail, legal panel, footer and contact section read no path, write no history/hash, link nowhere internal (one `tel:` anchor). `vercel.json`'s single rewrite is still complete. |
| Tests | 4 harnesses + intro sim, manual only | 35 Vitest files (593 tests) + 6 harnesses, **on the deploy path**. Playwright e2e stays local by design (`playwright.config.ts:3-9`). |
| Node / npm / lockfile | 22.x / lockfile v3 | unchanged; lockfile byte-identical to HEAD and consistent with `package.json` (the only diff vs HEAD is scripts) |
| Output | `dist/`, 5.2 MB assets | `dist/`, 7.8 MB `public/` (sky panoramas and the narrow Earth set added since) |

---

## Vercel Configuration

`vercel.json` is **unchanged** and still minimal: `/debug` rewrite, four security headers, CSP in
Report-Only, two cache rules, `.wasm` content type. The routing and CSP review found nothing that
needs adding (see Verified OK).

**Project settings — the ones that must be right:**

| Setting | Value | Why |
|---|---|---|
| Framework Preset | Vite (auto) | `npm run build` → `dist` |
| Build Command | *(default)* | Vercel runs the `package.json` `build` script when one exists, so the gate runs. **Do not override to `vite build`** — that would skip content generation *and* every test. |
| Install Command | *(default)* | devDependencies are installed by default. **Do not set `npm install --only=production`** — `vitest`, `typescript`, `esbuild`, `jsdom` are all needed by the gate; the build would fail (or worse, pass with the gate skipped if the command were also changed). |
| Node.js | 22.x | `engines` + `.nvmrc` |
| **System Environment Variables** | **enabled** | `vite.config.ts` reads `VERCEL_ENV` / `VERCEL_PROJECT_PRODUCTION_URL`; `build-content.ts` now also reads `VERCEL_ENV`. Without them: debug console ships, robots says `Disallow: /`, and the new production-source guard cannot fire. |
| Production branch | `main` | the only branch on the remote |
| Deploy Hook | create one for `main` | the publish flow; runbook in `docs/content/wordpress-field-contract.md` §"Publish flow" |

---

## Findings

### GIT-2 · P0 (process) · The deployable tree is not on GitHub

**Evidence.** `git status`: 123 entries. Untracked: `content/` (whole pipeline), `scripts/build-content.ts`,
`src/content/`, `src/app/navigation/`, `src/experiences/earth/navigation/`, six components, two
transports, `orbitAssignments.ts`, `resolveOrbitCases.ts`, 17 test files, `e2e/navigation.spec.ts`,
`public/models/city-backdrop.glb`, several docs. Modified: `package.json` (scripts only), `App.tsx`,
`SceneCanvas.tsx`, `MurciaExperience.ts`, the sky panoramas, ~50 more. Deleted: `src/data/caseStudies.ts`,
`GeoMarkersLayer.tsx`, `createGeoMarkers.ts`, `ReturnToEarthControl.tsx`, `murcia/content/districts.ts`.

**Checked so the commit can be trusted:** every one of those paths is untracked-*not*-ignored
(`git check-ignore -v` on each); the only ignored input is `src/content/generated/` (+ now
`generated.tmp/`), by design; `git ls-files` of the 7 deleted modules finds **no remaining importer**
in `src/`, `checks/`, `e2e/`, `content/`, `scripts/` (three prose comments only); no tracked file
> 5 MB; no `.env*` tracked; `tsconfig.tsbuildinfo` not tracked. HEAD is itself self-consistent
(its `package.json`, `checks/navigation-zoom.ts` and `src/data/caseStudies.ts` agree), so there is no
half-migrated intermediate on the remote either.

**Action.** Commit and push — yours, not this pass's. Two notes for the commit: (1) the sky panoramas
under `public/textures/` are modified and uncommitted, so a deploy *before* the commit ships the older
images; (2) `public/models/city-backdrop.glb` is untracked **and unreferenced** (ASSET-3) — decide.

**Status:** OPEN — awaiting commit.

---

### CMS-1 · P1 · A WordPress logo would have failed the production build — FIXED

**Affected:** `content/collections/caseStudies.collection.ts`, `content/collections/collections.test.ts`,
`docs/content/wordpress-field-contract.md`

**Evidence.** The mapper passed `source.logo` through verbatim (`:137-140`), then ran the emitted
record through `caseStudyProblems` (`:178`), whose logo rule is `LOCAL_MEDIA_PATH = /^\/[\w./-]+$/`
(`src/content/invariants.ts:55,98-100`). A CMS URL (`https://cms…/wp-content/uploads/…`) fails that
regex → the record is rejected → one rejected record fails the collection → `content:build` exits 1
→ **the deployment fails**. Meanwhile the contract doc (`:49`) promised "on violation → `null`, the
drawn plate stays", and the mapper's own comment said logo "degrades instead of failing". The media
mirror that would turn the URL into a local path — described by ADR 010, `.gitignore:88` and
`invariants.ts:50-53` — **has no implementation** (`grep logos content scripts` → nothing).
Invisible today only because every fixture and seed logo is `null`.

**Action taken.** The mapper keeps a logo only if it is already a local path and maps anything else to
`null`. Two tests added first and watched fail (remote URL → `ok:true`, `logo:null`; local path →
kept). The contract doc now states plainly that the mirror is unbuilt and every remote URL degrades
until it lands. `remoteMediaUrl` (`content/lib/validate.ts:178`) is untouched — it is the fetch-side
check the mirror will use.

**Status:** **RESOLVED**

---

### CMS-2 · P1 · Production silently fell back to fixtures — FIXED

**Affected:** `scripts/build-content.ts` (`chooseMode`), `docs/content/wordpress-field-contract.md`,
`docs/DECISIONS.md` §27, `.env.example`

**Evidence.** `chooseMode()` returned `'fixture'` whenever `WP_CONTENT_BASE` was unset — in every
environment. A Vercel project with the variable missing, typo'd, or scoped to Preview only would
produce a **green production deployment serving `content/fixtures/`**, announced by one
`[content] content source: fixtures` log line. `seed` mode prints a five-line banner for the far
less likely mistake. ADR 010's own rule — "the fallbacks are explicit sources you have to name" —
was not enforced where it mattered.

**Action taken.** With `VERCEL_ENV=production` and neither `WP_CONTENT_BASE` nor `CONTENT_SOURCE`
set, `content:build` now fails with a message naming the two ways to fix it. Preview and local keep
the fixture default (previews are the client-demo builds; fixtures are the demo content). Verified:
production+nothing → exit 1; production+`CONTENT_SOURCE=seed` → banner + success; preview+nothing →
fixtures. Also in the same edit (**CFG-1**, P3): `WP_TIMEOUT_MS` is validated — `Number('abc')` was
becoming `setTimeout(fn, NaN)`, which fires immediately and aborted every request as "timed out after
NaNms"; now it fails with the value named.

**Consequence for the first production deploy:** WordPress is not configured yet, so **set
`CONTENT_SOURCE=seed` in the Vercel Production environment** (seed == fixtures today) and replace it
with `WP_CONTENT_BASE` (+ `WP_AUTHORIZATION`) when the CMS is live. The banner in the build log is
the reminder.

**Status:** **RESOLVED**

---

### ENV-1 · P2 · No `.env.example` — FIXED

`.gitignore:22-24` ignores every `.env*` with a deliberate `!.env.example` exception written for a
file that did not exist. Added: every variable the repo reads, with scope and a no-values rule, plus
the "never set `VERTIGO_SKIP_BUDGETS`" note and the system-variables toggle. **RESOLVED**

---

### DOC-1 · P2 · Deploy Hook unspecified; stale build-chain strings — FIXED

The publish flow was a diagram (`WP publish → Deploy Hook → Vercel build`) with no creation steps
and no WordPress-side trigger. A runbook now lives in `wordpress-field-contract.md` §"Publish flow",
stating honestly that the WP half is outside this repo and unbuilt, and what to do until it exists
(Redeploy / push). `docs/DECISIONS.md:258` (§12, the live decisions file) described the retired
chain as current; corrected with the history kept. `PROJECT_MEMORY.md:1056` annotated. The two
earlier audits are dated records and were left as they were, with a pointer added to the 08-11 one.
**RESOLVED**

---

### ASSET-3 · P2 · `city-backdrop.glb` is shipped, unreferenced, and untracked — DECISION

`public/models/city-backdrop.glb` (206 KB): Vite copies it into `dist/`; nothing in `src/` loads it
(`murciaConfig.ts:57` still points at `city-prototype.glb`; `docs/murcia/blender-city-backdrop.md:247`
says "Not wired in"). It is deliberate work in progress. Either commit it as WIP (206 KB of dead
payload until wired — cached for a day by the `/models/` rule, so cheap) or keep it out of `public/`
until it is wired. **Not changed here; yours to call.** OPEN

---

### TS-1 · P3 · `vite.config.ts` was not typechecked — FIXED

`tsconfig.include` covered `src`, `checks`, `content`, `e2e`, `scripts` and both test configs but not
`vite.config.ts`, which holds the three build-aborting plugins (chunk budgets, intro entry, SEO assets).
Added; `tsc --noEmit` stays clean. **RESOLVED**

---

### GIT-3 · P3 · `generated.tmp` staging dir unignored — FIXED

`content/lib/generate.ts:134-153` renders into `src/content/generated.tmp/` and moves it into place;
a killed run would leave it as untracked noise. Added to `.gitignore` next to `generated/`.
`.claude/settings.json` is tracked (plugin enablement only, harmless) — noted, not changed. **RESOLVED**

---

### Verified OK — no change needed

| Area | Result |
|---|---|
| Lockfile | byte-identical to HEAD; every `package.json` range present; no new dependency since the last audit (`vitest`, `jsdom`, `@playwright/test` were already at HEAD) |
| Vercel build behaviour | `npm run build` runs (package script beats the preset's `vite build`); devDependencies installed by default; 45-min limit, 8 GB / 4 CPU — this build is minutes |
| Routing | exactly one path read (`App.tsx:42`, `/debug`); no `pushState`/`replaceState`/`hash` writes; no internal `<a href>`; legal/contact are panels, not pages. Cosmetic: `/debug/` (trailing slash) 404s at the edge before the client-side strip runs |
| Assets | all 17 root-absolute references resolve on disk, case-exact (Earth ×6, sky ×4, KTX2 ×2, GLB ×3, decoder dirs ×2). `/logos/` referenced only in prose; every logo is `null` |
| CSP | zero external origins, zero `fetch`; every directive is satisfied by what the app does (`blob:` + `'wasm-unsafe-eval'` for the Draco/Basis workers, `'unsafe-inline'` only for styles — `index.html` inline block and `introDraw.ts:79` runtime injection; no inline scripts, no `'unsafe-inline'` needed for `script-src`). **The policy is ready to promote from Report-Only on a Preview with no edits** (SEC-2) |
| Debug gating | `DEBUG_TOOLS_ENABLED` remains the single gate; every `console.info/table/group` in `src/` is behind it or a `debugTools` parameter; `import.meta.env` read nowhere in `src/` |
| Tests vs the CMS | two tests + one harness couple the build to CMS record *ids* (`satellite-01…06` assigned in `orbitAssignments.ts`; district `servicios` in `cityDistrictBindings.ts`). Intentional per the contract ("unpublishing an assigned case fails the build"). `resolveOrbitCases.test.ts:47-50` is stricter than the module (all six presets must be assigned) — left, noted |
| Intro simulation | not lost — ported to `playhead.test.ts`, on the deploy path |
| Secrets | none in `src/`, `public/`, `scripts/`, `checks/`, `content/`, config; no `.env*` tracked |

---

## Environment Variables

All **build-time**. Nothing is read at runtime; nothing is `VITE_`-prefixed except the local
override. Template: `.env.example`.

| Name | Source | Production | Preview | If missing |
|---|---|---|---|---|
| `VERCEL_ENV` | Vercel system | auto | auto | build behaves as development: debug console ships, `Disallow: /`, and the production-source guard cannot fire |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel system | auto | auto | canonical/og:url/sitemap fall back to `vertigo-marketing-web.vercel.app` |
| `WP_CONTENT_BASE` | you | **required** (or `CONTENT_SOURCE=seed`) | optional | production: **build fails** (CMS-2); preview: fixtures |
| `WP_AUTHORIZATION` | you | with `WP_CONTENT_BASE` | with `WP_CONTENT_BASE` | anonymous REST reads |
| `WP_TIMEOUT_MS` | you | optional | optional | 15000; non-numeric fails the build |
| `CONTENT_SOURCE` | you | `seed` until WordPress exists | — | see above |

**Never set:** `VERTIGO_SKIP_BUDGETS`. **Never override:** the install command to production-only.

---

## Verification Results

Everything below was executed in this pass against the working tree with the fixes applied.

| Check | Result |
|---|---|
| `npm run content:build` (no env) | **PASS** — fixtures, 6 + 1 records, up to date |
| `VERCEL_ENV=production npm run content:build` | **PASS (fails as designed)** — exit 1, "a production build must name its content source" |
| `VERCEL_ENV=production CONTENT_SOURCE=seed npm run content:build` | **PASS** — banner + 6 + 1 records |
| `VERCEL_ENV=preview npm run content:build` | **PASS** — fixtures |
| `WP_TIMEOUT_MS=abc …` | **PASS (fails as designed)** — exit 1, value named |
| `tsc --noEmit` (with `vite.config.ts` included) | **PASS** |
| `vitest run` | **PASS** — 35 files, 593 tests (21 in `collections.test.ts`, two new) |
| Six harnesses | **PASS** — architecture 18/18 · navigation 52/52 · footprint 8/8 · district 68/68 · warp 36/36 · space 29/29 |
| `npm run check` end to end | **PASS** — exit 0 |
| Production-path `npm run build` (`VITE_VERCEL_ENV=production VERCEL_ENV=production CONTENT_SOURCE=seed`) | **PASS** — seed banner in the log, gate green, `vite build` 3.3 s. `dist/robots.txt` = `Allow: /` + `Disallow: /debug` + sitemap; `dist/sitemap.xml` emitted; canonical and `og:url` on the production origin; **no** `noindex`; the tuning console is absent from the entry chunk (0 hits) |
| Chunk budgets (production build) | **PASS, but tight** — intro 14,057 / 16,000 B · **app entry 310,720 / 320,000 B = 2.9 % headroom** (was 7.4 % on 08-07, 5.4 % on 08-11). The next entry-chunk feature will fail the build; see BUDGET-1 below |
| Routing / asset / CSP / debug-gating review | **PASS** — tables above |
| Git completeness (`git check-ignore`, `git ls-files`, dangling imports) | **PASS** |
| Preview deployment | **NOT RUN** — nothing pushed yet |
| Browser matrix (Safari, Firefox, real phone) | **NOT RUN** — unchanged gap since 08-07; needs a Preview URL |

---

## Deferred Improvements

- **BUDGET-1 (carried, now P2).** The app entry chunk is at 310,720 B against a hard 320,000 B
  budget — **9,280 B of headroom**, down from ~24 KB on 08-07. The navigation rail, legal panel,
  contact section and the content lookup all landed in the entry. This is the budget doing its job,
  but the next UI feature will fail `vite build` on Vercel with a message that looks like a regression.
  Options when it fires: move a panel behind a dynamic import, or raise the budget *with a measured
  reason* (`vite.config.ts:23`, and the comment above it says how).
- **The media mirror** for `public/logos/` (ADR 010 describes it; nothing implements it). Until then
  logos degrade to the drawn plate. A real workstream: fetch via `remoteMediaUrl`, content-type
  allowlist, size cap, deterministic filename, write before emit.
- **WordPress-side Deploy Hook trigger** — outside this repo.
- **CSP promotion** (SEC-2) — first Preview.
- **OBS-1** — still no way to see a production failure. Unchanged recommendation: Vercel Web
  Analytics + a `window.onerror`/`unhandledrejection` reporter of `bootState.fatalReason()`. It is the
  only launch item that gets harder after traffic arrives, and it adds the first external origin, so
  it is a deliberate CSP change, not a drive-by.
- **`.claude/` in `.gitignore`**, `/debug/` trailing-slash rewrite — trivia.

---

## Rollback Procedure

Unchanged from 2026-08-11 (Promote-to-Production of the last good deployment; instant; no DNS; no
state) with two additions:

- **Environment variables do not roll back with a deployment.** A bad build caused by a content
  variable (wrong `WP_CONTENT_BASE`, `CONTENT_SOURCE` left on `seed`) is fixed by promoting the
  last good build *and* correcting the variable before the next one.
- **A bad content publish is not a rollback case at all.** Validation fails the build; the previous
  deployment keeps serving; the field is named in the log. Fix it in WordPress and redeploy.

---

## Preview → Production

```
commit + push main ──► Vercel import (Vite preset) ──► enable System Env Vars
                                                       set CONTENT_SOURCE=seed (Production)
        push a branch ──► Preview ──► checklist below ──► merge ──► Production ──► smoke
```

**On every Preview, before promoting:** devtools console for CSP Report-Only violations (walk intro →
Earth → satellite → audit panel → Murcia → return); `curl <preview>/robots.txt` → `Disallow: /`;
`/debug` renders the tuning panel; the audit/contact forms *succeed* (demo transport) — on
**Production** they must show the error state instead; `[content] content source: …` line in the
build log says what you expect. Then Safari, Firefox, a real phone.

---

## Final Production Checklist

| | Item | Status |
|---|---|---|
| ☑ | Clean install succeeds | lockfile unchanged and consistent |
| ☑ | Production build succeeds | gate + build, locally on the production path |
| ☑ | Type checking succeeds | now including `vite.config.ts` |
| ☐ | Linting | N/A — none, deliberately |
| ☑ | Automated tests succeed | 593 + 211 harness assertions — **on the deploy path** |
| ☑ | Required environment variables identified | two system + four content; `.env.example` |
| ☑ | No secrets committed or client-exposed | |
| ☑ | Routing / direct URLs verified | still two URLs; new UI adds none |
| ☑ | Critical assets verified | 17/17 resolve; one unreferenced (ASSET-3) |
| ☑ | Critical Three.js/WebGL flows verified | unchanged since 08-11 (desktop + mobile, production build) |
| ☑ | Production error paths reviewed | unchanged; forms now fail honestly |
| ☑ | Security review completed | CSP ready to promote; zero external origins |
| ☑ | Basic performance review completed | budgets asserted on every build |
| ☑ | Basic SEO review completed | production branch verified again |
| ☑ | Basic accessibility review completed | keyboard half of A11Y-1 still open |
| ☐ | Preview deployment verified | **blocked on the commit** |
| ☑ | Production Vercel configuration verified | table above; the two "do not override" rules are new |
| ☐ | Domain assumptions verified | real domain not yet decided; canonical falls back to `*.vercel.app` |
| ☐ | Analytics / diagnostics verified | OBS-1 still open |
| ☑ | Rollback procedure documented | |
| ☐ | Final production smoke test passed | requires a deployment |

### Remaining blockers

**To deploy:** one — **commit and push the working tree**, then set `CONTENT_SOURCE=seed` (or
`WP_CONTENT_BASE`) in Vercel Production and enable system environment variables.

**To publish:** CONTENT-1 (six fictional case studies on real brands — fixtures *and* seed; plus the
self-declared placeholder phone/legal texts in `src/content/site.ts`), LEAD-1 (two forms that
visibly error in production until a backend and a privacy notice exist), OBS-1 (no signal when
production fails). Keyboard access to the 3D (A11Y-1) and ASSET-3 need a decision each.
