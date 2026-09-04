# Architecture, Complexity & Refactoring — 2026-09-02

**Date:** 2026-09-02 · **Against:** working tree at `528dd42`
**Brief:** `audits/architecture-complexity-refactoring.md`

**Third pass. Written as a delta against `architecture-complexity-refactoring-2026-08-27.md`,**
which was itself a delta against `-2026-08-20.md`. Both remain accurate for everything this one
does not restate; where any two disagree, the newest wins. Findings carried forward keep their
previous identifiers in parentheses so the three can be read side by side.

The tree audited is the working tree, not `528dd42` itself. Five files are uncommitted — the
blog's mobile pass (`src/blog/BlogRoute.tsx`, `src/blog/blog.css`, 248 new lines in
`e2e/mobile.spec.ts`) plus two documentation files. It is treated as intended architecture on the
same terms the last pass used: it is complete, it ships its own e2e coverage, and the decisions it
embodies are already written down in the same change.

**The headline of this pass is different from the last two, and the difference is the point.**
Between 2026-08-27 and today the repository added **22,430 lines across 167 files** — the blog as a
second HTML document, the services district's projected display, the river water shader, the trim
sheet, the boot handover repair, and a rebuilt bundle-budget model. For the first time, **the
previous audit was acted on**: two findings are resolved, both correctly, and one of them
(`sanity-studio/schemas/lib/slug.ts`) cites the finding by identifier and argues its own residue.

What did not change is the shape of the remaining debt. Every structural P1 and P2 from the last
pass is still open, and the two that concern **the boundary of enforcement** grew faster this week
than in either previous interval — because the largest thing added, the blog, brought a second
Rollup entry, a second HTML document, a URL space, a crawler contract and 464 new lines of
`vite.config.ts`, and **none of that is inside the region any harness walks**.

---

## 0. Verified baseline

Nothing below is hand-derived where the repository already asserts it. Full run, 2026-09-02:

| Gate | Result | 2026-08-27 | 2026-08-20 |
|---|---|---|---|
| `npm run typecheck` | pass | pass | pass |
| `npm run test` (vitest) | **1,114 tests, 68 files, all pass** | 905 / 53 | 593 / 35 |
| `check:architecture` | **26/26 — 168 modules, 455 relative imports**, acyclic | 19/19 — 142 / 386 | 18/18 — 129 / 346 |
| `check:audit` | 16/16 | 16/16 | 16/16 |
| `check:navigation` | 55/55 | 55/55 | 52/52 |
| `check:footprint` | 8/8 | 8/8 | 8/8 |
| `check:district` | 71/71 | 75/75 | 68/68 |
| `check:earth` | 25/25 | 25/25 | — |
| `check:warp` | 47/47 | 47/47 | 36/36 |
| `check:space` | 36/36 | 36/36 | 29/29 |
| **`check:asset:contract`** | **5/5 — now chained into `check:harnesses`** | ungated, 6/9 | ungated, 6/9 |
| `check:asset` (full, unchained) | 9/10 — one deliberate pending failure | 6/9 | 6/9 |
| `npx vite build` | pass — initial JS for `/` **1,526,500 B (386,599 B br) over 9 requests**, budget 1,600,000 B / 10 requests; app entry 109,841 B of 160,000; intro 14,071 B of 16,000; blog 15,771 B of 120,000; 2 post shells emitted | entry 323,236 of 332,000 | entry 316,247 of 320,000 |
| `npx playwright test --list` | **49 tests in 6 files** — *listed, not executed* | 36 / 5 | 36 / 5 |

**289 gated harness assertions** (was 281), across **nine** chained harnesses — `check:asset:contract`
joined since the last pass, which is exactly the P2-C recommendation carried out.

**Checks not run, and stated as such.** The Playwright suite was enumerated but not executed: it
requires a full production build per project and this audit changed nothing it could regress.
`npm run test:coverage` was not run either — see P2-G, where the reason it was not run turns out to
be the finding.

**Scale, for the sections that need it.** 168 modules and **30,831 lines under `src/`**, of which
**13,427 are comment lines (44%)**; 19 modules under root `content/`; 19 tracked files under
`sanity-studio/`; **34,752 lines of Markdown under `docs/`**; 759 lines of `vite.config.ts`; 5,043
lines under `checks/`. Prose to code is now roughly **2.8 : 1** (was 2.4 : 1).

**Two numbers that moved for structural reasons rather than by growth:**

- `check:district` fell from 75 to 71. The four that went were assertions on the retired district
  *tag* mechanism, deleted in the same change that added the name-based one. A count going down is
  the right outcome here and is recorded so it is not later read as erosion.
- The app entry chunk fell from 323,236 B to 109,841 B. **This is not a 66% improvement.** Adding
  `blog.html` as a second Rollup input gave React two consumers and Rollup hoisted it into a shared
  chunk; the bytes moved rather than left. `vite.config.ts` says so at length, and it is the reason
  the primary budget was rebuilt around the whole initial closure of `/` rather than one chunk. That
  rebuild is the single best architectural change in this interval.

---

## 1. Executive architecture assessment

### Healthy but accumulating complexity — third pass, same classification, and for the first time the margin improved in one place while widening in another

The classification does not move. What is worth stating precisely is *why it did not move upward*,
because on the evidence of the code alone it nearly did.

**What got genuinely better, and by the right mechanism:**

- **The bundle budget stopped measuring the wrong thing.** The old 332,000 B guard covered 7.3% of
  what a visitor actually downloads and could not see a new lazy chunk joining the initial load —
  and `BlogRoute` had already done exactly that. The replacement asserts the whole initial closure
  *and the request count*, with the measurement and the reasoning written beside the constant. This
  is Phase 25 and Phase 11 done correctly: the value moved to the abstraction that conceptually owns
  it, and it now measures the property it claims to.
- **`check:asset` was fixed the way the last pass asked.** The two assertions testing a retired
  mechanism were deleted, the assertion the current design actually needs (every bound `nodeName`
  resolves to a node in the shipped GLB) was added, and the harness was chained — under a
  `--contract-only` flag that excludes the one genuinely pending failure and *says so in its own
  output*. A gate that can distinguish "not yet true" from "must be true" is better than either
  chaining a red harness or leaving it out.
- **The identifier hole that could produce a red deployment is closed.** `sanity-studio/schemas/lib/slug.ts`
  is a model of how to answer an audit finding: it names the failure (`Análisis Web` → `análisis-web`),
  implements two layers because they fail differently, and states in the file what it did *not* fix
  and why. See P2-C.
- **The blog's boundaries are the best-argued new architecture in the repository.** ADR 013 rejects
  the cheap option (rewrite `/blog` to `index.html`) for a structural reason — "a cold blog load
  mounts no 3D" becomes a fact about the module graph rather than a claim maintained by guards — and
  then `checks/architecture.ts` gained six rules to hold it, including two *guards on the guards*
  that fail if the blog stops being reachable at all. That last detail is the difference between an
  enforcement culture and a decoration culture.

**What got worse, and it is the same sentence as the last two passes with a larger subject:**

> Complexity is accumulating precisely where the enforcement cannot see.

The measurement, updated:

| | 2026-08-20 | 2026-08-27 | 2026-09-02 |
|---|---|---|---|
| Modules under `src/` that are the source of no rule | 30 of 129 (23%) | 33 of 142 (23%) | **37 of 168 (22%)** |
| `experiences/` → `app/` edges | 2 | 10 | **12** (9 files) |
| Application-owned fields inside Earth's `SequenceState` | 2 | 3 | 3 |
| Code outside `src/` with no harness at all | 13 modules | 19 modules + a package | **19 modules + a package + `scripts/` + a 759-line `vite.config.ts` that emits production HTML** |
| Tested `src/` modules outside the coverage gate | not measured | 30 of 46 | **41 of 54 — and the gate is run by nothing** |
| Enumerations of "something has the viewer's attention" in `App.tsx` | 3 | 4 | 4, of **five** flags |
| Executable copies of the identifier contract | 2 | 2 | **4** |
| Independent statements of the URL space | 1 | 1 | **4** |

Two of those rows are new classes of problem rather than growth in an old one, and both arrived with
the blog:

1. **The URL space is now written four times** — `src/app/route.ts`, `vercel.json`,
   `vite.config.ts` and the two HTML documents — with no shared owner and nothing that checks they
   agree. The load-bearing fact that makes the whole feature work (Vercel resolves the filesystem
   *before* applying a rewrite, so a known slug gets its prerendered head and an unknown one falls
   through to the SPA) is documented in ADR 013 and asserted nowhere executable. That is **P1-C**.
2. **`vite.config.ts` became an application layer.** It owns the crawler contract, the sitemap, the
   canonical URLs, the modulepreload policy that determines what a cold `/` downloads, and the
   generation of one HTML document per blog post. It is not walked by `checks/architecture.ts`, it
   cannot be reached by vitest — and it already carries a hand-copied "local mirror" of a tested
   helper *because* it cannot. That is **P1-A**, which absorbed the previous pass's P1-C.

**Still not wrong, and still should not be reported as such:** both worlds permanently mounted
(ADR 001/003); the two experiences having different lifecycle shapes (ADR 003, ARCHITECTURE §7);
`active` as a boolean (ADR 003); Murcia bypassing the composer (ADR 001/005); the transition driving
no camera (ADR 005); orbit assignment living in scene code (`orbitAssignments.ts`); the Studio's
separate `tsconfig.json` and its consequent inability to import from `src/` (argued in the file, and
the argument survives P2-C); `window.__vertigoIntro`; the blog chunk being downloaded in a warm
session it may never open (ADR 013, explicitly accepted); `frameloop="never"` disposing nothing
(ADR 013 — the residency cost is a measurement owed on real hardware, not a design defect); the
static shells prerendering metadata and not article bodies (ADR 013 §4, argued against the actual
behaviour of the crawlers that matter); the isotype paths being traced output with their tracing
scripts deleted (`isotype.ts` states the recovery path).

---

## 2. Current architecture map — delta

### 2.1 Layers, as they actually are

```text
index.html                                        blog.html
├── intro-draw/   boot entry, 14,071 B, imports    └── entries/blog.tsx   SECOND ROLLUP INPUT (1)
│                 NOTHING                     (7)      └── blog/          the article renderer  (6)
└── main.tsx → App.tsx   application orchestration
    ├── app/                 experience id, transition, warp curves, build flags,
    │   │                    TWO prototype gates, AND NOW the route parser + history (18)
    │   └── navigation/      wheel + pinch authority, machine, spring
    ├── blog/                index, article, filter, Sanity image sizing         (6)
    ├── components/          chrome + render host + TWO experience layers + a
    │                        shared blog helper                                 (16)
    ├── experiences/earth/   R3F component tree                                 (~50)
    ├── experiences/murcia/  class, own THREE.Scene, own DOM overlay + CSS      (~37)
    ├── graphics/            render pipeline, decoders, disposal, context loss   (7)
    ├── content/             types, invariants, lookup, blogPolicy, generated   (11)
    ├── corner-logo/         application chrome, overlay pass                    (4)
    ├── interaction/ utils/ loading/                                             (7)
    └── (src root)           App.tsx, main.tsx, auditView.ts                     (3)

content/          (repo root, Node-only, 19 modules)  →  src/content/generated/
sanity-studio/    (a SECOND npm package, 19 tracked files, own tsconfig + lockfile)
scripts/          (Node-side build code; blogShell.ts is imported BY vite.config.ts)
vite.config.ts    (759 lines, 5 plugins: chunk budgets, blog dev routing, intro entry,
                   SEO assets, per-post document generation)
vercel.json       (3 rewrites, 5 header rules — the other half of the URL space)
```

168 modules under `src/`, 455 relative imports, no cycles.

### 2.2 What is new since 2026-08-27

| Added | Where | Architectural note |
|---|---|---|
| **The blog, as a second document** | `blog.html`, `src/entries/`, `src/blog/` (6 modules), `src/app/route.ts`, `useRoute.ts`, `blogHistory.ts`, `components/LazyBlog.tsx` | ADR 013. The best-defended new boundary here. Six new harness rules including two guards-on-guards. |
| **Six blog rules in `checks/architecture.ts`** | `checks/` | `forbidReachable` is new machinery and it is the right machinery — it asserts *transitive* reachability from an entry, which is what a chunk boundary actually is. |
| **The rebuilt budget model** | `vite.config.ts` +464 lines | `INITIAL_JS_BUDGET_BYTES` + a request count replace a single-chunk guard that measured 7.3% of the payload. |
| **Per-post HTML shells + sitemap** | `vite.config.ts`, `scripts/blogShell.ts` | Fail-closed, verified before write, orphan-checked in both directions. Also: production URL policy in the bundler config (**P1-A**). |
| **`district/display/`, `district/flow/`** | Murcia | 1,589 lines behind two factory functions and one interface each. Textbook deep modules for this codebase. |
| **`water/`, trim sheet, terrain collar** | Murcia | Self-contained; `check:district` and `createRioWater.test.ts` cover them. |
| **`sanity-studio/schemas/lib/slug.ts`** | Studio | Closes the P1-A deploy hole. Adds a third executable copy of `ID_PATTERN` (**P2-C**). |
| **`components/textSpans.tsx`** | `components/` | Shared by the blog *and* the 3D chrome — so `src/components/` is now five kinds of thing, and one of them ships in the cold blog document (P3-F). |

### 2.3 Frame loops and publish channels — re-inventoried

**Unchanged in kind, and the blog added neither.** R3F's loop (**11** `useFrame` callbacks,
`RenderPipeline` at priority 1, now suspendable via `frameloop`); `createNavigationInput`'s
self-stopping rAF; `CustomCursor`'s settle-epsilon rAF; `intro-draw`'s boot loop; `DebugOverlay`'s
dev-only loop. Every other `requestAnimationFrame` under `src/` is a one-shot deferral.

Five global-publish channels, unchanged: `src/auditView.ts` and `interaction/cursorSignal.ts`
(module-level), `window.__vertigoIntro`, `window.__vertigoProto`, `window.__vertigoBootDebug`.
**ARCHITECTURE §11 and §29 still do not name the navigation rAF** — carried since 2026-08-20.

---

## 3. Complexity hotspots

Ranked by the brief's three symptoms. Changes from 2026-08-27 marked.

| # | Area | Amplification | Cognitive load | Unknown unknowns | Δ |
|---|---|---|---|---|---|
| 1 | **The build/deploy boundary** — `vite.config.ts`, `vercel.json`, `scripts/`, `sanity-studio/`, root `content/`: unwalked, untestable, and now owning production URL policy | high | medium | **highest** | **↑ from 2** |
| 2 | **The URL space** — four independent statements, no gate | high | medium | high | **NEW** |
| 3 | **`checks/architecture.ts`'s prefix matching** — 37 of 168 modules are the source of no rule, two of them experience layers | high | low | high | ↔ |
| 4 | **`experiences/` → `app/`** — 12 edges, 4 target modules, no rule statable; `blog/ → app/` now joins the pattern | medium | medium | high | ↑ |
| 5 | **`App.tsx`** — 532 lines, 9 `useState`, 8 `useRef`, five attention flags in four enumerations | high | high | medium | ↔ |
| 6 | **Platform and capability knowledge** — no owner, ~18 sites, four pointer spellings, one breakpoint in nine places | medium | low | medium | ↑ |
| 7 | **Brand knowledge** — palette across three stylesheets and TS, plus two different favicons for one mark | medium | low | medium | ↑ |
| 8 | **Editorial validation across two packages** | medium | medium | medium | **↓ from 1** |
| 9 | **The five global-publish channels** | low | medium | high | ↔ |
| 10 | **Documentation surface** — 34,752 doc lines + 13,427 comment lines against ~17,400 code lines | low | low | medium | ↑ |

Hotspot 8 dropping from first to eighth is the single most encouraging movement across the three
passes, and it moved because the *mechanism* was fixed rather than the instance.

Hotspot 10 needs the same care it needed twice before, and the arithmetic keeps getting worse.
The comments are overwhelmingly *why*, PRINCIPLES §24 asks for exactly them, and they are the
reason this audit can be done from the source at all. But at 2.8 : 1 prose to code, drift is the
default and only a harness prevents it — and this pass found **five** concrete drifts (P2-H, P3-D
items 1–4), against four last time. The Stage-0 rule proposed in both previous reports — assert that
every backticked repo path in `docs/**` resolves — is still about fifteen lines beside
`checks/audit-hygiene.ts`, which already walks Markdown, and is still not written.

---

## 4. Refactoring findings

---

### P1 — Architectural liability

---

#### P1-A · CARRIED, GROWN, and now the largest of the three (absorbs P1-C of 2026-08-27) · The enforcement boundary stops at `src/`, and production behaviour has moved outside it

**Files:** `checks/architecture.ts:22` (`const SRC = 'src'`) · `vite.config.ts` (759 lines,
5 plugins) · `scripts/blogShell.ts` · root `content/` (19 modules) · `sanity-studio/` (19 tracked
files) · `src/content/invariants.ts` · `package.json:11` (`check:harnesses`) ·
`docs/adr/010`, `docs/adr/011`, `docs/adr/013`

**Current responsibility.** `checks/architecture.ts` walks `listSources('src')` and nothing else.
Everything the previous pass listed as unchecked is still unchecked, verified today:

- `src/content/` importing a `node:` builtin or touching a DOM global — it does not (checked by
  hand: zero occurrences), and `invariants.ts` states the rule as a file-level contract, which is
  where this kind of drift always starts.
- Root `content/` importing `src/experiences/`, `src/app/` or `src/graphics/` — it does not; all
  **20** of its edges into the app point at `src/content/`, exactly as ADR 010 prescribes. Nothing
  asserts it stays one-way.
- `sanity-studio/`'s own `typecheck` script is run by no gate. Its `tsconfig.json` still says what
  is at stake and is still wired to nothing: *"It is the only thing standing between a schema edit
  and discovering the breakage during a client's editing session."*

**What grew, and it changes the severity.** Two more regions joined the outside, and unlike the
first three they now carry *production behaviour rather than build plumbing*:

`vite.config.ts` is 759 lines and five plugins. Between them they own:

| Plugin | What it decides |
|---|---|
| `vertigo-chunk-budgets` | Whether the build ships at all; what counts as the initial closure of `/` |
| `vertigo-intro-entry` | The `modulepreload` set — i.e. what a cold visitor downloads |
| `vertigo-seo-assets` | `robots.txt`, the sitemap, which URLs exist as far as a crawler is concerned |
| `vertigo-blog-routes` | One emitted HTML document per post: title, canonical, `og:*`, JSON-LD |
| `vertigo-blog-routing` | Dev-server path resolution for `/blog` and `/blog/:slug` |

None of that is bundler configuration in the ordinary sense. It is the site's public contract with
search engines and social crawlers, and with the reader who pastes a link into a message.

**Why the abstraction leaks — and here the file convicts itself.** `vite.config.ts:700` reads:

```ts
/** Local mirror of the helper in scripts/blogShell.ts, throwing for the plugin. */
function replaceExactlyOnceOrThrow(
```

`scripts/blogShell.ts` is 224 lines with 200 lines of tests, and it exists precisely so this logic
*can* be tested. The config then re-implements one of its helpers, because — as `vitest.config.ts`
puts it in its own comment — *"`vite.config.ts`, where it is used, is not somewhere a test can
reach."* The duplication is not carelessness; it is the shape of the boundary. Code that cannot be
imported cannot be shared, so it gets copied.

**Concrete amplification.** Adding the next collection — the extension point
`content/collections/index.ts` advertises — is a five-place change (Studio schema, mapper, type,
predicate set, consumer) of which four are outside every rule. A predicate reaching for
`node:crypto` compiles, passes `tsc`, passes all 289 harness assertions, passes 1,114 unit tests
(the unit tier runs `content/**` and `scripts/**` in Node), and **fails at runtime in the browser**.
And now a second class: changing a URL, a canonical, or the preload policy is an edit to a file no
gate reads, whose only test is that the deploy did not visibly break.

**Proposed owner.** `checks/architecture.ts`, widened. It already resolves relative specifiers, it
already reports file plus specifier, and `forbidReachable` (new this interval) already does the
harder transitive walk. The region walked is one constant.

**Proposed boundary.** Five assertions plus two script lines, in this order:

1. `src/content/` imports no bare specifier beginning `node:` and references no DOM global.
2. Root `content/` imports nothing under `src/` except `src/content/`.
3. No module under `src/` imports root `content/`.
4. Nothing lives at the `src/` root but `App.tsx`, `main.tsx` and ambient declarations (P1-B).
5. **`check:studio`** — `cd sanity-studio && npm run typecheck`, chained, and *guarded to skip with
   a clear message when `sanity-studio/node_modules` is absent*. That guard is not optional: a
   Vercel deploy must never depend on the Studio's install, which is the constraint the Studio's
   `tsconfig.json` exists to protect.

**And separately, for `vite.config.ts` — do not widen the harness to cover it. Shrink the file
instead.** The rule that makes the difference is the one `scripts/blogShell.ts` already follows:
*decisions live in `scripts/`, where vitest can reach them; the plugin is the thing that calls
them.* `postHead`, `shellProblems` and `replaceExactlyOnce` are already there and already tested.
The sitemap and `robots.txt` bodies are the obvious next two, and the immediate payoff is deleting
the "local mirror".

**Expected reduction.** Three boundaries whose violation is currently silent — one runtime-only,
one visible first to a client mid-edit, one visible first to a crawler — become named build
failures. The class "logic that must be copied because it cannot be imported" stops growing.

**Migration risk.** None for assertions 1–4; they pass today. Low for `check:studio` provided the
skip path is written and verified in a clean checkout first. Low-medium for moving plugin bodies
into `scripts/`: behaviour-preserving, and the emitted `dist/blog/**` tree is a byte-comparable
before/after.

---

#### P1-B · CARRIED, third pass, verbatim · The dependency harness matches directories, so two experience layers and one shared global sit outside every rule

**Files:** `checks/architecture.ts` (every `forbid()` call takes a path prefix) ·
`src/components/MurciaLayer.tsx:5` · `src/components/SceneCanvas.tsx` · `src/auditView.ts` ·
`src/components/CasePanel.tsx:2`

**Status: unchanged in substance, marginally larger.** 37 of 168 modules (was 33 of 142) are the
source of no rule: `components/` (16), `app/` (18), `src/` root (3).

Everything both previous reports established is still true and still verifiable:

```ts
// src/components/MurciaLayer.tsx:5   — still there, third pass
import type { SequenceState } from '../experiences/earth/config/sequenceState'
```

`murcia does not import earth` passes because the rule reads `src/experiences/murcia/`.
`MurciaLayer.tsx` is Murcia's R3F host in every sense except its path — it constructs the
experience, drives its frame, applies its warp pose and owns its DOM container. `SceneCanvas.tsx`
still does the same with `CornerLogoHandle` out of `experiences/earth/timeline`. `src/auditView.ts`
is still a module-level mutable object written by `components/AuditSection.tsx` and read per frame
by two Earth layers, sitting at the `src/` root where no rule can reach it.

**The proposal is unchanged and the cheap half is still cheap.** Add the positive `src/`-root rule
first — one assertion, additive, passes today, and it is what stops the root becoming a habit. Then
resolve P2-A. Then move `MurciaLayer` and `CornerLogoLayer` into the directories that own them.

**Why this is still P1 after three passes.** It is the finding that makes the other rules weaker
than they read. ARCHITECTURE §17 says the two experiences do not know about each other, and
`checks/architecture.ts` asserts it — but a file that *is* Murcia's host, living one directory over,
imports Earth's state type, and the assertion is silent. A rule that a reader believes covers more
than it does is worse than a rule known to be narrow.

---

#### P1-C · NEW · The URL space is stated four times in three languages and one vendor config, and nothing checks that the four agree

**Files:** `src/app/route.ts:66–100` (`parseRoute`, `routeToPath`) · `vercel.json:3–7` (rewrites) ·
`vite.config.ts:317–374` (dev routing), `:521–560` (sitemap), `:623–699` (per-post shells) ·
`index.html`, `blog.html` · `docs/adr/013-the-blog-is-a-second-document.md`

**Current responsibility.** Nothing owns "what URLs this site has". Four artefacts each hold part
of the answer, and they are not merely duplicated — **they are interlocking**:

| Where | What it decides | Language |
|---|---|---|
| `src/app/route.ts` | Which shapes parse as a route, and what path a route pushes to | TypeScript, in the browser |
| `vercel.json` | Which paths rewrite to `blog.html` when the filesystem misses | JSON, at the CDN edge |
| `vite.config.ts` | Which paths exist as real files in `dist/`, and which URLs the sitemap claims | TypeScript, at build time |
| `blog.html` / `index.html` | Which document each entry mounts | HTML |

**Complexity mechanism.** The feature works because of a fact about the *host*, not about any of
the four files. ADR 013 states it:

> "Vercel resolves the filesystem before applying a rewrite: a known slug is served its own head
> and the `/blog/:slug` rewrite fires only for slugs that do not exist, which is exactly the case
> that should reach the SPA and render 'Entrada no encontrada' at HTTP 200."

That is the load-bearing sentence of the whole blog, and it lives only in a Markdown file. ADR 013
also records that this exact interaction has already been got wrong once — *"An earlier revision
emitted `dist/blog/<slug>.html` while the rewrite pointed at `blog.html`; the two never met, so
every shell was a dead file."* The build now asserts one directory per post and no orphans, which
closes the half that is inside `vite.config.ts`. **The half that crosses into `vercel.json` is
still closed by nothing.**

**Why the abstraction leaks.** `vercel.json` is the one production-behaviour file in the repository
that no tool in `npm run check` reads, that `tsc` does not type, and whose schema is validated only
by the deploy itself. That is not hypothetical either: `9c2eb18` in this very interval is a commit
whose entire message is a `vercel.json` schema rejection — a `"comment"` key inside a header rule
that Vercel refused, breaking a deploy. That failure was *loud*. The rewrite/filesystem interaction
is the same file's *quiet* failure mode.

**Concrete amplification.** Concretely, today, each of these passes every gate and reaches
production broken:

- Deleting the `/blog/:slug` rewrite → every unknown slug 404s instead of rendering "Entrada no
  encontrada" at HTTP 200; every *known* slug keeps working, so the break is invisible to anyone
  clicking a real link.
- Changing `routeToPath` to emit a trailing slash → the emitted shells and the sitemap keep the
  unslashed form; the two stop meeting.
- Adding a third route to `parseRoute` → nothing tells you `vercel.json` and the sitemap need it.
- Renaming the topic parameter from `tema` → shared links break silently and the sitemap never
  mentioned it.

**Proposed owner.** `src/app/route.ts` already *is* the conceptual owner — it is the only module
that knows the shape of every route, it is pure, and it is reachable from both entries. What is
missing is that the other three read from it. Two of them cannot (JSON; a static HTML file), so the
answer for those is assertion rather than sharing.

**Proposed boundary.** One new section in `checks/architecture.ts`, or one new harness:

1. Parse `vercel.json` and assert every rewrite `source` is a path `parseRoute` classifies as a
   blog route, and that every route shape `routeToPath` can emit has a rewrite covering it.
2. Assert `vercel.json` parses as JSON with no keys outside Vercel's documented set — the
   `9c2eb18` failure, caught at `npm run check` instead of at the deploy.
3. Assert the emitted `dist/blog/**` tree matches `routeToPath` over the generated posts. The
   orphan/missing check in `vertigo-blog-routes` already does most of this; what it does not do is
   tie the shape to `route.ts`.
4. Assert the sitemap's URL set equals `{/, /blog}` ∪ `routeToPath(each post)`.

Items 1, 2 and 4 are file-reading assertions of the kind `checks/audit-hygiene.ts` already makes.
Item 3 needs `dist/`, so it belongs in `vite.config.ts` beside the check it extends.

**Expected reduction.** The URL space stops being an oral tradition. A change to any one of the
four artefacts fails `npm run check` naming the other three, instead of reaching a crawler.

**Migration risk.** Low. All four assertions pass against the current tree; this is enforcement of
an existing agreement, not a change to it. The only care needed is item 1's parser — it must fail
closed on a `vercel.json` it cannot read, or a malformed file would make the whole section
vacuously green, which is the trap `checks/architecture.ts`'s own guards-on-guards were added to
avoid.

---

### P2 — Important improvement

---

#### P2-A · CARRIED, third pass · `SequenceState` carries three application-owned fields

**Files:** `src/experiences/earth/config/sequenceState.ts:15–34` ·
`src/app/useExperienceTransition.ts` · `src/components/MurciaLayer.tsx:5` ·
`src/components/SceneCanvas.tsx` · `src/experiences/earth/camera/CameraController.tsx` ·
`src/experiences/earth/interaction/InteractionLayer.tsx`

Unchanged, and unchanged is the right word: `transitionOverlay`, `transitionProgress` and
`transitionCommitted` are still three fields **written by `src/app/`**, **read by Murcia's layer and
by three Earth layers**, living in a type defined three directories deep inside Earth.
`sequenceState.ts` still documents the ownership inline — where it cannot be enforced.

The fields are correct and the distinctions they draw are necessary; the file's own comment on
`transitionCommitted` is one of the clearest explanations of camera ownership in the repository.
They are in the wrong object.

This is still the import that blocks P1-B. Extracting a `TransitionState`
(`{ progress, overlay, committed }`) created by `App.tsx` remains a five-file mechanical change
covered by `check:warp`'s 47 assertions, including "both worlds return exactly to rest" at p=0
and p=1.

---

#### P2-B · CARRIED and GROWN · `experiences/` → `app/` is now 12 edges, and `blog/ → app/` has joined the same pattern

**Files:** `checks/architecture.ts:274–298` (the "NARROWER THAN IT SHOULD BE" note) ·
`src/app/warpTransition.ts` · `src/app/buildFlags.ts` · `src/app/protoSky.ts` ·
`src/app/protoHolo.ts` · `src/app/route.ts` · nine consumers under `src/experiences/earth/` ·
`src/blog/BlogRoute.tsx:5`

Measured today — 12 edges across 9 files (was 10 across 8), still four target modules, Murcia still
zero:

```text
earth/EarthExperience.tsx         -> app/protoSky
earth/camera/CameraController.tsx -> app/warpTransition
earth/camera/scrubPose.ts         -> app/warpTransition
earth/camera/scrubPose.test.ts    -> app/warpTransition
earth/camera/debugCameraHook.ts   -> app/protoSky, app/buildFlags
earth/orbit/createHoloPanel.ts    -> app/warpTransition, app/protoHolo
earth/scene/SkyShell.tsx          -> app/protoSky          <- new this interval
earth/scene/SkyShellCube.tsx      -> app/protoSky
earth/scene/SpaceBackdrop.tsx     -> app/warpTransition, app/protoSky
```

**What is new is the fifth module and a second consumer layer.** `src/app/route.ts` joined `app/`
this interval, and `src/blog/BlogRoute.tsx` imports it. `route.ts` is a pure parser and a frozen
constant with no DOM writes, no React and no state — the same category as `warpTransition.ts`, and
in `app/` for the same defensible local reason. It is not orchestration either.

| Module | What it actually is | Consumers |
|---|---|---|
| `warpTransition.ts` | a pure curve library | both experiences, `app/` |
| `buildFlags.ts` | one build-time boolean | `App`, `components/`, `app/`, Earth |
| `protoSky.ts` | Earth's sky prototype URL gate | **Earth only** (4 files) |
| `protoHolo.ts` | Earth's hologram prototype gate | **Earth only** (1 file) |
| `route.ts` | a pure URL parser | `app/useRoute`, `blog/`, `components/LazyBlog` |

`app/` is where a module goes when it is shared and has nowhere obvious to live. That is the
definition of a generic directory, and ARCHITECTURE §17's stated direction — *no experience imports
the application layer* — gets further from being statable with each arrival.

**Concrete amplification.** Until this resolves, an experience may import **anything** under
`src/app/` and nothing objects: `useExperienceTransition`, `experience.ts`, the navigation machine,
`useRoute`. Those are the modules that genuinely couple the two worlds, and ADR 005's central
guarantee — "Earth and Murcia still know nothing about each other" — rests on nobody having tried.
The blog now widens the same hole from a second direction: nothing stops `src/blog/` importing
`useExperienceTransition` and learning that a 3D scene exists, which would quietly undo the
cold-load guarantee ADR 013 built its whole design around.

**Proposed owners.** One rule, four destinations, chosen by what each module *is*:

- `warpTransition.ts` → `src/utils/`, which already carries *does not import the application layer*.
  Its `prefersReducedMotion()` leaves for `platform/` under P2-D; it does not belong in a curve
  module, which is a naming problem in its own right.
- `route.ts` → `src/utils/` or a leaf `src/routing/`. It is URL syntax, and both entries need it.
  Note the constraint recorded in the file: it must not import `src/content/invariants.ts`, because
  that would put the whole invariants module in the app entry to reuse one regex. Whichever home it
  gets must be one the entry can reach cheaply.
- `buildFlags.ts` → into `platform/` with P2-D. "What is this build allowed to do" is the same
  category of question as "what is this device".
- `protoSky.ts`, `protoHolo.ts` → `src/experiences/earth/config/`. Every consumer is Earth's.

**Proposed boundary.** After the moves, two rules replace one narrow one:

```ts
forbid('no experience imports the application layer', 'src/experiences/', 'src/app/',
       'the arrow is app -> experiences; ADR 005 has each world read progress and move its own camera')
forbid('the blog does not import the application layer', 'src/blog/', 'src/app/',
       'the host supplies its callbacks; the blog never learns which document it is in (adr/013)')
```

**Expected reduction.** The widest hole in §17's enforcement closes, and stays closed — after the
move, `app/` contains only things that genuinely are orchestration.

**Migration risk.** Low. Thirteen import paths across ten files, plus one harness edit.
`check:warp` (47), `check:earth` (25), `warpTransition.test.ts` and `route.test.ts` cover the
behaviour. Do the two prototype gates first: they are Earth-internal and cannot break anything else.

---

#### P2-C · REVISED and DOWNGRADED from P1-A · The editorial contract still has two owners, and the fix for the dangerous half added a third copy of the identifier rule

**Files:** `sanity-studio/schemas/lib/slug.ts:36` · `src/content/invariants.ts:53` ·
`src/app/route.ts:39` · `sanity-studio/schemas/blogPost.ts:114` · 33 `rule.max()` calls across
`sanity-studio/schemas/` · 25 bound constants across `content/collections/`

**What was fixed, and it was fixed well.** The previous pass's P1-A had two halves. The dangerous
half — *an editor can publish content the build refuses, producing a red deployment owned by
someone who cannot read the error* — is **closed**. `sanity-studio/schemas/lib/slug.ts` adds an
accent-stripping `slugify` and a `custom(checkSlug)` rule to all five slug fields, in Spanish, with
the button that fixes it named in the message. The file states the failure it closes, states why
two layers are needed (generated values versus hand-typed ones), and states what it deliberately
did not fix.

**What survives.** Roughly two dozen editorial bounds still exist as a Studio `rule.max(n)` **and**
as a mapper constant, with no link between them. Measured today: **33** `.max()` rules in
`sanity-studio/schemas/`, **25** bound constants in `content/collections/`. Every pair that
corresponds still agrees. That is the point — this is duplicated knowledge caught before it
diverged, not after.

**And the count of copies went up, not down.** The identifier contract `/^[a-z0-9][a-z0-9-]{0,63}$/`
now has **four executable copies**:

```text
src/content/invariants.ts:53          ID_PATTERN   - the declared owner
src/app/route.ts:39                   ID_PATTERN   - "DUPLICATED HERE ON PURPOSE" (bundle cost)
sanity-studio/schemas/lib/slug.ts:36  ID_PATTERN   - "copied and not imported" (package separation)
sanity-studio/schemas/blogPost.ts:114 .regex(...)  - inline, for tags
```

plus eight restatements across `docs/content/*.md`.

**This is not a criticism of any one of them.** Each argument is correct on its own terms:
`route.ts` reaching for `invariants.ts` would pull the whole module into the app entry to reuse one
regex; the Studio is deliberately outside the app's dependency graph and cannot import from `src/`.
Both files say so, in the file, at the point of duplication — which is PRINCIPLES §12 applied
honestly.

**The finding is that the mitigation is a comment.** Three files each say "keep this in sync with
the others by hand", and nothing verifies it. That is the exact arrangement `serviceBounds.ts`
exists to prevent between two mappers:

> "Two copies of these numbers is the arrangement where one gets relaxed and the other quietly
> does not."

**Concrete amplification.** Adding a field to any document is still a four-place change (Studio
schema, GROQ projection, mapper with its bound, type), three in one package and one in another with
a separate lockfile and a `typecheck` no gate runs. Widening the identifier alphabet — to allow an
underscore, say — is a four-file change where forgetting any one produces either an editor who
cannot publish a valid id or a build that rejects a published one.

**Proposed owner.** Not a shared module: the two arguments against importing are sound and should
stand. **A harness rule.** `checks/` already reads text files, and the assertions are mechanical:

1. Every literal `/^[a-z0-9][a-z0-9-]{0,63}$/` in the repository is byte-identical, and the set of
   files containing one is exactly the four named above (so a fifth copy fails until someone adds it
   to the list deliberately).
2. Every `rule.max(n)` in `sanity-studio/schemas/` has a matching constant in
   `content/collections/`, or is listed in an explicit exceptions table with a reason — the SEO
   fields are already a documented, correct exception (`SEO_FIELD_MAX = 2000` against Studio
   *warnings* at 60/160, argued in `blogPosts.collection.ts:265–273`).

**Expected reduction.** The class "two copies of a rule drift apart" becomes a build failure rather
than a comment asking for vigilance. The bounds stay where they are and the packages stay separate.

**Migration risk.** None for assertion 1. Low for assertion 2, whose only real cost is writing the
exceptions table once — and writing it is itself worth doing, because it is the first place the two
tiers' disagreements would ever have been listed.

**Why this is P2 and not P1 any more.** The failure it produces is now a *silent inconsistency
discovered later*, not *a broken deployment caused by an editor*. That is a real difference in kind
and the ranking should reflect it.

---

#### P2-D · CARRIED and GROWN, third pass · Platform and capability knowledge still has no owner; `src/platform/` still does not exist

**Status: unchanged in shape, larger in every dimension.** Re-verified today, ~18 sites:

- **Reduced motion, seven JS sites.** `app/warpTransition.ts:242` is still the correct owner and is
  still bypassed by `createNavigationInput.ts`, `AuditSection.tsx`, `CustomCursor.tsx`,
  `useMasterTimeline.ts`, `MurciaExperience.ts` and `intro-draw/boot.ts`. Several still call
  `matchMedia` with no `typeof` guard. Four more declarations in `styles.css` and one in
  `introDraw.ts`.
- **"Is this a touch device", now four sites and four different questions** (was three and three):
  `(hover: none)` in `DistrictInteraction.ts:189`, `(hover: hover)` in `BlogBuilding.ts` — new this
  interval — `(pointer: coarse)` in `overlays.ts:84`, `(pointer: fine)` in `CustomCursor.tsx:33`.
  These are not synonyms and the four sites do not agree on which question they are asking.
- **The breakpoint, now written in nine places across four languages.** `earthConfig.ts:37` (767),
  `spaceConfig.ts:117` (767), `AuditSection.tsx:31` (`MOBILE_MAX = 768`),
  `closeUpFraming.ts:53` (`CASE_PANEL_DOCK_MIN_WIDTH = 768`), three `@media` blocks in
  `styles.css`, one in `blog.css`, and — new and the most interesting — **four responsive `sizes`
  strings in `src/blog/sanityImage.ts:56–59`**, where `(max-width: 767px)` is baked into the
  attribute that decides which image variant a reader downloads.

  Two spellings of one decision (`767` for max-width, `768` for min-width), five TypeScript sites
  reading `window.innerWidth` or `matchMedia` at different moments so they can disagree across a
  resize, and one site where getting it wrong costs a mobile visitor a desktop-sized image.

  *One site was resolved:* `murcia.css` no longer declares a breakpoint at all, because the district
  panel it belonged to became a projected WebGL display.

`ARCHITECTURE.md:442` still lists `graphics/capabilities/` among shared responsibilities. It still
does not exist. Scenario 8 is still the worst in the codebase by a wide margin.

The proposal is unchanged: `src/platform/` as a leaf exposing **product questions**, not media
queries — `prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`, `NARROW_MAX_WIDTH` —
with `intro-draw/` exempt by rule (it imports nothing and must stay that way; `check:architecture`
already asserts it). It is also the right home for `buildFlags.ts` under P2-B.

**One addition to the proposal this pass.** `NARROW_MAX_WIDTH` should be exported as a *number* and
consumed by the `sizes` strings through a template literal, not copied into them. That is the one
site of the nine where the duplicate is invisible to a reader — it lives inside a string that looks
like content.

---

#### P2-E · CARRIED and GROWN · Brand knowledge has no owner, and the blog added 1,086 lines of stylesheet with zero tokens

**Files:** `src/styles.css` (2,222 lines) · `src/blog/blog.css` (1,086) ·
`src/experiences/murcia/styles/murcia.css` (194) ·
`src/experiences/murcia/interaction/DistrictInteraction.ts:118–130` (`SITE_HIGHLIGHT`) ·
`src/experiences/earth/orbit/orbitConfig.ts` ·
`src/experiences/murcia/config/environmentConfig.ts` · `index.html:41` · `blog.html:78` ·
`src/intro-draw/isotype.ts` · `src/blog/BlogRoute.tsx` (uncommitted)

**Current responsibility.** Nothing owns it, and the measurement is worse in every column:

| | 2026-08-27 | 2026-09-02 |
|---|---|---|
| Stylesheets | 2 (2,682 lines) | **3 (3,502 lines)** |
| CSS custom properties declared | 8, all dynamic values written from JS | **8, all dynamic values written from JS** |
| Distinct hex literals | 15 | **23** |
| `rgba()` calls | 147 | **171** |
| Distinct `0x` colours in TypeScript | 13 | **32** (65 occurrences) |

`blog.css` is 1,086 new lines of a light editorial design system — its own type scale, its own
greys, its own two `@font-face` families — and it declares **not one** design token. Every value in
it is a literal. That is the finding restated as an event: the absence of an owner did not merely
persist, it got paid for again at full price, in the largest new UI surface of the project.

**And the mark itself is now inconsistent in a way a visitor can see.** The Vertigo isotype exists
in four representations:

```text
src/intro-draw/isotype.ts   high-precision traced beziers, declared "the source of truth"
blog.html:78                a simplified 2-path version, as the favicon data URI
src/blog/BlogRoute.tsx      the same simplified version, inline (uncommitted)
public/models/model.glb     the 3D corner logo
```

and `index.html:41` ships **a different mark entirely** — a plain `V` on a 100×100 viewBox, not the
isotype. The two documents of one site show two different favicons.

`isotype.ts`'s own header now states something untrue:

> "Lives inside intro-draw because the mark is drawn in P0 and nowhere else on the site — the corner
> logo uses the GLB, not these paths."

**Why the abstraction leaks.** This is Phase 4 exactly — implementation knowledge with no
authoritative owner — with the aggravating factor the previous pass named and which is still true:
**the values are known to be provisional.** The brand webfont question is still open (`styles.css`
asks for `Inter` and falls back to the OS; `blog.css` registers `"Vertigo Blog Inter"` and
`"Vertigo Blog Serif"` under blog-specific names *precisely so the two cannot collide* — a correct
fix that also documents the absence of a shared type layer).

**Concrete amplification.** Changing the interaction blue means editing `murcia.css`, `styles.css`
and `SITE_HIGHLIGHT`'s two fields, and knowing that `0x4fb0ff` in three other orbit files is the
same decision. Changing the brand's neutral means reading 3,502 lines of CSS in three files that do
not share a vocabulary. Changing the mark means finding four copies in three notations, one of
which is percent-encoded inside an HTML attribute.

**Proposed owner.** Not a design-system framework and not a build-time token pipeline. Roughly
twenty named constants, in two notations, in two files that reference each other:

- `:root` custom properties in `styles.css` for CSS, imported by `blog.css` and `murcia.css`.
- `src/design/palette.ts` exporting the same values as `0x` ints for scene code.
- One owner for the isotype: `intro-draw/isotype.ts` is the wrong one now (it must keep importing
  nothing), so the simplified two-path version belongs in a leaf both documents can reach, with
  `index.html`'s favicon replaced by it.

**Proposed boundary.** A rule beside `checks/audit-hygiene.ts`, which already walks text files:
every `0x` colour in `palette.ts` has a matching `--color-*` in `styles.css`; no hex literal appears
in a stylesheet outside the `:root` block; the two favicon data URIs contain the same path data.

**Expected reduction.** "Apply the brand palette" becomes an edit to two files and a mechanical
check, instead of a grep across three languages and four file types. It also makes the open brand
decisions *answerable* — today there is no artefact to put a brand colour into.

**Migration risk.** Low but tedious, and behaviour-preserving only if done literally: replace each
literal with a token holding the identical value, in one commit, with the e2e screenshot baselines
as the evidence. **Do not adjust any colour in the same change, and do not pick new colours here** —
the palette is a product decision and this finding is only about where it lives.

---

#### P2-F · CARRIED and GROWN · "Something has the viewer's attention" is five flags in four enumerations

**Files:** `src/App.tsx:196–216` (`canNavigate`), `:240–249` (effect dependency array),
`:359–366` (the global Escape handler), `:440` (`suppressed={auditOpen}`)

The mechanism is unchanged and the subject grew by one: `blogOpen` joined `auditOpen`,
`contactOpen`, `legalDoc`, `selectedCase` and `murciaRef.current?.hasFocusedDistrict`. They are
enumerated in three places in three orders, and a fourth site enumerates a subset
(`suppressed={auditOpen}` alone). `blogOpen` alone appears at **nine** sites in `App.tsx`.

**One thing worth recording in the project's favour.** The previous report predicted the exact
failure — *"add a fifth overlay to `canNavigate` and forget the dependency array"* — and a fifth
overlay was then added. It was correctly added to both. The mechanism held; the cost of holding it
went up, and it is held by attention rather than by design.

Proposal unchanged: one `useAttention()` value exposing `{ anyOpen, closeAll }`; the dependency
array names the object; adding a flag means adding it to the hook and nowhere else.
`e2e/navigation.spec.ts` covers the rail's suppressed state.

---

#### P2-G · CARRIED, SHARPENED, and the sharpening is the finding · The coverage gate covers 13 of 54 tested modules — and no gate runs it

**Files:** `vitest.config.ts:73–105` · `package.json:24,28,30`

The three stale paths both previous reports named are **still there, third pass, unchanged**:

```text
src/sceneVisibility.ts        -> experiences/earth/config/sceneVisibility.ts
src/sequenceState.ts          -> experiences/earth/config/sequenceState.ts
src/orbit-system/geoUtils.ts  -> experiences/earth/orbit/geoUtils.ts
```

**54** modules under `src/` now have a sibling `.test.ts` (was 46). The coverage `include` names
sixteen paths, three of which do not exist — so it measures **13 of 54, or 24%**, and the list has
not gained an entry since 2026-08-20 while the tested surface has grown by 60%.

**What is new, and it changes the finding.** The thresholds are never evaluated by any gate:

```text
"check":          "npm run typecheck && npm run test && npm run check:harnesses"
"test":           "vitest run"                 <- no --coverage
"test:coverage":  "vitest run --coverage"      <- invoked by nothing
"build":          "npm run check && vite build"
```

There is no CI configuration in the repository (`.github/` does not exist), and `vercel.json` sets
no `buildCommand`, so the deploy runs `npm run build` → `npm run check` → `vitest run`. The
85/80/85/85 thresholds run only when a human types `npm run test:coverage`.

`docs/PROJECT_MEMORY.md:93` describes the command as *"scoped coverage, thresholds enforced"*.
Enforced when run, by whoever remembers to run it.

**Why this is still worth fixing rather than deleting.** The file's own reasoning remains the best
statement of the problem it now suffers from:

> "`.tsx` is included even though no component test exists yet: the failure mode of omitting it is
> a file named `AuditSection.test.tsx` that is silently never collected — no error, no warning, a
> green run that proves nothing."

That is exactly what a threshold over a 13-module set inside a manually-invoked script is.

**Fix, in order of value.** Correct the three paths; add the pure modules that have tests and are
not in the list; re-baseline the thresholds at what the suite actually achieves; then **either**
chain `test:coverage` into `check` (accepting the runtime cost on every deploy) **or** delete the
thresholds and keep the include list as documentation, and say which was chosen. The one thing not
worth keeping is a threshold that reads like a gate and is not one. **Risk:** none beyond
discovering that a threshold was being met by absence, which is the information the change exists
to produce.

---

#### P2-H · NEW · `ARCHITECTURE.md` does not mention the blog, and `checks/architecture.ts` now enforces roughly ten rules the document does not state

**Files:** `docs/ARCHITECTURE.md` §3, §4, §9, §17, §31 · `checks/architecture.ts:161–298` ·
`docs/adr/013-the-blog-is-a-second-document.md`

**Measured today.** The string "blog" appears in `docs/ARCHITECTURE.md` **zero times**. So does
"entries". Concretely, the document that describes the current architecture does not contain:

- `src/blog/` or `src/entries/` in the §3 layer diagram
- the existence of a **second HTML document and a second Rollup entry** — §9 ("Canvas Ownership")
  still reasons about one rendering surface for one document
- any route dimension in §4's lifecycle (`BOOT → LOAD → EARTH → TRANSITION → MURCIA`), although a
  route can now suspend all five
- the six blog rules in §17's forbidden list
- ADR 013 in §31's index, which stops at 012

**Why this is a P2 and not a documentation chore.** §17 makes a specific claim about itself:

> "**These rules are enforced, not merely documented.** `checks/architecture.ts` asserts them
> against the real import graph and runs as part of `npm run check`. […] Adding one there is cheap;
> removing one should require the same argument as changing this document."

The relationship that sentence describes has inverted. The harness now asserts **26** checks, of
which roughly ten have no counterpart in §17 at all — `graphics/ !→ app/`, `utils/ !→ app/`, the
four blog reachability rules, `blog/ !→ experiences/`, `experiences/ !→ blog/`,
`corner-logo/ !→ experiences/`, `experiences/ !→ app/navigation/`. The harness has become the real
specification of the dependency model and the document has become a subset of it, while still
presenting itself as the source.

There is a second, subtler cost. The *reasoning* for each new rule is excellent and lives in
`checks/architecture.ts` as comments — the `forbidReachable` block on the blog is forty lines of
genuinely load-bearing explanation. A reader who starts at `ARCHITECTURE.md`, which is what the
document tells them to do, never reaches it.

**Proposed owner.** `ARCHITECTURE.md`, with its role narrowed and stated. It should not restate
every rule — duplicating the list is the failure mode that produced the drift. It should say:

1. §3 and §17 gain the blog, the second entry and the second document, at the level of *what layers
   exist and which way the arrows point*.
2. §17 gains one sentence: **`checks/architecture.ts` is the authoritative list; this section states
   the model, and any rule it does not mention is still real.** That is the honest description of
   the arrangement that already exists.
3. §31's ADR index gains 013. It already carries a note for 009 §4 being reversed by 012, so the
   convention exists.
4. §9's canvas-ownership reasoning gains the sentence ADR 013 already contains: there is one canvas
   *per document*, and the second document has none.

**Expected reduction.** A reader who follows the document's own instruction gets a complete model
instead of a seven-eighths one. The stated relationship between the document and the harness becomes
true.

**Migration risk.** None — it is prose. The risk is the opposite one: doing this as a full restate
would re-create the duplication. Keep the document at the level of the model.

---

### P3 — Opportunistic improvement

---

#### P3-A · CARRIED · Two shared GPU geometries use a declared-owner singleton where the codebase already has a ref-counted answer

**Files:** `src/experiences/earth/orbit/createHoloPanel.ts:370` ·
`src/experiences/earth/orbit/createEmitterCone.ts:173` ·
`src/experiences/earth/orbit/createOrbitSystem.ts` · `src/graphics/decoders.ts`

Unchanged. Both files still hold `let sharedGeometry: … | null = null` at module level, lazily
constructed and released by `createOrbitSystem.dispose()` — never by the panels or cones themselves.
Both document the arrangement and both are correct today.

`graphics/decoders.ts` solves the identical problem — one resource, many consumers, no natural
owner — with ref-counted `acquire`/`release` pairs, and PRINCIPLES §31 states that as the house
rule. The functional difference only appears with two concurrent orbit systems, and there is
exactly one construction site, so **this is not reachable today**. The finding is the divergence,
not a bug. `acquireSharedQuad()` / `releaseSharedQuad()` would make these two read like
`decoders.ts` and remove the need for `createOrbitSystem` to know that two of its dependencies keep
module state. **Risk:** low; `check:earth` (25 assertions) covers the orbit system.

---

#### P3-B · CARRIED · `SatelliteDef` is an alias that gives DOM chrome an import into Earth's scene config

**Files:** `src/experiences/earth/orbit/orbitConfig.ts:267` · `src/components/CasePanel.tsx:2,6,45` ·
`src/App.tsx:16,58` · `src/components/SceneCanvas.tsx:14,30`

```ts
export type SatelliteDef = CaseStudy
```

Unchanged: a pure alias with sixteen references. `CasePanel` is DOM chrome rendering editorial copy;
its data is a `CaseStudy` from `src/content/types`. It reaches for it through a 3D scene module,
under a name that describes where it is drawn rather than what it is — Phase 25's exact signal.
Deleting the alias and importing `CaseStudy` directly removes one `components/ → experiences/` edge
at the cost of four import lines. **Risk:** none; type-only.

---

#### P3-C · CARRIED · `CameraRig.getPose` / `getEffectivePose`

**Files:** `src/experiences/murcia/camera/CameraRig.ts:61–76`

Unchanged. `getPose()`'s own doc comment still warns that `getEffectivePose()` is what a caller
almost always wants. Renaming to `configuredPose()` / `pose()` — making the safe one the short one —
costs six call sites and removes the trap. 71 `check:district` assertions cover this rig.

---

#### P3-D · CARRIED and SHARPENED · Documentation drift on load-bearing text

1. **ADR 008 still misquotes the contract it defines.** `docs/adr/008-…:62` states
   `export type RenderRoute = 'composer' | 'direct'`. The shipped type at
   `graphics/renderableExperience.ts:60` has three members; the third is the composer-borrowing
   route ADR 005 requires. **Unchanged across all three passes.**
2. **ARCHITECTURE §11 and §29 still do not name the navigation rAF.** §29 asserts "No uncontrolled
   permanent RAF loops exist" and §11 warns against loops accumulating "without explicit
   coordination". `createNavigationInput` owns a real, deliberate, self-stopping rAF (ADR 009) that
   neither document lists, and neither does ADR 009. **Unchanged.**
3. **The entry budget is now quoted wrongly in two documents, in two different wrong ways.**
   `ARCHITECTURE.md:559` says "320,000 B entry chunk" — the number before the 2026-08-26 raise.
   ADR 013 says "332,000 B" three times, including in its "How you would know it broke" list. Both
   are stale, and the model changed underneath them: since `366691a` the primary gate is
   `INITIAL_JS_BUDGET_BYTES = 1,600,000` on the whole initial closure of `/`, with
   `ENTRY_BUDGET_BYTES = 160,000` as a narrow secondary. §17's `orbitConfig.ts` anecdote is one of
   the most useful paragraphs in the file and its punchline is now a number that does not exist.
   ADR 013's failure list instructs a future reader to watch a budget that was replaced.
4. **`src/intro-draw/isotype.ts`'s header states the mark is drawn "nowhere else on the site".**
   It is now also in `blog.html`'s favicon and inline in `BlogRoute.tsx`. See P2-E.
5. **RESOLVED:** `resolveDistrict.ts`'s resolution-order comment — the previous pass's P3-E — was
   corrected in `8ebde6a`, and now states which mechanism serves which shape and names the harness
   that asserts it.

The Stage-0 harness rule both previous reports proposed — assert every backticked repo path in
`docs/**` resolves, excluding `docs/audits/reports/` — is still worth about fifteen lines beside
`checks/audit-hygiene.ts` and still not written. It would have caught none of items 1–4, which are
*values* rather than paths; the cheaper win for those is item 3 specifically, where a single
assertion that `ARCHITECTURE.md` and `docs/adr/**` contain no budget literal absent from
`vite.config.ts` would close a recurring drift.

---

#### P3-E · NEW · The two blog hosts each spell out the same five forwards

**Files:** `src/App.tsx:503–512` · `src/entries/blog.tsx:57–65` · `src/blog/BlogRoute.tsx`
(`BlogHost`)

`BlogHost` is a good boundary — it is what lets the blog never learn which document it is in, which
is ADR 013 §3's whole point, and the ADR is explicit that inferring it from history was tried and
rejected. Both hosts construct the object with six fields, of which **five are forwarded verbatim
from `useRoute()`** and exactly one differs (`exitToScene`).

Adding a seventh operation means editing two files identically, and the failure of forgetting one is
a blog that behaves differently cold than warm — the hardest kind of bug to notice, because warm is
the path a developer takes.

`useRoute()` returning the shared five as one object (`nav.blogHost`), with each entry spreading it
and supplying its own `exitToScene`, removes the duplication without weakening the seam: the thing
that differs stays explicit at each call site, which is the part that carries the decision.
**Risk:** none; mechanical, and `e2e/blog.spec.ts` plus `e2e/mobile.spec.ts` cover both paths.

---

#### P3-F · CARRIED and GROWN · `src/components/` is now five unrelated kinds of thing

16 modules: DOM chrome (`CasePanel`, `AuditSection`, `ContactSection`, `LegalPanel`, `SiteFooter`,
`NavigationControl`, `CustomCursor`, `CaseChart`), the render host (`SceneCanvas`, `LazyScene`,
`SceneErrorBoundary`), **two experience layers** (`MurciaLayer`, `CornerLogoLayer`), a dev tool
(`DebugOverlay`), and — new — **two blog-boundary modules** (`LazyBlog`, `textSpans`), of which
`textSpans.tsx` ships inside the cold blog document and has never seen a canvas.

Unchanged cost, plus one: the two layers are outside every dependency rule *because* the directory
is generic (P1-B), and now the directory is also the reason a blog-only helper sits beside the
render host. Moving the two layers is still sufficient for P1-B; `textSpans.tsx` belongs in
`src/blog/` or a leaf both can reach.

---

#### P3-G · CARRIED from P3-4's tail · `DistrictInteractionDeps` is 19 fields, seven of which are one question

**Files:** `src/experiences/murcia/interaction/DistrictInteraction.ts:44–92`

The structural half of the previous pass's P3-4 was resolved by the one-service-per-building rework
and is not restated. The interface half carried forward and grew from 17 fields to **19**.

Seven of them answer a single question — *where is the camera and what can it see*: `camera`, `rig`,
`getPose`, `getAspect`, `resolveBounds`, `groundPlaneHeight`, `focusFlight`. Each is documented, and
the documentation is good; the count is the finding. A `FramingContext` passed as one parameter
would take the interface from 19 to 13 and, more importantly, make it possible to answer "what does
this class need to know about the camera" by reading one type instead of seven comments.

This is Phase 15 (interface complexity) rather than Phase 3 (shallow module) — the module itself is
deep and correctly so, at 766 lines behind one class. **Risk:** low; 71 `check:district` assertions
plus 17 unit tests cover it. Do it while touching the file for something else.

---

### Resolved since 2026-08-27

**P2-C · `check:asset` asserting a retired contract — RESOLVED, exactly as proposed.** The two
assertions testing the abandoned district-tag mechanism were deleted rather than left pending; the
assertion the current design needs was added (every `nodeName` in `cityDistrictBindings.ts` and
`BlogBuilding.ts` resolves to a node in the shipped GLB — 5/5 service buildings plus both blog
buildings); the model path was parameterised; and the harness was chained into `check:harnesses` as
`check:asset:contract`, whose `--contract-only` flag excludes the one genuinely pending section and
prints why. The full `check:asset` still reports 9/10 with the TEXCOORD_0 failure, which is the
trim-sheet gap and is correctly outside the gate.

**P1-A (the dangerous half) · An editor could publish content the build refuses — RESOLVED.** See
P2-C for what remains. The fix is worth reading as a model of how to answer a finding.

**P3-E · `resolveDistrict`'s "this is the production mechanism" comment — RESOLVED** in `8ebde6a`.

**One site of P2-D — RESOLVED structurally.** `murcia.css` no longer declares a breakpoint, because
the DOM district panel it belonged to became a projected WebGL display.

---

## 5. Required analysis scenarios

Files that must change today, against the real tree. "After" assumes P1-A, P1-B, P1-C, P2-A, P2-B,
P2-D and P2-F.

| # | Scenario | Now | After | Notes |
|---|---|---|---|---|
| 1 | **Add another interactive district** | **3 files** — one row in `cityDistrictBindings.ts`, one district + N services in Sanity, one binding row per service | 3 | Still excellent, and now *gated*: `check:asset:contract` fails if a bound name is not in the GLB. The best-designed extension point in the project. |
| 2 | **Add another city** | **~18 files** — new experience dir, `ExperienceId` union, `App.tsx` state, `SceneCanvas` mount + route, `useExperienceTransition`, `navigationMachine.intentFor`, `isIntentLegal`, `towardOther`, pinch rival, paint direction, rail, plus the blog's `blogOpen` guard | ~15 | Was ~16. **11 binary decisions on the two-member `ExperienceId` union across 6 files** (was 9 across 5). ADR 009 §3's "the machine does not grow by scene" is still true *of the machine*; its edges grew again. Not a defect — a cost to know before quoting a third world. |
| 3 | **Change renderer quality policy** | **1–2 files** — `SceneCanvas`'s `gl`/`dpr`, `FrameSettings` | 1–2 | Clean. ADR 008's contract does its job. |
| 4 | **Replace the camera transition implementation** | **~4 files** — `warpTransition.ts`, `CameraController`, `scrubPose`, Murcia's `warpPose` | 3 | `check:warp`'s 47 assertions are the safety net and they are pose-level, not implementation-level. Good position. |
| 5 | **Add another post-processing effect** | **1 file** — `RenderPipeline.tsx` | 1 | ADR 002/008. Clean. |
| 6 | **Change GLTF decoder infrastructure** | **1 file** — `graphics/decoders.ts` | 1 | Still the best-factored module in the codebase. |
| 7 | **Add a new type of clickable scene object** | **2–4 files** — an interaction module, its binding, `cursorManager` registration; `BlogBuilding.ts` is the worked example and took 3 | 2–4 | Good. The pattern is discoverable by reading one sibling. |
| 8 | **Add another device capability rule** | **~18 sites, 4 languages, no owner** | **1** | Still the worst in the codebase, and it got worse: the responsive `sizes` strings in `sanityImage.ts` put the breakpoint somewhere a reader will not look for it. |
| 9 | **Add a new page or route** (implied by the blog; new this pass) | **6–8 files** — `route.ts`, `useRoute`, `vercel.json`, `vite.config.ts` (dev routing, sitemap, shells), an entry or a lazy seam, `App.tsx`'s attention flags | 4–5 | **New scenario, and the second-worst.** Four of the six are outside every gate (P1-A, P1-C). |
| 10 | **Change the brand palette** | **3 stylesheets, 32 TS constants, 2 favicons, no owner** | 2 | P2-E. |

---

## 6. Proposed target architecture

The smallest architecture that meaningfully improves the existing system. Everything below is a
move or an assertion; nothing is a rewrite, and every stage leaves the application deployable.

### `src/platform/` — NEW (carried unchanged from two passes, now slightly larger)

**Responsibility.** Every question about the device, the viewport and the build.
**Interface.** `prefersReducedMotion()`, `isCoarsePointer()`, `isNarrowViewport()`,
`NARROW_MAX_WIDTH`, `DEBUG_TOOLS_ENABLED`. Product questions, not media queries.
**Hidden knowledge.** `matchMedia` and its `typeof` guard, the 767/768 pair, which query answers
which question, `__VERTIGO_ENV__`.
**Dependencies.** None. A leaf.
**Constraint.** `intro-draw/` is exempt and must remain so — it imports nothing, and
`check:architecture` already asserts that.

### `src/design/palette.ts` + `:root` tokens in `styles.css` — NEW (carried)

**Responsibility.** The brand's colours and the mark, in the two notations the project needs.
**Interface.** ~20 named constants; one shared favicon path.
**Hidden knowledge.** That `#4fb0ff` and `0x4fb0ff` are one decision.
**Dependencies.** None.

### `src/routing/` (or `src/utils/route.ts`) — NEW placement for an existing module

**Responsibility.** URL syntax, for both documents.
**Interface.** `parseRoute`, `routeToPath`, `TOPIC_PARAM`, `INITIAL_ROUTE`.
**Hidden knowledge.** Trailing-slash handling, the `tema`/`topic` translation, the deliberate
refusal to resolve semantics.
**Constraint.** Must remain cheap for the app entry to import — this is why it cannot reach for
`src/content/invariants.ts`, and the constraint should be stated wherever it lands.

### `src/content/invariants.ts` — unchanged in scope; GAINS an assertion rather than the bounds

The previous pass proposed moving the ~24 editorial bounds here. **That proposal is withdrawn for
the Studio half.** `sanity-studio/schemas/lib/slug.ts` argued the counter-case well: the Studio is
deliberately outside the app's dependency graph, and a cross-package import would couple
`sanity build` to a path outside its own package. The bounds stay where they are; a harness asserts
they agree (P2-C).

### `src/app/` — GAINS `TransitionState` and `attention`; LOSES five modules

`warpTransition.ts` → `utils/`; `route.ts` → its own leaf; `buildFlags.ts` → `platform/`;
`protoSky.ts` and `protoHolo.ts` → `experiences/earth/config/`. What remains is orchestration, and
the broad rule becomes statable.

### `src/components/` — NARROWS to chrome and the render host

`MurciaLayer` → `experiences/murcia/`; `CornerLogoLayer` → `corner-logo/`; `textSpans` → `blog/`
or a shared leaf. `src/auditView.ts` moves off the root into whichever of `app/` or `components/`
owns the audit section's scene contract.

### `scripts/` — GAINS the decisions currently inside `vite.config.ts`

**Responsibility.** Node-side build logic that a test can reach.
**Interface.** Pure functions taking data and returning strings or verdicts — `postHead`,
`shellProblems`, `replaceExactlyOnce` already live here and are already tested; the sitemap body and
`robots.txt` body join them.
**What this removes.** The "local mirror" comment in `vite.config.ts:700`, and the general licence
to copy logic because the config cannot import a test.

### `checks/` — GAINS a wider walk, one new section and one script

The walk widens beyond `src/` (P1-A, four assertions). A URL-space section is added (P1-C, four
assertions). `check:studio` joins `check:harnesses`, guarded to skip cleanly. An identifier-contract
assertion and a bounds-parity assertion join (P2-C). A palette-parity assertion joins (P2-E). A
budget-literal assertion joins (P3-D item 3).

---

## 7. Dependency direction

### Proposed

```text
                 index.html                blog.html
                     |                         |
                 main.tsx                entries/blog.tsx
                     |                         |
                  App.tsx  --------------->  blog/  <---'
                     |                         |
        +------------+------------+            |
        v            v            v            v
  experiences/   graphics/   components/    routing/
        |            |            |            |
        +------------+------------+------------+
                          v
        content/   utils/   platform/   design/   interaction/   loading/
                          (leaves - import nothing above them)

  intro-draw/            imports NOTHING (asserted)
  content/ (root, Node)  ->  src/content/    one way, to be asserted
  scripts/ (Node)        ->  src/content/    one way; vite.config.ts calls INTO scripts/
```

### Dependencies to remove or invert

| Edge | Why it is wrong | Fix |
|---|---|---|
| `experiences/earth/** → app/warpTransition` (5 edges) | a curve library is not orchestration | move to `utils/` |
| `experiences/earth/** → app/protoSky`, `protoHolo` (5 edges) | Earth's own gates, read from the application layer | move into `earth/config/` |
| `earth/camera/debugCameraHook → app/buildFlags` | a build fact is not orchestration | move to `platform/` |
| `blog/BlogRoute → app/route` | the same shape, new consumer | move `route.ts` to a leaf |
| `components/MurciaLayer → experiences/earth/config/sequenceState` | Murcia's host importing Earth's state | extract `TransitionState` (P2-A), then move the layer |
| `components/CasePanel → experiences/earth/orbit/orbitConfig` | DOM chrome reaching through scene config for a content type | delete the alias (P3-B) |
| `vite.config.ts` re-implementing `scripts/blogShell.ts` | logic copied because it cannot be imported | move the decision into `scripts/` |
| `src/auditView.ts` at the `src/` root | outside every rule by position | move it down one level |

Conceptually circular dependencies: **none found.** The import graph is acyclic (asserted), and the
hand check for conceptual cycles — a leaf reasoning about a consumer — found only the `app/` cases
above, which are misplacements rather than inversions.

---

## 8. State ownership model

Where important state should live. Unchanged from the previous pass except where the blog moved
something.

| State | Owner today | Owner proposed | Note |
|---|---|---|---|
| `activeExperience` | `App.tsx` (React) | unchanged | Correct. Discrete, rare, ADR 003. |
| `route` | `useRoute` (React) + `history.state` | unchanged | Correct, and the asymmetry is documented: history moves, the `popstate` listener moves React. |
| `transitionProgress` / `Overlay` / `Committed` | Earth's `SequenceState` | **`app/TransitionState`** | P2-A. Written by `app/`, read by both worlds. |
| `warpProgress`, `swapOverlay`, `phase`, `orbitsStarted` | Earth's `SequenceState` | unchanged | Correct. Earth's intro owns them. |
| The four panel flags + `blogOpen` | five `useState` in `App.tsx` | **one `useAttention()`** | P2-F. Five flags, four enumerations. |
| `hasFocusedDistrict` | `MurciaExperience`, read imperatively | unchanged | Correct and deliberate — read live, not mirrored. |
| `auditView` | module-level object at `src/` root | same shape, moved off the root | P1-B. The pattern is right; the position is not. |
| Cursor hint | `interaction/cursorSignal` | unchanged | Correct. A signal, not React state. |
| Scroll position per history entry | `history.state` via `blogHistory.ts` | unchanged | Correct — it must survive a reload, so the platform owns it. |
| District selection | `districtState.ts`, written through named transitions | unchanged | The best state module in the project: one writer, snapshot out, no second copy. |

### Duplicate sources of truth

1. **The identifier contract** — four executable copies (P2-C).
2. **The URL space** — four independent statements (P1-C).
3. **The breakpoint** — nine sites, two spellings (P2-D).
4. **Reduced motion** — seven JS sites, one correct owner, six bypasses (P2-D).
5. **The palette and the mark** — three stylesheets, 32 TS constants, two favicons (P2-E).
6. **The editorial bounds** — 33 Studio rules against 25 mapper constants (P2-C).

None of the six is a duplicate *value* that disagrees today. All six are duplicate *knowledge* with
no mechanism preventing tomorrow's disagreement, which is the distinction Phase 22 asks for.

---

## 9. Resource ownership model

**This remains the strongest part of the codebase and the section with the fewest findings.**
Re-verified this pass; unchanged except where noted.

| Resource | Owner | Disposal | Status |
|---|---|---|---|
| `WebGLRenderer`, canvas | R3F `<Canvas>` in `SceneCanvas` | React unmount, which never happens (ADR 003) | Correct |
| `EffectComposer`, bloom targets | `graphics/RenderPipeline.tsx` | its own effect cleanup | Correct |
| Draco / KTX2 worker pools | `graphics/decoders.ts`, ref-counted | `release()` at zero | The model the rest should follow |
| Murcia's `THREE.Scene`, city GLB | `MurciaExperience` | `dispose()` from `MurciaLayer`'s unmount | Correct |
| Orbit system, satellites, holo panels | `createOrbitSystem` | `dispose()` from `OrbitSystemLayer` | Correct |
| The two shared orbit geometries | module-level singletons, released by `createOrbitSystem` | see P3-A | Correct today; divergent pattern |
| GSAP timelines | `useMasterTimeline`, `introDraw` | effect cleanup; ADR 013 verifies none repeat forever | Correct, and the verification is the good part |
| Navigation rAF | `createNavigationInput`, self-stopping | on gesture end | Correct; **still absent from ARCHITECTURE §11/§29** (P3-D) |
| Frame loop during the blog | `frameloop` on `<Canvas>` | nothing disposed, deliberately (ADR 013) | Correct; the VRAM residency measurement is owed, not a defect |
| Blog images | the CDN; `sanityImage.ts` builds the URLs | browser | Correct, and the mirroring question is settled in writing |

The one thing worth adding to this model is not a fix but a rule: **the blog is the first feature
that made an entire resource graph go idle rather than away.** ADR 013 argues that correctly. What
does not yet exist is a statement of which resources are permitted to be idle-but-resident, so the
next feature that wants to suspend something has a precedent to read rather than an ADR to
re-derive. One paragraph in ARCHITECTURE §21, alongside P2-H's edits.

---

## 10. Refactoring roadmap

Incremental. No rewrite. Every stage leaves the application deployable, and every stage is
independently valuable if the next is never done.

### Stage 0 — Safety and enforcement (do first; nothing depends on it, and it is where the leverage is)

All of these are additive assertions that pass against the current tree. They are cheap, they run on
every `npm run check`, and each converts a class of silent failure into a named build failure.

1. **The `src/`-root rule** — nothing lives there but `App.tsx`, `main.tsx` and ambient
   declarations. One assertion. (P1-B)
2. **The four boundary assertions** — `src/content/` has no `node:` import and no DOM global; root
   `content/` imports nothing under `src/` except `src/content/`; nothing under `src/` imports root
   `content/`. (P1-A)
3. **The URL-space section** — `vercel.json` parses, has no undocumented keys, and its rewrites
   cover every shape `routeToPath` emits; the sitemap's URL set matches. (P1-C)
4. **The identifier-contract assertion** — the four copies are byte-identical and there are exactly
   four. (P2-C)
5. **`check:studio`** — chained, guarded to skip cleanly when the Studio is not installed. (P1-A)
6. **Fix `vitest.config.ts`'s three dead paths** and decide, in writing, whether the coverage
   thresholds are a gate or a tool. (P2-G)
7. **The bounds-parity assertion**, with its exceptions table. (P2-C)

### Stage 1 — Clarify ownership (behaviour-preserving moves)

8. Extract `TransitionState` from `SequenceState` into `app/`. Five files; `check:warp`'s 47
   assertions are the evidence. (P2-A)
9. Move `protoSky.ts` and `protoHolo.ts` into `experiences/earth/config/`. Earth-internal; cannot
   break anything else. (P2-B)
10. Move `warpTransition.ts` and `route.ts` out of `app/`, `buildFlags.ts` into `platform/`, then
    state the two broad rules. (P2-B)
11. Move `MurciaLayer` and `CornerLogoLayer` into the directories that own them; move `auditView.ts`
    off the root. Then the P1-B hole is closed rather than merely named. (P1-B)
12. Move the sitemap and `robots.txt` bodies into `scripts/`; delete the "local mirror". (P1-A)

### Stage 2 — Give the duplicated knowledge an owner

13. `src/platform/`, and convert all ~18 sites. Do reduced motion first — it has a correct owner
    already and six bypasses. (P2-D)
14. `src/design/palette.ts` + `:root` tokens, literally value-for-value in one commit, with the e2e
    baselines as evidence. Then the two favicons. **Do not choose new colours in this change.** (P2-E)

### Stage 3 — Deepen abstractions

15. `useAttention()` in `App.tsx`. (P2-F)
16. `FramingContext` in `DistrictInteractionDeps`. (P3-G)
17. `nav.blogHost` so the two entries stop spelling out five identical forwards. (P3-E)
18. `acquireSharedQuad()` / `releaseSharedQuad()` in the orbit system. (P3-A)

### Stage 4 — Remove obsolete layers and special cases

19. Delete the `SatelliteDef` alias. (P3-B)
20. Rename `CameraRig.getPose` / `getEffectivePose`. (P3-C)
21. Move `textSpans.tsx` out of `components/`. (P3-F)

### Stage 5 — Documentation

22. `ARCHITECTURE.md` §3, §9, §17, §21 and §31 gain the blog, the second document, the idle-resident
    rule, and the sentence that names `checks/architecture.ts` as the authoritative rule list. (P2-H)
23. ADR 008's `RenderRoute`; ARCHITECTURE §11/§29's navigation rAF; the budget literals in
    ARCHITECTURE §17 and ADR 013; `isotype.ts`'s header. (P3-D)
24. The doc-path harness rule, and the budget-literal assertion. (P3-D)

**Ordering note.** Stage 0 is worth doing even if nothing after it ever happens. Seven assertions,
all passing today, all cheap, and between them they cover the two hotspots this audit ranks first
and second. It is the highest ratio of risk removed to work done anywhere in this report — and it is
the same advice the previous two passes gave about their own Stage 0, which was not executed.

---

## Appendix — what this audit deliberately did not report

Recorded so the next pass does not rediscover them as findings.

- **Both worlds permanently mounted; the two experiences having different lifecycle shapes; `active`
  as a boolean; Murcia bypassing the composer; the transition driving no camera.** ADR 001, 003, 005
  and ARCHITECTURE §7 and §12. Settled, argued, and correct.
- **The Studio's separate `tsconfig.json` and its inability to import from `src/`.** Argued in the
  file. This pass explicitly withdraws the previous pass's suggestion of a cross-package import.
- **`window.__vertigoIntro`.** Load-bearing; a static import breaks the chunk split.
- **The blog chunk downloaded in a warm session that may never open it.** ADR 013, explicitly
  accepted and demoted in `introEntry()`.
- **`frameloop="never"` disposing nothing, and GPU memory staying resident.** ADR 013. A measurement
  owed on real iOS hardware, not a design defect — and naming it as one would be the exact error the
  brief's Phase 24 warns against.
- **The static shells prerendering metadata and not article bodies.** ADR 013 §4, argued against the
  actual JavaScript behaviour of the crawlers that matter.
- **`orbitAssignments.ts` living in scene code rather than in content.** Argued at length and gated
  by a test against the real content.
- **The `--contract-only` split in `check:asset`.** Deliberate, documented in the harness's own
  output, and the right answer to a genuinely pending gap.
- **`public/models/city-backdrop.glb` being reachable only through the `?model=` debug override.**
  It is an authoring asset with a documented purpose (`docs/murcia/blender-city-backdrop.md`), not
  dead code. Its delivery weight is the performance audit's subject, not this one's.
- **File sizes.** `createNavigationInput.ts` (932), `MurciaExperience.ts` (901),
  `DragPanController.ts` (890), `servicesDisplay.ts` (829), `DistrictInteraction.ts` (766) are all
  large and all deep — one class or one factory behind a small interface. PRINCIPLES §4 and the
  brief's Phase 2 and Phase 26 all say the same thing: splitting them would be a cosmetic change
  that raises the number of places a reader must visit.
- **The comment density (44% of `src/`).** It is overwhelmingly *why*, PRINCIPLES §24 asks for it,
  and it is the reason this audit could be conducted from the source. The risk is drift, which is
  Hotspot 10 and P3-D, not the comments themselves.
- **Security posture** (`Content-Security-Policy-Report-Only`, the CDN `img-src`, the `?model=`
  allow-list). `cybersecurity-project-security-2026-08-27.md` owns these; nothing this pass saw
  changes them.
- **Bundle weight and asset delivery.** `website-performance-and-optimization-2026-08-27.md` owns
  them. This report quotes the budgets only as evidence about *where the budget logic lives*.
