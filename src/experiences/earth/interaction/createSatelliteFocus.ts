import * as THREE from 'three'
import { OrbitSystem } from '../orbit/createOrbitSystem'
import type { SatelliteDef } from '../orbit/orbitConfig'
import { FocusCameraRig } from '../camera/createFocusCameraRig'
import { CursorManager } from '../../../interaction/cursorManager'
import { clientToNdc } from '../../../interaction/screenSpace'

// Wires hover/click on the satellite badges to the camera rig, the orbit
// system's freeze/resume API, and the case panel.
//
// Click a satellite → it freezes in place, the camera flies to a close-up
// framing it left of centre, and the panel appears on the right. The ✕ button,
// Escape, or a click on empty space deselects: the camera returns to overview
// and the satellite resumes its orbit from exactly where it froze.

interface Options {
  camera: THREE.Camera
  domElement: HTMLElement
  orbitSystem: OrbitSystem
  cameraRig: FocusCameraRig
  cursor: CursorManager
  /**
   * The satellite whose halo breathes brighter until the viewer has selected
   * one — any one. `null` for no invitation. See orbitAssignments.invitedCaseId.
   */
  invitedId: string | null
  onSelect: (data: SatelliteDef) => void
  onDeselect: () => void
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
      orbitSystem.setSatelliteHighlight(sat.id, sat.id === selectedId || sat.id === hoveredId)
      orbitSystem.setSatelliteExpanded(sat.id, sat.id === selectedId)
      orbitSystem.setSatelliteInvited(
        sat.id,
        enabled && sat.id === invited && sat.id !== hoveredId && sat.id !== selectedId,
      )
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
  function update() {
    if (!enabled || !pointerActive || cameraRig.isDragging()) return
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
  }
}

export type SatelliteFocus = ReturnType<typeof createSatelliteFocus>
