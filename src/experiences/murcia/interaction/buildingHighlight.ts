import * as THREE from 'three';
import { clamp01 } from '../../../utils/easing';
import { prefersReducedMotion } from '../../../platform/motionPreference';

/**
 * The satellites' hover light, on a set of the city's buildings.
 *
 * On Earth a hovered satellite takes its holo colour as an emissive that one
 * eased strength brings up and down (`orbit/createSatellite.ts`). The city
 * cannot do it that way, for two reasons:
 *
 *   - its baked surfaces are `MeshBasicMaterial` (`lightmaps/lightmapMaterial.ts`),
 *     which has no emissive channel at all, so the colour is worked into the
 *     shader's `outgoingLight` instead — the same place an emissive term lands;
 *   - those materials are SHARED, by atlas and source material, across the
 *     whole city (`loadUnifiedLightmaps`, `citySurfaceDepth`). Every distinct
 *     material in the set is cloned once and the clone reused, so the rest of
 *     the city never glows with it.
 *
 * The colour is mixed in, not added (2026-09-23). With no bloom in Murcia an
 * added colour only brightens: on near-white porcelain it clipped to white and
 * lost its hue, while darker faces went blue, so one building lit unevenly.
 * A mix tints every face toward the same hue and keeps the baked shading
 * under it, which reads as "selected" rather than "glowing".
 * No light is added either: a new `THREE.Light` changes the scene's light
 * count and recompiles every program at the worst moment.
 *
 * ## The idle blink (2026-09-22)
 *
 * Viewers could not tell which buildings could be touched: a hover light
 * only speaks to a pointer that is already there. So the set also blinks on
 * its own — one soft bump every `blink.period` seconds, in the hover's colour
 * at `blink.strength` of its light — and a hover always outweighs it, so a
 * pointer resting on the building holds it steadily lit through a blink. Off
 * under reduced motion: a periodic light is exactly the motion that setting
 * declines, and the hover still answers. The owner pauses it (`setBlinking`)
 * while the viewer is inside what the buildings open: an invitation to enter
 * is noise once they have.
 */

/** One blink every `period` seconds, `duration` seconds long, at `strength` of the hover's light. */
export interface BuildingBlink {
  period: number;
  duration: number;
  strength: number;
}

export interface BuildingHighlightOptions {
  /** sRGB. */
  color: string;
  /** Mix toward `color` at full strength, 0..1: low keeps the baked shading readable, 1 is a flat silhouette. The visual pass owns this number. */
  intensity: number;
  /** Seconds for a full rise, and for a full fall. The satellites' `highlightDuration`. */
  duration: number;
  /** The idle blink; absent or null, the set lights on hover alone. */
  blink?: BuildingBlink | null;
}

export const BUILDING_BLINK: BuildingBlink = {
  period: 6,
  duration: 0.9,
  strength: 1,
};

export const BUILDING_HIGHLIGHT: BuildingHighlightOptions = {
  // The Auditoría CTA's `--accent` (`components/siteHeader.css`), restated:
  // a shader cannot read a CSS custom property, so a change there must land here too.
  color: '#1c67ff',
  intensity: 0.4,
  duration: 0.4,
  blink: BUILDING_BLINK,
};

export interface BuildingHighlight {
  /** Only sets where the strength is heading; `update` walks it there. */
  setTarget(on: boolean): void;
  /** Pauses or resumes the idle blink; a blink under way fades out rather than cuts. */
  setBlinking(on: boolean): void;
  update(deltaTime: number): void;
  /** Hands every mesh its own material back and frees the clones. */
  dispose(): void;
}

const INJECT_AT = '#include <opaque_fragment>';

/**
 * Earth's `advanceExpansion`, restated for the same reason as the colour.
 * Progress is a value, not a start time, so a pointer leaving mid-rise falls
 * back from where the light is; `duration` is a full 0→1 traversal.
 */
export function stepHighlight(current: number, target: number, delta: number, duration: number): number {
  const to = clamp01(target);
  if (!(duration > 0) || !Number.isFinite(duration)) return to;
  // `clamp01` passes NaN through, and NaN in a uniform is an invisible building.
  const from = Number.isFinite(current) ? clamp01(current) : 0;
  const step = delta / duration;
  const next = to > from ? Math.min(from + step, to) : Math.max(from - step, to);
  // Exact rest, so `progress === target` stays a valid idle check.
  return Math.abs(next - to) < 1e-6 ? to : next;
}

/** Smoothstep: symmetric, so a reversal decelerates the way it accelerated. */
export function easeHighlight(progress: number): number {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
}

/**
 * The idle blink's shape: 0..1 over the first `duration` seconds of every
 * `period`, dark for the rest.
 *
 * A raised sine, so it rises and falls without a corner and peaks halfway —
 * a breath rather than a flash, on a surface that has no bloom to soften one.
 * Degenerate timings light nothing: an unset blink should be no blink.
 */
export function blinkStrength(seconds: number, period: number, duration: number): number {
  if (!(period > 0) || !(duration > 0) || !Number.isFinite(seconds)) return 0;
  const t = ((seconds % period) + period) % period;
  if (t >= duration) return 0;
  const s = Math.sin((Math.PI * t) / duration);
  return s * s;
}

export function createBuildingHighlight(
  roots: readonly THREE.Object3D[],
  options: BuildingHighlightOptions = BUILDING_HIGHLIGHT,
): BuildingHighlight {
  // One uniform pair for every clone: the set lights as one.
  const uHighlight = { value: 0 };
  const uHighlightColor = { value: new THREE.Color(options.color) };

  const cloneOf = new Map<THREE.Material, THREE.Material>();
  const assigned = new Map<THREE.Mesh, { original: THREE.Material | THREE.Material[]; ours: THREE.Material | THREE.Material[] }>();

  const resolve = (source: THREE.Material): THREE.Material => {
    const existing = cloneOf.get(source);
    if (existing) return existing;
    const clone = source.clone();
    clone.name = `${source.name || 'material'} | highlight`;
    // Material.clone does not copy these hooks, and the lightmap's is what
    // samples the atlas. Wrapped, never replaced.
    const inner = source.onBeforeCompile;
    clone.onBeforeCompile = (shader, renderer) => {
      inner.call(clone, shader, renderer);
      if (!shader.fragmentShader.includes(INJECT_AT)) {
        throw new Error('[highlight] three moved <opaque_fragment>');
      }
      shader.uniforms.uHighlight = uHighlight;
      shader.uniforms.uHighlightColor = uHighlightColor;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHighlight;\nuniform vec3 uHighlightColor;')
        .replace(INJECT_AT, `outgoingLight = mix(outgoingLight, uHighlightColor, uHighlight);\n${INJECT_AT}`);
    };
    const innerKey = source.customProgramCacheKey.call(source);
    clone.customProgramCacheKey = () => `${innerKey}|highlight`;
    cloneOf.set(source, clone);
    return clone;
  };

  const meshes = new Set<THREE.Mesh>();
  for (const root of roots) {
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.add(object as THREE.Mesh);
    });
  }
  for (const mesh of meshes) {
    const original = mesh.material;
    const ours = Array.isArray(original) ? original.map(resolve) : resolve(original);
    mesh.material = ours;
    assigned.set(mesh, { original, ours });
  }

  let progress = 0;
  let target = 0;
  // Read once, like every motion branch in the city: the setting applies on reload.
  const blink = options.blink && !prefersReducedMotion() ? options.blink : null;
  let clock = 0;
  // A gain on the blink rather than a flag, so pausing mid-blink fades like a hover does.
  let blinkGain = 1;
  let blinkTarget = 1;

  return {
    setTarget(on: boolean): void {
      target = on ? 1 : 0;
    },

    setBlinking(on: boolean): void {
      blinkTarget = on ? 1 : 0;
    },

    update(deltaTime: number): void {
      if (progress !== target) progress = stepHighlight(progress, target, deltaTime, options.duration);
      let strength = easeHighlight(progress);
      if (blink) {
        if (blinkGain !== blinkTarget) blinkGain = stepHighlight(blinkGain, blinkTarget, deltaTime, options.duration);
        if (blinkGain === 0) {
          // Parked at the start of a dark stretch, so a resume never opens mid-blink.
          clock = blink.duration;
        } else {
          clock += deltaTime;
          // The brighter claim wins, so a hover is never dimmed by a blink ending under it.
          const idle = blink.strength * blinkStrength(clock, blink.period, blink.duration);
          strength = Math.max(strength, idle * easeHighlight(blinkGain));
        }
      }
      uHighlight.value = strength * options.intensity;
    },

    dispose(): void {
      for (const [mesh, { original, ours }] of assigned) {
        // Only if nothing has replaced ours since: a later owner's material is theirs.
        if (mesh.material === ours) mesh.material = original;
      }
      assigned.clear();
      for (const clone of cloneOf.values()) clone.dispose();
      cloneOf.clear();
    },
  };
}
