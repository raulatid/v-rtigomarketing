import { RefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitSystem } from '../orbit/createOrbitSystem'
import type { SatelliteDef } from '../orbit/orbitConfig'
import { createFocusCameraRig, FocusCameraRig } from '../camera/createFocusCameraRig'
import { createSatelliteFocus, SatelliteFocus } from './createSatelliteFocus'
import { createCursorManager, type CursorManager } from '../../../interaction/cursorManager'
import { SequenceState } from '../config/sequenceState'
import { atOrAfter } from '../config/sceneVisibility'
import { auditView } from '../../../auditView'
import { EARTH_REST } from '../camera/CameraController'
import { clampFrameDelta } from '../../../graphics/frameDelta'

export interface InteractionHandle {
  deselect: () => void
}

interface Props {
  state: SequenceState
  orbitSystemRef: RefObject<OrbitSystem | null>
  handleRef: RefObject<InteractionHandle | null>
  /**
   * Published for the other Earth hover source. The geo markers are built in a
   * different layer but share this canvas, and one arbiter per element is the
   * whole point of the manager — a second one would restore the flip-flop it
   * exists to prevent.
   */
  cursorRef: RefObject<CursorManager | null>
  onSelect: (data: SatelliteDef) => void
  onDeselect: () => void
  active: boolean
}

// Owns the interactive phase: the camera rig and the satellite selection
// controller.
//
// CAMERA OWNERSHIP. CameraController drives the whole intro and reasserts a rest
// pose every frame; this rig would fight it if both ran. So the rig stays
// dormant until the resting phase and then takes over, seeding itself from the
// live camera pose so the handoff produces no jump. CameraController still owns
// every phase that can be seeked, which is what its per-frame reassert protects.
export function InteractionLayer({
  state,
  orbitSystemRef,
  handleRef,
  cursorRef,
  onSelect,
  onDeselect,
  active,
}: Props) {
  const { camera, gl } = useThree()
  const rigRef = useRef<FocusCameraRig | null>(null)
  const focusRef = useRef<SatelliteFocus | null>(null)

  const callbacks = useRef({ onSelect, onDeselect })
  callbacks.current = { onSelect, onDeselect }

  useEffect(() => {
    const orbitSystem = orbitSystemRef.current
    if (!orbitSystem) return

    const cursor = createCursorManager(gl.domElement)
    cursorRef.current = cursor

    const rig = createFocusCameraRig({
      camera: camera as THREE.PerspectiveCamera,
      domElement: gl.domElement,
      cursor,
      overviewPose: EARTH_REST,
      // A click on empty space deselects. The rig owns the click because it is
      // the thing that knows whether the gesture was a drag.
      onEmptyClick: () => focusRef.current?.deselect(),
      // Picked from the click's coordinates rather than from the stored hover:
      // a tap never produces a hover, so the old read reported "empty space"
      // for every touch and the rig deselected instead of letting the
      // satellite controller select.
      isOverSatellite: (x, y) => (focusRef.current?.pickAt(x, y) ?? null) !== null,
    })

    const focus = createSatelliteFocus({
      camera,
      domElement: gl.domElement,
      orbitSystem,
      cameraRig: rig,
      cursor,
      onSelect: (data) => callbacks.current.onSelect(data),
      onDeselect: () => callbacks.current.onDeselect(),
    })

    rigRef.current = rig
    focusRef.current = focus
    handleRef.current = { deselect: () => focus.deselect() }

    return () => {
      handleRef.current = null
      rigRef.current = null
      focusRef.current = null
      cursorRef.current = null
      focus.dispose()
      rig.dispose()
      cursor.dispose()
    }
    // orbitSystemRef is populated by OrbitSystemLayer's effect. Both mount in
    // the same commit and OrbitSystemLayer is ordered first in SceneCanvas, so
    // its effect has already run by the time this one does.
  }, [camera, gl, orbitSystemRef, handleRef, cursorRef])

  // Priority 0 so this runs before RenderPipeline (1) does the WebGL render and
  // GeoMarkersLayer (2) draws its labels — the camera must be final first.
  useFrame((_, rawDelta) => {
    const rig = rigRef.current
    const focus = focusRef.current
    if (!rig || !focus) return

    // Gating on `active` rather than detaching listeners is deliberate and
    // verified: every handler in the rig short-circuits on `!active` (or on
    // `orbit.isDragging`, which deactivate() clears via endDrag()), the wheel
    // listener is passive, and satellite focus only swallows Escape while a
    // satellite is selected — which setEnabled(false) clears. So the whole
    // input surface goes inert here without touching the DOM, and the rig
    // keeps the pose the viewer left so a return does not snap the camera.
    const interactive = active && atOrAfter(state.phase, 'site')
    if (interactive) rig.activate()
    else if (rig.isActive()) rig.deactivate()

    // A warp is playing: CameraController owns the camera for its duration, so
    // the rig stands down. Note this does NOT deactivate it — activate() reseeds
    // from the overview pose, so toggling here would throw away the pose the
    // dolly is departing from. Simply not calling update() freezes it in place
    // with its state intact, which is the same seam the audit panel relies on.
    const warping = state.transitionProgress > 0
    // The rig stays active while the audit panel is open — deactivating it
    // would reset to the overview pose and lose the user's drag position, and
    // the ambient drag keeps the visible strip alive. Only satellite selection
    // is disabled, so a click cannot fly the camera into a close-up (whose
    // composition contract assumes the full viewport) behind the panel.
    focus.setEnabled(interactive && !warping && !auditView.open)

    if (!interactive || warping) return

    focus.update()
    // Clamped so a backgrounded tab cannot teleport the camera on return.
    rig.update(clampFrameDelta(rawDelta))
  })

  return null
}
