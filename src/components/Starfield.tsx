import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { starsVisible } from '../sceneVisibility'

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

export function Starfield({ config, state, active }: Props) {
  const points = useRef<THREE.Points>(null)

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

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.9,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useFrame(() => {
    if (!active) return
    if (points.current) points.current.visible = starsVisible(state, config)
  })

  return <points ref={points} geometry={geometry} material={material} visible={false} />
}
