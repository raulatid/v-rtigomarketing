import { RefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'
import { loadProgress } from '../loading/progress'
import type { SequenceState } from '../experiences/earth/config/sequenceState'
import { dollyAmount, prefersReducedMotion } from '../app/warpTransition'
import { DEBUG_TOOLS_ENABLED } from '../app/buildFlags'
import { clampFrameDelta } from '../graphics/frameDelta'
// Imported here rather than from main.tsx so it rides the scene chunk with the
// code that uses it, instead of the entry chunk's stylesheet.
import '../experiences/murcia/styles/murcia.css'

interface Props {
  active: boolean
  state: SequenceState
  experienceRef: RefObject<MurciaExperience | null>
  onReady?: () => void
  /** Forwarded to MurciaExperience: a district was engaged or released. */
  onAttentionChange?: () => void
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
export function MurciaLayer({ active, state, experienceRef, onReady, onAttentionChange }: Props) {
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
      const { MurciaExperience: Ctor } = await import(
        '../experiences/murcia/MurciaExperience'
      )
      if (disposed) return

      experience = new Ctor(host, gl, {
        debugTools: DEBUG_TOOLS_ENABLED,
        onAttentionChange: () => onAttentionChangeRef.current?.(),
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
    const p = state.transitionProgress
    if (p > 0) {
      if (active && !reducedMotion) {
        const { amount, departing } = dollyAmount(p)
        experience.setWarpPose(amount, departing)
      }
    } else if (dollyEngaged.current) {
      // Pinned back to rest once, rather than left wherever the last frame
      // landed — a residual offset would persist for the session. Restores the
      // elevation as well as the distance, since amount 0 is rest on both legs.
      dollyEngaged.current = false
      experience.setWarpPose(0, false)
    }
    if (p > 0 && active && !reducedMotion) dollyEngaged.current = true

    experience.update(clampFrameDelta(delta))
  })

  return null
}
