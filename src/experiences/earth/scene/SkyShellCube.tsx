import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { backdropVisible } from '../config/sceneVisibility'
import { loadProgress } from '../../../loading/progress'
import { skyOrientation } from './space/galaxyBand'
import { SPACE_CONFIG } from './space/spaceConfig'
import { PROTO_SKY, protoSkyFaceUrls } from '../../../app/protoSky'
import shellVertexShader from '../shaders/sky/shell.vert.glsl'
import shellCubeFragmentShader from '../shaders/sky/shellCube.frag.glsl'

// The prototype sky shell: SkyShell.tsx with a cubemap where the panorama was.
//
// Structurally identical on purpose — same radius, same BackSide, same
// renderOrder -1000, same `backdropVisible` gate, same mount-invisible-from-
// frame-one so EarthScene's compileAsync warm-up covers this material too. If
// this differed from the shipped shell in any of those, a difference in the
// screenshots would no longer be a difference in the SKY, which is the only
// thing the comparison is allowed to be measuring.
//
// Rendered ONLY when `?sky=<variant>` names a cubemap, and only in a build
// where DEBUG_TOOLS_ENABLED is true. See app/protoSky.ts.

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

function placeholderCube(): THREE.CubeTexture {
  const face = () => {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    t.needsUpdate = true
    return t
  }
  // Black rather than undefined, so a failed or slow load is a black sky rather
  // than whatever the driver had in that texture unit.
  const cube = new THREE.CubeTexture([
    face().image,
    face().image,
    face().image,
    face().image,
    face().image,
    face().image,
  ])
  cube.needsUpdate = true
  return cube
}

export function SkyShellCube({ config, state, active }: Props) {
  const mesh = useRef<THREE.Mesh>(null)
  const { gl } = useThree()

  const placeholder = useMemo(placeholderCube, [])
  const [sky, setSky] = useState<THREE.CubeTexture | null>(null)
  const uploaded = useRef(false)

  const geometry = useMemo(
    () => new THREE.SphereGeometry(SPACE_CONFIG.sky.shellRadius, 48, 32),
    [],
  )

  // The prototype's own yaw/tilt, NOT the shipped skyBandTilt/skyBandYaw — a
  // baked sky has its own idea of where its best region is, and the shipped
  // pair is aiming the photograph's galactic band.
  const orientation = useMemo(
    () => skyOrientation(PROTO_SKY.tiltDegrees, PROTO_SKY.yawDegrees),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        // Full shape at construction, same reason as SkyShell: adding a uniform
        // on first use would move a shader compile onto the cut.
        uniforms: {
          uSkyCube: { value: placeholder },
          uSkyOrientation: { value: new THREE.Matrix3() },
          uSkyBrightness: { value: PROTO_SKY.brightness },
          uSkyContrast: { value: PROTO_SKY.contrast },
        },
        vertexShader: shellVertexShader,
        fragmentShader: shellCubeFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: false,
      }),
    [placeholder],
  )

  useEffect(() => {
    const variant = PROTO_SKY.variant
    if (variant === null) return
    let cancelled = false

    const urls = protoSkyFaceUrls(variant, PROTO_SKY.resolution)
    new THREE.CubeTextureLoader().load(
      urls,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        // Same decode as the shipped shell: the faces are authored in sRGB and
        // this material writes LINEAR into the composer, whose OutputPass does
        // the conversion once. The editor renders linear with no tone mapping,
        // so its exported PNG bytes are literally what the author saw — which
        // is what makes step 3's viewport capture a real check on this line
        // rather than a formality. If the in-scene render does not match it,
        // NoColorSpace is the alternative, and which one won is a finding.
        texture.colorSpace = THREE.SRGBColorSpace
        // Off for VRAM, not for the seam: a cubemap has no branch cut, so the
        // reason SPACE_CONFIG.sky.generateMipmaps is false does not apply here.
        // 6 x 4096^2 RGBA is already 402 MB; mips would add a third again.
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter

        setSky(texture)
        loadProgress.markDone('sky:panorama')
      },
      undefined,
      () => {
        if (cancelled) return
        // markDone, not markFatal — `sky:panorama` is a REQUIRED step, and a
        // step left at 0 holds the boot to its 45s deadline and then kills it.
        // The prototype must not be able to break the boot it is measured in.
        console.warn(`[proto-sky] no cubemap loaded for variant "${variant}" at ${PROTO_SKY.resolution}`)
        loadProgress.markDone('sky:panorama')
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => placeholder.dispose(), [placeholder])
  useEffect(() => () => sky?.dispose(), [sky])

  useFrame(() => {
    if (!active) return

    if (sky && !uploaded.current) {
      gl.initTexture(sky)
      material.uniforms.uSkyCube.value = sky
      uploaded.current = true
    }

    material.uniforms.uSkyOrientation.value = orientation

    if (mesh.current) {
      mesh.current.visible = uploaded.current && backdropVisible(state, config)
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
