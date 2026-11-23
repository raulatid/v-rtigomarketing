import * as THREE from 'three';
import { HAZE_TOP } from '../environment/createSkyDome';

/**
 * The veil the Conócenos sky stop is revealed through (plan 029b §2.3 and §4):
 * a sphere of its own, drawn over the dome and the stars and under the
 * satellites, that paints the sky of always — the fog's haze and the day blue
 * the city is seen under, with no night above it (decision R7) — everywhere
 * outside the pulse's front, and the ring on the front itself. Inside, it is
 * clear: the night the dome already draws, stars and all.
 *
 * Why a veil and not the dome: the dome and the stars are always up and are
 * drawn by the warp and the blog's capture too. The veil touches neither, and
 * exists only for the two seconds of the reveal; the rest of the time it is
 * hidden and costs nothing. What it cannot do is flash each star as the front
 * crosses it, which the prototype did in the stars' own shader.
 *
 * The dome's terms (`environment/createSkyDome.ts`): placed round whichever
 * camera draws it, in the vertex stage, written before the city with no depth,
 * so it can never cover a building. Inside the stars (0.9 × 0.98 of the far
 * plane) and outside the satellites (0.85), though the order is what decides.
 *
 * One pass for the cover and the ring: the colour is written premultiplied —
 * the sky of always times the cover, plus the ring's light — and blended
 * `ONE, ONE_MINUS_SRC_ALPHA`, so the cover lays over what is under it and the
 * ring adds to it. Custom blending, not `transparent`: a transparent object is
 * drawn after the city, and the order among the sky's layers is lost.
 */

export interface SkyVeilColors {
  /** The ground fog's colour: the dome's horizon. */
  horizon: number;
  /** The daylight sky over it: the dome's day. */
  day: number;
}

export interface SkyVeil {
  readonly object3D: THREE.Object3D;
  /**
   * Where the ring is: `origin` the unit direction of the isotype from the eye,
   * `front` the radians from it the ring has reached, `glow` its light 0..1.
   */
  set(origin: THREE.Vector3, front: number, glow: number): void;
  /** The horizon follows the fog, as the dome's does: under the city's night it is night blue. */
  setHorizon(color: THREE.Color): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** The share of the far plane: between the stars (0.882) and the satellites (0.85). */
const RADIUS_OF_FAR = 0.87;
/** Radians: the cover's soft rim, just outside the front. */
const COVER_EDGE = 0.05;
/** Radians: the ring's fine bright core, and the trail it leaves inside. */
const RING_CORE = 0.006;
const RING_TRAIL = 0.05;
/** The ring's colour: white (decision R6), not the brand blue, which `uso-del-azul.md` does not list here. */
const RING_COLOR = 0xffffff;

const VERTEX = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  vec3 world = cameraPosition + position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uDay;
uniform vec3 uRing;
uniform vec3 uOrigin;
uniform float uFront;
uniform float uGlow;

varying vec3 vDirection;

void main() {
  vec3 d = normalize(vDirection);
  // The dome's lower band, and the day blue all the way up: no night.
  vec3 before = mix(uHorizon, uDay, smoothstep(0.0, ${HAZE_TOP.toFixed(3)}, d.y));
  float angle = acos(clamp(dot(d, uOrigin), -1.0, 1.0));
  float cover = smoothstep(uFront - ${COVER_EDGE.toFixed(3)}, uFront, angle);
  // A fine bright edge on the front, and a trail inside it.
  float x = angle - uFront;
  float core = exp(-(x * x) / ${(2 * RING_CORE * RING_CORE).toExponential(3)});
  float trail = exp(-(x * x) / ${(2 * RING_TRAIL * RING_TRAIL).toExponential(3)}) * step(x, 0.0);
  vec3 ring = uRing * uGlow * (core * 0.9 + trail * 0.35);
  if (cover <= 0.0 && uGlow * trail <= 0.0) discard;
  gl_FragColor = vec4(before * cover + ring, cover);
  #include <colorspace_fragment>
}
`;

export function createSkyVeil(colors: SkyVeilColors, far: number): SkyVeil {
  const geometry = new THREE.SphereGeometry(far * RADIUS_OF_FAR, 48, 24);
  const uniforms = {
    uHorizon: { value: new THREE.Color(colors.horizon) },
    uDay: { value: new THREE.Color(colors.day) },
    uRing: { value: new THREE.Color(RING_COLOR) },
    uOrigin: { value: new THREE.Vector3(0, 1, 0) },
    uFront: { value: 0 },
    uGlow: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    side: THREE.BackSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    // As the dome: its horizon has to be the fog's colour exactly.
    toneMapped: false,
  });
  const veil = new THREE.Mesh(geometry, material);
  veil.name = 'sky-veil';
  // After the dome (-1000) and the stars (-999), before the satellites (-998).
  veil.renderOrder = -998.5;
  veil.frustumCulled = false;
  veil.visible = false;

  return {
    object3D: veil,

    set(origin, front, glow) {
      uniforms.uOrigin.value.copy(origin);
      uniforms.uFront.value = front;
      uniforms.uGlow.value = glow;
    },

    setHorizon(color) {
      uniforms.uHorizon.value.copy(color);
    },

    setVisible(visible) {
      veil.visible = visible;
    },

    dispose() {
      veil.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
