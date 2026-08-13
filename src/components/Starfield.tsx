import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { starsVisible } from '../sceneVisibility'
import { createWarpStarMaterial, warpStarSizeScale } from '../space/warpStarShader'

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

// Leg 1 of the warp flies away from nothing — dolly-earth had a city to streak
// past, we don't (plan 002 §4). Without geometry the FOV surge has no parallax
// to act on and the composer has nothing to smear, so the warp reads as a black
// screen. This cloud is the minimum that fixes both: one draw call.
const BOX = { x: 300, y: 300, z: 500 }

// World-space point size, matching the `PointsMaterial` this replaced so the
// warp looks the same apart from the stars now being round rather than square.
const STAR_SIZE = 0.9

export function Starfield({ config, state, active }: Props) {
  const points = useRef<THREE.Points>(null)
  const { size, gl } = useThree()

  const geometry = useMemo(() => {
    const positions = new Float32Array(config.starCount * 3)
    for (let i = 0; i < config.starCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * BOX.x
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOX.y
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOX.z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [config.starCount])

  // Was a PointsMaterial, which draws every star as a SQUARE — a bare point
  // sprite is square unless the fragment shader rounds it, and bloom put a halo
  // on each one. Same size, same additive blending, same attenuation; round.
  const material = useMemo(createWarpStarMaterial, [])

  // Geometry and material are passed to R3F as PROPS, and R3F only disposes the
  // object it created — THREE.Points has no dispose(), and prop-attached
  // resources are never walked. So nothing here is released on unmount, or when
  // the memo above rebuilds: the debug star-count slider leaks one geometry per
  // drag tick.
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    if (!active) return
    if (points.current) points.current.visible = starsVisible(state, config)

    // three feeds `size` and `scale` to its own points shader but not to a raw
    // ShaderMaterial, so the attenuation factor is pushed here. Per frame
    // rather than in an effect because the pixel ratio can change under the
    // app — dragging a window between displays of different density does it.
    material.uniforms.uSizeScale.value = warpStarSizeScale(
      STAR_SIZE,
      gl.getPixelRatio(),
      size.height,
    )
  })

  return <points ref={points} geometry={geometry} material={material} visible={false} />
}
