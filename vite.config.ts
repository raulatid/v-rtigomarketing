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
import { postHead, replaceRegion, shellProblems } from './scripts/blogShell'

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
const INITIAL_JS_BUDGET_BYTES = 1_600_000
const INITIAL_JS_REQUEST_BUDGET = 10

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

/** Which document a transformIndexHtml call is for. */
function isBlogDocument(path: string): boolean {
  return path.replace(/^\//, '') === 'blog.html'
}

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
function isPreloadedOnIndex(chunk: OutputChunk): boolean {
  return !chunk.isEntry
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
      // links, so the set measured here cannot drift from the set the HTML asks
      // for. The blog document's own entry is the only chunk left out, which is
      // adr/013 working: `/blog` pays for none of this.
      const initial = chunks.filter((c) => isPreloadedOnIndex(c) || c === entry || c === intro)
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
  const DIST = 'dist'
  const shellFor = (clean: string): string | null => {
    const slug = /^\/blog\/([^/]+)$/.exec(clean)?.[1]
    if (slug === undefined) return clean === '/blog' ? `${DIST}/blog/index.html` : null
    return `${DIST}/blog/${slug}/index.html`
  }

  const rewrite = (url: string | undefined, deferToFiles: boolean): string | null => {
    if (url === undefined) return null
    const [pathname] = url.split('?')
    const clean = pathname.replace(/\/+$/, '')
    if (clean !== '/blog' && !/^\/blog\/[^/]+$/.test(clean)) return null
    // Let the static layer serve a prerendered shell when one exists, exactly as
    // Vercel would. Only an unknown slug falls through to the SPA document.
    if (deferToFiles) {
      const shell = shellFor(clean)
      // Pointed at explicitly rather than by returning null. Vercel resolves an
      // extensionless path to a directory index; the static layer under
      // `vite preview` (sirv) does not, so leaving it alone would 404 into the
      // SPA fallback and every shell would look dead locally.
      if (shell !== null && fs.existsSync(shell)) return shell.slice(DIST.length)
    }
    return '/blog.html'
  }
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
        const target = rewrite(req.url, deferToFiles)
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
            // The blog is a route nobody has asked for yet. Preloading it at
            // High priority would put it in front of the chunks the first frame
            // after the intro actually needs, so it rides at low priority with
            // the world the visitor cannot reach until they tap a building.
            const deferred = /MurciaExperience|disposal|BlogRoute/.test(chunk.fileName)
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
const BUILD_ENV = process.env.VERCEL_ENV ?? process.env.VITE_VERCEL_ENV ?? 'development'
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
      const robots = IS_PRODUCTION
        ? [
            'User-agent: *',
            'Allow: /',
            '',
            // The tuning console is inert in production, but there is still no
            // reason to spend crawl budget on a route that renders the same app.
            'Disallow: /debug',
            '',
            `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`,
            '',
          ].join('\n')
        : ['User-agent: *', 'Disallow: /', ''].join('\n')

      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })

      // There is more than one URL now (adr/013): the site, the blog index, and
      // one per post. The comment this replaced said "there genuinely is one
      // URL", which was true and is not any more.
      //
      // `lastmod` is the publication date rather than a build timestamp. A
      // sitemap that claims every page changed on every deploy trains a crawler
      // to ignore the field.
      if (IS_PRODUCTION) {
        const urls = [
          `  <url><loc>${PRODUCTION_ORIGIN}/</loc></url>`,
          `  <url><loc>${PRODUCTION_ORIGIN}/blog</loc></url>`,
          ...BLOG_POSTS.map(
            (post) =>
              `  <url><loc>${PRODUCTION_ORIGIN}/blog/${post.id}</loc>` +
              `<lastmod>${post.publishedAt.slice(0, 10)}</lastmod></url>`,
          ),
        ]
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            urls.join('\n') +
            '\n</urlset>\n',
        })
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        // Each document declares its own canonical. blog.html's is /blog, and
        // the per-post shells rewrite it to /blog/<slug> in blogRoutes below —
        // which is why the exact string emitted here is also an anchor there.
        const self = isBlogDocument(ctx.path)
          ? `${PRODUCTION_ORIGIN}/blog`
          : `${PRODUCTION_ORIGIN}/`
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

      const indexCanonical = `<link rel="canonical" href="${PRODUCTION_ORIGIN}/blog">`
      const indexOgUrl = `<meta property="og:url" content="${PRODUCTION_ORIGIN}/blog">`

      // /blog itself, as a real directory index alongside the fallback document.
      fs.mkdirSync(path.join(outDir, 'blog'), { recursive: true })
      fs.writeFileSync(path.join(outDir, 'blog', 'index.html'), shell)

      for (const post of BLOG_POSTS) {
        const url = `${PRODUCTION_ORIGIN}/blog/${post.id}`
        let html: string
        try {
          html = replaceRegion(shell, postHead(post, { origin: PRODUCTION_ORIGIN }), post.id)
          html = replaceExactlyOnceOrThrow(html, indexCanonical, `<link rel="canonical" href="${url}">`, `${post.id} canonical`)
          html = replaceExactlyOnceOrThrow(html, indexOgUrl, `<meta property="og:url" content="${url}">`, `${post.id} og:url`)
        } catch (error) {
          this.error(String(error instanceof Error ? error.message : error))
          return
        }

        const problems = shellProblems(html, post, { origin: PRODUCTION_ORIGIN })
        if (problems.length > 0) {
          this.error(`[blog shells] ${post.id} failed verification:\n  - ${problems.join('\n  - ')}`)
          return
        }

        const dir = path.join(outDir, 'blog', post.id)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), html)
      }

      // One directory per post and nothing else, in both directions. A stale
      // directory from a deleted post would keep serving a page the site no
      // longer links to, and a missing one is the dead-file bug above.
      const expected = new Set(BLOG_POSTS.map((post) => post.id))
      const actual = fs
        .readdirSync(path.join(outDir, 'blog'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
      const orphans = actual.filter((name) => !expected.has(name))
      const missing = [...expected].filter((id) => !actual.includes(id))
      if (orphans.length > 0 || missing.length > 0) {
        this.error(
          `[blog shells] emitted tree does not match the posts — ` +
            `orphans: [${orphans.join(', ')}], missing: [${missing.join(', ')}]`,
        )
        return
      }

      this.info(`blog shells ok — ${BLOG_POSTS.length} post(s) + /blog`)
    },
  }
}

/** Local mirror of the helper in scripts/blogShell.ts, throwing for the plugin. */
function replaceExactlyOnceOrThrow(
  haystack: string,
  needle: string,
  replacement: string,
  what: string,
): string {
  const count = haystack.split(needle).length - 1
  if (count !== 1) {
    throw new Error(
      `[blog shells] ${what}: expected exactly one match, found ${count}. ` +
        `Needle: ${JSON.stringify(needle)}`,
    )
  }
  return haystack.replace(needle, replacement)
}

export default defineConfig({
  plugins: [
    react(),
    glsl(),
    blogRouting(),
    introEntry(),
    seoAssets(),
    assertChunkBudgets(),
    // Last, and it reads from disk in closeBundle: everything above must have
    // finished writing before a shell can be cloned from the result.
    blogRoutes(),
  ],
  define: {
    // Compile-time literal, so `DEBUG_TOOLS_ENABLED` folds to a constant and
    // the whole /debug panel becomes unreachable code the minifier removes.
    __VERTIGO_ENV__: JSON.stringify(BUILD_ENV),
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
        },
      },
    },
  },
})
