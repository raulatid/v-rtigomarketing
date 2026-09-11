import * as THREE from 'three'
import { OrbitSystem } from '../orbit/createOrbitSystem'
import type { SatelliteDef } from '../orbit/orbitConfig'
import { FocusCameraRig } from '../camera/createFocusCameraRig'
import { CursorManager } from '../../../interaction/cursorManager'
import { clientToNdc } from '../../../interaction/screenSpace'
import { ORBIT_CONFIG } from '../orbit/orbitConfig'
import { createHoverTutorial } from '../orbit/hoverTutorial'
import type { HoverTutorialConfig } from '../orbit/hoverTutorial'
import { isPointVisible } from '../orbit/satelliteVisibility'

// Wires hover/click on the satellite badges to the camera rig, the orbit
// system's freeze/resume API, and the case panel.
//
// Click a satellite → it freezes in place, the camera flies to a close-up
// framing it left of centre, and the panel appears on the right. The ✕ button,
// Escape, or a click on empty space deselects: the camera returns to overview
// and the satellite resumes its orbit from exactly where it froze.
//
// It also runs the hover TUTORIAL: the invited satellite auto-plays the hover
// state twice after the scene settles, so a viewer with no cursor — or one who
// has not thought to try — sees that the satellites respond. It is not an
// animation of its own. It is a third writer of the same `highlight` the
// pointer writes, so whatever hover looks like, the tutorial looks like that.

interface Options {
  camera: THREE.Camera
  domElement: HTMLElement
  orbitSystem: OrbitSystem
  cameraRig: FocusCameraRig
  cursor: CursorManager
  /**
   * The satellite whose halo breathes brighter until the viewer has selected
   * one — any one. `null` for no invitation. See orbitAssignments.invitedCaseId.
   * The hover tutorial plays on the same satellite, and retires with it.
   */
  invitedId: string | null
  onSelect: (data: SatelliteDef) => void
  onDeselect: () => void
  /**
   * Sampled once by the caller, like every other reader in the application.
   * The tutorial then plays one longer pulse with no particles; the hover ease
   * itself is kept, because two snaps are more abrupt than one short rise.
   */
  reducedMotion?: boolean
  /** Debug (`?tutorial=1`): the tutorial loops and ignores retirement, for tuning. */
  tutorialLoop?: boolean
  tutorial?: HoverTutorialConfig
}

export function createSatelliteFocus({
  camera,
  domElement,
  orbitSystem,
  cameraRig,
  cursor,
  invitedId,
  onSelect,
  onDeselect,
  reducedMotion = false,
  tutorialLoop = false,
  tutorial: tutorialConfig = ORBIT_CONFIG.tutorial,
}: Options) {
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  // Last pointermove position, in viewport coordinates. Only meaningful once
  // `pointerActive` is set — hover is a mouse affordance and a touch device
  // never produces one.
  let lastMoveX = 0
  let lastMoveY = 0
  let pointerActive = false
  let hoveredId: string | null = null
  let selectedId: string | null = null
  // Cleared for good on the first selection: the invitation exists to get the
  // viewer to click a satellite once, and after that it is only noise.
  let invited = invitedId
  let enabled = false
  const worldPos = new THREE.Vector3()

  // The tutorial's synthetic hover: the satellite it is currently holding in
  // the hover state, or null. A THIRD term beside `hoveredId` and `selectedId`,
  // never written INTO `hoveredId` — `updateHover` recomputes that from the
  // pointer every frame and would erase it. Same lifetime as `invited`: this
  // closure is built once per page load and survives the trip to Murcia and
  // back, so "played once, never again" needs no global.
  let demoId: string | null = null
  let lastCue: number | null = null
  const tutorial = createHoverTutorial(tutorialConfig, { reducedMotion, loop: tutorialLoop })
  const tutorialPos = new THREE.Vector3()

  const satelliteObjects = orbitSystem.satellites.map((s) => s.object)

  function findSatelliteFromObject(object: THREE.Object3D) {
    let node: THREE.Object3D | null = object
    while (node) {
      const sat = orbitSystem.satellites.find((s) => s.object === node)
      if (sat) return sat
      node = node.parent
    }
    return null
  }

  /**
   * Pushes the current hover/selection state onto every satellite.
   *
   * One pass over all of them rather than a diff against the previous state:
   * switching selection directly from A to B has to fold A and unfold B in the
   * same frame, and a pass that only touches the newly-selected one would leave
   * A's panel open. Both panels then advance from their own progress, so A
   * reverses from wherever it had got to instead of snapping shut.
   *
   * The three affordances read DIFFERENT state on purpose: the scale bump is on
   * for hover or selection, the brand panel unfolds only for selection. Six
   * satellites drift past the cursor during the overview — unfolding on hover
   * would have the panels flapping continuously. The invitation is on for the
   * invited satellite only while nothing stronger is saying anything about it:
   * under the cursor the bump is the answer, and selected it is open.
   */
  function applyHighlights() {
    for (const sat of orbitSystem.satellites) {
      // The tutorial's demo is a hover, so it reads as one here: it bumps, it
      // does not unfold, and it takes the invitation away for as long as it
      // holds. The ONE difference is how far the bump goes — `demo` sends it to
      // `satellite.demoScale` — so the demonstration is visible to a viewer who
      // has no pointer to compare it against.
      const pointed = sat.id === hoveredId
      const demoed = sat.id === demoId && !pointed
      const hovered = pointed || demoed
      orbitSystem.setSatelliteHighlight(sat.id, sat.id === selectedId || hovered, demoed)
      orbitSystem.setSatelliteExpanded(sat.id, sat.id === selectedId)
      orbitSystem.setSatelliteInvited(
        sat.id,
        enabled && sat.id === invited && !hovered && sat.id !== selectedId,
      )
    }
  }

  /** Drops the synthetic hover and its cue, pushing the change if there was one. */
  function clearDemo() {
    // Keyed on `invitedId`, the only satellite a cue is ever played on, not on
    // `invited`: select() clears that before retiring the tutorial, and a cue
    // in flight at the click would then stay pinned at its last progress.
    if (lastCue !== null && invitedId !== null) {
      lastCue = null
      orbitSystem.setSatelliteCue(invitedId, null)
    }
    if (demoId === null) return
    demoId = null
    applyHighlights()
  }

  /**
   * The viewer has shown they understand — they SELECTED a satellite — so the
   * lesson is over for the session. Idempotent, and safe mid-pulse: whatever
   * the tutorial was holding is let go on the same pass.
   *
   * A hover no longer counts, and that is the client's call on the second
   * review: a cursor crosses a satellite by accident, and the hint it ended was
   * the only thing telling anyone the satellites open. A click cannot be an
   * accident.
   */
  function retireTutorial() {
    tutorial.retire()
    if (tutorial.phase === 'done') clearDemo()
  }

  /**
   * One frame of the tutorial. Runs whether or not a pointer exists — it is
   * for the viewer who has none — and pauses for free while the layer is
   * disabled, because `update` is not called then.
   */
  function tickTutorial(delta: number) {
    if (tutorial.phase === 'done' || invited === null) {
      clearDemo()
      return
    }
    const target = orbitSystem.satellites.find((s) => s.id === invited)
    if (!target) return

    // Settled: the entrance is over and it is idling — the only readiness the
    // skip path preserves. Visible: on screen with a margin and not behind the
    // planet, read from the same camera the pointer picks through.
    const settled = orbitSystem.isSatelliteActive(target.id)
    let visible = false
    if (settled) {
      target.object.getWorldPosition(tutorialPos)
      visible = isPointVisible(camera, tutorialPos, tutorialConfig.visibleMarginNdc)
    }

    const frame = tutorial.tick(delta, { settled, visible })
    const nextDemo = frame.hover ? target.id : null
    if (nextDemo !== demoId) {
      demoId = nextDemo
      applyHighlights()
    }
    if (frame.cue !== lastCue) {
      lastCue = frame.cue
      orbitSystem.setSatelliteCue(target.id, frame.cue)
    }
  }

  /**
   * The satellite under a viewport point, or null. No side effects — the caller
   * decides whether the answer becomes a hover or a selection.
   *
   * Coordinate-driven rather than reading stored hover state, because a TAP
   * fires pointerdown → pointerup → click with no pointermove in between: on a
   * touch device the hover is never computed, so anything that consulted it
   * no-opped and the whole scene was mouse-only. Same shape as
   * DistrictInteraction.pickAt, which is why Murcia's interior already worked.
   */
  function pickAt(clientX: number, clientY: number): string | null {
    clientToNdc(domElement.getBoundingClientRect(), clientX, clientY, ndc)

    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(satelliteObjects, true)

    for (const hit of hits) {
      const sat = findSatelliteFromObject(hit.object)
      // Selectable only once the entrance animation finished and it is idling —
      // clicking a badge mid-entrance would focus a moving, half-faded target.
      if (sat && sat.object.visible && orbitSystem.isSatelliteActive(sat.id)) {
        return sat.id
      }
    }
    return null
  }

  function updateHover() {
    const newId = pickAt(lastMoveX, lastMoveY)

    // A real hover does NOT end the lesson — only a selection does (see
    // retireTutorial). The pointer still wins the frame it shares: the union in
    // applyHighlights means a pointer on B is never un-highlighted by a
    // tutorial holding A, and a pointer on A takes A's bump down to its own
    // size rather than the demonstration's.
    if (newId !== hoveredId) {
      hoveredId = newId
      applyHighlights()
    }

    cursor.request('satellite', hoveredId ? 'pointer' : '')
  }

  function select(id: string) {
    if (selectedId === id) return
    // Switching directly from one satellite to another: let the old one go.
    if (selectedId) orbitSystem.resumeSatellite(selectedId)

    const sat = orbitSystem.satellites.find((s) => s.id === id)
    if (!sat) return

    selectedId = id
    invited = null
    // Selecting is the surest sign of understanding; the tutorial retires with
    // the invitation, on the same click.
    retireTutorial()
    sat.object.getWorldPosition(worldPos)

    orbitSystem.freezeSatellite(id)
    cameraRig.focusOn(worldPos)
    cameraRig.setOrbitEnabled(false)
    applyHighlights()
    onSelect(sat.data)
  }

  function deselect() {
    if (!selectedId) return
    // resumeSatellite carries the frozen progress forward, so the badge picks up
    // from where it stopped instead of snapping to where the clock ran on to.
    orbitSystem.resumeSatellite(selectedId)
    selectedId = null
    cameraRig.returnToOverview()
    cameraRig.setOrbitEnabled(true)
    applyHighlights()
    onDeselect()
  }

  function onPointerMove(e: PointerEvent) {
    lastMoveX = e.clientX
    lastMoveY = e.clientY
    pointerActive = true
  }

  function onClick(e: MouseEvent) {
    if (!enabled) return
    // A drag that happens to end over a satellite must not select it. The
    // threshold comes from the rig because it owns the gesture and knows which
    // kind of pointer drew it.
    if (cameraRig.getDragDistance() > cameraRig.getDragClickThreshold()) return
    // Picked from the click's own coordinates, not from `hoveredId`: a tap
    // never sets a hover, so reading it made every satellite untappable.
    const id = pickAt(e.clientX, e.clientY)
    if (id) select(id)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && selectedId) {
      // Swallow it: Escape also skips the intro, and a viewer closing a panel
      // does not expect that to restart anything.
      e.stopPropagation()
      deselect()
    }
  }

  window.addEventListener('pointermove', onPointerMove)
  domElement.addEventListener('click', onClick)
  // Capture phase so this runs before App's skip handler on window.
  window.addEventListener('keydown', onKeyDown, true)

  function setEnabled(next: boolean) {
    if (enabled === next) return
    enabled = next
    if (!next) {
      // Leaving the scene — the warp to Murcia, the audit panel — PAUSES the
      // tutorial rather than ending it. The lesson ends when the viewer
      // interacts with a satellite, and a trip is not that: someone who never
      // found them is owed the offer again when they come back. Suspended
      // FIRST, so no demo highlight survives into the pass below.
      tutorial.suspend()
      clearDemo()
      deselect()
      hoveredId = null
      applyHighlights()
      cursor.request('satellite', '')
    } else {
      // The invitation has no pointer event to wait for; the intro releasing
      // the scene is the moment it should be on screen.
      applyHighlights()
    }
  }

  // Runs per frame rather than on pointer move, because satellites keep moving
  // even when the pointer is still.
  //
  // The tutorial ticks BEFORE the pointer guard: a touch device never sets
  // `pointerActive`, and the tutorial exists above all for that device.
  function update(delta = 0) {
    if (!enabled) return
    tickTutorial(delta)
    if (!pointerActive || cameraRig.isDragging()) return
    updateHover()
  }

  function dispose() {
    window.removeEventListener('pointermove', onPointerMove)
    domElement.removeEventListener('click', onClick)
    window.removeEventListener('keydown', onKeyDown, true)
  }

  return {
    update,
    deselect,
    setEnabled,
    // The rig asks this at click time to tell a satellite click from an
    // empty-space one. It takes coordinates for the same reason onClick does,
    // and it replaces the `isHovering()` this used to expose — that answered
    // "is the mouse over something", which on touch is always no.
    pickAt,
    dispose,
    /**
     * Is the mouse resting on a satellite right now?
     *
     * A different question from `pickAt`, and the one the old `isHovering()`
     * asked: "is the pointer over something", which on a touch device is always
     * no. That made it the wrong answer for a click, which is why it went. It is
     * the RIGHT answer for the hint, which reads this to stand down while the
     * viewer's pointer is already on a target — a touch device dismisses that
     * hint through `touchstart` instead and never needs to ask.
     *
     * Recomputed by `update`, so it is only as fresh as the last frame.
     */
    get hovering() {
      return hoveredId !== null
    },
    /** The tutorial's phase and pulse count — for the tests and the debug readout. */
    get tutorialPhase() {
      return tutorial.phase
    },
    get tutorialPulses() {
      return tutorial.pulsesPlayed
    },
  }
}

export type SatelliteFocus = ReturnType<typeof createSatelliteFocus>
