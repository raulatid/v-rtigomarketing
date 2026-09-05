import { RefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitSystem } from '../orbit/createOrbitSystem'
import type { SatelliteDef } from '../orbit/orbitConfig'
import { invitedCaseId } from '../orbit/orbitAssignments'
import { createFocusCameraRig, FocusCameraRig } from '../camera/createFocusCameraRig'
import { installDebugCameraHook } from '../camera/debugCameraHook'
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
      invitedId: invitedCaseId,
      onSelect: (data) => callbacks.current.onSelect(data),
      onDeselect: () => callbacks.current.onDeselect(),
    })

    // Dev-gated, and a no-op in a production build. Installed here because this
    // is where the rig exists and dies; the hook must not outlive it.
    const uninstallDebugCamera = installDebugCameraHook(rig, () =>
      orbitSystem.satellites.every((s) => orbitSystem.isSatelliteActive(s.id)),
    )

    rigRef.current = rig
    focusRef.current = focus
    handleRef.current = { deselect: () => focus.deselect() }

    return () => {
      handleRef.current = null
      rigRef.current = null
      focusRef.current = null
      cursorRef.current = null
      uninstallDebugCamera()
      focus.dispose()
      rig.dispose()
      cursor.dispose()
    }
    // orbitSystemRef is populated by OrbitSystemLayer's effect. Both mount in
    // the same commit and OrbitSystemLayer is ordered first in SceneCanvas, so
    // its effect has already run by the time this one does.
  }, [camera, gl, orbitSystemRef, handleRef, cursorRef])

  // Sampled once: matchMedia inside a frame callback would be a media lookup per
  // frame, and every other reader in the application samples it once too.

  // Priority 0, and LAST among the priority-0 layers, so the rig is the final
  // camera writer before RenderPipeline draws at priority 1.
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
    // The viewer's zoom, and it goes FIRST — ahead of `activate()` and outside
    // the cinematic guard below, which is not tidiness in either case.
    //
    // Ahead of `activate()` because activate seeds the entire rig from
    // `overviewPosition`, and the zoom is what decides how long that vector is.
    // Set afterwards, a viewer who zoomed in, warped to Murcia and came back
    // would be seeded at the radius they left and then eased out to rest in
    // plain view — the depth is reset at the cut, so the rig would be answering
    // a change that had already happened.
    //
    // Outside the guard because the cut happens DURING a cinematic. That is the
    // one frame the reset has to land on, and it is fully black; deferring it to
    // the first frame after the warp would put it on a frame the viewer can see.
    // Writing here is safe while the cinematic owns the camera because nothing
    // reads what this writes until `update()` runs again.
    rig.setZoomDepth(state.zoomDepth)

    const interactive = active && atOrAfter(state.phase, 'site')
    if (interactive) rig.activate()
    else if (rig.isActive()) rig.deactivate()

    // A COMMITTED warp is playing: CameraController owns the camera for its
    // duration, so the rig stands down. Note this does NOT deactivate it —
    // activate() reseeds from the overview pose, so toggling here would throw
    // away the pose the dolly is departing from. Simply not calling update()
    // freezes it in place with its state intact, which is the same seam the
    // audit panel relies on.
    //
    // Gated on `transitionCommitted`, NOT on `transitionProgress > 0`. The two
    // agree again since `adr/014` took the gesture back out of the warp, and
    // asking the ownership question directly is still the right one to ask: what
    // decides whether the rig may run is whether a cinematic OWNS the camera,
    // not whether some number happens to be non-zero.
    //
    // They disagreed for the length of `adr/009`'s scrubbed gesture, and the
    // difference cost a real defect: standing down whenever progress was
    // non-zero froze the globe for ~1.6s after a single wheel notch, and
    // `onPointerMove` has no `active` guard, so the orbit angles kept
    // integrating behind a camera nobody was updating and the whole drag then
    // replayed as a slow drift.
    const cinematic = state.transitionCommitted
    // The rig stays active while the audit panel is open — deactivating it
    // would reset to the overview pose and lose the user's drag position, and
    // the ambient drag keeps the visible strip alive. Only satellite selection
    // is disabled, so a click cannot fly the camera into a close-up (whose
    // composition contract assumes the full viewport) behind the panel.
    focus.setEnabled(interactive && !cinematic && !auditView.open)

    if (!interactive || cinematic) return

    focus.update()
    // Clamped so a backgrounded tab cannot teleport the camera on return.
    //
    // The zoom was written above, before the rig rather than after it, and that
    // ordering is the difference between a zoom and the scrub it replaced
    // (`adr/014`). The scrub had to correct the camera AFTER `rig.update()`,
    // because the rig would have overwritten anything written first. A zoom is
    // an input to the rig rather than a correction of it, so it goes in at the
    // front and comes out smoothed by the rig's own radius ease.
    rig.update(clampFrameDelta(rawDelta))
  })

  return null
}
