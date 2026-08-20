# Security Audit — current surface and the WordPress API seam

Audited: 2026-08-11 · against working tree at commit `5f459bc` + uncommitted changes
Scope: the whole repository, read-only. **No code was changed in this pass.**
Question asked: *what is exploitable today, and what becomes exploitable when a WordPress
API is wired in?*

---

## Executive Summary

**Today the attack surface is genuinely small, and mostly by design rather than by luck.**
Nothing in `src/` calls `fetch`, opens a socket, reads a cookie, or touches
`localStorage`. There are no secrets in the repository, no environment variables read at
runtime, and exactly one origin is contacted: its own. Content is rendered as React text
nodes and `textContent` throughout, so there is no HTML sink fed by data. The debug
affordances are compiled out of production by a build-time literal, the `?model=` override is
constrained, and `createBrandAtlas` already carries a canvas-taint probe written specifically
for the day the logo URLs point at a CMS. Most of the work this audit would otherwise
recommend has already been done.

**One live defect was found.** `SEC-1`: the same-origin guard on `?model=` is bypassable
with a backslash, because the URL parser treats `\` as `/` for http/https. It is gated behind
`DEBUG_TOOLS_ENABLED`, so production is unaffected — but Preview deployments keep the debug
tools deliberately, and preview links get shared. Verified with a reproducer.

> **Read the 2026-08-20 addendum below before acting on the `API-*` findings.** The integration
> was built as a build-time pipeline rather than a runtime fetch, which closes or dissolves six of
> the eight. The three form-related ones are unaffected and still blocking.

**The rest of the risk is entirely in front of you, not behind you.** Connecting WordPress
adds, in one change, all four of the things this codebase currently does not have: a foreign
origin, HTML authored by someone else, a write endpoint that accepts personal data, and a
server that will fetch a URL a stranger typed. Each of those maps to a finding below. Three
are rated **blocking** — they must land in the same change as the integration, not after it:

- `API-1` — WordPress REST returns pre-rendered HTML (`content.rendered`). Rendering it
  through `dangerouslySetInnerHTML` would be stored XSS with the CMS as the injection point.
- `API-2` — the audit form's `website` field accepts private and link-local addresses, and
  the whole point of the form is that a server will later fetch that URL. That is SSRF.
- `API-3` — the form collects name, email, phone and company URL. Client-side validation is
  UX; the endpoint needs its own validation, CSRF protection, rate limiting, and a lawful
  basis under GDPR/LOPDGDD before it accepts a single submission.

**The CSP is still `Report-Only` and has never been observed on a real deployment**
(production-readiness audit, §Not verified). That was an acceptable position for a site that
contacts one origin. It stops being acceptable the moment a second origin exists, because the
policy you are about to depend on has never actually blocked anything. Promote it on a
Preview *before* the API work starts, not after.

---

## What was examined

Discovered from the repository, not assumed.

| | |
|---|---|
| **Network calls in `src/`** | none — no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` |
| **Storage / cookies** | none — no `localStorage`, `sessionStorage`, `document.cookie` |
| **Secrets** | none found in `src/`, `public/`, `scripts/`, `checks/`, or config |
| **Runtime env vars** | none. `import.meta.env` is read nowhere in `src/` (deliberate — see `PROJECT_MEMORY.md`) |
| **HTML sinks** | two `innerHTML`, both currently safe (`SEC-4`). No `dangerouslySetInnerHTML`, no `eval`, no `new Function`, no `document.write` |
| **External origins** | none. All models, textures, decoders and fonts are same-origin or system |
| **Untrusted input accepted today** | URL query parameters (debug-gated) and the audit form (which goes nowhere) |
| **Security headers** | `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, CSP **Report-Only** |
| **Dependency advisories** | 9 (2 high, 7 moderate) — all in build/dev tooling, none shipped (`DEP-1`) |

---

## Findings — live today

---

**SEC-1 · Security · The `?model=` same-origin guard is bypassable with a backslash**

*Affected:* `src/experiences/murcia/config/appConfig.ts:97-106`

*Evidence:* the guard is `/^\/(?!\/)/`, which correctly rejects absolute URLs and
protocol-relative `//host/...`. But the WHATWG URL parser treats `\` as `/` for special
schemes, so a single backslash after the leading slash produces an authority:

```
input: /\evil.com/x.glb | regex_pass: true | resolves: https://evil.com/x.glb
```

The value is passed to `GLTFLoader.load()` unchanged (`MurciaExperience` → `loadCity`).

*Impact:* **Not reachable in production.** `applyQueryOverrides` returns early unless
`debugTools` is true, and `DEBUG_TOOLS_ENABLED` is a compile-time `false` there. It *is*
reachable on every Preview deployment, which keeps the tools on purpose and whose URLs are
shared as links. The consequence is that the page fetches and parses a third-party GLB
through Draco/WASM — a binary parser surface and a request to an attacker-chosen host, not
script execution. The comment above the guard states the intended property ("A single leading
slash rules out both absolute URLs and protocol-relative `//host/...` ones"); the code does
not achieve it.

*Recommended action:* stop pattern-matching the string and compare resolved origins —
`new URL(model, location.origin).origin === location.origin` — which is immune to backslash,
tab, newline and percent-encoding variants at once. Keep the existing `console.warn` on
rejection.

*Status:* `OPEN` — not changed, per the read-only scope of this audit.

---

**SEC-2 · Security · The CSP has never been enforced, and is about to be depended on**

*Affected:* `vercel.json:16`

*Evidence:* the header is `Content-Security-Policy-Report-Only`. The production-readiness
audit records the reason (a wrong CSP breaks WebGL silently, so it ships in Report-Only until
a Preview confirms zero violations) and also records that this confirmation has never
happened — no deployment existed at the time.

*Impact:* today, low: with one origin and no HTML sinks there is little for a CSP to stop.
The problem is sequencing. `API-4` will require editing `connect-src` and `img-src`, and
editing an unverified policy means the first time it is enforced is also the first time it is
carrying load.

*Recommended action:* promote to the enforcing header on a Preview **before** any API work
begins, walk the full flow (intro → Earth → satellite → audit panel → Murcia → return), and
confirm the Draco and Basis workers still decode. The exact steps are already written in the
production-readiness runbook, §"Promoting the CSP". Do that first; treat it as a prerequisite
for the integration rather than part of it.

*Status:* `OPEN`.

---

**DEP-1 · Supply chain · Nine advisories in build tooling, two of them Windows-specific**

*Affected:* `package.json`, `package-lock.json`

*Evidence:* `npm audit` on the committed lockfile:

| Package | Advisory | Severity |
|---|---|---|
| `vite` ≤6.4.2 | `server.fs.deny` bypass on Windows alternate paths (GHSA-fx2h-pf6j-xcff) | high, CVSS 7.5 |
| `vite`/`launch-editor` | NTLMv2 hash disclosure via UNC path handling on Windows | moderate |
| `vite` ≤6.4.1 | path traversal in optimized-deps `.map` handling | moderate |
| `esbuild` ≤0.24.2 | any website can send requests to the dev server and read the response | moderate |
| `nanoid` <3.3.17 | infinite loop on zero-size custom generators | high |
| `postcss` ≤8.5.22 | arbitrary `.map` read via attacker-controlled `sourceMappingURL` | moderate |
| `potrace` → `jimp` → `phin` | sensitive headers retained across redirect | moderate |

*Impact:* **none of this reaches a visitor** — every affected package is dev or build-time,
and the production dependency tree (`react`, `react-dom`, `three`, `@react-three/fiber`,
`gsap`, `stats.js`) is clean. The exposure is to the *developer machine*: the two
Windows-specific ones and the esbuild dev-server issue all apply while `npm run dev` is
running on this OS, and the esbuild one means a browser tab visiting a hostile page can read
project source out of the dev server.

*Recommended action:* the `vite` and `esbuild` fixes are semver-major (`vite` 8, `esbuild`
0.28), so this is a scheduled upgrade, not a patch — and `vite.config.ts` leans on plugin
APIs (`generateBundle`, `transformIndexHtml` ordering, `manualChunks`) that need re-verifying
against a new major, along with both bundle-budget assertions. `nanoid` and `postcss` are
transitive and fixable in place. `potrace` is only used by `scripts/trace-isotype.mjs`, a
one-off asset tool; it does not need to be a dependency of the app at all. Until then, avoid
browsing untrusted sites while the dev server is bound.

*Status:* `OPEN`.

---

**SEC-3 · Exposure · Diagnostic globals ship to production and are DOM-clobberable**

*Affected:* `src/intro-draw/boot.ts:118-136`

*Evidence:* `window.__vertigoBootDebug` is installed unconditionally, and the module memoises
itself with `window.__vertigoIntro ??= boot()`.

*Impact:* the debug object exposes only boot progress and is documented as a deliberate
production diagnostic — that judgement is sound and this finding does not dispute it. The
`??=` is the part worth noting: named property access means an injected element with
`id="__vertigoIntro"` satisfies the nullish check, `boot()` never runs, and every subsequent
`intro.handle` access throws. Exploiting it requires HTML injection, which is precisely what
`API-1` is about — so it is not an independent vulnerability, it is an amplifier that turns a
future content-injection bug from "escaped text" into "the site does not load".

*Recommended action:* no change needed while `API-1` holds. If HTML from the CMS is ever
rendered, guard with a type check (`window.__vertigoIntro?.handle ? ... : boot()`) rather than
truthiness.

*Status:* `ACCEPTED` — noted, no action recommended today.

---

**SEC-4 · Security · Two `innerHTML` sinks, both safe today**

*Affected:* `src/experiences/murcia/ui/overlays.ts:63`,
`src/experiences/murcia/debug/DebugOverlay.ts:88`

*Evidence:* `ControlsHint` assigns a static template literal with no interpolation.
`DebugOverlay.render()` interpolates ~20 values, every one of which is a number passed
through `toFixed()`, `toLocaleString()` or a boolean formatter, and the whole overlay is
gated on `debugTools`.

*Impact:* none today. Both are recorded because they are the two places in the codebase where
a string flowing in becomes an HTML injection rather than escaped text — and `DebugOverlay`
already interpolates values derived from loaded assets, so a CMS-supplied model or district
name reaching it is not far-fetched.

*Recommended action:* leave them; if either ever needs to show a name, a path or any other
string, build it with `textContent` instead. Worth stating in `DECISIONS.md` as a rule rather
than tracking as a defect.

*Status:* `ACCEPTED`.

---

**SEC-5 · Hardening · Transport and isolation headers**

*Affected:* `vercel.json`

*Evidence:* no `Strict-Transport-Security` (deliberate and documented — Vercel manages TLS
policy on its own domains), no `Cross-Origin-Opener-Policy`, no `Cross-Origin-Resource-Policy`.

*Impact:* minimal for a static single-origin page with no popups and no cross-origin
isolation requirement. `X-Frame-Options: DENY` plus `frame-ancestors 'none'` already covers
the framing case twice over.

*Recommended action:* revisit HSTS when a custom domain is attached, since the platform
default reasoning no longer obviously applies. `COOP: same-origin` is cheap insurance and
costs nothing here.

*Status:* `ACCEPTED`.

---

## Addendum — 2026-08-20: the integration landed as a BUILD-time pipeline

This audit assumed a runtime fetch, because that is what `caseStudies.ts` documented at the time.
The integration was built the other way (`adr/010`): WordPress is read in **Node during the
build**, validated, and emitted as TypeScript modules. **The browser never contacts the CMS, and
no runtime network call was added to this application.**

That does not make the findings wrong — it moves most of them, and it closes some outright. The
status of each is below. **Nothing here supersedes the three BLOCKING findings about the audit
form**, which remain entirely open: the form is still unwired and is a genuinely different
workstream from editorial content.

| Finding | Status after `adr/010` |
|---|---|
| `API-1` HTML from `content.rendered` | **Addressed.** `content/lib/html.ts` strips tags and decodes entities at the mapping layer; `plainTextProblem` asserts the post-condition and the build fails on a residue. Still no `dangerouslySetInnerHTML` anywhere. The order matters and is documented: strip first, decode second, or an escaped `&lt;script&gt;` is silently deleted. |
| `API-2` SSRF via the form's `website` | **Open, unchanged.** Belongs to the form endpoint. |
| `API-3` no server-side controls on the form | **Open, unchanged**, except that the consent requirement is now the client's actual privacy notice, lawful basis and retention policy rather than an assumed checkbox. |
| `API-4` CSP blocks the CMS | **Dissolved.** No runtime request is made, so `connect-src 'self'` is untouched; media is mirrored into `public/logos/` rather than hotlinked, so `img-src 'self'` is untouched too. `vercel.json` needs no CMS entry. |
| `API-5` a rewrite is a security boundary | **Dissolved for content; still true for the form.** This plan creates **no** `/cms/*` rewrite. When the audit endpoint is built, the advice stands in full — allowlist specific routes, never a prefix. |
| `API-6` CMS `logo` URLs reach `img.src` | **Addressed by design.** `remoteMediaUrl` validates scheme and compares parsed `URL.origin` (never a string prefix — see `SEC-1`), rejects SVG, and the emitted value is a local path. The atlas taint probe is kept regardless. **Caveat: the mirroring step itself is not yet built**, so no logo is loaded today at all. |
| `API-7` the render path trusts its data | **Addressed.** `src/content/invariants.ts` plus `content/lib/validate.ts` coerce and bound every field; `metrics` is constructed as a real two-tuple or the entity is rejected. `CaseChart` also rejects non-finite values at render as a last line. The satellite↔orbit pairing named in this finding is fixed and now fails the build rather than mispairing. |
| `API-8` a fetch is a new boot failure mode | **Dissolved.** There is no runtime fetch, no new `StepId`, and `bootState.ts` and `adr/007` are untouched. The equivalent risk moved to the build, where the answer is an `AbortController` deadline per request and a non-zero exit. |
| `SEC-2` the CSP has never been enforced | **Open, and now cheaper.** It is no longer entangled with the content path, so it can be promoted on a Preview uncontended. |
| `SEC-1` `?model=` backslash bypass | **Open.** Still worth fixing before more URL validation is written — `remoteMediaUrl` deliberately parses rather than pattern-matches for exactly this reason. |
| `DEP-1` build-tooling advisories | **Open**, and the media step will add `sharp` when it is built. |

**One risk this audit did not consider, because it did not exist yet:** the build now fails when
the CMS is unreachable, which means a WordPress outage blocks every deployment including a
code-only hotfix. That is deliberate (a publish that cannot be validated must not report success)
and `content/seed/` is the named escape hatch. It is an availability trade, not a security one,
and it is recorded in `DECISIONS` §27.

---

## Findings — the WordPress API seam

None of these are defects in the current code. They are the properties the integration has to
have, written now because each one is far cheaper to design in than to retrofit.

---

**API-1 · Security · `content.rendered` is pre-rendered HTML** — **BLOCKING**

*Affected:* `src/data/caseStudies.ts` (the documented seam), `src/components/CasePanel.tsx`,
`src/components/CaseChart.tsx`, `src/experiences/murcia/ui/districtPanel.ts`

*Evidence:* the WordPress REST API returns `title.rendered`, `content.rendered` and
`excerpt.rendered` as HTML strings, already expanded with shortcodes and embeds. Today every
content path in this repo is safe by construction: `CasePanel` renders through JSX text nodes,
`districtPanel` builds every node with `textContent`, and `createBrandAtlas` draws with
`fillText`. There is not one `dangerouslySetInnerHTML` in the codebase.

*Impact:* the natural way to display `content.rendered` is `dangerouslySetInnerHTML`, and that
is stored XSS with any WordPress author — or a compromised WP install, which is the more
likely path — as the injection point. Because the panels sit inside the same origin as the
whole experience, an injected script owns the page, and via `SEC-3` can also simply prevent it
from loading.

*Recommended action:* make the existing property explicit rather than incidental. The seam is
already the right shape: `caseStudies.ts` says "keep `CaseStudy` as the type the UI consumes
and map the API response into it". Add to that contract that the mapping layer emits **plain
strings only** — strip tags there, and never pass a `*.rendered` field through untouched. If
rich text becomes a genuine requirement, sanitize with an allowlist library at the mapping
layer, never at the render site. Prefer the REST `context=view` raw fields where available.

---

**API-2 · Security · SSRF through the audit form's `website` field** — **BLOCKING**

*Affected:* `src/components/AuditSection.tsx:40-42`, plus whatever server consumes it

*Evidence:* the validator is `/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i`. Requiring a dot
rejects `localhost`, but these all pass:

```
127.0.0.1        10.0.0.5        192.168.1.1
169.254.169.254  (cloud instance metadata)
anything.internal, anything.local, any attacker-controlled host
```

*Impact:* the form's stated purpose is *"Analizamos tu web"* — so something on the server will
eventually fetch this URL. A submission of `169.254.169.254/latest/meta-data/` turns the audit
pipeline into a request forgery primitive against the hosting network. The client-side regex
is irrelevant to this: an attacker posts to the endpoint directly.

*Recommended action:* this is a server-side control and belongs there. Whatever performs the
crawl must resolve the hostname, reject private, loopback, link-local and unique-local ranges
*after* resolution, re-check on every redirect hop, cap redirects, set timeouts, and run
without access to internal networks or cloud metadata. Tightening the client regex is
cosmetic; do it only for the error message.

---

**API-3 · Data / Legal / Security · The audit form has no server-side controls** — **BLOCKING**

*Affected:* `src/components/AuditSection.tsx`

*Evidence:* validation is entirely client-side (`validate()`), there is no `maxLength` on any
field, no CSRF token, no bot mitigation, and no consent control. The code comment at lines
46-58 already states the position correctly and deliberately: nothing leaves the browser
today, which is what keeps the prototype clear of GDPR/LOPDGDD, and *"the moment a real
endpoint is wired in, that changes and the form needs a privacy notice and a lawful basis
BEFORE it collects anything."*

*Impact:* three separate problems arriving together. **Security:** an unauthenticated write
endpoint with no rate limiting is a spam and resource-exhaustion target, and unbounded field
lengths make the payload unbounded. **Stored XSS, second order:** submissions land in the
WordPress database and are then rendered in wp-admin and in notification emails — an
attacker's `name` field is rendered in a privileged context, so it must be escaped there too,
not just here. **Legal:** name, email, phone and company URL are personal data; storing them
in WordPress makes the WP install a breach surface with a retention obligation.

*Recommended action:* revalidate every field server-side against the same rules (never trust
the client), add per-IP rate limiting and a bot check, cap field lengths on both ends, and
ship the consent checkbox, privacy notice, lawful basis and retention policy **in the same
change** as the endpoint. Also confirm how the receiving WordPress plugin escapes submitted
values in the admin list view and in emails — that is where the second-order XSS lands.

---

**API-4 · Security · The CSP will block the CMS, and the fix has two shapes**

*Affected:* `vercel.json:17`

*Evidence:* `connect-src 'self'` blocks any fetch to a WordPress origin, and
`img-src 'self' data: blob:` blocks media-library images. `docs/earth/logo-spec.md` already
identifies both, and identifies the better answer.

*Impact:* if the CSP is enforced first (which `SEC-2` recommends), the integration fails
closed and visibly — the correct failure. If it is not, the integration silently depends on an
unenforced policy.

*Recommended action:* prefer the **same-origin rewrite** in `vercel.json` — serving WordPress
under your own domain removes CORS entirely, leaves the CSP untouched, and means the logo
loader's taint probe never has to fire. If instead the CMS origin is allowlisted directly, pin
the exact hostname in `connect-src` and `img-src`, never a wildcard, and confirm the host
sends `Access-Control-Allow-Origin` on `wp-content/uploads/` (WordPress does not by default —
without it `createBrandAtlas` keeps the drawn plate, correctly but silently).

---

**API-5 · Security · A rewrite to WordPress is a security boundary, not plumbing**

*Affected:* `vercel.json` (`rewrites`)

*Evidence:* the file currently rewrites exactly one path (`/debug` → `/index.html`). A CMS
proxy would be the first rule that forwards to a foreign server.

*Impact:* a broad rule such as `/wp/* → wordpress.example/*` republishes the entire WordPress
install under your marketing domain — including `/wp-admin`, `/wp-login.php`, `xmlrpc.php`
(brute-force and pingback amplification), and `/wp-json/wp/v2/users`, which enumerates
usernames for anonymous callers by default. It would also inherit your domain's cookies and
your CSP's `'self'`, which is exactly what `API-4`'s convenience is buying.

*Recommended action:* allowlist the specific REST routes the site consumes and nothing else.
Block `wp-admin`, `wp-login.php`, `xmlrpc.php` and the users endpoint explicitly at the edge.
Cache the responses. And note the constraint that Vite makes easy to get wrong: any
`VITE_`-prefixed variable is compiled into the public bundle, so an application password,
JWT or API key can never live in this repository — authenticated calls belong on the server
side of the rewrite. Today the project reads no runtime environment variables at all, and
that is a property worth defending.

---

**API-6 · Security · CMS-supplied `logo` URLs go straight into `img.src` and a canvas**

*Affected:* `src/orbit-system/createBrandAtlas.ts:157-202`, `src/data/caseStudies.ts:60-74`

*Evidence:* `loadLogo()` assigns `img.src = url` with no inspection of the value.
`crossOrigin = 'anonymous'` is set before `.src` (correct), and `canvasSafe()` draws into a
disposable 1×1 probe and reads it back before touching the shared atlas — which is a genuinely
good defence and prevents one bad logo from killing all six panels with a `SecurityError`
inside three's render loop.

*Impact:* the taint problem is handled. What is not is the URL itself: once `logo` comes from
an API, an arbitrary value means an arbitrary outbound request from every visitor's browser —
a tracking pixel, a beacon to a third party, or simply a CSP violation. `javascript:` is inert
on an `<img>` and `data:` is harmless here, so this is a privacy and policy issue rather than
code execution.

*Recommended action:* validate at the mapping layer — allow `https:` only, restrict to the
CMS origin (trivial if `API-4` is solved with a rewrite, since it becomes a relative path),
and reject anything else while keeping the drawn plate. Separately, on the WordPress side:
core blocks SVG uploads by default and that should stay blocked. `logo-spec.md` invites SVG,
and while an SVG inside `<img>` cannot execute script, an SVG in the media library is served
at its own URL and becomes stored XSS for anyone who opens it directly.

---

**API-7 · Reliability · The render path trusts the shape of its data**

*Affected:* `src/components/CaseChart.tsx`, `src/orbit-system/createBrandAtlas.ts`,
`src/orbit-system/orbitConfig.ts`, `src/data/caseStudies.ts:86-97`

*Evidence:* `CaseChart` guards the two cases its authors hit — an empty series, and division
by a zero total — but not a non-numeric value (`NaN` coordinates produce an invalid SVG path),
nor an unbounded `values.length`. `metrics` is typed as an exact two-tuple that a REST
response has no obligation to honour. `createBrandAtlas` assumes `brandColor` parses as hex
(`mixWithWhite` produces `rgb(NaN, NaN, NaN)` otherwise, which the canvas silently ignores).
And `caseStudies.ts:86-97` already documents that the satellite↔orbit pairing is **positional**
and that `orbitId` is never read.

*Impact:* availability and correctness, not confidentiality — but on a marketing site a case
panel that renders a garbage chart, or attaches Mango's metrics to Cabify's satellite because
the API returned a different order, is a real failure. TypeScript types are erased at runtime
and provide no protection at a network boundary.

*Recommended action:* validate at the mapping layer, which is where `caseStudies.ts` already
says the contract lives: coerce and bound-check every number, cap array lengths, verify the
`chart.type` union, default missing fields, and drop malformed entries rather than rendering
them. Resolve the orbit by `orbitId` rather than by array position at the same time — the
existing comment calls this out as a behaviour change that should be made deliberately.

---

**API-8 · Reliability · A fetch is a new failure mode for a boot sequence that has rules**

*Affected:* `src/intro-draw/bootState.ts`, `src/components/OrbitSystemLayer.tsx`,
`src/orbit-system/createBrandAtlas.ts`, ADR 007

*Evidence:* the boot system distinguishes required from optional resources precisely so a slow
asset cannot hold the loading screen hostage, and ADR 007 adds a hard deadline that may report
*fatal* but never *ready*. `createBrandAtlas` is deliberately synchronous for the same reason —
its header comment says making it await its images "would put a decorative asset on the
readiness path, where a slow media host could hold the loading screen hostage".

*Impact:* a CMS fetch is exactly the hazard that machinery was built for, and it arrives with
no timeout by default. A hanging WordPress request would reproduce P0-1 from the previous
audit — the loading screen forever, with no error.

*Recommended action:* give every request an `AbortController` deadline; decide explicitly
whether case-study content is a required or an optional boot resource and register it as such;
never send `credentials` unless an authenticated route genuinely needs them; and keep API
error text out of the UI — the existing Spanish failure caption is the right surface, and a
raw error string on screen leaks server detail to no one's benefit.

---

## Recommended order

The dependencies between these are real, and doing them out of order costs rework.

1. **`SEC-2`** — promote the CSP on a Preview and confirm zero violations. Everything about
   the integration is easier to reason about against an enforced policy.
2. **`SEC-1`** — fix the `?model=` origin check. Small, verified, and Preview links are shared.
3. **`API-4` / `API-5`** — decide rewrite versus allowlist *before* writing client code. The
   answer changes what the client URLs even look like, and a rewrite makes `API-6` trivial.
4. **`API-1` / `API-7`** — build the mapping layer with sanitization and validation in it from
   the first commit. Retrofitting a boundary after components already consume the response is
   the expensive version.
5. **`API-2` / `API-3`** — the form endpoint, with server-side validation, rate limiting, SSRF
   controls, consent and retention shipping together. These are one change, not five.
6. **`API-8`** — timeouts and boot-readiness registration alongside the first real fetch.
7. **`DEP-1`** — schedule the Vite/esbuild major upgrade independently; it touches build
   invariants and wants its own pass.

---

## Not verified

Stated honestly, in the style of the previous audit.

- **Nothing was executed against a deployment.** No Preview or Production exists to test the
  headers, the CSP, or the `SEC-1` reproducer end-to-end. `SEC-1` was verified against the
  URL parser directly, not through a running site.
- **No WordPress instance was examined.** `API-3`, `API-5` and `API-6` describe WordPress
  defaults and standard REST behaviour; the actual install, its plugins and its hardening are
  outside this repository and must be audited separately. The receiving form plugin in
  particular is unreviewed and is where the second-order XSS in `API-3` would land.
- **No dynamic analysis.** No fuzzing, no browser-driven testing, no dependency SBOM beyond
  `npm audit` against the committed lockfile.
- **`three` and React were not audited as code**, only checked for known advisories (none).
