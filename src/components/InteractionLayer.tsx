import { RefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitSystem } from '../orbit-system/createOrbitSystem'
import { SatelliteDef } from '../orbit-system/orbitConfig'
import { createFocusCameraRig, FocusCameraRig } from '../interaction/createFocusCameraRig'
import { createSatelliteFocus, SatelliteFocus } from '../interaction/createSatelliteFocus'
import { createCursorManager } from '../interaction/cursorManager'
import { SequenceState } from '../sequenceState'
import { atOrAfter } from '../sceneVisibility'
import { auditView } from '../auditView'
import { EARTH_REST } from './CameraController'

export interface InteractionHandle {
  deselect: () => void
}

interface Props {
  state: SequenceState
  orbitSystemRef: RefObject<OrbitSystem | null>
  handleRef: RefObject<InteractionHandle | null>
  onSelect: (data: SatelliteDef) => void
  onDeselect: () => void
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
  onSelect,
  onDeselect,
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

    const rig = createFocusCameraRig({
      camera: camera as THREE.PerspectiveCamera,
      domElement: gl.domElement,
      cursor,
      overviewPose: EARTH_REST,
      // A click on empty space deselects. The rig owns the click because it is
      // the thing that knows whether the gesture was a drag.
      onEmptyClick: () => focusRef.current?.deselect(),
      isOverSatellite: () => focusRef.current?.isHovering() ?? false,
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
      focus.dispose()
      rig.dispose()
      cursor.dispose()
    }
    // orbitSystemRef is populated by OrbitSystemLayer's effect. Both mount in
    // the same commit and OrbitSystemLayer is ordered first in SceneCanvas, so
    // its effect has already run by the time this one does.
  }, [camera, gl, orbitSystemRef, handleRef])

  // Priority 0 so this runs before RenderPipeline (1) does the WebGL render and
  // GeoMarkersLayer (2) draws its labels — the camera must be final first.
  useFrame((_, rawDelta) => {
    const rig = rigRef.current
    const focus = focusRef.current
    if (!rig || !focus) return

    const interactive = atOrAfter(state.phase, 'site')
    if (interactive) rig.activate()
    else if (rig.isActive()) rig.deactivate()
    // The rig stays active while the audit panel is open — deactivating it
    // would reset to the overview pose and lose the user's drag position, and
    // the ambient drag keeps the visible strip alive. Only satellite selection
    // is disabled, so a click cannot fly the camera into a close-up (whose
    // composition contract assumes the full viewport) behind the panel.
    focus.setEnabled(interactive && !auditView.open)

    if (!interactive) return

    focus.update()
    // Clamped so a backgrounded tab cannot teleport the camera on return.
    rig.update(Math.min(rawDelta, 0.1))
  })

  return null
}
