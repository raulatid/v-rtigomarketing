// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createCameraInput } from './createCameraInput'
import { CameraRig } from '../camera/CameraRig'
import type { CameraClaim } from '../camera/CameraRig'
import { createDefaultCameraTuning } from '../camera/cameraTuning'
import { murciaConfig } from '../config/murciaConfig'
import { resolveCameraPose } from '../config/environmentConfig'

/**
 * The gate, through the REAL DOM path: listeners on a real element, real
 * `PointerEvent`s, the real rig behind it.
 *
 * ## The bug this file exists for
 *
 * This module listens on the SHARED canvas — Earth draws to the same one — so
 * "is Murcia showing?" is not a question it can answer by looking at its own
 * element. It asks the rig who owns the camera instead, and for a long time it
 * asked a boolean that only two of the four owners ever set. The other two were
 * Earth-is-showing and the warp, which are precisely the moments a pointer is
 * most likely to be on the glass:
 *
 *   - while Earth showed, every drag on the globe reached `rig.drag()` here.
 *     Nothing moved, because the springs are not stepped while the city is
 *     hidden, so the yaw piled up unseen — UNBOUNDED, because `targetYaw` is
 *     deliberately not clamped — and the camera turned to meet it the moment
 *     the viewer arrived in Murcia. It read as the camera spinning on its own.
 *   - the same during the second half of an arrival, where the cinematic owns
 *     the pose and freezes the springs.
 *
 * Worse on a phone than on a desktop for two reasons that compound: dragging
 * the globe with a finger IS the mobile gesture, and `rotationGain` is degrees
 * per viewport WIDTH, so the same 200px drag is worth about 38 degrees on a
 * 390px screen against about 10 on a 1440px one.
 *
 * So the assertions below are about a number NOT changing, and the last test in
 * the first block is the one that keeps them honest: the identical gesture with
 * nobody holding the camera has to move it, or "unchanged" would be proving
 * that the harness is broken rather than that the gate works.
 */

const WIDTH = 390
const HEIGHT = 844

/** Read from the shipped tuning, never restated. */
const DEFAULT_ROTATION_GAIN = createDefaultCameraTuning(
  murciaConfig,
  resolveCameraPose(murciaConfig, WIDTH / HEIGHT).distance,
  resolveCameraPose(murciaConfig, WIDTH / HEIGHT).elevationDegrees,
  murciaConfig.navigation.bounds,
).rotationGain

function setup(claims: CameraClaim[]) {
  const aspect = WIDTH / HEIGHT
  const pose = resolveCameraPose(murciaConfig, aspect)
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, pose.near, pose.far)
  const rig = new CameraRig(
    camera,
    pose,
    createDefaultCameraTuning(
      murciaConfig,
      pose.distance,
      pose.elevationDegrees,
      murciaConfig.navigation.bounds,
    ),
  )
  rig.setFocus(murciaConfig.initialFocus.x, murciaConfig.initialFocus.z)
  // Explicit on both sides. A rig is born holding `'inactive'`, so a test that
  // wants a free one has to say so, and one that wants it held says which name.
  rig.release('inactive')
  for (const id of claims) rig.claim(id)

  const element = document.createElement('div')
  document.body.appendChild(element)
  // jsdom implements neither, and `createCameraInput` calls both inside
  // try/catch — supplied anyway so the test exercises the capture path rather
  // than the catch.
  const el = element as unknown as Record<string, unknown>
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}

  const input = createCameraInput({ element, rig, width: WIDTH, height: HEIGHT })
  return { rig, element, input }
}

/** A `PointerEvent` jsdom will carry: it has no constructor for one. */
function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true }) as Event & Record<string, unknown>
  event.pointerId = 1
  event.pointerType = 'touch'
  event.clientX = x
  event.clientY = y
  event.buttons = 1
  event.button = 0
  Object.assign(event, extra)
  return event
}

/** A real horizontal swipe: down, four moves across a third of the screen, up. */
function swipe(element: HTMLElement): void {
  element.dispatchEvent(pointer('pointerdown', 40, 400))
  for (let i = 1; i <= 4; i += 1) {
    element.dispatchEvent(pointer('pointermove', 40 + i * 30, 400))
  }
  element.dispatchEvent(pointer('pointerup', 160, 400))
}

/** The three numbers a drag can move. Compared whole so nothing slips through. */
function targets(rig: CameraRig) {
  const s = rig.snapshot()
  return { targetYaw: s.targetYaw, targetX: s.targetX, targetZ: s.targetZ }
}

describe('the gate on who owns the camera', () => {
  it('drops a whole gesture while Earth is showing', () => {
    const { rig, element } = setup(['inactive'])
    const before = targets(rig)
    swipe(element)
    expect(targets(rig)).toEqual(before)
  })

  it('drops a whole gesture while the cinematic owns the pose', () => {
    // The second half of an arrival: `active` is true again and the springs are
    // frozen, so a drag accepted here would be invisible until the warp let go.
    const { rig, element } = setup(['warp'])
    const before = targets(rig)
    swipe(element)
    expect(targets(rig)).toEqual(before)
  })

  it('stays shut while ANY name is held, not just the one that released', () => {
    // The campus flying while Earth is showing, then landing. Under the boolean
    // this replaced, the campus's hand-back freed the rig outright and the city
    // took input again with the globe still on screen.
    const { rig, element } = setup(['inactive', 'campus'])
    rig.release('campus')
    expect(rig.isOwned).toBe(true)
    const before = targets(rig)
    swipe(element)
    expect(targets(rig)).toEqual(before)
  })

  it('and the same gesture DOES turn the camera when nobody holds it', () => {
    const { rig, element } = setup([])
    const before = targets(rig)
    swipe(element)
    // 120px of a 390px screen at the shipped gain: tens of degrees, which is
    // the size of the yaw a single mobile globe-drag used to smuggle in.
    expect(Math.abs(targets(rig).targetYaw - before.targetYaw)).toBeGreaterThan(10)
  })
})

describe('a claim that arrives mid-gesture', () => {
  it('stops the drag without banking the travel it swallowed', () => {
    // `onPointerMove` advances its stored sample BEFORE the gate, so the moves
    // dropped while the claim is held do not come back as one big delta on the
    // first move after it lifts. Asserted because the obvious ordering — gate
    // first, then update the sample — is wrong in a way nothing else would
    // catch: it reads as a lurch only on release.
    const SWALLOWED_TO = 230
    const RESUMED_AT = 240

    const { rig, element } = setup([])
    element.dispatchEvent(pointer('pointerdown', 40, 400))
    element.dispatchEvent(pointer('pointermove', 70, 400))
    const interrupted = targets(rig)

    rig.claim('blog')
    for (let x = 110; x <= SWALLOWED_TO; x += 40) {
      element.dispatchEvent(pointer('pointermove', x, 400))
    }
    expect(targets(rig)).toEqual(interrupted)

    rig.release('blog')
    element.dispatchEvent(pointer('pointermove', RESUMED_AT, 400))
    // Measured from where the finger was when the claim lifted, NOT from where
    // it was when the claim arrived: 10px, not the 160px the gate swallowed.
    // Derived from the shipped gain rather than written down, so re-tuning the
    // turn does not make this a test of a number nobody meant to freeze.
    const resumed = Math.abs(targets(rig).targetYaw - interrupted.targetYaw)
    expect(resumed).toBeCloseTo(((RESUMED_AT - SWALLOWED_TO) / WIDTH) * DEFAULT_ROTATION_GAIN, 9)
  })
})
