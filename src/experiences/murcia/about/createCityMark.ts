import * as THREE from 'three';
import { ARC_D, ARC_START, CENTER, FILL_D, FIRST_VERTEX, VIEWBOX, V_D } from './cityMarkIsotype';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { BUILDING_HIGHLIGHT, easeHighlight, stepHighlight } from '../interaction/buildingHighlight';
import type { VertigoBuildingConfig } from '../landmark/vertigoBuildingConfig';
import type { AboutLens, AboutPose } from './aboutPoses';

/**
 * Conócenos' city stop: the Vértigo isotype, large, projected straight down on
 * the city while the rest of it darkens, as under a projector (plan 028).
 *
 * The city's materials are SHARED, by atlas and source material, so they are
 * patched in place, once, before `warm()` — the same `outgoingLight` the hover
 * tint mixes into (`interaction/buildingHighlight.ts`), whose clones exist by
 * then and are patched with the rest. One program variant for the whole city;
 * outside the stop the strength is 0 and the branch is skipped. The logo is
 * left out, and so is every `ShaderMaterial` (the river, the screen): their
 * shaders have none of the chunks this hooks.
 *
 * Each fragment reads the mark from a canvas by its world XZ, in the ground
 * frame of the stop's view — right is the view's right, up runs away from the
 * eye — so the top of the mark points to the back of the picture and a little
 * perspective is part of the look. Roofs and ground take it whole, walls too
 * (`WALLS`): with roofs alone it read worse.
 *
 * Drawn on every arrival the way the Earth intro draws it: the dot appears,
 * travels to the V's first vertex, traces the V riding its tip, hops to the
 * arc, traces it, and the fill arrives as the outlines and the dot go. Under
 * reduced motion too, by the user's direction (2026-10-22): the camera cuts,
 * the drawing does not.
 */

export interface CityMark {
  /** Centres, turns and sizes the mark for the stop's view: centred where the ray through `mark` meets the ground. */
  place(
    lens: AboutLens,
    view: { readonly pose: AboutPose; readonly mark: { readonly x: number; readonly y: number; readonly size: number } },
  ): void;
  /**
   * On draws it again from an empty page, starting `DRAW_LEAD` before a flight
   * of `flightSeconds` lands; off fades it out where it is.
   */
  setTarget(on: boolean, flightSeconds: number): void;
  update(delta: number): void;
  dispose(): void;
}

/** How much of the light the rest of the city loses at full strength. */
const DIM = 0.75;
/** The share walls take of the mark; roofs and ground take all of it. */
const WALLS = 1;
/** Seconds for the projector to come on, and to go off. */
const FADE_SECONDS = 1.2;
/** Canvas side, in pixels: uploaded once per frame while the pen moves, and never again. */
const CANVAS_SIDE = 1024;
const STROKE = 6;
const DOT_RADIUS = 9;
/**
 * Seconds before the flight lands that the pen starts: 1 s into the 1.4 s
 * flight, as in the prototype. A reduced-motion cut lands at once, so the pen
 * starts then, and draws at the same pace.
 */
const DRAW_LEAD = 0.4;

const VERTEX_AT = '#include <project_vertex>';
const FRAGMENT_AT = '#include <opaque_fragment>';

/**
 * The intro's choreography, in seconds from the first stroke: the dot, its
 * move to the V, the V, the hop to the arc, the arc, and the fill.
 */
export const MARK_STAGES = {
  dot: [0, 0.3],
  move: [0.3, 0.7],
  v: [0.7, 1.9],
  hop: [1.9, 2.15],
  arc: [2.15, 3.0],
  fill: [3.0, 3.7],
} as const;
export const MARK_DRAW_SECONDS = MARK_STAGES.fill[1];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const quadInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const cubicInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cubicOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** How far each part of the drawing has run at `seconds`, eased, 0..1. */
export interface MarkDrawing {
  readonly dot: number;
  readonly move: number;
  readonly v: number;
  readonly hop: number;
  readonly arc: number;
  readonly fill: number;
}

export function markDrawingAt(seconds: number): MarkDrawing {
  const local = ([start, end]: readonly [number, number]): number => clamp01((seconds - start) / (end - start));
  return {
    dot: cubicOut(local(MARK_STAGES.dot)),
    move: cubicInOut(local(MARK_STAGES.move)),
    v: quadInOut(local(MARK_STAGES.v)),
    hop: cubicInOut(local(MARK_STAGES.hop)),
    arc: quadInOut(local(MARK_STAGES.arc)),
    fill: cubicOut(local(MARK_STAGES.fill)),
  };
}

interface MarkCanvas {
  readonly texture: THREE.CanvasTexture;
  /** Paints the drawing `seconds` in. */
  draw(seconds: number): void;
}

function markCanvas(): MarkCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIDE;
  canvas.height = CANVAS_SIDE;
  const context = canvas.getContext('2d')!;
  const pad = 24;
  const scale = (CANVAS_SIDE - pad * 2) / Math.max(VIEWBOX.width, VIEWBOX.height);

  // Unmounted paths still measure: the dot rides them by length.
  const svgPath = (d: string): SVGPathElement => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    return path;
  };
  const vPath = svgPath(V_D);
  const arcPath = svgPath(ARC_D);
  const vLength = vPath.getTotalLength();
  const arcLength = arcPath.getTotalLength();
  const vEnd = vPath.getPointAtLength(vLength);
  const v2d = new Path2D(V_D);
  const arc2d = new Path2D(ARC_D);
  const fill2d = new Path2D(FILL_D);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;

  return {
    texture,
    draw(seconds) {
      const t = markDrawingAt(seconds);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, CANVAS_SIDE, CANVAS_SIDE);
      context.setTransform(scale, 0, 0, scale, pad, pad);
      context.strokeStyle = '#fff';
      context.fillStyle = '#fff';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = STROKE;

      const outline = 1 - t.fill;
      context.globalAlpha = outline;
      if (t.v > 0) {
        context.setLineDash([vLength * t.v, vLength]);
        context.stroke(v2d);
      }
      if (t.arc > 0) {
        context.setLineDash([arcLength * t.arc, arcLength]);
        context.stroke(arc2d);
      }
      context.setLineDash([]);

      // The dot: at the centre, then to the V's start, riding the V, hopping, riding the arc.
      let x = CENTER.x + (FIRST_VERTEX[0] - CENTER.x) * t.move;
      let y = CENTER.y + (FIRST_VERTEX[1] - CENTER.y) * t.move;
      if (seconds > MARK_STAGES.v[0]) ({ x, y } = vPath.getPointAtLength(vLength * t.v));
      if (seconds > MARK_STAGES.hop[0]) {
        x = vEnd.x + (ARC_START[0] - vEnd.x) * t.hop;
        y = vEnd.y + (ARC_START[1] - vEnd.y) * t.hop;
      }
      if (seconds > MARK_STAGES.arc[0]) ({ x, y } = arcPath.getPointAtLength(arcLength * t.arc));
      context.globalAlpha = t.dot * outline;
      context.beginPath();
      context.arc(x, y, DOT_RADIUS * (0.4 + 0.6 * t.dot), 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = t.fill;
      if (t.fill > 0) context.fill(fill2d);
      context.globalAlpha = 1;
      texture.needsUpdate = true;
    },
  };
}

export function createCityMark(root: THREE.Object3D, config: VertigoBuildingConfig): CityMark {
  const skip = new Set<THREE.Object3D>();
  for (const name of config.logoNodeNames) {
    findByAnyNameSpelling(root, name)?.object.traverse((object) => skip.add(object));
  }
  root.updateMatrixWorld(true);
  const groundY = new THREE.Box3().setFromObject(root).min.y;

  const mark = markCanvas();
  mark.draw(0);
  const uniforms = {
    uMarkStrength: { value: 0 },
    uMarkMap: { value: mark.texture },
    uMarkCentre: { value: new THREE.Vector2() },
    uMarkRight: { value: new THREE.Vector2(1, 0) },
    uMarkUp: { value: new THREE.Vector2(0, -1) },
    uMarkSize: { value: 1 },
    uMarkWalls: { value: WALLS },
    uMarkColor: { value: new THREE.Color(BUILDING_HIGHLIGHT.color) },
    uMarkDim: { value: DIM },
  };

  const patched = new Map<THREE.Material, { hook: THREE.Material['onBeforeCompile']; key: () => string }>();
  const patch = (material: THREE.Material): void => {
    if (patched.has(material) || (material as THREE.ShaderMaterial).isShaderMaterial) return;
    const hook = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    patched.set(material, { hook, key });
    const innerKey = key.call(material);
    // Wrapped, never replaced: the lightmap's hook is what samples the atlas.
    material.onBeforeCompile = (shader, renderer) => {
      hook.call(material, shader, renderer);
      if (!shader.vertexShader.includes(VERTEX_AT) || !shader.fragmentShader.includes(FRAGMENT_AT)) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMarkWorld;')
        .replace(
          VERTEX_AT,
          `${VERTEX_AT}
vec4 markWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
markWorld = instanceMatrix * markWorld;
#endif
vMarkWorld = (modelMatrix * markWorld).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uMarkStrength;
uniform sampler2D uMarkMap;
uniform vec2 uMarkCentre;
uniform vec2 uMarkRight;
uniform vec2 uMarkUp;
uniform float uMarkSize;
uniform float uMarkWalls;
uniform vec3 uMarkColor;
uniform float uMarkDim;
varying vec3 vMarkWorld;`,
        )
        .replace(
          FRAGMENT_AT,
          `if (uMarkStrength > 0.0) {
  vec2 markD = vMarkWorld.xz - uMarkCentre;
  vec2 markUv = vec2(dot(markD, uMarkRight), dot(markD, uMarkUp)) / uMarkSize + 0.5;
  vec2 markIn = step(vec2(0.0), markUv) * step(markUv, vec2(1.0));
  float markA = markIn.x * markIn.y * texture2D(uMarkMap, clamp(markUv, 0.0, 1.0)).r;
  outgoingLight *= 1.0 - uMarkStrength * uMarkDim * (1.0 - markA);
  // The face's normal from the screen derivatives: up for roofs and ground.
  vec3 markN = normalize(cross(dFdx(vMarkWorld), dFdy(vMarkWorld)));
  float markFacing = mix(uMarkWalls, 1.0, smoothstep(0.55, 0.9, abs(markN.y)));
  float markK = uMarkStrength * markA * markFacing;
  outgoingLight = mix(outgoingLight, uMarkColor, markK * 0.85) + uMarkColor * markK * 0.08;
}
${FRAGMENT_AT}`,
        );
    };
    material.customProgramCacheKey = () => `${innerKey}|citymark`;
    material.needsUpdate = true;
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || skip.has(mesh)) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(material);
  });

  let progress = 0;
  let target = 0;
  let drawClock: number = MARK_DRAW_SECONDS;
  const camera = new THREE.PerspectiveCamera();
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
  const hit = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  return {
    place(lens, view) {
      camera.fov = lens.fov;
      camera.aspect = lens.aspect;
      camera.updateProjectionMatrix();
      camera.position.copy(view.pose.position);
      camera.lookAt(view.pose.target);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc.set(view.mark.x, view.mark.y), camera);
      if (!raycaster.ray.intersectPlane(ground, hit)) return;
      uniforms.uMarkCentre.value.set(hit.x, hit.z);
      uniforms.uMarkSize.value = view.mark.size;
      camera.getWorldDirection(forward);
      const up = uniforms.uMarkUp.value.set(forward.x, forward.z).normalize();
      // Right of the eye, on the ground: up turned a quarter clockwise seen from above.
      uniforms.uMarkRight.value.set(-up.y, up.x);
    },

    setTarget(on, flightSeconds) {
      // Each arrival draws it again, from an empty page.
      if (on && target === 0) {
        drawClock = -Math.max(0, flightSeconds - DRAW_LEAD);
        mark.draw(0);
      }
      target = on ? 1 : 0;
    },

    update(delta) {
      if (progress === 0 && target === 0) return;
      progress = stepHighlight(progress, target, delta, FADE_SECONDS);
      uniforms.uMarkStrength.value = easeHighlight(progress);
      // Leaving holds the drawing where it is and lets the strength take it down.
      if (target === 1 && drawClock < MARK_DRAW_SECONDS) {
        drawClock += Math.max(0, delta);
        if (drawClock > 0) mark.draw(Math.min(drawClock, MARK_DRAW_SECONDS));
      }
    },

    dispose() {
      for (const [material, { hook, key }] of patched) {
        material.onBeforeCompile = hook;
        material.customProgramCacheKey = key;
        material.needsUpdate = true;
      }
      patched.clear();
      mark.texture.dispose();
    },
  };
}
