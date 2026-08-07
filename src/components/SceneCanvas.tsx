import { RefObject, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraController } from './CameraController'
import { AuditCameraShift } from './AuditCameraShift'
import { EarthScene } from './EarthScene'
import { Starfield } from './Starfield'
import { SpaceBackdrop } from './SpaceBackdrop'
import { OrbitSystemLayer } from './OrbitSystemLayer'
import { InteractionLayer, InteractionHandle } from './InteractionLayer'
import { CornerLogoLayer } from './CornerLogoLayer'
import { RenderPipeline } from '../graphics/RenderPipeline'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { OrbitSystem } from '../orbit-system/createOrbitSystem'
import { SatelliteDef } from '../orbit-system/orbitConfig'
import type { CornerLogo } from '../corner-logo/createCornerLogo'
import { CornerLogoHandle } from '../hooks/useMasterTimeline'

interface Props {
  config: IntroConfig
  state: SequenceState
  overlayEl: RefObject<HTMLDivElement | null>
  orbitSystemRef: RefObject<OrbitSystem | null>
  interactionRef: RefObject<InteractionHandle | null>
  logoRef: RefObject<CornerLogo | null>
  cornerLogoHandleRef: RefObject<CornerLogoHandle | null>
  onSelectCase: (data: SatelliteDef) => void
  onDeselectCase: () => void
  onLogoLoadFailed: () => void
}

// Both the starfield and the Earth stay mounted for the whole sequence and
// toggle `visible` from shared state. Nothing unmounts mid-flight, so there is
// no suspense flash or shader recompile at the cut.
export function SceneCanvas({
  config,
  state,
  overlayEl,
  orbitSystemRef,
  interactionRef,
  logoRef,
  cornerLogoHandleRef,
  onSelectCase,
  onDeselectCase,
  onLogoLoadFailed,
}: Props) {
  return (
    <Canvas
      className="scene-canvas"
      camera={{ fov: config.normalFov, near: 0.1, far: 5000, position: [0, 0, 200] }}
      gl={{ antialias: true }}
    >
      <CameraController config={config} state={state} overlayEl={overlayEl} />
      {/* Projection-window shift for the audit panel. It writes camera.view,
          not the pose, so it cannot fight CameraController or the focus rig. */}
      <AuditCameraShift />
      <Starfield config={config} state={state} />
      {/* Two separate fields on purpose: Starfield is the near-field warp tunnel
          and is gated OFF at the cut; SpaceBackdrop is the far shell that is
          gated ON there and never leaves. See plan 004 §4. */}
      <SpaceBackdrop config={config} state={state} />
      <Suspense fallback={null}>
        <EarthScene config={config} state={state} />
      </Suspense>
      {/* Scene level, NOT inside EarthScene — orbital motion must not compound
          with the Earth's surface rotation. Ordered before InteractionLayer so
          its effect populates orbitSystemRef first. */}
      <OrbitSystemLayer state={state} systemRef={orbitSystemRef} />
      <InteractionLayer
        state={state}
        orbitSystemRef={orbitSystemRef}
        handleRef={interactionRef}
        onSelect={onSelectCase}
        onDeselect={onDeselectCase}
      />
      {/* The 3D brand logo. Inside the Canvas because it shares this
          renderer — it no longer has one of its own (ADR 002). */}
      <CornerLogoLayer
        config={config}
        state={state}
        onLoadFailed={onLogoLoadFailed}
        logoRef={logoRef}
        handleRef={cornerLogoHandleRef}
      />
      {/* Last, and the only thing that renders. Must stay after every layer
          that writes per-frame state it consumes. */}
      <RenderPipeline config={config} state={state} logoRef={logoRef} />
    </Canvas>
  )
}
