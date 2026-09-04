# Cybersecurity & Project Security Audit — 2026-09-02

```
Audited:  2026-09-02 · against commit 528dd42 (main = origin/main, 107 commits) + 5 uncommitted
          entries (docs/DECISIONS.md, docs/PROJECT_MEMORY.md, e2e/mobile.spec.ts,
          src/blog/BlogRoute.tsx, src/blog/blog.css — blog UI polish and notes; nothing config-
          or pipeline-related among them; audited as the working tree)
Scope:    the whole repository (source, the Sanity content pipeline, the new blog document and
          its build-time head emitter, the Sanity Studio package, config, docs, public/, ignored
          build output, all 107 commits of Git history and the local `old-state` branch), both
          installed dependency trees, the LIVE production deployment at
          vertigo-marketing-website.vercel.app (headers, both documents, every chunk, headless
          runtime behaviour on / and /blog), the Sanity Content Lake and CDN as reached
          anonymously. Out of scope, deliberately: the Vercel dashboard, GitHub settings, Sanity
          project membership and the hosted Studio (none reachable from the repo); fuzzing.
          Read-only: no production code, configuration or brief was changed by this pass. The
          only file written is this report.
Baseline: docs/audits/reports/cybersecurity-project-security-2026-08-27.md, plus the security
          sections of docs/audits/reports/production-readiness-vercel-2026-08-20.md
```

This report **supersedes** `cybersecurity-project-security-2026-08-27.md` as the current security
result. The earlier report remains accurate for everything not restated here; where they disagree,
this one wins. It is the third run of the `cybersecurity-project-security` brief.

**What changed the surface since 08-27.** Four things, each verified in code and live rather than
read from notes:

1. **The blog exists and is deployed** (ADR 013, `d009dfe`, 2026-08-31). `/blog` and
   `/blog/<slug>` are served by a second HTML document (`blog.html` → `src/entries/blog.tsx`),
   with one prerendered `<head>` per post (`scripts/blogShell.ts`, run from a Vite plugin at
   `closeBundle`) carrying title, canonical, `og:*` and a JSON-LD block. The app gained its first
   router (`src/app/route.ts`) and its first `history` writes. Live: two posts, both prerendered.
2. **The browser now contacts a second origin.** Blog images are hot-linked from
   `https://cdn.sanity.io` (the CDN's resize transforms build the `srcset`), so `img-src` in the
   CSP was widened to that origin and a visitor's IP and user-agent reach Sanity when an article
   loads. Brand logos are still mirrored into `public/logos/`. Nothing else leaves the origin:
   0 `fetch`, 0 storage, 0 cookies, verified live.
3. **All four "Immediate" one-liners from 08-20 and 08-27 are done** — SEC-1, SEC-7, SEC-9 and
   SEC-11 — each with a test, and verified here in source and (for SEC-11) in the live bundle,
   where the debug flag is now a literal `false`.
4. **Production's content source is now knowable from the outside**: every image URL in the
   live blog chunk and in the prerendered `og:image` tags names the **`development`** dataset.
   The `production` dataset still exists, is public, and is empty.

Nothing found is exploitable by an anonymous visitor against the production deployment today.
The classification is unchanged; the open list is shorter and, for the first time, contains no
one-line code fix that has been carried twice.

---

## 0. Status of Prior Findings

| ID | Prior severity | Status now | Evidence |
|---|---|---|---|
| SEC-1 `?model=` same-origin guard bypassable with `\` | P2 (preview-only) | **FIXED (verified)** | `appConfig.ts:116-127` now parses `new URL(value, base)`, requires `url.origin === base` and `pathname.startsWith('/models/')` — the `remoteMediaUrl` shape the 08-27 report asked for. Run in node: `/\evil.example/x.glb`, `/%5Cevil.example/x.glb`, `//evil.example/x.glb`, `/models/../x.glb` all rejected; `/models/x.glb` accepted. Test `appConfig.test.ts:20-29` (9/9 pass). *Test-fidelity nit:* the case written as `'/\evil.example/x.glb'` is a JS string where `\e` is not an escape, so it actually tests `/evil.example/x.glb`; the raw-backslash case is rejected by the guard but not exercised by the test. Write it as `'/\\evil…'`. Live: the crafted-query walk still produces 1 origin, no overlay, no page error. |
| SEC-2 CSP never enforced | P3 | **OPEN — measured clean a third time, now including the blog** | Live header is still `Content-Security-Policy-Report-Only`, byte-identical to `vercel.json` (306/306 chars). No `report-to`, so reports go nowhere. Headless walk of the live build: **0** `securitypolicyviolation` on `/`, `/blog`, `/blog/<slug>` and the crafted-query URL; 0 page errors. The one policy edit since 08-27 (`img-src … https://cdn.sanity.io`, `d009dfe`) is justified by the blog's hot-linked images and is the narrowest change that admits them. |
| SEC-3 `__vertigoBootDebug` | accepted | **OPEN (accepted), unchanged** | `boot.ts:124-135`: ten zero-argument getters, no setters; byte-identical since baseline; present in the live intro chunk. Not gated (the intro entry cannot import `buildFlags`). |
| SEC-4 two `innerHTML` sinks | accepted | **OPEN (accepted), no new unvalidated sink** | Full grep of `src/`, `scripts/`, both documents: the same two `innerHTML` (`overlays.ts:85` static literals; `DebugOverlay.ts:88` numbers, constructed only when `DEBUG_TOOLS_ENABLED`). New sinks, all validated at build: `BlogFigure.tsx:51` `img.src` (CDN-origin regex at ingest + `URL.origin` compare at render), `MediaCard.tsx:58` `<a target="_blank" rel="noreferrer noopener">` (https + host allowlist), `textSpans.tsx:26` `href` (https/mailto at ingest, re-asserted on output), `useRoute.ts` `pushState`/`replaceState` (URLs built from `ID_PATTERN`-validated route objects only). Build-time HTML sink `blogShell.ts` escapes text, attributes and JSON-LD and verifies each shell before writing (§3, blog). `dangerouslySetInnerHTML` appears only in comments forbidding it. |
| SEC-5 HSTS / COOP / CORP | accepted | **unchanged** | HSTS platform-supplied (2 y, preload) on every response; COOP/CORP absent. |
| SEC-6 `LOCAL_MEDIA_PATH` accepts `//host` | P2 | **FIXED (stands)** | `invariants.ts:74` unchanged since the fix. Residual noted this pass: the regex admits `..` segments; the only producer is the mirror (`mirror.ts:178`, `SAFE_BASENAME`), so it is latent, not reachable from the CMS. Folded into SEC-17's hardening note. |
| SEC-7 `CONTENT_SOURCE=fixture` honoured silently in production | P2 | **FIXED (verified)** | `config.ts:77-82` fails a production build that names `fixture`, and the message names `seed`. Test `config.test.ts:121-125` passes. `seed` still prints the banner (`build-content.ts:66-71`). |
| SEC-8 `https:` on the CMS base | P2 | **DISSOLVED** (stands) | No configurable base. |
| SEC-9 environment detection fails open to "development" | P3 | **FIXED (verified)** | `vite.config.ts:489-494` throws when `VERCEL` is set and `VERCEL_ENV` is not; `config.ts:52-57` fails the content build the same way; test `config.test.ts:127-131`. Residual by design: a non-Vercel host with neither variable still builds as development. Live: system env vars are exposed (robots `Allow: /`, canonical on the project URL, debug flag folded to `false`). |
| SEC-10 `Access-Control-Allow-Origin: *` | P3 | **OPEN (undecided)** | Still on every 200, including HTML; platform-supplied; absent on 404s. Not in DECISIONS. |
| SEC-11 debug code ships, gated at runtime | P3 | **FIXED (verified live)** | `buildFlags.ts:46-47` is now a direct constant expression of the define; the `environment()` wrapper is gone. Live entry chunk: `const ai=!1` — no `"production"` or `"development"` literal survives in any chunk (0 hits across all ten). Parser *bodies* remain as dead code behind the boolean (`debugNavigation` 1 hit, `freezeEarth` 2, `model=` 1, `proto-sky` 2 — every one inside a function gated on the folded flag; the walk with all gate params set produced no debug UI and no warning). Residual: `stats.js` is still a production dependency, statically imported at `MurciaDebugTools.ts:2`; its class is in the Murcia chunk (2 hits), its use is gated. Bundle hygiene, not security. |
| SEC-12 forms: no `maxLength`, no consent, placeholder legal text | P3 | **OPEN, unchanged** | 0 `maxLength` in `src/components/`; both transports still reject in production (`auditSubmission.ts:42-48`, `contactSubmission.ts:23-28`); no consent control. The four form files have no diff since baseline. |
| SEC-13 build log echoes CMS values on validation failure | P3 | **OPEN, one new site** | `validate.ts:95,124,170,182,218,229` unchanged; `portableText.ts:209` now also quotes a rejected link `href` verbatim. Text bodies are still never printed. |
| SEC-14 emitter escaping untested | P3 | **OPEN** | `emit.ts:60-69` still correct (`JSON.stringify` + U+2028/9). No `emit.test.ts`; no test feeds U+2028, a backtick or `</script>` through `emitModule`. (The *blog head* emitter, a different layer, does have 23 hostile-input tests — `blogShell.test.ts`.) |
| SEC-15 `docs/audits/reports/` is a roadmap if visibility changes | org | **OPEN (accepted)** | `checks/audit-hygiene.ts:28,41,224-227` still pins the directory and runs inside `npm run check`, which `build` runs first. |
| SEC-16 mirror trusts CDN bytes and follows redirects | P3 | **OPEN, unchanged** | `mirror.ts` and `mirror.test.ts` have no diff since baseline; `source.ts:77-83` still uses `fetch`'s default `redirect: 'follow'`; no magic-byte check before `writeFileSync` (`mirror.ts:202`). Still never exercised against a real logo: every `logo`/`isotype` in the dataset is `null`. |
| ORG-1 site live and indexable in a "not publishable" state, untracked | P2 | **OPEN — and the content source is now proven** | Live: `robots.txt` `Allow: /` + sitemap (4 URLs); canonical/`og:url` on the project URL; no `noindex`; the live entry chunk still ships the placeholder phone (2 hits, one of them as the site's contact number), `tuempresa.com` (1) and the fictional brand satellites (`MANGO`, `CABIFY`). `docs/DECISIONS.md` still has no line naming the deployment URL, branch, protection state or content source (`grep vercel.app|protection` → 0 at HEAD and in the working tree). New this pass: the live blog chunk and the prerendered `og:image` tags name the **`development`** dataset, so production is built from `development`, not from `seed`. The readiness brief has still not been re-run against a deploy from the consolidated tree. |
| ORG-2 published = public, editor not told | P3 | **FIXED (verified)** | `sanity-studio/GUIA-EDITOR.md:30-40` «Publicar es hacerlo público» (names personal data and passwords as things with no home in the dataset); `docs/adr/011-the-cms-is-sanity.md:82-84` carries the rule and a new "how you would know it broke" line. Live keys of `blogPost` and `siteSettings` (anonymous read) contain nothing that looks internal. |
| DEP-1 build-tooling advisories | P3 | **OPEN, 2 → 3 (all dev-only)** | Root `npm audit`: vite 5.4.21 (GHSA-fx2h-pf6j-xcff high, GHSA-v6wh-96g9-6wx3, GHSA-4w7w-66w2-5vf9), esbuild 0.21.5 (GHSA-67mh-4wv8-2f99), and **new** browserslist 4.28.6 (GHSA-c83g-rgw3-j3cx high, GHSA-73wf-gq98-2v4g) — the last has a non-breaking fix. `npm audit --omit=dev` → **0**. No dependency changed since baseline (only `package.json` scripts). Studio: the same 7-finding accepted chain (§5). |
| API-2 SSRF via audit form `website` | blocking (future) | **OPEN, unchanged** | `AuditSection.tsx:186` regex unchanged; no backend. |
| API-3 no server-side form controls | blocking (future) | **OPEN, unchanged** | as SEC-12. |
| GIT-2 deployable tree not on GitHub | P0 (process) | **FIXED (stands)** | `origin/main` = `528dd42` = HEAD. 5 uncommitted entries, none configuration. |
| CMS-1 logo would fail the production build | P1 | **FIXED (stands)** | Mirror unchanged. |
| CMS-2 production fell back to fixtures by omission | P1 | **FIXED (stands)** | `config.ts:89-95` still fails a production build that names no source; `SANITY_DATASET` still has no default (`:112-115`), tests `config.test.ts:50-52,61-64,73-76`. |
| CFG-1 non-numeric timeout | P3 | **FIXED (stands)** | — |
| ASSET-3 `city-backdrop.glb` unreferenced | decision | **OPEN, unchanged** | Still tracked (207 KB), still 0 references outside audit reports, still served. Joined this pass by two more unreferenced files (§6). |
| OBS-1 no production error signal | launch blocker | **OPEN** | 0 telemetry/analytics/error-reporting hits in `src/`, both documents and `vercel.json`. |

**Correction to the 08-27 report.** It stated that `checks/architecture.ts` "fences
`sanity-studio/`". No such rule exists in `checks/` (grep `sanity|studio` → 0). The Studio is kept
out of the app by omission — `tsconfig.json` `include`, `vitest.config.ts` `include`, and the
absence of any `@sanity/*` dependency in the root `package.json` — which is sufficient (the live
bundle has 0 `sanity` strings other than the CDN host) but is not an asserted rule. It also stated
that the Sanity project id was "not in any tracked file (`git grep` → 0)". That is no longer true:
it is in five tracked files (§4). Both statements were true at `2f7d082`'s tree as far as this
pass can tell; the second changed with the blog fixtures.

---

## 1. Executive Security Assessment

**Classification: Generally safe with identifiable weaknesses** — unchanged, and closer to
"strong" than on either previous run.

Evidence for "generally safe":

- **No secret exists** in the working tree, in either ignored `.env` (project id + dataset only;
  no token exists anywhere), or in any of the 107 commits (pattern sweep of `git log --all -p`:
  only lockfile integrity hashes and a literal test fixture). No `.env*` was ever added to history.
  The local `old-state` branch is a bookmark at the previous baseline, fully contained in `main`.
- **The four carried one-line fixes are done and tested**, and the one that had to be checked in
  the shipped artifact (SEC-11) was: the debug flag compiles to a literal `false`, no environment
  literal survives in any chunk, and the crafted-query walk is inert on production.
- **The blog was built the way the pipeline already worked.** Route parsing accepts only a
  `[a-z0-9-]{1,64}` slug and one `?tema=` of the same shape; every `history` write is built from a
  validated route object; the article is a typed switch over the closed Portable Text vocabulary
  with no HTML sink; embeds are outbound links to an allow-listed host, never frames; the
  prerendered heads are text- and attribute-escaped, the JSON-LD is `<`-escaped, and every shell
  is verified against a checklist before it is written or the build fails. 159 unit tests cover
  the new code and pass.
- **The browser contacts two origins and both are accounted for**: its own, and `cdn.sanity.io`
  for blog images only. Image URLs are pinned to that origin by an anchored regex at ingest and
  by a parsed `URL.origin` compare at render; SVG is refused. No `fetch`, no storage, no cookies,
  no third-party script — verified live on both documents.
- **The write boundary on the CMS holds** (anonymous dry-run create → 403; dataset listing →
  401; drafts invisible; foreign `Origin` → 403) and both datasets contain only the fields the
  site renders.
- **Production dependencies have zero advisories**; every open advisory is in the local dev
  server or in CLI-only Studio code, unchanged in class.

The identifiable weaknesses, all narrow:

- **ORG-1 is the only P2 left**, and it is now the third report to carry it. The site is public,
  indexable, built from the `development` dataset, and ships placeholder contact data and
  fictional client names as real site copy. Nothing in `docs/` records any of that.
- **The CSP is still Report-Only** after three clean measurements, the latest covering the blog.
- **Three new P3s from the blog** (§3): the CDN image path is origin-pinned but not pinned to
  this project's own `images/<projectId>/<dataset>/` prefix (SEC-17); the local preview
  middleware's slug pattern is looser than the app's (SEC-18); a hostile editor can make the
  content build slow or fail, but never affect the live site (SEC-19). And one privacy note
  (PRIV-1): blog images are the first runtime data flow to a third party.

---

## 2. Threat Model

Unchanged from 08-27 except where stated. **New or changed items are marked ▲.**

**Assets.** The marketing site's integrity and availability (static HTML/JS/WASM/GLB/textures on
one origin, ▲ now two documents and per-post prerendered heads); the Vercel project; the private
GitHub repository; the Sanity project (datasets `development` — 22 published documents, live —
and `production` — public, empty; membership; hosted Studio); ▲ the `development` dataset's
image assets, which the live site now displays directly; the brand's reputation; visitors'
personal data once the forms are wired (today: none collected).

**Public surfaces.**
- `/` and `/debug` (one document); ▲ `/blog`, `/blog/<slug>` (second document; known slugs get
  their own prerendered head, unknown slugs get the index shell at HTTP 200); `public/` (30
  tracked files, 8.7 MB); `robots.txt`; `sitemap.xml` (▲ 4 URLs, one per post).
- The Sanity query API — anonymous read of every published document in both datasets.
- ▲ `https://cdn.sanity.io/images/<projectId>/development/…` — every uploaded image, by content
  hash, served to any request without an `Origin`; with a browser `Origin` only Sanity's default
  localhost is allow-listed (the production origin gets 403 — harmless for plain `<img>`, which
  sends no `Origin`; a blocker for any future `crossorigin`/canvas/`fetch` use).
- The hosted Studio (Sanity login; URL not derivable from the repo).

**Execution contexts.**
- *Browser* — React + Three.js on `/`; ▲ React only on a cold `/blog` (no three.js, no intro,
  no scene preloads: structurally, by being a different document); Draco/Basis workers from
  `blob:`; ▲ `history.pushState/replaceState/go` from `useRoute.ts`; no third-party script; ▲ one
  third-party origin for images.
- *Build (Node on Vercel)* — `content:build` → typecheck → tests → 9 harnesses → `vite build`
  → ▲ `blogRoutes` plugin writes `dist/blog/<slug>/index.html` from validated post metadata and
  the Vercel origin variable. Network in the build: Sanity query API and CDN only.
- *Studio* — unchanged.
- *Server-side at runtime* — nothing.

**Content sources.** Sanity `development` (default locally via `.env`, ▲ proven to be what
production builds from); `content/fixtures/` (Preview and no-`.env` default; ▲ now carries two
`cdn.sanity.io` image URLs and therefore the project id); `content/seed/` (byte-identical to
fixtures; banner).

**External services.** Vercel; GitHub; npm (292 + 991 lockfile entries, all
`registry.npmjs.org`); Sanity (Content Lake, ▲ CDN at runtime, hosted Studio).

**Environment variables / credentials.** Unchanged: `SANITY_PROJECT_ID`, `SANITY_DATASET`,
`SANITY_TOKEN` (documented, no value exists), `SANITY_TIMEOUT_MS`, `CONTENT_SOURCE`, Vercel's
`VERCEL`/`VERCEL_ENV`/`VERCEL_PROJECT_PRODUCTION_URL`, local `VITE_VERCEL_ENV`, never-set
`VERTIGO_SKIP_BUDGETS`. ▲ `VERCEL` is now read (SEC-9 guard).

**Attacker classes and reach today.**

| Attacker | Reach |
|---|---|
| Anonymous visitor / bot | static files; query params inert in production (verified with every gate set); forms send nothing; ▲ any `/blog/<slug>` is a 200 (client-side not-found); can read the whole published dataset over the Sanity API (by design) |
| Malicious embedding site | blocked (`X-Frame-Options: DENY`, `frame-ancestors 'none'`); assets CORS-readable; Sanity API and CDN refuse foreign browser origins |
| Supply-chain attacker | npm only, two lockfiles, registry-only, one `postinstall` each (esbuild) |
| Compromised developer account / repo access | push to `main` → production, gated only by the build's own tests |
| Vercel env-var access | ▲ can no longer select fixtures for production (SEC-7) or strip `VERCEL_ENV` unnoticed (SEC-9); can still point `SANITY_DATASET` at the other public dataset, which is empty and would fail the build on the singleton checks |
| **Sanity member / compromised editor** | can publish any content that passes shape and bounds; ▲ can now put an image on the public site — but only from `cdn.sanity.io` (SEC-17 on the path), never SVG, only into `<img src>`; can make an embed card link to youtube/vimeo; ▲ can slow or fail the deploy with a pathological body (SEC-19); cannot inject markup, scripts, frames, non-https links, off-CDN media or unbounded text |
| Malicious Sanity (the vendor) | trusted at build time for content and mirrored logo bytes (SEC-16); ▲ trusted at runtime for image bytes served into `<img>` under the site's `nosniff` CSP-restricted page |
| Accidental developer mistake | still the main vector — §7 |

**Trust boundaries.** (1) Sanity response → `content/lib` + `content/collections`; (2)
`cdn.sanity.io` bytes → `public/logos/` (mirror) and ▲ → the visitor's `<img>` (runtime,
`img-src` allow-listed, no `crossorigin`); (3) build env → `readConfig()` / `BUILD_ENV`; (4)
compiled bundle and ▲ prerendered shells → browser; (5) `git push main` → production; (6) Sanity
login → dataset writes; ▲ (7) `location` → `route.ts` (the app's first URL parser).

---

## 3. Security Findings

IDs continue the existing scheme. Labels: **Confirmed vulnerability / Likely vulnerability /
Security weakness / Hardening opportunity**.

### P0 — Critical

None.

### P1 — High

None.

### P2 — Medium

---

**ORG-1 · The site is live and indexable in a state the readiness audit classed as not publishable; the deployment and its content source are recorded nowhere in the repository** — *Organisational weakness* — carried for the third time, evidence sharpened

- *Evidence:* `https://vertigo-marketing-website.vercel.app/` → 200; `robots.txt` `Allow: /` +
  `Sitemap:`; `sitemap.xml` lists `/`, `/blog` and two posts; canonical and `og:url` on that
  origin; no `noindex` in either document. The live entry chunk carries the placeholder phone
  as the site's displayed contact number and as the form placeholder, `tuempresa.com`, and the
  satellite labels `MANGO`/`CABIFY` (logos `null`). The live blog chunk and both prerendered
  `og:image` tags reference `cdn.sanity.io/images/<projectId>/development/…`, so **production is
  built from the `development` dataset**, whose `siteSettings` (contact e-mail, phone) are what
  the site shows. `docs/DECISIONS.md` (HEAD and working tree) has 0 lines matching `vercel.app`
  or `protection`; the working-tree edit adds only a gitignore rule. `production-readiness-vercel-*`
  has not been run since 08-20.
- *Why it stays P2:* untracked production state is the precondition for the brief's objectives
  15–16 (unauthorised code / accidental config changes). It is also the reason the previous two
  reports could not say what production was built from; this one can, but only by reading the
  bundle — nobody wrote it down.
- *Required capability:* none (public web). *Impact:* brand exposure with placeholder and
  fictional-client content indexed under real brand names; a future `SANITY_DATASET` flip to the
  empty `production` dataset would fail the build rather than ship an empty site (CMS-2, singleton
  checks), which is the right failure but still a surprise nobody documented.
- *Remediation:* (a) decide whether the deployment stays public (Vercel Deployment Protection or a
  `noindex` build until CONTENT-1); (b) add a "Deployments" section to `docs/DECISIONS.md`: URL,
  branch, protection, **content source per environment (today: `development`)**, last promoted
  commit — updated on every promote; (c) decide what the `production` dataset is for and write it
  down (seed it and switch, or delete it); (d) re-run the readiness brief against the live
  deploy. *Complexity:* small. *Verification:* the section exists; `grep vercel.app docs/DECISIONS.md`
  ≥ 1; the readiness report is dated after the blog deploy.

### P3 — Low

---

**SEC-17 · Blog image URLs are pinned to the Sanity CDN origin but not to this project's path** — *Security weakness* — new

- *Evidence:* the image URL is CMS-supplied (`asset->url` in the GROQ projection,
  `blogPosts.collection.ts:298-321`), validated at ingest by `media.ts:42`
  `^https://cdn\.sanity\.io/[\w./%-]+$` (anchored; refuses `?`, `#`, `@`, `\`, `:` after the
  origin), SVG refused at `:81-83`, and re-parsed at render by `sanityImage.ts:70-81`
  (`new URL`, `protocol === 'https:'`, `url.origin === SANITY_CDN_ORIGIN`). Neither check
  requires the path to begin `/images/<projectId>/<dataset>/`. There is also no positive
  extension allowlist (the logo mirror has one, `validate.ts:244-247`; the Studio `imageMedia`
  field has no `options.accept`).
- *Attack surface:* an editor or compromised Sanity account. *Exploitation path:* only if a
  `sanity.imageAsset` document's `url` can be pointed at another project's asset (Sanity manages
  asset documents; whether the mutation API lets a token forge one was **not verified** — this is
  the reason the finding is a weakness, not a vulnerability). *Impact:* content substitution — an
  image the project never uploaded, hot-linked with the site's `srcset` — into an `<img>` under
  `nosniff`; no script execution, no SVG. *Likelihood:* low.
- *Remediation:* extend `CDN_URL` to `^https://cdn\.sanity\.io/images/<projectId>/<dataset>/[\w.%-]+$`
  using the configured project and dataset from `readConfig()`, and mirror the same path check in
  `sanityImage.ts`'s `cdnUrl()`; add an extension allowlist (`png|jpe?g|webp|avif`) in `media.ts`
  and `accept` in the Studio field. While here, make `LOCAL_MEDIA_PATH` (`invariants.ts:74`)
  refuse `..` segments. *Complexity:* trivial. *Verification:* three ingest tests (foreign
  project path, foreign dataset path, `.gif`) and one render test.

---

**SEC-18 · The local preview middleware accepts any slug, including `..`** — *Hardening opportunity (dev/preview only)* — new

- *Evidence:* `vite.config.ts:319-329` `blogRouting()` matches `/^\/blog\/([^/]+)$/` and tests
  `fs.existsSync('dist/blog/' + slug + '/index.html')`; verified in node that `/blog/..` matches
  and resolves `dist/blog/../index.html`. The app itself uses `ID_PATTERN` (`route.ts:40`);
  production uses `vercel.json` rewrites and is unaffected.
- *Impact:* `vite preview` could serve a different file from under `dist/`. Nothing outside
  `dist/` is reachable through this path. *Remediation:* reuse `ID_PATTERN` in the middleware.
  *Complexity:* trivial.

---

**SEC-19 · A hostile editor can make the content build slow or fail** — *Security weakness (build availability, never the live site)* — new

- *Evidence:* (a) `validate.ts:57-63` runs `stripHtml` before the length bound, and
  `html.ts:113`'s `<(script|style)\b[^>]*>[\s\S]*?<\/\1>` is quadratic on repeated unterminated
  openers — a multi-megabyte field is stripped in full before it is rejected for length; (b)
  `portableText.ts:230` loops over a block's `children` without a cap (blocks per body are
  capped at 400, span text at 2000, tags at 8, title/excerpt at 120/300); (c) `invariants.ts:414-423`
  bounds the post *set* only by non-emptiness and duplicate ids, and the whole dataset rides one
  chunk under `BLOG_BUDGET_BYTES = 120_000` (`vite.config.ts:78,259-266`), so a large enough
  library fails the build on the budget.
- *Impact:* a failed or slow Vercel build; the previous deployment keeps serving. (c) will also
  be hit by a legitimate library one day. *Likelihood:* low. *Remediation:* reject
  `value.length > 4 * max` before stripping; cap spans per block (e.g. 200); decide how the blog
  scales past the budget (split the dataset per post or raise the budget deliberately).
  *Complexity:* small.

---

**PRIV-1 · Blog images are the first runtime data flow to a third party** — *Hardening opportunity (privacy)* — new

- *Evidence:* `BlogFigure.tsx:49-59` renders `<img src=… srcset=…>` on `cdn.sanity.io` with no
  `referrerpolicy` and no `crossorigin`; the site's `Referrer-Policy: strict-origin-when-cross-origin`
  sends the site origin (not the article path); the visitor's IP and user-agent reach Sanity's
  CDN on every article and on the index (cover images). Verified live: 2 CDN requests on
  `/blog`, 1 on the article. The CDN sets no cookie. Nothing else leaves the origin.
- *Why it is only P3:* a marketing site loading images from its CMS's CDN is ordinary and
  disclosed by the URL; the concern is that the privacy notice (CONTENT-1) now has a data flow to
  describe, and that the earlier reports' "the browser contacts one origin — its own" no longer
  holds. *Remediation:* `referrerPolicy="no-referrer"` on the blog `<img>`; name Sanity as a
  processor in the privacy text; record in ADR 013 that hot-linking (not mirroring) was chosen for
  the transforms. *Complexity:* trivial.

---

**SEC-2 · CSP is Report-Only, without a report endpoint** — *Hardening opportunity* — carried, measured clean three times

Policy is now the one the blog needs (`img-src` widened by exactly one origin). 0 violations on
`/`, `/blog`, `/blog/<slug>` and the crafted-query URL against the live build. Promotion to
`Content-Security-Policy` needs no policy edit. Pair with OBS-1 if a `report-to` is wanted.

---

**SEC-16 · The media mirror trusts the CDN's bytes and follows its redirects** — *Hardening* — carried, unchanged

`source.ts:77-83` default `redirect: 'follow'`; no magic-byte check before `mirror.ts:202`.
Still never exercised against a real logo. Remediation unchanged: `redirect: 'error'` and a
PNG/WebP magic-byte check, two tests.

---

**SEC-14 · Emitter escaping is correct but untested** — *Hardening* — carried

Add a round-trip test in `content/lib/` feeding U+2028/9, a backtick, `${` and `</script>`
through `emitModule` and importing the result.

---

**SEC-13 · Build log echoes CMS values on validation failure** — *Hardening* — carried, one new site

`validate.ts:95,124,170,182,218,229` and now `portableText.ts:209`. Bounded, non-text values
only. Truncate to ~80 chars in `Report.fail`. Low priority.

---

**SEC-12 · Forms: no `maxLength`, no consent control, placeholder legal text** — *Hardening* — carried (API-3 subset)

Harmless while both transports reject in production. Land with the endpoint (API-2/API-3),
together with the privacy text that now has to mention Sanity (PRIV-1).

---

**SEC-11 residual · `stats.js` is a production dependency, statically imported** — *Hardening* — carried

`MurciaDebugTools.ts:2` static import; class present in the live Murcia chunk, use gated.
`await import('stats.js')` inside the gated `mountStats()` and move it to devDependencies.

---

**SEC-9 residual · non-Vercel hosts still default to development** — accepted by design.

---

**SEC-10 · `Access-Control-Allow-Origin: *`** — *Hardening* — carried, undecided. Decide and
record.

---

**SEC-3 · `__vertigoBootDebug`** — accepted, unchanged.

---

**SEC-15 · `docs/audits/reports/` visibility** — accepted, unchanged. This report adds the
shape of the blog route parser and the CDN path gap; no values, no ids, no exploits.

---

**DEP-1 · Build-tooling advisories** — carried, one non-breaking fix available (§5).

---

## 4. Secret Exposure Report

| Item | Where | Class | Action |
|---|---|---|---|
| Any credential value (keys, tokens, passwords, JWTs, PEM, cookies, `user:pass@`) | working tree incl. `docs/`, `public/`, `dist/`, `out/`, `coverage/`, `.claude/`, `.codegraph/` (binary, grepped), generated, `sanity-studio/` incl. its `dist/`/`.out/` (excl. `node_modules`); all 107 commits (`git log --all -p` pattern sweep — only `package-lock.json` integrity hashes and a literal `sk-test-value` test fixture matched); all ten live chunks | **none found** | none |
| `.env` (root) | ignored (`.gitignore:22`); `SANITY_PROJECT_ID` + `SANITY_DATASET` only — **no token** | public identifiers | none |
| `sanity-studio/.env` | ignored; `SANITY_STUDIO_PROJECT_ID` + `_DATASET` | public identifiers, compiled into the Studio bundle by design | none |
| `.env.example` | values empty; no `.env*` ever added to history (`git log --all --diff-filter=A`) | compliant | none |
| Sanity project id (8 chars) | **now in 5 tracked files**: `content/fixtures/blogPost.json`, `content/seed/blogPost.json`, `src/blog/sanityImage.test.ts` (as `cdn.sanity.io/images/<id>/development/…` URLs), `docs/PROJECT_MEMORY.md:1844`, `docs/audits/reports/website-performance-and-optimization-2026-08-27.md:21`; also in the live blog chunk (4) and both prerendered heads | **public by design** — it is the hostname of every API URL and a path segment of every image the site serves | none required. The 08-27 statement "not in any tracked file" is superseded. The hygiene contract does not list it; this brief's habit of not printing it is kept here, but the project should decide once whether the id is redacted in docs or not, because half-redaction is what produces stale claims |
| Hosted Studio `appId` | `sanity-studio/sanity.cli.ts` | public identifier | none |
| `SANITY_TOKEN` | documented in `.env.example`; **no value exists anywhere**; not set locally | — | when one is created: read-only, Production scope only, never `VITE_`; the code already refuses to put it in a URL or a banner |
| Future Deploy Hook URL | not created | will be a secret | Vercel-side only |
| Brand contact e-mail, placeholder phone | `content/fixtures/siteSettings.json`, `content/seed/`, `legalDoc.json`, the live dataset (anonymous read), the live bundle | placeholder / role address, public by design; the phone is placeholder-shaped | swap before launch (CONTENT-1) |
| Six real company names as fictional clients | `content/fixtures/caseStudy.json`, seed, live dataset, live bundle | demo content presented as case studies on a public site | CONTENT-1 |
| Repo owner's GitHub handle; author e-mail in commits | Git metadata | public by design | none |
| `.claude/settings.json` (tracked), `CLAUDE.md` (tracked) | plugin enablement only; conventions only; no hooks, allowlists, paths or URLs | restricted but safe | none |
| Local absolute paths | ignored `coverage/`, `test-results/`, `out/`, `sanity-studio/dist/` | never leave the machine | none |
| Extraneous `sharp` (+5) in `node_modules/` | installed with `--no-save` for the asset scripts, documented in `prepare-sky-panorama.mjs:5-9`; not in any lockfile | local-only tooling | none |

No rotation and no history remediation is required.

---

## 5. Supply-Chain Assessment

**Application (`package.json`).** No dependency changed since baseline (`git diff 2f7d082..HEAD
-- package.json` touches scripts only; lockfile untouched and consistent, `npm ls` clean).
`npm audit`: 3 advisories, **0 against the production tree** (`npm audit --omit=dev` → 0).

| Advisory | Package | Exposure class |
|---|---|---|
| GHSA-fx2h-pf6j-xcff (high, `server.fs.deny` bypass, Windows), GHSA-v6wh-96g9-6wx3, GHSA-4w7w-66w2-5vf9 | vite 5.4.21 | developer machine, `npm run dev` only; fix is the Vite major |
| GHSA-67mh-4wv8-2f99 dev-server CORS | esbuild 0.21.5 | developer machine |
| GHSA-c83g-rgw3-j3cx (high, unbounded memory), GHSA-73wf-gq98-2v4g (`stats.json` prototype write) | browserslist 4.28.6 (transitive dev) | build tooling, inputs are the project's own config; **non-breaking fix available** |

Node 22.20.0 / npm 10.9.3; `.nvmrc` and `engines` agree. Lockfile v3, 292 entries, all
`registry.npmjs.org`, no git/tarball/file deps, no `overrides`. Install hooks: only `esbuild`
`postinstall` (binary fetch); the 24 `prepare` scripts npm never runs for dependencies.

**Studio (`sanity-studio/package.json`).** No dependency or lockfile change since baseline
(8 schema/doc files changed). `npm audit`: 7 (1 high, 6 moderate) — the same chain accepted in
`sanity-studio/README.md` §"Dependency audit" (`@sanity/cli → @vercel/frameworks → js-yaml`,
`smol-toml`; `@sanity/cli → typeid-js → uuid`), CLI-scaffold code that `sanity dev|build|deploy`
never loads. `js-yaml` now carries four advisory ids instead of one; same package, same
position, same rationale. Fix offered is still a breaking downgrade; do not. Lockfile v3, 991
entries, registry-only; one `postinstall` (esbuild).

**Package scripts and local execution.** No `child_process`/`exec`/`spawn` anywhere in
`scripts/` or `checks/`; no downloaded binaries; no `.npmrc`. New since baseline: `scripts/blogShell.ts`
(**on the build path**, pure string functions, 23 hostile-input tests), `screen-sky-source.mjs`
(reads argv paths via `sharp`, writes nothing), `lib/sky-metrics.mjs` (pure), `proto/capture-boot.mjs`
(hand-run Playwright capture; `mkdirSync` + writes to an **unvalidated argv path** — informational,
it is a developer's own tool against localhost). `prepare-*.mjs` changes are quality/metrics only.
Studio `import-fixtures` still only writes `.out/seed.ndjson` and prints the destructive
`dataset import --replace` command for a human to type (§7).

**CI/CD.** No `.github/`, no workflow files anywhere. Deployment is Vercel's Git integration on
`main`; branch protection is not observable from the repository.

**Third-party runtime.** No script. ▲ One third-party origin for images (`cdn.sanity.io`),
declared in the CSP, plain `<img>` only (PRIV-1). Self-hosted fonts (`public/fonts/`, six
subsetted woff2, SIL OFL 1.1 credited in `CREDITS.md:157-171`, `font-src 'self'` unchanged).

---

## 6. Deployment Security Assessment

| Area | State (verified live 2026-09-02 ~10:00 UTC unless noted) |
|---|---|
| Deployment | production at `vertigo-marketing-website.vercel.app`; the blog is deployed (`/blog` → blog document; two prerendered post pages); edge cache fills seen from 05:57 UTC so the deploy predates that; Vercel `Last-Modified` reflects cache fill, not build time, so the exact build time is **not** derivable; local `dist/` ≠ production (different chunk hashes; it was being rebuilt by another session during this pass) |
| Build path | production-path confirmed: robots `Allow: /` + `Disallow: /debug` + sitemap; canonical/`og:url` on the project URL; no `noindex`; debug flag `const ai=!1`; no env literal in any chunk; no `sourceMappingURL`; system env vars exposed |
| Headers (all 200s) | `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic/geo/payment/usb/interest-cohort off), CSP **Report-Only** (SEC-2), HSTS (platform, 2 y, preload), `Access-Control-Allow-Origin: *` (platform, SEC-10). COOP/CORP absent (SEC-5). `Cache-Control`: immutable 1 y on `/assets/` and `/fonts/`; 1 day + SWR on the asset dirs; `max-age=0, must-revalidate` on HTML and `og-default.png`. `.wasm` → `application/wasm`; `.woff2` → `font/woff2`; `.glb` → `model/gltf-binary` |
| Documents | `/`: 2 module scripts, 0 inline scripts, 1 inline `<style>` (background; allowed), 7 modulepreload, 8 image + 2 fetch preloads, all same-origin. `/blog`: 1 module script, 0 inline script/style, 2 font preloads. `/blog/<known>`: own title/canonical/`og:image` (absolute, CDN, `development`). `/blog/<unknown>`: index shell at **200** with canonical `/blog` (soft-404 — SEO, not security). `/debug`: index document (200); `/debug/` 404. Shipped HTML comments name internal files and plan numbers — low-value disclosure, unchanged in kind |
| Public files | 30 tracked (8.7 MB). Not deployed: `public/proto-sky/` (ignored; **621 MB in local `dist/`**, `/proto-sky/…` → 404 live), `sky-test-*`, `logos/*`. `/logos/.gitkeep` → 200, 0 bytes (cosmetic). No `.map` (all ten chunk maps → 404), `.log`, `.json`, `.md` under `public/`. **Unreferenced tracked files shipped:** `models/city-backdrop.glb` (ASSET-3, 207 KB) and — new in `4e590d0` — `textures/sky-panorama - narrow.avif`/`.webp` (721 KB, byte-identical to the referenced `sky-panorama.avif`/`.webp`, filenames with spaces). Weight, not security; `git rm` |
| Sensitive paths | `/.env`, `/.env.example`, `/.git/HEAD`, `/.git/config`, `/package.json`, `/package-lock.json`, `/vercel.json`, `/vite.config.ts`, `/tsconfig.json`, `/CLAUDE.md`, `/docs/…` (3), `/content/fixtures/blogPost.json`, `/src/…` (2), `/sanity-studio/` (2), `/logos/`, `/proto-sky/` (2), `/textures/`, `/fonts/`, `/assets/`, `/out/`, `/coverage/`, `/test-results/`, `/index.html.map` → all 404 |
| Routes | `/`, `/debug`, ▲ `/blog`, `/blog/:slug` (rewrites to `blog.html`; filesystem wins for known slugs); no functions, no redirects |
| Environment separation | Preview keeps debug tools + demo transport by design; production drops both (verified). ▲ Production content source **is `development`** (bundle evidence). Which variables are set where in Vercel: still not verifiable from the repo |
| Production secrets during builds | none exist |
| Preview deployments | none on the remote (only `main`). SEC-1 no longer applies to them |
| Deployment permissions | Vercel Git integration; no repo-side evidence of branch protection; no Deploy Hook |
| Sanity project | `development`: public read, 22 published docs, 7 types, 0 drafts visible; `production`: public read, empty; anonymous dry-run create → 403; dataset list → 401; query API with foreign `Origin` → 403 and with the site's own origin → 403 (correct: the site never calls it). ▲ CDN: image → 200 with no `Origin`; `Origin: <site>` → 403; only Sanity's default localhost is allow-listed with credentials. API version pinned `2026-08-23` in code. Members, tokens, webhooks, CORS list: **not verifiable** |
| Hosted Studio | not probed (hostname not in the repo) |

---

## 7. Organizational / Structural Security Risks

1. **Deployment state is still not in the repository (ORG-1), three reports running.** The
   difference this time is that the missing fact — which dataset production reads — is now
   readable from the public bundle. Write it down before someone "fixes" it.
2. **The "Immediate" list finally cleared** — SEC-1, SEC-7, SEC-9, SEC-11 landed as their own
   changes with tests, as 08-27 §7 item 2 asked. Record that this is the working pattern.
3. **ORG-2 closed the right way**: the rule lives in the editor's guide, in the ADR, and in the
   ADR's "how you would know it broke" list. The anonymous read of both datasets confirms the
   field set matches.
4. **Two public datasets, one empty, one live, chosen by an environment variable** — unchanged.
   The `production` dataset has no stated purpose; ADR 011 now warns that seeding it is publishing.
   Decide (ORG-1 c).
5. **`sanity dataset import --replace` is still guarded by prose only** (`README.md:71`,
   `import-fixtures.mjs:122-127`). Adequate while one person edits; before the client edits, make
   the script refuse a non-empty dataset or remove the runbook line.
6. **The blog fixtures now embed live-dataset image URLs.** `content/fixtures/blogPost.json` and
   `content/seed/blogPost.json` reference `cdn.sanity.io/images/<projectId>/development/…`, so a
   fixture/seed build hot-links the *development* dataset's assets, and "fixtures are offline" is
   no longer quite true for the blog. Not a security issue; a coupling to document.
7. **The project id is half-redacted.** It is public by design and now in five tracked files,
   while two reports and a memory rule say not to print it. Pick one rule (§4).
8. **Another session builds in this working tree while audits run.** During this pass a
   concurrent session rebuilt `dist/` and ran `vite preview`. Ignored output only, no tracked
   change — but a live-header-vs-local-dist comparison is meaningless under those conditions, and
   two agents editing the same tree is how an unrelated change rides into a deploy. Serialise.
9. **No second pair of eyes on the deploy path** — unchanged, accepted for the size.
10. **`docs/audits/reports/` visibility** — governed by a README rule and a harness (SEC-15).
11. **Three fail-open environment states became two** (SEC-7 and SEC-9 are now impossible;
    `VERTIGO_SKIP_BUDGETS` remains, documented as never-set).

---

## 8. Remediation Plan

**Immediate (hours)**
1. ORG-1: add the "Deployments" section to `docs/DECISIONS.md` (URL, branch, protection,
   content source per environment = `development`, last promoted commit); decide public vs
   protected; decide the `production` dataset's purpose.
2. SEC-17: pin the CDN path to `/images/<projectId>/<dataset>/` at ingest and render; add the
   extension allowlist; refuse `..` in `LOCAL_MEDIA_PATH`. Four tests.
3. SEC-1 test literal: `'/\\evil.example/x.glb'`.
4. DEP-1: apply the non-breaking browserslist fix.

**Short-term engineering (days)**
5. SEC-2: promote the CSP; re-run the headless walk on `/` and `/blog/<slug>`.
6. SEC-18: `ID_PATTERN` in `blogRouting()`.
7. SEC-19: length-before-strip guard, spans-per-block cap, blog scaling decision.
8. PRIV-1: `referrerPolicy="no-referrer"` on blog images; note the flow in ADR 013 and in the
   privacy text.
9. SEC-16: `redirect: 'error'` + magic bytes in the mirror. SEC-14: emitter round-trip test.
10. `import-fixtures` non-empty-dataset guard (§7 item 5). `git rm` the three unreferenced
    public files (ASSET-3 + the two `- narrow` duplicates).
11. `stats.js` dynamic import / devDependency (SEC-11 residual).

**Architectural**
12. Form endpoint (API-2/API-3, SEC-12) as one change: server-side validation, SSRF controls,
    rate limiting, consent + privacy notice (naming Sanity) + retention; `form-action`/`connect-src`.
13. Sanity → Vercel Deploy Hook (ADR 011 Phase 8): the hook URL is the first real secret.
14. OBS-1 + `report-to` as one deliberate external origin.
15. DEP-1: the Vite major, as its own pass.

**Operational**
16. Re-run the production-readiness brief against the live deployment (blog included).
17. Decide SEC-10 and the project-id redaction rule; record both.
18. Serialise sessions that build in this tree (§7 item 8).

---

## 9. Verification Results and Not Verified

**Verified (executed in this pass)**

| Check | Result |
|---|---|
| `git rev-parse HEAD`, `git status --short`, `git remote -v`, `git branch -a`, `git log --oneline` | `528dd42` = `origin/main`; 5 modified tracked files (user WIP, unchanged throughout the pass); 107 commits; local `old-state` = `2f7d082`, 0 commits not in `main` |
| `git diff --name-status 2f7d082..HEAD` | 167 files; the blog, fonts, `og-default.png`, `vercel.json`, `vite.config.ts`, `config.ts`, `buildFlags.ts`, `appConfig.ts`, ADR 013, GUIA-EDITOR |
| Secret sweep of the working tree (14 patterns; all dirs incl. `docs/`, `public/`, `dist/`, `out/`, `coverage/`, `.claude/`, `.codegraph/` binary, generated, `sanity-studio/` sans `node_modules`) | 0 credential hits; benign hits enumerated (rule text, header-assembly code, one literal test fixture, minified vendor/design bundles) |
| `git log --all -p` with the same patterns; `git log --all --diff-filter=A` for `.env*`/keys | only lockfile integrity hashes and the test fixture; only `.env.example` ever added |
| `.env`, `sanity-studio/.env` (names and value-presence only), `.env.example`; `git check-ignore -v` on both `.env`s, `dist/`, `out/`, `coverage/`, `test-results/`, `public/proto-sky/`, `public/textures/sky-test-*`, `public/logos/*`, Studio `node_modules/dist/.sanity/.out` | project id + dataset only; no token; example values empty; all ignored |
| `git grep -F -l <projectId>` | 5 tracked files (§4) |
| `npm audit --json`, `npm audit --omit=dev`, `npm query` (install hooks), `npm ls --depth=0`, lockfile resolved-host scan — root and Studio | 3 dev / 0 prod / esbuild only / 292 registry-only, `sharp` extraneous; Studio 7 (README chain) / esbuild only / 991 registry-only |
| `git diff 2f7d082..HEAD -- package.json package-lock.json vercel.json sanity-studio/` | scripts only; lockfile untouched; rewrites + `img-src` + fonts cache; 8 schema/doc files |
| Source verification of every prior finding (files and lines as cited in §0) | as quoted |
| `node` run of `sameOriginModelPath` with the SEC-1 payloads; `node` run of the preview slug regex with `/blog/..` | rejected / matched (SEC-18) |
| Sink grep of `src/`, `scripts/`, `index.html`, `blog.html` (HTML/script/style/URL/navigation/history/network/storage/env) | 2 `innerHTML` (known); new blog sinks all validated (§0 SEC-4); 0 `fetch`/XHR/WS/beacon/storage/cookie/`import.meta.env`/`postMessage`/`window.open`/`eval`/`new Function`/`document.write` |
| Blog trace: `route.ts`, `useRoute.ts`, `blogHistory.ts`, `entries/blog.tsx`, `BlogRoute.tsx` (HEAD and working tree), `PostBody.tsx`, `textSpans.tsx`, `BlogFigure.tsx`, `MediaCard.tsx`, `sanityImage.ts`, `blogFilter.ts`, `blogPosts.collection.ts`, `media.ts`, `portableText.ts`, `readingTime.ts`, `blogPolicy.ts`, `invariants.ts`, `blogShell.ts`, `vite.config.ts` (758 lines, in full), `checks/architecture.ts`, Studio `blogPost.ts`/`slug.ts`/`richText.ts`/`media.ts` | as §3 and §0; working-tree diff in `src/blog` is UI-only |
| `npx vitest run` on `src/blog`, `src/app/route.test.ts`, `src/app/blogHistory.test.ts`, `scripts/blogShell.test.ts`, `content/collections`, `appConfig.test.ts`, `config.test.ts`, `protoSky.test.ts` | 230 tests, all pass (159 + 71) |
| `curl` headers on live `/`, `/blog`, `/blog/<known>`, `/blog/<known>/`, `/blog/<unknown>`, `/blog.html`, `/blog/`, `/debug`, `/debug/`, entry chunk, one woff2, `og-default.png`, two GLBs, sky AVIF, draco WASM, `robots.txt`, `sitemap.xml`; CSP compared to `vercel.json` in node | as §6; CSP identical (306/306) |
| Probes of 31 sensitive paths and all ten chunk `.map`s | all 404; `/logos/.gitkeep` 200 |
| Live `/`, `/blog`, `/blog/<slug>` HTML inventory (scripts, links, meta, inline blocks, origins) | as §6 |
| Ten live chunks + two CSS downloaded (≈1.5 MB) and grepped for 25 patterns | as §0 SEC-11 / ORG-1 / §4; `const ai=!1`; 0 sourcemap/`VITE_`/`SANITY_`/`api.sanity.io`/localhost/env-literal/token-shape |
| Headless Chromium (project's Playwright, swiftshader) on `/` (20 s + wheel), `/blog`, `/blog/<slug>`, and `/?model=x&debug=1&stats=1&debugNavigation=1&sky=c&holo=1&skyImage=x` | **0** `securitypolicyviolation`, 0 page errors, cookies/storage 0/0/0 on all four; origins: self only on `/` and the crafted URL (34 requests), self + `cdn.sanity.io` on the blog (2 and 1 image requests); no debug UI on the crafted URL |
| Sanity query API, anonymous, `development` and `production`: published count, draft count, type list, `blogPost` and `siteSettings` key names | 22 / 0 / 7 types; 0 / 0 / none; keys contain nothing internal-looking |
| Sanity mutate API, anonymous, `dryRun=true` create | 403 — nothing written |
| Sanity `GET /datasets`, anonymous | 401 |
| Sanity query API and CDN with `Origin: https://evil.example`, the site's origin, and `http://localhost:3333` | API: 403 / 403 / —; CDN: 403 / 403 / 200 + allow-origin with credentials |
| `diff -rq content/fixtures content/seed`; `cmp` of the two `- narrow` sky files against the referenced ones; `git ls-files public` + per-file reference grep | identical; identical; 30 files, 3 unreferenced |
| `docs/DECISIONS.md` (HEAD + working tree) grep for deployment facts; `GUIA-EDITOR.md`, ADR 011 diff; `CREDITS.md` diff; `.claude/settings.json`, `CLAUDE.md` contents; `checks/audit-hygiene.ts` wiring | ORG-1 open; ORG-2 closed; OFL credited; nothing sensitive; harness on the gate |
| `npm run check:audit` on this report | run after writing — see the closing note of the job |

**Not verified**

- **Vercel dashboard state**: Deployment Protection; which Sanity variables are set in which
  environment; build logs and build time; collaborators; Deploy Hooks. Needs dashboard or CLI
  access. (Production's dataset is inferred from the bundle, not read from Vercel.)
- **GitHub settings**: branch protection, required reviews, collaborators.
- **Sanity project settings**: members, roles, tokens, the CORS allowlist beyond what probing
  shows, webhooks; **whether the mutation API lets an editor forge a `sanity.imageAsset` `url`**
  (the premise SEC-17 depends on) — needs a token and a throwaway dataset.
- **The hosted Studio**: hostname not in the repo; not opened.
- **CSP in enforcing mode**: only Report-Only observed (0 violations, three passes).
- **The mirror against real bytes**: still no logo in the dataset.
- **A Preview deployment**: none exists on the remote.
- **The Murcia phase under the headless walk**: two wheel steps stayed in the Earth phase; the
  city's requests were not exercised this pass (they were on 08-27).
- **Local `dist/` vs production**: `dist/` was rebuilt by a concurrent session during the pass;
  the comparison was abandoned.
- **Browsers**: headless Chromium (software GL) only.
- **No fuzzing, no SBOM beyond `npm audit`**; `three`, React and `sanity` not audited as code.

**Brief gaps:** Phase 4 still describes the WordPress pipeline (unamended since 08-20 and
08-27; it should name ADR 011 and 013, `content/lib/{config,sanity,mirror,portableText}.ts`,
`scripts/blogShell.ts`, and the Sanity contracts). New this run: (1) **a build-time HTML emitter**
(`blogShell.ts` writing per-post documents) is a sink class the brief does not name — it belongs
in Phases 4 and 5 alongside "generated source modules"; (2) **runtime hot-linking from the CMS
CDN** is an external asset origin that Phases 8 and 18 should call out explicitly, since it is
where a "the browser contacts one origin" claim quietly stops being true; (3) the anonymous-API,
second-package and Portable-Text gaps from 08-27 are still unamended; (4) the brief assumes a
quiet working tree — it should ask the auditor to confirm no other session is building in it.
