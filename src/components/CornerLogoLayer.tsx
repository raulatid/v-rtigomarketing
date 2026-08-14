import { RefObject, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { IntroConfig } from '../experiences/earth/config/introConfig'
import type { CornerLogo, CornerLogoConfig } from '../corner-logo/createCornerLogo'
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

  useEffect(() => {
    logoRef.current?.setSize(size.width, size.height)
  }, [size.width, size.height, logoRef])

  return null
}
