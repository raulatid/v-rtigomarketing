import { useMemo, useEffect, useRef } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import earthVert from '../shaders/earth/vertex.glsl'
import earthFrag from '../shaders/earth/fragment.glsl'
import atmosphereVert from '../shaders/atmosphere/vertex.glsl'
import atmosphereFrag from '../shaders/atmosphere/fragment.glsl'
import { EARTH_CONFIG } from '../earthConfig'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import { earthVisible } from '../sceneVisibility'
import { loadProgress } from '../loading/progress'
import { GeoMarkersLayer } from './GeoMarkersLayer'

interface Props {
  config: IntroConfig
  state: SequenceState
}

// TextureLoader goes through ImageLoader, which decodes an <img> and reports no
// byte progress at all — so this step advances per file, in thirds. Coarse, but
// honest; the alternative is a fake smooth ramp. The manager is module-level
// because R3F caches one loader instance per Loader class.
const earthManager = new THREE.LoadingManager()
earthManager.onProgress = (_url, loaded, total) =>
  loadProgress.report('earth:textures', loaded, total)
earthManager.onLoad = () => loadProgress.markDone('earth:textures')
// Required: the warp's cut reveals the Earth, so without these maps there is no
// valid first frame. Fatal rather than a silent hold at the pre-ready limit.
earthManager.onError = (url) =>
  loadProgress.markFatal('earth:textures', `failed to load ${url}`)

// Ported from dolly-earth. The tuning-panel plumbing is dropped — these values
// are fixed for the intro. Radius stays at 2 so a future orbit system can be
// added as a sibling group with scale={2} (see plan 002 "Scope").
export function EarthScene({ config, state }: Props) {
  const [dayTex, nightTex, specTex] = useLoader(
    THREE.TextureLoader,
    ['/earth/day.jpg', '/earth/night.jpg', '/earth/specularClouds.jpg'],
    (loader) => {
      loader.manager = earthManager
    },
  )

  const { gl, scene, camera } = useThree()

  useEffect(() => {
    dayTex.colorSpace = THREE.SRGBColorSpace
    nightTex.colorSpace = THREE.SRGBColorSpace
    dayTex.anisotropy = 8
    nightTex.anisotropy = 8
    specTex.anisotropy = 8

    // GPU warm-up (plan 003 §3). Decoded-on-CPU is not uploaded-on-GPU: without
    // this, the three 4096×2048 uploads (+mipmaps) and both custom shader
    // compiles are all paid on the single frame the Earth becomes visible —
    // mid-warp, the fastest moment of the sequence (measured 326ms stall).
    // P0's ~5.5s of full-screen cover is the warm-up window instead.
    let cancelled = false
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const warmUp = async () => {
      // One upload per frame: each 4096×2048 map costs tens of ms to upload
      // and mip, and the draw animation is live behind this — never stack them.
      const maps = [dayTex, nightTex, specTex]
      for (let i = 0; i < maps.length; i++) {
        if (cancelled) return
        gl.initTexture(maps[i])
        // Reported as it goes rather than at the end: these uploads are the
        // longest stalls in P0, and the drawing must be seen to be waiting on
        // them rather than sitting still for no visible reason.
        loadProgress.report('gpu:warmup', i + 1, maps.length + 1)
        await nextFrame()
      }
      try {
        // compile() collects materials with scene.traverse, so the invisible
        // Earth group IS included; async so KHR_parallel_shader_compile can
        // link off the critical path. Covers the starfield material too.
        await gl.compileAsync(scene, camera)
      } catch {
        // Fall back to compile-on-first-render rather than blocking the gate.
      }
      // The drawing waits on this — set it only once the GPU is actually warm,
      // not merely when the JPEGs have decoded.
      if (!cancelled) {
        state.earthReady = true
        loadProgress.markDone('gpu:warmup')
      }
    }
    warmUp()
    return () => {
      cancelled = true
    }
  }, [dayTex, nightTex, specTex, gl, scene, camera, state])

  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const earthRef = useRef<THREE.Mesh>(null)

  const sunDirection = useMemo(() => {
    const { sunAzimuth, sunElevation } = EARTH_CONFIG
    return new THREE.Vector3(
      Math.cos(sunElevation) * Math.sin(sunAzimuth),
      Math.sin(sunElevation),
      Math.cos(sunElevation) * Math.cos(sunAzimuth),
    ).normalize()
  }, [])

  const earthUniforms = useMemo(
    () => ({
      uDayTexture: { value: dayTex },
      uNightTexture: { value: nightTex },
      uSpecularCloudsTexture: { value: specTex },
      uSunDirection: { value: sunDirection.clone() },
      uAtmosphereDayColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereDayColor) },
      uAtmosphereTwilightColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereTwilightColor) },
      uCloudIntensity: { value: EARTH_CONFIG.cloudIntensity },
      uSpecularIntensity: { value: EARTH_CONFIG.specularIntensity },
      uNightIntensity: { value: EARTH_CONFIG.nightIntensity },
    }),
    [dayTex, nightTex, specTex, sunDirection],
  )

  const atmosphereUniforms = useMemo(
    () => ({
      uSunDirection: { value: sunDirection.clone() },
      uAtmosphereDayColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereDayColor) },
      uAtmosphereTwilightColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereTwilightColor) },
    }),
    [sunDirection],
  )

  // Visibility is read from shared state, not props — a per-frame prop would
  // mean a React render per frame (plan 002 §1.2).
  //
  // Only the spin group rotates, never the outer group: the orbit system sits
  // alongside at scene level and must not inherit surface rotation.
  //
  // Geo markers DO belong inside the spin group — they label geography, so they
  // have to travel with the surface.
  useFrame((_, delta) => {
    const visible = earthVisible(state, config)
    if (groupRef.current) groupRef.current.visible = visible
    if (visible && spinRef.current) {
      spinRef.current.rotation.y += delta * EARTH_CONFIG.rotationSpeed
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <group ref={spinRef}>
        <mesh ref={earthRef}>
          <sphereGeometry args={[EARTH_CONFIG.radius, 64, 64]} />
          <shaderMaterial
            vertexShader={earthVert}
            fragmentShader={earthFrag}
            uniforms={earthUniforms}
          />
        </mesh>
        <GeoMarkersLayer state={state} />
      </group>
      <mesh scale={[1.04, 1.04, 1.04]}>
        <sphereGeometry args={[EARTH_CONFIG.radius, 64, 64]} />
        <shaderMaterial
          vertexShader={atmosphereVert}
          fragmentShader={atmosphereFrag}
          uniforms={atmosphereUniforms}
          side={THREE.BackSide}
          transparent
        />
      </mesh>
    </group>
  )
}
