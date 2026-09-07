import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { POINT_SPRITE_FALLOFF } from '../scene/space/pointSprite'

// The hover tutorial's particle cue: a handful of faint points that converge on
// the satellite just before it responds, so the causality reads — something
// arrives, the object answers. It says "this can be interacted with", never
// "this is emitting"; it is on screen for half a second, twice, and then never.
//
// ONE `Points` for the whole cue, not fifteen objects. It owns no clock:
// `uProgress` is written from the tutorial's tick (`hoverTutorial.ts`), so the
// cue is scrubbable, reversible and frame-rate independent, the way the Murcia
// display's reveal motes are (`displayReveal.ts`, the pattern this follows).
// Every particle's whole path is a function of that one number and its own
// seeded attributes — the vertex shader does the travelling.
//
// Built for the invited satellite ONLY, and built eagerly: a ShaderMaterial
// first instantiated when the cue plays would compile on the frame the
// tutorial starts, which is the plan 003 stall. So it exists, invisible, from
// construction, inside the scene-level warm-up.

const GOLDEN_RATIO = 0.6180339887

/** The sine hash `displayReveal` uses for volume: a quasi-regular sequence renders as a visible lattice. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

const VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aOrigin;
  attribute vec3 aSwirl;
  uniform float uProgress;
  uniform float uRadius;
  uniform float uSize;
  uniform float uSizeScale;
  uniform float uSwirl;
  varying float vAlpha;

  void main() {
    // Each particle owns a window of the cue, staggered by its seed, so the
    // fifteen arrive as a drift rather than a volley.
    float start = aSeed * 0.35;
    float local = clamp((uProgress - start) / 0.65, 0.0, 1.0);
    float e = local * local * (3.0 - 2.0 * local);

    // In from the shell, along a gentle arc: the swirl is a tangent that peaks
    // mid-flight and is gone at both ends, so the path bends but still lands.
    float dist = uRadius * (1.0 - e);
    vec3 pos = aOrigin * dist + aSwirl * (uRadius * uSwirl * sin(e * 3.14159265));

    // Faded IN over the first stretch and OUT before arrival. Fifteen additive
    // sprites meeting at one point would sum past the bloom knee and flare;
    // gone by 95% they never meet at all.
    float fadeIn = smoothstep(0.0, 0.15, local);
    float fadeOut = 1.0 - smoothstep(0.7, 0.95, local);
    vAlpha = fadeIn * fadeOut * step(0.0001, local);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    // World-size points: uSize is in the group's units, so the model's scale
    // (the orbit group's Earth-radius mount) is read off the matrix rather than
    // assumed. The 0.5 and the pixel ratio arrive inside uSizeScale, the same
    // factor the warp tunnel's stars use.
    float unit = length(modelViewMatrix[0].xyz);
    gl_PointSize = uSize * unit * uSizeScale / max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  ${POINT_SPRITE_FALLOFF}

  void main() {
    float falloff = pointSpriteFalloff();
    // The fade goes in ONCE, through alpha: additive blending is (SrcAlpha,
    // One), so the framebuffer already receives rgb × alpha — see the emitter
    // cone for the squared-density mistake this avoids.
    gl_FragColor = vec4(uColor * falloff, vAlpha);
    #include <colorspace_fragment>
  }
`

interface Options {
  holoColor: string
  count?: number
  radius?: number
  size?: number
}

export function createHoverCue({
  holoColor,
  count = ORBIT_CONFIG.tutorial.cueCount,
  radius = ORBIT_CONFIG.tutorial.cueRadius,
  size = ORBIT_CONFIG.tutorial.cueSize,
}: Options) {
  const geometry = new THREE.BufferGeometry()
  // Never read — every position comes from the shader — but the attribute
  // must exist and be the right length, or the draw call has no vertex count.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))

  const seeds = new Float32Array(count)
  const origins = new Float32Array(count * 3)
  const swirls = new Float32Array(count * 3)
  const origin = new THREE.Vector3()
  const swirl = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < count; i += 1) {
    // Golden-ratio stagger: evenly spread, no two alike.
    seeds[i] = (i * GOLDEN_RATIO) % 1
    // Directions on a shell, from the hash, so the origins read as a cloud
    // around the satellite rather than a ring or a spiral.
    const theta = hash(i + 1) * Math.PI * 2
    const phi = Math.acos(2 * hash(i + 101) - 1)
    origin.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
    origins.set([origin.x, origin.y, origin.z], i * 3)
    // A tangent to the approach, handedness varied so the arcs do not all
    // bend the same way.
    swirl.crossVectors(origin, up)
    if (swirl.lengthSq() < 1e-6) swirl.set(1, 0, 0)
    swirl.normalize().multiplyScalar(hash(i + 211) < 0.5 ? -1 : 1)
    swirls.set([swirl.x, swirl.y, swirl.z], i * 3)
  }
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3))
  geometry.setAttribute('aSwirl', new THREE.BufferAttribute(swirls, 3))

  const uniforms = {
    uProgress: { value: 0 },
    uRadius: { value: radius },
    uSize: { value: size },
    uSizeScale: { value: 1 },
    uSwirl: { value: 0.35 },
    // The holo's own light, a shade under the bloom knee so fifteen of them do
    // not each grow a halo. `THREE.Color` linearises the hex on assignment.
    uColor: { value: new THREE.Color(holoColor).multiplyScalar(0.85) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Never occludes; the Earth still occludes it, which is right — a cue on
    // the far side of the planet is not a cue.
    depthWrite: false,
  })

  const object = new THREE.Points(geometry, material)
  object.name = 'HoverCue'
  // The bounding sphere would be computed from the dummy attribute — a point —
  // and culling would pop the cloud out mid-flight.
  object.frustumCulled = false
  object.raycast = () => {}
  // After the panel (2): additive light over the field, never under it.
  object.renderOrder = 3
  object.visible = false

  /** Progress of the cue, 0..1, or null to hide it. Caller-owned; see the header. */
  function setProgress(progress: number | null) {
    if (progress === null || !Number.isFinite(progress)) {
      object.visible = false
      uniforms.uProgress.value = 0
      return
    }
    object.visible = true
    uniforms.uProgress.value = progress < 0 ? 0 : progress > 1 ? 1 : progress
  }

  /** `pixelRatio × CSS viewport height` — the point-size factor three would have supplied. */
  function setViewportScale(px: number) {
    uniforms.uSizeScale.value = Number.isFinite(px) && px > 0 ? px * 0.5 : 1
  }

  function dispose() {
    // Geometry AND material: this module built both.
    geometry.dispose()
    material.dispose()
  }

  return { object, setProgress, setViewportScale, dispose }
}

export type HoverCue = ReturnType<typeof createHoverCue>
