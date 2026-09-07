// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { BLOG_BUILDING_NODE_NAMES, createBlogBuilding } from './BlogBuilding'
import type { BlogBuilding } from './BlogBuilding'
import type { CursorManager } from '../../../interaction/cursorManager'

// The blog's entry point shares a canvas and a `pointerup` with the district's
// display. What is under test is the one thing that pairing can get wrong: a
// release that the district has already spent must not ALSO open the blog.

const WIDTH = 800
const HEIGHT = 600

interface Fixture {
  building: BlogBuilding
  canvas: HTMLCanvasElement
  onActivate: ReturnType<typeof vi.fn>
  /** Mutable, read live by the building through `blocked()`. */
  attention: { blocked: boolean }
  /** Client coordinates of the cluster's centre. */
  point: { x: number; y: number }
  press: (x: number, y: number, pointerType?: string) => void
  release: (x: number, y: number, pointerType?: string) => void
}

function makeFixture(): Fixture {
  const root = new THREE.Object3D()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial())
  mesh.name = BLOG_BUILDING_NODE_NAMES[0]
  root.add(mesh)
  root.updateWorldMatrix(true, true)

  const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 1, 1000)
  camera.position.set(0, 0, 200)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0 }) as DOMRect

  const cursor = { request: vi.fn(), dispose: vi.fn() } as unknown as CursorManager
  const attention = { blocked: false }
  const onActivate = vi.fn()
  const building = createBlogBuilding({
    root,
    camera,
    canvas,
    cursor,
    tapThresholdPx: { mouse: 6, touch: 12 },
    blocked: () => attention.blocked,
    onActivate,
  })
  if (!building) throw new Error('the fixture city has no blog cluster')
  building.setEnabled(true)

  const projected = new THREE.Vector3(0, 0, 0).project(camera)
  const point = { x: ((projected.x + 1) / 2) * WIDTH, y: ((1 - projected.y) / 2) * HEIGHT }

  const init = (x: number, y: number, pointerType: string): PointerEventInit => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType,
    bubbles: true,
  })
  const press = (x: number, y: number, pointerType = 'touch') =>
    canvas.dispatchEvent(new PointerEvent('pointerdown', init(x, y, pointerType)))
  const release = (x: number, y: number, pointerType = 'touch') =>
    canvas.dispatchEvent(new PointerEvent('pointerup', init(x, y, pointerType)))

  return { building, canvas, onActivate, attention, point, press, release }
}

describe('the blog building', () => {
  let f: Fixture

  beforeEach(() => {
    f = makeFixture()
  })

  afterEach(() => {
    f.building.dispose()
    f.canvas.remove()
  })

  it('opens on a clean tap on the cluster', () => {
    f.press(f.point.x, f.point.y)
    f.release(f.point.x, f.point.y)
    expect(f.onActivate).toHaveBeenCalledTimes(1)
  })

  it('does not open from a press that began while something else held attention', () => {
    // The district's display is over the cluster and its close is tapped. The
    // district handles the release first and lets go SYNCHRONOUSLY, so by the
    // time this building sees the same release nothing is blocking any more —
    // and the tap that closed the display would open the blog. The press
    // remembers what was true when it began.
    f.attention.blocked = true
    f.press(f.point.x, f.point.y)
    f.attention.blocked = false
    f.release(f.point.x, f.point.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('does not open when attention is taken between press and release', () => {
    f.press(f.point.x, f.point.y)
    f.attention.blocked = true
    f.release(f.point.x, f.point.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('opens again on the next clean tap after a spent one', () => {
    f.attention.blocked = true
    f.press(f.point.x, f.point.y)
    f.attention.blocked = false
    f.release(f.point.x, f.point.y)
    f.press(f.point.x, f.point.y)
    f.release(f.point.x, f.point.y)
    expect(f.onActivate).toHaveBeenCalledTimes(1)
  })
})
