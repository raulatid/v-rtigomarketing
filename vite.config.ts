import { defineConfig, HtmlTagDescriptor, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import type { OutputChunk } from 'rollup'
import { gzipSync } from 'node:zlib'

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
// three.js + R3F + the scene must never land in the app's entry chunk either.
//
// Measured, not guessed. History, so the next raise is an informed one:
//   307KB  the app shell, before the Sanity content pipeline
//   322KB  + generated content, the holo panels, the scrub, the pinch (2026-08-26)
// Raised to 332KB when the assertion fired at 322853B, which is exactly its job.
//
// BEFORE RAISING IT AGAIN, check what this guard is actually for. It exists to
// catch three.js coming back into the entry, and three is 820KB — a leak reads
// as a quarter-million-byte jump, not a two-thousand-byte one. A small overage
// is ordinary application growth, and the honest response is to confirm the
// leak has not happened and then decide whether the growth was worth it. On
// 2026-08-26 that check was: three is still its own chunk and the entry only
// imports it; no Murcia config crossed the app/experiences boundary; the
// generated content modules are 22KB total and are not what grew.
//
// Gzipped is what the user waits for, and the build prints both.
const ENTRY_BUDGET_BYTES = 332_000

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
      const entrySize = entry ? Buffer.byteLength(entry.code, 'utf8') : 0
      if (entry && entrySize > ENTRY_BUDGET_BYTES) {
        // The message used to assert the cause rather than name the suspect,
        // and sent a reader hunting a three.js leak that had not happened.
        const threeChunk = chunks.find((c) => c.name === 'three')
        const threeSplit = Boolean(threeChunk) && !entry.code.includes('BufferGeometry')
        this.error(
          `app entry is ${entrySize}B, over the ${ENTRY_BUDGET_BYTES}B budget ` +
            `(over by ${entrySize - ENTRY_BUDGET_BYTES}B). three.js is ${
              threeSplit ? 'still a separate chunk, so this is app growth rather than a leak'
                         : 'NOT SPLIT OUT — it has leaked into the entry via a value import'
            }.`,
        )
      }

      // Gzip is what the user actually waits for, so report that alongside.
      const gz = (code: string) => gzipSync(Buffer.from(code, 'utf8')).length
      this.info(
        `chunk budgets ok — intro ${introSize}B (${gz(intro.code)}B gz), ` +
          `app entry ${entrySize}B${entry ? ` (${gz(entry.code)}B gz)` : ''}`,
      )
    },
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
      build: { rollupOptions: { input: { index: 'index.html', intro: INTRO_ENTRY } } },
    }),
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
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
            if (chunk.type !== 'chunk' || chunk.isEntry) continue
            // Not all of these are wanted equally soon. modulepreload is High
            // priority by default, so the chunks for a world the visitor cannot
            // reach until they click a marker were competing for bandwidth with
            // the ones the first frame after the intro actually needs. Nothing
            // here is needed DURING P0 at all — the point of the split is to
            // fetch without evaluating — but the queue still has an order.
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

      // One URL, because there genuinely is one URL: no router, no routes. A
      // sitemap listing a single page is still worth emitting — it is how the
      // canonical origin gets stated to a crawler that arrived some other way.
      if (IS_PRODUCTION) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `  <url><loc>${PRODUCTION_ORIGIN}/</loc></url>\n` +
            '</urlset>\n',
        })
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'canonical', href: `${PRODUCTION_ORIGIN}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${PRODUCTION_ORIGIN}/` }, injectTo: 'head' },
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

export default defineConfig({
  plugins: [react(), glsl(), introEntry(), seoAssets(), assertChunkBudgets()],
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
