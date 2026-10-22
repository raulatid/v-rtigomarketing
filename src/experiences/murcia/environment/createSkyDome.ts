import * as THREE from 'three';

/**
 * Murcia's sky: a dome seen from inside, from the haze on the horizon through
 * the daylight blue to black, with stars as points up where it is dark.
 *
 * It replaces the flat sky. Until it, the sky was `scene.background` — one
 * colour, which no camera that looks up can make into a sky, and which met the
 * ground fog in a straight line at the horizon. The dome starts at the fog's
 * own colour, so that line is gone wherever the camera looks.
 *
 * ## Why a mesh, and not CSS or `scene.background`
 *
 * The canvas is opaque (`alpha: false`), so nothing behind it shows; and a
 * gradient laid on the screen would not follow the camera's tilt. The sky is
 * a function of the DIRECTION of view, so it is drawn as one: an inverted
 * sphere, like Earth's `SkyShell`, copied in shape rather than imported —
 * Murcia may not import Earth.
 *
 * ## It cannot occlude anything
 *
 * Drawn first (`renderOrder`), writing no depth, at a radius inside the far
 * plane. The vertex stage places it around whichever camera draws it, so it
 * needs no per-frame update and is right in every render of this scene: the
 * frame, the warm-up and the blog's capture alike.
 *
 * `scene.background` stays as it is. The dome covers it everywhere, but the
 * warm-up's clear-colour restore and anything else that reads it keep working.
 */

/**
 * The bands, in the view direction's height (`d.y`, the sine of its
 * elevation). Judged by eye on 2026-10-22 against the city; the resting pose
 * never looks above the first.
 *
 * - fog → day blue between 0 and `HAZE_TOP`: the haze the ground fog melts
 *   into, so the horizon has no edge;
 * - day blue → night between `HAZE_TOP` and `NIGHT_FULL`;
 * - stars fade in between `STARS_FROM` and `STARS_FULL`, where the sky is
 *   already dark enough for them to read as stars rather than specks.
 */
const HAZE_TOP = 0.06;
const NIGHT_FULL = 0.42;
const STARS_FROM = 0.3;
const STARS_FULL = 0.6;

/**
 * How many stars, and the share drawn large. Spread over the cap above
 * `STARS_FROM` only: a star below it would never show.
 */
const STAR_COUNT = 1400;
const LARGE_STAR_SHARE = 0.04;
/** CSS px: most stars are a pixel or two, a few up to three. */
const STAR_SIZE_PX = { min: 1, max: 2, large: 3 } as const;

/**
 * The dome's radius as a share of the camera's far plane: inside it, so it is
 * never clipped, and far enough that nothing in the city is behind it.
 */
const RADIUS_OF_FAR = 0.9;
/** The stars sit just inside the dome, so the depth test never lets the dome cover them. */
const STARS_OF_DOME = 0.98;

export interface SkyDomeColors {
  /** The ground fog's colour: the horizon. */
  horizon: number;
  /** The daylight sky over the horizon. */
  day: number;
  /** The top of the sky. */
  night: number;
}

export interface SkyDome {
  readonly object3D: THREE.Object3D;
  /** The drawing buffer's pixels per CSS pixel, for the stars' size. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  // Around the camera that draws it, whichever that is.
  vec3 world = cameraPosition + position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uDay;
uniform vec3 uNight;

varying vec3 vDirection;

void main() {
  float h = normalize(vDirection).y;
  vec3 color = mix(uHorizon, uDay, smoothstep(0.0, ${HAZE_TOP.toFixed(3)}, h));
  color = mix(color, uNight, smoothstep(${HAZE_TOP.toFixed(3)}, ${NIGHT_FULL.toFixed(3)}, h));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aBrightness;
uniform float uPixelRatio;

varying float vAlpha;

void main() {
  vec3 direction = normalize(position);
  vAlpha = aBrightness * smoothstep(${STARS_FROM.toFixed(3)}, ${STARS_FULL.toFixed(3)}, direction.y);
  vec3 world = cameraPosition + position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  // A fixed size on screen, not attenuated: a star is a point at any distance.
  gl_PointSize = aSize * uPixelRatio;
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying float vAlpha;

void main() {
  // Round, with a soft rim, so a 3 px star is not a square.
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = vAlpha * (1.0 - smoothstep(0.5, 1.0, r));
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(vec3(alpha), 1.0);
  #include <colorspace_fragment>
}
`;

/** Mulberry32: the same sky every visit. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createStars(radius: number): THREE.Points {
  const random = seeded(0x5a7e11);
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const brightness = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    // Uniform over the cap above STARS_FROM: uniform in height is uniform in area.
    const y = STARS_FROM + (1 - STARS_FROM) * random();
    const ring = Math.sqrt(1 - y * y);
    const angle = random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(angle) * ring * radius;
    const large = random() < LARGE_STAR_SHARE;
    sizes[i] = large
      ? STAR_SIZE_PX.large
      : STAR_SIZE_PX.min + (STAR_SIZE_PX.max - STAR_SIZE_PX.min) * random();
    brightness[i] = large ? 1 : 0.35 + 0.55 * random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uPixelRatio: { value: 1 } },
    // Added onto the dome: a star brightens the sky, it does not paint over it.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'sky-stars';
  // Right after the dome, before the city.
  stars.renderOrder = -999;
  stars.frustumCulled = false;
  return stars;
}

export function createSkyDome(colors: SkyDomeColors, far: number): SkyDome {
  const radius = far * RADIUS_OF_FAR;
  const geometry = new THREE.SphereGeometry(radius, 48, 24);
  const material = new THREE.ShaderMaterial({
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    uniforms: {
      uHorizon: { value: new THREE.Color(colors.horizon) },
      uDay: { value: new THREE.Color(colors.day) },
      uNight: { value: new THREE.Color(colors.night) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    // No tone mapping, like `scene.background` and the fog's colour, which
    // three mixes in after it: the horizon has to be the fog's colour exactly.
    toneMapped: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'sky-dome';
  dome.renderOrder = -1000;
  // Placed in the vertex stage, so its bounds mean nothing to the culler.
  dome.frustumCulled = false;

  const stars = createStars(radius * STARS_OF_DOME);
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(dome, stars);

  const starMaterial = stars.material as THREE.ShaderMaterial;

  return {
    object3D: group,
    setPixelRatio(ratio) {
      starMaterial.uniforms.uPixelRatio!.value = ratio;
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      stars.geometry.dispose();
      starMaterial.dispose();
    },
  };
}
