import { useMemo, useEffect, useRef, type RefObject } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import earthVert from '../shaders/earth/vertex.glsl'
import earthFrag from '../shaders/earth/fragment.glsl'
import atmosphereVert from '../shaders/atmosphere/vertex.glsl'
import atmosphereFrag from '../shaders/atmosphere/fragment.glsl'
import { EARTH_CONFIG, EARTH_TEXTURES } from '../config/earthConfig'
import { IntroConfig } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { earthVisible } from '../config/sceneVisibility'
import { loadProgress } from '../../../loading/progress'
import { GeoMarkersLayer } from '../orbit/GeoMarkersLayer'
import type { GeoMarkers } from '../orbit/createGeoMarkers'
import { GEO_MARKERS } from '../orbit/orbitConfig'
import { spinToFace } from '../orbit/geoUtils'
import type { CursorManager } from '../../../interaction/cursorManager'
import { clampFrameDelta } from '../../../graphics/frameDelta'

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
  onSelectDestination?: (id: string) => void
  geoMarkersRef?: RefObject<GeoMarkers | null>
  cursorRef: RefObject<CursorManager | null>
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

/**
 * The three surface maps for this viewport.
 *
 * Read ONCE at load, deliberately, and the reasoning is the same as
 * `SkyShell`'s: re-reading on resize would mean re-downloading and re-uploading
 * the whole set because someone dragged a window across the breakpoint, which
 * costs far more than the mismatch it corrects. A phone that rotates keeps the
 * narrow set, which is the right answer anyway — both orientations of a phone
 * are a phone.
 *
 * Must agree with the media-gated preloads in index.html: if these disagree,
 * the browser fetches one set and the loader asks for the other, and the site
 * silently downloads both.
 */
function earthTextureUrls(): string[] {
  const set =
    window.innerWidth <= EARTH_TEXTURES.narrowMaxWidth
      ? EARTH_TEXTURES.narrow
      : EARTH_TEXTURES.wide
  return [set.day, set.night, set.specularClouds]
}

// Ported from dolly-earth. The tuning-panel plumbing is dropped — these values
// are fixed for the intro. Radius stays at 2 so a future orbit system can be
// added as a sibling group with scale={2} (see plan 002 "Scope").
export function EarthScene({
  config,
  state,
  active,
  onSelectDestination,
  geoMarkersRef,
  cursorRef,
}: Props) {
  const [dayTex, nightTex, specTex] = useLoader(
    THREE.TextureLoader,
    earthTextureUrls(),
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
      // EVERYTHING that can throw is inside the try, and the step is marked done
      // either way. `gpu:warmup` is a REQUIRED manifest entry, so a throw that
      // escapes here does not degrade the warm-up — it strands readiness at the
      // pre-ready limit and the visitor waits on the loading screen forever.
      // gl.initTexture used to sit outside this, which is exactly that bug.
      //
      // Marking it done on failure is right rather than merely convenient: a
      // cold GPU costs one stall at the reveal, which is what this optimisation
      // exists to avoid, not a broken scene. There is nothing here to be fatal
      // about — unlike the textures above, which are the scene.
      try {
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
        // compile() collects materials with scene.traverse, so the invisible
        // Earth group IS included; async so KHR_parallel_shader_compile can
        // link off the critical path. Covers the starfield material too.
        await gl.compileAsync(scene, camera)
      } catch (error) {
        // Fall back to compile-on-first-render rather than blocking the gate.
        console.warn('[earth] GPU warm-up failed; continuing cold', error)
      }
      // The drawing waits on this — set it only once the GPU is actually warm,
      // not merely when the JPEGs have decoded.
      if (!cancelled) {
        loadProgress.markDone('gpu:warmup')
      }
    }
    // The promise is deliberately not awaited by anything, so it must not be
    // able to reject: an unhandled rejection here would be invisible AND leave
    // the step pending. The try above is the guarantee; this is the backstop.
    void warmUp().catch((error) => {
      console.warn('[earth] GPU warm-up rejected', error)
      if (!cancelled) loadProgress.markDone('gpu:warmup')
    })
    return () => {
      cancelled = true
    }
  }, [dayTex, nightTex, specTex, gl, scene, camera, state])

  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const earthRef = useRef<THREE.Mesh>(null)

  // Start the globe with the destination facing the viewer.
  //
  // Without this it is a coincidence which hemisphere is presented, and for
  // Murcia the coincidence was bad: at rotation 0 it sits within 1° of the
  // limb (facing 0.016 against a 0.15 visibility threshold), so the one marker
  // that is a navigation affordance started life invisible — and the spin
  // carries it further away, not closer.
  //
  // The surface still rotates from here, so the destination does drift off
  // over the following ~40s. That is recoverable by dragging the globe, which
  // the focus rig already supports, but it is a product question rather than
  // a settled one: see docs/integration/00-migration-log.md.
  useEffect(() => {
    const destination = GEO_MARKERS.find((m) => m.kind === 'destination')
    if (destination && spinRef.current) {
      spinRef.current.rotation.y = spinToFace(destination.lat, destination.lng)
    }
  }, [])

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
    // Frozen, not reset, while another experience shows: resuming the spin from
    // where the viewer left it is what makes the return seamless.
    if (!active) return

    const visible = earthVisible(state, config)
    if (groupRef.current) groupRef.current.visible = visible
    if (visible && spinRef.current) {
      // Clamped, like every other integrator in the project — this was the one
      // that was not, and it is the most visible one there is. R3F does not
      // clamp its own delta, so returning from a backgrounded tab delivers the
      // entire suspended interval in a single frame: at 0.035 rad/s, a two
      // minute absence is most of a full turn, applied instantly. That can spin
      // the destination marker straight back out of the view the intro
      // deliberately spun it into. See `graphics/frameDelta.ts` for the policy.
      spinRef.current.rotation.y += clampFrameDelta(delta) * EARTH_CONFIG.rotationSpeed
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
        <GeoMarkersLayer
          state={state}
          active={active}
          onSelectDestination={onSelectDestination}
          handleRef={geoMarkersRef}
          cursorRef={cursorRef}
        />
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
