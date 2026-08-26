import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { IntroConfig } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { backdropVisible } from '../config/sceneVisibility'
import { loadProgress } from '../../../loading/progress'
import { skyCapRotation, skyOrientation } from './space/galaxyBand'
import { SPACE_CONFIG } from './space/spaceConfig'
import shellVertexShader from '../shaders/sky/shell.vert.glsl'
import shellFragmentShader from '../shaders/sky/shell.frag.glsl'

// The sky. An inverted sphere sampling a photographic Milky Way panorama —
// 111 KB, one draw call, one texture fetch per frame.
//
// ── Why a photograph and not the shader that used to be here ──
// The procedural version generated its gas from value-noise fbm and could not
// be tuned into looking like anything but dirt. Two of the reasons were
// structural rather than a matter of constants: ridged noise built on VALUE
// noise folds around a level set that snaps to the lattice, so its "filaments"
// were axis-aligned polygon walls; and fbm is stationary by construction, so
// every patch of sky had identical statistics and the whole thing read as one
// texture smeared along a stripe. DECISIONS.md 19 carries the full account. The
// cubemap was always documented as a seam for exactly this substitution, and
// everything structural below is unchanged from the version that baked one.
//
// ── It cannot occlude anything ──
// The material is OPAQUE with renderOrder -1000, so it is drawn before every
// other object in the scene and writes no depth. That makes non-occlusion a
// property of the render order rather than of the geometry, which is why the
// shell's radius is free to be anything inside the camera's far plane. The
// STAR shell's guarantee is separate and geometric; see SpaceBackdrop.
//
// ── It arrives with the Earth ──
// Gated on `backdropVisible`, exactly like the star shell, so the sky appears
// in the same frame the Earth cuts in — under the overlay flash and peak blur
// that already conceal that substitution. Nothing ever cross-fades.
//
// Mounted invisible from the first frame so EarthScene's scene-level
// compileAsync warm-up covers this material. Mounting it later would move a
// shader compile onto the cut, the single worst frame in the sequence. The
// texture arrives asynchronously into a material that already exists, which is
// a uniform write and not a recompile — see the placeholder below.

interface Props {
  config: IntroConfig
  state: SequenceState
  active: boolean
}

/**
 * The variant list for this viewport, best first.
 *
 * Read once at load rather than on resize: swapping a 33.6 MB texture because
 * someone dragged a window across the breakpoint would cost far more than the
 * mismatch it corrects.
 */
function skyCandidates(): string[] {
  const cfg = SPACE_CONFIG.sky
  const set = window.innerWidth <= cfg.narrowMaxWidth ? cfg.narrow : cfg.wide
  return [set.avif, set.webp]
}

/**
 * Loads the first URL that decodes, in order.
 *
 * This IS the AVIF support test. A browser without AVIF fails to decode the
 * first entry and falls through to the WebP, which costs it one wasted request
 * — the price of not depending on a hand-pasted 1x1 data URI whose silent rot
 * would serve everybody the blocky fallback forever. The `type="image/avif"`
 * on the preload in index.html means browsers that cannot use it never fetch
 * it there either, so in practice the waste only lands on the minority whose
 * preload was skipped.
 */
function loadFirstAvailable(
  urls: string[],
  onLoad: (texture: THREE.Texture) => void,
  onFail: (lastUrl: string) => void,
): void {
  const loader = new THREE.TextureLoader()
  const attempt = (i: number) => {
    loader.load(urls[i], onLoad, undefined, () => {
      if (i + 1 < urls.length) {
        console.warn(`[sky] ${urls[i]} did not decode, falling back to ${urls[i + 1]}`)
        attempt(i + 1)
      } else {
        onFail(urls[i])
      }
    })
  }
  attempt(0)
}

// A 1x1 black pixel standing in for the panorama until it loads.
//
// Not `null`: a null sampler uniform leaves three to bind whatever default is
// lying around for the unit, which is driver-dependent, and the material is
// compiled by EarthScene's warm-up before the texture exists. One opaque black
// texel makes that first compile identical to the shipped one and renders the
// sky black rather than undefined if the download never completes.
function placeholderTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

export function SkyShell({ config, state, active }: Props) {
  const mesh = useRef<THREE.Mesh>(null)
  const { gl } = useThree()

  const placeholder = useMemo(placeholderTexture, [])
  const [sky, setSky] = useState<THREE.Texture | null>(null)
  // Set once the texture has been uploaded, not merely decoded. The shell stays
  // hidden until then so the 33.6 MB upload cannot land on the cut frame.
  const uploaded = useRef(false)

  const geometry = useMemo(
    () => new THREE.SphereGeometry(SPACE_CONFIG.sky.shellRadius, 48, 32),
    [],
  )

  // Memoised rather than rebuilt per frame: it allocates two quaternions and
  // two matrices, and it only changes when a debug slider moves.
  const orientation = useMemo(
    () => skyOrientation(config.skyBandTilt, config.skyBandYaw),
    [config.skyBandTilt, config.skyBandYaw],
  )

  // Structural rather than tunable, so this memoises once and never again.
  const capRotation = useMemo(() => skyCapRotation(SPACE_CONFIG.sky.capAzimuth), [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        // Every uniform the shader reads is declared HERE, at full shape, so
        // EarthScene's scene-level compileAsync warm-up compiles the shipped
        // program rather than a smaller one. Adding a uniform later, on first
        // use, would move a shader compile onto the cut — the single worst
        // frame in the sequence.
        uniforms: {
          uSky: { value: placeholder },
          uSkyOrientation: { value: new THREE.Matrix3() },
          uSkyCapRotation: { value: new THREE.Matrix3() },
          uSkyCapBand: { value: new THREE.Vector2(1, 1) },
          // Already LINEAR. There is deliberately no sRGB conversion anywhere
          // on this path: the texture is tagged SRGBColorSpace, so three
          // converts on sampling and the shader only ever sees linear values.
          // Converting here as well is the double-conversion DECISIONS 19
          // already recorded once, and it would look like a strength that needs
          // dragging rather than like a bug.
          uSkyCapLevel: {
            value: new THREE.Vector2(
              SPACE_CONFIG.sky.capLevel.north,
              SPACE_CONFIG.sky.capLevel.south,
            ),
          },
          uSkyCapClamp: {
            value: new THREE.Vector2(
              SPACE_CONFIG.sky.capClamp.min,
              SPACE_CONFIG.sky.capClamp.max,
            ),
          },
          uSkyCapStrength: { value: 0 },
          uSkyBrightness: { value: 0 },
          uSkyContrast: { value: 1 },
          uSkyGrain: { value: 0 },
          uSkyGrainFrequency: {
            value: 1 / THREE.MathUtils.degToRad(SPACE_CONFIG.sky.grainCellDegrees),
          },
        },
        vertexShader: shellVertexShader,
        fragmentShader: shellFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        // Opaque: transparent objects are sorted by distance and drawn after
        // the opaque queue, which would put the sky on top of the Earth.
        transparent: false,
      }),
    [placeholder],
  )

  useEffect(() => {
    let cancelled = false

    // ImageLoader reports no byte progress, so this step is one step: 0 to 1.
    loadFirstAvailable(
      skyCandidates(),
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        // The panorama is authored in sRGB and the shell writes LINEAR into the
        // composer, whose OutputPass applies tone mapping and the sRGB
        // conversion exactly once. Without this the sky is decoded as linear,
        // comes out far too bright, and stops matching the ACES-mapped Earth
        // beside it — which is the documented signal that something has fallen
        // out of the composer.
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = SPACE_CONFIG.sky.generateMipmaps
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        // u wraps at the panorama's edge; v must not, or the poles bleed across.
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping

        setSky(texture)
        loadProgress.markDone('sky:panorama')
      },
      (lastUrl) => {
        if (cancelled) return
        // markDone, NOT markFatal, and this is the whole reason the callback
        // exists. `sky:panorama` is a REQUIRED resource, so a step left at 0
        // holds every visitor to the 45s hard deadline and then kills the boot
        // — for a decorative texture. A missing sky is a black sky; the site is
        // worth more than the backdrop. See bootState.ts.
        console.warn(`[sky] no panorama variant loaded, last tried ${lastUrl}`)
        loadProgress.markDone('sky:panorama')
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  // R3F disposes only objects it created, and these arrive as props — nothing
  // walks them. The texture is 33.6 MB, so a missed disposal here is expensive
  // rather than merely untidy.
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => placeholder.dispose(), [placeholder])
  useEffect(() => () => sky?.dispose(), [sky])

  useFrame(() => {
    if (!active) return

    if (sky && !uploaded.current) {
      // Forces the upload now rather than on the first frame that samples it,
      // which would otherwise be the cut. Same reason `gpu:warmup` exists.
      gl.initTexture(sky)
      material.uniforms.uSky.value = sky
      uploaded.current = true
    }

    material.uniforms.uSkyBrightness.value = config.skyBrightness
    material.uniforms.uSkyContrast.value = config.skyContrast
    material.uniforms.uSkyOrientation.value = orientation
    material.uniforms.uSkyCapRotation.value = capRotation
    material.uniforms.uSkyCapStrength.value = config.skyCapStrength
    material.uniforms.uSkyGrain.value = config.skyGrain

    // Sines, because the shader compares against dir.y and asin is not free on
    // a full-screen pass. The max() is not paranoia: both edges are sliders and
    // smoothstep with edge0 >= edge1 is undefined, so a drag that crosses them
    // over would produce driver-dependent garbage rather than a visible mistake.
    const capFull = Math.max(config.skyCapFull, config.skyCapStart + 0.5)
    material.uniforms.uSkyCapBand.value.set(
      Math.sin(THREE.MathUtils.degToRad(config.skyCapStart)),
      Math.sin(THREE.MathUtils.degToRad(capFull)),
    )

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
