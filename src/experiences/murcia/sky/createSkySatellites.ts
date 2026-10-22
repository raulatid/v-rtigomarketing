import * as THREE from 'three';
import type { Direction, SkyPass } from './skyPasses';

/**
 * The satellites' points of light: one `THREE.Points` drawn on the dome's
 * terms (`environment/createSkyDome.ts`) — placed round whichever camera draws
 * it, in the vertex stage, written before the city and with no depth, so it
 * can never cover a building. Each satellite is a bright core in a soft halo,
 * a fixed size on screen, added onto the sky as the stars are.
 *
 * It does no work of its own choosing: the host writes the passes' directions
 * and alphas with `update` while the sky can be seen, and hides it otherwise.
 */

export interface SkySatellites {
  readonly object3D: THREE.Object3D;
  /** Writes every satellite's place and light at `t`. */
  update(passes: readonly SkyPass[], t: number): void;
  setVisible(visible: boolean): void;
  /** The drawing buffer's pixels per CSS pixel, for the points' size. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** CSS px across the halo; the core is a fraction of it. Brighter than a large star (3 px), to read as moving light. */
const POINT_SIZE_PX = 18;
/**
 * The radius the points are placed at, as a share of the far plane: inside the
 * stars (0.9 × 0.98), so the depth test never lets the stars cover one.
 */
const RADIUS_OF_FAR = 0.85;

/**
 * The `focus` for `createSkyPasses`: the direction through `ndc` of the camera on
 * the sky stop (`SKY_FOCUS_NDC` in `about/aboutPoses.ts`).
 */
export function skyFocusOf(camera: THREE.Camera, ndc: { readonly x: number; readonly y: number }): Direction {
  camera.updateMatrixWorld();
  const through = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
  const direction = through.sub(camera.getWorldPosition(new THREE.Vector3())).normalize();
  return [direction.x, direction.y, direction.z];
}

const VERTEX = /* glsl */ `
attribute float aAlpha;
uniform float uPointSize;

varying float vAlpha;

void main() {
  vAlpha = aAlpha;
  vec3 world = cameraPosition + position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  gl_PointSize = uPointSize;
}
`;

const FRAGMENT = /* glsl */ `
varying float vAlpha;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  // A hard core and a halo that falls off to nothing at the rim.
  float core = 1.0 - smoothstep(0.12, 0.22, r);
  float halo = pow(max(0.0, 1.0 - r), 2.5) * 0.45;
  float light = vAlpha * max(core, halo);
  if (light <= 0.0) discard;
  gl_FragColor = vec4(vec3(light) * vec3(0.92, 0.96, 1.0), 1.0);
  #include <colorspace_fragment>
}
`;

export function createSkySatellites(count: number, far: number): SkySatellites {
  const radius = far * RADIUS_OF_FAR;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const alpha = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aAlpha', alpha);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uPointSize: { value: POINT_SIZE_PX } },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'sky-satellites';
  // After the dome (-1000) and the stars (-999), before the city.
  points.renderOrder = -998;
  points.frustumCulled = false;
  points.visible = false;

  return {
    object3D: points,

    update(passes, t) {
      for (let i = 0; i < count; i += 1) {
        const pass = passes[i];
        const [x, y, z] = pass ? pass.direction(t) : [0, -1, 0];
        positions[i * 3] = x * radius;
        positions[i * 3 + 1] = y * radius;
        positions[i * 3 + 2] = z * radius;
        alphas[i] = pass ? pass.alpha(t) : 0;
      }
      position.needsUpdate = true;
      alpha.needsUpdate = true;
    },

    setVisible(visible) {
      points.visible = visible;
    },

    setPixelRatio(ratio) {
      material.uniforms.uPointSize!.value = POINT_SIZE_PX * ratio;
    },

    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
