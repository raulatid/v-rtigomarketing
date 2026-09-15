import type { AuditComposition } from '../interaction/auditComposition'
import type { NavigationView } from '../interaction/navigationSignals'
import { RefObject, useCallback, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { clampFrameDelta } from '../graphics/frameDelta'
import { EarthExperience } from '../experiences/earth/EarthExperience'
import type { InteractionHandle } from '../experiences/earth/EarthExperience'
import { CornerLogoLayer } from '../corner-logo/CornerLogoLayer'
import { MurciaLayer } from '../experiences/murcia/MurciaLayer'
import { RenderPipeline } from '../graphics/RenderPipeline'
import { DEBUG_TOOLS_ENABLED } from '../platform/buildFlags'
import type { FrameSettings, RenderRoute } from '../graphics/renderableExperience'
import {
  WARP_LIMITS,
  motionBlur as warpMotionBlur,
  prefersReducedMotion,
  transitionLeg,
  vacuumCommitted,
  vacuumScrub,
} from '../utils/warpTransition'
import { IntroConfig } from '../experiences/earth/config/introConfig'
import { SequenceState } from '../experiences/earth/config/sequenceState'
import { OrbitSystem } from '../experiences/earth/orbit/createOrbitSystem'
import type { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'
import type { CornerLogo } from '../corner-logo/createCornerLogo'
import type { CornerLogoHandle } from '../corner-logo/cornerLogoConfig'
import type { ExperienceId } from '../app/experience'
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'

/**
 * One `useFrame` whose only job is to advance the transition clock.
 *
 * A component rather than a call inside `SceneCanvas`, because `SceneCanvas`
 * renders the `<Canvas>` — it is OUTSIDE the R3F tree and cannot call
 * `useFrame` at all. Anything that needs the frame loop has to be a child.
 */
function TransitionClockDriver({ step }: { step: (dt: number) => void }) {
  useFrame((_, delta) => {
    // Clamped for the same reason every other consumer clamps: a tab returning
    // from the background hands over a delta measured in seconds, and a
    // cinematic that swallowed it whole would skip its own cut.
    step(clampFrameDelta(delta))
  })
  return null
}

interface Props {
  config: IntroConfig
  auditView: Readonly<AuditComposition>
  attention: Readonly<{ hintAllowed: boolean }>
  navigation: NavigationView
  state: SequenceState
  /**
   * Advances the Earth <-> Murcia cinematic by one frame.
   *
   * Driven from inside the Canvas rather than from a loop of its own, because
   * `RenderPipeline` reads `navigation.transitionProgress` in its own `useFrame`: a
   * separate rAF that happened to tick after R3F's would render every warp frame
   * one behind the progress that produced it.
   */
  stepTransition: (dt: number) => void
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
  /** A Murcia district was engaged or released — attention changed. */
  onMurciaAttentionChange: () => void
  /** The blog display's approach arrived. Returns whether the route changed. */
  onOpenBlog: () => boolean
  /** That approach just started, three seconds before it needs the blog. */
  onBlogApproachStart: () => void
  /** The WebGL context was lost. Nothing will draw again without a reload. */
  onContextLost: (reason: string) => void
  /**
   * The blog is showing, so stop drawing.
   *
   * THIS IS THE WHOLE SUSPENSION MECHANISM. It must be a `frameloop` change and
   * not a gate inside RenderPipeline: that callback runs at useFrame priority 1,
   * which takes gl.render() away from R3F, so an early return there leaves a
   * BLANK canvas rather than a frozen one. Stopping the loop above it keeps the
   * last completed frame in the drawing buffer, which is what makes the return
   * free.
   *
   * Nothing is disposed. The context, the composer, the city and the shared
   * decoder pools all stay exactly as they were (ADR 003, adr/013).
   */
  suspended: boolean
}

// Both the starfield and the Earth stay mounted for the whole sequence and
// toggle `visible` from shared state. Nothing unmounts mid-flight, so there is
// no suspense flash or shader recompile at the cut.
export function SceneCanvas({
  config,
  state,
  navigation,
  attention,
  auditView,
  stepTransition,
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
  onMurciaAttentionChange,
  onOpenBlog,
  onBlogApproachStart,
  onContextLost,
  suspended,
}: Props) {
  // Earth stays mounted whichever experience is showing; this only decides
  // whether it consumes input and does per-frame work (ADR 003).
  const earthActive = activeExperience === 'earth'

  // What the pipeline draws this frame. Called once per frame from inside its
  // useFrame, so it reads the live intro and navigation channels — a
  // per-frame prop would be a per-frame React render.
  //
  // The blur resolution lives here because it is a question about the
  // application's state, not about rendering: the intro's warp and the
  // Earth<->Murcia warp both feed the same afterimage pass, and the transition
  // wins because only one can be playing at a time and it is the one whose
  // progress is non-zero outside the intro.
  // Read once, like every other consumer of the preference in this project —
  // a second matchMedia per component is how two parts of one page end up
  // disagreeing about the same setting.
  const reducedMotion = useRef(prefersReducedMotion())

  /**
   * How far the scrub had got when the viewer committed.
   *
   * LOAD-BEARING, not an optimisation. Once committed the vacuum rides the
   * speed bell, and `speed(0)` is exactly 0 — so reading the bell alone would
   * snap the effect back to nothing on the first committed frame, which is a
   * visible flinch at the precise moment the viewer has succeeded. The latch
   * carries it from wherever it had reached up to full instead.
   */
  const vacuumAtCommit = useRef(0)

  /** Which world the last frame drew, so the substitution can be seen happening. */
  const lastWorldWasEarth = useRef(earthActive)

  const readSettings = useCallback((): FrameSettings => {
    const warping = navigation.transitionProgress > 0
    const motionBlur = warping ? warpMotionBlur(navigation.transitionProgress, WARP_LIMITS) : state.motionBlur
    // Gated on the BLUR, not on the warp being non-zero, and that distinction
    // only started to matter when the gesture began driving the warp.
    //
    // `direct-composited` exists to lend the direct experience the composer's
    // afterimage — which is most of what makes a warp read as one. `speed()` is
    // exactly zero for the whole lower half of the scrub band (its bell is
    // `cut ± speedPeakWidth`, and the band ends at `cut - flashWidth`), so the
    // cheap route covers the part of the gesture that has nothing to composite
    // anyway.
    // ── The vacuum ──
    //
    // Murcia only, and only on the way OUT. Earth's departure is a dive toward
    // a planet and already has the FOV surge to sell it; the city's is an
    // ascent away from something, which is what the radial stretch is for.
    //
    // Suppressed under reduced motion by HOLDING AT ZERO rather than by
    // resetting: this is a full-frame distortion applied TO the viewer, which is
    // exactly the class of effect the preference is about. The flash and the cut
    // still play, because concealing a jump is not a motion effect.
    // The substitution, detected rather than signalled: the cut is the frame the
    // world changes, and this is the only place that sees both sides of it.
    const resetAccumulation = lastWorldWasEarth.current !== earthActive
    lastWorldWasEarth.current = earthActive

    let vacuum = 0
    if (!earthActive && !reducedMotion.current) {
      if (navigation.transitionCommitted) {
        // Only on the DEPARTING leg. Murcia is also the visible world for the
        // second half of an arrival, and an ascent effect playing on a descent
        // flattens the one difference between the two legs — the sandbox gates it
        // the same way. Zero there rather than the bell: `vacuumAtCommit` is 0 on
        // arrival, so the bell alone would run the vacuum at full as the flash lifts.
        vacuum = transitionLeg(navigation.transitionProgress, WARP_LIMITS).departing
          ? vacuumCommitted(vacuumAtCommit.current, navigation.transitionProgress, WARP_LIMITS)
          : 0
      } else {
        vacuum = vacuumScrub(navigation.approach, WARP_LIMITS)
        vacuumAtCommit.current = vacuum
      }
    } else {
      vacuumAtCommit.current = 0
    }

    // Gated on the vacuum as well as the blur. The pass is a composer pass, so a
    // scrub that distorts the frame has to be on the borrowed route even before
    // the cinematic's smear starts — otherwise the effect would appear only at
    // the commit, which is the half of the gesture it exists to precede.
    const route: RenderRoute = earthActive
      ? 'composer'
      : motionBlur > 0 || vacuum > 0
        ? 'direct-composited'
        : 'direct'
    return {
      route,
      motionBlur,
      afterimageDampMax: config.afterimageDampMax,
      // WITHHELD on the borrowed route, and that is the whole point of naming
      // it. Borrowing the composer also brings its bloom pass, which is Earth's
      // — tuned for a black sky, thresholding at 0.62 — and Murcia's ground is
      // a diffuse plate under 2.7 of irradiance. It clears that threshold, so
      // the city used to light up the moment the route flipped: invisible
      // inside a 1.6s cinematic, a step change during a scrub, held for as long
      // as the viewer hesitated. Murcia borrows the smear and nothing else.
      bloomStrength: route === 'direct-composited' ? 0 : config.bloomStrength,
      bloomRadius: config.bloomRadius,
      bloomThreshold: config.bloomThreshold,
      vacuum,
      resetAccumulation,
    }
  }, [state, navigation, config, earthActive])

  return (
    <Canvas
      className="scene-canvas"
      // Visible in DevTools rather than only in React state: when someone is
      // looking at a frozen scene wondering why, the answer should be on the
      // element.
      data-suspended={String(suspended)}
      frameloop={suspended ? 'never' : 'always'}
      // OFFSET size, not the client rect. R3F's default measures its container
      // with `getBoundingClientRect()`, and a client rect includes every
      // ancestor transform. The phone menu turns the wrapper around this canvas
      // into a card that recedes and tilts (styles.css, `.app__viewport`); with
      // the default, the first window resize or scroll while the menu is open
      // would re-measure the tilted, shrunken rect and push it into
      // gl.setSize → composer.setSize → MurciaExperience.setViewport — the
      // exact cascade App.tsx's wrapper comment exists to prevent. Offset size
      // is layout size and a transform does not touch it, so the drawing
      // buffer stays the viewport's whatever the card is doing.
      resize={{ offsetSize: true }}
      camera={{ fov: config.normalFov, near: 0.1, far: 5000, position: [0, 0, 200] }}
      // Explicit, and that is the point. Until 2026-08-14 this was the only
      // renderer configuration in the codebase, so `dpr`, `alpha` and
      // `powerPreference` were all whatever @react-three/fiber happened to
      // default to. A pixel-ratio cap used to be owned deliberately — see the
      // note at the top of `experiences/murcia/config/appConfig.ts`, which
      // removed it on the grounds that it "belongs to whoever creates the
      // WebGLRenderer". That move never landed at the new owner, and the site
      // has been capped at 2x by a library default ever since: correct, and
      // held by nothing.
      //
      // [1, 2] is the same value R3F defaults to, so this changes no pixels.
      // What it changes is that a dependency bump can no longer move it
      // silently, and that the cap has somewhere to be argued about. A 3x
      // iPhone renders 2.25x fewer pixels through the post chain than its
      // display would ask for, which is the whole reason the cap exists.
      dpr={[1, 2]}
      gl={{
        antialias: true,
        // R3F defaults this to TRUE, and nothing here wants a see-through
        // scene: SkyShell is an opaque mesh at renderOrder -1000 and Murcia
        // sets scene.background, so there is never anything behind the canvas
        // worth showing.
        //
        // WHAT THIS DOES NOT BUY is the compositing saving this comment used to
        // claim. `three` builds its WebGL context attributes with a hardcoded
        // `alpha: true`, so the drawing buffer is allocated with an alpha
        // channel whatever is asked for here; the 2026-08-27 performance audit
        // read `{alpha: true, …}` back off the live context (P2-L). The request
        // is honoured in-engine only.
        //
        // It is kept because the in-engine half is the half that matters here:
        // it is what makes the opaque clear below correct. Nobody should
        // re-derive a per-frame composite saving from this line — that saving
        // is decided by the context attribute, and the context attribute is
        // not ours.
        alpha: false,
      }}
      onCreated={({ gl }) => {
        // A window probe for the e2e round trip, compiled out of production by the
        // same constant that removes the debug overlay.
        //
        // `frame` is the only observable that can prove `frameloop="never"`
        // actually suspends — nothing else in the suite watches the render loop.
        // `geometries`/`textures` show the scene was not disposed and rebuilt,
        // but only alongside DOM node identity: a full teardown plus rebuild can
        // land on the same counts, so equality is necessary and not sufficient.
        if (DEBUG_TOOLS_ENABLED) {
          ;(window as unknown as Record<string, unknown>).__vertigoGl = () => ({
            geometries: gl.info.memory.geometries,
            textures: gl.info.memory.textures,
            frame: gl.info.render.frame,
          })
        }
        // Required BY the line above, not incidental to it. With alpha off the
        // canvas is cleared to an opaque colour instead of showing the page
        // through, and three's default is pure black — which would have
        // silently changed the intro's backdrop from #050507 to #000000 for
        // the seconds before the sky arrives. index.html paints #050507 as the
        // opening black; this keeps the canvas agreeing with it.
        gl.setClearColor(0x050507, 1)
      }}
    >
      {/* Earth, as one thing. This file used to mount all eight of its layers
          itself — in the right order, with the right props — which meant the
          application knew the experience's internal composition (§26, §33). */}
      {/* FIRST inside the Canvas, so the progress every other layer reads this
          frame is this frame's. R3F runs same-priority frame callbacks in mount
          order, and every consumer below is priority 0. */}
      <TransitionClockDriver step={stepTransition} />
      <EarthExperience
        navigation={navigation}
        attention={attention}
        auditView={auditView}
        active={earthActive}
        config={config}
        state={state}
        overlayEl={overlayEl}
        orbitSystemRef={orbitSystemRef}
        interactionRef={interactionRef}
        onSelectCase={onSelectCase}
        onDeselectCase={onDeselectCase}
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
        state={navigation}
        experienceRef={murciaRef}
        onReady={onMurciaReady}
        onAttentionChange={onMurciaAttentionChange}
        onOpenBlog={onOpenBlog}
        onBlogApproachStart={onBlogApproachStart}
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
        onContextLost={onContextLost}
      />
    </Canvas>
  )
}
