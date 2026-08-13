import { RefObject, Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraController } from './CameraController'
import { AuditCameraShift } from './AuditCameraShift'
import { EarthScene } from './EarthScene'
import { Starfield } from './Starfield'
import { SpaceBackdrop } from './SpaceBackdrop'
import { SkyShell } from './SkyShell'
import { OrbitSystemLayer } from './OrbitSystemLayer'
import { InteractionLayer, InteractionHandle } from './InteractionLayer'
import { CornerLogoLayer } from './CornerLogoLayer'
import { MurciaLayer } from './MurciaLayer'
import { RenderPipeline } from '../graphics/RenderPipeline'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { OrbitSystem } from '../orbit-system/createOrbitSystem'
import { SatelliteDef } from '../orbit-system/orbitConfig'
import type { CornerLogo } from '../corner-logo/createCornerLogo'
import { CornerLogoHandle } from '../hooks/useMasterTimeline'
import type { ExperienceId } from '../app/experience'
import type { GeoMarkers } from '../orbit-system/createGeoMarkers'
import type { CursorManager } from '../interaction/cursorManager'
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'

interface Props {
  config: IntroConfig
  state: SequenceState
  overlayEl: RefObject<HTMLDivElement | null>
  orbitSystemRef: RefObject<OrbitSystem | null>
  interactionRef: RefObject<InteractionHandle | null>
  logoRef: RefObject<CornerLogo | null>
  cornerLogoHandleRef: RefObject<CornerLogoHandle | null>
  activeExperience: ExperienceId
  murciaRef: RefObject<MurciaExperience | null>
  onSelectCase: (data: SatelliteDef) => void
  onDeselectCase: () => void
  onLogoLoadFailed: () => void
  onMurciaReady: () => void
  onSelectDestination: (id: string) => void
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
  activeExperience,
  murciaRef,
  onSelectCase,
  onDeselectCase,
  onLogoLoadFailed,
  onMurciaReady,
  onSelectDestination,
}: Props) {
  // Earth stays mounted whichever experience is showing; this only decides
  // whether it consumes input and does per-frame work (ADR 003).
  const earthActive = activeExperience === 'earth'

  // Published by GeoMarkersLayer, read by CameraController so the warp can aim
  // at the destination. Owned here rather than in App because both ends of the
  // handoff live inside the Canvas.
  const geoMarkersRef = useRef<GeoMarkers | null>(null)

  // Earth's single cursor arbiter. Created by InteractionLayer and borrowed by
  // the geo markers, which hover on the same canvas from a different layer.
  // Murcia does NOT share it — it holds one of its own, because the two are
  // never live at the same time and each must be able to drop its whole set of
  // requests when it goes inactive.
  const cursorRef = useRef<CursorManager | null>(null)

  return (
    <Canvas
      className="scene-canvas"
      camera={{ fov: config.normalFov, near: 0.1, far: 5000, position: [0, 0, 200] }}
      gl={{ antialias: true }}
    >
      <CameraController
        config={config}
        state={state}
        overlayEl={overlayEl}
        active={earthActive}
        geoMarkersRef={geoMarkersRef}
      />
      {/* Projection-window shift for the audit panel. It writes camera.view,
          not the pose, so it cannot fight CameraController or the focus rig. */}
      <AuditCameraShift active={earthActive} />
      <Starfield config={config} state={state} active={earthActive} />
      {/* Two separate fields on purpose: Starfield is the near-field warp tunnel
          and is gated OFF at the cut; SpaceBackdrop is the far shell that is
          gated ON there and never leaves. See plan 004 §4. */}
      {/* Drawn first and depth-free, so it sits behind everything including
          the star shell. Baked during P0; gated on with the Earth. */}
      <SkyShell config={config} state={state} active={earthActive} />
      <SpaceBackdrop config={config} state={state} active={earthActive} />
      <Suspense fallback={null}>
        <EarthScene
          config={config}
          state={state}
          active={earthActive}
          onSelectDestination={onSelectDestination}
          geoMarkersRef={geoMarkersRef}
          cursorRef={cursorRef}
        />
      </Suspense>
      {/* Scene level, NOT inside EarthScene — orbital motion must not compound
          with the Earth's surface rotation. Ordered before InteractionLayer so
          its effect populates orbitSystemRef first. */}
      <OrbitSystemLayer state={state} systemRef={orbitSystemRef} active={earthActive} />
      <InteractionLayer
        state={state}
        orbitSystemRef={orbitSystemRef}
        handleRef={interactionRef}
        cursorRef={cursorRef}
        onSelect={onSelectCase}
        onDeselect={onDeselectCase}
        active={earthActive}
      />
      {/* The 3D brand logo. Inside the Canvas because it shares this
          renderer — it no longer has one of its own (ADR 002). */}
      <CornerLogoLayer
        config={config}
        onLoadFailed={onLogoLoadFailed}
        logoRef={logoRef}
        handleRef={cornerLogoHandleRef}
      />
      {/* Last, and the only thing that renders. Must stay after every layer
          that writes per-frame state it consumes. */}
      <MurciaLayer
        active={!earthActive}
        state={state}
        experienceRef={murciaRef}
        onReady={onMurciaReady}
      />
      {/* The route is decided here, not in the pipeline: which experience is
          showing is orchestration's business, and the pipeline's job is to draw
          whatever it is handed. Murcia satisfies RenderableExperience
          structurally — it already exposed `scene` and `viewCamera`. */}
      <RenderPipeline
        config={config}
        state={state}
        logoRef={logoRef}
        directRef={murciaRef}
        route={earthActive ? 'composer' : 'direct'}
      />
    </Canvas>
  )
}
