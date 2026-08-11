import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { backdropVisible } from '../sceneVisibility'
import { createNebulaBake } from '../space/bakeNebulaCubemap'
import { SPACE_CONFIG } from '../space/spaceConfig'
import shellVertexShader from '../shaders/nebula/shell.vert.glsl'
import shellFragmentShader from '../shaders/nebula/shell.frag.glsl'

// The galaxy. An inverted sphere sampling a cubemap that is generated on the
// GPU during P0 and never touched again — zero download bytes, and after the
// bake, one draw call and one texture fetch per frame.
//
// ── It cannot occlude anything ──
// The material is OPAQUE with renderOrder -1000, so it is drawn before every
// other object in the scene and writes no depth. That makes non-occlusion a
// property of the render order rather than of the geometry, which is why the
// shell's radius is free to be anything inside the camera's far plane. The
// STAR shell's guarantee is separate and geometric; see SpaceBackdrop.
//
// ── It arrives with the Earth ──
// Gated on `backdropVisible`, exactly like the star shell, so the galaxy
// appears in the same frame the Earth cuts in — under the overlay flash and
// peak blur that already conceal that substitution. Nothing ever cross-fades.
//
// Mounted invisible from the first frame so EarthScene's scene-level
// compileAsync warm-up covers this material. Mounting it later would move a
// shader compile onto the cut, the single worst frame in the sequence.

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

export function NebulaShell({ config, state, active }: Props) {
  const mesh = useRef<THREE.Mesh>(null)
  const { gl } = useThree()

  // The nebula sliders invalidate the CUBEMAP, not merely a buffer, so a raw
  // dependency on them would build and throw away a 25 MB render target on
  // every drag tick. Debounced here rather than in the overlay so the
  // component owns its own cost.
  const [bakeOptions, setBakeOptions] = useState({
    brightness: config.nebulaBrightness,
    dustDensity: config.nebulaDustDensity,
    bandTiltDegrees: config.nebulaBandTilt,
    bandWidth: config.nebulaBandWidth,
  })

  useEffect(() => {
    const id = window.setTimeout(
      () =>
        setBakeOptions({
          brightness: config.nebulaBrightness,
          dustDensity: config.nebulaDustDensity,
          bandTiltDegrees: config.nebulaBandTilt,
          bandWidth: config.nebulaBandWidth,
        }),
      250,
    )
    return () => window.clearTimeout(id)
  }, [
    config.nebulaBrightness,
    config.nebulaDustDensity,
    config.nebulaBandTilt,
    config.nebulaBandWidth,
  ])

  const bake = useMemo(() => createNebulaBake(bakeOptions), [bakeOptions])

  const geometry = useMemo(
    () => new THREE.SphereGeometry(SPACE_CONFIG.nebula.shellRadius, 48, 32),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uNebula: { value: bake.texture } },
        vertexShader: shellVertexShader,
        fragmentShader: shellFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        // Opaque: transparent objects are sorted by distance and drawn after
        // the opaque queue, which would put the sky on top of the Earth.
        transparent: false,
      }),
    [bake],
  )

  // Geometry and material go to R3F as PROPS, and R3F disposes only objects it
  // created — prop-attached resources are never walked. The bake additionally
  // owns a 25 MB cube render target, so a missed disposal here is expensive
  // rather than merely untidy, and the debug sliders rebuild it on change.
  useEffect(() => () => bake.dispose(), [bake])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    if (!active) return

    // One face per frame. Runs at the default useFrame priority, so it lands
    // before RenderPipeline's priority-1 callback and the render target is
    // restored before that callback needs it.
    if (!bake.isComplete()) bake.bakeNextFace(gl)

    if (mesh.current) {
      mesh.current.visible = bake.isComplete() && backdropVisible(state, config)
    }
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      renderOrder={-1000}
      frustumCulled={false}
      visible={false}
    />
  )
}
