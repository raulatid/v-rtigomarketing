import * as THREE from 'three'

import { SPACE_CONFIG } from './spaceConfig'
import { bandAxis, bandDensity } from './galaxyBand'

// Generates the backdrop star field's attribute buffers.
//
// Replaces the golden-angle spiral this backdrop used to share with
// `createConnectivityCloud`. That spiral is a MAXIMALLY even distribution by
// construction, which is why the sky read as combed rather than as a sky —
// see `checks/space-backdrop.ts` section 4, which measures exactly that.
//
// ── The one rule ──
// CLUSTERING IS ANGULAR. Directions are perturbed and RENORMALISED; the radius
// is applied afterwards and is never touched. That is what keeps the backdrop's
// non-occlusion guarantee provable: every point sits on a shell that encloses
// the camera, so no point can lie between the camera and the Earth. An
// implementation that offsets final positions in 3D would break it for a
// handful of stars at some orbit angles, which is the kind of defect no
// screenshot is guaranteed to catch.
//
// Deterministic and seeded — no `Math.random` anywhere. Nothing here may import
// a `.glsl` file or touch `window`: this module is bundled into
// `checks/space-backdrop.ts` and run in Node.

export interface StarFieldOptions {
  count: number
  radius: number
  /** Fraction of the radius, applied radially only. 0.15 = ±15%. */
  jitter: number
  /** 0 = uniform sky, 1 = heavily clumped and band-locked. */
  clusterStrength: number
  bandTiltDegrees: number
  bandWidth: number
  seed?: number
}

export interface StarField {
  /** count * 3 */
  positions: Float32Array
  /** count * 3 — ramp colour already multiplied by the star's brightness. */
  colors: Float32Array
  /** count — point size in pixels. */
  sizes: Float32Array
  /** count — [0, 1), drives twinkle phase and rate. */
  phases: Float32Array
}

/** mulberry32. Small, fast, and good enough for a sky; the property that
 *  matters is that it is reproducible from an integer seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller, one value per call. Used for the angular offset inside a knot,
 *  where a gaussian gives a dense centre and a soft edge. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

function uniformDirection(rand: () => number, out: THREE.Vector3): THREE.Vector3 {
  // Sampling y uniformly in [-1, 1] is what makes this uniform on the sphere;
  // sampling the polar angle instead would pile points at the poles.
  const y = rand() * 2 - 1
  const theta = rand() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  return out.set(r * Math.cos(theta), y, r * Math.sin(theta))
}

/**
 * A direction biased toward the galactic plane, by rejection sampling.
 *
 * Acceptance is `(1 - bias) + bias * density`, so it is bounded below by
 * `1 - bias` and always terminates for bias < 1. The attempt cap covers
 * bias === 1, where the floor is 0 and an unlucky run could otherwise spin.
 */
function bandDirection(
  rand: () => number,
  axis: THREE.Vector3,
  width: number,
  bias: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  for (let attempt = 0; attempt < 64; attempt++) {
    uniformDirection(rand, out)
    const accept = 1 - bias + bias * bandDensity(out, axis, width)
    if (rand() < accept) return out
  }
  return out
}

export function generateStarField(options: StarFieldOptions): StarField {
  const { count, radius, jitter, clusterStrength, bandTiltDegrees, bandWidth } = options
  const cfg = SPACE_CONFIG.star
  const rand = mulberry32(options.seed ?? cfg.seed)
  const axis = bandAxis(bandTiltDegrees)

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const phases = new Float32Array(count)

  // Knot centres are drawn from the same biased sampler as the loose stars, so
  // the knots themselves sit along the band rather than scattered at random.
  const centres: THREE.Vector3[] = []
  for (let i = 0; i < cfg.clusterCount; i++) {
    centres.push(bandDirection(rand, axis, bandWidth, clusterStrength, new THREE.Vector3()))
  }

  const ramp = cfg.colorRamp.map((s) => ({ at: s.at, color: new THREE.Color(s.color) }))
  const dir = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const colour = new THREE.Color()

  for (let i = 0; i < count; i++) {
    // ── Direction ──
    if (centres.length > 0 && rand() < cfg.clusterShare * clusterStrength) {
      const centre = centres[Math.min(centres.length - 1, Math.floor(rand() * centres.length))]
      offset.set(gaussian(rand), gaussian(rand), gaussian(rand))
      dir
        .copy(centre)
        .addScaledVector(offset, cfg.clusterSpread)
        // THE line that keeps the shell guarantee. Perturbing then
        // renormalising can only move a point ALONG the sphere.
        .normalize()
    } else {
      bandDirection(rand, axis, bandWidth, clusterStrength, dir)
    }

    // A perturbation that exactly cancelled the centre would leave a zero
    // vector, which `normalize()` leaves at zero rather than making NaN — but
    // a zero direction would stack a star at the origin, inside the camera.
    if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0)

    // ── Radius: unchanged from the shipped backdrop. Radial only. ──
    const pointRadius = jitter > 0 ? radius * (1 + (rand() * 2 - 1) * jitter) : radius
    positions[i * 3] = dir.x * pointRadius
    positions[i * 3 + 1] = dir.y * pointRadius
    positions[i * 3 + 2] = dir.z * pointRadius

    // ── Magnitude ──
    const m = Math.pow(rand(), cfg.magnitudeExponent)
    sizes[i] = cfg.minSize + m * (cfg.maxSize - cfg.minSize)

    // ── Colour ──
    const t = rand()
    let lo = ramp[0]
    let hi = ramp[ramp.length - 1]
    for (let s = 0; s < ramp.length - 1; s++) {
      if (t >= ramp[s].at && t <= ramp[s + 1].at) {
        lo = ramp[s]
        hi = ramp[s + 1]
        break
      }
    }
    const span = hi.at - lo.at
    colour.copy(lo.color).lerp(hi.color, span > 0 ? (t - lo.at) / span : 0)

    // Brightness rides magnitude, replacing the old per-tier `opacity`.
    const brightness = cfg.minBrightness + m * (cfg.maxBrightness - cfg.minBrightness)
    colors[i * 3] = colour.r * brightness
    colors[i * 3 + 1] = colour.g * brightness
    colors[i * 3 + 2] = colour.b * brightness

    phases[i] = rand()
  }

  return { positions, colors, sizes, phases }
}
