import { ComponentProps, lazy, Suspense, useEffect, useState } from 'react'
import type { SceneCanvas } from './SceneCanvas'
import { loadProgress } from '../loading/progress'
import { SceneErrorBoundary } from './SceneErrorBoundary'
import { isWebGLAvailable } from '../graphics/webglSupport'

// Everything that touches three.js lives behind this import — it is the single
// seam that keeps ~1.2MB out of the entry chunk (plan 006 §5.1).
//
// Importing it eagerly would defeat the point: module evaluation is a
// synchronous main-thread block, so it must not land before the drawing has
// painted at least one frame.
const SceneCanvasLazy = lazy(async () => {
  try {
    const mod = await import('./SceneCanvas')
    // Resolved means downloaded, parsed AND evaluated — the whole cost this
    // step stands for. One milestone rather than a ramp, because a dynamic
    // import exposes no byte progress; the autonomous curve is what keeps the
    // step from reading as a jump.
    loadProgress.markDone('chunk:scene')
    return { default: mod.SceneCanvas }
  } catch (error) {
    // The scene module is required — without it there is no scene to warp
    // into, ever. Fatal rather than a silent hang (plan 007 Phase 3).
    loadProgress.markFatal('chunk:scene', String(error))
    throw error
  }
})

type Props = ComponentProps<typeof SceneCanvas>

export function LazyScene(props: Props) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    // Two frames, not one: the first rAF fires before the browser has painted
    // the drawing's opening frame, and starting a 1.2MB evaluation there is
    // the same first-paint block being removed.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setArmed(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // Asked once, before the chunk is even armed, so a device that cannot run the
  // scene never EVALUATES it: ~1.2 MB of three.js and SceneCanvas stays parsed
  // but unexecuted, and no Canvas is ever mounted.
  //
  // It does NOT save the download, which this comment claimed until 2026-08-13.
  // introEntry() in vite.config.ts injects <link rel="modulepreload"> for every
  // non-entry chunk, so both are fetched at first parse whatever this decides —
  // measured in e2e/degraded.spec.ts, which asserts the real behaviour. The
  // saving is the expensive half either way: main-thread evaluation, not bytes.
  const [supported] = useState(isWebGLAvailable)

  useEffect(() => {
    if (supported) return
    loadProgress.markFatal(
      'chunk:scene',
      'WebGL 2 is unavailable in this browser',
    )
  }, [supported])

  if (!supported) return null
  if (!armed) return null
  return (
    // Outside Suspense, so it also catches the re-thrown chunk-load rejection
    // above — and outside the Canvas, because a refused WebGL context throws
    // while <Canvas> itself renders, in the DOM tree rather than the R3F one.
    <SceneErrorBoundary>
      <Suspense fallback={null}>
        <SceneCanvasLazy {...props} />
      </Suspense>
    </SceneErrorBoundary>
  )
}
