# ADR 013 — The blog is a second document, and the scene is frozen rather than left running

Status: **Accepted** — 2026-08-31
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
- A cold `/blog` requests `three-*.js`, `city-prototype.glb` or anything under `public/earth/`.
- The isotype draws itself over an article.
- The 3D site's body font changes after a visitor reads a post.
- "Ir atrás" twice from an article lands on the article instead of the scene.
- `history.scrollRestoration` is still `'manual'` after the blog has been left.
- The app entry exceeds 332,000 B and the message blames three.js.
