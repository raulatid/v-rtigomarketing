# ADR 013 — The blog is a second document, and the scene is frozen rather than left running

Status: **Accepted** — 2026-08-31
Amended: **2026-09-04** — the blog's header draws the real 3D mark (see the amendment below)
Supersedes: `adr/011` §"The blog is modelled and not rendered" — the schema now has a renderer
Depends on: `adr/003` (both experiences stay mounted), `adr/002` (one render pipeline)

## Context

`adr/011` modelled `blogPost` and deliberately shipped no page, no route and no renderer, and
`checks/architecture.ts` asserted the absence. That was the right call while nothing rendered it.
The client now wants the blog, which forces three questions the codebase has never had to answer.

**There is no router.** `/debug` is the only path the application reads, once, at module load,
and `vercel.json` rewrites it to the same document. Adding the first real route to an application
whose entire visual state lives in one `WebGLRenderer` is not a routing problem; it is a
lifecycle problem wearing a routing problem's clothes.

**A reader is not a viewer.** Someone four minutes into an article is paying for a full rAF loop,
an `EffectComposer` with five bloom mips, and both experiences' per-frame work, to look at a page
that is opaque white over all of it. That cost is the reason this feature exists.

**But a reload would cost more than it saves.** `adr/003` keeps Earth and Murcia mounted for the
application's lifetime precisely so a transition never rebuilds anything. A page navigation to
`/blog` discards the GL context, disposes the composer (`RenderPipeline.tsx:151-167`), tears down
the 1.26 MB city (`MurciaLayer.tsx:170-176`), releases the ref-counted Draco/KTX2 worker pools,
and replays the intro from zero. The viewer would pay seconds and megabytes to get back to a
scene they never left.

## Decision

Three parts. The first is what makes the other two simple.

### 1. `/blog` is served by its own HTML document

`blog.html` → `src/entries/blog.tsx` → `<BlogApp/>`, alongside `index.html` → `src/main.tsx` →
`<App/>`. Both mount the same `src/blog/BlogRoute.tsx`; they differ only in the host callbacks
they hand it.

The alternative — rewriting `/blog` to `index.html` — was rejected because "a cold blog load
mounts no 3D" would then be a claim maintained by guards rather than a fact. On a cold load
`index.html` still:

- runs `src/intro-draw/boot.ts`, head-prepended by `introEntry()` and ending in
  `window.__vertigoIntro ??= boot()`, so the isotype draws itself over the article;
- `modulepreload`s three.js, `SceneCanvas` and `MurciaExperience`, because `introEntry()` injects
  a link for every non-entry chunk and a `<link>` in served HTML cannot be conditioned on the
  path without an edge function;
- `preload`s 2.43 MB of Earth textures and the sky panorama;
- mounts `useMasterTimeline` against a `cornerLogo` ref that will never be filled.

Each of those needs its own guard, in a different file, and every one of them is a guard that can
regress silently. With a second document none of it is on the page. The absence is structural.

### 2. Suspension is `frameloop`, and hiding is `visibility`

In a warm session the Canvas stays mounted and
`<Canvas frameloop={suspended ? 'never' : 'always'}>` stops the loop.

**Not by gating `RenderPipeline`.** Its `useFrame` runs at priority 1, which takes `gl.render`
over from R3F — an early return there produces a *blank* canvas, not a frozen one. Its own
comment says so, and this ADR exists partly to keep that comment believed.

**Not with `display: none`.** R3F measures the inner container div with a `ResizeObserver` plus
`getBoundingClientRect`. A collapsed box measures 0×0, which flows into `configure` →
`gl.setSize(0, 0)` (the drawing buffer is reallocated and the frozen frame destroyed) →
`composer.setSize(0, 0)` (UnrealBloom rebuilds five mip targets) → `MurciaLayer`'s
`setViewport(aspect: 0)` → the ground-footprint maths that `checks/footprint.ts` exists to
protect. That is a rebuild on every round trip: exactly what `adr/003` forbids, arrived at by
accident.

`visibility: hidden` on a permanently-present `.app__scene` wrapper removes painting and
hit-testing while leaving every layout box intact, so nothing measures and nothing resizes. The
wrapper is needed rather than the canvas alone because `.warp-overlay`, `SiteFooter`,
`NavigationControl` and the audit/contact triggers are siblings of `<LazyScene>`, not children of
it. (`.murcia-ui` is *inside* `.scene-canvas` — it is appended to `gl.domElement.parentElement` —
and needs nothing.)

### 3. Leaving the blog is the host's decision, never history's

The blog never infers which document it is in. Its host supplies `exitToScene()`: `App` calls
`history.back()`; `BlogApp` calls `location.assign('/')`.

Three operations, kept distinct, because collapsing them produces a specific bug:

- `openPost` — index → article, `pushState`, recording on the pushed entry how far back the index
  sits;
- `returnToIndex` — article → index, `history.go(-indexDelta)`, which **unwinds** to the original
  index entry with its filter and scroll position and leaves history depth where it started;
- `exitToScene` — the only thing that leaves the blog.

Pushing a fresh `/blog` entry instead of unwinding produces
`Murcia → /blog → /blog/article → /blog`, where `exitToScene`'s single `history.back()` lands on
the *article*. The reader cannot get out, and the index's scroll position is gone.

### 4. The static shells prerender metadata, not article bodies

Each post is emitted as `dist/blog/<slug>/index.html`, cloned from `blog.html`
with its own title, description, canonical, `og:*` and a `BlogPosting` JSON-LD
block. **The article body is still rendered by React in the browser.** This is
not static site generation and is not described as such anywhere in the code.

That scope is a decision, not a shortcut. Googlebot renders JavaScript and
indexes the body; Bingbot does so partially and later. Facebook, X, LinkedIn,
WhatsApp and Slack run no JavaScript at all and read only the head — so the head
is precisely the part that cannot be left to the client, and it is the whole of
the failure this solves: a shared link rendering as a blank card. Prerendering
the body is a separate, later change.

The emitted tree mirrors the public URLs, because Vercel resolves the filesystem
before applying a rewrite: a known slug is served its own head and the
`/blog/:slug` rewrite fires only for slugs that do not exist, which is exactly
the case that should reach the SPA and render "Entrada no encontrada" at HTTP
200. An earlier revision emitted `dist/blog/<slug>.html` while the rewrite
pointed at `blog.html`; the two never met, so every shell was a dead file. The
build now asserts one directory per post and no orphans, in both directions.

The transformation is FAIL-CLOSED. `replaceExactlyOnce` throws unless it matched
once; the marker region must exist exactly once; and every emitted shell is
verified before it is written — exactly one of each tag, absolute crawler-facing
URLs, root-absolute asset paths, and the markers gone. A best-effort string
replace would emit a document that looks completely fine and carries the wrong
metadata, which is the one failure nobody would notice.

## Amendment, 2026-09-04 — the mark is the one thing the blog does pay 3D for

**What changes is the SCOPE of "the cold document is 2D", not the decision underneath it.** The
client asked for the brand mark in the blog's header to be the same 3D logo the scene draws, on
both hosts, rather than the flat SVG this ADR shipped. It was chosen over the two cheaper answers
put beside it — a turntable pre-rendered from the same GLB, and a static render — so this is a
decision, not an oversight, and it should not be re-litigated as one.

The blog still refuses everything this ADR was actually written about: no `App`, no `LazyScene`,
no intro boot, no Earth textures, no sky, no city, no navigation gesture, no custom cursor. What it
now permits is exactly the corner logo's own closure — three.js, the Draco and Basis decoders,
`/models/model.glb` (~20 KB) and `/textures/logoBake.ktx2` (~23 KB).

**The cost is bounded by ORDER rather than by absence, and that is the part worth testing.** The
SVG is the first paint. The 3D module is fetched on idle, after the article has rendered, through
one dynamic import in `blog/BlogHeaderLogo.tsx`, so the reader's bytes go to the text first and the
mark upgrades in place. Every failure path — no WebGL2, a 404 on the GLB, a lost context, a chunk
that will not load after a redeploy — leaves the SVG standing, which is what this header shipped
before. `e2e/blog.spec.ts` asserts the ordering, and states the allow-list in both directions:
a ban narrowed once can be widened again without anyone noticing what came in behind it.

**A warm document now has two WebGL contexts.** The scene's, suspended and hidden, and the
header's, 44×44 and `low-power`. "The application's single renderer" (`adr/001`, `adr/002`) scopes
to the SCENE from here on. The concrete consequence to re-read on any change to load ordering is
`graphics/decoders.ts`, whose `acquireKtx2Loader` calls `detectSupport(renderer)` on every acquire
and reasons from "one renderer — which is all there ever is here". It is harmless today (same GPU,
same formats, and the scene's KTX2 loads complete long before the blog is reachable) and it is no
longer true.

**The renderer outlives the React component that asks for it.** `Index` and `Article` are different
component types, so `TopBar` unmounts and remounts on every article open; a component-owned
renderer would drop its context, re-fetch the GLB and re-compile on each one, flickering back to
the SVG each time. `blog/headerLogoRuntime.ts` therefore keeps one instance per document and
re-parents its canvas — the residency argument this ADR already makes for the scene, applied to a
much smaller thing.

**`/`'s initial request count went from 9 to 11, for 3,317 B.** The header logo's own chunk is
excluded from the modulepreload loop, so none of that is the feature landing on `/`. It is Rollup
re-cutting shared modules once the corner logo has two dynamic consumers: `utils/easing` and
`graphics/decoders` stopped being duplicated into their importers and became chunks of their own.
One of the three splits was worth fixing and was — `CornerLogoLayer` no longer reaches a constant
out of `logoMotion`, so that module came back inside the corner-logo chunk.

**Open, and deliberately not settled here: the mark is pale on paper.** `logoBake.ktx2` is a light
material, correct against a black sky and low-contrast against the blog's `#fbfbfa` bar, where the
flat SVG was near-black ink. The lights belong to `createCornerLogo` and are shared with the scene,
so darkening them is an art-direction change for both surfaces rather than a blog-side tweak.

## Consequences

**Warm and cold are genuinely different products, and that is the point.** A warm blog costs one
lazy chunk over an already-loaded application. A cold blog is a 2D document that has never heard
of three.js. Neither is a degraded version of the other.

**A warm session downloads a blog chunk it may never open.** Accepted; it is demoted in
`introEntry()` so it never competes with the scene chunks.

**GPU memory stays resident while the blog is open.** `frameloop="never"` removes per-frame cost
and deliberately disposes nothing — that is what makes the return free. Both scenes' textures and
geometry sit in VRAM while the article loads its own images. This is a measurement owed on real
iOS hardware, not a thing to design around in advance.

**The architecture rule changes rather than disappearing.** `checks/architecture.ts` stops saying
"nothing imports the generated blog content" and starts saying "the blog is not *statically*
reachable from `src/main.tsx`". The original rule's stated reason — modelled, not rendered —
expires here. Its real value does not: a static import of the dataset from the WebGL entry blows
the 332,000 B budget and reports itself as a three.js leak. That matters more now, not less,
because there is finally a legitimate importer and the tempting mistake is to hoist it.

**`gsap` is not paused, and that is a verified claim rather than an assumption.** GSAP appears in
four files, Murcia uses none, and nothing in `src/` repeats forever. At the moment the blog can be
opened — Murcia active, phase `site`, not transitioning — every timeline has already completed.
The invariant is asserted in the e2e round trip instead of being bought with
`gsap.globalTimeline.pause()`, which is global state owned by no module and would freeze anything
the blog itself later animates.

**The blog registers fonts under blog-specific family names.** `blog.css` is injected into the
live document in a warm session, and `@font-face` is global regardless of which stylesheet
declared it. `styles.css` already asks for `'Inter', system-ui` and resolves to `system-ui`
because no `Inter` face exists; a blog that registered a real one would silently restyle the 3D
site the moment a reader came back. `"Vertigo Blog Inter"` and `"Vertigo Blog Serif"` cannot
collide.

## How you would know it broke

- Returning from the blog shows a loading state, a re-drawn intro, or a black canvas.
- `renderer.info` grows across a blog round trip — something is being disposed and rebuilt.
- `gl.info.render.frame` advances while the blog is open.
- A cold `/blog` requests `city-prototype.glb`, anything under `public/earth/`, or a chunk named for
  `SceneCanvas` or `MurciaExperience`.
- A cold `/blog` requests `three-*.js` *before* the article has rendered. The mark is deferred, and
  order is the whole of what "deferred" means on a network log.
- More than one `<canvas>` exists on a cold `/blog`.
- The header's mark flickers back to the flat SVG when an article is opened — the runtime's single
  instance was disposed with the component instead of being re-parented.
- `/`'s initial JS budget reports a request count with no matching new entry in the itemised list:
  the `isPreloadedOnIndex` exclusion for the header-logo chunk has stopped matching.
- The isotype draws itself over an article.
- The 3D site's body font changes after a visitor reads a post.
- "Ir atrás" twice from an article lands on the article instead of the scene.
- `history.scrollRestoration` is still `'manual'` after the blog has been left.
- The app entry exceeds 332,000 B and the message blames three.js.
