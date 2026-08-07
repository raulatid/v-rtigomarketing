import { RefObject } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { cinematicTravel, cinematicSpeed, narrowPeak, lerp, lerpVec3 } from '../utils/easing'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { atOrAfter } from '../sceneVisibility'

// Leg 1: the camera pushes forward through the star volume.
// Leg 2: it arrives from far out and settles at the Earth's rest distance.
// The two legs are unrelated — the camera teleports between them at the cut,
// which is exactly the trick from extraction 002 §1.
const STAR_REST: [number, number, number] = [0, 0, 200]
const STAR_EXIT: [number, number, number] = [0, 0, -200]
const EARTH_FAR: [number, number, number] = [0, 0, 80]
// Exported because the interaction rig adopts this as its overview pose. It
// must NOT seed from the live camera instead: on a skip, this controller bails
// before ever moving the camera off STAR_REST, and the rig would inherit z=200.
export const EARTH_REST: [number, number, number] = [0, 0, 14]

const STAR_LOOK_AT = new THREE.Vector3(0, 0, -1000)
const EARTH_LOOK_AT = new THREE.Vector3(0, 0, 0)

interface Props {
  config: IntroConfig
  state: SequenceState
  overlayEl: RefObject<HTMLDivElement | null>
  active: boolean
}

export function CameraController({ config, state, overlayEl, active }: Props) {
  const { camera } = useThree()

  useFrame(() => {
    if (!('fov' in camera)) return
    const cam = camera as THREE.PerspectiveCamera

    // While another experience is showing, Earth's camera must not be written —
    // but the overlay still must be, because this is its only writer and the
    // transition flash rides on it (ADR 003). Freezing the camera rather than
    // resetting it is what lets a return resume the pose the viewer left.
    if (!active) {
      applyOverlay()
      return
    }

    // HANDOFF. Once the sequence rests, InteractionLayer's rig owns the camera.
    // Two owners writing a pose per frame would fight, which is exactly why the
    // source project dropped OrbitControls. Bail out entirely — but keep writing
    // the overlay, which is still ours.
    if (atOrAfter(state.phase, 'site')) {
      state.warpOverlay = 0
      state.motionBlur = 0
      applyOverlay()
      return
    }

    const inWarp = state.phase === 'warp'

    if (!inWarp) {
      // Reassert a rest pose every frame so an interrupted or seeked timeline
      // can never strand the camera mid-flight.
      //
      // Ordering comparison, not a phase list: this was a hardcoded set and
      // inserting 'orbits' between 'corner' and 'site' silently sent the camera
      // back to the starfield rest position, shrinking the Earth to a dot for
      // the whole orbit reveal.
      const atEarth = atOrAfter(state.phase, 'swap')
      cam.position.set(...(atEarth ? EARTH_REST : STAR_REST))
      cam.lookAt(atEarth ? EARTH_LOOK_AT : STAR_LOOK_AT)
      cam.fov = config.normalFov
      cam.updateProjectionMatrix()
      state.warpOverlay = 0
      state.motionBlur = 0
      applyOverlay()
      return
    }

    const p = state.warpProgress
    const travelT = cinematicTravel(p, config.accelerationPower)
    const speedFactor = cinematicSpeed(p, config.sceneSwapProgress, config.speedPeakWidth)

    const firstHalf = travelT < 0.5
    const localT = firstHalf ? travelT * 2 : (travelT - 0.5) * 2

    const position = firstHalf
      ? lerpVec3(STAR_REST, STAR_EXIT, localT)
      : lerpVec3(EARTH_FAR, EARTH_REST, localT)

    cam.position.set(...position)
    cam.lookAt(firstHalf ? STAR_LOOK_AT : EARTH_LOOK_AT)

    // The FOV surge is the primary warp signal — a dolly zoom run in the
    // direction that amplifies motion rather than cancelling it.
    cam.fov = lerp(config.normalFov, config.maxTravelFov, speedFactor)
    cam.updateProjectionMatrix()

    state.warpOverlay =
      narrowPeak(p, config.sceneSwapProgress, 0.1) * config.overlayStrength
    state.motionBlur = speedFactor * config.motionBlurStrength
    applyOverlay()
  })

  // Single DOM writer for both overlay contributors. Runs inside useFrame so it
  // costs no extra loop and never touches React state.
  function applyOverlay() {
    const el = overlayEl.current
    if (!el) return
    const value = Math.min(1, Math.max(state.warpOverlay, state.swapOverlay))
    el.style.opacity = value.toFixed(4)
  }

  return null
}
