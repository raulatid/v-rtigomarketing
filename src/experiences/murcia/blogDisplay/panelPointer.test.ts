// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createPanelPointer } from './panelPointer'
import type { PanelPointer } from './panelPointer'
import type { CursorManager } from '../../../interaction/cursorManager'

// Since plan 022 this is the ONLY listener over the blog's part of the city, and the
// only way into the blog from it. So the properties below are not defence in depth —
// each one is the sole thing standing between an ordinary gesture and a three-second
// flight the visitor did not ask for.

const WIDTH = 800
const HEIGHT = 600
const CORE_INSET = 0.84

interface Fixture {
  pointer: PanelPointer
  canvas: HTMLCanvasElement
  onActivate: ReturnType<typeof vi.fn>
  cursorRequest: ReturnType<typeof vi.fn>
  onHoverChange: ReturnType<typeof vi.fn>
  /** Mutable, read live through `blocked()` and `isBusy()`. */
  state: { blocked: boolean; busy: boolean }
  /** Client coordinates of the panel's centre, and of a point in its dead margin. */
  centre: { x: number; y: number }
  margin: { x: number; y: number }
  /** A building of the cluster, beside the panel rather than behind it. */
  building: { x: number; y: number }
  press: (x: number, y: number, pointerType?: string) => void
  release: (x: number, y: number, pointerType?: string) => void
  move: (x: number, y: number) => void
}

function makeFixture(): Fixture {
  // jsdom reports no media queries at all, and `hoverSupported` is read ONCE at
  // construction — so without this the hover half of the module is unreachable and
  // every assertion about it would be asserting that nothing happens.
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query === '(hover: hover)' }) as MediaQueryList,
  )

  // The real panel's shape: a plane wearing a material that carries the inset the
  // hit test reads. No shader compiles here and none is needed — `uCoreInset` is
  // read as a uniform value, which is exactly how the shipped code reads it.
  const material = new THREE.ShaderMaterial({ uniforms: { uCoreInset: { value: CORE_INSET } } })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), material)
  panel.updateWorldMatrix(true, true)

  const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 1, 1000)
  camera.position.set(0, 0, 120)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
    }) as DOMRect

  const cursorRequest = vi.fn()
  const cursor = { request: cursorRequest, dispose: vi.fn() } as unknown as CursorManager
  const state = { blocked: false, busy: false }
  const onActivate = vi.fn()
  const onHoverChange = vi.fn()

  // Clear of the margin point at x = 22, so the margin tests still mean the margin.
  const building = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial())
  building.position.set(40, 0, 0)
  building.updateMatrixWorld(true)

  const pointer = createPanelPointer({
    canvas,
    camera,
    panel,
    buildings: [building],
    onHoverChange,
    cursor,
    tapThresholdPx: { mouse: 6, touch: 12 },
    blocked: () => state.blocked,
    isBusy: () => state.busy,
    onActivate,
  })
  pointer.setEnabled(true)

  const project = (local: THREE.Vector3): { x: number; y: number } => {
    const p = local.clone().project(camera)
    return { x: ((p.x + 1) / 2) * WIDTH, y: ((1 - p.y) / 2) * HEIGHT }
  }

  const centre = project(new THREE.Vector3(0, 0, 0))
  // Inside the plane but OUTSIDE the readable core: the plane is 48 wide and the
  // core is 48 * 0.84, so anything past 20.16 from the centre is transparent ring.
  const margin = project(new THREE.Vector3(22, 0, 0))

  const init = (x: number, y: number, pointerType: string): PointerEventInit => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType,
    bubbles: true,
  })
  const press = (x: number, y: number, pointerType = 'mouse') =>
    canvas.dispatchEvent(new PointerEvent('pointerdown', init(x, y, pointerType)))
  const release = (x: number, y: number, pointerType = 'mouse') =>
    canvas.dispatchEvent(new PointerEvent('pointerup', init(x, y, pointerType)))
  const move = (x: number, y: number) =>
    canvas.dispatchEvent(new PointerEvent('pointermove', init(x, y, 'mouse')))

  return {
    pointer,
    canvas,
    onActivate,
    cursorRequest,
    onHoverChange,
    state,
    centre,
    margin,
    building: project(new THREE.Vector3(40, 0, 5)),
    press,
    release,
    move,
  }
}

describe('the blog panel pointer', () => {
  let f: Fixture

  beforeEach(() => {
    f = makeFixture()
  })

  afterEach(() => {
    f.pointer.dispose()
    f.canvas.remove()
    vi.unstubAllGlobals()
  })

  it('starts the approach on a clean tap on the readable core', () => {
    f.press(f.centre.x, f.centre.y)
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).toHaveBeenCalledTimes(1)
  })

  it('ignores the transparent margin outside the core', () => {
    // The plane runs wider than the page it carries. Treating that ring as target
    // would put a three-second flight on empty air beside the display.
    f.press(f.margin.x, f.margin.y)
    f.release(f.margin.x, f.margin.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('refuses a gesture that started while something else held attention', () => {
    // The district's display sits over the same canvas and its close is tapped. The
    // district handles the release first and lets go SYNCHRONOUSLY, so by the time
    // this listener runs nothing is blocking any more — and the tap that closed the
    // display would fly the visitor into the blog. The press remembers what was
    // true when it began.
    f.state.blocked = true
    f.press(f.centre.x, f.centre.y)
    f.state.blocked = false
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('refuses when attention is taken between press and release', () => {
    f.press(f.centre.x, f.centre.y)
    f.state.blocked = true
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('refuses while a flight already owns the camera', () => {
    f.state.busy = true
    f.press(f.centre.x, f.centre.y)
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('does not fire on a drag that begins and ends over the panel', () => {
    // Murcia is a free pan, so this is the COMMON case and not an edge case:
    // starting a navigation because someone finished panning over the display would
    // be the worst bug this file could have.
    f.press(f.centre.x, f.centre.y)
    f.release(f.centre.x + 40, f.centre.y + 12)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('allows a finger more slop than a mouse', () => {
    // The same thresholds the district and the drag controller use, so one gesture
    // reads the same everywhere.
    f.press(f.centre.x, f.centre.y, 'touch')
    f.release(f.centre.x + 9, f.centre.y, 'touch')
    expect(f.onActivate).toHaveBeenCalledTimes(1)

    f.press(f.centre.x, f.centre.y, 'mouse')
    f.release(f.centre.x + 9, f.centre.y, 'mouse')
    expect(f.onActivate).toHaveBeenCalledTimes(1)
  })

  it('needs BOTH ends of the gesture on the core', () => {
    // Requiring only the release would let a drag that starts on the sky and ends on
    // the display fire it.
    f.press(f.margin.x, f.margin.y)
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('is inert while disabled', () => {
    f.pointer.setEnabled(false)
    f.press(f.centre.x, f.centre.y)
    f.release(f.centre.x, f.centre.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('publishes its hover through the cursor manager, never the canvas style', () => {
    // A direct `canvas.style.cursor` write is discarded while the custom cursor is
    // mounted, because that sets `cursor: none` on everything (DECISIONS §14).
    f.move(f.centre.x, f.centre.y)
    f.pointer.update()
    expect(f.cursorRequest).toHaveBeenLastCalledWith('murcia:blog-display', 'pointer')
    expect(f.canvas.style.cursor).toBe('')
  })

  it('withholds the hint over the transparent margin', () => {
    f.move(f.margin.x, f.margin.y)
    f.pointer.update()
    expect(f.cursorRequest).not.toHaveBeenCalledWith('murcia:blog-display', 'pointer')
  })

  it('resolves hover once a frame, not once an event', () => {
    // A raycast per pointermove is a raycast at the pointer's full rate, and the
    // answer is only ever consumed once a frame.
    f.move(f.centre.x, f.centre.y)
    expect(f.cursorRequest).not.toHaveBeenCalled()
    f.pointer.update()
    expect(f.cursorRequest).toHaveBeenCalledTimes(1)
  })

  it('drops the hint when it is disabled mid-hover', () => {
    f.move(f.centre.x, f.centre.y)
    f.pointer.update()
    f.pointer.setEnabled(false)
    expect(f.cursorRequest).toHaveBeenLastCalledWith('murcia:blog-display', '')
  })

  it('drops the hint while a flight owns the camera', () => {
    // Nothing is clickable during the approach, so nothing may look clickable.
    f.move(f.centre.x, f.centre.y)
    f.pointer.update()
    f.state.busy = true
    f.pointer.update()
    expect(f.cursorRequest).toHaveBeenLastCalledWith('murcia:blog-display', '')
  })

  it('lets go of the cursor hint on dispose', () => {
    f.move(f.centre.x, f.centre.y)
    f.pointer.update()
    f.pointer.dispose()
    expect(f.cursorRequest).toHaveBeenLastCalledWith('murcia:blog-display', '')
  })

  it('starts the same approach on a clean tap on the building', () => {
    f.press(f.building.x, f.building.y)
    f.release(f.building.x, f.building.y)
    expect(f.onActivate).toHaveBeenCalledTimes(1)
  })

  it('does not fire on a drag that ends over the building', () => {
    f.press(f.building.x - 40, f.building.y)
    f.release(f.building.x, f.building.y)
    expect(f.onActivate).not.toHaveBeenCalled()
  })

  it('lights the cluster while the pointer is over the panel or the building', () => {
    f.move(f.building.x, f.building.y)
    f.pointer.update()
    expect(f.onHoverChange).toHaveBeenLastCalledWith(true)
    expect(f.cursorRequest).toHaveBeenLastCalledWith('murcia:blog-display', 'pointer')

    f.move(f.margin.x, f.margin.y)
    f.pointer.update()
    expect(f.onHoverChange).toHaveBeenLastCalledWith(false)

    f.move(f.centre.x, f.centre.y)
    f.pointer.update()
    expect(f.onHoverChange).toHaveBeenLastCalledWith(true)
  })

  it('puts the light out while a flight owns the camera', () => {
    f.move(f.building.x, f.building.y)
    f.pointer.update()
    f.state.busy = true
    f.pointer.update()
    expect(f.onHoverChange).toHaveBeenLastCalledWith(false)
  })
})
