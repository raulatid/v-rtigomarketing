/**
 * Every tunable of the river water, in one plain object.
 *
 * Nothing here imports three, so the shape stays JSON-round-trippable — colours
 * are hex numbers rather than `THREE.Color`, which is also how every other
 * config in this repo writes them (`murciaConfig.ts` uses `0x9fb4c7`).
 *
 * Deliberately NOT folded into `murciaConfig.ts`: these are the shader's own
 * tunables, tuned as a unit, and keeping them beside the shader is what lets
 * `water/` stay a self-contained module.
 */

export interface RioWaterConfig {
  // ---- Flow -------------------------------------------------------------
  /**
   * Which way the current runs.
   *
   * The geometry yields an axis, not a direction — nothing in a ribbon of
   * triangles says which end is upstream — so this is a genuine coin toss a
   * person has to call by looking at it. Applied by `setFlowAxis`.
   */
  flowReversed: boolean;
  /** How fast the current carries the ripples downstream. */
  flowSpeed: number;
  /** Base ripple cell, in metres. Finer octaves are derived from it. */
  rippleScale: number;
  /** Height of the ripple normals. 0 gives a mirror-flat surface. */
  rippleStrength: number;
  /**
   * Size ratio between successive ripple octaves (lacunarity). 2 gives cells of
   * rippleScale, /2, /4, /8 metres.
   */
  rippleLayerRatio: number;

  // ---- Colour -----------------------------------------------------------
  /** Colour of the deep channel, seen straight down. */
  deepColor: number;
  /** Colour at the banks, where the ramp says the water is shallow. */
  shallowColor: number;
  /**
   * What the water reflects at grazing angles.
   *
   * The scene has no environment map at all, so without this the fresnel rim
   * would have nothing to blend toward and the water would read as flat paint.
   */
  skyColor: number;
  /** Width of the shallow band at each bank, in METRES from the edge. */
  shoreWidth: number;

  // ---- Wall shadow ------------------------------------------------------
  /**
   * The channel walls darken the water along both banks. This is a MULTIPLY,
   * not a paint: at full strength the water colour is multiplied by
   * `wallShadowColor`, so black is a real shadow and the sun highlight is
   * suppressed inside it. 0 disables it.
   */
  wallShadowStrength: number;
  /** How far the shadow reaches from the bank, in METRES. */
  wallShadowWidth: number;
  /** Multiplier colour at full shadow. Black = pure darkening. */
  wallShadowColor: number;

  // ---- Sky reflection ---------------------------------------------------
  /**
   * Fresnel falloff exponent. 5 is the physical Schlick value; lower spreads the
   * sky reflection further down towards the camera.
   */
  fresnelPower: number;
  /** Reflectance at normal incidence. 0.02 is water's physical value. */
  fresnelBias: number;
}

/**
 * The accepted look, tuned in the sandbox on 2026-08-28 against the Murcia rig:
 * a saturated blue channel with a slightly darker shore band, so the river reads
 * as the one coloured element against the grey city. Measured at 60 fps
 * (16.7 ms median) on the shipped 22-vertex mesh.
 */
export const DEFAULT_RIO_WATER_CONFIG: RioWaterConfig = {
  flowReversed: true,
  flowSpeed: 0.028,
  // Four octaves at ratio 2 run 8 / 4 / 2 / 1 m; the shader fades each one out
  // once it drops under two pixels.
  rippleScale: 8,
  rippleStrength: 0.35,
  rippleLayerRatio: 2.0,

  deepColor: 0x0e448b,
  shallowColor: 0x003c8a,
  skyColor: 0x3581e3,
  shoreWidth: 4.5,

  wallShadowStrength: 0.69,
  wallShadowWidth: 5,
  wallShadowColor: 0x01070e,

  fresnelPower: 4,
  fresnelBias: 0.02,
};
