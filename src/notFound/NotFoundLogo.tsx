import { useEffect, useRef, useState } from 'react'
// The specifier MUST stay byte-identical to the `import()` below, for the
// reason BlogHeaderLogo.tsx gives: checks/architecture.ts pairs a type import
// with a dynamic one only when the strings match, and an unpaired type import
// is a static edge from this entry to three.js.
import type { DetachHeaderLogo } from '../blog/headerLogoRuntime'
import { MarkPaths } from '../blog/BlogHeaderLogo'

/**
 * The 404 page's hero: the site's isotype, large and turning.
 *
 * ── The same mark as the blog header, at a different size ──
 *
 * `headerLogoRuntime` sizes the model from whatever element it is told to
 * measure and centres it in whatever canvas box it is given, so nothing about
 * it is 44px except the blog's CSS. Hand it a big stage and a big SVG and it
 * draws the site's logo at that size, with the site's idle spin, on the one
 * renderer it owns per document. The header's own mark on this page is told
 * NOT to claim that instance (`BlogHeaderLogo upgrade={false}`): there is one,
 * and this is where it goes.
 *
 * ── SVG first, still ──
 *
 * The flat mark paints with the page and never unmounts; the canvas fades in
 * over it on `onReady`. No WebGL, a lost context, a chunk that will not load —
 * a 404 page shows a 404 page either way. Unlike the header it does not wait
 * for `load` and idle: the logo IS the content here, there is no article to
 * defer to.
 */
export function NotFoundLogo() {
  const stageRef = useRef<HTMLSpanElement>(null)
  const markRef = useRef<SVGSVGElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let detach: DetachHeaderLogo | null = null
    const container = stageRef.current
    const sizeFrom = markRef.current
    if (!container || !sizeFrom) return

    import('../blog/headerLogoRuntime')
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
        console.warn('[not-found-logo] module failed to load', error)
      })

    return () => {
      cancelled = true
      detach?.()
      detach = null
    }
  }, [])

  // The stage is square and wider than the glyph on purpose: the mark turns,
  // and its silhouette is widest at 45°. The canvas fills the stage; the SVG
  // sets the model's height.
  return (
    <span className="not-found__stage" ref={stageRef} data-gl={ready ? 'ready' : undefined}>
      <svg ref={markRef} className="not-found__glyph" viewBox="0 0 400 400" aria-hidden="true">
        <MarkPaths />
      </svg>
    </span>
  )
}
