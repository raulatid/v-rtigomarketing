import { defineConfig, HtmlTagDescriptor, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import type { OutputChunk } from 'rollup'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
// The generated content is a BUILD ARTIFACT, and importing it here is safe only
// because `precheck` runs `content:build` before `vite build`. If the sitemap or
// the blog shells ever come out empty, that ordering is the first thing to check.
import { BLOG_POSTS } from './src/content/generated/blogPosts'
import {
  blogDocuments, blogRewrite, blogTreeProblems, documentCanonical, isBlogDocument, seoFiles,
} from './scripts/publicationPolicy'
import { findSecretLeaks, publicPrefixedSecrets, scannableSecrets } from './scripts/secretScan'

// The loading animation is worthless if it is itself waiting on a bundle, so
// the boot entry's standalone-ness is a build-time invariant rather than a
// convention (DECISIONS.md 26.4, "Code that runs first depends on nothing").
//
// Asserted on the emitted bundle rather than on import statements: a dynamic
// import, a stray global or a side-effectful module would all slip past an
// ESLint path rule while breaking the actual property.
// Measured, not guessed. History, so the next raise is an informed one:
//   9.6KB  the drawing + isotype path data (plan 006)
//  12.0KB  + boot state machine, readiness, diagnostics (plan 007)
// Raised to 16KB deliberately when the state machine landed — the assertion
// fired at 12005B, which is exactly its job. Do not raise it again without
// knowing what was added; gzipped is what the user waits for, and the build
// prints both.
const INTRO_BUDGET_BYTES = 16_000
// WHAT A COLD `/` ACTUALLY COSTS, measured 2026-08-31 against the production
// build with a headless browser: 1,525,267 B of JavaScript over 9 requests
// (386,597 B brotli), all of it requested within ~130 ms of navigation start.
//
// The number below used to be a budget on the app ENTRY CHUNK alone, and that
// was the wrong thing to measure from the day the modulepreload loop in
// `introEntry` landed. That loop injects a link for EVERY non-entry chunk, so
// `/`'s initial closure is the whole bundle minus the blog document's entry —
// the entry chunk is 110,828 B of it, 7.3%. A 332,000 B guard on 7.3% of the
// payload left 221 KB of silent headroom and could not see the growth vector
// that matters: a new lazy chunk joins the initial load automatically, and
// nothing noticed when `BlogRoute` (14,050 B) did exactly that.
//
// It also could not see three.js. Adding `blog.html` as a second HTML entry
// (adr/013) gave Rollup two consumers for React and it hoisted React into a
// shared chunk, which is why the entry FELL from ~322 KB to 110,828 B in one
// commit while what a visitor downloads stayed the same — the bytes moved next
// door. Redistribution reads as a 65% improvement to a single-chunk budget.
//
// So the primary gate is the whole closure, and the request count beside it:
// bytes alone would let a new 70 KB route chunk onto the initial load in
// silence, and a new REQUEST on `/` is the thing worth a human look regardless
// of its size.
//
// Headroom is deliberate and small — about 4.9%, roughly 75 KB. When this
// fires, read the itemised list in the message before raising it: a NEW chunk
// in the list is a loading decision, an existing one growing is app growth, and
// they do not have the same fix.
//
// ── 1,600,000 -> 1,610,000, 2026-09-09, plan 022 ──
//
// APP GROWTH, not a loading decision: no new name appeared in the list, and the
// existing `MurciaExperience` chunk grew. Measured rather than estimated —
// `createBlogDisplayEntry` was stubbed to return null and the bundle rebuilt, so
// the whole feature's graph fell out and the difference is attributable:
//
//   128,439 B  MurciaExperience without the blog display
//   148,548 B  with it
//    20,109 B  the blog's display, its two camera flights and its page image
//
// against 15,142 B of headroom, so it was over by 4,967 B. What the 20 KB buys is
// documented in DECISIONS §42: a second shader-drawn display over the blog
// cluster, the approach and return flights, the page-image pipeline and the
// full-screen cover the handoff runs behind.
//
// Three alternatives were measured and rejected. Dropping the extruded plate
// behind the panel saves 3,596 B of the 20,109 — not enough on its own, and it
// costs the thing that makes the display read as an object. Making the display a
// dynamic import does not help, for the reason recorded above: `introEntry`'s
// modulepreload loop injects a link for every non-entry chunk, so a new chunk
// rejoins this closure automatically and brings a request with it. Cutting the
// feature was declined by the client.
//
// The headroom this leaves is 5,033 B, which is much less than the 4.9% above
// describes. The next thing that lands here will fire this again, and the honest
// answer at that point is probably to make the modulepreload loop selective
// rather than to raise this a second time.
const INITIAL_JS_BUDGET_BYTES = 1_610_000
// 2026-09-15, audit AR-01: keep this limit. BlogRoute is now fetched on the
// existing city approach prefetch, not by the cold / modulepreload loop.
// Measured initial closure: 1,613,978 -> 1,596,527 B; 11 -> 10 requests.
// Raised 10 -> 12 on 2026-09-04, and here is the itemised reason the message
// below asks for. The blog's header became a SECOND dynamic consumer of the
// corner logo, and Rollup re-signatures every module those two dynamic entries
// share: `utils/easing` (1,207 B) and `graphics/decoders` (420 B) stopped being
// duplicated into their importers and became chunks of their own.
//
// So this is neither of the two cases the note below names. It is not new code
// on `/` — the initial closure went from 1,527,335 B to 1,530,652 B, and the
// 3,317 B difference is chunk boilerplate — and it is not a new feature landing
// on the initial load: the header logo's own chunk is excluded from the preload
// loop (see `isPreloadedOnIndex`). It is the same bytes, cut differently.
//
// Two of the three splits WERE worth fixing and were: `logoMotion` came back
// inside the corner-logo chunk once `CornerLogoLayer` stopped statically
// importing a constant out of it (a three-importing module reached for a plain
// value — the shape the assertion further down warns about). The remaining two
// are shared-module hoists with no static edge to remove.
//
// 12 rather than 11 keeps the one slot of headroom this budget has always had.
const INITIAL_JS_REQUEST_BUDGET = 12

// Secondary, and narrow now that the closure above is the real gate: it only
// answers "did a large dependency or the generated dataset land in the ENTRY".
// three.js is no longer this budget's job — it has its own structural assertion
// below, on the emitted chunk graph rather than on a size.
//
// Measured 110,828 B on 2026-08-31.
const ENTRY_BUDGET_BYTES = 160_000

/**
 * The blog chunk carries the UI, the serializer and the WHOLE post dataset, so
 * it grows with the article library rather than with the code. At three posts it
 * is a rounding error; at fifty it is the thing a reader waits for.
 *
 * A ceiling rather than a target, and deliberately generous: the point is to
 * notice the day the library became the payload, not to police editorial. When
 * it fires, the fix is to split index metadata from article bodies, not to raise
 * the number without reading it.
 */
const BLOG_BUDGET_BYTES = 120_000

/**
 * The chunk that gates READINESS, and the one large chunk nothing budgeted.
 *
 * Everything a visitor waits for on `/` is behind it: the R3F canvas, the render
 * pipeline, the Earth scene, the sky and the space backdrop. `three` is bigger
 * and is deliberately unbudgeted — it is a pinned dependency that changes on a
 * version bump and nothing else, so a byte count on it would measure npm rather
 * than this repository. This one is OURS, it grows with every scene feature, and
 * it is downloaded before anything is drawn.
 *
 * Measured 246,990 B in the 2026-09-05 production build. The ceiling is that
 * plus about 15%: tight enough that a whole new subsystem landing here fires it,
 * loose enough that ordinary scene work does not. It is a CEILING, not a target
 * — when it fires, read the initial-closure total first (it is the primary gate
 * and it moves for a different set of reasons), then decide whether what was
 * added belongs behind a lazy seam. Raising it is fine; raising it without
 * knowing what was added is how a budget stops meaning anything.
 */
const SCENE_BUDGET_BYTES = 285_000

/**
 * Chunks that `index.html` modulepreloads: every non-entry chunk in the bundle.
 *
 * ONE PREDICATE, TWO CONSUMERS, and that is the point of extracting it. The
 * loop in `introEntry` emits the links; `assertChunkBudgets` sizes the result.
 * Written twice they could disagree, and a budget that measures a set the HTML
 * does not emit is worse than no budget — it would report a healthy number
 * while the browser downloaded something else.
 *
 * Add `/`'s two entry chunks (the app entry and the intro entry, which are
 * script tags rather than preloads) and this IS the initial JS closure of `/`:
 * the whole bundle except the blog document's own entry.
 */
/**
 * The FPS meter, which `?stats=1` asks for and nothing else ever does.
 *
 * `stats.js` ships as a UMD build whose top level is a side-effectful IIFE, so
 * Rollup cannot tree-shake it out of a chunk that imports it: while
 * MurciaDebugTools held a value import, the library shipped to every production
 * visitor behind a boolean that is false there. It is loaded on demand now, and
 * a production build therefore emits no chunk for it at all — which the
 * assertion in assertChunkBudgets turns into an invariant rather than something
 * verified once by hand.
 *
 * Excluded from the preload loop for the same reason the header logo is: a
 * preview build does emit the chunk, and preloading a debug meter on `/` spends
 * a request out of a budget that exists to protect the first paint.
 *
 * Matched on the module rather than the chunk name for the reason given above
 * HEADER_LOGO_MODULE — Vite derives names and they are not stable enough to
 * hardcode. The name happens to be `stats.min` today; that is not the contract.
 */
const STATS_MODULE = 'stats.js/build/stats.min.js'

function isStatsChunk(chunk: OutputChunk): boolean {
  return chunk.moduleIds.some((id) => id.replace(/\\/g, '/').includes(STATS_MODULE))
}

function isPreloadedOnIndex(chunk: OutputChunk): boolean {
  if (isHeaderLogoChunk(chunk)) return false
  if (isStatsChunk(chunk)) return false
  // The city starts prefetchBlog() on approach; cold / does not need the route.
  if (isBlogRouteChunk(chunk)) return false
  return !chunk.isEntry
}

function isBlogRouteChunk(chunk: OutputChunk): boolean {
  return chunk.facadeModuleId?.replace(/\\/g, '/').endsWith('src/blog/BlogRoute.tsx') === true
}

/**
 * The blog header's 3D mark (`src/blog/headerLogoRuntime.ts`), which `/` has no
 * use for.
 *
 * The scene draws the same logo as an overlay pass on its own canvas (ADR 002)
 * and already preloads the chunks this one shares; the only thing `/` would gain
 * from preloading it is a request. Excluded here rather than raising
 * `INITIAL_JS_REQUEST_BUDGET`, which is what the budget's own failure message
 * tells you to do when a new chunk is genuinely not wanted on `/`.
 *
 * Matched on the source module, like the intro and blog chunks below: Vite
 * derives chunk names and they are not stable enough to hardcode.
 */
const HEADER_LOGO_MODULE = 'src/blog/headerLogoRuntime.ts'

function isHeaderLogoChunk(chunk: OutputChunk): boolean {
  return chunk.facadeModuleId?.replace(/\\/g, '/').endsWith(HEADER_LOGO_MODULE) === true
}

/**
 * No credential may be written to `dist/`.  See `scripts/secretScan.ts` for what
 * is checked and why it is two independent rules rather than one.
 *
 * Placed in `generateBundle` on purpose: it aborts BEFORE anything reaches disk,
 * so a build that would have leaked leaves nothing behind to deploy by accident.
 *
 * It runs in every environment, not only production. A preview deployment is
 * just as public, and a developer who VITE_-prefixes a token should hear about
 * it on the laptop rather than from the build that shipped it.
 */
function assertNoSecrets(): Plugin {
  return {
    name: 'vertigo-no-secrets',
    apply: 'build',
    generateBundle(_options, bundle) {
      const prefixed = publicPrefixedSecrets(process.env)
      if (prefixed.length > 0) {
        this.error(
          `${prefixed.join(', ')} is VITE_-prefixed, and Vite compiles every VITE_* value ` +
            'into the client bundle. A credential must carry no prefix — read it in ' +
            'scripts/build-content.ts or server/, which run on the build machine.',
        )
        return
      }

      const secrets = scannableSecrets(process.env)
      if (secrets.length === 0) return

      const files = Object.values(bundle).map((asset) => ({
        name: asset.fileName,
        text:
          asset.type === 'chunk'
            ? asset.code
            : typeof asset.source === 'string'
              ? asset.source
              : Buffer.from(asset.source).toString('latin1'),
      }))

      for (const leak of findSecretLeaks(files, secrets)) {
        // The value is not printed. A build log is not a place to reprint a
        // credential, and the variable name plus the file is the whole fix.
        this.error(
          `the value of ${leak.name} appears in ${leak.file}. It is a credential and this ` +
            'is a public asset — find what put it there (a define, a generated module, an ' +
            'error string that serialized the environment) and stop it. Rotate the value: ' +
            'assume the build that produced this was deployed.',
        )
      }
    },
  }
}

function assertChunkBudgets(): Plugin {
  return {
    name: 'vertigo-chunk-budgets',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (c): c is OutputChunk => c.type === 'chunk',
      )

      // Escape hatch for inspecting a failing bundle — the assertion aborts the
      // build before anything is written to dist, which is otherwise the one
      // time you most want to look at the output.
      if (process.env.VERTIGO_SKIP_BUDGETS) {
        for (const c of chunks) {
          this.warn(
            `${c.fileName} entry=${c.isEntry} name=${c.name} ` +
              `size=${Buffer.byteLength(c.code, 'utf8')} imports=[${c.imports.join(' ')}]`,
          )
          // WHERE THE BYTES CAME FROM, not just how many there are. A budget
          // that fires tells you a chunk grew; this tells you which module did
          // it, which is the question you actually have next. Rollup already
          // knows — `renderedLength` is the post-treeshake, pre-minify size of
          // each module's contribution — and printing it here means the answer
          // needs no bundle-analyser dependency and no second build.
          const modules = Object.entries(c.modules)
            .map(([id, m]) => [id.replace(/\\/g, '/'), m.renderedLength] as const)
            .filter(([, size]) => size > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
          for (const [id, size] of modules) {
            this.warn(`    ${String(size).padStart(8)}  ${id.replace(process.cwd().replace(/\\/g, '/'), '')}`)
          }
        }
        return
      }

      // Matched on the source module rather than the chunk name: Vite derives
      // entry names from the html script tag and they are not stable enough to
      // hardcode.
      const intro = chunks.find(
        (c) => c.isEntry && c.facadeModuleId?.replace(/\\/g, '/').endsWith('src/intro-draw/boot.ts'),
      )
      if (!intro) {
        this.error(
          'intro boot entry not found — is the script tag still in index.html? ' +
            `Entry chunks present: ${chunks
              .filter((c) => c.isEntry)
              .map((c) => `${c.name} (${c.facadeModuleId ?? 'no facade'})`)
              .join(', ')}`,
        )
        return
      }

      const shared = [...intro.imports, ...intro.dynamicImports]
      if (shared.length > 0) {
        this.error(
          `intro entry must be standalone but imports: ${shared.join(', ')}. ` +
            'Either something in src/intro-draw now depends on app code, or app ' +
            'code statically imports intro-draw and Rollup hoisted a shared chunk.',
        )
      }

      const introSize = Buffer.byteLength(intro.code, 'utf8')
      if (introSize > INTRO_BUDGET_BYTES) {
        this.error(`intro entry is ${introSize}B, over the ${INTRO_BUDGET_BYTES}B budget`)
      }

      const entry = chunks.find((c) => c.isEntry && c.name === 'index')
      if (!entry) {
        // Previously a silent skip: a missing entry left the size at 0 and every
        // check below it passed. A budget that disappears when its subject does
        // is not a budget.
        this.error(
          'app entry chunk not found (expected the chunk named "index"). ' +
            `Entry chunks present: ${chunks
              .filter((c) => c.isEntry)
              .map((c) => c.name)
              .join(', ')}.`,
        )
        return
      }

      // THREE.JS MUST REACH `/` THROUGH A DYNAMIC IMPORT AND NOTHING ELSE.
      //
      // Asserted on the emitted chunk graph, which is the only place the real
      // property is visible. `manualChunks` pins three to its own chunk
      // unconditionally, so the test that used to live here — "is three still a
      // separate chunk", spelled `!entry.code.includes('BufferGeometry')` — was
      // true by construction and could never fire. Meanwhile the entry carried a
      // static `import ... from "./three-*.js"` for three numeric constants, and
      // nothing noticed.
      //
      // A static edge is not a download. Every modulepreload below fetches three
      // either way; what a static edge adds is EVALUATION — the whole library
      // runs on the main thread before the entry's own body does, and therefore
      // before React renders anything. Measured at t=369ms under a 4x CPU
      // throttle, inside the boot long-task cluster.
      const threeChunk = chunks.find((c) => c.name === 'three')
      if (threeChunk && entry.imports.includes(threeChunk.fileName)) {
        this.error(
          `the app entry statically imports ${threeChunk.fileName}, so all of ` +
            'three.js is evaluated during boot, before React renders. It must be ' +
            'reached through a dynamic import only — LazyScene is the seam. To find ' +
            'the edge: VERTIGO_SKIP_BUDGETS=1 npx vite build, then grep the emitted ' +
            'dist/assets/index-*.js for a static import of the three chunk and trace ' +
            'the binding back. The usual cause is a config module reaching a ' +
            'three-importing module for plain constants — galaxyBandConfig.ts is the ' +
            'fix that pattern takes.',
        )
      }

      // A guard on the guard: `isPreloadedOnIndex` excludes the header-logo
      // chunk by its source module, and an exclusion that stops matching fails
      // OPEN — `/` would quietly start preloading the blog's 3D mark and the
      // request budget would absorb it as ordinary growth. Assert the chunk is
      // there and singular instead.
      // The FPS meter must be ABSENT from a production build and PRESENT
      // everywhere else, and both halves matter. Absent is the security-adjacent
      // half: a value import used to put the whole library in the production
      // chunk. Present is the half that keeps the first honest — if the dynamic
      // import in MurciaDebugTools were ever inlined back, this assertion is
      // what notices, rather than a bundle someone remembers to grep.
      const stats = chunks.filter(isStatsChunk)
      if (IS_PRODUCTION && stats.length > 0) {
        this.error(
          `stats.js is in the production bundle (${stats.map((c) => c.fileName).join(', ')}). ` +
            'It is a development FPS meter and reaches production only through a static ' +
            'import — its UMD wrapper is side-effectful, so Rollup cannot shake it out. ' +
            'MurciaDebugTools must keep importing it dynamically, behind DEBUG_TOOLS_ENABLED.',
        )
      }
      if (!IS_PRODUCTION && stats.length !== 1) {
        this.error(
          `expected exactly one stats.js chunk outside production, found ${stats.length}. ` +
            'If the meter was removed, delete this assertion and isStatsChunk with it; if it ' +
            'was merged into another chunk, the exclusion in isPreloadedOnIndex is excluding ' +
            'nothing and / is preloading a debug meter.',
        )
      }

      const headerLogo = chunks.filter(isHeaderLogoChunk)
      if (headerLogo.length !== 1) {
        this.error(
          `expected exactly one chunk faced by ${HEADER_LOGO_MODULE}, found ${headerLogo.length}. ` +
            'If it was renamed, merged away or deleted, isPreloadedOnIndex is excluding ' +
            "nothing and / is preloading the blog header's 3D mark. Fix the path there, or " +
            'remove both if the feature is gone.',
        )
      }

      // Matched on the source module, like every other chunk here: Vite derives
      // the name from the lazy import's specifier and it is not a contract.
      const scene = chunks.find((c) =>
        c.moduleIds.some((id) => id.replace(/\\/g, '/').endsWith('src/components/SceneCanvas.tsx')),
      )
      if (!scene) {
        // A budget that disappears when its subject does is not a budget — the
        // lesson the app-entry lookup above already records.
        this.error(
          'the SceneCanvas chunk was not found. If it was renamed, fix the module path ' +
            'here; if the canvas is no longer lazily loaded, the readiness path changed ' +
            'shape and this budget needs rewriting rather than deleting.',
        )
      } else {
        const sceneSize = Buffer.byteLength(scene.code, 'utf8')
        if (sceneSize > SCENE_BUDGET_BYTES) {
          this.error(
            `the scene chunk (${scene.fileName}) is ${sceneSize}B, over the ` +
              `${SCENE_BUDGET_BYTES}B budget by ${sceneSize - SCENE_BUDGET_BYTES}B. ` +
              'Everything a visitor waits for on / is in here. Read the initial-closure ' +
              'total below first, then decide whether what was added belongs behind a ' +
              'lazy seam rather than raising the number.',
          )
        }
      }

      const entrySize = Buffer.byteLength(entry.code, 'utf8')
      if (entrySize > ENTRY_BUDGET_BYTES) {
        this.error(
          `app entry is ${entrySize}B, over the ${ENTRY_BUDGET_BYTES}B budget ` +
            `(over by ${entrySize - ENTRY_BUDGET_BYTES}B). This is a SECONDARY guard: ` +
            'three.js has its own structural assertion above, so what this catches is a ' +
            'large dependency or a generated dataset landing in the entry itself. Read ' +
            'the initial-closure total first — if that is healthy, the bytes only moved ' +
            'into the entry rather than being newly added.',
        )
      }

      // ── THE PRIMARY GATE: what a cold `/` actually downloads ──
      //
      // Not one chunk. The modulepreload loop in `introEntry` emits a link for
      // every chunk `isPreloadedOnIndex` accepts, so the browser has all of them
      // in flight before the app entry has finished evaluating — measured at 9
      // requests inside ~130ms. Add the two script tags `/` carries (the app
      // entry and the intro entry) and this is the whole initial JS closure.
      //
      // Deliberately shares `isPreloadedOnIndex` with the loop that emits the
      // links. Blog-only and debug exclusions are defined in that predicate;
      // the static-edge check below prevents an exclusion from hiding a load.
      const initial = chunks.filter((c) => isPreloadedOnIndex(c) || c === entry || c === intro)
      // Exclusions must remain real lazy seams, not hide a static dependency
      // from the budget. Check every edge in the initial closure.
      const initialFiles = new Set(initial.map((c) => c.fileName))
      for (const chunk of initial) {
        for (const dependency of chunk.imports) {
          if (chunks.some((c) => c.fileName === dependency) && !initialFiles.has(dependency)) {
            this.error(`initial chunk ${chunk.fileName} statically imports excluded ${dependency}`)
          }
        }
      }
      if (chunks.filter(isBlogRouteChunk).length !== 1) {
        this.error('expected exactly one lazy BlogRoute chunk; review the initial preload policy')
      }
      const counted = initial
        .map((c) => ({ name: c.fileName, bytes: Buffer.byteLength(c.code, 'utf8') }))
        .sort((a, b) => b.bytes - a.bytes)
      const initialBytes = counted.reduce((n, c) => n + c.bytes, 0)

      // Itemised, because the total alone does not say what to do about it. A
      // NEW name in this list is a loading decision — something became reachable
      // from `/` that was not before — and an existing name growing is app
      // growth. They do not have the same fix, and the list is what tells them
      // apart at a glance.
      const itemised = counted.map((c) => `    ${String(c.bytes).padStart(9)}  ${c.name}`).join('\n')

      if (initialBytes > INITIAL_JS_BUDGET_BYTES) {
        this.error(
          `initial JS for / is ${initialBytes}B over ${counted.length} requests, past the ` +
            `${INITIAL_JS_BUDGET_BYTES}B budget by ${initialBytes - INITIAL_JS_BUDGET_BYTES}B.\n` +
            `  counted (every non-entry chunk, plus the app and intro entries):\n${itemised}\n` +
            '  A new name here is a loading decision; an existing one growing is app growth.',
        )
      }

      if (counted.length > INITIAL_JS_REQUEST_BUDGET) {
        this.error(
          `initial JS for / is ${counted.length} requests, past the ` +
            `${INITIAL_JS_REQUEST_BUDGET} allowed (${initialBytes}B total).\n` +
            `  counted (every non-entry chunk, plus the app and intro entries):\n${itemised}\n` +
            '  A chunk joins this set the moment it exists — the modulepreload loop in ' +
            'introEntry takes every non-entry chunk. If the new one is not wanted on / at ' +
            'all, exclude it there rather than raising this number.',
        )
      }

      // The blog rides its own chunk, and its size is the library rather than
      // the code. Matched on the source module, like the intro entry above,
      // because chunk names are derived and not stable enough to hardcode.
      const blog = chunks.find((c) =>
        c.facadeModuleId?.replace(/\\/g, '/').endsWith('src/blog/BlogRoute.tsx'),
      )
      const blogSize = blog ? Buffer.byteLength(blog.code, 'utf8') : 0
      if (blog && blogSize > BLOG_BUDGET_BYTES) {
        this.error(
          `blog chunk is ${blogSize}B, over the ${BLOG_BUDGET_BYTES}B budget. This chunk ` +
            'carries every article body, so it grows with the content: check whether the ' +
            'library outgrew the payload before raising the number.',
        )
      }

      // Compressed is what the user actually waits for, so report that alongside
      // the raw figures the budgets assert on. Raw is what is asserted because it
      // moves only when the payload does; a brotli number also moves when the
      // compressor's view of the text changes, which is noise in a gate.
      const gz = (code: string) => gzipSync(Buffer.from(code, 'utf8')).length
      const initialBr = initial.reduce(
        (n, c) => n + brotliCompressSync(Buffer.from(c.code, 'utf8')).length,
        0,
      )
      this.info(
        `chunk budgets ok — initial JS for / ${initialBytes}B (${initialBr}B br) over ` +
          `${counted.length} requests, budget ${INITIAL_JS_BUDGET_BYTES}B/` +
          `${INITIAL_JS_REQUEST_BUDGET}; intro ${introSize}B (${gz(intro.code)}B gz), ` +
          `app entry ${entrySize}B (${gz(entry.code)}B gz)` +
          `${blog ? `, blog ${blogSize}B (${gz(blog.code)}B gz)` : ''}`,
      )
    },
  }
}

/**
 * Serves `/blog` and `/blog/<slug>` from `blog.html` in dev and preview, the way
 * `vercel.json` does in production.
 *
 * Without this the two disagree about the one thing the blog depends on: the
 * PATHNAME. `parseRoute` reads `/blog` and `/blog/<slug>`; a dev server handing
 * back `/blog.html` parses as the site route and the blog renders nothing. That
 * failure is silent — a blank page, no console error — and it would also mean
 * every e2e assertion ran against a URL production never serves.
 *
 * Deliberately a REWRITE and not a redirect, again matching Vercel: the address
 * bar must keep saying `/blog/<slug>`, because that is what the application
 * routes on and what a reader copies.
 *
 * ── And it defers to a real file, which is the half that is easy to miss ──
 *
 * Vercel resolves a request against the filesystem BEFORE applying a rewrite, so
 * a prerendered `dist/blog/<slug>/index.html` wins and the rewrite fires only for
 * slugs that have no shell. Middleware runs BEFORE static serving, so a rewrite
 * that did not check would shadow every shell in `vite preview` — the shells
 * would be dead files locally, e2e would assert against the unfilled document,
 * and the difference would only appear in production.
 *
 * In dev there is no `dist/`, so nothing is found and everything rewrites, which
 * is correct: there are no shells to defer to.
 */
function blogRouting(): Plugin {
  interface RequestLike {
    url?: string
  }
  interface ServerLike {
    middlewares: {
      use: (fn: (req: RequestLike, res: unknown, next: () => void) => void) => void
    }
  }
  const middleware =
    (deferToFiles: boolean) =>
    (server: ServerLike): void => {
      server.middlewares.use((req, _res, next) => {
        const target = blogRewrite(req.url, (fileName) =>
          deferToFiles && fs.existsSync(path.join('dist', fileName)),
        )
        if (target !== null) req.url = target
        next()
      })
    }
  return {
    name: 'vertigo-blog-routing',
    // Dev has no dist/ and therefore no shells; preview must defer to them.
    configureServer: middleware(false),
    configurePreviewServer: middleware(true),
  }
}

/**
 * Serves `POST /api/audit` and `POST /api/contact` in dev and preview, the way
 * Vercel serves `api/*.ts` in production.
 *
 * ── Why this has to exist ──
 *
 * `playwright.config.ts` runs `npm run preview` — `vite preview`, not
 * `vercel dev`. Without this middleware the e2e suite could only ever stub the
 * endpoint with `page.route`, which proves the client can parse a fixture and
 * proves nothing about the handler. With it, the same `server/endpoint.ts` that
 * answers in production answers the suite, and `npm run dev` exercises the real
 * validation instead of a mock.
 *
 * ── Why it does no path parsing whatsoever ──
 *
 * Unlike blogRouting's validated shell candidates, API routes need no slug
 * parsing: two literal strings, compared with `===`, after the query is
 * dropped. No request path ever touches the filesystem here.
 *
 * The handler is imported DYNAMICALLY, so loading this config never depends on
 * `src/content/generated/` existing — and a failure inside it surfaces as a
 * request that failed rather than as a dev server that would not start.
 */
function apiRouting(): Plugin {
  const ROUTES: Record<string, 'audit' | 'contact'> = {
    '/api/audit': 'audit',
    '/api/contact': 'contact',
  }
  /** Mirrors BODY_LIMIT_BYTES in server/endpoint.ts. */
  const BODY_LIMIT = 16 * 1024

  interface RequestLike {
    url?: string
    method?: string
    headers: Record<string, string | string[] | undefined>
    on: (event: string, listener: (chunk: Buffer) => void) => void
    destroy: () => void
  }
  interface ResponseLike {
    statusCode: number
    setHeader: (name: string, value: string) => void
    end: (body?: string) => void
  }
  interface ServerLike {
    middlewares: {
      use: (fn: (req: RequestLike, res: ResponseLike, next: () => void) => void) => void
    }
  }

  /** Collects the body, refusing past the cap rather than buffering it all. */
  function readBody(req: RequestLike): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > BODY_LIMIT) {
          req.destroy()
          resolve(null)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(null))
    })
  }

  const middleware = (server: ServerLike): void => {
    server.middlewares.use((req, res, next) => {
      const [pathname] = (req.url ?? '').split('?')
      const kind = ROUTES[pathname]
      if (kind === undefined) {
        next()
        return
      }

      void (async () => {
        const body = req.method === 'POST' ? await readBody(req) : null
        if (req.method === 'POST' && body === null) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, code: 'malformed' }))
          return
        }

        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value)
          else if (Array.isArray(value)) headers.set(name, value.join(', '))
        }

        const { respond } = await import('./server/endpoint')
        const response = await respond(
          kind,
          new Request('http://localhost' + (req.url ?? '/'), {
            method: req.method ?? 'GET',
            headers,
            ...(body === null ? {} : { body }),
          }),
          process.env,
        )

        res.statusCode = response.status
        response.headers.forEach((value, name) => res.setHeader(name, value))
        res.end(await response.text())
      })()
    })
  }

  return {
    name: 'vertigo-api-routing',
    configureServer: middleware,
    configurePreviewServer: middleware,
  }
}

const INTRO_ENTRY = 'src/intro-draw/boot.ts'

// The boot script cannot simply sit in index.html: Vite concatenates every
// module script in a document into ONE entry chunk, which would bundle the
// drawing together with the app and defeat the whole point. So it is a separate
// Rollup input, and its tag is injected — head-prepend, because module scripts
// execute in document order and this one must define window.__vertigoIntro
// before the app chunk runs.
function introEntry(): Plugin {
  return {
    name: 'vertigo-intro-entry',
    config: () => ({
      build: {
        rollupOptions: {
          // Three inputs, and the third is the whole of adr/013: /blog is its
          // own document, so a cold reader never receives the intro script, the
          // scene modulepreloads or 2.43 MB of Earth textures. Making that an
          // absence rather than a set of guards is the point.
          input: { index: 'index.html', blog: 'blog.html', intro: INTRO_ENTRY },
        },
      },
    }),
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        // blog.html gets NONE of this: no intro script, and no modulepreload for
        // three, the scene or Murcia. It is a 2D document and the reader is
        // here to read. The build asserts the result — see assertChunkBudgets.
        if (isBlogDocument(ctx.path)) return []

        // LINKED, not inlined — and that was measured rather than assumed.
        //
        // Inlining the chunk into the document is the obvious next move here:
        // the standalone assertion above means it has no imports to resolve, so
        // it would cost one fewer request for the one asset whose entire job is
        // to be first. It was built and A/B'd, 5 runs a side, median time to the
        // first drawn frame, 4x CPU throttle:
        //
        //     wifi   30Mbps  40ms RTT    linked  362ms   inlined  355ms
        //     4G      9Mbps 170ms RTT    linked  630ms   inlined  633ms
        //     Fast3G 1.6Mbps 150ms RTT   linked  714ms   inlined  731ms
        //     Slow3G  400kbps 400ms RTT  linked 1789ms   inlined 1841ms
        //
        // It loses, and it loses hardest on the connections it was meant to
        // help. The reasoning it was based on — "6KB took 313ms to arrive, so
        // the request is the bottleneck" — misreads the waterfall: the preload
        // scanner finds this tag while the document is still parsing and fetches
        // it in parallel at High priority, so it lands at about the moment the
        // HTML finishes anyway. What IS on the critical path is the document,
        // and inlining adds ~6KB gzipped to it.
        //
        // Dev has no bundle and serves from source; build looks up the hash.
        let src = `/${INTRO_ENTRY}`
        if (ctx.bundle) {
          const chunk = Object.values(ctx.bundle).find(
            (c): c is OutputChunk =>
              c.type === 'chunk' &&
              c.isEntry &&
              !!c.facadeModuleId?.replace(/\\/g, '/').endsWith(INTRO_ENTRY),
          )
          if (!chunk) throw new Error(`[vertigo] ${INTRO_ENTRY} produced no entry chunk`)
          src = `/${chunk.fileName}`
        }

        const tags: HtmlTagDescriptor[] = [
          { tag: 'script', attrs: { type: 'module', src }, injectTo: 'head-prepend' },
        ]

        // modulepreload the scene chunks (plan 007 Phase 8 item 4).
        //
        // This is the ONLY tool that separates the two concerns properly:
        // it fetches and compiles without evaluating. Starting the dynamic
        // import earlier would not do it — `import()` evaluates as soon as the
        // graph resolves, so awaiting its promise later defers your USE of the
        // module, not the 800 KB of three.js executing on the main thread.
        //
        // So: the network request happens here, at first parse, in parallel
        // with the app chunk; evaluation still happens when LazyScene calls
        // import(), two frames after the drawing has painted.
        if (ctx.bundle) {
          for (const chunk of Object.values(ctx.bundle)) {
            if (chunk.type !== 'chunk' || !isPreloadedOnIndex(chunk)) continue
            // Not all of these are wanted equally soon. modulepreload is High
            // priority by default, so the chunks for a world the visitor cannot
            // reach until they click a marker were competing for bandwidth with
            // the ones the first frame after the intro actually needs. Nothing
            // here is needed DURING P0 at all — the point of the split is to
            // fetch without evaluating — but the queue still has an order.
            // BlogRoute is excluded entirely: the city prefetches it on approach.
            const deferred = /MurciaExperience|disposal/.test(chunk.fileName)
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                crossorigin: true,
                href: `/${chunk.fileName}`,
                ...(deferred ? { fetchpriority: 'low' } : {}),
              },
              injectTo: 'head',
            })
          }
        }
        return tags
      },
    },
  }
}

// Where this build is going, decided here and nowhere else.
//
// VERCEL_ENV is 'production' | 'preview' | 'development' and is available at
// BUILD time (Vercel: System environment variables). Vite projects get the
// VITE_-prefixed copy, so both are read — the unprefixed one is what a `vercel
// build` locally provides, the prefixed one is what the docs promise for Vite.
// Anything else, including a plain `npm run build` on a laptop, is development.
//
// Except on Vercel itself, where guessing is refused: VERCEL=1 is always set,
// and a missing VERCEL_ENV means system environment variables are not exposed —
// a production deployment would ship the debug console and a Disallow robots.
if (process.env.VERCEL && !process.env.VERCEL_ENV) {
  throw new Error(
    '[vertigo] VERCEL is set but VERCEL_ENV is not — enable "Automatically expose System ' +
      'Environment Variables" in the Vercel project settings.',
  )
}

// And an unrecognised value is refused as well, because the comparison below is
// `=== 'production'` and anything else — `Production`, `prod` — reads as "not
// production" and ships the debug console with a Disallow robots.txt out of a
// deployment that believed it was live. There are exactly three values (the same
// list content/lib/config.ts and server/config.ts enforce); a fourth is a
// mistake. Surrounding whitespace is trimmed rather than refused, so a value
// pasted out of a dashboard with a trailing space still reads as production.
const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development']
const [ENV_SOURCE, ENV_VALUE] = (process.env.VERCEL_ENV ?? '').trim()
  ? (['VERCEL_ENV', (process.env.VERCEL_ENV ?? '').trim()] as const)
  : (process.env.VITE_VERCEL_ENV ?? '').trim()
    ? (['VITE_VERCEL_ENV', (process.env.VITE_VERCEL_ENV ?? '').trim()] as const)
    : (['default', 'development'] as const)
if (!VERCEL_ENVIRONMENTS.includes(ENV_VALUE)) {
  throw new Error(
    `[vertigo] ${ENV_SOURCE}="${ENV_VALUE}" is not one of ${VERCEL_ENVIRONMENTS.join(', ')}. ` +
      'Refusing to build: an unrecognised value silently means "not production".',
  )
}
const BUILD_ENV = ENV_VALUE
const IS_PRODUCTION = BUILD_ENV === 'production'

// The canonical origin. VERCEL_PROJECT_PRODUCTION_URL is set on every
// deployment INCLUDING previews and always names the production domain, which
// is exactly what a canonical link and og:url need — a preview must point at
// production, never at itself, or it competes with the real page in the index.
// It follows a custom domain automatically once one is attached, so this needs
// no edit at that point.
const PRODUCTION_ORIGIN = `https://${
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'vertigo-marketing-web.vercel.app'
}`

/**
 * Search-engine surface: robots.txt, sitemap.xml, canonical, og:url, and a
 * noindex on anything that is not production.
 *
 * robots.txt has to be GENERATED rather than committed to public/, because it
 * must differ between production and preview and a static file cannot. Preview
 * deployments are shared as links and would otherwise be crawled, indexed, and
 * left competing with the real site — which is slow and awkward to undo.
 *
 * The meta noindex is deliberate duplication: robots.txt is a crawl directive,
 * not an index directive, and a preview URL that gets linked from anywhere can
 * be indexed without ever being crawled. The meta tag is what actually says no.
 */
function seoAssets(): Plugin {
  return {
    name: 'vertigo-seo-assets',
    apply: 'build',
    generateBundle() {
      for (const file of seoFiles(BLOG_POSTS, { origin: PRODUCTION_ORIGIN, production: IS_PRODUCTION })) {
        this.emitFile({ type: 'asset', ...file })
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        // Each document declares its own canonical. blog.html's is /blog, and
        // the per-post shells rewrite it to /blog/<slug> in blogRoutes below —
        // which is why the exact string emitted here is also an anchor there.
        const self = documentCanonical(ctx.path, PRODUCTION_ORIGIN)
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'canonical', href: self }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: self }, injectTo: 'head' },
        ]
        if (!IS_PRODUCTION) {
          tags.push({
            tag: 'meta',
            attrs: { name: 'robots', content: 'noindex, nofollow' },
            injectTo: 'head',
          })
        }
        return tags
      },
    },
  }
}

/**
 * Emits one static document per blog post, so a crawler and a social scraper get
 * a correct `<head>` without running any JavaScript.
 *
 * ── The emitted tree mirrors the public URLs ──
 *
 *   dist/blog.html                     the SPA document; the rewrite fallback
 *   dist/blog/index.html               /blog
 *   dist/blog/<slug>/index.html        /blog/<slug>
 *
 * Vercel resolves a request against the filesystem BEFORE applying a rewrite, so
 * a known slug is served its own prerendered head and the `/blog/:slug` rewrite
 * never fires for it. The rewrite survives only for slugs that do not exist,
 * which is exactly the case that should reach the SPA and render "Entrada no
 * encontrada" at HTTP 200.
 *
 * An earlier revision of this emitted `dist/blog/<slug>.html` while the rewrite
 * pointed at `blog.html`; the two designs never met, so every shell was a dead
 * file and every article silently fell through to the unfilled document. Hence
 * the assertion below that every post has a directory and nothing else does.
 *
 * ── closeBundle, not generateBundle ──
 *
 * Vite's own HTML transform runs inside its `generateBundle`, and racing it is
 * the single thing here most likely to work on one machine and fail on Vercel.
 * `closeBundle` runs after everything is on disk. Boring and predictable.
 */
function blogRoutes(): Plugin {
  return {
    name: 'vertigo-blog-routes',
    apply: 'build',
    closeBundle() {
      const outDir = 'dist'
      const shellPath = path.join(outDir, 'blog.html')
      if (!fs.existsSync(shellPath)) {
        // An ABORTED build looks exactly like a missing input from here, and
        // this hook runs either way — Vite closes the bundle in a finally. When
        // a budget assertion upstream stopped the build, nothing was written at
        // all, and erroring here replaced that plugin's message with a question
        // about Rollup inputs. The real failure was invisible in the log.
        //
        // index.html is the tell: it comes from the same write, so if it is
        // missing too the build produced nothing and something upstream has
        // already reported why.
        if (!fs.existsSync(path.join(outDir, 'index.html'))) return
        this.error('[blog shells] dist/blog.html was not emitted — is blog.html still a Rollup input?')
        return
      }
      const shell = fs.readFileSync(shellPath, 'utf8')

      try {
        const documents = blogDocuments(shell, BLOG_POSTS, PRODUCTION_ORIGIN)
        for (const document of documents) {
          const target = path.join(outDir, document.fileName)
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, document.source)
        }
        const actual = fs.readdirSync(path.join(outDir, 'blog'), { withFileTypes: true })
          .filter((entry) => entry.isDirectory()).map((entry) => entry.name)
        const problems = blogTreeProblems(BLOG_POSTS, actual)
        if (problems.length) throw new Error('[blog shells] ' + problems.join('; '))
      } catch (error) {
        this.error(String(error instanceof Error ? error.message : error))
        return
      }

      this.info(`blog shells ok — ${BLOG_POSTS.length} post(s) + /blog`)
    },
  }
}

/**
 * The function form, for ONE value: `command`.
 *
 * `__VERTIGO_BUILT__` has to answer 'are built assets being served?', and none of
 * the environment variables above can. `BUILD_ENV` defaults to 'development'
 * locally for `vite build` exactly as it does for `vite dev`, so it says nothing
 * about which of the two produced what the browser is talking to — and the blog
 * display's page image depends on that difference: `dist/generated/` exists only
 * in a build, and asking for it under the dev server is a guaranteed 404 the
 * browser logs as an error nothing on our side can suppress.
 *
 * `command` is the one input that knows. Everything below is unchanged.
 */
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    glsl(),
    // Before blogRouting, which rewrites `req.url`: the API paths must be
    // matched against what the client actually asked for.
    apiRouting(),
    blogRouting(),
    introEntry(),
    seoAssets(),
    assertNoSecrets(),
    assertChunkBudgets(),
    // Last, and it reads from disk in closeBundle: everything above must have
    // finished writing before a shell can be cloned from the result.
    blogRoutes(),
  ],
  define: {
    // Compile-time literal, so `DEBUG_TOOLS_ENABLED` folds to a constant and
    // the whole /debug panel becomes unreachable code the minifier removes.
    __VERTIGO_ENV__: JSON.stringify(BUILD_ENV),
    // True whenever the browser is talking to a BUILT `dist/` — a production
    // deploy, a Vercel preview, or a local `vite preview` — and false only under
    // the dev server. See the docblock on the export below, and `buildFlags.ts`
    // for why this is a define rather than `import.meta.env`.
    __VERTIGO_BUILT__: JSON.stringify(command === 'build'),
  },
  build: {
    rollupOptions: {
      output: {
        // three.js is pinned to its own chunk deliberately.
        //
        // It used to land in one anyway, as an accident: the corner logo's
        // dynamic import was rooted at the app entry while the scene's was
        // rooted at LazyScene, so three had two dynamic-import consumers and
        // Rollup hoisted it into a shared chunk (emitted as `KTX2Loader-*`,
        // named after its seed module). Moving the corner logo inside the
        // Canvas (ADR 002) left three with a single consumer, and Rollup
        // promptly inlined all 800KB of it into the SceneCanvas chunk.
        //
        // That is worth preventing on its own merits rather than by accident:
        // three is the one dependency that essentially never changes between
        // deploys, so keeping it separately hashed is what lets a returning
        // visitor skip re-downloading it after an app-code change. Both
        // chunks are modulepreloaded together, so the split costs nothing on
        // a cold load.
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (/\/node_modules\/three\//.test(path)) return 'three'
          // NOT `src/corner-logo/`, and the failed attempt is worth recording.
          // Naming that directory as a manual chunk made Rollup place the
          // modules it shares with its neighbours there too — `utils/easing`
          // among them, which the app entry uses. The entry therefore gained a
          // static import of a chunk that imports three, and the assertion above
          // fired. A manual chunk is not a fence; it is a magnet.
        },
      },
    },
  },
}))
