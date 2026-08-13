import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { backdropVisible } from '../sceneVisibility'
import { prefersReducedMotion } from '../app/warpTransition'
import { generateStarField } from '../space/starDistribution'
import { createStarMaterial } from '../space/starShader'
import { SPACE_CONFIG } from '../space/spaceConfig'
import { clampFrameDelta } from '../graphics/frameDelta'

// The persistent star field the resting scene sits in.
//
// This is NOT the warp tunnel. `Starfield` is a dense near-field box that
// exists to be stretched by the FOV surge and smeared by the afterimage pass;
// it is gated OFF at the warp's cut. This one is gated ON at the same instant
// and stays for the rest of the app's life. The two have contradictory
// requirements (near vs far, additive vs plain, attenuated vs not), which is
// why they are two systems rather than one.
//
// ── The shell guarantee ──
// Every point sits at radius ~backdropRadius from the origin. The camera orbits
// inside that at most `zoomMax` (22 world units), looking inward at an Earth of
// radius 2 at the origin. A point on a shell that encloses the camera can never
// lie between the camera and the origin — the shell point along the camera's
// own view ray is BEHIND it, and every other one is off-axis. So no star can
// render over the planet, by construction rather than by luck.
//
// `generateStarField` clusters ANGULARLY for exactly this reason; it never
// touches the radius. `checks/space-backdrop.ts` section 2 asserts it across
// four cluster strengths and three band tilts.
//
// Keep the radius well clear of INTERACTION_CONFIG.camera.zoomMax if zoom is
// ever retuned. That is the one invariant here.
//
// ── One draw call, not three ──
// The shipped version needed a `Points` per magnitude tier because
// `PointsMaterial` has no per-point size, so the sky was 70/25/5% split across
// three fixed sizes. `starShader` reads an `aSize` attribute instead, which
// makes magnitude continuous AND collapses the three draw calls into one.

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

export function SpaceBackdrop({ config, state, active }: Props) {
  const points = useRef<THREE.Points>(null)
  const elapsed = useRef(0)
  // Read once, as MurciaLayer does. The media query is impure, so it stays out
  // of the per-frame path.
  const reducedMotion = useMemo(prefersReducedMotion, [])

  const geometry = useMemo(() => {
    const field = generateStarField({
      count: config.backdropStarCount,
      radius: config.backdropRadius,
      jitter: config.backdropJitter,
      clusterStrength: config.backdropClusterStrength,
      // Shared with the sky panorama, so the stars and the photographed gas
      // cannot disagree about where the galaxy is. That agreement is the whole
      // design, and `skyOrientation` is the other half of it.
      bandTiltDegrees: config.skyBandTilt,
      bandWidth: config.skyBandWidth,
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(field.positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(field.colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(field.phases, 1))
    // Nothing culls a shell that encloses the camera, and computing a bounding
    // sphere for it is pointless work.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), config.backdropRadius * 2)
    return g
  }, [
    config.backdropStarCount,
    config.backdropRadius,
    config.backdropJitter,
    config.backdropClusterStrength,
    config.skyBandTilt,
    config.skyBandWidth,
  ])

  const material = useMemo(() => createStarMaterial(), [])

  // Geometry and material go to R3F as PROPS, and R3F disposes only the object
  // it created — THREE.Points has no dispose() and prop-attached resources are
  // never walked. Without this they leak on unmount and again every time the
  // memo above rebuilds, which the debug sliders do per drag tick.
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    if (!active) return
    if (points.current) points.current.visible = backdropVisible(state, config)

    // Ambient motion on its own accumulator, not the GSAP clock — the same
    // narrow exception the Earth's spin and the satellites' orbits already use.
    // Delta is clamped so a backgrounded tab cannot jump the phase.
    elapsed.current += clampFrameDelta(delta)
    material.uniforms.uTime.value = elapsed.current
    material.uniforms.uTwinkleAmount.value = reducedMotion ? 0 : config.backdropTwinkle
    material.uniforms.uTwinkleSizeMin.value = SPACE_CONFIG.star.twinkleSizeMin
  })

  return (
    // Mounted (invisible) from the first frame so EarthScene's scene-level
    // compileAsync warm-up covers this material. compile() traverses invisible
    // objects, so no visibility toggling is needed — but an object mounted
    // later would compile on the frame it appears, which here is the cut: the
    // single worst frame in the sequence.
    <points
      ref={points}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      visible={false}
    />
  )
}
