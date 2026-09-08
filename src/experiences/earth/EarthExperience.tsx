import { RefObject, Suspense, useRef } from 'react'
import { CameraController } from './camera/CameraController'
import { AuditCameraShift } from './camera/AuditCameraShift'
import { EarthScene } from './scene/EarthScene'
import { Starfield } from './scene/Starfield'
import { SpaceBackdrop } from './scene/SpaceBackdrop'
import { SkyShell } from './scene/SkyShell'
import { SkyShellCube } from './scene/SkyShellCube'
import { protoSkyActive } from '../../app/protoSky'
import { OrbitSystemLayer } from './orbit/OrbitSystemLayer'
import { InteractionLayer, InteractionHandle } from './interaction/InteractionLayer'
import { HintLayer } from './hint/HintLayer'
import type { IntroConfig } from './config/introConfig'
import type { SequenceState } from './config/sequenceState'
import type { OrbitSystem } from './orbit/createOrbitSystem'
import type { SatelliteDef } from './orbit/orbitConfig'
import type { DestinationResolver } from './navigation/destination'
import type { CursorManager } from '../../interaction/cursorManager'

/**
 * The Earth experience, composed.
 *
 * ARCHITECTURE.md §7 asks every experience for an explicit lifecycle. Murcia's
 * is a class with mount/load/setActive/dispose, because it was migrated from a
 * standalone prototype that owned its own renderer and loop. Earth's is React's
 * — its layers are R3F components, so mounting IS rendering them and pausing IS
 * the `active` prop. Wrapping that in a class to look like Murcia would be a
 * shallow module (§4) forwarding a boolean React already delivers, and §12 is
 * explicit that Earth and Murcia are allowed to differ where they genuinely do.
 *
 * What Earth was actually missing is a BOUNDARY. SceneCanvas mounted all eight
 * of these layers itself, in the right order, with the right props, and owned
 * two refs that only Earth ever touched — so the application knew Earth's
 * internal composition, which is what §33 and §26 ask it not to. Now it mounts
 * one thing and hands over what it owns.
 *
 * The two refs below moved in with it: `destination` is published by
 * EarthScene (which owns the spin group the destination turns with) and read
 * by CameraController so the warp can aim at the city, and `cursor` is Earth's
 * single cursor arbiter, created and consumed by InteractionLayer. Both
 * handoffs have both ends inside Earth, which is the test §14 sets for where
 * state should live.
 *
 * ORDER IS LOAD-BEARING and is preserved exactly:
 *   - SkyShell and SpaceBackdrop draw before the Earth, depth-free, so they sit
 *     behind everything.
 *   - OrbitSystemLayer precedes InteractionLayer so its effect has populated
 *     `orbitSystemRef` before the interaction layer reads it.
 *   - Every layer here runs at useFrame priority 0, so the camera and the rig
 *     are final before RenderPipeline draws at priority 1.
 */
interface Props {
  /** False while another experience is showing. Every layer gates its own
   *  per-frame work on this; see CameraController for the one exception, which
   *  must keep writing the transition overlay (ADR 003). */
  active: boolean
  config: IntroConfig
  state: SequenceState
  /** The DOM node the intro's flash overlay writes to. Owned by App. */
  overlayEl: RefObject<HTMLDivElement | null>
  /** Published for App, which drives replay and the debug seek. */
  orbitSystemRef: RefObject<OrbitSystem | null>
  interactionRef: RefObject<InteractionHandle | null>
  onSelectCase: (data: SatelliteDef) => void
  onDeselectCase: () => void
}

export function EarthExperience({
  active,
  config,
  state,
  overlayEl,
  orbitSystemRef,
  interactionRef,
  onSelectCase,
  onDeselectCase,
}: Props) {
  // Published by EarthScene, read by CameraController so the warp can aim at
  // the destination. Both ends are in this file, so it belongs here.
  const destinationRef = useRef<DestinationResolver | null>(null)

  // Earth's single cursor arbiter, created and consumed by InteractionLayer.
  // Murcia does NOT share it — it holds one of its own, because the two are
  // never live at the same time and each must be able to drop its whole set of
  // requests when it goes inactive.
  const cursorRef = useRef<CursorManager | null>(null)

  return (
    <>
      <CameraController
        config={config}
        state={state}
        overlayEl={overlayEl}
        active={active}
        destinationRef={destinationRef}
      />
      {/* Projection-window shift for the audit panel. It writes camera.view,
          not the pose, so it cannot fight CameraController or the focus rig. */}
      <AuditCameraShift active={active} />
      <Starfield config={config} state={state} active={active} />
      {/* Two separate fields on purpose: Starfield is the near-field warp tunnel
          and is gated OFF at the cut; SpaceBackdrop is the far shell that is
          gated ON there and never leaves. See plan 004 §4. */}
      {/* Drawn first and depth-free, so it sits behind everything including
          the star shell. Baked during P0; gated on with the Earth. */}
      {/* One or the other, never both — two opaque shells at renderOrder -1000
          would be a draw-order coin flip rather than a comparison. protoSkyActive()
          is false unless ?sky=<variant> named one AND this is not a production
          build, so the shipped path here is unchanged. */}
      {protoSkyActive() ? (
        <SkyShellCube config={config} state={state} active={active} />
      ) : (
        <SkyShell config={config} state={state} active={active} />
      )}
      <SpaceBackdrop config={config} state={state} active={active} />
      <Suspense fallback={null}>
        <EarthScene
          config={config}
          state={state}
          active={active}
          destinationRef={destinationRef}
        />
      </Suspense>
      {/* Scene level, NOT inside EarthScene — orbital motion must not compound
          with the Earth's surface rotation. Ordered before InteractionLayer so
          its effect populates orbitSystemRef first. */}
      <OrbitSystemLayer state={state} systemRef={orbitSystemRef} active={active} />
      <InteractionLayer
        state={state}
        orbitSystemRef={orbitSystemRef}
        handleRef={interactionRef}
        cursorRef={cursorRef}
        onSelect={onSelectCase}
        onDeselect={onDeselectCase}
        active={active}
      />
      {/* Last, and outside the depth buffer entirely: the way out of this world,
          drawn in it rather than on a plate over it. Mounted unconditionally and
          invisible so its shader is compiled by the scene-level warm-up rather
          than on the frame the hint first appears. */}
      <HintLayer state={state} active={active} />
    </>
  )
}

export type { InteractionHandle } from './interaction/InteractionLayer'
