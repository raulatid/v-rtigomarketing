import { RefObject, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { IntroConfig } from '../experiences/earth/config/introConfig'
import type {
  CornerLogo,
  CornerLogoConfig,
  CornerMetrics,
  HeaderBurgerMetrics,
} from '../corner-logo/createCornerLogo'
import { CornerLogoHandle } from '../experiences/earth/timeline/useMasterTimeline'
import { loadProgress } from '../loading/progress'

interface Props {
  config: IntroConfig
  // No SequenceState here: this layer used it only to mirror a readiness flag
  // nothing read. The timeline asks the logo directly via isReady().
  onLoadFailed: () => void
  logoRef: RefObject<CornerLogo | null>
  handleRef: RefObject<CornerLogoHandle | null>
}

// Owns the corner logo's lifetime. Lives INSIDE the Canvas because the logo no
// longer has a renderer of its own — it is drawn as an overlay pass on the
// application's single renderer, which is only reachable from here (ADR 002).
// Its refs are owned by App, which needs reset()/snapToCorner() for replay and
// seeking, so they are threaded down rather than returned.
//
// The instance is built once and kept across replays (reset() rather than
// dispose()) so the GLB is not re-fetched.
//
// The module is imported DYNAMICALLY: it pulls in GLTFLoader, DRACOLoader and
// KTX2Loader, none of which may sit in the entry chunk (plan 006 §5.1). Only
// the type is imported statically.

/**
 * Where the header's line is, read off the header itself — or null.
 *
 * NULL RATHER THAN A FALLBACK CONSTANT, and the reason is a build one. Importing
 * `DEFAULT_CORNER_METRICS` put a static edge from this file to `logoMotion`,
 * which imports three — the "config module reaching a three-importing module for
 * plain constants" shape that `vite.config.ts` names as the usual cause of its
 * worst assertion. It cost a modulepreload on `/` the day the blog header became
 * a second consumer of the logo: `logoMotion` could no longer live inside the
 * dynamic corner-logo chunk. The motion module already holds that default and
 * keeps it when nobody supplies one, so the constant never needed to travel.
 *
 * `.site-header__row` (SiteHeader.tsx) pads its top by the header inset and is
 * exactly one control tall below that, so its content box IS the line the
 * buttons sit on. Measuring it — rather than repeating the CSS tokens in
 * TypeScript — is what makes the logo and the buttons one composition: the
 * phone breakpoint, the safe-area inset and any future retune all arrive here
 * for free. Computed paddings are absolute px, so `env()` and `max()` in the
 * tokens are already resolved.
 *
 * The SCENE header specifically: in a warm session the blog's header is in the
 * same document, and it is a bar with its own line.
 */
function measureHeaderLine(): CornerMetrics | null {
  const row = document.querySelector<HTMLElement>(".site-header[data-layout='scene'] .site-header__row")
  if (!row) return null
  const rect = row.getBoundingClientRect()
  const style = getComputedStyle(row)
  const padTop = parseFloat(style.paddingTop) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const padLeft = parseFloat(style.paddingLeft) || 0
  const lineHeight = rect.height - padTop - padBottom
  if (lineHeight <= 0) return null
  return {
    insetLeftPx: rect.left + padLeft,
    centerYPx: rect.top + padTop + lineHeight / 2,
    heightPx: lineHeight,
  }
}

/** Push the header's line at the logo, or leave the module's own default alone. */
function applyHeaderLine(logo: CornerLogo): void {
  const metrics = measureHeaderLine()
  if (metrics) logo.setCornerMetrics(metrics)
}

/**
 * The phone burger's bars, as the stylesheet draws them — or null for none.
 *
 * MEASURED, not re-declared, for the same reason `measureHeaderLine` is:
 * `siteHeader.css` owns the burger's geometry and there is to be no second copy
 * of those numbers here. The bars stay in the layout on the scene
 * (`visibility: hidden`) precisely so this can read them; a transform is part
 * of a client rect, so the pitch that comes back is the one on screen.
 *
 * A ZERO-WIDTH BOX IS THE ANSWER "no". The stylesheet hides the button outside
 * its own phone query and SiteHeader does not render it before there are any
 * actions, and a `display: none` element has no box — so asking the DOM covers
 * the breakpoint and the phase at once, and 767px stays in the one file that
 * owns it.
 */
function measureHeaderBurger(): HeaderBurgerMetrics | null {
  const header = document.querySelector<HTMLElement>(".site-header[data-layout='scene']")
  const button = header?.querySelector<HTMLElement>('.site-header__burger')
  if (!header || !button) return null
  const bars = button.querySelectorAll<HTMLElement>('.site-header__burger-bar')
  if (bars.length < 2) return null
  const first = bars[0].getBoundingClientRect()
  const last = bars[bars.length - 1].getBoundingClientRect()
  if (first.width <= 0 || first.height <= 0) return null
  const firstY = first.top + first.height / 2
  const lastY = last.top + last.height / 2
  return {
    count: bars.length,
    // Against the VIEWPORT, which is the render surface: the canvas is fixed to
    // it and the document does not scroll — the assumption measureHeaderLine
    // already makes with `rect.left`.
    centerRightPx: window.innerWidth - (first.left + first.width / 2),
    centerYPx: (firstY + lastY) / 2,
    barLengthPx: first.width,
    barThicknessPx: first.height,
    pitchPx: (lastY - firstY) / (bars.length - 1),
    tone: header.dataset.tone === 'light' ? 'light' : 'dark',
  }
}

/** Push the burger at the logo's overlay scene — null tells it to draw none. */
function applyHeaderBurger(logo: CornerLogo): void {
  logo.setHeaderBurger(measureHeaderBurger())
}

export function CornerLogoLayer({ config, onLoadFailed, logoRef, handleRef }: Props) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const configRef = useRef(config)
  configRef.current = config
  const onLoadFailedRef = useRef(onLoadFailed)
  onLoadFailedRef.current = onLoadFailed

  useEffect(() => {
    let disposed = false
    let logo: CornerLogo | null = null

    const build = async () => {
      const { createCornerLogo } = await import('../corner-logo/createCornerLogo')
      if (disposed) return

      logo = createCornerLogo({
        // Read through a ref so live debug edits apply without rebuilding —
        // corner margins and durations are read per frame anyway.
        config: new Proxy({} as CornerLogoConfig, {
          get: (_t, key: string) => configRef.current[key as keyof IntroConfig],
        }),
        renderer: gl,
        // Readiness is not mirrored into SequenceState: the timeline asks the
        // logo directly through cornerLogo.isReady(), which is the live source.
        onReady: () => {},
        onFailed: () => {
          onLoadFailedRef.current()
        },
      })

      // Guard against the module resolving after unmount: createCornerLogo is
      // awaited, so `disposed` can flip while it is in flight.
      if (disposed) {
        logo.dispose()
        logo = null
        return
      }

      applyHeaderLine(logo)
      applyHeaderBurger(logo)
      logoRef.current = logo
      handleRef.current = {
        startSequence: logo.startSequence,
        isReady: logo.isReady,
      }
    }

    // Same two-frame deferral as LazyScene: the drawing must have painted
    // before a Draco decode starts competing for the main thread.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        // The dynamic import can reject — a chunk 404 after a redeploy is the
        // realistic case — and `logo:assets` is required, so an uncaught
        // rejection here leaves the loading screen waiting forever. Degrade the
        // same way a failed GLB does.
        void build().catch((error) => {
          console.error('[corner-logo] module failed to load', error)
          if (disposed) return
          loadProgress.markDone('logo:assets')
          onLoadFailedRef.current()
        })
      })
    })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      handleRef.current = null
      logoRef.current = null
      logo?.dispose()
    }
    // Built once for the canvas's lifetime. `gl` is stable for that lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A resize moves the header's line (the phone breakpoint, a rotation), so the
  // line is re-measured with the projection. The corner is recomputed per frame
  // from these numbers; nothing else has to notice.
  useEffect(() => {
    const logo = logoRef.current
    if (!logo) return
    logo.setSize(size.width, size.height)
    applyHeaderLine(logo)
    applyHeaderBurger(logo)
  }, [size.width, size.height, logoRef])

  // The burger's other two inputs arrive WITHOUT a resize, and the effect above
  // was the only thing re-reading the header: the button mounts when `hasActions`
  // flips at phase 'site', and `data-tone` flips at the Earth↔Murcia cut.
  //
  // The filter is deliberately narrow. `data-menu-open` is not watched because
  // the bars no longer morph, and widening `attributeFilter` would pick up
  // `aria-expanded` on the burger and `data-state` on the portaled audit
  // trigger — both inside this subtree, both mutating on every toggle.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header[data-layout='scene']")
    if (!header) return
    const observer = new MutationObserver(() => {
      const logo = logoRef.current
      if (logo) applyHeaderBurger(logo)
    })
    observer.observe(header, {
      attributes: true,
      attributeFilter: ['data-tone'],
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [logoRef])

  return null
}
