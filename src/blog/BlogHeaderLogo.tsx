import { useEffect, useRef, useState } from 'react'
// The specifier MUST stay byte-identical to the `import()` below.
// `checks/architecture.ts` scans dynamic specifiers first and skips a static
// match only when the string already appeared as a dynamic one — so a type
// import written any other way is recorded as a STATIC edge from the blog to
// three.js, and the cold-blog rules fail.
import type { DetachHeaderLogo } from './headerLogoRuntime'

/**
 * The blog header's brand cell: the SVG mark, upgraded in place to the 3D one.
 *
 * ── The SVG is the product, the 3D is the upgrade ──
 *
 * `VertigoMark` renders on the first paint and never unmounts. The canvas fades
 * in over it only once the GLB has arrived, been textured and been compiled, and
 * every failure path — no WebGL2, a 404 on the model, a lost context, a chunk
 * that will not load after a redeploy — is simply "you keep seeing the SVG",
 * which is what this header shipped before 2026-09-04. Nothing about the blog
 * depends on the 3D mark existing.
 *
 * ── Deferred on purpose ──
 *
 * The whole reason `/blog` is a second document (adr/013) is that a reader
 * should not pay for the 3D application. A logo is not an article, so the module
 * is fetched on idle after `load`, never with the page — the reader's bytes go
 * to the text first. `e2e/blog.spec.ts` asserts that ordering against the
 * article's own requests rather than trusting this comment.
 *
 * ── One component, both hosts ──
 *
 * Cold `blog.html` and the warm in-app blog render the same `TopBar`, so they
 * get the same mark by construction rather than by a flag. In a warm session
 * that means a second WebGL context alongside the scene's suspended one, and it
 * lives as long as the document does — see `headerLogoRuntime`'s `instance` for
 * why re-parenting beats rebuilding.
 */

/**
 * The isotype's two paths, inlined the way every other glyph in this codebase is
 * (DECISIONS §26.17): nothing to fetch and nothing that can 404 in a header.
 * The same data is the favicon in `blog.html`.
 */
const MarkPaths = () => (
  <>
    <path
      fill="currentColor"
      d="M33.7 13.6 7.7 39.4l4.7 3.4c92.3 67.2 193 82.8 292.7 45.5 30.2-11.3 63.8-30.1 85-47.4L354.1.2l-3.4 2.3c-37.9 26-78.1 42.2-118.4 47.7-19.1 2.6-39.4 2.9-58.5.7-26.4-3-52.3-10.2-77.5-21.7C79.3 21.5 62.2 11.4 49.9 1.8L47.5 0Z"
    />
    <path
      fill="currentColor"
      d="M34.5 99.7 168.6 399.5h62.5L365 99.7l-6 2.9c-20.4 10.2-45.7 20.3-65.4 26l-2.5.9-45.5 101.1-45.4 101.2-45.6-101.1L109.1 129.3l-1.7-.3c-13.6-2.4-43.2-14.2-69.4-27.7Z"
    />
  </>
)

/**
 * Runs `fn` after the document has finished loading AND the browser is idle.
 *
 * BOTH halves, and the `load` half was learned rather than designed. Idle alone
 * fires whenever the main thread next has a gap, and on a prerendered blog shell
 * that gap arrives while the article's images are still in flight — so the mark
 * was competing with the text it is supposed to defer to. `load` is the only
 * signal that says the page a reader came for has actually arrived.
 *
 * `requestIdleCallback` is unimplemented in Safari before 17, and the fallback
 * has to be a timeout rather than nothing: that branch is where the mark comes
 * from on every iPhone that has not updated.
 */
function afterLoad(fn: () => void): () => void {
  let cancelIdle: (() => void) | null = null

  const idle = () => {
    const ric = window.requestIdleCallback
    if (typeof ric === 'function') {
      const handle = ric(fn, { timeout: 2000 })
      cancelIdle = () => window.cancelIdleCallback?.(handle)
      return
    }
    const handle = window.setTimeout(fn, 300)
    cancelIdle = () => window.clearTimeout(handle)
  }

  if (document.readyState === 'complete') {
    idle()
    return () => cancelIdle?.()
  }

  window.addEventListener('load', idle, { once: true })
  return () => {
    window.removeEventListener('load', idle)
    cancelIdle?.()
  }
}

interface Props {
  /** Present on an article, where the mark goes back to the index. Absent on
   *  the index itself, where it would link to the page you are already on. */
  onHome?: () => void
}

export function BlogHeaderLogo({ onHome }: Props) {
  const stageRef = useRef<HTMLSpanElement>(null)
  const markRef = useRef<SVGSVGElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let detach: DetachHeaderLogo | null = null

    const cancelDeferred = afterLoad(() => {
      const container = stageRef.current
      const sizeFrom = markRef.current
      if (cancelled || !container || !sizeFrom) return

      // The dynamic import is what keeps three.js, the decoders and the two
      // asset files out of the cold blog's initial graph — and what keeps
      // `checks/architecture.ts`'s static bans on `src/graphics/` true. It can
      // also reject (a chunk 404 after a redeploy is the realistic case), and a
      // rejection here must leave the SVG standing rather than surface as an
      // unhandled error on a reading page.
      import('./headerLogoRuntime')
        .then(({ attachHeaderLogo }) => {
          if (cancelled) return
          detach = attachHeaderLogo(container, {
            sizeFrom,
            onReady: () => {
              if (!cancelled) setReady(true)
            },
            onFailed: () => {
              if (!cancelled) setReady(false)
            },
          })
        })
        .catch((error) => {
          console.warn('[blog-logo] module failed to load', error)
        })
    })

    return () => {
      cancelled = true
      cancelDeferred()
      // Detach, not dispose: the renderer outlives this component on purpose, so
      // that opening an article does not rebuild a GL context. See
      // headerLogoRuntime's `instance`.
      detach?.()
      detach = null
    }
  }, [])

  // `data-gl` drives the crossfade, and it is on the STAGE rather than the
  // canvas so the SVG can fade out under a canvas the runtime owns and React
  // never renders.
  const stage = (
    <span className="blog-topbar__stage" ref={stageRef} data-gl={ready ? 'ready' : undefined}>
      <svg
        ref={markRef}
        className="blog-topbar__glyph"
        viewBox="0 0 400 400"
        width="26"
        height="26"
        aria-hidden="true"
      >
        <MarkPaths />
      </svg>
    </span>
  )

  return onHome === undefined ? (
    <span className="blog-topbar__mark" aria-hidden="true">
      {stage}
    </span>
  ) : (
    // Named for what it does rather than for the brand it draws: "Vertigo" tells
    // a screen-reader user what the picture is, not where the button goes, and
    // where it goes is the only thing they cannot see.
    <button
      type="button"
      className="blog-topbar__mark blog-topbar__home"
      aria-label="Inicio del blog"
      onClick={onHome}
    >
      {stage}
    </button>
  )
}
