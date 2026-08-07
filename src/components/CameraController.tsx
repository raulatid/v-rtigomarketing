import { RefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { cinematicTravel, cinematicSpeed, narrowPeak, lerp, lerpVec3 } from '../utils/easing'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { atOrAfter } from '../sceneVisibility'
import { GEO_MARKERS } from '../orbit-system/orbitConfig'
import type { GeoMarkers } from '../orbit-system/createGeoMarkers'
import {
  dollyAmount,
  earthFov,
  earthRadiusScale,
  prefersReducedMotion,
  speed,
} from '../app/warpTransition'

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
  geoMarkersRef: RefObject<GeoMarkers | null>
}

export function CameraController({
  config,
  state,
  overlayEl,
  active,
  geoMarkersRef,
}: Props) {
  const { camera } = useThree()

  // Warp scratch. Reused rather than allocated per frame — this runs in the
  // render loop.
  const dollyAnchor = useRef(new THREE.Vector3())
  const dollyCaptured = useRef(false)
  const markerWorld = useRef(new THREE.Vector3())
  const warpLookAt = useRef(new THREE.Vector3())
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const destinationId = useMemo(
    () => GEO_MARKERS.find((m) => m.kind === 'destination')?.id ?? null,
    [],
  )

  useFrame(() => {
    if (!('fov' in camera)) return
    const cam = camera as THREE.PerspectiveCamera

    // While another experience is showing, Earth's camera must not be written —
    // but the overlay still must be, because this is its only writer and the
    // transition flash rides on it (ADR 003). Freezing the camera rather than
    // resetting it is what lets a return resume the pose the viewer left.
    if (!active) {
      dollyCaptured.current = false
      applyOverlay()
      return
    }

    // ── The Earth<->Murcia warp ──
    //
    // Placed BEFORE the site handoff below: during a transition the focus rig
    // stands down (InteractionLayer stops calling its update), so this is the
    // sole camera writer for the duration. Two writers per frame is the failure
    // the source project removed OrbitControls to avoid.
    if (state.transitionProgress > 0) {
      applyWarp(cam, state.transitionProgress)
      applyOverlay()
      return
    }
    dollyCaptured.current = false

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

  /**
   * The dolly leg of the warp.
   *
   * Departing, the camera rushes IN along its own view axis, so it works from
   * whatever orbit position the viewer had dragged to rather than assuming the
   * default. Arriving, it pulls OUT to `EARTH_REST` — deterministic rather than
   * captured, because the rig was deactivated on the way out and its `activate()`
   * reseeds from the overview pose, so that is provably where it will be when it
   * takes the camera back. Landing anywhere else would snap on handback.
   *
   * The look-at eases toward the destination marker as the speed bell peaks:
   * clicking Murcia flies you into Murcia, and coming back you emerge from it
   * and pull out to the whole globe. Read in world space every frame because the
   * marker rotates with the surface.
   */
  function applyWarp(cam: THREE.PerspectiveCamera, p: number) {
    const { departing, amount } = dollyAmount(p)

    if (!dollyCaptured.current) {
      if (departing) dollyAnchor.current.copy(cam.position)
      else dollyAnchor.current.set(...EARTH_REST)
      dollyCaptured.current = true
    }

    // Reduced motion keeps the flash and the cut — concealing the jump is not a
    // motion effect — but skips the travel and the surge entirely.
    if (reducedMotion) return

    const radius = dollyAnchor.current.length()
    cam.position.copy(dollyAnchor.current).setLength(radius * earthRadiusScale(amount))

    const lookAt = warpLookAt.current.copy(EARTH_LOOK_AT)
    const marker = destinationId
      ? geoMarkersRef.current?.getWorldPosition(destinationId, markerWorld.current)
      : null
    if (marker) lookAt.lerpVectors(EARTH_LOOK_AT, marker, speed(p))
    cam.lookAt(lookAt)

    cam.fov = earthFov(p)
    cam.updateProjectionMatrix()
  }

  // Single DOM writer for both overlay contributors. Runs inside useFrame so it
  // costs no extra loop and never touches React state.
  function applyOverlay() {
    const el = overlayEl.current
    if (!el) return
    const value = Math.min(
      1,
      Math.max(state.warpOverlay, state.swapOverlay, state.transitionOverlay),
    )
    el.style.opacity = value.toFixed(4)
  }

  return null
}
