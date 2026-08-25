// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createSatelliteFocus } from './createSatelliteFocus'
import type { SatelliteDef } from '../orbit/orbitConfig'

// What the brand panel unfolds for.
//
// The satellite has TWO affordances and they read different state: the scale
// bump is on for hover OR selection, the panel unfolds only for selection. They
// are set from one loop over every satellite, which is also what makes the
// A-to-B handoff work — switching selection has to fold A and unfold B in the
// same pass, and a diff against the previous selection would leave A open.
//
// Driven through a real raycast against real meshes rather than by calling an
// exported helper: `select` is deliberately internal, and the thing worth
// pinning is that a CLICK produces this, not that a function does.

const VIEWPORT = { left: 0, top: 0, width: 800, height: 600 }

function def(id: string): SatelliteDef {
  return { id, name: id, label: id } as unknown as SatelliteDef
}

function setup() {
  const camera = new THREE.PerspectiveCamera(50, VIEWPORT.width / VIEWPORT.height, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const meshes = {
    a: new THREE.Mesh(geometry),
    b: new THREE.Mesh(geometry),
  }
  meshes.a.position.set(-1.2, 0, 0)
  meshes.b.position.set(1.2, 0, 0)
  meshes.a.updateMatrixWorld(true)
  meshes.b.updateMatrixWorld(true)

  const domElement = document.createElement('div')
  // jsdom lays nothing out, so every rect is zero and clientToNdc would divide
  // by it.
  domElement.getBoundingClientRect = () => VIEWPORT as DOMRect

  const expanded = vi.fn()
  const highlighted = vi.fn()
  const orbitSystem = {
    satellites: [
      { id: 'a', data: def('a'), object: meshes.a },
      { id: 'b', data: def('b'), object: meshes.b },
    ],
    isSatelliteActive: () => true,
    freezeSatellite: vi.fn(),
    resumeSatellite: vi.fn(),
    setSatelliteHighlight: highlighted,
    setSatelliteExpanded: expanded,
  }

  const cameraRig = {
    focusOn: vi.fn(),
    returnToOverview: vi.fn(),
    setOrbitEnabled: vi.fn(),
    isDragging: () => false,
    getDragDistance: () => 0,
    getDragClickThreshold: () => 8,
  }

  const focus = createSatelliteFocus({
    camera,
    domElement,
    orbitSystem: orbitSystem as never,
    cameraRig: cameraRig as never,
    cursor: { request: vi.fn() } as never,
    onSelect: vi.fn(),
    onDeselect: vi.fn(),
  })

  // The layer ignores clicks until the scene says it is interactive — the intro
  // and the warp transition both hold it off.
  focus.setEnabled(true)

  /** Clicks the centre of a satellite, in real viewport coordinates. */
  function clickOn(which: 'a' | 'b') {
    const ndc = meshes[which].position.clone().project(camera)
    const event = new MouseEvent('click', {
      clientX: ((ndc.x + 1) / 2) * VIEWPORT.width,
      clientY: ((1 - ndc.y) / 2) * VIEWPORT.height,
      bubbles: true,
    })
    domElement.dispatchEvent(event)
  }

  /** Moves the pointer over a satellite. Hover is resolved on the next update(). */
  function hoverOver(which: 'a' | 'b') {
    const ndc = meshes[which].position.clone().project(camera)
    window.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: ((ndc.x + 1) / 2) * VIEWPORT.width,
        clientY: ((1 - ndc.y) / 2) * VIEWPORT.height,
        bubbles: true,
      }),
    )
  }

  /** The last state pushed to each satellite by a spy. */
  const lastPerSatellite = (spy: typeof expanded) => () => {
    const state: Record<string, boolean> = {}
    for (const [id, on] of spy.mock.calls as Array<[string, boolean]>) state[id] = on
    return state
  }

  return {
    focus,
    clickOn,
    hoverOver,
    expanded,
    highlighted,
    expansionState: lastPerSatellite(expanded),
    highlightState: lastPerSatellite(highlighted),
    cameraRig,
  }
}

let harness: ReturnType<typeof setup>

beforeEach(() => {
  harness = setup()
})

describe('selecting a satellite', () => {
  it('unfolds only the one that was clicked', () => {
    harness.clickOn('a')
    expect(harness.expansionState()).toEqual({ a: true, b: false })
  })

  it('folds the previous one in the same pass as it unfolds the new one', () => {
    harness.clickOn('a')
    harness.expanded.mockClear()

    harness.clickOn('b')
    // Both are written, so A is never left open. Each panel then advances from
    // its own progress — A reverses from wherever its unfold had got to rather
    // than snapping shut. See panelExpansion.test.ts for that half.
    expect(harness.expansionState()).toEqual({ a: false, b: true })
  })

  it('folds everything on deselect', () => {
    harness.clickOn('a')
    harness.expanded.mockClear()

    harness.focus.deselect()
    expect(harness.expansionState()).toEqual({ a: false, b: false })
  })

  it('folds everything when the layer is disabled', () => {
    harness.clickOn('a')
    harness.expanded.mockClear()

    // The audit view and the warp transition both do this mid-flight.
    harness.focus.setEnabled(false)
    expect(harness.expansionState()).toEqual({ a: false, b: false })
  })
})

describe('hovering a satellite', () => {
  it('bumps its scale without unfolding the panel', () => {
    // Six satellites drift past a still cursor during the overview. If hover
    // unfolded them the panels would flap open and shut continuously, which is
    // why this reads `selectedId` while the scale bump reads both.
    harness.hoverOver('a')
    harness.expanded.mockClear()
    harness.highlighted.mockClear()
    harness.focus.update()

    // The bump is on for the hovered satellite...
    expect(harness.highlightState()).toMatchObject({ a: true, b: false })
    // ...and nothing was asked to unfold.
    expect(harness.expansionState()).toEqual({ a: false, b: false })
  })
})
