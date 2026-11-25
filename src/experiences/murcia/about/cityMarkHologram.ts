import * as THREE from 'three';
import { ARC_D, V_D } from './cityMarkIsotype';
import { samplePathData } from '../../../intro-draw/pathGeometry';
import { MARK_DRAW_SECONDS, markPlanePoint, type CityMarkHologram, type MarkDrawing } from './createCityMark';
import { BUILDING_HIGHLIGHT } from '../interaction/buildingHighlight';
import type { CityMarkPose } from './protoCityMark';
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags';

/**
 * Conócenos' city stop, in 3D (its knobs: `protoCityMark.ts`; production is `stand`):
 * the isotype written in the air over the city, as the Earth intro writes it.
 *
 * The pen leaves the rooftop isotype, flies to the V's first vertex and traces
 * the V, hops, and traces the arc, leaving a fine white line: the front
 * outline of a slab of light. When both are drawn, the fill runs from that
 * outline to the back one as a curtain in the brand blue, with slow scan
 * lines; the back outline lights as it lands, and a faint face closes each
 * side.
 *
 * Three poses (`CityMarkPose`): upright over the city, level with it and
 * facing the eye across it, or lying as the
 * ground's mark lies, both in the air, coming round to face the eye while the
 * pen draws and spinning on their own axis once it is done (`spinAngle`); or
 * the first prototype, `ground`, whose slab
 * stands on the city with the outline at its top and the ground's fill under
 * it (`ground: 'fill'`). The spin answers to reduced motion as the rooftop
 * logo's does: it holds still. The drawing does not (the stop's decision).
 *
 * Same clock and stages as the ground's (`markDrawingAt`) and the same
 * strength: it fades with the stop. Additive, no depth writes: the city's
 * buildings still cover it.
 *
 * Built in the mark's own space — u to its right and v to its top, both
 * -0.5..0.5, h 0 at the back outline and 1 at the front — and set in the
 * world by one matrix, so a layout or a turn moves it without rebuilding.
 */

/** One closed outline in the mark's plane, its points in order of the pen. */
export type Contour = readonly (readonly [number, number])[];

export interface CityMarkHologramOptions {
  pose: CityMarkPose;
  /** The rooftop isotype, world space, where the pen leaves from; it appears at the V's first vertex without one. */
  origin: THREE.Vector3 | null;
  reducedMotion: boolean;
  /** Shares of the mark's side; null takes the pose's default. */
  depth?: number | null;
  lift?: number | null;
  scale?: number | null;
  /** Radians a second. */
  spin?: number | null;
}

interface PoseDefaults {
  depth: number;
  lift: number;
  scale: number;
  spin: number;
}

/** The pose that ships. */
const STAND_DEFAULTS: PoseDefaults = { depth: 0.07, lift: 0.12, scale: 0.6, spin: 0.6 };

const POSE_DEFAULTS: Record<CityMarkPose, PoseDefaults> = {
  stand: STAND_DEFAULTS,
  flat: { depth: 0.05, lift: 0.16, scale: 1, spin: 0.45 },
  ground: { depth: 0.14, lift: 0, scale: 1, spin: 0 },
};

/** SVG units between samples of an outline. */
const SAMPLE_STEP = 1.5;
/** The pen's glow, as a share of the mark's side. */
const PEN_SIZE = 0.04;
/** How high the pen's flight from the rooftop arcs, as a share of the mark's side. */
const PEN_LIFT = 0.06;
/** The scan lines' period, as a share of the mark's side. */
const SCAN_PERIOD = 0.011;

/**
 * The walls between the two outlines of each contour: a quad per segment, from
 * the back (`h` 0) to the front (`h` 1), each vertex with how far along its
 * outline the pen has to be for it to show (`aAlong`, 0..1) and which outline
 * it is (`aPath`). Positions are (u, v, h).
 */
export function buildWalls(contours: readonly Contour[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const along: number[] = [];
  const path: number[] = [];
  contours.forEach((contour, index) => {
    const n = contour.length;
    const lengths = [0];
    for (let i = 1; i <= n; i++) {
      const [ax, ay] = contour[i - 1];
      const [bx, by] = contour[i % n];
      lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    const total = lengths[n] || 1;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = contour[i];
      const [bx, by] = contour[(i + 1) % n];
      const a0 = lengths[i] / total;
      const a1 = lengths[i + 1] / total;
      // Two triangles: (a, back) (b, back) (b, front) and (a, back) (b, front) (a, front).
      const quad: [number, number, number, number][] = [
        [ax, ay, 0, a0],
        [bx, by, 0, a1],
        [bx, by, 1, a1],
        [ax, ay, 0, a0],
        [bx, by, 1, a1],
        [ax, ay, 1, a0],
      ];
      for (const [u, v, h, a] of quad) {
        positions.push(u, v, h);
        along.push(a);
        path.push(index);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('aPath', new THREE.Float32BufferAttribute(path, 1));
  return geometry;
}

/** The point `share` of the way along a closed outline, by length, in the mark's plane. */
export function pointAlong(contour: Contour, share: number, out = new THREE.Vector2()): THREE.Vector2 {
  const n = contour.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = contour[i];
    const [bx, by] = contour[(i + 1) % n];
    total += Math.hypot(bx - ax, by - ay);
  }
  let left = Math.min(Math.max(share, 0), 1) * total;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = contour[i];
    const [bx, by] = contour[(i + 1) % n];
    const length = Math.hypot(bx - ax, by - ay);
    if (left <= length || i === n - 1) {
      const t = length > 0 ? Math.min(left / length, 1) : 0;
      return out.set(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
    left -= length;
  }
  return out.set(contour[0][0], contour[0][1]);
}

/**
 * Where the pen is, in the mark's plane, once it is on the outline: riding
 * the V, hopping, riding the arc. Null before it reaches the V.
 */
export function penOnOutline(
  drawing: MarkDrawing,
  v: Contour,
  arc: Contour,
  out = new THREE.Vector2(),
): THREE.Vector2 | null {
  if (drawing.arc > 0) return pointAlong(arc, drawing.arc, out);
  if (drawing.hop > 0) {
    const from = pointAlong(v, 1, new THREE.Vector2());
    const to = pointAlong(arc, 0, new THREE.Vector2());
    return out.lerpVectors(from, to, drawing.hop);
  }
  if (drawing.v > 0 || drawing.move >= 1) return pointAlong(v, drawing.v, out);
  return null;
}

/** The turn the mark starts the drawing at, in radians: three-quarters on, so the pen is read from the first stroke. */
export const SPIN_APPROACH = 0.5;
/** Seconds the turn takes to reach its speed once the drawing ends. */
export const SPIN_RAMP = 1.5;

/**
 * The turn, in radians, `spinSeconds` into the drawing. While the pen draws,
 * the mark comes round from `SPIN_APPROACH` to face the eye (0) as the
 * drawing ends, slowing into it; then it turns, gathering speed over
 * `SPIN_RAMP`, with no jump in the angle or its speed. None at all without
 * a speed (reduced motion): it faces the eye throughout.
 */
export function spinAngle(spinSeconds: number, speed: number): number {
  if (speed === 0) return 0;
  if (spinSeconds <= MARK_DRAW_SECONDS) {
    const u = Math.max(0, spinSeconds) / MARK_DRAW_SECONDS;
    return SPIN_APPROACH * (u * u * (3 - 2 * u) - 1);
  }
  const after = spinSeconds - MARK_DRAW_SECONDS;
  return after < SPIN_RAMP ? (speed * after * after) / (2 * SPIN_RAMP) : speed * (after - SPIN_RAMP / 2);
}

/**
 * From the path data, not a DOM `<path>`: `getPointAtLength` walks the path
 * from its start on every call, and the ~1,450 calls for the two paths took
 * ~0.1 s of the city's build on a desktop, 0.56 s with the CPU at 4x
 * (2026-11-25). The intro's draw worker samples the same paths this way; the
 * counts come out the same and the points within 0.04 SVG units of the DOM's.
 */
function sampleOutline(d: string): Contour {
  const length = samplePathData(d, 1).length;
  const count = Math.max(8, Math.ceil(length / SAMPLE_STEP));
  const path = samplePathData(d, count);
  const points: [number, number][] = [];
  // The end is the start again (the paths close): left out, the walls close it.
  for (let i = 0; i < count; i++) {
    const point = path.at(i / count);
    points.push(markPlanePoint(point.x, point.y));
  }
  return points;
}

function penTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.45, 'rgba(214,228,255,0.25)');
  glow.addColorStop(1, 'rgba(214,228,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const WALL_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aPath;
varying float vH;
varying float vAlong;
varying float vPath;
varying float vWorldY;
void main() {
  vH = position.z;
  vAlong = aAlong;
  vPath = aPath;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldY = world.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WALL_FRAGMENT = /* glsl */ `
uniform float uStrength;
uniform float uV;
uniform float uArc;
uniform float uFill;
uniform float uTime;
uniform float uDepth;
uniform float uScanPeriod;
uniform float uBackEdge;
uniform vec3 uColor;
uniform vec3 uEdge;
varying float vH;
varying float vAlong;
varying float vPath;
varying float vWorldY;
void main() {
  float drawn = vPath < 0.5 ? uV : uArc;
  float shown = step(vAlong, drawn) * step(0.0001, drawn);
  // The front outline: a line a pixel or two thick, whatever the distance, and a soft glow behind it.
  float fromFront = (1.0 - vH) * uDepth;
  float px = max(fwidth(fromFront), 1e-4);
  float edge = shown * (exp(-pow(fromFront / (1.4 * px), 2.0)) + 0.18 * exp(-fromFront / (uDepth * 0.06)));
  // The pen's head, brighter on the stretch it has just drawn.
  float head = shown * exp(-pow((drawn - vAlong) * 70.0, 2.0)) * (1.0 - step(0.9999, drawn));
  // The curtain runs from the front outline to the back one as the fill comes in, and lights the back outline as it lands.
  float filling = step(0.0001, uFill);
  float behind = (vH - (1.0 - uFill)) * uDepth;
  float curtain = filling * smoothstep(-uDepth * 0.04, 0.0, behind);
  float front = filling * (1.0 - uFill) * exp(-pow(behind / (uDepth * 0.03), 2.0));
  float fromBack = vH * uDepth;
  float back = uBackEdge * uFill * exp(-pow(fromBack / (1.4 * px), 2.0));
  float scan = 0.65 + 0.35 * sin(vWorldY * (6.2831 / uScanPeriod) - uTime * 2.2);
  float body = curtain * scan * (0.025 + 0.11 * vH * vH + 0.07 * exp(-vH * 9.0));
  vec3 light = uColor * body + uEdge * (edge * (1.0 - 0.35 * uFill) + head * 1.4 + front * 0.6 + back * 0.55);
  gl_FragColor = vec4(light * uStrength, 1.0);
  #include <colorspace_fragment>
}`;

const CAP_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const CAP_FRAGMENT = /* glsl */ `
uniform float uStrength;
uniform float uFill;
uniform float uTime;
uniform float uScanPeriod;
uniform float uCapLight;
uniform vec3 uScanDir;
uniform vec3 uColor;
varying vec3 vWorld;
void main() {
  float scan = 0.6 + 0.4 * sin(dot(vWorld, uScanDir) * (6.2831 / uScanPeriod) - uTime * 1.6);
  gl_FragColor = vec4(uColor * (uCapLight * uFill * scan * uStrength), 1.0);
  #include <colorspace_fragment>
}`;

export function createCityMarkHologram(options: CityMarkHologramOptions): CityMarkHologram {
  const { origin, reducedMotion } = options;
  // Production ships `stand` only: with the literal gate the build knows the
  // pose, and drops the debug poses' branches.
  const pose: CityMarkPose = DEBUG_TOOLS_ENABLED ? options.pose : 'stand';
  const defaults = DEBUG_TOOLS_ENABLED ? POSE_DEFAULTS[pose] : STAND_DEFAULTS;
  const depthShare = options.depth ?? defaults.depth;
  const liftShare = options.lift ?? defaults.lift;
  const scale = options.scale ?? defaults.scale;
  const speed = reducedMotion ? 0 : (options.spin ?? defaults.spin);
  const inAir = pose !== 'ground';

  const v = sampleOutline(V_D);
  const arc = sampleOutline(ARC_D);

  const shared = {
    uStrength: { value: 0 },
    uFill: { value: 0 },
    uTime: { value: 0 },
    uScanPeriod: { value: 1 },
    uColor: { value: new THREE.Color(BUILDING_HIGHLIGHT.color) },
  };
  const wallMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uV: { value: 0 },
      uArc: { value: 0 },
      uDepth: { value: 1 },
      uBackEdge: { value: inAir ? 1 : 0 },
      uEdge: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const capMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      // Lines across the face: level ones on an upright mark, diagonal on a lying one.
      uScanDir: { value: pose === 'stand' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 1).normalize() },
      // On the ground the city's fill is under it; in the air the faces are all the fill there is.
      uCapLight: { value: inAir ? 0.07 : 0.05 },
    },
    vertexShader: CAP_VERTEX,
    fragmentShader: CAP_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const capGeometry = new THREE.BufferGeometry();
  {
    const positions: number[] = [];
    for (const h of inAir ? [0, 1] : [1]) {
      for (const contour of [v, arc]) {
        const points = contour.map(([x, y]) => new THREE.Vector2(x, y));
        for (const face of THREE.ShapeUtils.triangulateShape(points, [])) {
          for (const i of face) positions.push(points[i].x, points[i].y, h);
        }
      }
    }
    capGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  const walls = new THREE.Mesh(buildWalls([v, arc]), wallMaterial);
  const cap = new THREE.Mesh(capGeometry, capMaterial);
  // Bounds are the mark's unit space, set by the group's matrix; never culled by them.
  walls.frustumCulled = false;
  cap.frustumCulled = false;
  const body = new THREE.Group();
  body.matrixAutoUpdate = false;
  body.add(walls, cap);

  const pen = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: penTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  pen.frustumCulled = false;

  const root = new THREE.Group();
  root.name = 'city-mark-hologram';
  root.add(body, pen);
  root.visible = false;

  // The mark's space in the world: `basis` (u, v and h, from the centre) turned
  // by `turn` about `axis` through `centre`.
  const basis = new THREE.Matrix4();
  const turn = new THREE.Matrix4();
  const axis = new THREE.Vector3(0, 1, 0);
  const centre = new THREE.Vector3();
  const ru = new THREE.Vector3();
  const rv = new THREE.Vector3();
  const rh = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const level = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const flat = new THREE.Vector2();
  const at = new THREE.Vector3();
  const firstVertex = new THREE.Vector3();
  let size = 1;
  let spinSeconds = 0;
  let lastSeconds = Number.NEGATIVE_INFINITY;

  const toWorld = (u: number, w: number, out: THREE.Vector3): THREE.Vector3 =>
    out.set(u, w, 1).applyMatrix4(body.matrix);

  const pose3d = (angle: number): void => {
    turn.makeRotationAxis(axis, angle);
    body.matrix.copy(basis).premultiply(turn);
    body.matrix.elements[12] += centre.x;
    body.matrix.elements[13] += centre.y;
    body.matrix.elements[14] += centre.z;
    body.matrixWorldNeedsUpdate = true;
  };

  return {
    object3D: root,
    precompileTargets: [root],
    ground: inAir ? 'none' : 'fill',

    place(camera, ndc, side, groundY) {
      camera.getWorldDirection(forward);
      if (pose === 'stand') {
        // Upright over the city, level with it: up is the world's, right is the
        // eye's on the ground, and its thickness runs level towards the eye.
        size = side * scale;
        const depth = depthShare * size;
        const level2 = new THREE.Vector3(forward.x, 0, forward.z).normalize();
        ru.set(-level2.z, 0, level2.x).multiplyScalar(size);
        rv.set(0, size, 0);
        rh.copy(level2).multiplyScalar(-depth);
        axis.set(0, 1, 0);
        level.constant = -(groundY + liftShare * side + size / 2);
        shared.uScanPeriod.value = SCAN_PERIOD * size;
        wallMaterial.uniforms.uDepth.value = depth;
      } else {
        // Lying as the ground's mark lies: right of the eye, and away from it, on the ground.
        size = side;
        const depth = depthShare * side;
        const up = new THREE.Vector3(forward.x, 0, forward.z).normalize();
        ru.set(-up.z, 0, up.x).multiplyScalar(side);
        rv.copy(up).multiplyScalar(side);
        rh.set(0, depth, 0);
        axis.set(0, 1, 0);
        level.constant = -(groundY + liftShare * side);
        shared.uScanPeriod.value = SCAN_PERIOD * side;
        wallMaterial.uniforms.uDepth.value = depth;
      }
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(level, centre)) return;
      basis.makeBasis(ru, rv, rh);
      // The slab's middle on the centre in the air; its base on the ground.
      if (inAir) basis.setPosition(rh.x * -0.5, rh.y * -0.5, rh.z * -0.5);
      else basis.setPosition(0, 0, 0);
      pose3d(0);
      pen.scale.setScalar(PEN_SIZE * side);
      lastSeconds = Number.NEGATIVE_INFINITY;
    },

    update(drawing, seconds, strength, delta) {
      root.visible = strength > 0;
      if (!root.visible) return;
      shared.uStrength.value = strength;
      shared.uFill.value = drawing.fill;
      shared.uTime.value += delta;
      wallMaterial.uniforms.uV.value = drawing.v;
      wallMaterial.uniforms.uArc.value = drawing.arc;

      // The turn runs on the drawing's clock while it draws, then on its own.
      if (seconds < MARK_DRAW_SECONDS || seconds < lastSeconds) spinSeconds = seconds;
      else spinSeconds += delta;
      lastSeconds = seconds;
      if (speed > 0) pose3d(spinAngle(spinSeconds, speed));

      // The pen: from the rooftop isotype up and over to the V's first vertex, then on the outline.
      pointAlong(v, 0, flat);
      toWorld(flat.x, flat.y, firstVertex);
      const onOutline = penOnOutline(drawing, v, arc, flat);
      if (onOutline) toWorld(onOutline.x, onOutline.y, at);
      else {
        at.lerpVectors(origin ?? firstVertex, firstVertex, drawing.move);
        at.y += Math.sin(Math.PI * drawing.move) * PEN_LIFT * size;
      }
      pen.position.copy(at);
      pen.material.opacity = drawing.dot * (1 - drawing.fill) * strength;
      pen.visible = pen.material.opacity > 0;
    },

    dispose() {
      walls.geometry.dispose();
      cap.geometry.dispose();
      wallMaterial.dispose();
      capMaterial.dispose();
      pen.material.map?.dispose();
      pen.material.dispose();
    },
  };
}
