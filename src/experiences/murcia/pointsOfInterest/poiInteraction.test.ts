// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { PoiInteraction } from './poiInteraction'
import type { PoiId } from './poiConfig'
import type { CursorManager } from '../../../interaction/cursorManager'

// The points of interest's pointer. The dots are a stand-in that answers
// `dotAt` from a fixed table; the tower's screen and base are real meshes, so a
// tap on them is a real raycast.

const WIDTH = 1600
const HEIGHT = 900
const THRESHOLD = { mouse: 6, touch: 12 }

function makeFixture() {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON() {} }) as DOMRect
  document.body.append(canvas)

  const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT, 1, 1000)
  camera.position.set(0, 20, 100)
  camera.lookAt(0, 20, 0)
  camera.updateMatrixWorld(true)

  // The screen up the tower, the base at its foot.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), new THREE.MeshBasicMaterial())
  screen.position.set(0, 30, 0)
  const base = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshBasicMaterial())
  base.position.set(0, 3, 0)
  screen.updateMatrixWorld(true)
  base.updateMatrixWorld(true)
  const toClient = (world: THREE.Vector3) => {
    const p = world.clone().project(camera)
    return { x: ((p.x + 1) / 2) * WIDTH, y: ((1 - p.y) / 2) * HEIGHT }
  }

  const dots: Partial<Record<PoiId, { x: number; y: number }>> = {
    blog: { x: 100, y: 100 },
    conocenos: { x: 300, y: 100 },
  }
  const markers = {
    dotAt: vi.fn((x: number, y: number) => {
      for (const [id, at] of Object.entries(dots)) if (Math.hypot(at.x - x, at.y - y) < 18) return id as PoiId
      return null
    }),
    setPointed: vi.fn(),
  }
  const tower = { screen, base, setScreenHover: vi.fn(), setBaseHover: vi.fn() }
  const cursor = { request: vi.fn() }
  const activate = vi.fn()
  const state = { available: true, dragging: false }

  const interaction = new PoiInteraction({
    canvas,
    camera,
    cursor: cursor as unknown as CursorManager,
    isDragging: () => state.dragging,
    tapThresholdPx: THRESHOLD,
    markers,
    tower,
    available: () => state.available,
    activate,
  })

  const event = (type: string, x: number, y: number, pointerType = 'mouse') =>
    canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType, bubbles: true }))
  const tap = (x: number, y: number, pointerType = 'mouse') => {
    event('pointerdown', x, y, pointerType)
    event('pointerup', x, y, pointerType)
  }
  const hover = (x: number, y: number) => {
    event('pointermove', x, y)
    interaction.update()
  }

  return {
    interaction, canvas, markers, tower, cursor, activate, state, tap, event, hover,
    screenPoint: toClient(new THREE.Vector3(0, 30, 0)),
    basePoint: toClient(new THREE.Vector3(0, 3, 0)),
    dots,
  }
}

let fixture: ReturnType<typeof makeFixture>
afterEach(() => {
  fixture?.interaction.dispose()
  fixture?.canvas.remove()
})

describe('the points of interest pointer', () => {
  it('activates a clickable dot on a tap, and nothing for one with nowhere to go', () => {
    fixture = makeFixture()
    fixture.tap(102, 101)
    expect(fixture.activate).toHaveBeenCalledWith('blog')
    fixture.activate.mockClear()
    fixture.tap(300, 100)
    expect(fixture.activate).not.toHaveBeenCalled()
  })

  it('reads a pan as a pan, and taps nothing while the overview is not showing', () => {
    fixture = makeFixture()
    fixture.event('pointerdown', 100, 100)
    fixture.event('pointerup', 140, 100)
    fixture.state.available = false
    fixture.tap(100, 100)
    expect(fixture.activate).not.toHaveBeenCalled()
  })

  it('tells the tower screen from its base, and lights the one under the mouse', () => {
    fixture = makeFixture()
    const { screenPoint, basePoint } = fixture
    expect(fixture.interaction.surfaceAt(screenPoint.x, screenPoint.y)).toBe('anuncios')
    expect(fixture.interaction.surfaceAt(basePoint.x, basePoint.y)).toBe('conocenos')

    fixture.hover(basePoint.x, basePoint.y)
    expect(fixture.interaction.baseHovered).toBe(true)
    expect(fixture.tower.setBaseHover).toHaveBeenLastCalledWith(true)
    // Conócenos has nowhere to go yet, so the cursor does not promise one.
    expect(fixture.cursor.request).not.toHaveBeenCalledWith('marker:poi', 'pointer')

    fixture.hover(screenPoint.x, screenPoint.y)
    expect(fixture.interaction.screenHovered).toBe(true)
    expect(fixture.tower.setScreenHover).toHaveBeenLastCalledWith(true)
    expect(fixture.tower.setBaseHover).toHaveBeenLastCalledWith(false)
  })

  it('points the cursor at a clickable dot and names it to the markers', () => {
    fixture = makeFixture()
    fixture.hover(100, 100)
    expect(fixture.markers.setPointed).toHaveBeenLastCalledWith('blog')
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('marker:poi', 'pointer')
    fixture.hover(800, 800)
    expect(fixture.markers.setPointed).toHaveBeenLastCalledWith(null)
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('marker:poi', '')
  })

  it('stands every hover down when the overview goes', () => {
    fixture = makeFixture()
    fixture.hover(100, 100)
    fixture.state.available = false
    fixture.interaction.update()
    expect(fixture.markers.setPointed).toHaveBeenLastCalledWith(null)
    expect(fixture.cursor.request).toHaveBeenLastCalledWith('marker:poi', '')
  })
})
