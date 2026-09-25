import { prefersReducedMotion } from '../../platform/motionPreference'
import { RefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { MurciaExperience } from './MurciaExperience'
import type { ViewpointClaim } from './observer/viewClient'
import { loadProgress } from '../../loading/progress'
import type { NavigationView } from '../../interaction/navigationSignals'
import { WARP_LIMITS, dollyAmount } from '../../utils/warpTransition'
import { BUILT_ASSETS_AVAILABLE, DEBUG_TOOLS_ENABLED } from '../../platform/buildFlags'
import { clampFrameDelta } from '../../graphics/frameDelta'
// Imported here rather than from main.tsx so it rides the scene chunk with the
// code that uses it, instead of the entry chunk's stylesheet.
import './styles/murcia.css'

interface Props {
  active: boolean
  state: Pick<NavigationView, 'transitionProgress' | 'transitionCommitted' | 'zoomDepth'>
  experienceRef: RefObject<MurciaExperience | null>
  onReady?: () => void
  /** Forwarded to MurciaExperience: a district was engaged or released. */
  onAttentionChange?: () => void
  /**
   * The blog display's approach has arrived: push the route.
   *
   * Returns whether it was accepted — see `MurciaExperience`'s option of the
   * same name for why a refusal has to be visible to the scene.
   */
  onOpenBlog?: () => boolean
  /** That approach has just STARTED, three seconds before it needs the blog. */
  onBlogApproachStart?: () => void
  /** Forwarded to MurciaExperience: the final vantage point is held; the claim may be offered. */
  onViewpointReached?: (claim: ViewpointClaim) => void
}

// Drives the Murcia environment from R3F's frame loop.
//
// Thin on purpose: everything about the city lives in MurciaExperience and the
// modules beneath it, none of which changed in the migration. This component
// supplies only the three things the application owns — the renderer, the
// canvas size and the frame — plus the DOM container the environment's
// overlays mount into.
//
// It renders nothing into R3F's scene graph. Murcia has its OWN THREE.Scene
// (ADR 001), which RenderPipeline draws when this experience is showing.
//
// The module is imported DYNAMICALLY for the same reason the rest of the scene
// is: it pulls in GLTFLoader, DRACOLoader and the whole city stack, none of
// which may sit in the entry chunk.
export function MurciaLayer({
  active,
  state,
  experienceRef,
  onReady,
  onAttentionChange,
  onOpenBlog,
  onBlogApproachStart,
  onViewpointReached,
}: Props) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const dollyEngaged = useRef(false)
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  // Same ref treatment as onReady: the experience is built once, and a fresh
  // callback identity from a parent re-render must not rebuild the city.
  const onAttentionChangeRef = useRef(onAttentionChange)
  onAttentionChangeRef.current = onAttentionChange
  const onOpenBlogRef = useRef(onOpenBlog)
  onOpenBlogRef.current = onOpenBlog
  const onBlogApproachStartRef = useRef(onBlogApproachStart)
  onBlogApproachStartRef.current = onBlogApproachStart
  const onViewpointReachedRef = useRef(onViewpointReached)
  onViewpointReachedRef.current = onViewpointReached
  // build() is async, so the `active` effect below can run — and finish — long
  // before the experience exists. This is what the build applies on arrival so
  // a transition that happens mid-load is not silently dropped.
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    let disposed = false
    let experience: MurciaExperience | null = null

    // Murcia's overlays are position: fixed and were written assuming they own
    // the viewport. They mount into this element so the stylesheet can be
    // scoped to it, and so they can be removed in one move. pointer-events is
    // none on the container and re-enabled per child (see murcia.css) — a
    // full-viewport div that swallowed pointer events would kill canvas drag
    // for BOTH experiences.
    const host = document.createElement('div')
    host.className = 'murcia-ui'
    // Hidden until this experience is showing. It loads during the Earth intro
    // so the transition never waits on it, and its own "Loading city…" status
    // overlay would otherwise sit at z-index 16 on top of the intro.
    host.style.display = 'none'
    const parent = gl.domElement.parentElement ?? document.body
    parent.appendChild(host)
    hostRef.current = host

    const build = async () => {
      // Not until the intro has handed over.
      //
      // Everything below competes with the boot it is not part of: 1.26 MB of
      // city, the Draco and Basis decoders (707 KB of wasm between them) and a
      // KTX2 bake, all fetched by three's FileLoader over XHR — which Chrome
      // gives HIGH priority, while the Earth textures readiness actually waits
      // for are preloaded LOW so they cannot out-rank the app chunk. Neither
      // decision is wrong alone; together they invert the intended order
      // (audit 2026-08-27, P1-D). And the bytes are the smaller half: the Draco
      // parse and the GPU warm run on the same main thread the drawing is
      // animating on.
      //
      // Waiting costs nothing that is visible. Navigation already requires BOTH
      // `murciaReady` AND phase `site` (App.tsx's canNavigate), so the city can
      // never be reached before it is built — deferring it moves work off the
      // critical path rather than making the viewer wait for it later.
      //
      // `completed` and not `scene-ready`: readiness is when the scene COULD be
      // shown, and the drawing keeps running for its own ending after that.
      // The intro's last second is still the intro.
      //
      // Missing boot entry is the one case that must not wait forever — the
      // page was assembled wrong, useIntroDraw fails open, and so does this.
      const intro = window.__vertigoIntro
      if (intro) await intro.completed
      if (disposed) return

      const { MurciaExperience: Ctor } = await import(
        './MurciaExperience'
      )
      if (disposed) return

      // Counts how many times the city has been BUILT in this document.
      //
      // The acceptance criterion for the whole blog feature is that a round trip
      // through it does not rebuild the scene, and this is the cheapest thing
      // that can say so: this runs once per Canvas lifetime, so a second
      // increment means the Canvas remounted — the rebuild ADR 003 exists to
      // prevent. Compiled out of production with the rest of the debug tools.
      if (DEBUG_TOOLS_ENABLED) {
        const scope = window as unknown as Record<string, number>
        scope.__vertigoMurciaBuilds = (scope.__vertigoMurciaBuilds ?? 0) + 1
      }

      experience = new Ctor(host, gl, {
        debugTools: DEBUG_TOOLS_ENABLED,
        onAttentionChange: () => onAttentionChangeRef.current?.(),
        // `?? false` rather than a bare call: an absent handler means nothing
        // will change the route, and the approach has to hear that as a refusal
        // rather than as consent it can park behind.
        onOpenBlog: () => onOpenBlogRef.current?.() ?? false,
        onBlogApproachStart: () => onBlogApproachStartRef.current?.(),
        onViewpointReached: (claim) => onViewpointReachedRef.current?.(claim),
        // NOT `DEBUG_TOOLS_ENABLED`, which is true under `vite preview` too —
        // and preview serves a real `dist/` with a real blog capture in it. This
        // asks the narrower question the page image actually needs: does this
        // build serve built assets at all?
        buildAssetsAvailable: BUILT_ASSETS_AVAILABLE,
      })
      // Before load(), so the camera is constructed with the real aspect and
      // the first bounds computation uses the real footprint.
      experience.setViewport({
        width: size.width,
        height: size.height,
        aspect: size.width / Math.max(size.height, 1),
      })

      // Byte progress only, and scaled: the last slice is held back for the
      // GPU warm below, because reporting 100% before the city can actually be
      // shown would make the drawing's fill lie — the same split the corner
      // logo uses for its compile.
      await experience.load({
        onProgress: (fraction) => loadProgress.setStep('murcia:model', fraction * 0.8),
      })
      if (disposed) {
        experience.dispose()
        experience = null
        return
      }

      // A city that could not load must not be offered. load() reports its own
      // failure on the status overlay and leaves the environment inert; the
      // step is deliberately left un-done rather than marked complete, which
      // is harmless because it is not a required one.
      if (!experience.isUsable) {
        experienceRef.current = experience
        return
      }

      // Compile and upload now rather than on the transition frame (ADR 004).
      // Failure here is not fatal to anything: the city still renders, just
      // with a hitch on first show, so it is reported and swallowed.
      try {
        await experience.warm()
      } catch (error) {
        console.warn('[murcia] GPU warm-up failed; first frame may hitch', error)
      }
      if (disposed) {
        experience.dispose()
        experience = null
        return
      }
      loadProgress.markDone('murcia:model')

      experienceRef.current = experience
      experience.setActive(activeRef.current)
      host.style.display = activeRef.current ? '' : 'none'
      onReadyRef.current?.()
    }

    // `murcia:model` is optional, so a rejection here cannot hold the intro —
    // but an uncaught one is still an unhandled rejection with no explanation,
    // and the globe marker silently stays inert. Say why instead.
    void build().catch((error) => {
      console.error('[murcia] module failed to load; the city will not be offered', error)
    })

    return () => {
      disposed = true
      experienceRef.current = null
      hostRef.current = null
      experience?.dispose()
      host.remove()
    }
    // Built once for the canvas's lifetime; `gl` is stable across it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    experienceRef.current?.setActive(active)
    const host = hostRef.current
    if (host) host.style.display = active ? '' : 'none'
  }, [active, experienceRef])

  useEffect(() => {
    experienceRef.current?.setViewport({
      width: size.width,
      height: size.height,
      aspect: size.width / Math.max(size.height, 1),
    })
  }, [size.width, size.height, experienceRef])

  // Priority 0, like every other simulation layer: the camera and rig must be
  // final before RenderPipeline (priority 1) draws. update() is itself a no-op
  // while inactive, so this costs one call per frame when Earth is showing.
  useFrame((_, delta) => {
    const experience = experienceRef.current
    if (!experience) return

    // The warp's camera move. Read from the mutable state object rather than a
    // prop, because a per-frame prop would mean a React render per frame.
    //
    // Only applied while this experience is the one showing: `dollyAmount`
    // reports the departing world's value before the cut and the arriving
    // world's after it, so applying it whenever a transition is playing would
    // move Murcia during Earth's half too.
    //
    // `departing` is what tells Murcia which move to make: rising away on the
    // way back to Earth, dropping in on the way down (ADR 006). It flips at the
    // cut in the same frame `active` does, and any disagreement between the two
    // for one frame is under a fully black flash.
    // Reduced motion suppresses the CINEMATIC's travel — an effect applied TO
    // the viewer — but never the zoom below, which is direct manipulation: 1:1
    // with their own fingers, and it stops the moment they stop. That is the
    // same split Earth makes, and it is why the zoom is written outside this
    // guard: a reduced-motion viewer pinching the city and watching it do
    // nothing was a real defect on the pose this replaced.
    //
    // Suppression here means DO NOTHING, not reset. The pose freezes wherever
    // the fingers left it and the scene swaps under the flash, which is the same
    // bargain reduced motion already strikes — it keeps the cut, and skips the
    // journey. Resetting instead would snap the city back to rest at the moment
    // of commit, in plain view, which is more motion rather than less.
    const p = state.transitionProgress

    // The viewer's own zoom, straight through. Persistent, so unlike the warp
    // pose there is no "back to rest" branch here — the only thing that returns
    // it to rest is the cut, and that writes the state this reads.
    //
    // Applied even while Earth is showing, so the city is already at the right
    // pose on the frame it becomes visible rather than easing into it afterwards
    // — `update()` is a no-op while inactive, which is what would otherwise make
    // the eased depth arrive late.
    //
    // `immediate` under a committed cinematic: the depth is reset at the cut and
    // an ease still running across that frame would leave the arriving city
    // pulling back toward a moving target.
    experience.setZoomDepth(state.zoomDepth, state.transitionCommitted)
    const suppressed = reducedMotion && state.transitionCommitted
    if (p > 0) {
      if (active && !suppressed) {
        const { amount, departing } = dollyAmount(p, WARP_LIMITS)
        experience.setWarpPose(amount, departing)
      }
    } else if (dollyEngaged.current) {
      // Pinned back to rest once, rather than left wherever the last frame
      // landed — a residual offset would persist for the session. Restores the
      // elevation as well as the distance, since amount 0 is rest on both legs.
      dollyEngaged.current = false
      experience.setWarpPose(0, false)
    }
    if (p > 0 && active && !suppressed) dollyEngaged.current = true

    experience.update(clampFrameDelta(delta))
  })

  return null
}
