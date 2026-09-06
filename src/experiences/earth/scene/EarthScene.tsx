import { useMemo, useEffect, useRef, type RefObject } from 'react'
import { useLoader, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { acquireKtx2Loader, releaseKtx2Loader } from '../../../graphics/decoders'
import earthVert from '../shaders/earth/vertex.glsl'
import earthFrag from '../shaders/earth/fragment.glsl'
import atmosphereVert from '../shaders/atmosphere/vertex.glsl'
import atmosphereFrag from '../shaders/atmosphere/fragment.glsl'
import { EARTH_CONFIG, EARTH_TEXTURES } from '../config/earthConfig'
import { IntroConfig } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { earthVisible } from '../config/sceneVisibility'
import { loadProgress } from '../../../loading/progress'
import {
  DESTINATION,
  destinationLocalPosition,
  destinationWorldPosition,
  type DestinationResolver,
} from '../navigation/destination'
import { spinToFace } from '../orbit/geoUtils'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { isEarthFrozen } from '../camera/debugCameraHook'

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
  /**
   * Published for CameraController: resolves the navigation destination's
   * world position from the spin group this scene owns. A function, not an
   * object in the graph — the marker system that used to stand here is gone.
   */
  destinationRef?: RefObject<DestinationResolver | null>
}

// KTX2Loader reports no byte progress, so this step advances per file, in
// thirds. Coarse, but honest; the alternative is a fake smooth ramp. The manager
// is module-level because R3F caches one loader instance per Loader class.
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
  return [set.day, set.night, set.clouds]
}

/**
 * The shared Basis transcoder, held for as long as this scene is mounted.
 *
 * Module-level rather than a hook: `useLoader` needs the instance during
 * render, and the first render of this component ALWAYS suspends, so anything
 * acquired in `useMemo` would be acquired again on the retry and never
 * balanced. The guard makes the acquire happen exactly once no matter how many
 * renders are thrown away.
 *
 * An INSTANCE is passed to `useLoader` (which accepts one — see `loadingFn`)
 * rather than the `KTX2Loader` class, deliberately: the class path would have
 * R3F construct and cache a second transcoder alongside the one
 * `graphics/decoders.ts` exists to keep single, and stand up its worker pool
 * during the intro, next to the city's and the satellites'.
 */
let earthKtx2: KTX2Loader | null = null

function acquireEarthKtx2(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!earthKtx2) earthKtx2 = acquireKtx2Loader(renderer)
  return earthKtx2
}

function releaseEarthKtx2(): void {
  if (!earthKtx2) return
  earthKtx2 = null
  releaseKtx2Loader()
}

// Ported from dolly-earth. The tuning-panel plumbing is dropped — these values
// are fixed for the intro. Radius stays at 2 so a future orbit system can be
// added as a sibling group with scale={2} (see plan 002 "Scope").
export function EarthScene({
  config,
  state,
  active,
  destinationRef,
}: Props) {
  const { gl, scene, camera } = useThree()

  const [dayTex, nightTex, cloudsTex] = useLoader(
    acquireEarthKtx2(gl),
    earthTextureUrls(),
    (loader) => {
      loader.manager = earthManager
    },
  )

  useEffect(() => releaseEarthKtx2, [])

  useEffect(() => {
    dayTex.colorSpace = THREE.SRGBColorSpace
    nightTex.colorSpace = THREE.SRGBColorSpace
    // cloudsTex is deliberately left alone. It is data, not colour: the shader
    // thresholds the authored value, and an sRGB decode would move it. KTX2Loader
    // takes the colour space from the file, so the file is encoded linear and
    // nothing here overrides it.
    dayTex.anisotropy = 8
    nightTex.anisotropy = 8
    cloudsTex.anisotropy = 8

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
        const maps = [dayTex, nightTex, cloudsTex]
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
  }, [dayTex, nightTex, cloudsTex, gl, scene, camera, state])

  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const earthRef = useRef<THREE.Mesh>(null)

  // Start the globe with the destination facing the viewer.
  //
  // Without this it is a coincidence which hemisphere is presented, and for
  // Murcia the coincidence was bad: at rotation 0 it sits within 1° of the
  // limb, and the spin carries it further away, not closer. The warp aims here
  // (destinationRef below), so the descent reads best when the globe rests
  // near this pose.
  //
  // The surface still rotates from here, so the destination does drift off
  // over the following ~40s. That is recoverable by dragging the globe, which
  // the focus rig already supports, but it is a product question rather than
  // a settled one: see docs/integration/00-migration-log.md.
  useEffect(() => {
    if (spinRef.current) {
      spinRef.current.rotation.y = spinToFace(DESTINATION.lat, DESTINATION.lng)
    }
  }, [])

  // Publish the destination resolver. This scene owns the spin group the
  // destination turns with, so it is the one place that can answer "where is
  // the city right now" — CameraController consumes the answer without ever
  // seeing the scene graph. Before the group mounts (or after unmount) the
  // resolver answers from an unrotated Earth rather than returning nothing:
  // the warp would rather aim at the resting pose than at nowhere.
  useEffect(() => {
    if (!destinationRef) return
    destinationRef.current = (target) =>
      spinRef.current
        ? destinationWorldPosition(spinRef.current, EARTH_CONFIG.radius, target)
        : destinationLocalPosition(EARTH_CONFIG.radius, target)
    return () => {
      destinationRef.current = null
    }
  }, [destinationRef])

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
      uCloudsTexture: { value: cloudsTex },
      uSunDirection: { value: sunDirection.clone() },
      uAtmosphereDayColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereDayColor) },
      uAtmosphereTwilightColor: { value: new THREE.Color(EARTH_CONFIG.atmosphereTwilightColor) },
      uCloudIntensity: { value: EARTH_CONFIG.cloudIntensity },
      uNightIntensity: { value: EARTH_CONFIG.nightIntensity },
    }),
    [dayTex, nightTex, cloudsTex, sunDirection],
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
      // the destination straight back out of the view the intro deliberately
      // spun it into. See `graphics/frameDelta.ts` for the policy.
      // The spin is the only thing in the resting scene that makes a shot taken
      // at a wall-clock delay a shot of a different frame each run, so the
      // prototype's capture script stops it. Always false without ?freezeEarth=1,
      // and unreachable in a production build — see debugCameraHook.ts.
      if (!isEarthFrozen()) {
        spinRef.current.rotation.y += clampFrameDelta(delta) * EARTH_CONFIG.rotationSpeed
      }
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
