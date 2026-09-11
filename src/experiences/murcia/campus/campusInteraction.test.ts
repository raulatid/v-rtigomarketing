// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { CampusInteraction, SWIPE_COMMIT_PX } from './campusInteraction'
import type { CampusStage } from './section/campusState'
import type { CursorManager } from '../../../interaction/cursorManager'

// The city's pointer and keyboard, routed into the section. A real camera and
// real meshes, so every tap is a real raycast; the section is a stand-in that
// records intents, because what the section does with them is the core's and
// is tested by `campusState.test.ts` and the harness.
//
// The water holds the lake AND a pool, the way the campus export does, so the
// reach rule — a hit counts only near the lake's centre — is exercised rather
// than assumed.

const WIDTH = 1600
const HEIGHT = 900
const THRESHOLD = { mouse: 6, touch: 12 }

interface Fixture {
  interaction: CampusInteraction
  canvas: HTMLCanvasElement
  container: HTMLElement
  section: {
    stage: CampusStage
    enter: ReturnType<typeof vi.fn>
    next: ReturnType<typeof vi.fn>
    previous: ReturnType<typeof vi.fn>
    back: ReturnType<typeof vi.fn>
  }
  cursor: { request: ReturnType<typeof vi.fn> }
  dragging: { value: boolean }
  lakePoint: { x: number; y: number }
  poolPoint: { x: number; y: number }
  press(x: number, y: number, o?: Pointer): void
  move(x: number, y: number, o?: Pointer): void
  release(x: number, y: number, o?: Pointer): void
  releaseOffCanvas(x: number, y: number, o?: Pointer): void
  tap(x: number, y: number, o?: Pointer): void
  key(key: string, target?: EventTarget): void
}

interface Pointer {
  pointerType?: 'mouse' | 'touch'
  pointerId?: number
}

let fixture: Fixture

function makeFixture(): Fixture {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON() {} }) as DOMRect
  container.appendChild(canvas)

  const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 1, 1000)
  camera.position.set(0, 120, 160)
  camera.lookAt(20, 0, 0)
  camera.updateMatrixWorld(true)

  // One water node, two bodies: the lake at the origin, a pool well outside
  // the lake's reach.
  const water = new THREE.Group()
  const disc = (x: number, radius: number) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial())
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0, 0)
    water.add(mesh)
  }
  disc(0, 10)
  disc(45, 6)
  water.updateMatrixWorld(true)

  const toClient = (world: THREE.Vector3) => {
    const p = world.clone().project(camera)
    return { x: ((p.x + 1) / 2) * WIDTH, y: ((1 - p.y) / 2) * HEIGHT }
  }

  const section = {
    stage: 'overview' as CampusStage,
    enter: vi.fn(() => {
      section.stage = 'intro'
      return true
    }),
    next: vi.fn(),
    previous: vi.fn(),
    back: vi.fn(),
  }
  const cursor = { request: vi.fn() }
  const dragging = { value: false }

  const interaction = new CampusInteraction({
    canvas,
    camera,
    cursor: cursor as unknown as CursorManager,
    isDragging: () => dragging.value,
    tapThresholdPx: THRESHOLD,
    lake: { mesh: water, center: new THREE.Vector3(0, 0, 0), radius: 10 },
    section,
    id: 'servicios',
  })

  const init = (x: number, y: number, o: Pointer = {}): PointerEventInit => ({
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: o.pointerId ?? 1,
    pointerType: o.pointerType ?? 'mouse',
    bubbles: true,
  })
  const press = (x: number, y: number, o?: Pointer) =>
    canvas.dispatchEvent(new PointerEvent('pointerdown', init(x, y, o)))
  const move = (x: number, y: number, o?: Pointer) =>
    canvas.dispatchEvent(new PointerEvent('pointermove', init(x, y, o)))
  const release = (x: number, y: number, o?: Pointer) =>
    canvas.dispatchEvent(new PointerEvent('pointerup', init(x, y, o)))
  const releaseOffCanvas = (x: number, y: number, o?: Pointer) =>
    container.dispatchEvent(new PointerEvent('pointerup', init(x, y, o)))

  return {
    interaction,
    canvas,
    container,
    section,
    cursor,
    dragging,
    lakePoint: toClient(new THREE.Vector3(0, 0, 0)),
    poolPoint: toClient(new THREE.Vector3(45, 0, 0)),
    press,
    move,
    release,
    releaseOffCanvas,
    tap: (x, y, o) => {
      press(x, y, o)
      release(x, y, o)
    },
    key: (key, target = window) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
  }
}

beforeEach(() => {
  fixture = makeFixture()
})

afterEach(() => {
  fixture.interaction.dispose()
  fixture.container.remove()
})

describe('entering from the overview', () => {
  it('enters on a tap on the lake', () => {
    const { lakePoint } = fixture
    fixture.tap(lakePoint.x, lakePoint.y)
    expect(fixture.section.enter).toHaveBeenCalledTimes(1)
  })

  it('does not enter from a pool the water node also holds', () => {
    fixture.tap(fixture.poolPoint.x, fixture.poolPoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
  })

  it('does not enter on the release of a drag that ends over the lake', () => {
    const { lakePoint } = fixture
    fixture.press(lakePoint.x - 40, lakePoint.y)
    fixture.release(lakePoint.x, lakePoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
  })

  it('does not enter while the city is being panned', () => {
    fixture.dragging.value = true
    fixture.tap(fixture.lakePoint.x, fixture.lakePoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
  })

  it('measures a finger against the touch threshold, where it landed', () => {
    const { lakePoint } = fixture
    const touch = { pointerType: 'touch' as const }
    // 10 px of roll: over the mouse's 6, inside the finger's 12.
    fixture.press(lakePoint.x, lakePoint.y, touch)
    fixture.release(lakePoint.x + 10, lakePoint.y, touch)
    expect(fixture.section.enter).toHaveBeenCalledTimes(1)
  })

  it('stops listening once disabled', () => {
    fixture.interaction.setEnabled(false)
    fixture.tap(fixture.lakePoint.x, fixture.lakePoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
  })

  it('still enters after a gesture that was disabled between its press and its release', () => {
    // Leaving Murcia on a phone is a pinch, so the city is switched off with
    // fingers still down. The release must end that sequence regardless.
    // The abandoned press lands AWAY from the lake: a ledger that kept it would
    // measure the later tap from there and call it a drag.
    const { lakePoint } = fixture
    fixture.press(lakePoint.x + 300, lakePoint.y)
    fixture.interaction.setEnabled(false)
    fixture.release(lakePoint.x + 300, lakePoint.y)
    fixture.interaction.setEnabled(true)
    fixture.tap(lakePoint.x, lakePoint.y)
    expect(fixture.section.enter).toHaveBeenCalledTimes(1)
  })

  it('still enters after a release that landed off the canvas', () => {
    const { lakePoint } = fixture
    fixture.press(lakePoint.x + 300, lakePoint.y)
    fixture.releaseOffCanvas(lakePoint.x + 300, lakePoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
    fixture.tap(lakePoint.x, lakePoint.y)
    expect(fixture.section.enter).toHaveBeenCalledTimes(1)
  })

  it('points at the lake on hover, and lets go of the cursor when it leaves', () => {
    const { lakePoint } = fixture
    fixture.move(lakePoint.x, lakePoint.y)
    fixture.interaction.update()
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('campus:servicios', 'pointer')
    fixture.move(5, 5)
    fixture.interaction.update()
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('campus:servicios', '')
  })
})

describe('inside the section', () => {
  beforeEach(() => {
    fixture.section.stage = 'intro'
  })

  it('steps once per horizontal swipe, left for the next service', () => {
    fixture.press(800, 450)
    fixture.move(800 - SWIPE_COMMIT_PX - 1, 452)
    fixture.move(200, 452)
    fixture.release(200, 452)
    expect(fixture.section.next).toHaveBeenCalledTimes(1)
    expect(fixture.section.previous).not.toHaveBeenCalled()

    fixture.press(800, 450)
    fixture.move(800 + SWIPE_COMMIT_PX + 1, 450)
    fixture.release(900, 450)
    expect(fixture.section.previous).toHaveBeenCalledTimes(1)
  })

  it('ignores a drag that is more vertical than sideways, or too short', () => {
    fixture.press(800, 450)
    fixture.move(700, 300)
    fixture.release(700, 300)
    fixture.press(800, 450)
    fixture.move(800 - SWIPE_COMMIT_PX + 5, 450)
    fixture.release(800 - SWIPE_COMMIT_PX + 5, 450)
    expect(fixture.section.next).not.toHaveBeenCalled()
    expect(fixture.section.previous).not.toHaveBeenCalled()
  })

  it('does not re-enter on a tap on the lake', () => {
    fixture.tap(fixture.lakePoint.x, fixture.lakePoint.y)
    expect(fixture.section.enter).not.toHaveBeenCalled()
  })

  it('pages with the arrow keys and goes back one level with Escape', () => {
    fixture.key('ArrowRight')
    fixture.key('ArrowLeft')
    fixture.key('Escape')
    expect(fixture.section.next).toHaveBeenCalledTimes(1)
    expect(fixture.section.previous).toHaveBeenCalledTimes(1)
    expect(fixture.section.back).toHaveBeenCalledTimes(1)
  })

  it('leaves keys typed into a field to the field', () => {
    const input = document.createElement('input')
    fixture.container.appendChild(input)
    fixture.key('ArrowRight', input)
    fixture.key('Escape', input)
    expect(fixture.section.next).not.toHaveBeenCalled()
    expect(fixture.section.back).not.toHaveBeenCalled()
  })

  it('is deaf to keys and swipes while disabled', () => {
    fixture.interaction.setEnabled(false)
    fixture.key('ArrowRight')
    fixture.press(800, 450)
    fixture.move(100, 450)
    expect(fixture.section.next).not.toHaveBeenCalled()
  })
})

describe('the overview', () => {
  it('ignores the section keys', () => {
    fixture.key('ArrowRight')
    fixture.key('Escape')
    expect(fixture.section.next).not.toHaveBeenCalled()
    expect(fixture.section.back).not.toHaveBeenCalled()
  })

  it('releases its cursor request when disposed', () => {
    fixture.interaction.dispose()
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('campus:servicios', '')
  })
})
