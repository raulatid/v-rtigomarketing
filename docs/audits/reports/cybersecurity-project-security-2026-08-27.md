# Cybersecurity & Project Security Audit — 2026-08-27

```
Audited:  2026-08-27 · against commit 2f7d082 (main = origin/main, 74 commits) + 22 uncommitted
          entries (the one-service-per-building Murcia rework, deliberate WIP; nothing config- or
          pipeline-related among them)
Scope:    the whole repository (source, the Sanity content pipeline, the Sanity Studio package,
          config, docs, public/, ignored build output, all 74 commits of Git history), both
          installed dependency trees, the LIVE production deployment at
          vertigo-marketing-website.vercel.app (headers, bundle, headless runtime behaviour), and —
          new in this pass — the Sanity Content Lake as reached anonymously over its public API.
          Out of scope, deliberately: the Vercel dashboard, GitHub settings and Sanity project
          membership (none reachable from the repo); fuzzing; the hosted Studio UI itself.
          Read-only: no production code, configuration or brief was changed by this pass.
Baseline: docs/audits/reports/cybersecurity-project-security-2026-08-20.md, plus the security
          sections of docs/audits/reports/production-readiness-vercel-2026-08-20.md
```

This report **supersedes** `cybersecurity-project-security-2026-08-20.md` as the current security
result. The earlier report remains accurate for everything not restated here; where they disagree,
this one wins. It is the second run of the `cybersecurity-project-security` brief.

**What changed the surface since 08-20.** Three things, all verified rather than read from notes:

1. **The CMS is Sanity, not WordPress** (ADR 011, commits `ddd7bee`…`1d0f8f6`). The build now
   reads a Sanity dataset through one GROQ request per collection, the brand-logo media mirror
   that 08-20 recorded as "unbuilt" exists (`content/lib/mirror.ts`), six collections replace two,
   legal text and blog posts arrive as constrained Portable Text, and a second npm package —
   `sanity-studio/` — is the editorial admin surface, hosted by Sanity. Every `WP_*` variable is
   gone and a leftover one fails the build by name.
2. **The working tree is on GitHub and deployed.** GIT-2 is closed: `main` is linear, pushed, and
   production was rebuilt from `dcaca0c` on 2026-08-27 09:05 UTC. The 22 uncommitted entries are
   the Murcia service-building rework, none of them configuration.
3. **The dataset the build reads is world-readable, on purpose** — and this pass measured what
   that means (§2, ORG-2).

Nothing found is exploitable by an anonymous visitor against the production deployment today.
The 08-20 classification stands, with fewer open items and one new organisational one.

---

## 0. Status of Prior Findings

| ID | Prior severity | Status now | Evidence |
|---|---|---|---|
| SEC-1 `?model=` same-origin guard bypassable with `\` | P2 (preview-only) | **OPEN** | `src/experiences/murcia/config/appConfig.ts:95` still `/^\/(?!\/)/.test(model)`; the identical regex is in the live Murcia chunk. Gate verified live: `/?model=…&debug=1&stats=1&debugNavigation=1&sky=c&holo=1` → 1 origin of requests, no overlay, no page error. Reachable on every Vercel Preview by design. The project already knows the correct fix — `remoteMediaUrl` (`content/lib/validate.ts:190-232`) cites SEC-1 by name and parses the URL instead — it just has not been applied here. |
| SEC-2 CSP never enforced | P3 | **OPEN — still measured clean** | Live header is still `Content-Security-Policy-Report-Only`, byte-identical to `vercel.json:16`, which is unchanged since `a207f2b`. Headless walk of the 08-27 build: **0** `securitypolicyviolation` events on `/` and on the crafted-query URL; 1 origin; 0 page errors; storage and cookies empty. |
| SEC-3 `__vertigoBootDebug` | accepted | **OPEN (accepted)** | Present in the live intro chunk, read-only getters, unchanged. |
| SEC-4 two `innerHTML` sinks | accepted | **OPEN (accepted), no new sinks** | `overlays.ts:85` (static literals), `DebugOverlay.ts:88` (numbers, gated). Full grep of `src/` for HTML/script/style sinks, `eval`, `new Function`, `document.write`, `srcdoc`, `dangerouslySetInnerHTML`: the same two hits and nothing else. The one new renderer of CMS structure (`LegalPanel.tsx`) is an explicit block→element switch over typed data. |
| SEC-5 HSTS / COOP / CORP | accepted | **unchanged** | HSTS platform-supplied (2 y, preload); COOP/CORP absent. |
| SEC-6 `LOCAL_MEDIA_PATH` accepts `//host` | P2 | **FIXED (verified)** | `src/content/invariants.ts:73` is now `/^\/(?!\/)[\w./-]+$/`; `//evil.example/a.png` → `false`. |
| SEC-7 `CONTENT_SOURCE=fixture` honoured silently in production | P2 | **OPEN — survived the migration** | `content/lib/config.ts:66` returns an explicit `fixture` **before** the production guard at `:70-76`. Only `seed` gets the banner (`scripts/build-content.ts:66-73`). `docs/content/sanity-field-contract.md:222` still describes seed as the only escape hatch. `config.test.ts` has no case for it. |
| SEC-8 no `https:` enforcement on the CMS base; URL echoed in logs | P2 | **DISSOLVED** | There is no configurable base any more. `content/lib/sanity.ts:99` hardcodes `https://<projectId>.api.sanity.io`, and the project id / dataset are pattern-asserted (`:56-57`) before they reach a URL, so neither a scheme downgrade nor a host substitution is expressible. The credential (when one exists) is a header, never in the URL; `describeError` (`:200`) deliberately never prints the URL. Residual: `withTimeout` (`source.ts:82-85`) still embeds the request URL in timeout/network errors — that URL carries the GROQ query and dataset name, not the token. |
| SEC-9 environment detection fails open to "development" | P3 | **OPEN** | `vite.config.ts:221` `VERCEL_ENV ?? VITE_VERCEL_ENV ?? 'development'`; `config.ts:70` `env.VERCEL_ENV === 'production'`. No `process.env.VERCEL` guard anywhere. Exposure verified still enabled (robots `Allow: /`, canonical on the project URL). |
| SEC-10 `Access-Control-Allow-Origin: *` | P3 | **OPEN (undecided)** | Still on every response, platform-supplied. Not in DECISIONS. |
| SEC-11 debug code ships in production, gated at runtime | P3 | **PARTLY FIXED** | `vite.config.ts:305-308` now defines `__VERTIGO_ENV__` as a literal. But `buildFlags.ts:27-38` reads it through a function — the live entry chunk contains `function Tg(){return"production"}const xg=Tg()!=="production"` — and esbuild does not fold through a call, so `applyQueryOverrides`, `debugNavigation`, `freezeEarth`, the `?model=` regex and the Stats panel all remain in the live bundle. `stats.js` is still a production dependency. The gate itself holds (verified live). See SEC-11 in §3. |
| SEC-12 forms: no `maxLength`, no consent, placeholder legal text | P3 | **OPEN, changed shape** | Still 0 `maxLength` in `src/components/`. Legal texts are now CMS-owned (`legalDoc` singletons, Portable Text) rather than hardcoded — the *content* is still placeholder. Both transports still send nothing (`auditSubmission.ts:44-47` rejects in production). |
| SEC-13 build log echoes CMS values on validation failure | P3 | **OPEN** | `content/lib/validate.ts:72,95,124,170,182,218` unchanged: slug, shaped strings, numbers, enums, colours and URLs are quoted verbatim. Text bodies are not. |
| SEC-14 emitter escaping untested | P3 | **OPEN** | `emit.ts:60-63` still correct; no test in `content/lib/*.test.ts` or `src/content/*.test.ts` feeds U+2028, a backtick, `${` or `</script>` through `emitModule` and re-parses. (`html.test.ts:18` and `portableText.test.ts:136,157` do exercise `<script>` and `javascript:` at the *sanitiser*, which is the more important half.) |
| SEC-15 `docs/audits/reports/` is a roadmap if visibility changes | org | **OPEN (accepted)** | Still private; `checks/audit-hygiene.ts` still on the gate; this report adds Sanity-side detail (§2, ORG-2) that must leave with the directory. |
| ORG-1 site live and indexable in a "not publishable" state, untracked | P2 | **OPEN — deployment now tracked in memory, not in docs** | Live 08-27 build: `robots.txt` `Allow: /` + sitemap, canonical/og:url on the project URL, no `noindex`; the live entry chunk still contains the fictional brand names (Mango, Cabify, …), the placeholder phone and `tuempresa.com`. `docs/DECISIONS.md` has no line naming the deployment URL, branch or protection state (`grep vercel.app docs/DECISIONS.md` → 0). The readiness runbook was not re-run for the 08-27 deploy. |
| DEP-1 build-tooling advisories | P3 | **OPEN, reduced 7 → 2** | Root: vite 5.4.21 (GHSA-fx2h-pf6j-xcff high, GHSA-v6wh-96g9-6wx3, GHSA-4w7w-66w2-5vf9) and esbuild 0.21.5 (GHSA-67mh-4wv8-2f99). `potrace`/`jimp`/`phin` are gone. `npm audit --omit=dev` → **0**. The Studio package adds 7 of its own (§5). |
| API-2 SSRF via audit form `website` | blocking (future) | **OPEN, unchanged** | `AuditSection.tsx:186` regex unchanged; no backend. |
| API-3 no server-side form controls | blocking (future) | **OPEN, unchanged** | as SEC-12. |
| GIT-2 deployable tree not on GitHub | P0 (process) | **FIXED (verified)** | `origin/main` = `2f7d082` = HEAD; production built from `dcaca0c` (Vercel `Last-Modified: 2026-08-27 09:05`). 22 uncommitted entries remain, all Murcia feature work; `git diff --stat HEAD -- package.json package-lock.json vercel.json` empty. |
| CMS-1 logo would fail the production build | P1 | **FIXED, and the mirror now exists** | `content/lib/mirror.ts` (235 lines, 305 lines of tests): parsed-origin allowlist pinned to `https://cdn.sanity.io` (`build-content.ts:60`), SVG rejected, extension allowlist `png|webp` (`caseStudies.collection.ts:49`), 4 MB cap, basename asserted `SAFE_BASENAME`, dimension gate from the Sanity filename, no credential sent to the CDN. Gaps: no byte sniffing, redirects followed (SEC-16). |
| CMS-2 production fell back to fixtures by omission | P1 | **FIXED (verified, survives migration)** | `config.ts:70-76` — production with neither `SANITY_PROJECT_ID` nor `CONTENT_SOURCE` fails by name. `SANITY_DATASET` has no default in any environment (`:89-92`). |
| CFG-1 non-numeric timeout | P3 | **FIXED (verified)** | `config.ts:96-104` (`SANITY_TIMEOUT_MS`). |
| ASSET-3 `city-backdrop.glb` unreferenced | decision | **OPEN, now tracked** | The file is committed (206 KB in `public/models/`) and still unreferenced by `src/`. Not a security item. |
| OBS-1 no production error signal | launch blocker | **OPEN** | 0 analytics/telemetry/error-reporting hits in `src/`; live site contacts one origin. |

---

## 1. Executive Security Assessment

**Classification: Generally safe with identifiable weaknesses** — unchanged, and better supported
than on 08-20.

Evidence for "generally safe":

- **No secret exists** in the working tree, the two ignored `.env` files hold only a project id
  and a dataset name (no token — the dataset is public and the build reads anonymously), and a
  pattern sweep of all 74 commits finds nothing but `package-lock.json` integrity hashes. No
  `.env*` was ever added to history. The one identifier committed in source (the hosted Studio
  `appId`, `sanity-studio/sanity.cli.ts:28`) is public by design.
- **The browser still contacts one origin — its own.** Verified on the 08-27 build three ways:
  grep of `src/` (0 network primitives), grep of the four live chunks (no `sanity.io`, no
  `VITE_`, no `SANITY_`, no sourcemap URL, no local path), and a headless walk (1 origin, 0 CSP
  violations, 0 page errors, 0 storage). The CMS migration added a build-time media mirror
  precisely so that `img-src 'self'` could stay.
- **CMS content is validated at the only place it enters.** Flat fields: strip tags → decode
  entities → bounds, unchanged. New this pass: Portable Text is normalised to a closed vocabulary
  where *unknown fails the build* (`portableText.ts`), link `href`s are parsed and restricted to
  `https:`/`mailto:` at ingest, and the renderer is a typed switch — no rich-text library, no HTML
  sink. Media URLs are compared by parsed origin, never by prefix. Generated modules are
  `JSON.stringify` with U+2028/9 escaped, written transactionally.
- **The write boundary on the CMS holds.** Anonymous dry-run `create` against the dataset →
  `403 insufficientPermissionsError`; anonymous dataset listing → 401; drafts invisible to
  anonymous reads (0 of 19 documents); CORS restricted (a foreign `Origin` gets 403 and no
  `Access-Control-Allow-Origin`).
- **Debug tooling is gated on a compile-time literal and the gate holds live** (query overrides
  and prototype gates inert on production; overlay absent; production form transport rejects).
- **The production dependency tree has zero advisories**; the two open root advisories are the
  Vite dev server, and the Studio's seven are CLI-only code that no shipped command loads.

The identifiable weaknesses, all narrow:

- **Three carried P2s that are one-line fixes with obvious tests** — SEC-1, SEC-7, and ORG-1 — of
  which two (SEC-1, SEC-7) were in the 08-20 "Immediate" list and were not done while the
  pipeline around them was rewritten. SEC-6 and SEC-8, from the same list, *were* closed by that
  rewrite. That pattern is itself worth noting (§7).
- **One new organisational P3 (ORG-2):** the whole dataset — every published document of every
  type, including `siteSettings` contact data and blog posts that the site does not render — is
  readable by anyone who knows an 8-character project id that the Studio bundle and every API
  URL contain. That is the arrangement ADR 011 chose and it is the right one for published
  marketing copy; it needs to be a rule the editor is told, because the Studio will happily
  accept a "notes" field or a not-yet-announced post and neither is private.
- The CSP is still Report-Only (SEC-2) after two clean measurements.

---

## 2. Threat Model

**Assets.** The marketing site's integrity and availability (static HTML/JS/WASM/GLB/textures on
one origin); the Vercel project (build + deploy authority); the GitHub repository (source of
truth for deploys, private); **the Sanity project** — its datasets (`development`, seeded, 19
published documents; `production`, exists and is empty), its membership, and the hosted Studio;
the future Deploy Hook URL; the brand's reputation (content under real brand names); visitors'
personal data once the forms are wired (today: none collected).

**Public surfaces.**
- `/` and `/debug` (one HTML file, `vercel.json` rewrite); `public/` (~8 MB, `Access-Control-Allow-Origin: *`); `robots.txt`; `sitemap.xml`; `/logos/.gitkeep` (200, empty — the placeholder is deployed).
- **`https://<projectId>.api.sanity.io/…/data/query/<dataset>`** — anonymous read of every published document. Rate-limited by Sanity (500 rps).
- `https://cdn.sanity.io/…` — every uploaded asset, by content hash.
- The hosted Studio (Sanity-hosted, Sanity login) — an *admin* surface, not reachable from the site.

**Execution contexts.**
- *Browser* — React + Three.js; Draco/Basis workers from `blob:`; no third-party script; no analytics; no runtime fetch.
- *Build (Node on Vercel)* — `content:build` → typecheck → 905 tests → 8 harnesses → `vite build`. `content:build` is the only step that opens a network connection: one GET per collection to `api.sanity.io` (anonymous today; `Bearer` header only if `SANITY_TOKEN` is set) and one GET per brand mark to `cdn.sanity.io` (never with the token). It writes `src/content/generated/` and `public/logos/` — both gitignored, both compiled into the deployment.
- *Studio (browser, Sanity-hosted)* — `sanity-studio/` compiled by `sanity build`; carries `SANITY_STUDIO_PROJECT_ID`/`_DATASET` in its bundle by design; edits go through Sanity's API with the editor's own session.
- *Server-side at runtime* — nothing.

**Content sources.** Sanity (default whenever `SANITY_PROJECT_ID` is set — which it is in the
local `.env`, so "it built locally" now means "it built from the live development dataset");
`content/fixtures/` (committed; default for Preview and for a machine with no `.env`);
`content/seed/` (committed, banner). Fixtures and seed are byte-identical.

**External services.** Vercel; GitHub; npm (292 + 991 lockfile entries, all `registry.npmjs.org`);
**Sanity** (Content Lake, CDN, hosted Studio, auth). The Sanity→Vercel webhook is designed (ADR
011) and not built.

**Environment variables / credentials** (all build-time, `.env.example`): `SANITY_PROJECT_ID`
(public identifier), `SANITY_DATASET` (public name, never defaulted), `SANITY_TOKEN` (optional,
read-only; **no token exists today**), `SANITY_TIMEOUT_MS`, `CONTENT_SOURCE`, Vercel system
`VERCEL_ENV`/`VERCEL_PROJECT_PRODUCTION_URL`, local `VITE_VERCEL_ENV`, never-set
`VERTIGO_SKIP_BUDGETS`. Studio: `SANITY_STUDIO_PROJECT_ID`/`_DATASET` (compiled into its bundle,
by design). Future secrets: the Deploy Hook URL, a `SANITY_TOKEN` if a dataset is ever made private.

**Administrative surfaces.** Vercel dashboard; GitHub repo settings; **Sanity project
(members, tokens, dataset ACL, CORS origins, webhooks) and the hosted Studio**; `/debug` on
Previews.

**Attacker classes.**

| Attacker | Reach today |
|---|---|
| Anonymous visitor / bot | static files; query params inert in production; forms send nothing; **can read the whole published dataset over the Sanity API** (by design) |
| Malicious embedding site | blocked (`X-Frame-Options: DENY`, `frame-ancestors 'none'`); assets CORS-readable; Sanity API refuses foreign origins |
| Supply-chain attacker | npm only, two lockfiles; esbuild is the only install hook; Studio deps never enter the app bundle (`checks/architecture.ts` fences it) |
| Compromised developer account / repo access | push to `main` → production, gated only by the build's own tests |
| Vercel env-var access | can set `CONTENT_SOURCE=fixture` silently (SEC-7), point `SANITY_DATASET` at any public dataset of the project, disable system-env exposure (SEC-9) |
| **Sanity member / compromised editor account** | can publish any content; the build validates shape and bounds, not truth. Cannot inject markup, scripts, non-https links, off-CDN media, SVG, or unbounded text. Can make the build fail (an editorial DoS on deploys, never on the live site) |
| Malicious Sanity (the vendor) | trusted at build time for content and media bytes; the mirror follows CDN redirects (SEC-16) |
| Accidental developer mistake | the main vector — §7 |

**Trust boundaries.** (1) Sanity response → `content/lib` + `content/collections` — the only
place external data enters; (2) `cdn.sanity.io` bytes → `public/logos/` (mirror); (3) build env
→ `readConfig()` / `BUILD_ENV` — decides what a build *is*; (4) compiled bundle → browser;
(5) `git push main` → production; (6) Sanity login → dataset writes.

---

## 3. Security Findings

IDs continue the existing scheme. Each is labelled **Confirmed vulnerability / Likely
vulnerability / Security weakness / Hardening opportunity**.

### P0 — Critical

None.

### P1 — High

None.

### P2 — Medium

---

**SEC-1 · `?model=` same-origin guard bypassable with a backslash** — *Confirmed vulnerability (preview builds only)* — carried from 08-11 and 08-20, unchanged

- *Evidence:* `src/experiences/murcia/config/appConfig.ts:95`. A value whose second character is
  `\` (or `%5C`) passes and the WHATWG parser resolves it against another host. Present in the
  live Murcia chunk; inert there (verified this pass).
- *Attack surface:* every build with `DEBUG_TOOLS_ENABLED` true — dev, `vite preview`, every
  Vercel Preview. *Exploitation:* share a crafted Preview link → the victim's browser fetches and
  Draco-decodes a third-party GLB. *Impact:* asset substitution + a request to an attacker host;
  no script execution. *Likelihood:* low.
- *Remediation:* `new URL(model, location.origin)`, require `origin === location.origin` and
  `pathname.startsWith('/models/')` — the shape `remoteMediaUrl` already uses. *Complexity:*
  trivial. *Verification:* unit test with `/\h/x`, `/%5Ch/x`, `//h/x`, `https://h/x` rejected;
  `/models/x.glb` accepted.
- *Note:* this has now been in the "Immediate" list of two consecutive reports.

---

**SEC-7 · `CONTENT_SOURCE=fixture` is honoured silently in production** — *Security weakness (fail-open by commission)* — carried, survived the migration

- *Evidence:* `content/lib/config.ts:66` `if (requested === 'fixture' || requested === 'seed') return …`
  runs before the production guard at `:70-76`. `seed` prints a five-line banner
  (`build-content.ts:66-73`); `fixture` prints `[content] content source: fixtures (…)` once.
  `sanity-field-contract.md:222` describes `seed` as the only production fallback; the code
  does not enforce it; `config.test.ts` (118 lines) has no production+fixture case.
- *Impact:* a green production deployment serving the six fictional case studies, announced by
  one log line. *Required capability:* Vercel env-var access, or an operator typing the obvious
  thing. *Likelihood:* low-medium.
- *Remediation:* in `readConfig`, when `env.VERCEL_ENV === 'production'` and `requested ===
  'fixture'`, fail with a message naming `seed`. One `it()` in `config.test.ts`. *Complexity:*
  trivial. *Verification:* `VERCEL_ENV=production CONTENT_SOURCE=fixture npm run content:build`
  → exit 1.

---

**ORG-1 · The site is live and indexable in a state the readiness audit classed as not publishable, and the deployment is still not recorded in the repository** — *Organisational weakness* — carried

- *Evidence:* `https://vertigo-marketing-website.vercel.app/` → 200, rebuilt 2026-08-27 09:05
  from `dcaca0c`; `robots.txt` `Allow: /` + sitemap; canonical/og:url on that origin; no
  `noindex`; the live entry chunk contains the fictional brand names, the placeholder phone and
  `tuempresa.com`. Since 08-20 the deployment *is* known — it is recorded in the assistant's
  memory notes and in `vercel-deploy-state` — but **nothing under `docs/` names the URL, the
  branch, the protection state or the content source production is set to**. The readiness
  runbook (`production-readiness-vercel-2026-08-20.md`) was not re-run for the first deploy from
  the consolidated tree, so its "Preview → Production" checklist (CSP walk, `/debug` on Preview,
  forms erroring on Production, the `[content] content source:` line) has no record of having
  been executed.
- *Why it stays P2:* untracked production state is the precondition for the brief's objectives
  15–16 (unauthorised code / accidental config changes). One concrete consequence today: this
  pass cannot tell whether production was built from `seed` or from the `development` dataset —
  the two are byte-identical in content, so the bundle does not say, and the build log is not in
  the repo.
- *Remediation:* (a) decide whether the deployment stays public (Vercel Deployment Protection
  or a `noindex` build until CONTENT-1); (b) add a "Deployments" section to `docs/DECISIONS.md` or
  the readiness runbook: URL, branch, protection, content source per environment, last promoted
  commit — updated on every promote; (c) re-run the readiness brief against the live 08-27
  deploy, which is what it was written for. *Complexity:* small.

### P3 — Low

---

**ORG-2 · Everything published to the dataset is world-readable, and the Studio does not say so** — *Security weakness (organisational)* — new

- *Evidence:* anonymous GET on the query API of the `development` dataset returns all 19
  published documents across `blogPost`, `caseStudy`, `district`, `legalDoc`, `service`,
  `siteSettings` and `sanity.imageAsset`; `siteSettings` returns the contact e-mail and phone;
  the two `blogPost` documents are readable although the site renders no blog. The `production`
  dataset also answers anonymously (empty). Drafts are not readable (0 visible; Sanity hides the
  `drafts.` namespace from unauthenticated reads). The project id needed is 8 lowercase
  characters, in every API URL and in the Studio bundle — a public identifier, correctly
  classified as such by the code.
- *Why it matters:* this is ADR 011's deliberate choice (public dataset, no build token, drafts
  excluded by query) and it is the right one for a marketing site. The weakness is that the
  *editor* has no way to know it. `GUIA-EDITOR.md` and the Studio field descriptions explain what
  to type, not that "Publicar" means "readable by anyone on the internet, including fields the
  website does not show". A future "internal notes" field, a client's private phone number, or a
  blog post published early "because it isn't on the site yet" would all be public on publish.
- *Remediation:* one paragraph in `GUIA-EDITOR.md` and in ADR 011's consequences: *published =
  public, regardless of what the site renders; drafts are private; never add a field for
  information that must not be public.* Keep the blog section's "aún no visible en la web" label
  but add "pero sí es pública". Record that the `production` dataset exists and is public, so
  whoever seeds it knows. *Complexity:* trivial. *Verification:* the docs say it; `npm run
  check:audit` unaffected.

---

**SEC-11 · Debug/prototype code ships in the production bundle; the `define` does not fold** — *Hardening opportunity* — carried, partly fixed

`vite.config.ts:305-308` now injects `__VERTIGO_ENV__` as a literal, which was the 08-20
recommendation — but `src/app/buildFlags.ts:27-29` wraps the read in `environment()` and
`:38` calls it. esbuild's minifier does not propagate a constant through a function call, so the
live entry chunk reads `function Tg(){return"production"}const xg=Tg()!=="production"` and
every consumer of `DEBUG_TOOLS_ENABLED` keeps both branches: `applyQueryOverrides` with the
SEC-1 regex, the `debugNavigation`/`grid`/`stats`/`debug` parsing, the proto-sky path builder
(`/proto-sky/${a}/${r}/${s}.png`), `freezeEarth`, the `Stats` panel (`stats.js` is still a
production dependency, `MurciaDebugTools.ts:2`). Gate verified to hold live; cost is bytes and a
larger surface for a future gating mistake. *Remediation:* make the flag a direct expression of
the define — `export const DEBUG_TOOLS_ENABLED = (typeof __VERTIGO_ENV__ === 'undefined' ?
'development' : __VERTIGO_ENV__) !== 'production'` — so the whole right-hand side is a
constant expression esbuild folds to `false`; move `stats.js` to devDependencies or a dynamic
import. *Verification:* `VERCEL_ENV=production npx vite build` then `grep -c debugNavigation
dist/assets/*.js` → 0. *Complexity:* trivial.

---

**SEC-16 · The media mirror trusts the CDN's bytes and follows its redirects** — *Hardening opportunity* — new

`content/lib/mirror.ts:186-206`: origin (`https://cdn.sanity.io`, parsed), scheme, SVG,
extension allowlist (`png|webp`), basename shape, 4 MB cap and Sanity's own filename geometry
are all checked **before** the fetch — good. After it, the bytes are written as-is: no magic-byte
check that a `.png` is a PNG, and `withTimeout` uses `fetch`'s default `redirect: 'follow'`, so
the origin check is on the URL asked for, not the one answered. Both need Sanity's CDN to
misbehave, and the file lands under the site's own origin with `nosniff` and is only ever drawn
into a canvas — so the impact is a broken logo, not code execution. The brief asks for sniffing
explicitly. *Remediation:* `redirect: 'error'` on the mirror's fetch (the CDN is content-addressed
and never redirects a valid asset); check the first bytes against the allowed formats
(`89 50 4E 47` / `RIFF….WEBP`) before `writeFileSync`. Two tests in `mirror.test.ts`.
*Complexity:* trivial.

---

**SEC-2 · CSP is Report-Only, without a report endpoint** — *Hardening opportunity* — carried, measured clean twice

Policy unchanged since `a207f2b`; 0 violations on the 08-20 build and on the 08-27 build.
Promotion to `Content-Security-Policy` needs no policy edit. The Studio is Sanity-hosted, so no
new origin is needed for it. Pair with OBS-1 if a `report-to` is wanted; otherwise promote on the
next Preview and re-run the headless walk.

---

**SEC-9 · Environment detection fails open to "development" in two places** — *Security weakness* — carried

`vite.config.ts:221` and `content/lib/config.ts:70`. If Vercel's "expose system environment
variables" toggle is switched off, production ships debug tools and the demo form transport,
robots says `Disallow: /`, and the content-source guard cannot fire. Verified enabled today.
*Remediation:* refuse the build when `process.env.VERCEL` is set and `VERCEL_ENV` is not — in
`readConfig` (a unit test) and at the top of `vite.config.ts`. *Complexity:* trivial.

---

**SEC-10 · `Access-Control-Allow-Origin: *` on every response** — *Hardening opportunity* — carried, undecided

Platform-supplied; nothing served is confidential; effect is hotlinking. Decide and record in
DECISIONS; if unwanted, pin the header for the asset paths in `vercel.json`.

---

**SEC-12 · Forms: no `maxLength`, no consent control, placeholder legal text** — *Hardening* — carried (API-3 subset)

Harmless while both transports never send. Land with the endpoint (API-2/API-3). The legal
documents are now CMS-owned Portable Text — the placeholder *content* is CONTENT-1's problem,
the *mechanism* is done.

---

**SEC-13 · Build log echoes CMS values on validation failure** — *Hardening* — carried

`validate.ts:72,95,124,170,182,218`. Bounded, non-text values only; text bodies are never
printed. With a public dataset the disclosure argument is weaker than on 08-20 (a rejected value
is one an editor *tried* to publish, so it was about to be public anyway). Keep, low priority.

---

**SEC-14 · Emitter escaping is correct but untested** — *Hardening* — carried

Add one test in `content/lib/generate.test.ts`: a fixture record containing U+2028, U+2029, a
backtick, `${`, `"` and `</script>`, emitted, then `import()`ed (or `new Function`-parsed in the
test only) and compared deep-equal. Trivial.

---

**SEC-15 · `docs/audits/reports/` is a roadmap if the repository's visibility changes** — *Organisational* — carried

This report adds the shape of the Sanity read surface. No values, no ids, no exploits (§9). The
README's "extract first" rule stands.

---

**DEP-1 · Build-tooling advisories** — *Hardening* — carried, reduced (§5)

---

## 4. Secret Exposure Report

| Item | Where | Class | Action |
|---|---|---|---|
| Any credential value (keys, tokens, passwords, JWTs, PEM, cookies, `user:pass@`) | working tree incl. `docs/`, `public/`, `dist/`, `coverage/`, generated, `.claude/`, `sanity-studio/` (excl. `node_modules`); all 74 commits (`git log --all -p` pattern sweep — only `package-lock.json` integrity hashes matched); four live chunks | **none found** | none |
| `.env` (root) | ignored; holds `SANITY_PROJECT_ID` + `SANITY_DATASET` only — **no token** | public identifiers | none |
| `sanity-studio/.env` | ignored; `SANITY_STUDIO_PROJECT_ID` + `_DATASET` | public identifiers, compiled into the Studio bundle by design | none |
| `.env.example` | values empty; no `.env*` ever added to history (`git log --all --diff-filter=A`) | compliant | none |
| Sanity project id (8 chars) | `.env`, memory notes, every API URL, the Studio bundle; **not** in any tracked file (`git grep` → 0) | public by design (it is the hostname) | none — do not treat as a secret, do not print it in reports either |
| Hosted Studio `appId` | `sanity-studio/sanity.cli.ts:28`, committed in `f1f4512` | public identifier — names the app, grants nothing (commit message reasons it out) | none |
| `SANITY_TOKEN` | documented in `.env.example`; **no value exists anywhere** | — | when one is created: read-only, Production scope only, never `VITE_`; the code already refuses to put it in a URL or a banner |
| Future Deploy Hook URL | not created | will be a secret (anyone with it can trigger a build) | Vercel-side only; never in the repo or the Studio |
| Brand contact e-mail and `+34 600 000 000` | `content/fixtures/*.json`, `content/seed/*.json`, the live dataset, the live bundle | placeholder, public by design | swap before launch (CONTENT-1) |
| Repo owner's GitHub handle; author e-mail in commits | Git metadata, one readiness report | public by design | none |
| `.claude/settings.json` (tracked) | plugin enablement only | restricted but safe | optional `.gitignore` |
| Local absolute paths | ignored `coverage/`, `test-results/`, `sanity-studio/dist/` | never leave the machine | none |

No rotation and no history remediation is required.

---

## 5. Supply-Chain Assessment

**Application (`package.json`).** `npm audit`: 2 advisories (1 high, 1 moderate), **0 against
the production tree** (`npm audit --omit=dev` → 0; react 19.2.7, react-dom, three 0.174,
@react-three/fiber 9.6.1, gsap, stats.js and transitives clean).

| Advisory | Package | Exposure class |
|---|---|---|
| GHSA-fx2h-pf6j-xcff (high) `server.fs.deny` bypass, Windows; GHSA-v6wh-96g9-6wx3; GHSA-4w7w-66w2-5vf9 | vite 5.4.21 | developer machine, `npm run dev` only |
| GHSA-67mh-4wv8-2f99 dev-server CORS | esbuild 0.21.5 | developer machine (esbuild is used as a CLI bundler here; Vite's dev server is the practical exposure) |

`potrace`/`jimp`/`phin` (5 entries on 08-20) are gone. The four remaining need the Vite major
(DEP-1, unchanged advice: schedule it as its own pass with `@vitejs/plugin-react`, `vitest` 4,
`vite-plugin-glsl`). Until then: do not browse untrusted sites while `npm run dev` is bound.

**Studio (`sanity-studio/package.json`).** `npm audit`: 7 advisories (1 high, 6 moderate) —
`js-yaml` 3.13.1 and `smol-toml` via `@vercel/frameworks` via `@sanity/cli`, and `uuid` 10 via
`typeid-js` 1.2.0 via `@sanity/cli`. Re-verified against `sanity-studio/README.md` §"Dependency
audit" (assessed 2026-08-24): the chain and versions match; the affected modules live under
`@sanity/cli/dist/actions/init/` and `scaffold/` and `util/telemetry/`, which `sanity dev|build|deploy`
never import; inputs are the developer's own files; no upstream fix exists (`@vercel/frameworks`
pins exact vulnerable versions). **Accepted, with the caveat the README itself records:** a
*different* `typeid-js@0.3.0` *is* in the Studio's browser bundle and is outside the advisory
range — re-check if that changes. `npm audit fix --force` would downgrade `sanity` a major;
do not.

**Lockfiles.** Root: v3, identical to HEAD, consistent with `package.json`, 292 entries all
`registry.npmjs.org`, no git/tarball deps, no `overrides`. Studio: committed deliberately, 991
entries all `registry.npmjs.org`. The Studio's dependencies cannot reach the app bundle:
`checks/architecture.ts` fences `sanity-studio/` and the app has no `@sanity/*` dependency
(`npm ls` confirms; the live bundle has 0 `sanity` strings).

**Install hooks.** Root: only `esbuild` (`postinstall: node install.js`) and macOS-only
`fsevents`. Studio: not on the Vercel build path at all (`npm run build` at the root never enters
it).

**Package scripts.** Every harness and `content:build` is `esbuild <local .ts> → node_modules/.cache → node`.
Network in the build: the Sanity query API and CDN only (§2). `scripts/*.mjs` and
`scripts/proto/*.mjs` are hand-run tools hitting `localhost` only. `sanity-studio/scripts/import-fixtures.mjs`
is dependency-free and writes `.out/seed.ndjson` locally; the actual dataset import is a manual
`npx sanity dataset import … --replace` with the developer's own login — powerful, documented as
"fresh dataset only", and the README explains why `--replace` after editing has begun destroys
editor work. That is an operational risk, not a supply-chain one (§7).

**CI/CD.** No `.github/`. Deployment is Vercel's Git integration on `main`. Branch protection and
required reviews are not observable from the repo; a push to `main` is a production deploy gated
only by the build's own tests (unchanged, accepted for the team size — §7).

**Third-party runtime.** None on the public site. The Studio runs Sanity's own code under
Sanity's own origin, authenticated by Sanity; it is not part of the public site's runtime.

---

## 6. Deployment Security Assessment

| Area | State (verified live unless noted) |
|---|---|
| Deployment | production at `vertigo-marketing-website.vercel.app`, rebuilt 2026-08-27 09:05 UTC from `dcaca0c`; `X-Vercel-Cache: HIT`; the code's fallback host is still the non-existent `vertigo-marketing-web.vercel.app` |
| Build path | production-path build confirmed: robots `Allow: /` + `Disallow: /debug` + sitemap; canonical/og:url on the project URL; no `noindex`; debug overlay absent; query and prototype gates inert; `DEBUG_TOOLS_ENABLED` evaluates to `false` (literal `"production"` in the chunk) → system env vars **are** exposed |
| Headers (`/`, `/models/*.glb`) | unchanged from 08-20: `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic/geo/payment/usb/interest-cohort off), CSP **Report-Only** (SEC-2), HSTS (platform, 2 y, preload), `Access-Control-Allow-Origin: *` (platform, SEC-10). `Cache-Control` 1 day + SWR on asset dirs (now including `/logos/`), `max-age=0, must-revalidate` on HTML. `.wasm` → `application/wasm` |
| Public files | `dist/` (local, ignored): no sourcemaps (`*.map` → 404 live); `build.sourcemap` unset. **Local-only artefacts a deploy would not include:** `dist/proto-sky/` (from the ignored `public/proto-sky/`, ~116 MB of prototype faces) — present on this machine because Vite copies whatever is in `public/`; absent on Vercel because the directory is ignored. `/logos/.gitkeep` is served (200, 0 bytes) — cosmetic |
| Sensitive paths | `/.env`, `/.git/HEAD`, `/package.json`, `/vercel.json`, `/content/fixtures/caseStudy.json`, `/src/content/site.ts`, `/sanity-studio/`, `/logos/` → 404 |
| Routes | `/` and `/debug` (rewrite; `/debug/` 404s); no functions, no redirects |
| Environment separation | Preview keeps debug tools + demo transport by design; production drops both. **Not verifiable from the repo:** which of `SANITY_PROJECT_ID`/`SANITY_DATASET`/`CONTENT_SOURCE` is set in which Vercel environment — and therefore whether production is currently built from `seed` or from the `development` dataset (content identical either way today) |
| Production secrets during builds | none exist. If `SANITY_TOKEN` is added: header-only; never in a URL, banner or error (verified in `sanity.ts`); scope it to Production |
| Preview deployments | none on the remote (only `main`). When one exists: SEC-1 applies; treat the URL as semi-public |
| Deployment permissions | Vercel Git integration; no repo-side evidence of branch protection; no Deploy Hook yet |
| **Sanity project** (new) | dataset `development`: public read, seeded, 19 docs; dataset `production`: public read, empty; anonymous write → 403; anonymous dataset list → 401; drafts hidden; CORS: foreign origin → 403, `Vary: Origin`; API rate limit 500 rps; HSTS on the API host. Members, tokens, webhooks, CORS allowlist contents: **not verifiable** without project access |
| Hosted Studio | deployed (`appId` pinned); URL not recorded in the repo; access = Sanity login; not verified this pass |

---

## 7. Organizational / Structural Security Risks

1. **Deployment state lives in memory notes, not in the repository (ORG-1).** The 08-20 report
   asked for a "Deployments" section; the deploy happened, the notes were updated, `docs/` was
   not. The readiness brief exists precisely for the first deploy from a new tree and was not run.
2. **"Immediate" fixes are being outrun by feature work.** Of the five 08-20 immediate items, the
   two that sat *inside* the pipeline being rewritten (SEC-6, SEC-8) got fixed as a side effect;
   the two one-liners outside it (SEC-1, SEC-7) did not, and SEC-7 was faithfully re-implemented
   in the new `config.ts`. Trivial security fixes need their own commit, not a ride on the next
   feature.
3. **Published means public, and only the code knows it (ORG-2).** ADR 011's public-dataset
   decision is correct and undocumented for the person it affects most.
4. **Two datasets, both public, one empty, chosen by an environment variable with no default.**
   The no-default rule is right (`config.ts:85-92`). The remaining gap is that nothing records
   which dataset each Vercel environment points at, and `production` already exists to be pointed
   at by mistake. Record it with the deployment state (item 1).
5. **`sanity dataset import --replace` is a manual, destructive, developer-login operation** whose
   only guard is a README paragraph. Adequate while one person edits; before the client edits,
   either delete the `import-fixtures` path from the runbook or make the script refuse a dataset
   that already has documents.
6. **Three fail-open environment states are still documented instead of impossible** (SEC-7,
   SEC-9, `VERTIGO_SKIP_BUDGETS`). The project's reflex — `checks/*.ts`, `config.test.ts` — is
   the right tool; point it at them.
7. **The local default is now the live dataset.** A developer with the root `.env` builds from
   `development` on every `npm run dev`, `check` and `build`. Good for parity, but "it passed
   locally" no longer proves the fixtures still pass, and a Sanity outage now breaks local
   development unless `CONTENT_SOURCE=fixture` is set. Not a vulnerability; worth one line in
   the README.
8. **No second pair of eyes on the deploy path** — unchanged, accepted for the size; record it
   as accepted rather than assumed.
9. **`docs/audits/reports/` visibility** — governed by a README rule and a harness (SEC-15).

---

## 8. Remediation Plan

**Immediate (hours) — each is a one-line change plus a test; do them in one commit**
1. SEC-7: reject `CONTENT_SOURCE=fixture` when `VERCEL_ENV=production` (`config.ts` + one test).
2. SEC-1: origin-compare `?model=` and restrict to `/models/` (`appConfig.ts` + tests).
3. SEC-9: refuse when `VERCEL` is set and `VERCEL_ENV` is not (`config.ts` + `vite.config.ts`).
4. SEC-11: make `DEBUG_TOOLS_ENABLED` a direct constant expression of the define; verify
   `grep -c debugNavigation dist/assets/*.js` → 0 on a production-path build.
5. ORG-1: add the "Deployments" section (URL, branch, protection, content source per
   environment, last promoted commit) to `docs/DECISIONS.md`; decide public-vs-protected.

**Short-term engineering (days)**
6. SEC-2: promote the CSP on the first Preview; re-run the headless walk.
7. SEC-16: `redirect: 'error'` + magic-byte check in the mirror; two tests.
8. SEC-14: emitter hostile-input round-trip test.
9. ORG-2: the "published = public" paragraph in `GUIA-EDITOR.md` and ADR 011.
10. `import-fixtures` / `--replace` guard (§7 item 5).
11. DEP-1: the Vite major, as its own pass.

**Architectural**
12. Form endpoint (API-2/API-3, SEC-12) as one change: server-side validation, SSRF controls,
    rate limiting, consent + privacy notice + retention; `form-action`/`connect-src` in the CSP.
13. Sanity → Vercel Deploy Hook (ADR 011 Phase 8): the hook URL is the first real secret this
    project will hold — Vercel-side only, filtered to the types the site renders.
14. OBS-1 + `report-to` as one deliberate first external origin.

**Operational**
15. Re-run the production-readiness brief against the live 08-27 deployment.
16. Decide SEC-10 and record it. Move `stats.js` out of production dependencies.
17. Re-confirm the `docs/audits/reports/` extraction rule before any hand-over.

---

## 9. Verification Results and Not Verified

**Verified (executed in this pass)**

| Check | Result |
|---|---|
| `git rev-parse HEAD`, `git status --short`, `git remote -v`, `git log --oneline` | `2f7d082` = `origin/main`; 22 entries (19 modified, 3 untracked), all Murcia feature work + one audit report; 74 commits |
| Secret sweep of the working tree (all dirs incl. `docs/`, `public/`, `dist/`, `coverage/`, generated, `.claude/`, `sanity-studio/` sans `node_modules`) with PEM / AWS / GitHub / Slack / Stripe / Google / JWT / `Authorization` / `user:pass@` / assignment / `VITE_` patterns | 0 credential hits |
| `git log --all -p` with the same patterns; `git rev-list --all | xargs git grep -l` on the hits | all hits are `package-lock.json` integrity hashes; `git log --all --diff-filter=A` finds no `.env*` or key file ever added |
| `.env` and `sanity-studio/.env` (values redacted at read) | project id + dataset name only; no token |
| `git grep` for the project id, `api.sanity.io`, `sanity.studio` in tracked files | 0 |
| `git check-ignore -v` on `.env`, `sanity-studio/.env`, `sanity-studio/dist`, `sanity-studio/.out`, `public/proto-sky`, `dist` | all ignored |
| `npm audit --json`, `npm audit --omit=dev`, `npm query` (install scripts), lockfile resolved-host scan — root and Studio | 2 / 0 / esbuild only / 292 registry-only; Studio 7 (chain as README) / 991 registry-only |
| `git diff --stat HEAD -- package.json package-lock.json vercel.json` | empty |
| Source verification of every finding cited (`appConfig.ts:95`, `invariants.ts:73` + regex test, `config.ts:66-104`, `build-content.ts:60-73`, `sanity.ts:56-57,99,200`, `source.ts:82-85`, `mirror.ts:186-206`, `validate.ts:190-232`, `portableText.ts:175-201`, `LegalPanel.tsx:19-33`, `emit.ts:60-63`, `buildFlags.ts:27-38`, `vite.config.ts:221,305-308`, `auditSubmission.ts:44-47`) | as quoted in §0/§3 |
| Grep of `src/` for HTML/script/style/URL/navigation/network/storage sinks | 2 `innerHTML` (static/numeric, known); 1 `img.src` (validated local path); 1 `href={span.href}` (ingest-validated `https:`/`mailto:`, `rel="noreferrer"`, no `target`); 1 `tel:`; 0 `fetch`/XHR/WS/beacon/storage/cookie/`import.meta.env`/`postMessage`/`window.open`/`history` |
| `curl -I` on the live `/` and `/models/city-prototype.glb`; probes for `/debug`, `/debug/`, `/.env`, `/.git/HEAD`, `/package.json`, `/vercel.json`, `/robots.txt`, `/sitemap.xml`, `/content/fixtures/caseStudy.json`, `/src/content/site.ts`, `/logos/`, `/logos/.gitkeep`, `/sanity-studio/`, `/assets/index-*.js.map` | headers as §6; 404 on every sensitive path; `/logos/.gitkeep` 200 |
| Live `index.html` script/link inventory; `robots.txt`; `sitemap.xml`; canonical; og:url | production-path build; every reference same-origin; 1 sitemap URL |
| Four live chunks downloaded (`index`, `MurciaExperience`, `SceneCanvas`, `intro`; 640 KB) grepped for `sourceMappingURL`, `VITE_`, `SANITY_`, `sanity.io`, `cdn.sanity`, `localhost`, debug/prototype gate names, brand names, placeholder phone, `__vertigoBootDebug`, `"production"` | 0 / 0 / 0 / 0 / 0 / 0; gate names present (SEC-11); brands + placeholder present (ORG-1); boot debug present (SEC-3); literal `"production"` behind a function (SEC-11) |
| Headless Chromium (project's Playwright, swiftshader) on `/` and on `/?model=…&debug=1&stats=1&debugNavigation=1&sky=c&holo=1` — 20 s load + wheel + 8 s | bootState `ready` both; **0** `securitypolicyviolation`; 0 page errors; 1 origin; no overlay; `localStorage`/`sessionStorage`/cookies = 0/0/0 |
| Sanity query API, anonymous, `development`: `count(*)` published/drafts, `array::unique(*[]._type)`, `siteSettings{...}`, `caseStudy[0]{...}` | 19 published, 0 drafts visible; 7 types; contact fields readable (redacted here) |
| Sanity query API, anonymous, `production`: `count(*)`, types | 200, 0 documents |
| Sanity mutate API, anonymous: empty mutation array; `create` with `dryRun=true` | 200 no-op; **403 `insufficientPermissionsError`** — nothing was written |
| Sanity `GET /datasets`, anonymous | 401 |
| Sanity CORS: `OPTIONS` and `GET` with `Origin: https://evil.example` | 204 with no `Access-Control-Allow-Origin`; GET → 403, `Vary: Origin` |
| `npm run check:audit` on this report | run after writing — see the closing note of the job |

**Not verified**

- **Vercel dashboard state**: Deployment Protection; which Sanity variables are set in which
  environment (and therefore production's actual content source); build logs; collaborators;
  Deploy Hooks. Needs dashboard or `vercel` CLI access.
- **GitHub settings**: branch protection, required reviews, collaborators.
- **Sanity project settings**: members and roles, existing API tokens, the CORS origin
  allowlist, webhooks, dataset ACL mode beyond what anonymous probing shows. Needs project
  access or `sanity` CLI login.
- **The hosted Studio**: its URL is not in the repo; not opened; its `dist/` was inspected only
  for what it bakes in (project id, dataset — expected).
- **CSP in enforcing mode**: only Report-Only observed (0 violations, twice).
- **The mirror against real bytes**: `public/logos/` still holds only `.gitkeep`; every `logo`
  and `isotype` in the dataset is `null`; `mirror.ts` was verified by reading and by its 305
  lines of tests, not by a live fetch.
- **A Preview deployment** (SEC-1 live reproduction): none exists on the remote.
- **Browsers**: headless Chromium (software GL) only.
- **No fuzzing, no SBOM beyond `npm audit`**; `three`, React and `sanity` not audited as code.

**Brief gaps:** the brief still describes the WordPress pipeline in Phase 4 (`WP_*` variables,
`content/lib/html.ts` as the primary sanitiser, `wordpress-field-contract.md`) — it should name
ADR 011, `content/lib/{config,sanity,mirror,portableText}.ts`, `sanity-field-contract.md` and
`sanity-media-contract.md`, and add three surfaces this run had to invent checks for: (1) the
CMS as an *anonymously readable API* (what is public, drafts, write boundary, CORS, second
datasets); (2) the Studio as a *second package with its own lockfile, audit and hosted admin
surface*; (3) Portable-Text/rich-text ingest (closed vocabulary, link protocols, renderer
without an HTML sink). The 08-20 gaps (output path inconsistency; "enumerate deployments";
platform-supplied headers as a separate line) are still unamended.
