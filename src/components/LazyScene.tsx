import { ComponentProps, lazy, Suspense, useEffect, useState } from 'react'
import type { SceneCanvas } from './SceneCanvas'
import { loadProgress } from '../loading/progress'

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

  if (!armed) return null
  return (
    <Suspense fallback={null}>
      <SceneCanvasLazy {...props} />
    </Suspense>
  )
}
