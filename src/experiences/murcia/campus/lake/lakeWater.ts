import * as THREE from 'three';
import fragmentShader from './shaders/water.frag';
import vertexShader from './shaders/water.vert';

/**
 * The lake's surface: a water shader on the export's water meshes.
 *
 * The export ships the water as a flat PBR material. This swaps every mesh
 * under the water node onto one `ShaderMaterial` and keeps the originals, so
 * `dispose` can hand the meshes back as they were and free the shader. The
 * geometry is untouched, so the click raycast still hits the same surface.
 */

export interface LakeWaterConfig {
  /** Scales every wave train's wavelength, in world units. */
  waveLength: number;
  /** Scales every wave train's speed. */
  speed: number;
  /** How much the waves tilt the normal. */
  strength: number;
  /** Sun glint tightness. */
  gloss: number;
  /** How strongly light plays on the body. */
  caustics: number;
  deep: number;
  shallow: number;
  sky: number;
  horizon: number;
}

export interface LakeWater {
  configure(config: LakeWaterConfig): void;
  update(dt: number): void;
  dispose(): void;
}

export function attachLakeWater(
  water: THREE.Object3D,
  lightDirection: THREE.Vector3,
  initial: LakeWaterConfig,
): LakeWater {
  const uniforms = {
    uTime: { value: 0 },
    uWaveLength: { value: 1 },
    uSpeed: { value: 1 },
    uStrength: { value: 1 },
    uGloss: { value: 200 },
    uCaustics: { value: 1 },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uLightDir: { value: lightDirection.clone().normalize() },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  water.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    originals.set(mesh, mesh.material);
    mesh.material = material;
  });

  const surface: LakeWater = {
    configure(config) {
      uniforms.uWaveLength.value = config.waveLength;
      uniforms.uSpeed.value = config.speed;
      uniforms.uStrength.value = config.strength;
      uniforms.uGloss.value = config.gloss;
      uniforms.uCaustics.value = config.caustics;
      uniforms.uDeep.value.setHex(config.deep);
      uniforms.uShallow.value.setHex(config.shallow);
      uniforms.uSky.value.setHex(config.sky);
      uniforms.uHorizon.value.setHex(config.horizon);
    },
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      for (const [mesh, original] of originals) mesh.material = original;
      originals.clear();
      material.dispose();
    },
  };

  surface.configure(initial);
  return surface;
}
