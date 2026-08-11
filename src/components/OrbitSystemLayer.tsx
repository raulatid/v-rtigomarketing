import { RefObject, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createOrbitSystem, OrbitSystem } from '../orbit-system/createOrbitSystem'
import { EARTH_CONFIG } from '../earthConfig'

import { SequenceState } from '../sequenceState'
import { orbitsVisible } from '../sceneVisibility'
import { loadProgress } from '../loading/progress'

interface Props {
  state: SequenceState
  // Populated on mount so InteractionLayer can reach the system. Ordered first
  // in SceneCanvas so its effect runs before the consumer's.
  systemRef?: RefObject<OrbitSystem | null>
  active: boolean
}

// Mounts the orbit system at SCENE level — deliberately not inside the Earth's
// group. The Earth's spin group rotates its surface, and orbital motion must not
// compound with that.
//
// scale = EARTH_CONFIG.radius reconciles the two projects' scale conventions:
// every orbit preset is expressed in "Earth radius = 1" units.
export function OrbitSystemLayer({ state, systemRef, active }: Props) {
  const { gl } = useThree()
  const localSystem = useRef<OrbitSystem | null>(null)
  const groupRef = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const started = useRef(false)

  useEffect(() => {
    // `orbits:build` is a REQUIRED manifest entry and construction is
    // synchronous, so a throw in here used to skip the markDone below and leave
    // readiness pending forever — a permanent loading screen with no error.
    // The raster and the six orbit builds are the realistic failure: a canvas
    // 2D context can be refused under memory pressure.
    let system: OrbitSystem
    try {
      system = createOrbitSystem({ renderer: gl })
    } catch (error) {
      // Fatal, not degraded: the orbits carry the case studies, and the warp
      // cuts to an Earth that is meant to have them. Saying so gets the visitor
      // the Spanish failure caption instead of an endless wait.
      loadProgress.markFatal('orbits:build', String(error))
      console.error('[orbits] construction failed', error)
      return
    }

    system.group.visible = false
    localSystem.current = system
    if (systemRef) systemRef.current = system
    groupRef.current?.add(system.group)

    // Mounted (invisible) from the start so the scene-level compileAsync warm-up
    // in EarthScene covers these materials too — otherwise all six line
    // materials, the sprite materials and the cloud would compile on the frame
    // the reveal begins (plan 003 §3).
    //
    // Construction is synchronous and includes the 2048×1536 atlas raster, so
    // this lands after a real stall — reported so the drawing owns that pause
    // rather than being silently stuttered by it.
    loadProgress.markDone('orbits:build')

    return () => {
      localSystem.current = null
      if (systemRef) systemRef.current = null
      groupRef.current?.remove(system.group)
      system.dispose()
    }
    // Deliberately narrow. This effect builds AND disposes the entire orbit
    // system, so every extra dependency is another way to tear it all down and
    // rebuild it; `camera`, `scene` and a TextureLoader that createOrbitSystem
    // never used were all in here without being read.
  }, [systemRef, gl])

  useFrame((_, rawDelta) => {
    const system = localSystem.current
    if (!system) return

    // Frozen, not reset: the orbit clock stops advancing so satellites resume
    // exactly where they were rather than teleporting forward on return.
    if (!active) return

    const visible = orbitsVisible(state)
    system.group.visible = visible

    if (!visible) {
      // A replay rewinds the timeline past this phase; drop back to pre-reveal
      // so the draw-in plays again rather than appearing already complete.
      if (started.current) {
        started.current = false
        elapsed.current = 0
        system.reset()
      }
      return
    }

    started.current = true
    const delta = Math.min(rawDelta, 0.1)
    elapsed.current += delta

    // Ambient motion runs on its own accumulator rather than the GSAP clock.
    // The reveal's START is timeline-owned (the phase gate above), but orbiting
    // continues indefinitely after the timeline ends — the same pattern the
    // Earth's rotation and the corner logo's idle already use.
    system.update(delta, elapsed.current)
  })

  return <group ref={groupRef} scale={EARTH_CONFIG.radius} />
}
