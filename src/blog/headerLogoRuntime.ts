import * as THREE from 'three'
import { createCornerLogo, type CornerLogo, type CornerLogoConfig } from '../corner-logo/createCornerLogo'
import { isWebGLAvailable } from '../graphics/webglSupport'

/**
 * The blog header's 3D mark: the site's logo, on a surface of its own.
 *
 * ── Why this file exists at all ──
 *
 * The 3D logo is an overlay pass on the application's single renderer
 * (ADR 002), and it owns no renderer, no canvas and no frame loop — over Earth
 * and Murcia `CornerLogoLayer` supplies all three from inside the R3F Canvas.
 * The blog has no Canvas: the cold document never had one, and the warm one is
 * frozen and hidden behind the page. So the blog supplies the missing three
 * itself, here, and everything else is `createCornerLogo` unchanged.
 *
 * ── This module is the dynamic seam, and that is load-bearing ──
 *
 * `checks/architecture.ts` forbids `src/entries/blog.tsx` from STATICALLY
 * reaching `src/graphics/` or `src/experiences/`. It walks static edges only,
 * which is exactly the distinction a lazy seam exists to make: the import of
 * this module from `BlogHeaderLogo` is dynamic, so three.js, the decoders and
 * this file sit outside the cold blog's initial graph. Consequently the imports
 * ABOVE may be static — they are already behind the seam — and keeping them
 * static is what lands this in one chunk instead of four.
 *
 * DO NOT import this module statically from anywhere in `src/blog/`. A type-only
 * import counts: `checks/architecture.ts` records `import type` as a static edge
 * unless the specifier string is byte-identical to one an `import()` in the same
 * file already uses (the DYNAMIC_RE-first pairing in that file). `checks` asserts
 * both halves of this, so a mistake here fails a harness rather than silently
 * putting three.js in the blog chunk.
 *
 * ── What it deliberately does not have ──
 *
 * No post-processing, and none is missing. `RenderPipeline` draws the corner
 * logo AFTER the composer has resolved to the default framebuffer, so the site's
 * mark is not bloomed either — with the same lights, the same
 * `cornerFramePadding` and the same tone mapping, this render is the site's
 * render at a different resolution. What genuinely differs is the ground behind
 * it: black sky there, paper white here.
 */

/**
 * The scene's numbers, minus the ones only the reveal uses.
 *
 * A literal rather than `IntroConfig`: `cornerLogoConfig.ts` exists precisely so
 * this module needs no experience import (`corner-logo/ does not import any
 * experience`), and `CornerLogoLayer` cannot be reused here because it does.
 *
 * `cornerFramePadding` is the only one that matters on this path — it flattens
 * the frustum toward orthographic, which is what makes the pixel→world mapping
 * linear — and it MUST match `introConfig.ts`'s 20, or the mark is projected
 * differently from the site's. The other four belong to the spin-and-fly
 * sequence, which this surface never plays; they are here because the type
 * requires them.
 */
const HEADER_LOGO_CONFIG: CornerLogoConfig = {
  cornerFramePadding: 20,
  spinDuration: 2.0,
  spinPauseBefore: 0.15,
  swapCrossover: 0.45,
  swapDuration: 0.7,
  toCornerDuration: 1.2,
}

/** Long frames (a tab waking, a GC pause) must not jump the spin. */
const MAX_DELTA_S = 0.1

interface Attachment {
  /** The SVG the model is sized from — a new element on every React mount. */
  sizeFrom: Element
  onReady: () => void
  onFailed: () => void
}

/**
 * ONE INSTANCE PER DOCUMENT, re-parented rather than rebuilt.
 *
 * `Index` and `Article` are different component types in `BlogRoute`, so React
 * unmounts one subtree and mounts the other on every article open — and `TopBar`
 * goes with it. A renderer owned by the React component would therefore drop its
 * GL context, re-fetch `vertigo-isotipo-3d.glb` and re-run `compileAsync` every time a reader
 * opens or closes an article, flickering back to the flat SVG each time.
 *
 * So the instance lives here and outlives the components. Attaching moves the
 * canvas into the new header and restarts the loop; detaching takes it out and
 * stops it. Nothing is disposed in between.
 *
 * This is the same shape as `graphics/decoders.ts` (a module-level pool,
 * acquired and released rather than built per consumer) and rests on the same
 * argument ADR 003 makes for keeping both experiences mounted: the return trip
 * is what residency buys, and here the return trip is every article.
 *
 * The cost, stated plainly: one 44×44 WebGL context per document, resident for
 * the session once the blog has been visited, with its frame loop stopped while
 * detached. In a WARM session that is a second context alongside the scene's
 * suspended one.
 */
let instance: Instance | null = null

/**
 * Once true, no attach will try again for the life of the document.
 *
 * A lost context, a 404 on the GLB or a machine without WebGL2 are all answers,
 * not transient errors — and the SVG underneath is a complete mark. Retrying per
 * navigation would burn a context creation on every article open to arrive at
 * the same place.
 */
let unavailable = false

export type DetachHeaderLogo = () => void

/**
 * Put the 3D mark inside `container`, and return the way to take it out again.
 *
 * `onReady` fires when the model is on screen (immediately, if a previous
 * attachment already got there). `onFailed` means "keep showing the SVG".
 */
export function attachHeaderLogo(
  container: HTMLElement,
  attachment: Attachment,
): DetachHeaderLogo {
  if (unavailable) {
    attachment.onFailed()
    return () => {}
  }

  if (!instance) instance = createInstance()
  if (!instance) {
    unavailable = true
    attachment.onFailed()
    return () => {}
  }

  const live = instance
  live.attach(container, attachment)
  return () => live.detach(attachment)
}

interface Instance {
  attach(container: HTMLElement, attachment: Attachment): void
  detach(attachment: Attachment): void
}

function createInstance(): Instance | null {
  if (!isWebGLAvailable()) return null

  const canvas = document.createElement('canvas')
  canvas.className = 'blog-topbar__mark-gl'
  canvas.setAttribute('aria-hidden', 'true')

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // The scene asks for `alpha: false` because SkyShell is behind it. Here
      // there is a paper-white bar behind the mark and it has to show through.
      alpha: true,
      // A 26px mark is not worth waking a discrete GPU for. On a laptop with an
      // article open that is a battery decision, not a frame-rate one.
      powerPreference: 'low-power',
    })
  } catch (error) {
    console.warn('[blog-logo] could not create a renderer', error)
    return null
  }

  // R3F's Canvas sets both of these and nothing in `graphics/` overrides them,
  // so the scene's mark is tone-mapped and this one must be too. three's own
  // defaults are NoToneMapping and SRGB — matching the second but not the first
  // would give the blog a visibly hotter logo than the site's.
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // Transparent, so the bar shows through the frame this clears every draw.
  renderer.setClearColor(0x000000, 0)
  // The same cap the scene argues for at SceneCanvas.tsx, for the same reason.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  let current: Attachment | null = null
  let ready = false
  let onScreen = true
  let raf = 0
  let last = 0

  const logo: CornerLogo = createCornerLogo({
    config: HEADER_LOGO_CONFIG,
    renderer,
    onReady: () => {
      ready = true
      layout()
      // Draw before telling the caller, so the crossfade never reveals an empty
      // canvas for a tick.
      draw(0)
      current?.onReady()
      sync()
    },
    onFailed: () => {
      giveUp()
    },
  })

  // Every `loadProgress` call inside createCornerLogo is a no-op on a COLD blog:
  // `loading/progress.ts` reads `window.__vertigoIntro?.boot`, and the intro
  // never runs in this document. On a WARM one that store exists and
  // `logo:assets` is long since done — but `bootState.setStep` is monotonic (it
  // returns early on anything that is not an increase), so this second consumer
  // cannot rewind the boot drawing. Nothing to guard; the next reader would
  // otherwise have to go and check.

  /**
   * Size the drawing buffer to the canvas box, and the model to the SVG's height.
   *
   * `insetLeftPx` CENTRES rather than sitting at zero: the motion module anchors
   * the box's LEFT EDGE to that inset, because on the site it is a header
   * corner. Centring is `(surface − model) / 2`, and the model's width is its
   * aspect times the height we asked for.
   *
   * Every number here is canvas-local, which is only true because
   * `setSize` now feeds the motion module the surface height it divides by.
   */
  function layout(): void {
    if (!current) return
    const box = canvas.getBoundingClientRect()
    const width = Math.round(box.width)
    const height = Math.round(box.height)
    if (width <= 0 || height <= 0) return

    renderer.setSize(width, height, false)
    logo.setSize(width, height)

    const markHeight = current.sizeFrom.getBoundingClientRect().height || height
    const markWidth = logo.modelAspect() * markHeight
    logo.setCornerMetrics({
      insetLeftPx: (width - markWidth) / 2,
      centerYPx: height / 2,
      heightPx: markHeight,
    })
    // Re-anchor now rather than on the next idle frame, which matters when the
    // loop is stopped for reduced motion and there is no next frame.
    logo.snapToCorner()
  }

  function draw(delta: number): void {
    logo.update(delta)
    renderer.render(logo.scene, logo.camera)
  }

  // ─── The frame loop, which runs as little as it can get away with ───

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    const delta = last === 0 ? 0 : Math.min((now - last) / 1000, MAX_DELTA_S)
    last = now
    draw(delta)
  }

  function start(): void {
    if (raf !== 0) return
    last = 0
    raf = requestAnimationFrame(frame)
  }

  function stop(): void {
    if (raf === 0) return
    cancelAnimationFrame(raf)
    raf = 0
  }

  /**
   * Whether the idle spin is allowed to run right now.
   *
   * A mark scrolled past, or a tab in the background, is a mark nobody is
   * looking at — and the blog is a page people sit on for minutes. Under reduced
   * motion it never runs at all: the mark is still there, still 3D, it just does
   * not turn. (The site's own corner logo does keep turning under that
   * preference. That inconsistency is pre-existing and is not this change's to
   * settle — but a reading page is the surface where it matters most.)
   */
  function sync(): void {
    if (ready && current !== null && onScreen && !document.hidden && !reduceMotion.matches) start()
    else stop()
  }

  /**
   * Stand down for good and hand the header back to its SVG.
   *
   * Used for a failed GLB and for a lost context alike. `webglcontextrestored`
   * is deliberately not awaited: rebuilding into a restored context is work this
   * codebase does not do even for the scene (`RenderPipeline` asks for a
   * reload), and a decorative mark with a working fallback is the last thing
   * worth starting it for.
   */
  function giveUp(): void {
    if (unavailable) return
    unavailable = true
    stop()
    current?.onFailed()
    current = null
    intersection.disconnect()
    resize.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    reduceMotion.removeEventListener('change', onMotionPreference)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    window.removeEventListener('pagehide', onPageHide)
    logo.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
    instance = null
  }

  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    sync()
  })
  intersection.observe(canvas)

  const resize = new ResizeObserver(() => {
    if (!ready) return
    layout()
    // A resize with the loop stopped still has to repaint, or the mark keeps the
    // previous breakpoint's size until something else asks for a frame.
    if (raf === 0) draw(0)
  })
  resize.observe(canvas)

  const onVisibility = () => sync()
  document.addEventListener('visibilitychange', onVisibility)

  // Turning reduced motion ON mid-session has to stop the spin, and turning it
  // off has to start it. `change` is the only way to hear about either.
  const onMotionPreference = () => {
    sync()
    // Leave a composed frame behind rather than whatever pose the spin was
    // halfway through.
    if (reduceMotion.matches && ready) draw(0)
  }
  reduceMotion.addEventListener('change', onMotionPreference)

  const onContextLost = (event: Event) => {
    event.preventDefault()
    giveUp()
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  // Nothing else ever disposes this instance, so the page leaving is the one
  // moment the context can be handed back. Without it a bfcache eviction leaves
  // it to the collector.
  const onPageHide = () => giveUp()
  window.addEventListener('pagehide', onPageHide)

  return {
    attach(container, attachment) {
      current = attachment
      container.appendChild(canvas)
      if (ready) {
        // A remount inherits a model that is already loaded and compiled, which
        // is the whole point of the instance outliving the component: no fetch,
        // no compile, and no flicker back to the SVG on the way into an article.
        layout()
        draw(0)
        attachment.onReady()
      }
      sync()
    },

    detach(attachment) {
      // A remount can attach the new subtree before React unmounts the old one.
      // Only the CURRENT attachment may tear things down, or the freshly
      // attached canvas is pulled straight back out.
      if (current !== attachment) return
      current = null
      stop()
      canvas.remove()
    },
  }
}
