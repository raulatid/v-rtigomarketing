import * as THREE from 'three'
import { POINT_SPRITE_FALLOFF } from '../scene/space/pointSprite'
import { HINT_CONFIG } from './hintConfig'
import type { HintFigure } from './buildHintFigure'

// The hint figure as one `Points`, built the way `createHoverCue` is built: a
// dummy `position` attribute for the vertex count, seeded custom attributes, and
// EVERY particle's whole path as a function of two caller-written uniforms. It
// owns no clock, so it is scrubbable and frame-rate independent, and the machine
// that drives it (`hintPresence.ts`) can be exercised in Node.
//
// Constructed eagerly and invisible, at full capacity, before the figure has
// been sampled — a ShaderMaterial first instantiated when the hint appears would
// compile on that frame, which is the plan 003 stall. The geometry draws nothing
// until `setFigure` arrives because the draw range starts at zero.
//
// ## Three deliberate departures from the file it copies
//
// 1. NO PERSPECTIVE DIVISION on the point size. The hover cue divides by `-mv.z`
//    because it lives in the world and recedes. This hangs at a depth WE chose
//    and never moves, so the division collapses into a constant and the sprite
//    is a fixed CSS-pixel size by construction.
//
// 2. NORMAL BLENDING, not additive. ~600 sprites at ~3px spacing overlap along
//    the stems — exactly the pixels carrying the letterforms — and additively
//    that pushes the strokes past the 0.62 bloom knee and hazes the counters
//    shut. Blended normally the brightest pixel the figure can produce is
//    `uColor`, which is what makes the bloom question answerable with one number
//    instead of a density argument. `starShader.ts` refuses additive for the
//    backdrop for the neighbouring reason.
//
// 3. THE FALLOFF GOES IN ALPHA. The hover cue writes `vec4(uColor * falloff,
//    vAlpha)` because additive blending already multiplies rgb by alpha, so
//    folding the fade in twice would square it. This material does not, so the
//    falloff belongs in the alpha channel — the `starShader` form. Inverting
//    this back "to match the sibling" would dim the figure to nothing.
//
// ## Placement is entirely in the vertex shader
//
// `modelViewMatrix` is never read: the position is built straight in view space
// from the projection matrix, so the figure is locked to the camera with no
// parenting and no per-frame CPU work. Parenting to the camera would not have
// worked anyway — R3F does not add its default camera to the scene, and
// `WebGLRenderer` builds its render list by traversing the scene, so a child of
// the camera is silently never drawn.
//
// `projectionMatrix[1][1]` IS `1 / tan(fov / 2)`, so the frustum half-height at
// our depth is read off the matrix rather than pushed as a uniform. That matters
// because Earth's fov is not constant — the warp surges it — and a pushed value
// would be a frame stale. Same move as the hover cue's
// `length(modelViewMatrix[0].xyz)`, for the same reason.

const GOLDEN_RATIO = 0.6180339887

/** The sine hash the rest of the scene's seeded fields use. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const HINT_VERTEX = /* glsl */ `
  attribute vec2 aTarget;
  attribute vec2 aScatter;
  attribute float aSeed;
  attribute float aRegion;

  uniform float uProgress;
  uniform float uExit;
  uniform float uDepth;
  uniform float uUnitPx;
  uniform float uFit;
  uniform float uOffsetPx;
  uniform float uScatterPx;
  uniform float uDispersePx;
  uniform float uSizePx;
  uniform float uPixelRatio;
  uniform float uMaxSize;

  varying float vAlpha;

  void main() {
    // Each particle owns a window, staggered by its seed AND by its region, so
    // the chevrons land before the sentence and the figure writes itself rather
    // than snapping. The windows overlap heavily: this is one arrival, not two.
    float start = aRegion * 0.10 + aSeed * 0.30;
    float local = clamp((uProgress - start) / 0.60, 0.0, 1.0);
    // Quartic ease-out — zero velocity at arrival. A particle still moving when
    // it lands reads as an overshoot it never actually makes.
    float e = 1.0 - pow(1.0 - local, 4.0);

    vec2 p = aTarget + aScatter * uScatterPx * (1.0 - e);

    // Outward from the figure's centre with a seeded tangent, so leaving is a
    // scatter and not a starburst. Squared, so the first frames of the exit are
    // slow and the hold costs exactly nothing while uExit is 0.
    vec2 away = normalize(aTarget + vec2(1e-4));
    vec2 tangent = vec2(-away.y, away.x) * (aSeed < 0.5 ? -1.0 : 1.0);
    p += (away + tangent * 0.3) * uDispersePx * uExit * uExit;

    // uFit shrinks the figure on a narrow viewport; the offset does not scale
    // with it, because where the figure SITS is a screen position and not part
    // of the drawing.
    vec2 fig = p * uFit - vec2(0.0, uOffsetPx);

    // CSS pixels to view units at our depth, read off the projection.
    float halfHeight = uDepth / projectionMatrix[1][1];
    float pxToView = 2.0 * halfHeight * uUnitPx;

    // smoothstep from zero is not enough on its own: without the window having
    // opened at all, every sprite would sit at its scatter origin at full alpha.
    vAlpha = smoothstep(0.0, 0.18, local) * (1.0 - smoothstep(0.15, 0.85, uExit));

    gl_Position = projectionMatrix * vec4(fig * pxToView, -uDepth, 1.0);
    // The dot scales WITH the figure. A constant sprite over a shrunken sentence
    // makes the dots proportionally fatter on a narrow viewport, and the letters
    // close up — the drawing has to keep its own proportions or it stops being
    // the same drawing. On a real phone the device pixel ratio gives back what
    // the fit takes away; a capture at ratio 1 is the worst case and understates
    // this badly.
    gl_PointSize = min(uSizePx * uFit * uPixelRatio, uMaxSize);
  }
`

export const HINT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  ${POINT_SPRITE_FALLOFF}

  void main() {
    // Falloff in ALPHA, not folded into rgb — see departure 3 in the header.
    gl_FragColor = vec4(uColor, pointSpriteFalloff() * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`

/** Every uniform the shaders above declare. Exported so a test can prove parity. */
export const HINT_UNIFORM_NAMES = [
  'uProgress',
  'uExit',
  'uDepth',
  'uUnitPx',
  'uFit',
  'uOffsetPx',
  'uScatterPx',
  'uDispersePx',
  'uSizePx',
  'uPixelRatio',
  'uMaxSize',
  'uColor',
  'uOpacity',
] as const

/** Every custom attribute, for the same reason. `position` is three's own. */
export const HINT_ATTRIBUTE_NAMES = ['aTarget', 'aScatter', 'aSeed', 'aRegion'] as const

export function createHintParticles() {
  const render = HINT_CONFIG.render
  const capacity = HINT_CONFIG.figure.textCount + HINT_CONFIG.figure.glyphCount

  const geometry = new THREE.BufferGeometry()
  // Never read — every position comes from the shader — but the attribute must
  // exist and be the right length or the draw call has no vertex count.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3))

  const targets = new Float32Array(capacity * 2)
  const scatters = new Float32Array(capacity * 2)
  const seeds = new Float32Array(capacity)
  const regions = new Float32Array(capacity)

  for (let i = 0; i < capacity; i += 1) {
    // Golden-ratio stagger: evenly spread, no two alike, no `Math.random`.
    seeds[i] = (i * GOLDEN_RATIO) % 1
    // A direction on the unit circle for the arrival. Baked rather than hashed
    // in the shader because the arrival and the exit want DIFFERENT directions:
    // in from the field, out from the figure.
    const theta = hash(i + 1) * Math.PI * 2
    scatters[i * 2] = Math.cos(theta)
    scatters[i * 2 + 1] = Math.sin(theta)
  }

  geometry.setAttribute('aTarget', new THREE.BufferAttribute(targets, 2))
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatters, 2))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aRegion', new THREE.BufferAttribute(regions, 1))
  // Nothing until a figure lands. A hint that failed to rasterize draws no
  // points at all rather than a half-formed one.
  geometry.setDrawRange(0, 0)

  const uniforms = {
    uProgress: { value: 0 },
    uExit: { value: 0 },
    uDepth: { value: render.distance },
    uUnitPx: { value: 1 / 900 },
    uFit: { value: 1 },
    uOffsetPx: { value: render.offsetPx },
    uScatterPx: { value: render.scatterPx },
    uDispersePx: { value: render.dispersePx },
    uSizePx: { value: render.sizePx },
    uPixelRatio: { value: 1 },
    // Generous until a real ceiling is read off the context. Some drivers cap
    // gl_PointSize far lower than the spec suggests, and the failure is
    // device-specific and invisible in review.
    uMaxSize: { value: 64 },
    // `THREE.Color` linearises the hex on assignment.
    uColor: { value: new THREE.Color(render.color) },
    uOpacity: { value: render.opacity },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HINT_VERTEX,
    fragmentShader: HINT_FRAGMENT,
    transparent: true,
    blending: THREE.NormalBlending,
    // Nothing may occlude the message, and nothing may be occluded by it. With
    // depth off, `renderOrder` IS the ordering contract — 10 is clear of the
    // orbit range (panel 2, hover cue 3) so a future orbit element cannot
    // collide with it.
    depthTest: false,
    depthWrite: false,
  })

  const object = new THREE.Points(geometry, material)
  object.name = 'HintParticles'
  // The bounding sphere would be computed from the dummy attribute — a point at
  // the origin — and the whole figure would pop out the moment that origin left
  // the frustum. Which, for something built in view space, is most of the time.
  object.frustumCulled = false
  object.raycast = () => {}
  object.renderOrder = 10
  object.visible = false

  /** The sampled figure. Until this arrives the object draws nothing. */
  function setFigure(figure: HintFigure): void {
    const count = Math.min(figure.regions.length, capacity)
    targets.set(figure.points.subarray(0, count * 2))
    regions.set(figure.regions.subarray(0, count))
    geometry.getAttribute('aTarget').needsUpdate = true
    geometry.getAttribute('aRegion').needsUpdate = true
    geometry.setDrawRange(0, count)
  }

  /** 0..1 formation and 0..1 dispersal. Caller-owned; see the header. */
  function setPhase(progress: number, exit: number): void {
    uniforms.uProgress.value = clamp01(progress)
    uniforms.uExit.value = clamp01(exit)
  }

  function setVisible(visible: boolean): void {
    object.visible = visible
  }

  /**
   * Viewport, in the terms the shader needs: CSS height drives the px→view
   * conversion, the pixel ratio drives the sprite size, and `fit` shrinks the
   * whole figure when it would not otherwise clear the margins.
   */
  function setViewport(cssHeight: number, pixelRatio: number, fit: number): void {
    if (cssHeight > 0) uniforms.uUnitPx.value = 1 / cssHeight
    if (pixelRatio > 0) uniforms.uPixelRatio.value = pixelRatio
    uniforms.uFit.value = fit > 0 ? fit : 1
  }

  /** The driver's own ceiling on `gl_PointSize`, once a context can be asked. */
  function setMaxPointSize(max: number | null): void {
    if (max !== null && Number.isFinite(max) && max > 0) uniforms.uMaxSize.value = max
  }

  function dispose(): void {
    // Geometry AND material: this module built both.
    geometry.dispose()
    material.dispose()
  }

  return { object, setFigure, setPhase, setVisible, setViewport, setMaxPointSize, dispose }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export type HintParticles = ReturnType<typeof createHintParticles>
