// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createSatelliteFocus } from './createSatelliteFocus'
import { ORBIT_CONFIG } from '../orbit/orbitConfig'
import type { SatelliteDef } from '../orbit/orbitConfig'

// What the brand panel unfolds for.
//
// The satellite has THREE affordances and they read different state: the scale
// bump is on for hover OR selection, the panel unfolds only for selection, and
// the invitation — one satellite's halo breathing brighter so the overview says
// "these are clickable" — is on for the invited satellite while it is neither
// hovered nor selected, until any satellite has been selected once. They are
// set from one loop over every satellite, which is also what makes the A-to-B
// handoff work — switching selection has to fold A and unfold B in the same
// pass, and a diff against the previous selection would leave A open.
//
// Driven through a real raycast against real meshes rather than by calling an
// exported helper: `select` is deliberately internal, and the thing worth
// pinning is that a CLICK produces this, not that a function does.

const VIEWPORT = { left: 0, top: 0, width: 800, height: 600 }

function def(id: string): SatelliteDef {
  return { id, name: id, label: id } as unknown as SatelliteDef
}

/**
 * The tutorial's timings, shortened so a sequence fits in a few dozen frames.
 * Proportions kept — the cue still leads the hover — so what is asserted is
 * the order and the count, which is what the shipped config's own test pins.
 */
const QUICK_TUTORIAL = {
  ...ORBIT_CONFIG.tutorial,
  armDelay: 0.1,
  hold: 0.1,
  gap: 0.1,
  roundGap: 0.3,
  cueDuration: 0.1,
  cueLead: 0.05,
}

interface SetupOptions {
  reducedMotion?: boolean
}

function setup({ reducedMotion = false }: SetupOptions = {}) {
  const camera = new THREE.PerspectiveCamera(50, VIEWPORT.width / VIEWPORT.height, 0.1, 100)
  camera.position.set(0, 0, 7)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  // Outside the Earth's occluder radius (EARTH_CONFIG.radius × 1.04 ≈ 2.08 at
  // the origin) and inside the frame with the tutorial's margin — so the
  // tutorial's visibility test, which runs against these same meshes, sees
  // them the way it sees a satellite in front of the planet.
  const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6)
  const meshes = {
    a: new THREE.Mesh(geometry),
    b: new THREE.Mesh(geometry),
  }
  meshes.a.position.set(-2.6, 0, 0)
  meshes.b.position.set(2.6, 0, 0)
  meshes.a.updateMatrixWorld(true)
  meshes.b.updateMatrixWorld(true)

  const domElement = document.createElement('div')
  // jsdom lays nothing out, so every rect is zero and clientToNdc would divide
  // by it.
  domElement.getBoundingClientRect = () => VIEWPORT as DOMRect

  const expanded = vi.fn()
  const highlighted = vi.fn()
  const invited = vi.fn()
  const cue = vi.fn()
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
    setSatelliteInvited: invited,
    setSatelliteCue: cue,
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
    invitedId: 'a',
    onSelect: vi.fn(),
    onDeselect: vi.fn(),
    reducedMotion,
    tutorial: QUICK_TUTORIAL,
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

  /** Runs `seconds` of frames through the focus, at 60 Hz. */
  function run(seconds: number) {
    const dt = 1 / 60
    for (let t = 0; t < seconds; t += dt) focus.update(dt)
  }

  /** Runs frames until the predicate holds, or fails after `seconds`. */
  function runUntil(predicate: () => boolean, seconds = 5) {
    const dt = 1 / 60
    for (let t = 0; t < seconds; t += dt) {
      focus.update(dt)
      if (predicate()) return
    }
    throw new Error('the condition never held')
  }

  /** How many times a satellite's highlight was switched ON — applyHighlights only pushes changes. */
  const risesOf = (id: string) =>
    (highlighted.mock.calls as Array<[string, boolean]>).filter(([i, on]) => i === id && on).length

  /** The cue progress values pushed for a satellite, in order. */
  const cuesOf = (id: string) =>
    (cue.mock.calls as Array<[string, number | null]>).filter(([i]) => i === id).map(([, p]) => p)

  return {
    focus,
    meshes,
    clickOn,
    hoverOver,
    expanded,
    highlighted,
    invited,
    cue,
    expansionState: lastPerSatellite(expanded),
    highlightState: lastPerSatellite(highlighted),
    invitationState: lastPerSatellite(invited),
    cameraRig,
    run,
    runUntil,
    risesOf,
    cuesOf,
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

describe('the invitation', () => {
  it('is pushed to the invited satellite the moment the layer is enabled', () => {
    // The intro holds the layer off; the pulse must not wait for the first
    // pointer event to reach the scene.
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })

  it('yields to the hover bump and returns when the pointer leaves', () => {
    harness.hoverOver('a')
    harness.focus.update()
    expect(harness.invitationState()).toEqual({ a: false, b: false })

    harness.hoverOver('b')
    harness.focus.update()
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })

  it('retires for the visit once any satellite is selected', () => {
    harness.clickOn('b')
    expect(harness.invitationState()).toEqual({ a: false, b: false })

    harness.invited.mockClear()
    harness.focus.deselect()
    // The lesson is over: the viewer has found a satellite.
    expect(harness.invitationState()).toEqual({ a: false, b: false })
  })

  it('is off while the layer is disabled and back when it is re-enabled', () => {
    harness.focus.setEnabled(false)
    expect(harness.invitationState()).toEqual({ a: false, b: false })

    harness.invited.mockClear()
    harness.focus.setEnabled(true)
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })
})

describe('the hover tutorial', () => {
  // The invited satellite auto-plays the REAL hover state — the same
  // `setSatelliteHighlight` the pointer drives, through the same pass — in
  // rounds of two, each pulse announced by the particle cue, repeating until
  // the viewer interacts. It is a third writer of the hover state, not an
  // animation, which is why it is asserted through the same spies as the
  // pointer's hover above.

  it('plays the real hover state on the invited satellite, two pulses to a round', () => {
    harness.highlighted.mockClear()
    // One round: the arming beat plus two pulses, stopping inside the round gap.
    harness.run(0.1 + 2 * (0.05 + 0.1 + 0.1) + 0.05)

    expect(harness.risesOf('a')).toBe(2)
    expect(harness.risesOf('b')).toBe(0)
    expect(harness.focus.tutorialPulses).toBe(2)
    // At rest between rounds: the bump released, the cue hidden, the invitation back.
    expect(harness.highlightState()).toEqual({ a: false, b: false })
    expect(harness.cuesOf('a').at(-1)).toBeNull()
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })

  it('keeps offering, round after round, while the viewer does nothing', () => {
    harness.run(3)
    expect(harness.focus.tutorialPulses).toBeGreaterThanOrEqual(6)
    expect(harness.focus.tutorialPhase).not.toBe('done')
  })

  it('announces each pulse with the cue before the satellite responds', () => {
    harness.highlighted.mockClear()
    harness.run(2)

    const cues = harness.cuesOf('a')
    // Real progress values arrived, and they climb within a pulse.
    const progress = cues.filter((p): p is number => p !== null)
    expect(progress.length).toBeGreaterThan(2)
    expect(Math.max(...progress)).toBeLessThanOrEqual(1)
    // The first cue write precedes the first synthetic hover.
    const firstCueOrder = harness.cue.mock.invocationCallOrder[0]!
    const firstRise = (harness.highlighted.mock.calls as Array<[string, boolean]>).findIndex(
      ([id, on]) => id === 'a' && on,
    )
    const firstRiseOrder = harness.highlighted.mock.invocationCallOrder[firstRise]!
    expect(firstCueOrder).toBeLessThan(firstRiseOrder)
  })

  it('takes the invitation away while it holds, as a real hover does', () => {
    harness.runUntil(() => harness.highlightState().a === true)
    expect(harness.invitationState()).toEqual({ a: false, b: false })
    harness.runUntil(() => harness.highlightState().a === false)
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })

  it('yields to a real hover on another satellite, and never comes back', () => {
    harness.runUntil(() => harness.highlightState().a === true)

    harness.hoverOver('b')
    harness.focus.update(1 / 60)
    // B is the pointer's; A's demo let go on the same pass.
    expect(harness.highlightState()).toEqual({ a: false, b: true })
    expect(harness.cuesOf('a').at(-1)).toBeNull()
    expect(harness.focus.tutorialPhase).toBe('done')

    harness.highlighted.mockClear()
    harness.hoverOver('a')
    harness.run(2)
    // Only the pointer lights A now — one rise, the pointer's, not the tutorial's.
    expect(harness.risesOf('a')).toBe(1)
  })

  it('retires the moment any satellite is selected', () => {
    harness.clickOn('b')
    expect(harness.focus.tutorialPhase).toBe('done')

    harness.focus.deselect()
    harness.highlighted.mockClear()
    harness.run(2)
    expect(harness.risesOf('a')).toBe(0)
    expect(harness.cue).not.toHaveBeenCalled()
  })

  it('resumes after a trip out of the scene, which is not an interaction', () => {
    harness.run(1)
    expect(harness.focus.tutorialPulses).toBeGreaterThan(0)

    // The trip to Murcia and back, or the audit panel. Someone who never found
    // the satellites is owed the offer again.
    harness.focus.setEnabled(false)
    harness.focus.setEnabled(true)
    harness.highlighted.mockClear()
    harness.run(1)
    expect(harness.risesOf('a')).toBeGreaterThan(0)
  })

  it('does not resume after a trip if the viewer had already selected one', () => {
    harness.clickOn('b')
    harness.focus.deselect()
    expect(harness.focus.tutorialPhase).toBe('done')

    harness.focus.setEnabled(false)
    harness.focus.setEnabled(true)
    harness.highlighted.mockClear()
    harness.cue.mockClear()
    harness.run(2)
    expect(harness.risesOf('a')).toBe(0)
    expect(harness.cue).not.toHaveBeenCalled()
  })

  it('leaves every synthetic state at rest when suspended mid-pulse', () => {
    harness.runUntil(() => harness.highlightState().a === true)
    expect(harness.cuesOf('a').length).toBeGreaterThan(0)

    // Leaving the scene mid-pulse: the warp, the audit panel. Nothing may be
    // left held — not the bump, not the cue, not the withdrawn invitation.
    harness.focus.setEnabled(false)
    expect(harness.highlightState()).toEqual({ a: false, b: false })
    expect(harness.cuesOf('a').at(-1)).toBeNull()
    expect(harness.focus.tutorialPhase).toBe('waiting')

    harness.focus.setEnabled(true)
    expect(harness.invitationState()).toEqual({ a: true, b: false })
  })

  it('retires if the pointer is already resting on a satellite when the scene settles', () => {
    harness.hoverOver('a')
    harness.run(0.5)
    // The pointer's hover, not the tutorial's: no pulse was ever played.
    expect(harness.highlightState()).toEqual({ a: true, b: false })
    expect(harness.focus.tutorialPhase).toBe('done')
    expect(harness.focus.tutorialPulses).toBe(0)
  })

  it('waits for the target to be on screen rather than playing toward nothing', () => {
    // Off the side of the frame.
    harness.meshes.a.position.set(-40, 0, 0)
    harness.meshes.a.updateMatrixWorld(true)
    harness.run(0.5)
    expect(harness.risesOf('a')).toBe(0)
    expect(harness.cue).not.toHaveBeenCalled()
    expect(harness.focus.tutorialPhase).toBe('waiting')

    harness.meshes.a.position.set(-2.6, 0, 0)
    harness.meshes.a.updateMatrixWorld(true)
    harness.run(0.4)
    expect(harness.risesOf('a')).toBeGreaterThan(0)
  })

  it('under reduced motion plays one pulse per round and never asks for particles', () => {
    harness = setup({ reducedMotion: true })
    harness.run(1)
    expect(harness.risesOf('a')).toBeGreaterThan(0)
    expect(harness.cuesOf('a').filter((p) => p !== null)).toEqual([])
    expect(harness.focus.tutorialPhase).not.toBe('done')
  })
})
