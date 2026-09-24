import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CameraRig } from './CameraRig'
import { createDefaultCameraTuning } from './cameraTuning'
import type { CameraTuning } from './cameraTuning'
import { murciaConfig } from '../config/murciaConfig'
import { resolveCameraPose } from '../config/environmentConfig'

// The spring's own properties, isolated from the pointer path.
//
// `checks/navigation-feel.ts` drives this rig through synthetic gestures and
// measures the camera; these two assertions are about the integrator itself and
// are cheaper and sharper stated here. They are the sandbox's `probeEaseIn` and
// `probeStability`, which were the only evidence this maths had.

const ASPECT = 16 / 9

function makeRig(overrides: Partial<CameraTuning> = {}): CameraRig {
  const pose = resolveCameraPose(murciaConfig, ASPECT)
  const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far)
  const tuning = {
    ...createDefaultCameraTuning(
      murciaConfig,
      pose.distance,
      pose.elevationDegrees,
      murciaConfig.navigation.bounds,
    ),
    ...overrides,
  }
  const rig = new CameraRig(camera, pose, tuning)
  rig.setFocus(murciaConfig.initialFocus.x, murciaConfig.initialFocus.z)
  // Left holding the claim it is born with, deliberately. The rig does not gate
  // itself on ownership — `drag` and `update` are callable whoever holds it, and
  // the refusing is done by `createCameraInput` and by `update()`'s owner ladder
  // — so these spring tests have no reason to take a position on it.
  return rig
}

describe('the travel spring', () => {
  it('EASES IN: displacement per frame rises before it falls', () => {
    // THE assertion this file exists for, and the one that fails if anyone
    // "simplifies" the four-line closed form back to a lerp.
    //
    // A first-order lag cannot do this. Its displacement is maximal on the very
    // first frame and decays monotonically from there, so every move starts at
    // full speed and the camera reads as weightless. A second-order spring
    // starts from rest, accelerates, then decelerates — an S-curve — and that
    // acceleration is the whole of what "the camera has weight" means.
    const rig = makeRig()
    const start = rig.snapshot()
    // One decisive drag, then let it run untouched.
    rig.drag(0, 0.35)

    const steps: number[] = []
    let previous = start.x
    let previousZ = start.z
    for (let i = 0; i < 40; i += 1) {
      rig.update(1 / 60)
      const s = rig.snapshot()
      steps.push(Math.hypot(s.x - previous, s.z - previousZ))
      previous = s.x
      previousZ = s.z
    }

    const peak = steps.indexOf(Math.max(...steps))
    expect(peak).toBeGreaterThan(0)
    // And it really does fall away afterwards, rather than merely plateauing.
    expect(steps[steps.length - 1]).toBeLessThan(steps[peak])
  })

  it('is stable at absurd frame times and damping ratios', () => {
    // The closed form is the exact solution over dt, so there is no step size at
    // which it can diverge — unlike an integrated spring, which blows up once
    // `omega * dt` passes its stability bound. Driven here at omega*dt ~ 6,
    // which an Euler integrator would not survive.
    for (const ratio of [0.2, 0.85, 1, 4]) {
      const pose = resolveCameraPose(murciaConfig, ASPECT)
      const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far)
      const tuning = createDefaultCameraTuning(
        murciaConfig,
        pose.distance,
        pose.elevationDegrees,
        murciaConfig.navigation.bounds,
      )
      tuning.dampingRatio = ratio
      const rig = new CameraRig(camera, pose, tuning)
      rig.setFocus(murciaConfig.initialFocus.x, murciaConfig.initialFocus.z)
      rig.drag(0.4, 0.4)

      for (let i = 0; i < 200; i += 1) rig.update(0.85)

      const s = rig.snapshot()
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Number.isFinite(s.z)).toBe(true)
      expect(Number.isFinite(s.yaw)).toBe(true)
      expect(Number.isFinite(s.radius)).toBe(true)
      // And it converged rather than merely staying finite.
      expect(Math.hypot(s.x - s.targetX, s.z - s.targetZ)).toBeLessThan(1e-3)
    }
  })
})

describe('the lean never becomes navigation', () => {
  it('moves the camera without touching a single target', () => {
    // The invariant that keeps the bounds clamp, a flight handover and a
    // snapshot free of an ornament. If the lean ever enters `targetYaw`, a
    // viewer who leaves the mouse in a corner drifts the city.
    const rig = makeRig()
    rig.setCursor(1, 1)
    // Past the idle delay, so the lean is engaged.
    for (let i = 0; i < 600; i += 1) rig.update(1 / 60)

    const before = rig.snapshot()
    expect(Math.abs(before.cursorYawOffsetDegrees)).toBeGreaterThan(0.5)
    expect(before.targetYaw).toBe(0)
    expect(before.yaw).toBe(0)
  })

  it('waits out the idle delay before it comes back', () => {
    const rig = makeRig()
    rig.setCursor(1, 0)
    // Well inside the delay.
    for (let i = 0; i < 30; i += 1) rig.update(1 / 60)
    expect(Math.abs(rig.snapshot().cursorYawOffsetDegrees)).toBeLessThan(1e-6)
  })
})


// The hand-over another system uses when it flies the camera itself: the blog
// approach and the services campus both take the rig, write `camera.position`
// and `quaternion` directly, and give it back through `adoptFromCamera`. The
// campus holds it for a whole visit, so what the rig solves on the way back is
// what the city's continuity rests on. `checks/campus-section.ts` drives the
// full loop, owner switch included; these pin the rig's half.
describe('handing the camera to another system and taking it back', () => {
  function makeHeld(): { rig: CameraRig; camera: THREE.PerspectiveCamera } {
    const pose = resolveCameraPose(murciaConfig, ASPECT)
    const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far)
    const tuning = createDefaultCameraTuning(
      murciaConfig,
      pose.distance,
      pose.elevationDegrees,
      murciaConfig.navigation.bounds,
    )
    const rig = new CameraRig(camera, pose, tuning)
    rig.setAspect(ASPECT)
    rig.setFocus(murciaConfig.initialFocus.x, murciaConfig.initialFocus.z)
    // A rig is born holding `'inactive'` — the city is built during the Earth
    // intro and the viewer is never its first owner. These tests are about a
    // city that is showing, so they say so.
    rig.release('inactive')
    return { rig, camera }
  }
  const settle = (rig: CameraRig, seconds = 3) => {
    for (let i = 0; i < seconds * 60; i += 1) rig.update(1 / 60)
  }

  it('says when it is held, and counts the hand-over as navigation', () => {
    const { rig } = makeHeld()
    settle(rig)
    expect(rig.snapshot().secondsSinceNavigation).toBeGreaterThan(2)
    rig.claim('campus')
    expect(rig.isOwned).toBe(true)
    // So the cursor lean waits out its idle delay again after the visit,
    // rather than leaning the moment the camera comes back.
    expect(rig.snapshot().secondsSinceNavigation).toBe(0)
    rig.release('campus')
    expect(rig.isOwned).toBe(false)
  })

  it('is born held, because the viewer is never its first owner', () => {
    // The city is built during the Earth intro. A rig that started free is one
    // whose seeding can be forgotten, and forgetting it is what let every drag
    // on the globe reach Murcia's targets through the shared canvas. Deny by
    // default turns that mistake into a camera that does not respond — loud,
    // and on the first frame — instead of a yaw that piles up unseen.
    const pose = resolveCameraPose(murciaConfig, ASPECT)
    const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far)
    const tuning = createDefaultCameraTuning(
      murciaConfig,
      pose.distance,
      pose.elevationDegrees,
      murciaConfig.navigation.bounds,
    )
    const fresh = new CameraRig(camera, pose, tuning)
    expect(fresh.isOwned).toBe(true)
    expect(fresh.claimList()).toEqual(['inactive'])
  })

  it('gives back only the name it was asked for', () => {
    // The hole the boolean left. Earth is showing AND the campus is flying;
    // the campus lands and hands back. Under one shared flag the rig came back
    // free with the globe still on screen, and the city started reading drags
    // meant for Earth.
    const { rig } = makeHeld()
    rig.claim('inactive')
    rig.claim('campus')
    rig.release('campus')
    expect(rig.isOwned).toBe(true)
    expect(rig.hasClaim('inactive')).toBe(true)
    expect(rig.hasClaim('campus')).toBe(false)
    rig.release('inactive')
    expect(rig.isOwned).toBe(false)
  })

  it('shrugs at a release nobody holds, and at a claim taken twice', () => {
    // Both happen for real: the campus camera reports `true` on dispose whether
    // or not it ever flew, and every campus flight claims rather than only the
    // first. Neither may move the camera or the idle clock.
    const { rig } = makeHeld()
    rig.release('blog')
    expect(rig.isOwned).toBe(false)

    rig.claim('campus')
    settle(rig, 1)
    const idled = rig.snapshot().secondsSinceNavigation
    expect(idled).toBeGreaterThan(0)
    // A second claim on top of one already held has moved nothing, so it must
    // not restart the lean's idle clock the way the first one does.
    rig.claim('campus')
    expect(rig.snapshot().secondsSinceNavigation).toBe(idled)
  })

  it('solves its own pose back out of a camera it left, exactly', () => {
    const { rig, camera } = makeHeld()
    rig.setYaw(40)
    settle(rig)
    const position = camera.position.clone()
    const focus = rig.focus.clone()
    const azimuth = rig.getAzimuthDegrees()

    // Another system flies away and back, writing the camera directly — and
    // the rig's own state is scrambled meanwhile, so only a real solve from
    // the camera can put it back.
    rig.claim('campus')
    rig.setFocus(-300, 200)
    rig.setYaw(-100)
    camera.position.copy(position)
    camera.lookAt(focus.x, rig.getEffectivePose().lookAtHeight, focus.z)
    rig.adoptFromCamera()
    rig.release('campus')
    settle(rig, 1)

    expect(camera.position.distanceTo(position)).toBeLessThan(1e-6)
    expect(rig.focus.distanceTo(focus)).toBeLessThan(1e-6)
    // Round the circle: atan2 hands back the principal angle.
    const turn = ((((rig.getAzimuthDegrees() - azimuth) % 360) + 540) % 360) - 180
    expect(Math.abs(turn)).toBeLessThan(1e-6)
    expect(rig.getYaw()).toBeCloseTo(rig.getAzimuthDegrees() - rig.getPose().azimuthDegrees, 9)
  })

  it('re-places the camera from its own state on setPose — why a held rig must not get one', () => {
    const { rig, camera } = makeHeld()
    settle(rig)
    rig.claim('campus')
    camera.position.set(-150, 60, 450)
    const parked = camera.position.clone()
    rig.setAspect(0.5)
    // The projection only; the camera stays where its owner put it.
    expect(camera.aspect).toBe(0.5)
    expect(camera.position.distanceTo(parked)).toBe(0)
    rig.setPose(resolveCameraPose(murciaConfig, 0.5))
    expect(camera.position.distanceTo(parked)).toBeGreaterThan(1)
  })
})

describe('the release throw', () => {
  /** How far the TARGET has moved from the rig's starting focus. */
  const travelled = (rig: CameraRig) => {
    const s = rig.snapshot()
    return Math.hypot(s.targetX - murciaConfig.initialFocus.x, s.targetZ - murciaConfig.initialFocus.z)
  }
  const run = (rig: CameraRig, seconds: number, hz = 60) => {
    for (let i = 0; i < seconds * hz; i += 1) rig.update(1 / hz)
  }

  it('coasts speed / friction viewport heights, the same ground a drag of that size covers', () => {
    const thrown = makeRig({ touchInertiaFriction: 5 })
    thrown.fling(1)
    expect(thrown.isCoasting).toBe(true)
    run(thrown, 4)
    expect(thrown.isCoasting).toBe(false)

    const dragged = makeRig()
    dragged.drag(0, 1 / 5)
    // Short by the tail cut off at the stop speed, 0.01/5 of a height.
    expect(travelled(thrown)).toBeGreaterThan(0)
    expect(Math.abs(travelled(thrown) - travelled(dragged))).toBeLessThan(0.02 * travelled(dragged))
  })

  it('coasts the same distance at 60Hz and 240Hz', () => {
    const slow = makeRig()
    slow.fling(1.5)
    run(slow, 4, 60)
    const fast = makeRig()
    fast.fling(1.5)
    run(fast, 4, 240)
    expect(Math.abs(travelled(slow) - travelled(fast))).toBeLessThan(0.01 * travelled(slow))
  })

  it('does not throw below the minimum speed, or with the carry turned off', () => {
    const slow = makeRig({ touchInertiaMinSpeed: 0.6 })
    slow.fling(0.5)
    expect(slow.isCoasting).toBe(false)

    const off = makeRig({ touchInertiaFriction: 0 })
    off.fling(3)
    expect(off.isCoasting).toBe(false)
  })

  it('caps the speed it carries', () => {
    const capped = makeRig({ touchInertiaMaxSpeed: 1 })
    capped.fling(50)
    run(capped, 4)
    const atCap = makeRig({ touchInertiaMaxSpeed: 1 })
    atCap.fling(1)
    run(atCap, 4)
    expect(travelled(capped)).toBeCloseTo(travelled(atCap), 9)
  })

  it('is dropped, not paused, when anything takes the camera', () => {
    const rig = makeRig()
    rig.fling(2)
    rig.claim('campus')
    expect(rig.isCoasting).toBe(false)
    rig.release('campus')
    const before = travelled(rig)
    run(rig, 2)
    expect(travelled(rig)).toBe(before)
  })

  it('is ended by a press and by anything that places the camera', () => {
    const pressed = makeRig()
    pressed.fling(2)
    pressed.stopFling()
    expect(pressed.isCoasting).toBe(false)

    const placed = makeRig()
    placed.fling(2)
    placed.setFocus(murciaConfig.initialFocus.x, murciaConfig.initialFocus.z)
    expect(placed.isCoasting).toBe(false)

    const flown = makeRig()
    flown.fling(2)
    flown.setNavigated({ yaw: 30 })
    expect(flown.isCoasting).toBe(false)
  })

  it('stops by itself against the bounds rather than pushing forever', () => {
    const rig = makeRig()
    // Straight at the edge, far past it: the carry has to end on the wall.
    rig.drag(0, 50)
    rig.fling(4)
    run(rig, 1)
    expect(rig.isCoasting).toBe(false)
  })
})