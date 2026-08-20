# Cybersecurity & Project Security Audit — 2026-08-20

```
Audited:  2026-08-20 · against commit a207f2b (main = origin/main) + ~167 uncommitted/untracked changes
Scope:    the whole repository (source, build pipeline, config, docs, public/, ignored build output,
          36 commits of Git history), the installed dependency tree, and the LIVE production
          deployment at vertigo-marketing-website.vercel.app (headers, bundle, runtime behaviour in
          headless Chromium). Out of scope, deliberately: the WordPress install (does not exist yet),
          the Vercel dashboard and GitHub settings (not reachable from the repo), fuzzing.
          Read-only: no production code, configuration or brief was changed by this pass.
Baseline: docs/audits/reports/security-wordpress-api-2026-08-11.md (incl. its 2026-08-20 addendum)
          and the security sections of docs/audits/reports/production-readiness-vercel-2026-08-20.md
```

This report **supersedes** `security-wordpress-api-2026-08-11.md` as the current security result. The
earlier report remains accurate for everything not restated here; where they disagree, this one wins.
It is the first run of the `cybersecurity-project-security` brief.

**One fact changes the framing of both baselines:** a production deployment **exists and is live** at
`https://vertigo-marketing-website.vercel.app/` (Vercel `Last-Modified: 2026-08-14`, built from
`a207f2b`, i.e. what `origin/main` holds). The 08-20 readiness pass recorded "Preview deployment —
NOT RUN — nothing pushed yet"; the 08-11 security pass recorded "nothing was executed against a
deployment". Both were wrong by the time they were written, which is itself an organisational finding
(ORG-1). The upside is that Phases 7, 12 and 15 could be verified live for the first time.

---

## 0. Status of Prior Findings

| ID | Prior severity | Status now | Evidence |
|---|---|---|---|
| SEC-1 `?model=` same-origin guard bypassable with `\` | Security (preview-only) | **OPEN** | `src/experiences/murcia/config/appConfig.ts:95` is still `/^\/(?!\/)/.test(model)`; the identical regex is present in the deployed Murcia chunk. Guarded by `DEBUG_TOOLS_ENABLED` (`appConfig.ts:73`), which is `false` on production: headless load of the live site with `?model=/\evil.invalid/x.glb&debug=1&stats=1&debugNavigation=1` made **one** origin of requests (own) and showed no overlay. Reachable on every Vercel Preview by design. |
| SEC-2 CSP never enforced | Security | **OPEN — now verified ready** | Live header is still `Content-Security-Policy-Report-Only` (identical to `vercel.json:16`, which is byte-identical at HEAD and in the tree). Headless Chromium walked intro → Earth → Murcia city load on `/` and `/debug`: **0 `securitypolicyviolation` events**, 0 page errors, 34 requests all to the own origin. No `report-uri`/`report-to` is set, so violations are visible only in a devtools console. |
| SEC-3 `__vertigoBootDebug` / `__vertigoIntro ??=` | Accepted | **OPEN (accepted)** | `src/intro-draw/boot.ts:118-136` unchanged and unconditional; present in the live intro chunk. Read-only getters. No HTML sink exists to clobber it with. |
| SEC-4 two `innerHTML` sinks | Accepted | **OPEN (accepted), no new sinks** | `overlays.ts:85` (static literals), `DebugOverlay.ts:88-114` (numbers only, behind `?debug=1` + debug tools). Full grep of `src/` for every HTML/script/style sink: 6 hits, all static/numeric; `dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write`, `insertAdjacentHTML`, `srcdoc`: 0. |
| SEC-5 HSTS / COOP / CORP absent | Accepted | **Partly DISSOLVED** | Live response carries `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — added by the platform, not by `vercel.json`. COOP/CORP still absent (accepted). |
| DEP-1 nine build-tooling advisories | Supply chain | **OPEN, reduced 9 → 7** | `npm audit`: vite 5.4.21 ×3 (GHSA-fx2h-pf6j-xcff high, GHSA-v6wh-96g9-6wx3, GHSA-4w7w-66w2-5vf9), esbuild 0.21.5 (GHSA-67mh-4wv8-2f99), potrace→jimp→phin 2.9.3 (GHSA-x565-32qp-m3vf ×3 entries). **Resolved:** nanoid (now 3.3.18), postcss (8.5.26). `npm audit --omit=dev` → **0**. |
| API-1 `content.rendered` HTML | Blocking (future) | **FIXED (verified)** | `content/lib/html.ts:109-129` strips tags first (`:113-116`, then a residual-`<` sweep at `:122`) and decodes entities last (`:128`); `plainTextProblem` (`:153-158`) fails the build on residue (`content/lib/validate.ts:57-59`). Every consumer is a text sink (CasePanel JSX text, districtPanel `textContent`, atlas `fillText`). |
| API-2 SSRF via audit form `website` | Blocking | **OPEN, unchanged** | `src/components/AuditSection.tsx:185` regex unchanged; form still has no backend. Production transport **rejects**: `src/app/auditSubmission.ts:44-47`; demo transport resolves after 700 ms elsewhere (`:49-52`). Belongs to the endpoint workstream. |
| API-3 no server-side controls on the form | Blocking | **OPEN, unchanged** | Still no `maxLength` on any field (0 hits in `src/`), no consent control (contact form has a text note + legal-panel button, `ContactSection.tsx:261-270`; audit form none), legal texts are placeholders (`src/content/site.ts:36-58`). Nothing leaves the browser in any build. |
| API-4 CSP blocks the CMS | — | **DISSOLVED (confirmed)** | 0 runtime `fetch`/XHR/WebSocket/beacon/Worker-from-URL in `src/`; live site contacts one origin. |
| API-5 a rewrite is a security boundary | — | **DISSOLVED for content** | `vercel.json` still has exactly one rewrite (`/debug`). Advice stands for the future form endpoint. |
| API-6 CMS logo URLs reach `img.src` | — | **FIXED at the mapper — with a gap (new SEC-6)** | Remote URLs → `null` (`content/collections/caseStudies.collection.ts:147-151`). But the "local path" test is `LOCAL_MEDIA_PATH = /^\/[\w./-]+$/` (`src/content/invariants.ts:55`), which accepts protocol-relative `//host/x.png`. |
| API-7 render path trusts its data | — | **FIXED (verified)** | Every field bounded at `content/collections/*` + `src/content/invariants.ts:83-170` (lengths, arity, `hexColor`, finite numbers, `CHART_VALUES_MAX = 16`); orbit pairing by id (`orbitAssignments.ts`). |
| API-8 a fetch is a new boot failure mode | — | **DISSOLVED (confirmed)** | No runtime fetch; the build has a per-request `AbortController` deadline (`content/lib/source.ts:185-202`). |
| GIT-2 the deployable tree is not on GitHub | P0 (process) | **OPEN** | `git status`: ~167 entries uncommitted/untracked; `origin/main` = `a207f2b`. The live site is that old commit (pre-pipeline, static `src/data/caseStudies.ts`). |
| CMS-1 WP logo would fail the production build | P1 | **FIXED (verified)** | mapper degrades to `null`, test `collections.test.ts:60-72`. Media mirror still **unbuilt** (`remoteMediaUrl` in `validate.ts:178` has no caller; `public/logos/` holds only `.gitkeep`). |
| CMS-2 production silently fell back to fixtures | P1 | **FIXED for omission — OPEN for commission (new SEC-7)** | `scripts/build-content.ts:66-72` fails when production names no source. But `:52-53` returns an explicit `CONTENT_SOURCE` of `fixture` **before** that guard, with no banner. |
| CFG-1 `WP_TIMEOUT_MS` non-numeric | P3 | **FIXED (verified)** | `build-content.ts:78-84` rejects non-finite and ≤ 0. (Very large finite values still clamp to 1 ms in Node — self-inflicted build failure only; noise.) |
| ASSET-3 `city-backdrop.glb` unreferenced | P2 decision | **OPEN** | untracked, unreferenced; yours to call. Not a security item. |
| BUDGET-1 entry chunk headroom | P2 | **OPEN** | unchanged; not a security item. |
| OBS-1 no production error signal | launch blocker | **OPEN** | no analytics/telemetry/error reporting in `src/` (0 hits). Its arrival will be the first external origin. |

---

## 1. Executive Security Assessment

**Classification: Generally safe with identifiable weaknesses.**

The evidence for "generally safe" is unusually concrete because the site is live and could be measured:

- **No secret exists** in the working tree, in ignored build output, in `dist/`, in the deployed bundle,
  or in any of the 36 commits. `.env.example` carries names only; no `.env*` was ever committed.
- **The browser contacts one origin — its own.** Verified three ways: grep of `src/` (0 network
  primitives), grep of the deployed bundle (no CMS host, no `VITE_`, no `WP_`, no local paths, no
  sourcemaps), and a headless run of the live site (34 requests, 1 origin, 0 CSP violations).
- **Content is text-only end to end.** CMS HTML is stripped at build time, bounds-checked, serialised
  with `JSON.stringify` (U+2028/9 escaped), written transactionally, and rendered only through JSX text,
  `textContent` and canvas `fillText`. There is no HTML sink fed by data anywhere.
- **Debug tooling is gated on a compile-time environment literal** and the gate holds on the live
  production build (no overlay, no query overrides, demo form transport replaced by a rejecting one).
- **The production dependency tree has zero advisories**; the seven open ones are dev-server or dead
  tooling.
- **Headers are what `vercel.json` says** plus platform HSTS; nothing sensitive is reachable
  (`/.env`, `/.git/HEAD`, `/package.json`, `/vercel.json`, `/docs/`, `/src/…`, `*.map` → 404).

The "identifiable weaknesses" are real but narrow, and none is a P0/P1:

- Four **P2** items, all cheap: the `?model=` guard (SEC-1, preview-only, known), a two-character
  bypass of the logo "local path" rule (SEC-6), `CONTENT_SOURCE=fixture` honoured silently in
  production (SEC-7), and no `https:` enforcement on the CMS base URL with the URL echoed into build
  logs (SEC-8). Each is a one-line fix with an obvious test.
- One **organisational P2** (ORG-1): the site is live and **publicly indexable** (`robots.txt`
  `Allow: /`, a sitemap, canonical on the real origin) while serving the six fictional case studies on
  real brands — the exact state the readiness audit classified as "NOT READY to publish" — and neither
  audit knew the deployment existed. That is not a technical vulnerability; it is the project's
  deployment state not being tracked, which is how production mistakes happen.
- The CSP is still Report-Only (SEC-2) — but it is now *measured* clean and can be promoted.

Nothing found is exploitable by an anonymous visitor against the production deployment today.

---

## 2. Threat Model

**Assets.** The marketing site's integrity and availability (a single origin serving static HTML,
JS, WASM decoders, GLB models, textures); the Vercel project (build + deploy authority); the GitHub
repository (source of truth for deploys, private); the future WordPress install and its read-only
credential; the brand's reputation (content shown under real brand names); visitors' personal data
once the forms are wired (today: none collected).

**Public surfaces.** `/` and `/debug` (one HTML file, `vercel.json` rewrite), everything under
`public/` (~7.9 MB of models/textures/decoders, cacheable, and — observed — served with
`Access-Control-Allow-Origin: *`), `robots.txt`, `sitemap.xml`. No API, no serverless/edge function,
no form endpoint, no cookies, no storage.

**Execution contexts.**
- *Browser* — React + Three.js; Draco/Basis workers from `blob:`/`'wasm-unsafe-eval'`; no third-party
  script; no analytics.
- *Build (Node on Vercel)* — `npm run build` = `content:build` → typecheck → 593 tests → 7 harnesses →
  `vite build`. `content:build` is the **only** step that may open a network connection (outbound
  HTTPS to the CMS when `WP_CONTENT_BASE` is set) and may hold a credential (`WP_AUTHORIZATION`). It
  writes `src/content/generated/` (gitignored) which is compiled into the bundle.
- *Server-side at runtime* — nothing.

**Content sources.** WordPress REST (future), `content/fixtures/` (committed, default for local +
Preview), `content/seed/` (committed, explicit emergency source with banner). Fixtures and seed are
currently byte-identical.

**External services.** Vercel (hosting, TLS, build), GitHub (repository, deploy trigger via Git
integration — no `.github/` workflows), npm registry (all 366 lockfile entries resolve to it), the
future WordPress host. No CDN, no font host, no analytics.

**Environment variables / credentials.** All build-time, documented in `.env.example`:
`WP_CONTENT_BASE`, `WP_AUTHORIZATION`, `WP_TIMEOUT_MS`, `CONTENT_SOURCE`, plus Vercel system
`VERCEL_ENV` / `VERCEL_PROJECT_PRODUCTION_URL` (exposure verified enabled on the live project: robots
`Allow`, canonical on the project URL), the local `VITE_VERCEL_ENV` and the never-set
`VERTIGO_SKIP_BUDGETS`. No runtime env read anywhere in `src/`.

**Administrative surfaces.** Vercel dashboard, GitHub repo settings, WordPress admin (future), the
`/debug` tuning console (compiled out of production; live on every Preview).

**Attacker classes and what they can reach.**

| Attacker | Reach today |
|---|---|
| Anonymous visitor / bot | static files; query params are inert in production; forms send nothing |
| Malicious embedding site | blocked — `X-Frame-Options: DENY` + `frame-ancestors 'none'`; assets are CORS-readable (`*`) |
| Supply-chain attacker | npm only; build runs devDependencies + install hooks (esbuild's only) on Vercel |
| Compromised developer account / repo access | push to `main` → production (no branch protection observable from the repo, no CI gate beyond the build) |
| Vercel access / env-var access | can set `CONTENT_SOURCE`, `WP_*`, disable system env exposure → see SEC-7, SEC-9 |
| Compromised CMS / malicious author | bounded: text-only fields, validated; logo path is the weakest field (SEC-6) |
| Accidental developer mistake | the main vector — see §7 |

**Trust boundaries.** (1) CMS response → mapper/validator (`content/lib`, `content/collections`) —
the only place external data enters; (2) build env vars → `scripts/build-content.ts` `chooseMode()` /
`vite.config.ts` `BUILD_ENV` — decides what a build *is*; (3) the compiled bundle → browser (public);
(4) `git push main` → production.

---

## 3. Security Findings

IDs continue the existing scheme. Each finding is labelled **Confirmed vulnerability / Likely
vulnerability / Security weakness / Hardening opportunity**.

### P0 — Critical

None.

### P1 — High

None.

### P2 — Medium

---

**SEC-1 · `?model=` same-origin guard bypassable with a backslash** — *Confirmed vulnerability (preview builds only)* — carried from 08-11, unchanged

- *Evidence:* `src/experiences/murcia/config/appConfig.ts:95` `/^\/(?!\/)/.test(model)`. A value whose
  second character is `\` (or `%5C`) passes and the WHATWG parser resolves it against another host.
  The same regex is present in the deployed Murcia chunk.
- *Attack surface:* any build with `DEBUG_TOOLS_ENABLED` = true — dev, `vite preview`, **every Vercel
  Preview URL** (`src/app/buildFlags.ts:24-38`). Not production (verified live).
- *Exploitation path:* share a crafted Preview link → the visitor's browser fetches and Draco-decodes
  a third-party GLB. CSP is Report-Only so `connect-src 'self'` does not block it.
- *Required capability:* a Preview URL + a victim who opens the link. *Impact:* asset substitution
  and a request to an attacker host from the victim's browser; binary-parser surface; no script
  execution. *Likelihood:* low (previews are unlisted), but the fix is trivial.
- *Remediation:* compare `new URL(model, location.origin).origin === location.origin` and restrict to
  `/models/`; keep the `console.warn`. *Complexity:* trivial. *Verification:* unit test with `/\h/x`,
  `/%5Ch/x`, `//h/x`, `https://h/x` all rejected; `/models/x.glb` accepted.

---

**SEC-6 · `LOCAL_MEDIA_PATH` accepts protocol-relative URLs** — *Security weakness* — new

- *Evidence:* `src/content/invariants.ts:55` `LOCAL_MEDIA_PATH = /^\/[\w./-]+$/` — verified:
  `//evil.example/a.png` → `true`. It is the only check between a CMS `logo` value and `img.src`
  (`content/collections/caseStudies.collection.ts:147-151` → generated module →
  `src/experiences/earth/orbit/createBrandAtlas.ts:311-313, 213`). The comment above the regex states
  the property it is meant to guarantee ("an absolute URL here would mean an outbound request from
  every visitor"); the code does not guarantee it.
- *Attack surface:* the CMS field `logo` (compromised WP install or malicious author), once WordPress
  is wired. Today every fixture/seed logo is `null`, and the live build predates the pipeline, so
  **not reachable today**.
- *Exploitation path:* set `logo` to `//tracker.example/p.png` → every visitor's browser requests it
  (`crossOrigin='anonymous'`; the canvas taint probe still protects the atlas). Privacy/policy issue,
  not code execution; CSP `img-src 'self'` would only *report*.
- *Required capability:* CMS write access. *Impact:* visitor tracking / CSP violation. *Likelihood:*
  low until the CMS exists; then medium (it is the one field that is a URL).
- *Remediation:* `^\/(?!\/)[\w./-]+$` (or parse with `new URL(v, 'https://x')` and require
  `origin === 'https://x'`), plus a test with `//h/x`. Same fix shape as SEC-1 — do both together.
  *Complexity:* trivial. *Verification:* `collections.test.ts` rejects `//h/x` → `logo: null`.

---

**SEC-7 · `CONTENT_SOURCE=fixture` is honoured silently in production** — *Security weakness (fail-open by commission)* — new

- *Evidence:* `scripts/build-content.ts:52-53` returns an explicit `wp|fixture|seed` **before** the
  production guard at `:66-72`. `seed` prints a five-line banner (`:93-99`); `fixture` prints only
  `[content] content source: fixtures (...)`. `docs/content/wordpress-field-contract.md:133` states
  "Production: `seed` is the only way to deploy without WordPress" — the code does not enforce that.
- *Attack surface:* anyone with Vercel env-var access, or an operator following a stale note.
- *Exploitation path / impact:* a green production deployment serving demo content (real brand names,
  invented metrics) announced by one log line. The same outcome CMS-2 was written to prevent.
- *Required capability:* Vercel project access. *Likelihood:* low-medium (it is the obvious thing to
  type when `seed` "seems wrong").
- *Remediation:* in production, reject `fixture` (`fail(...)`), or treat it exactly like `seed`
  (banner). Prefer rejection: the doc already says seed is the only escape hatch. *Complexity:*
  trivial. *Verification:* `VERCEL_ENV=production CONTENT_SOURCE=fixture npm run content:build` → exit 1.

---

**SEC-8 · No `https:` enforcement on `WP_CONTENT_BASE`; the base URL is echoed into build logs** — *Security weakness* — new

- *Evidence:* `content/lib/source.ts:106` only strips trailing slashes. `http://` is accepted and
  `Authorization` (`:192`) is then sent in clear. A base containing userinfo (`https://user:pass@host`)
  is accepted and printed twice — in the banner (`content/lib/generate.ts:65` → `source.ts:109`
  `describe`) and in every request error (`source.ts:197,199`, which embed the full URL) — into the
  Vercel build log. Node's own error text for a malformed `Authorization` header value echoes the
  value (`source.ts:199` wraps `String(error)`).
- *Attack surface:* operator misconfiguration; anyone who can read Vercel build logs.
- *Impact:* credential disclosure (in transit or in logs). *Likelihood:* low (documented as
  `https://…` and as a header), but there is nothing stopping it.
- *Remediation:* parse the base with `new URL`, require `protocol === 'https:'`, reject non-empty
  `username`/`password`; log `url.origin + pathname` rather than `url` in errors; never interpolate
  `String(error)` from the fetch layer without stripping the URL. *Complexity:* small.
  *Verification:* tests for `http://`, `https://u:p@h`, and a CR in the header value all fail before
  any request.

---

**ORG-1 · The site is live and indexable in a state both audits classed as not publishable, and neither audit knew** — *Organisational weakness* — new

- *Evidence:* `https://vertigo-marketing-website.vercel.app/` → 200, `Last-Modified: 2026-08-14`,
  `robots.txt` = `Allow: /` + `Sitemap:`, canonical/og:url on that origin, **no** `noindex`; the
  deployed bundle contains the six fictional case studies on real brands (Mango, Cabify, Estrella
  Galicia, Idealista, Camper, Freixenet) and the placeholder phone/legal texts. The 08-20 readiness
  report: "Preview deployment — NOT RUN — nothing pushed yet"; 08-11 security: "No Preview or
  Production exists".
- *Why it is a security finding:* production state that the project does not track is the precondition
  for every "accidental production change" in the brief's objective list (items 15–16). It also means
  the first commit of the working tree will flip production to the content pipeline (and will **fail**
  the build unless `CONTENT_SOURCE=seed` or `WP_CONTENT_BASE` is set in Vercel Production — CMS-2).
- *Impact:* reputational/legal (fictional metrics under real brand names, indexable), plus the
  operational blind spot. *Likelihood:* already the case.
- *Remediation:* decide now whether the current deployment should stay public (it is the user's call —
  the memory note records the fictional content as deliberate WIP); if not, either set the Vercel
  project to password/Deployment Protection or push a build with `noindex` until CONTENT-1 is done;
  record the deployment URL and state in `docs/` (the readiness runbook) so the next audit starts from
  it; add a "is there a deployment?" probe to the audit briefs (see Brief gaps). *Complexity:* small.

### P3 — Low

---

**SEC-2 · CSP is Report-Only, without a report endpoint** — *Hardening opportunity* — carried; now measured

Live header identical to `vercel.json`. Headless run: **0 violations** through intro → Earth → Murcia.
Promotion to `Content-Security-Policy` can proceed on the next Preview with no edits to the policy
(`blob:` + `'wasm-unsafe-eval'` for workers, `'unsafe-inline'` only for `style-src` — `index.html:46-53`
and `introDraw.ts:79`; no inline scripts). Until OBS-1 lands there is no `report-to`, so any future
violation is invisible unless someone opens devtools — accept that, or pair the promotion with OBS-1.

---

**SEC-9 · Environment detection fails open to "development" in two places** — *Security weakness* — new

`vite.config.ts:198` `BUILD_ENV = VERCEL_ENV ?? VITE_VERCEL_ENV ?? 'development'` and
`scripts/build-content.ts:66` `if (VERCEL_ENV === 'production')`. If the Vercel "expose system
environment variables" toggle is ever switched off, a production build ships debug tools, the demo
form transport (fake "received"), `Disallow: /`, and the content-source guard cannot fire. **Verified
enabled today** (robots `Allow`, canonical on the project URL), which is why this is P3 and not P2.
Remediation: make the build refuse when `VERCEL` is set but `VERCEL_ENV` is not (Vercel always sets
`VERCEL=1`), i.e. eliminate the state rather than document it. Trivial.

---

**SEC-10 · Every response carries `Access-Control-Allow-Origin: *`** — *Hardening opportunity* — new (observed live)

Not set by `vercel.json`; platform-supplied on static output. Effect: any origin can `fetch()` the
HTML, sitemap, 7.9 MB of models/textures and the decoders. Nothing served is confidential, so the
impact is hotlinking/bandwidth and a slightly larger footprint for a future same-origin assumption.
If unwanted, set an explicit `Access-Control-Allow-Origin` for the asset paths in `vercel.json`
(omit or pin to the production origin). Low priority; record the decision in DECISIONS.

---

**DEP-1 · Build-tooling advisories** — *Hardening* — carried, reduced (see §5)

---

**SEC-11 · Debug/diagnostic code ships in the production Murcia chunk, gated at runtime** — *Hardening opportunity* — new

The production bundle still contains `applyQueryOverrides` (with the `?model=` regex), the
`DebugOverlay`, `MurciaDebugTools` and the `stats.js` panel (a *production* dependency, imported only
by `src/experiences/murcia/debug/MurciaDebugTools.ts:2`). `DEBUG_TOOLS_ENABLED` is emitted as
`environment() !== 'production'` rather than a folded literal, so the minifier cannot drop the
branches. Gate verified to hold live. Cost: bundle bytes and a larger surface for a future gating
mistake. Remediation: define `__VERTIGO_DEBUG__` as a boolean literal in `vite.config.ts` `define`
so dead branches fold, and move `stats.js` to devDependencies (or import it dynamically behind the
gate). Small.

---

**SEC-12 · Forms: no `maxLength`, no consent control, placeholder legal texts** — *Hardening* — carried (API-3 subset)

Harmless while both transports never send (`auditSubmission.ts:44`, `contactSubmission.ts`), and the
code comments already record the obligation. Must land in the same change as the endpoint, with the
server-side controls in API-2/API-3.

---

**SEC-13 · Build log echoes CMS values on validation failure** — *Hardening* — new

`content/lib/validate.ts:72,101,147,159,191` include the offending slug/number/colour/URL in the
message; text contents are never printed. Build logs are visible to anyone with Vercel access. Not
secrets, but when the CMS is real, unpublished values can land in logs. Print field path + reason,
value only when bounded and non-text (already the case for text). Trivial.

---

**SEC-14 · Emitter escaping is correct but untested** — *Hardening* — new

`content/lib/emit.ts:60-69` uses `JSON.stringify` and escapes U+2028/U+2029; no test feeds U+2028,
backticks, `${`, quotes or `</script>` through the emitter and re-parses the module. Add one
(`generate.test.ts`). Trivial.

---

**SEC-15 · `docs/audits/reports/` is a roadmap if the repository's visibility changes** — *Organisational* — carried from the README rule

The reports now include IP examples and validator-bypass details (08-11, §API-2) and this file's own
SEC-1/6/7/8. Fine while private; the README's "extract first" rule must be executed before any
client hand-over or mirror. No values or exploits are present (harness + manual review, §9).

---

## 4. Secret Exposure Report

| Item | Where | Class | Action |
|---|---|---|---|
| Any credential value (keys, tokens, passwords, JWTs, PEM, cookies, `user:pass@`) | working tree incl. `docs/`, `public/`, `dist/`, `coverage/`, `src/content/generated/`, `.claude/`; all 36 commits (`git log --all -p` pattern sweep); deployed bundle | **none found** | none |
| `.env*` files | only `.env.example` on disk, all values empty; no `.env*` ever added to history (`git log --all --diff-filter=A`) | compliant | none |
| `VITE_VERCEL_ENV` | `.env.example:35`, `vite.config.ts:198` | public by design (environment label) | none |
| Placeholder CMS hosts (`cms.example.com`, `cms.test`, `example.wordpress.com`) | `content/lib/source.ts:62`, `scripts/build-content.ts:104`, tests, docs | public by design | none |
| Brand contact e-mail and `+34 600 000 000` | `src/content/site.ts:20-22`, `AuditSection.tsx:105` | placeholder, public by design | swap before launch (CONTENT-1) |
| Repo owner's GitHub handle | `docs/audits/reports/production-readiness-vercel-2026-08-20.md:23` | public by design | none |
| `.claude/settings.json` (tracked) | plugin enablement only | restricted but safe | optional `.gitignore` |
| Absolute local path | 2 files under ignored `coverage/`, `test-results/` | never leaves the machine | none |
| Potential future exposure: `WP_AUTHORIZATION` | via SEC-8 (http base / userinfo URL / malformed header echoed in logs) | not exposed today — no value exists | fix SEC-8 before the credential exists |

No rotation and no history remediation is required.

---

## 5. Supply-Chain Assessment

**Dependency risk.** `npm audit`: 7 advisories (1 high, 6 moderate), **0 against the production tree**
(`npm audit --omit=dev` = 0; react 19.2.7, react-dom 19.2.7, three 0.174.0, @react-three/fiber 9.6.1,
gsap 3.15.0, stats.js 0.17.0 and their transitives clean).

| Advisory | Package | Exposure class |
|---|---|---|
| GHSA-fx2h-pf6j-xcff (high) `server.fs.deny` bypass, Windows | vite 5.4.21 | developer machine, `npm run dev` only |
| GHSA-v6wh-96g9-6wx3 launch-editor NTLM, Windows | vite 5.4.21 | developer machine |
| GHSA-4w7w-66w2-5vf9 optimized-deps `.map` traversal | vite 5.4.21 | developer machine |
| GHSA-67mh-4wv8-2f99 dev-server CORS | esbuild 0.21.5 | developer machine (the repo uses esbuild only as a CLI bundler; the Vite dev server is the practical exposure) |
| GHSA-x565-32qp-m3vf headers across redirect | phin 2.9.3 ← jimp 0.14 ← potrace 2.1.8 | purely theoretical: `potrace` is used once by `scripts/trace-isotype.mjs` on a local file; output already committed; no upstream fix |

All four vite/esbuild items need the vite major (6.4.3+, practically 7/8 with `@vitejs/plugin-react`,
`vitest` 4, `vite-plugin-glsl`) — DEP-1's scheduled upgrade, unchanged. The phin chain clears only by
removing `potrace` from `devDependencies` (recommended: it is a one-off tool). Until the upgrade: do
not browse untrusted sites while `npm run dev` is bound on Windows.

**Lockfile.** v3, byte-identical to HEAD, consistent with `package.json`; all 366 entries resolve to
`registry.npmjs.org`; no git/tarball deps; no `overrides`. Extraneous `sharp` tree on this machine
(from the documented `npm i --no-save sharp` workflow in `scripts/prepare-*.mjs`) is not in the
lockfile and does not reach Vercel.

**Install hooks.** Only `esbuild` (`postinstall: node install.js`, pinned registry tarball fallback)
and macOS-only `fsevents`. All `prepare` scripts in the tree are inert for registry installs.
Playwright does not auto-install browsers. Nothing surprising.

**Package scripts.** Every harness and `content:build` is `esbuild <local .ts> → node_modules/.cache →
node`; no remote fetch, no `child_process`, no mutable URL. The only network path in the build is the
outbound CMS fetch in `content:build` (SEC-8). `npm run build` runs the whole gate on Vercel; e2e is
off the deploy path. `scripts/*.mjs` are hand-run asset tools: local files only.

**Health.** `stats.js` and `potrace` have had no release since mid-2022 (stable vs. abandoned —
`stats.js` is in the prod tree, see SEC-11). `vite-plugin-glsl` 1.3.3: single maintainer, source
reviewed (file reader + `@rollup/pluginutils`), no network/exec. No typosquat: every name resolves to
its canonical repository.

**CI/CD.** No `.github/`; deployment is Vercel's Git integration on `main`. Branch protection,
required reviews and who can push are **not observable from the repo** (§9). Today a push to `main` by
any collaborator is a production deploy, gated only by the build's own tests.

**Third-party runtime.** None. Zero external scripts, fonts, images or endpoints (index.html, bundle,
live network trace).

---

## 6. Deployment Security Assessment

| Area | State (verified live unless noted) |
|---|---|
| Deployment | production at `vertigo-marketing-website.vercel.app`, built 2026-08-14 from `a207f2b`; `vertigo-marketing-web.vercel.app` (the code's fallback host) → `DEPLOYMENT_NOT_FOUND` |
| Build path | production-path build confirmed: robots `Allow: /` + sitemap, canonical/og:url on the project URL, no `noindex`, debug overlay absent, query overrides inert → system env vars **are** exposed |
| Headers (`/`, `/assets/*`, `/draco/*.wasm`, `/models/*.glb`, `/sitemap.xml`) | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic/geo/payment/usb/interest-cohort off), `Content-Security-Policy-Report-Only` (SEC-2), `Strict-Transport-Security` (platform, 2 y, preload), `Access-Control-Allow-Origin: *` (platform, SEC-10). `Cache-Control` immutable on `/assets/`, 1 day + SWR on asset dirs, `max-age=0, must-revalidate` on HTML/sitemap. `.wasm` → `application/wasm`. COOP/CORP absent (accepted) |
| Public files | `public/` = 30 files (models, textures, decoders, `logos/.gitkeep`); no `.map/.log/.json/.md/.bak/source`. `dist/` (local, ignored) = no sourcemaps; `build.sourcemap` unset (false) |
| Sensitive paths | `/.env`, `/.env.example`, `/.git/HEAD`, `/package.json`, `/vercel.json`, `/tsconfig.json`, `/docs/…`, `/src/…`, `/content/…`, `/index.html.map` → all 404 |
| Routes | `/` and `/debug` (rewrite; `/debug/` 404s — cosmetic); no other rewrites, no functions, no redirects |
| Environment separation | Preview builds keep debug tools + demo form transport by design; production drops both. Env vars: see §2. Preview scoping of `WP_*` and `CONTENT_SOURCE` is a dashboard setting — **not verifiable from the repo** |
| Production secrets during builds | `WP_AUTHORIZATION` is the only one; header-only; not in bundle/public/generated (verified by design and by grep of the current build) — SEC-8 is the log path |
| Preview deployments | no Preview currently exists (only `main` on the remote); when one does, SEC-1 applies and its URL should be treated as semi-public |
| Deployment permissions | Vercel Git integration; no repo-side evidence of branch protection or deploy hooks; Deploy Hook URL (when created) must be treated as a secret (`wordpress-field-contract.md:149`) |
| Next push consequence | the working tree's build **requires** `CONTENT_SOURCE=seed` or `WP_CONTENT_BASE` in Production (CMS-2) — set it before committing, or the first deploy fails by design |

---

## 7. Organizational / Structural Security Risks

1. **Untracked production state (ORG-1).** Two audits in one week stated no deployment existed while one
   was live and indexable. Nothing in the repo records the project URL, which branch deploys where,
   or whether Deployment Protection is on. Fix: a short "Deployments" section in the readiness
   runbook (URL, branch, protection, last promoted commit), updated on every promote.
2. **The deployable tree lives only on one machine (GIT-2).** ~167 uncommitted entries including the
   whole content pipeline and the CMS-1/CMS-2 fixes; the live site is a different project from the
   working tree. A disk failure is a security event here (loss of the only copy of the validation
   layer).
3. **Two environment-shaped fail-opens in two files (SEC-7, SEC-9)** plus `VERTIGO_SKIP_BUDGETS`:
   three "never set this" rules documented in `.env.example` instead of being made impossible. Prefer
   refusing states to documenting them.
4. **Documentation leads the code.** `wordpress-field-contract.md:133` promises a rule the code does
   not enforce (SEC-7); `invariants.ts:50-54` and `appConfig.ts:90-93` comments claim properties the
   regexes do not have (SEC-6, SEC-1). Comments are not checks; the project already has the right
   reflex (`checks/architecture.ts`, `checks/audit-hygiene.ts`) — point it at these.
5. **No second pair of eyes on the deploy path.** No CI outside the build, no branch protection
   observable, single maintainer. Acceptable for the size; record it as accepted risk rather than
   assumed protection.
6. **Manual env-var steps at the moment of CMS cut-over** (`CONTENT_SOURCE=seed` → `WP_CONTENT_BASE` +
   `WP_AUTHORIZATION`, Preview vs Production scoping) with no check that the scoping is right — the
   guard only exists for omission.
7. **`docs/audits/reports/` visibility** is governed by a README rule and a harness, not by the
   repository being structurally unable to leak them (SEC-15). Adequate while private; re-decide
   before any hand-over.

---

## 8. Remediation Plan

**Immediate (hours)**
1. Decide ORG-1: keep the 08-14 deployment public, or protect/`noindex` it until CONTENT-1. Record the
   deployment in the runbook.
2. Set `CONTENT_SOURCE=seed` in Vercel Production **before** committing the working tree (CMS-2), then
   commit + push (GIT-2).
3. SEC-1 + SEC-6 together: origin-compare `?model=`; `^\/(?!\/)` for `LOCAL_MEDIA_PATH`; tests for
   `\`, `%5C`, `//`.
4. SEC-7: reject `CONTENT_SOURCE=fixture` in production.
5. SEC-8: `https:`-only, no userinfo, redact URL in error strings.

**Short-term engineering (days)**
6. SEC-2: promote the CSP on the first Preview (policy unchanged), re-run the headless walk.
7. SEC-9: refuse a build where `VERCEL` is set and `VERCEL_ENV` is not.
8. SEC-11: fold `DEBUG_TOOLS_ENABLED` to a literal via `define`; move `stats.js` out of prod deps.
9. SEC-13 / SEC-14: log redaction for CMS values; emitter hostile-input test.
10. DEP-1: drop `potrace`; schedule the vite 7/8 major as its own pass.

**Architectural**
11. Form endpoint (API-2/API-3, SEC-12) as one change: server-side validation, SSRF controls, rate
    limiting, consent + privacy notice + retention.
12. Media mirror (`public/logos/`): origin allowlist by parsed origin, SVG reject, size cap, sniffed
    content-type; count `sharp` in the supply chain when it lands.
13. OBS-1 + `report-to` for the CSP as one deliberate first external origin.

**Operational**
14. Decide SEC-10 (ACAO `*`) and record it.
15. Turn the "never set" rules into checks; add a "Deployments" section and a deployment probe to the
    briefs; re-confirm the `docs/audits/reports/` extraction rule before any hand-over.

---

## 9. Verification Results and Not Verified

**Verified (executed in this pass)**

| Check | Result |
|---|---|
| `git rev-parse HEAD`, `git status`, `git remote -v` | `a207f2b`, ~167 entries, `origin` = GitHub `miguelvihto/vertigo-marketing-website` |
| Secret sweep of working tree (all dirs incl. `docs/`, `public/`, `dist/`, `coverage/`, generated, `.claude/`) with PEM/AWS/GitHub/Slack/Stripe/Google/JWT/Authorization/`user:pass@`/assignment/`VITE_` patterns | **0 credential hits**; placeholders and redaction examples only |
| `git log --all -p` with the same patterns; `git log --all --diff-filter=A` for `.env*`/key files | **0 hits**; no such file ever added; `src/content/generated/` never committed; `public/logos/` only `.gitkeep` |
| `ls -la .env*` | only `.env.example`, values empty |
| `git check-ignore -v` on `.env`, `.env.local`, `.env.production`, `.vercel/`, generated, `public/logos/*`, `coverage/`, `test-results/`, `dist/`, `*.tsbuildinfo`, `.codegraph` | all ignored |
| `npm audit --json`, `npm audit --omit=dev`, `npm ls`, `npm query` (install scripts), `npm view` (health), lockfile resolved-host scan | 7 advisories / 0 prod; lock consistent; registry-only; esbuild + fsevents hooks only |
| `curl -I` on `vertigo-marketing-website.vercel.app` (`/`, `/assets/*.js`, `/draco/*.wasm`, `/libs/basis/*.wasm`, `/models/*.glb`, `/sitemap.xml`) and `vertigo-marketing-web.vercel.app` | headers as in §6; fallback host `DEPLOYMENT_NOT_FOUND` |
| `curl` probes for `/.env`, `/.env.example`, `/.git/HEAD`, `/package.json`, `/vercel.json`, `/tsconfig.json`, `/docs/`, `/docs/audits/README.md`, `/src/main.tsx`, `/content/seed/case_study.json`, `/index.html.map`, `/debug`, `/debug/`, `/nonexistent` | all 404 except `/debug` (200, rewrite) |
| Deployed `robots.txt`, `sitemap.xml`, `index.html` (scripts/links/canonical/og:url) | production-path build; no external script/link; canonical on project URL |
| Deployed bundle (8 chunks downloaded): `*.map` → 404; grep for `sourceMappingURL`, `import.meta`, `VITE_`, `WP_`, `localhost`, local paths, usernames, `DEBUG_TOOLS`, URLs | 0 / 0 / 0 / 0 / 0 / 0 / 0; URLs = W3C namespaces, react.dev, gsap.com, pmnd docs, eso.org attribution link, `tuempresa.com` placeholder; `__vertigoBootDebug` present; `?model=` regex present; `stats.js` present in Murcia chunk; brand names present |
| Headless Chromium (project's Playwright, swiftshader) on `/`, `/debug`, `/?model=/\evil.invalid/x.glb&debug=1&stats=1&debugNavigation=1` — 15 s + wheel gestures | bootState `ready`; **0** `securitypolicyviolation`; 0 page errors; 34 requests, **1 origin**; no `#debug-overlay`; `localStorage`/`sessionStorage`/cookies = 0; console = WebGL driver warnings + two app `console.warn` (terrain/district diagnostics) |
| Source verification of every finding cited (`appConfig.ts:95`, `invariants.ts:55` + regex test, `caseStudies.collection.ts:147-151`, `build-content.ts:51-74`, `source.ts:106,185-202`, `emit.ts:60-69`, `html.ts:109-129`, `buildFlags.ts:24-38`, `vite.config.ts:198,285`, `auditSubmission.ts:42-56`) | as quoted in §0/§3 |
| `git diff HEAD -- vercel.json package-lock.json` | identical |
| `npm run check:audit` on this report | see below (run after writing) |

**Not verified**

- **Vercel dashboard state**: Deployment Protection, env-var scoping per environment, who has project
  access, build logs, Deploy Hooks. Needs dashboard or `vercel` CLI access.
- **GitHub settings**: branch protection, required reviews, collaborators, tokens. Needs repo admin.
- **CSP in *enforcing* mode**: only Report-Only was observed (0 violations); enforcement needs a
  Preview with the header switched.
- **The CMS and its credential**: no WordPress instance exists; SEC-8 and the media mirror were
  verified in code only; the build-time pull was not exercised against a live host.
- **Browsers**: only headless Chromium (software GL) was driven; Safari/Firefox/mobile not covered.
- **Dynamic analysis beyond the above**: no fuzzing, no SBOM beyond `npm audit`; `three`/React not
  audited as code.
- **A Preview deployment** (SEC-1 live reproduction): none exists on the remote.

**Brief gaps:** the brief names the output path inconsistently (`docs/audits/cybersecurity-project-security-<date>.md`
at "Before You Start" vs `docs/audits/reports/…` under Required Output — `reports/` is correct and
enforced by `check:audit`); it should also instruct the run to *enumerate deployments* (probe the
project's `*.vercel.app` hosts / dashboard) rather than assume none exists, and to record
platform-supplied headers (HSTS, `Access-Control-Allow-Origin: *`) as a separate line from `vercel.json`.
