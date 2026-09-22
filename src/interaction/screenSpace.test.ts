import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { clientToNdc, projectToClient, worldToClient } from './screenSpace'

const RECT = { left: 0, top: 0, width: 800, height: 600 }

/**
 * A camera at the origin looking down -Z, which is three.js's own default
 * orientation. Every world point below is therefore read as "in front of the
 * viewer" at negative Z and "behind" at positive.
 */
function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, RECT.width / RECT.height, 0.1, 1000)
  cam.position.set(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

describe('projecting a world point to the screen', () => {
  it('puts a point straight ahead in the middle of the canvas', () => {
    const out = new THREE.Vector3()
    const point = worldToClient(RECT, camera(), new THREE.Vector3(0, 0, -10), out)
    expect(point).not.toBeNull()
    expect(point!.x).toBeCloseTo(400, 4)
    expect(point!.y).toBeCloseTo(300, 4)
  })

  it('offsets by the rect, so a canvas that is not at the origin still lands', () => {
    const out = new THREE.Vector3()
    const inset = { left: 40, top: 25, width: 800, height: 600 }
    const point = worldToClient(inset, camera(), new THREE.Vector3(0, 0, -10), out)
    expect(point!.x).toBeCloseTo(440, 4)
    expect(point!.y).toBeCloseTo(325, 4)
  })

  it('flips Y and does not flip X', () => {
    // The asymmetry `clientToNdc` exists to state once. A point up and to the
    // right in the world is up and to the right on screen, which in client
    // coordinates means a LARGER x and a SMALLER y.
    const out = new THREE.Vector3()
    const point = worldToClient(RECT, camera(), new THREE.Vector3(1, 1, -10), out)
    expect(point!.x).toBeGreaterThan(400)
    expect(point!.y).toBeLessThan(300)
  })

  it('refuses a point behind the camera rather than mirroring it', () => {
    // The trap this guard exists for: `project` divides by w, and w is negative
    // behind the camera, so x and y come back negated. Without the z test a
    // target at the viewer's back reports a plausible position on the opposite
    // side of the screen, and whatever is pinned to it points at nothing.
    const out = new THREE.Vector3()
    expect(worldToClient(RECT, camera(), new THREE.Vector3(0, 0, 10), out)).toBeNull()
  })

  it('refuses a point outside the frustum on every side', () => {
    const cam = camera()
    const out = new THREE.Vector3()
    // Close to the camera and far off-axis: well outside a 50° frustum.
    for (const world of [
      new THREE.Vector3(-40, 0, -1),
      new THREE.Vector3(40, 0, -1),
      new THREE.Vector3(0, -40, -1),
      new THREE.Vector3(0, 40, -1),
    ]) {
      expect(worldToClient(RECT, cam, world, out), world.toArray().join(',')).toBeNull()
    }
  })

  it('refuses a point beyond the far plane', () => {
    const out = new THREE.Vector3()
    expect(worldToClient(RECT, camera(), new THREE.Vector3(0, 0, -5000), out)).toBeNull()
  })

  it('refuses a canvas with no area, rather than dividing by zero', () => {
    const out = new THREE.Vector3()
    const collapsed = { left: 0, top: 0, width: 0, height: 0 }
    expect(worldToClient(collapsed, camera(), new THREE.Vector3(0, 0, -10), out)).toBeNull()
  })

  it('round-trips through clientToNdc, which is the other direction', () => {
    // The two are inverses over the visible region, and this is what says so.
    // A picker and a pin that disagree about the Y flip would each look right
    // near the centre of the screen and diverge towards the edges.
    const cam = camera()
    const out = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    for (const world of [
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(2, 1, -12),
      new THREE.Vector3(-3, -2, -20),
    ]) {
      const point = worldToClient(RECT, cam, world, out)
      expect(point).not.toBeNull()
      clientToNdc(RECT, point!.x, point!.y, ndc)

      const expected = world.clone().project(cam)
      expect(ndc.x).toBeCloseTo(expected.x, 6)
      expect(ndc.y).toBeCloseTo(expected.y, 6)
    }
  })
})

describe('projecting a world point to the screen without the frustum guard', () => {
  it('agrees with the guarded projection for a point on screen', () => {
    const guarded = worldToClient(RECT, camera(), new THREE.Vector3(1, 1, -10), new THREE.Vector3())
    const direction = projectToClient(RECT, camera(), new THREE.Vector3(1, 1, -10), new THREE.Vector3())
    expect(direction).not.toBeNull()
    expect(direction!.x).toBeCloseTo(guarded!.x, 6)
    expect(direction!.y).toBeCloseTo(guarded!.y, 6)
  })

  it('still answers for a point that has slid off the side, past the rect', () => {
    const point = projectToClient(RECT, camera(), new THREE.Vector3(-30, 0, -10), new THREE.Vector3())
    expect(point).not.toBeNull()
    expect(point!.x).toBeLessThan(RECT.left)
    expect(point!.y).toBeCloseTo(300, 4)
  })

  it('answers null for a point behind the camera, which would project mirrored', () => {
    expect(projectToClient(RECT, camera(), new THREE.Vector3(0, 0, 10), new THREE.Vector3())).toBeNull()
  })
})
