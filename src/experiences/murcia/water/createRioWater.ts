import * as THREE from 'three';
import type { RioWaterConfig } from './rioWaterConfig';
import rioVertexShader from './shaders/rio/vertex.glsl';
import rioFragmentShader from './shaders/rio/fragment.glsl';

/**
 * The river water material.
 *
 * This file, `rioWaterConfig.ts`, `riverFrame.ts` and the two `.glsl` files
 * import nothing but `three`. Keep it that way: the unit was developed against
 * the real city model in a standalone sandbox precisely because it depends on
 * nothing else, and that is what let it come across without adaptation.
 *
 * Wiring, in order — `loadCity` does this once the trim sheet has been applied:
 *
 *   const frame = computeRiverFrame(rio.geometry);
 *   const water = createRioWater(config);
 *   rio.material = water.material;
 *   water.setBankSegments(frame.bankSegments, rio.matrixWorld);
 *   water.setFlowAxis(frame.axis, rio.matrixWorld, config.flowReversed);
 *   // per frame:
 *   water.update(elapsedSeconds);
 *
 * The material is a plain `THREE.ShaderMaterial`, which is the house pattern
 * here (`SkyShell.tsx`, `starShader.ts`) — not `onBeforeCompile`, which appears
 * nowhere in this repo, and not drei, which is not a dependency.
 */

export interface RioWater {
  material: THREE.ShaderMaterial;
  /**
   * Advances the animation. Call once per frame with ELAPSED SECONDS, not the
   * frame delta — `MurciaExperience.update` takes a delta and has to accumulate
   * one for this. Passing the delta straight through yields a river frozen at
   * roughly 1/60 s, which still renders as plausible water.
   */
  update: (elapsedSeconds: number) => void;
  /**
   * Supplies the bank outline (`RiverFrame.bankSegments`, local space) and the
   * mesh world matrix. The fragment stage measures the distance to the nearest
   * bank from these; without them the whole surface reads as mid-channel.
   */
  setBankSegments: (segments: Float32Array, matrixWorld: THREE.Matrix4) => void;
  /**
   * The overall river axis (`RiverFrame.axis`, local space) the ripples are
   * stretched and advected along. `reversed` is `config.flowReversed`; call
   * again whenever it changes.
   */
  setFlowAxis: (
    axis: { x: number; z: number },
    matrixWorld: THREE.Matrix4,
    reversed: boolean,
  ) => void;
  dispose: () => void;
}

/** Must match `MAX_BANK_SEGMENTS` in the fragment shader. */
// The selected v4 river has 40 connected bank segments after seam welding.
const MAX_BANK_SEGMENTS = 48;

/**
 * Builds the water material.
 *
 * Every uniform is declared here at its final shape. That is the convention
 * documented at `SkyShell.tsx`, and it is load-bearing here: `MurciaExperience.warm()`
 * calls `renderer.compileAsync`, so a uniform appearing later would move a
 * shader compile onto the warp cut.
 */
export function createRioWater(config: RioWaterConfig): RioWater {
  const material = new THREE.ShaderMaterial({
    vertexShader: rioVertexShader,
    fragmentShader: rioFragmentShader,
    // Fog is off in Murcia today (`sceneState.fog` is null), but fog is
    // Scene-level state and applies to every material at once. Opting in costs
    // nothing while it is null — three defines no `USE_FOG`, so the chunks
    // compile away — and stops the river from being the one surface that
    // ignores it if it is ever switched on.
    fog: true,
    // Opaque. The river is a recessed channel with the terrain plate around it;
    // there is nothing to see through it, and transparency would buy a sorting
    // problem for no pixels.
    transparent: false,
    uniforms: {
      uTime: { value: 0 },

      uFlowSpeed: { value: config.flowSpeed },
      uRippleScale: { value: config.rippleScale },
      uRippleStrength: { value: config.rippleStrength },
      uRippleLayerRatio: { value: config.rippleLayerRatio },

      uDeepColor: { value: new THREE.Color() },
      uShallowColor: { value: new THREE.Color() },
      uSkyColor: { value: new THREE.Color() },
      uShoreWidth: { value: config.shoreWidth },

      uWallShadowStrength: { value: config.wallShadowStrength },
      uWallShadowWidth: { value: config.wallShadowWidth },
      uWallShadowColor: { value: new THREE.Color() },

      uFresnelPower: { value: config.fresnelPower },
      uFresnelBias: { value: config.fresnelBias },

      uBankSegments: {
        value: Array.from({ length: MAX_BANK_SEGMENTS }, () => new THREE.Vector4()),
      },
      uBankSegmentCount: { value: 0 },
      uFlowAxis: { value: new THREE.Vector2(1, 0) },
    },
  });

  /**
   * Colours arrive as hex authored for sRGB, the same way every colour in this
   * repo's config is written. Passing the colour space explicitly makes three
   * convert to linear on the way in, so the shader works in linear and the
   * tone-mapping chunk at the end of the fragment stage lands correctly.
   */
  const setColor = (name: string, hex: number): void => {
    (material.uniforms[name]!.value as THREE.Color).setHex(hex, THREE.SRGBColorSpace);
  };

  /**
   * Private, and deliberately not exported: the colour uniforms need converting
   * rather than assigning, so construction goes through here instead of
   * inlining them above.
   */
  const applyConfig = (next: RioWaterConfig): void => {
    const u = material.uniforms;
    u['uFlowSpeed']!.value = next.flowSpeed;
    u['uRippleScale']!.value = next.rippleScale;
    u['uRippleStrength']!.value = next.rippleStrength;
    u['uRippleLayerRatio']!.value = next.rippleLayerRatio;

    setColor('uDeepColor', next.deepColor);
    setColor('uShallowColor', next.shallowColor);
    setColor('uSkyColor', next.skyColor);
    u['uShoreWidth']!.value = next.shoreWidth;

    u['uWallShadowStrength']!.value = next.wallShadowStrength;
    u['uWallShadowWidth']!.value = next.wallShadowWidth;
    setColor('uWallShadowColor', next.wallShadowColor);

    u['uFresnelPower']!.value = next.fresnelPower;
    u['uFresnelBias']!.value = next.fresnelBias;
  };

  applyConfig(config);

  const setBankSegments = (segments: Float32Array, matrixWorld: THREE.Matrix4): void => {
    const slots = material.uniforms['uBankSegments']!.value as THREE.Vector4[];
    const available = Math.floor(segments.length / 6);
    const count = Math.min(available, MAX_BANK_SEGMENTS);
    if (available > MAX_BANK_SEGMENTS) {
      console.warn(
        `[rio] ${available} bank segments but the shader holds ${MAX_BANK_SEGMENTS}; ` +
          'the rest are dropped and the bank distance will be wrong there.',
      );
    }

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      a.fromArray(segments, i * 6).applyMatrix4(matrixWorld);
      b.fromArray(segments, i * 6 + 3).applyMatrix4(matrixWorld);
      slots[i]!.set(a.x, a.z, b.x, b.z);
    }
    material.uniforms['uBankSegmentCount']!.value = count;
  };

  const setFlowAxis = (
    axis: { x: number; z: number },
    matrixWorld: THREE.Matrix4,
    reversed: boolean,
  ): void => {
    const world = new THREE.Vector3(axis.x, 0, axis.z).transformDirection(matrixWorld);
    const flat = new THREE.Vector2(world.x, world.z);
    if (flat.lengthSq() < 1e-8) flat.set(1, 0);
    flat.normalize().multiplyScalar(reversed ? -1 : 1);
    (material.uniforms['uFlowAxis']!.value as THREE.Vector2).copy(flat);
  };

  return {
    material,
    update: (elapsedSeconds: number) => {
      material.uniforms['uTime']!.value = elapsedSeconds;
    },
    setBankSegments,
    setFlowAxis,
    dispose: () => material.dispose(),
  };
}
