import * as THREE from 'three'
import { OrbitSystem } from '../orbit-system/createOrbitSystem'
import { SatelliteDef } from '../orbit-system/orbitConfig'
import { FocusCameraRig } from './createFocusCameraRig'
import { CursorManager } from './cursorManager'

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
  onSelect: (data: SatelliteDef) => void
  onDeselect: () => void
}

export function createSatelliteFocus({
  camera,
  domElement,
  orbitSystem,
  cameraRig,
  cursor,
  onSelect,
  onDeselect,
}: Options) {
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2(2, 2) // offscreen until the first move
  let pointerActive = false
  let hoveredId: string | null = null
  let selectedId: string | null = null
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

  function applyHighlights() {
    for (const sat of orbitSystem.satellites) {
      orbitSystem.setSatelliteHighlight(sat.id, sat.id === selectedId || sat.id === hoveredId)
    }
  }

  function updateHover() {
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(satelliteObjects, true)

    let newId: string | null = null
    for (const hit of hits) {
      const sat = findSatelliteFromObject(hit.object)
      // Selectable only once the entrance animation finished and it is idling —
      // clicking a badge mid-entrance would focus a moving, half-faded target.
      if (sat && sat.object.visible && orbitSystem.isSatelliteActive(sat.id)) {
        newId = sat.id
        break
      }
    }

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
    const rect = domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    pointerActive = true
  }

  function onClick() {
    if (!enabled) return
    if (cameraRig.getDragDistance() > 4) return // a drag, not a tap
    if (hoveredId) select(hoveredId)
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

  return { update, deselect, setEnabled, isHovering: () => !!hoveredId, dispose }
}

export type SatelliteFocus = ReturnType<typeof createSatelliteFocus>
