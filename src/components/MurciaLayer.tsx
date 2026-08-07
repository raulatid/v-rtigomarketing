import { RefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'
// Imported here rather than from main.tsx so it rides the scene chunk with the
// code that uses it, instead of the entry chunk's stylesheet.
import '../experiences/murcia/styles/murcia.css'

interface Props {
  active: boolean
  experienceRef: RefObject<MurciaExperience | null>
  onReady?: () => void
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
export function MurciaLayer({ active, experienceRef, onReady }: Props) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
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

      experience = new Ctor(host, gl)
      // Before load(), so the camera is constructed with the real aspect and
      // the first bounds computation uses the real footprint.
      experience.setViewport({
        width: size.width,
        height: size.height,
        aspect: size.width / Math.max(size.height, 1),
      })

      await experience.load()
      if (disposed) {
        experience.dispose()
        experience = null
        return
      }

      experienceRef.current = experience
      experience.setActive(activeRef.current)
      host.style.display = activeRef.current ? '' : 'none'
      onReadyRef.current?.()
    }

    void build()

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
    experienceRef.current?.update(Math.min(delta, 0.1))
  })

  return null
}
