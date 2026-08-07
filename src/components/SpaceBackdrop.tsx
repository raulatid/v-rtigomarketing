import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { backdropVisible } from '../sceneVisibility'
import { fibonacciSpherePoints, pointSeed } from '../utils/fibonacciSphere'

// The persistent star field the resting scene sits in — implements plan 004.
//
// This is NOT the warp tunnel. `Starfield` is a dense near-field box that exists
// to be stretched by the FOV surge and smeared by the afterimage pass; it is
// gated OFF at the warp's cut. This one is gated ON at the same instant and
// stays for the rest of the app's life. The two have contradictory requirements
// (near vs far, additive vs plain, attenuated vs not), which is why they are two
// systems rather than one — plan 004 §4.
//
// ── The shell guarantee ──
// Every point sits at radius ~BACKDROP_RADIUS from the origin. The camera orbits
// inside that at most `zoomMax` (22 world units), looking inward at an Earth of
// radius 2 at the origin. A point on a shell that encloses the camera can never
// lie between the camera and the origin — the shell point along the camera's own
// view ray is BEHIND it, and every other one is off-axis. So no star can render
// over the planet, by construction rather than by luck. Naively un-gating
// `Starfield` instead would put its interior points in front of the Earth.
//
// Keep the radius well clear of INTERACTION_CONFIG.camera.zoomMax if zoom is
// ever retuned. That is the one invariant here.

// Magnitude tiers. PointsMaterial has no per-point size, so the cheap idiom for
// a field that reads as a sky rather than as noise is a few Points objects with
// different sizes. Three extra draw calls of static geometry, no per-frame CPU.
const TIERS = [
  { share: 0.7, size: 1.0, opacity: 0.45 },
  { share: 0.25, size: 1.6, opacity: 0.72 },
  { share: 0.05, size: 2.6, opacity: 1.0 },
]

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

export function SpaceBackdrop({ config, state, active }: Props) {
  const group = useRef<THREE.Group>(null)

  const layers = useMemo(() => {
    const all = fibonacciSpherePoints(
      config.backdropStarCount,
      config.backdropRadius,
      config.backdropJitter,
    )

    // Bucket by a deterministic per-index seed rather than by contiguous index
    // ranges: the Fibonacci spiral walks pole to pole, so slicing it by range
    // would band the sky by latitude — all the bright stars in one stripe.
    const buckets: number[][] = TIERS.map(() => [])
    for (let i = 0; i < config.backdropStarCount; i++) {
      const seed = pointSeed(i)
      let acc = 0
      let tier = TIERS.length - 1
      for (let t = 0; t < TIERS.length; t++) {
        acc += TIERS[t].share
        if (seed < acc) {
          tier = t
          break
        }
      }
      buckets[tier].push(i)
    }

    return TIERS.map((tier, t) => {
      const indices = buckets[t]
      const positions = new Float32Array(indices.length * 3)
      indices.forEach((src, dst) => {
        positions[dst * 3] = all[src * 3]
        positions[dst * 3 + 1] = all[src * 3 + 1]
        positions[dst * 3 + 2] = all[src * 3 + 2]
      })

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      // Nothing culls a shell that encloses the camera, and computing a bounding
      // sphere for it is pointless work.
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), config.backdropRadius * 2)

      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        // sizeAttenuation:false is the one setting that must differ from both the
        // tunnel and the source project. At 180 units an attenuated point
        // collapses to sub-pixel and vanishes. Constant screen-space size is also
        // what real stars do — these values are pixels.
        size: tier.size,
        sizeAttenuation: false,
        transparent: true,
        opacity: tier.opacity,
        depthWrite: false,
        // Deliberately NOT additive. The tunnel is additive because it is a motion
        // effect; a backdrop blended additively would haze everything drawn after
        // it, including the Earth's limb.
      })

      return { geometry, material }
    })
  }, [config.backdropStarCount, config.backdropRadius, config.backdropJitter])

  useFrame(() => {
    if (!active) return
    if (group.current) group.current.visible = backdropVisible(state, config)
  })

  return (
    // Mounted (invisible) from the first frame so EarthScene's scene-level
    // compileAsync warm-up covers these three materials. compile() traverses
    // invisible objects, so no visibility toggling is needed — but an object
    // mounted later would compile on the frame it appears, which here is the
    // cut: the single worst frame in the sequence (DECISIONS.md, GPU warm-up).
    <group ref={group} visible={false}>
      {layers.map((layer, i) => (
        <points key={i} geometry={layer.geometry} material={layer.material} frustumCulled={false} />
      ))}
    </group>
  )
}
