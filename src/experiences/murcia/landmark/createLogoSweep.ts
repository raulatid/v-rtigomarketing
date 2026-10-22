import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { easeHighlight, stepHighlight } from '../interaction/buildingHighlight';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * A narrow band of light that runs across the tower's isotype while the
 * Conócenos section is open (plan 027, stop 2).
 *
 * Mixed into `outgoingLight`, like the buildings' hover (`interaction/
 * buildingHighlight.ts`): no new `THREE.Light`, which would recompile every
 * program in the city, and a mix rather than an add, so the band reads as a
 * sheen on the mark's own colour instead of a clipped white stripe.
 *
 * The band runs along a diagonal of the mark's LOCAL frame, carried into the
 * world by the node's own matrix, so it crosses the curves the same way at
 * every angle of the logo's turn. Its clock is the frame delta: a 30 fps phone
 * and a 120 fps desktop see it at the same place.
 *
 * Reduced motion does not stop it, on purpose (plan 027, decision 6): with the
 * camera held, a light passing over a still mark is not motion applied to the
 * viewer. The turn itself still stops (`createTowerLogo.ts`).
 *
 * The logo's material is cloned, once per source material, so nothing else
 * that shares it sweeps.
 */
export interface LogoSweep {
  /** Only sets where the strength is heading; `update` walks it there. */
  setTarget(on: boolean): void;
  update(delta: number): void;
  /** Hands every mesh its own material back and frees the clones. */
  dispose(): void;
}

/** Mix toward the band's colour at its centre. A sheen, not a stripe of paint. */
const INTENSITY = 0.55;
/** Seconds for the strength to rise on entering, and fall on leaving. */
const FADE_SECONDS = 0.8;
/** Seconds for one crossing, and for the whole cycle: the band rests between passes. */
const CROSSING_SECONDS = 1.6;
const CYCLE_SECONDS = 4.5;
/** World units each side of the band's centre where it fades out. The mark is ~8.5 tall. */
const HALF_WIDTH = 0.9;
/** The diagonal in the mark's local frame: up its height, leaning toward the arc. */
const LOCAL_AXIS = new THREE.Vector3(1, 1.6, 0).normalize();
/** A cool white: the light on a lacquered surface, not the brand's blue. */
const COLOR = '#f2f6ff';

const VERTEX_AT = '#include <project_vertex>';
const FRAGMENT_AT = '#include <opaque_fragment>';

export function createLogoSweep(root: THREE.Object3D, config: VertigoBuildingConfig): LogoSweep {
  const meshes: THREE.Mesh[] = [];
  for (const name of config.logoNodeNames) {
    // Missing nodes are `createTowerLogo`'s to report; a sweep over nothing is no fault.
    findByAnyNameSpelling(root, name)?.object.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
  }

  // Where the band crosses zero: the mark's centre as it stands now. The turn
  // is about a vertical axis through the mark, so the centre barely moves.
  const box = new THREE.Box3();
  for (const mesh of meshes) box.expandByObject(mesh);
  const radius = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length() / 2;

  const uSweep = { value: 0 };
  const uSweepAt = { value: 0 };
  const uSweepCentre = { value: box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3()) };
  const uSweepAxis = { value: LOCAL_AXIS.clone() };
  const uSweepColor = { value: new THREE.Color(COLOR) };
  const uSweepHalfWidth = { value: HALF_WIDTH };

  const cloneOf = new Map<THREE.Material, THREE.Material>();
  const assigned = new Map<THREE.Mesh, { original: THREE.Material | THREE.Material[]; ours: THREE.Material | THREE.Material[] }>();

  const resolve = (source: THREE.Material): THREE.Material => {
    const existing = cloneOf.get(source);
    if (existing) return existing;
    const clone = source.clone();
    clone.name = `${source.name || 'material'} | sweep`;
    // Material.clone does not copy these hooks. Wrapped, never replaced.
    const inner = source.onBeforeCompile;
    clone.onBeforeCompile = (shader, renderer) => {
      inner.call(clone, shader, renderer);
      if (!shader.vertexShader.includes(VERTEX_AT) || !shader.fragmentShader.includes(FRAGMENT_AT)) {
        throw new Error('[sweep] three moved <project_vertex> or <opaque_fragment>');
      }
      Object.assign(shader.uniforms, { uSweep, uSweepAt, uSweepCentre, uSweepAxis, uSweepColor, uSweepHalfWidth });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSweepCentre;\nuniform vec3 uSweepAxis;\nvarying float vSweep;')
        .replace(
          VERTEX_AT,
          `${VERTEX_AT}\nvSweep = dot((modelMatrix * vec4(transformed, 1.0)).xyz - uSweepCentre, normalize(mat3(modelMatrix) * uSweepAxis));`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uSweep;\nuniform float uSweepAt;\nuniform float uSweepHalfWidth;\nuniform vec3 uSweepColor;\nvarying float vSweep;',
        )
        .replace(
          FRAGMENT_AT,
          `outgoingLight = mix(outgoingLight, uSweepColor, uSweep * (1.0 - smoothstep(0.0, uSweepHalfWidth, abs(vSweep - uSweepAt))));\n${FRAGMENT_AT}`,
        );
    };
    const innerKey = source.customProgramCacheKey.call(source);
    clone.customProgramCacheKey = () => `${innerKey}|sweep`;
    cloneOf.set(source, clone);
    return clone;
  };

  for (const mesh of meshes) {
    const original = mesh.material;
    const ours = Array.isArray(original) ? original.map(resolve) : resolve(original);
    mesh.material = ours;
    assigned.set(mesh, { original, ours });
  }

  let progress = 0;
  let target = 0;
  let clock = 0;
  return {
    setTarget(on) {
      target = on ? 1 : 0;
    },

    update(delta) {
      if (progress === 0 && target === 0) return;
      progress = stepHighlight(progress, target, delta, FADE_SECONDS);
      // Wrapped, like the logo's angle, so the clock never grows unbounded.
      clock = (clock + Math.max(0, delta)) % CYCLE_SECONDS;
      // From fully off one side to fully off the other, then a rest off-mark.
      const travel = Math.min(1, clock / CROSSING_SECONDS);
      const reach = radius + HALF_WIDTH;
      uSweepAt.value = -reach + 2 * reach * travel;
      uSweep.value = easeHighlight(progress) * INTENSITY;
    },

    dispose() {
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
