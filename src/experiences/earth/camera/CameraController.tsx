import { RefObject, useMemo, useRef } from 'react'
import { overviewRestPosition } from './overviewPose'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  cinematicTravel,
  cinematicSpeed,
  narrowPeak,
  lerp,
  lerpVec3,
  smootherstep,
} from '../../../utils/easing'
import { IntroConfig } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { atOrAfter } from '../config/sceneVisibility'
import type { DestinationResolver } from '../navigation/destination'
import {
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  prefersReducedMotion,
  speed,
} from '../../../app/warpTransition'

// Leg 1: the camera pushes forward through the star volume.
// Leg 2: it arrives from far out and settles at the Earth's rest distance.
// The two legs are unrelated — the camera teleports between them at the cut,
// which is exactly the trick from extraction 002 §1.
/**
 * How long the committed warp takes to adopt its own FOV, seconds.
 *
 * The scrub deliberately holds the lens at rest — the surge cancels the dolly it
 * is meant to sell, see `scrubPose.ts` — so a commit from the top of the band
 * would otherwise pop 45 -> 59.5 deg in a single frame. A commit ALWAYS comes
 * from the top of the band, because that is what committing means, so this is
 * not an edge case: it is every transition.
 *
 * 0.2s is an eighth of the 1.6s warp and lands while the dolly is still
 * accelerating out of its ease-in, which is the part of the curve with the most
 * motion to hide it behind. Long enough not to read as a cut, short enough that
 * the surge is still doing its job by the time the speed bell peaks.
 */
const FOV_CATCHUP_SECONDS = 0.2

const STAR_REST: [number, number, number] = [0, 0, 200]
const STAR_EXIT: [number, number, number] = [0, 0, -200]
// The far point of the arriving dolly: the rest direction, further out, so the
// pull-in runs straight along the view ray whatever orientation the rest has.
const EARTH_FAR: [number, number, number] = overviewRestPosition(80)
// Exported because the interaction rig adopts this as its overview pose. It
// must NOT seed from the live camera instead: on a skip, this controller bails
// before ever moving the camera off STAR_REST, and the rig would inherit z=200.
//
// Derived from radius, theta AND phi since 2026-09-05 (it was `[0, 0, radius]`,
// i.e. theta 0 / phi 90): the client chose a framing, and the rig reads its
// resting orbit back out of this vector, so this is where the orientation is
// baked. See `overviewPose.ts`.
export const EARTH_REST: [number, number, number] = overviewRestPosition()

const STAR_LOOK_AT = new THREE.Vector3(0, 0, -1000)
const EARTH_LOOK_AT = new THREE.Vector3(0, 0, 0)

interface Props {
  config: IntroConfig
  state: SequenceState
  overlayEl: RefObject<HTMLDivElement | null>
  active: boolean
  /**
   * Resolves the navigation destination's current world position. Published by
   * EarthScene (which owns the spin group the destination turns with) — there
   * is no marker object behind it, only the destination model and the spin
   * group's transform.
   */
  destinationRef: RefObject<DestinationResolver | null>
}

export function CameraController({
  config,
  state,
  overlayEl,
  active,
  destinationRef,
}: Props) {
  const { camera } = useThree()

  // Warp scratch. Reused rather than allocated per frame — this runs in the
  // render loop.
  const dollyAnchor = useRef(new THREE.Vector3())
  const dollyCaptured = useRef(false)
  /** The lens the commit inherited, and how far the cinematic has adopted its own. */
  const fovAtCommit = useRef<number>(WARP_TRANSITION.earthRestFov)
  const fovCatchUp = useRef(0)
  const destinationWorld = useRef(new THREE.Vector3())
  const warpLookAt = useRef(new THREE.Vector3())
  const reducedMotion = useMemo(prefersReducedMotion, [])

  useFrame((_, delta) => {
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
    // Committed only, and since `adr/014` that is the only thing `progress` can
    // mean: a viewer-driven gesture moves their own ZOOM, which the rig applies
    // to its orbit radius, and never this. It mattered while the two shared the
    // number — the rig was still live and still the frame's last camera writer,
    // so a scrub written here would have been overwritten before the draw.
    //
    // Capturing the dolly anchor once is right for a cinematic on a stood-down
    // rig, and would be wrong for a pose the viewer is actively moving. It is
    // also what makes a commit from a zoomed camera seamless: the anchor is the
    // live `cam.position`, so the warp is relative to wherever the zoom left it
    // and there is no absolute target to snap to.
    if (state.transitionCommitted) {
      applyWarp(cam, state.transitionProgress, delta)
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
   * The look-at eases toward the navigation destination as the speed bell
   * peaks: descending flies you into Murcia, and coming back you emerge from it
   * and pull out to the whole globe. Read in world space every frame because
   * the destination turns with the Earth's surface.
   */
  function applyWarp(cam: THREE.PerspectiveCamera, p: number, dt: number) {
    const { departing, amount } = dollyAmount(p)

    if (!dollyCaptured.current) {
      if (departing) dollyAnchor.current.copy(cam.position)
      else dollyAnchor.current.set(...EARTH_REST)
      // Captured beside the anchor and for the same reason: this is the pose the
      // cinematic is taking OVER from, and the lens is part of a pose.
      fovAtCommit.current = cam.fov
      fovCatchUp.current = 0
      dollyCaptured.current = true
    }

    // Reduced motion keeps the flash and the cut — concealing the jump is not a
    // motion effect — but skips the travel and the surge entirely.
    if (reducedMotion) return

    const radius = dollyAnchor.current.length()
    cam.position.copy(dollyAnchor.current).setLength(radius * earthRadiusScale(amount))

    const lookAt = warpLookAt.current.copy(EARTH_LOOK_AT)
    const destination = destinationRef.current?.(destinationWorld.current)
    if (destination) lookAt.lerpVectors(EARTH_LOOK_AT, destination, speed(p))
    cam.lookAt(lookAt)

    // Blended rather than written, so the cinematic can adopt a lens the scrub
    // never moved without a visible step. Reaches 1 and STAYS there, so the rest
    // of the warp — including both ends, which return to exactly 45 — is exact
    // rather than forever approaching.
    fovCatchUp.current = Math.min(1, fovCatchUp.current + dt / FOV_CATCHUP_SECONDS)
    cam.fov = lerp(fovAtCommit.current, earthFov(p), smootherstep(0, 1, fovCatchUp.current))
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
