import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SCREEN_FILL, createTowerFocus, solveScreenView } from './towerFocus'
import type { ScreenFrame } from './towerTargets'

// A tall narrow screen facing +X, like the tower's: 11 wide, 47 tall.
const FRAME: ScreenFrame = {
  centre: new THREE.Vector3(-294, 36, 311),
  normal: new THREE.Vector3(1, 0, 0),
  height: 47,
  width: 11,
}

function camera(aspect = 16 / 9): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(35, aspect, 5, 3500)
  c.position.set(-100, 160, 300)
  c.lookAt(-290, 0, 310)
  c.updateMatrixWorld(true)
  return c
}

function setup(options: { claim?: boolean; reducedMotion?: boolean } = {}) {
  const cam = camera()
  const host = { claim: vi.fn(() => options.claim ?? true), release: vi.fn() }
  const onEngagedChange = vi.fn()
  const focus = createTowerFocus({ camera: cam, frame: FRAME, host, reducedMotion: options.reducedMotion ?? false, onEngagedChange })
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) focus.update(1 / 60)
  }
  return { cam, host, focus, run, onEngagedChange }
}

describe('where to stand before the screen', () => {
  it('fills the view on the screen height on a wide viewport, square in front of it', () => {
    const { position, target } = solveScreenView(FRAME, 35, 16 / 9)
    const distance = position.distanceTo(FRAME.centre)
    // The screen's height over the visible height at that distance is the fill.
    const visible = 2 * distance * Math.tan(THREE.MathUtils.degToRad(35) / 2)
    expect(FRAME.height / visible).toBeCloseTo(SCREEN_FILL)
    expect(position.y).toBeCloseTo(FRAME.centre.y)
    expect(position.x).toBeGreaterThan(FRAME.centre.x)
    expect(target.equals(FRAME.centre)).toBe(true)
  })

  it('stands back further when the width is what binds', () => {
    const wide = { ...FRAME, width: 60 }
    const byWidth = solveScreenView(wide, 35, 0.5).position.distanceTo(wide.centre)
    const byHeight = solveScreenView(wide, 35, 16 / 9).position.distanceTo(wide.centre)
    expect(byWidth).toBeGreaterThan(byHeight)
  })
})

describe('the flight to the screen', () => {
  it('claims, lands facing the screen, and holds', () => {
    const { cam, host, focus, run, onEngagedChange } = setup()
    expect(focus.enter()).toBe(true)
    expect(host.claim).toHaveBeenCalledTimes(1)
    expect(focus.isEngaged).toBe(true)
    expect(onEngagedChange).toHaveBeenCalledTimes(1)
    run(2)
    expect(focus.isHeld).toBe(true)
    const forward = cam.getWorldDirection(new THREE.Vector3())
    expect(forward.x).toBeCloseTo(-1)
    expect(cam.position.y).toBeCloseTo(FRAME.centre.y)
    expect(host.release).not.toHaveBeenCalled()
  })

  it('returns to exactly the pose it left, then hands the camera back once', () => {
    const { cam, host, focus, run, onEngagedChange } = setup()
    const position = cam.position.clone()
    const quaternion = cam.quaternion.clone()
    focus.enter()
    run(2)
    focus.exit()
    run(2)
    expect(cam.position.equals(position)).toBe(true)
    expect(cam.quaternion.equals(quaternion)).toBe(true)
    expect(host.release).toHaveBeenCalledTimes(1)
    expect(focus.isEngaged).toBe(false)
    expect(onEngagedChange).toHaveBeenCalledTimes(2)
  })

  it('turns back mid-flight to where it came from', () => {
    const { cam, host, focus, run } = setup()
    const position = cam.position.clone()
    focus.enter()
    run(0.5)
    focus.exit()
    run(2)
    expect(cam.position.equals(position)).toBe(true)
    expect(host.release).toHaveBeenCalledTimes(1)
  })

  it('takes nothing when the camera is someone else’s, and leaves nothing it never entered', () => {
    const { host, focus } = setup({ claim: false })
    expect(focus.enter()).toBe(false)
    expect(focus.isEngaged).toBe(false)
    focus.exit()
    focus.update(1)
    expect(host.release).not.toHaveBeenCalled()
  })

  it('refuses a second entry while engaged', () => {
    const { host, focus } = setup()
    focus.enter()
    expect(focus.enter()).toBe(false)
    expect(host.claim).toHaveBeenCalledTimes(1)
  })

  it('cuts short under reduced motion', () => {
    const { focus, run } = setup({ reducedMotion: true })
    focus.enter()
    run(0.2)
    expect(focus.isHeld).toBe(true)
  })

  it('reframes the screen at once when the viewport turns while held', () => {
    const { cam, focus, run } = setup()
    focus.enter()
    run(2)
    const before = cam.position.distanceTo(FRAME.centre)
    cam.aspect = 0.2
    focus.setViewport(0.2)
    expect(cam.position.distanceTo(FRAME.centre)).toBeGreaterThan(before)
  })
})
