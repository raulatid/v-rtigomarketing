import { RefObject, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { EarthExperience } from '../experiences/earth/EarthExperience'
import type { InteractionHandle } from '../experiences/earth/EarthExperience'
import { CornerLogoLayer } from './CornerLogoLayer'
import { MurciaLayer } from './MurciaLayer'
import { RenderPipeline } from '../graphics/RenderPipeline'
import type { FrameSettings } from '../graphics/renderableExperience'
import { motionBlur as warpMotionBlur } from '../app/warpTransition'
import { IntroConfig } from '../experiences/earth/config/introConfig'
import { SequenceState } from '../experiences/earth/config/sequenceState'
import { OrbitSystem } from '../experiences/earth/orbit/createOrbitSystem'
import { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'
import type { CornerLogo } from '../corner-logo/createCornerLogo'
import { CornerLogoHandle } from '../experiences/earth/timeline/useMasterTimeline'
import type { ExperienceId } from '../app/experience'
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

  // What the pipeline draws this frame. Called once per frame from inside its
  // useFrame, so it reads the mutable sequence state rather than props — a
  // per-frame prop would be a per-frame React render.
  //
  // The blur resolution lives here because it is a question about the
  // application's state, not about rendering: the intro's warp and the
  // Earth<->Murcia warp both feed the same afterimage pass, and the transition
  // wins because only one can be playing at a time and it is the one whose
  // progress is non-zero outside the intro.
  const readSettings = useCallback((): FrameSettings => {
    const warping = state.transitionProgress > 0
    return {
      route: earthActive ? 'composer' : warping ? 'direct-composited' : 'direct',
      motionBlur: warping ? warpMotionBlur(state.transitionProgress) : state.motionBlur,
      afterimageDampMax: config.afterimageDampMax,
      bloomStrength: config.bloomStrength,
      bloomRadius: config.bloomRadius,
      bloomThreshold: config.bloomThreshold,
    }
  }, [state, config, earthActive])

  return (
    <Canvas
      className="scene-canvas"
      camera={{ fov: config.normalFov, near: 0.1, far: 5000, position: [0, 0, 200] }}
      gl={{ antialias: true }}
    >
      {/* Earth, as one thing. This file used to mount all eight of its layers
          itself — in the right order, with the right props — which meant the
          application knew the experience's internal composition (§26, §33). */}
      <EarthExperience
        active={earthActive}
        config={config}
        state={state}
        overlayEl={overlayEl}
        orbitSystemRef={orbitSystemRef}
        interactionRef={interactionRef}
        onSelectCase={onSelectCase}
        onDeselectCase={onDeselectCase}
        onSelectDestination={onSelectDestination}
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
      {/* Every decision the pipeline used to make for itself is made here:
          which experience is showing, whether a transition is playing, and
          which of two blur sources wins. The pipeline gets numbers and a
          route. Murcia and the corner logo satisfy RenderableExperience and
          OverlayPass structurally — neither needed a change. */}
      <RenderPipeline
        readSettings={readSettings}
        directRef={murciaRef}
        overlayRef={logoRef}
      />
    </Canvas>
  )
}
