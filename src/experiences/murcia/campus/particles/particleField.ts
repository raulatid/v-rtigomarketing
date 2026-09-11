import * as THREE from 'three';
import type { TargetLayout } from './layouts';
import { seededRandom } from './maskSampling';
import fragmentShader from './shaders/particles.frag';
import vertexShader from './shaders/particles.vert';

/**
 * The lake's particle field: one `Points`, every particle a vertex.
 *
 * The CPU decides WHERE: source, emergence and target points, a seed and a
 * delay per particle, written once into attributes. The GPU decides WHEN and
 * HOW: the vertex shader reads a global elapsed time and works out each
 * particle's phase from its own delay. Nothing per particle happens per frame
 * on the CPU, which is what makes the count a benchmark knob rather than a
 * budget.
 *
 * The timeline, in seconds from play:
 *
 *   starts spread over  0 ... emergenceSeconds * DELAY_SHARE
 *   each rise lasts     emergenceSeconds * (1 - DELAY_SHARE)
 *   each convergence    convergenceSeconds
 *
 * so the last particle has settled at exactly emergenceSeconds +
 * convergenceSeconds, which is what `duration` reports and what progress is
 * measured against.
 */

/** Of the emergence window, how much is spent spreading the starts. */
const DELAY_SHARE = 0.6;

/** Fixed, so a rebuild at the same count is the same field. */
const FIELD_SEED = 1337;

/** Of a morph, how much is spent staggering the starts, unless a layout asks otherwise. */
const DEFAULT_SPREAD = 0.35;

export interface LakeBasin {
  /** Centre of the water, at surface height. */
  center: THREE.Vector3;
  /** Half the water's extent in the ground plane. */
  radius: number;
}

export interface ParticleFieldConfig {
  count: number;
  /** World units above the surface a particle emerges to. */
  emergenceHeight: number;
  emergenceSeconds: number;
  convergenceSeconds: number;
  /** Pixel size at unit distance, before attenuation. */
  size: number;
  /** World units the settled shape bobs by. */
  swellAmplitude: number;
  /** World units from one crest to the next. */
  swellLength: number;
  /** How fast the crests travel. */
  swellSpeed: number;
  color: number;
  opacity: number;
}

export interface ParticleField {
  readonly points: THREE.Points;
  /** Seconds from the first start to the last settle. */
  readonly duration: number;
  /** Seconds since play. */
  readonly elapsed: number;
  /** Rebuilds the attributes. Needed when the count or any position changes. */
  rebuild(config: ParticleFieldConfig, layout: TargetLayout): void;
  /**
   * Re-targets without a rebuild: the current targets become the origin of a
   * morph that carries every particle to the new layout over `seconds`.
   * `spread` is how much of that is spent staggering the starts, 0..1.
   */
  setLayout(layout: TargetLayout, seconds: number, spread?: number): void;
  /**
   * Keeps the targets moving: while set, every tick re-evaluates `live(time)`
   * into the targets. A `setLayout` clears it. The morph, if one is running,
   * carries on toward the moving targets.
   */
  setLiveLayout(live: ((time: number) => TargetLayout) | null): void;
  /** 0 at the previous layout, 1 at the current one. */
  readonly morph: number;
  /** Applies everything that does not need a rebuild. */
  configure(config: ParticleFieldConfig): void;
  setElapsed(seconds: number): void;
  /** Per frame: advances the clock and, if playing, the timeline. Returns elapsed. */
  tick(dt: number, playing: boolean): number;
  setViewport(heightPx: number): void;
  dispose(): void;
}

export function createParticleField(basin: LakeBasin, initial: ParticleFieldConfig): ParticleField {
  const uniforms = {
    uElapsed: { value: 0 },
    uTime: { value: 0 },
    uDelaySpread: { value: 1 },
    uRiseSeconds: { value: 1 },
    uConvergeSeconds: { value: 1 },
    uMorph: { value: 1 },
    uMorphSpread: { value: DEFAULT_SPREAD },
    uSwellAmp: { value: 0 },
    uSwellK: { value: 1 },
    uSwellSpeed: { value: 0 },
    uSurfaceY: { value: basin.center.y },
    uWaterFade: { value: basin.radius * 0.12 },
    uSize: { value: 1 },
    uScale: { value: 1 },
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(new THREE.BufferGeometry(), material);
  // The attributes the bounds would be computed from are not where the
  // particles are, so let the GPU decide.
  points.frustumCulled = false;

  let elapsed = 0;
  let duration = 1;
  let morph = 1;
  let morphSeconds = 1;
  /** Each particle's rank by seed, 0..1. Rebuilt with the geometry, reused by every layout. */
  let order = new Float32Array(0);
  let live: ((time: number) => TargetLayout) | null = null;

  // The same seed for every layout, so a layout sampled twice is the same twice.
  const fillTargets = (target: Float32Array, count: number, layout: TargetLayout): void => {
    const random = seededRandom(FIELD_SEED + 1);
    const point = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      layout(i, count, random, point, order[i] ?? 0);
      target[i * 3] = point.x;
      target[i * 3 + 1] = point.y;
      target[i * 3 + 2] = point.z;
    }
  };

  const buildGeometry = (config: ParticleFieldConfig, layout: TargetLayout): THREE.BufferGeometry => {
    const { count } = config;
    const random = seededRandom(FIELD_SEED);
    const source = new Float32Array(count * 3);
    const emerge = new Float32Array(count * 3);
    const target = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const delay = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const o = i * 3;

      // Source: a disc inside the water, a little below the surface.
      const angle = random() * Math.PI * 2;
      const r = basin.radius * 0.88 * Math.sqrt(random());
      const x = basin.center.x + Math.cos(angle) * r;
      const z = basin.center.z + Math.sin(angle) * r;
      source[o] = x;
      source[o + 1] = basin.center.y - basin.radius * (0.04 + 0.14 * random());
      source[o + 2] = z;

      // Emergence: straight up from the source, give or take, to a random
      // fraction of the emergence height.
      const jitter = basin.radius * 0.05;
      emerge[o] = x + (random() - 0.5) * jitter;
      emerge[o + 1] = basin.center.y + config.emergenceHeight * (0.35 + 0.65 * random());
      emerge[o + 2] = z + (random() - 0.5) * jitter;

      seed[i] = random();
      // Square-rooted, so few start early and the emission builds.
      delay[i] = Math.sqrt(random());
    }

    // Rank the seeds once: the shader starts low seeds first, so a layout
    // that reads the rank can decide what forms first.
    const byseed = Array.from(seed.keys()).sort((a, b) => seed[a]! - seed[b]!);
    order = new Float32Array(count);
    byseed.forEach((particle, rank) => {
      order[particle] = rank / count;
    });
    fillTargets(target, count, layout);

    const geometry = new THREE.BufferGeometry();
    // `position` is unused by the shader but three counts vertices from it.
    geometry.setAttribute('position', new THREE.BufferAttribute(source, 3));
    geometry.setAttribute('aSource', new THREE.BufferAttribute(source, 3));
    geometry.setAttribute('aEmerge', new THREE.BufferAttribute(emerge, 3));
    // Both point at the layout: a fresh field has nothing to morph from.
    geometry.setAttribute('aFrom', new THREE.BufferAttribute(target.slice(), 3));
    geometry.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    return geometry;
  };

  const field: ParticleField = {
    points,
    get duration() {
      return duration;
    },
    get elapsed() {
      return elapsed;
    },
    get morph() {
      return morph;
    },

    rebuild(config, layout) {
      points.geometry.dispose();
      points.geometry = buildGeometry(config, layout);
      morph = 1;
      uniforms.uMorph.value = 1;
      field.configure(config);
    },

    setLayout(layout, seconds, spread = DEFAULT_SPREAD) {
      live = null;
      uniforms.uMorphSpread.value = spread;
      const from = points.geometry.getAttribute('aFrom') as THREE.BufferAttribute;
      const target = points.geometry.getAttribute('aTarget') as THREE.BufferAttribute;
      const fromArray = from.array as Float32Array;
      const targetArray = target.array as Float32Array;
      // Freeze where the particles are: a morph interrupted mid-way starts the
      // next one from the blend, not from a target nobody reached.
      const t = easeInOut(morph);
      for (let i = 0; i < fromArray.length; i += 1) {
        fromArray[i] = fromArray[i]! + (targetArray[i]! - fromArray[i]!) * t;
      }
      fillTargets(targetArray, target.count, layout);
      from.needsUpdate = true;
      target.needsUpdate = true;
      morph = 0;
      morphSeconds = Math.max(0.01, seconds);
      uniforms.uMorph.value = 0;
    },

    configure(config) {
      uniforms.uDelaySpread.value = config.emergenceSeconds * DELAY_SHARE;
      uniforms.uRiseSeconds.value = config.emergenceSeconds * (1 - DELAY_SHARE);
      uniforms.uConvergeSeconds.value = config.convergenceSeconds;
      uniforms.uSize.value = config.size;
      uniforms.uSwellAmp.value = config.swellAmplitude;
      uniforms.uSwellK.value = (Math.PI * 2) / Math.max(0.01, config.swellLength);
      uniforms.uSwellSpeed.value = config.swellSpeed;
      uniforms.uColor.value.setHex(config.color);
      uniforms.uOpacity.value = config.opacity;
      duration = config.emergenceSeconds + config.convergenceSeconds;
    },

    setElapsed(seconds) {
      elapsed = Math.max(0, seconds);
      uniforms.uElapsed.value = elapsed;
    },

    setLiveLayout(next) {
      live = next;
    },

    tick(dt, playing) {
      uniforms.uTime.value += dt;
      if (live) {
        const target = points.geometry.getAttribute('aTarget') as THREE.BufferAttribute;
        fillTargets(target.array as Float32Array, target.count, live(uniforms.uTime.value));
        target.needsUpdate = true;
      }
      if (playing) field.setElapsed(elapsed + dt);
      if (morph < 1) {
        morph = Math.min(1, morph + dt / morphSeconds);
        uniforms.uMorph.value = morph;
      }
      return elapsed;
    },

    setViewport(heightPx) {
      uniforms.uScale.value = heightPx * 0.5;
    },

    dispose() {
      points.geometry.dispose();
      material.dispose();
    },
  };

  field.configure(initial);
  return field;
}

/** The shader's `easeInOut`. The GPU staggers per particle on top; this is close enough for a freeze. */
function easeInOut(x: number): number {
  return x * x * (3 - 2 * x);
}
