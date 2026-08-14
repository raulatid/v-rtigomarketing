import { useEffect, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { auditView } from '../../../auditView'
import { clampFrameDelta } from '../../../graphics/frameDelta'

// Recomposes the scene while the audit panel is open by sliding the camera's
// projection window (setViewOffset) instead of moving the camera itself.
//
// WHY NOT A POSE (plan 005 §8): CameraController reasserts a rest pose every
// frame during the intro, and the focus rig owns the pose afterwards — a third
// pose writer would fight whichever one is active. The view offset lives one
// level below the pose, so the subject re-centres inside the right-hand strip
// while the current owner keeps every behaviour (drag orbit, wheel zoom,
// satellite fly-in), and closing the panel restores the exact previous framing
// by construction — there is no saved pose to drift.

// Mirrors the CSS width of .audit-curtain: clamp(480px, 44vw, 720px).
function panelWidth(viewport: number): number {
  return Math.min(Math.max(viewport * 0.44, 480), 720)
}

// Same frame-rate-independent exponential ease the focus rig uses; k tuned so
// the shift settles in roughly 0.9s — in step with the curtain without being
// identical to it (plan 005 §8).
const LERP_K = 3.4

export function AuditCameraShift({ active }: { active: boolean }) {
  const { camera, size } = useThree()
  const progress = useRef(0)
  const offsetActive = useRef(false)

  useFrame((_, rawDelta) => {
    // Writes Earth's camera view offset, so it has nothing to say while another
    // experience is showing. The offset is left in place rather than cleared —
    // it is only meaningful together with the pose CameraController froze.
    if (!active) return

    const cam = camera as PerspectiveCamera
    const target = auditView.open ? 1 : 0
    // Delta clamped like the rig's, so a backgrounded tab cannot jump-cut.
    const alpha = auditView.reducedMotion ? 1 : 1 - Math.exp(-LERP_K * clampFrameDelta(rawDelta))
    progress.current += (target - progress.current) * alpha

    if (target === 0 && progress.current < 0.001) {
      progress.current = 0
      if (offsetActive.current) {
        // Exact restore: dropping the offset returns the original projection.
        cam.clearViewOffset()
        offsetActive.current = false
      }
      return
    }

    // The remaining strip's centre sits panelWidth/2 right of the viewport
    // centre; a negative x offset pans the projection window left, which shows
    // the world shifted right by that same amount.
    const shift = (panelWidth(size.width) / 2) * progress.current
    cam.setViewOffset(size.width, size.height, -shift, 0, size.width, size.height)
    offsetActive.current = true
  })

  useEffect(() => {
    return () => {
      ;(camera as PerspectiveCamera).clearViewOffset()
    }
  }, [camera])

  return null
}
