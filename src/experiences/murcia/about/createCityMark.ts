import * as THREE from 'three';
import { ARC_D, ARC_START, CENTER, FILL_D, FIRST_VERTEX, VIEWBOX, V_D } from './cityMarkIsotype';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { BUILDING_HIGHLIGHT, easeHighlight, stepHighlight } from '../interaction/buildingHighlight';
import type { VertigoBuildingConfig } from '../landmark/vertigoBuildingConfig';
import type { AboutLens, AboutPose } from './aboutPoses';
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags';
import { NIGHT_EDGE, NIGHT_PULSE_LEAD, nightPulseAt } from './nightPulse';

/**
 * Conócenos' city stop: the Vértigo isotype, large, projected straight down on
 * the city while the rest of it darkens, as under a projector (plan 028).
 *
 * The city's materials are SHARED, by atlas and source material, so they are
 * patched in place, once, before `warm()` — the same `outgoingLight` the hover
 * tint mixes into (`interaction/buildingHighlight.ts`), whose clones exist by
 * then and are patched with the rest. One program variant for the whole city;
 * outside the stop and the night both strengths are 0 and the branch is skipped. The logo is
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
 *
 * The darkening is the city's night (plan 029b §3, A and B), and it has a
 * strength of its own: the drawing is the city stop's, the night lasts from
 * the city stop through the flight to the sky and the sky stop, and only goes
 * when the visit flies back to the screen or leaves. It is a cold blue, not a
 * grey (`NIGHT_LIGHT`), and the host carries it into what this patch cannot
 * reach: the fog, the dome's horizon and the river (`night`, `NIGHT_FOG`).
 *
 * The night comes with a pulse (plan 029b §3 E, `nightPulse.ts`): the sky
 * stop's ring, on the ground. It leaves the tower just before the flight to
 * the city lands and runs out across it, the night inside and the day
 * outside, a white ring on the roofs and the ground at its front; the V is
 * drawn into the night behind it. The host's `night` follows the share of the
 * city it has crossed, so the fog goes dark as the ring reaches it. A night
 * taken up again while it was still going, and its going, have no ring.
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
  /**
   * The city's night comes on, with its ring leaving `NIGHT_PULSE_LEAD` before
   * a flight of `flightSeconds` lands, or goes over `FADE_SECONDS`.
   */
  setNight(on: boolean, flightSeconds?: number): void;
  /** The night, eased, 0..1, as far as the ring has carried it: what the host lays on the fog, the dome's horizon and the river. */
  readonly night: number;
  /** The rooftop isotype's `emissiveIntensity` through the night: the ring's flash, then the ember. 0 by day. */
  readonly isotypeGlow: number;
  /** The drawing's strength and the night jump to where they are going: the warp's cut, with nobody watching. */
  settle(): void;
  update(delta: number): void;
  dispose(): void;
}

/**
 * The 3D isotype over the city (`cityMarkHologram.ts`), handed in by the
 * host: placed and drawn on this mark's clock. Declared here so this module
 * imports nothing of it.
 */
export interface CityMarkHologram {
  readonly object3D: THREE.Object3D;
  /** Hidden at birth: compiled in `warm()` with the rest. */
  readonly precompileTargets: readonly THREE.Object3D[];
  /** What the ground still draws under it: the fill, or nothing. */
  readonly ground: 'fill' | 'none';
  /** The stop's camera, posed; where in its frame the mark goes; the mark's side; the ground's height. */
  place(camera: THREE.PerspectiveCamera, ndc: THREE.Vector2, size: number, groundY: number): void;
  /** The drawing at this frame, its clock in seconds (negative before the pen starts), and the stop's strength, 0..1. */
  update(drawing: MarkDrawing, seconds: number, strength: number, delta: number): void;
  dispose(): void;
}

/**
 * The light the city keeps at full night, as a linear multiplier: about a
 * tenth of it (the plan's `DIM` towards 0.9, from 0.75), and a cold blue
 * rather than a grey, so the drawn isotype is the light of the picture.
 */
export const NIGHT_LIGHT = new THREE.Color(0.07, 0.1, 0.17);
/** The fog's colour at full night, and so the dome's horizon: a night blue, where the day's is the lit ground's cream. */
export const NIGHT_FOG = 0x0e1828;
/** The share walls take of the mark; roofs and ground take all of it. */
const WALLS = 1;
/** The ground ring's fine edge and its trail, as shares of the reach: the sky ring's, out of its 1.3 rad. */
const RING_CORE = 0.007;
const RING_TRAIL = 0.03;
/**
 * The reach runs a little past the farthest corner of the city stop's frame
 * from the tower, on the ground, as the sky's ring runs past its frame: the
 * ring is seen to cross the whole picture and leaves nothing behind it.
 */
const REACH_MARGIN = 1.05;
/** The ring's light on the roofs and the ground, white, as the sky's. */
const RING_LIGHT = 1.0;
/** The front with no ring running: past everything, so the night is wherever it is laid. Finite, for a float uniform. */
const NO_FRONT = 1e9;
const FRAME_CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
/** Seconds for the projector to come on, and to go off. */
const FADE_SECONDS = 1.2;
/** Canvas side, in pixels: uploaded once per frame while the pen moves, and never again. */
const CANVAS_SIDE = 1024;
const CANVAS_PAD = 24;
const CANVAS_SCALE = (CANVAS_SIDE - CANVAS_PAD * 2) / Math.max(VIEWBOX.width, VIEWBOX.height);

/**
 * A point of the isotype's viewBox in the mark's plane, as the shader reads the
 * canvas: u to the view's right and v away from the eye, both -0.5..0.5.
 */
export function markPlanePoint(x: number, y: number): [number, number] {
  return [(CANVAS_PAD + x * CANVAS_SCALE) / CANVAS_SIDE - 0.5, 0.5 - (CANVAS_PAD + y * CANVAS_SCALE) / CANVAS_SIDE];
}
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
  readonly texture: THREE.Texture;
  /** Paints the drawing `seconds` in. */
  draw(seconds: number): void;
}

/** The ground with nothing drawn on it: one transparent texel, and no canvas. */
function blankMark(): MarkCanvas {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  texture.needsUpdate = true;
  return { texture, draw() {} };
}

/** `outline`: false leaves the outline to a hologram in the air; `fill`: false leaves the ground blank. */
function markCanvas(outline = true, fill = true): MarkCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIDE;
  canvas.height = CANVAS_SIDE;
  const context = canvas.getContext('2d')!;
  const pad = CANVAS_PAD;
  const scale = CANVAS_SCALE;

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

      const lines = outline ? 1 - t.fill : 0;
      context.globalAlpha = lines;
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
      context.globalAlpha = t.dot * lines;
      context.beginPath();
      context.arc(x, y, DOT_RADIUS * (0.4 + 0.6 * t.dot), 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = fill ? t.fill : 0;
      if (fill && t.fill > 0) context.fill(fill2d);
      context.globalAlpha = 1;
      texture.needsUpdate = true;
    },
  };
}

/**
 * `alsoDarken`: objects outside the city's root that darken with it, the
 * traffic. Patched like the city; they take no part in the ground's height.
 * `nightOrigin`: where the night's ring leaves from, world space (the rooftop
 * isotype); the middle of the city without one.
 * `hologram`: the 3D isotype over the city (`cityMarkHologram.ts`): placed
 * and drawn on this mark's clock; the ground draws no outline, and the fill
 * only if the hologram asks for it (`ground`).
 */
export function createCityMark(
  root: THREE.Object3D,
  config: VertigoBuildingConfig,
  alsoDarken: readonly THREE.Object3D[] = [],
  nightOrigin: THREE.Vector3 | null = null,
  hologram: CityMarkHologram | null = null,
): CityMark {
  const skip = new Set<THREE.Object3D>();
  for (const name of config.logoNodeNames) {
    findByAnyNameSpelling(root, name)?.object.traverse((object) => skip.add(object));
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const groundY = bounds.min.y;
  const centre = nightOrigin ?? bounds.getCenter(new THREE.Vector3());
  // The city's farthest corner on the ground: the reach when the frame's
  // corners do not all meet the ground, and never more than it.
  const cityReach = Math.hypot(
    Math.max(centre.x - bounds.min.x, bounds.max.x - centre.x),
    Math.max(centre.z - bounds.min.z, bounds.max.z - centre.z),
  );

  // Production ships the hologram's `stand`, which leaves the ground blank:
  // the literal gate drops the canvas, and its upload on every frame of the pen.
  const mark = DEBUG_TOOLS_ENABLED ? markCanvas(!hologram, hologram?.ground !== 'none') : blankMark();
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
    uNight: { value: 0 },
    uNightLight: { value: NIGHT_LIGHT.clone() },
    uNightCentre: { value: new THREE.Vector2(centre.x, centre.z) },
    uNightReach: { value: cityReach },
    uNightFront: { value: NO_FRONT },
    uNightRing: { value: 0 },
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
uniform float uNight;
uniform vec3 uNightLight;
uniform vec2 uNightCentre;
uniform float uNightReach;
uniform float uNightFront;
uniform float uNightRing;
varying vec3 vMarkWorld;`,
        )
        .replace(
          FRAGMENT_AT,
          `if (uMarkStrength > 0.0 || uNight > 0.0) {
  vec2 markD = vMarkWorld.xz - uMarkCentre;
  vec2 markUv = vec2(dot(markD, uMarkRight), dot(markD, uMarkUp)) / uMarkSize + 0.5;
  vec2 markIn = step(vec2(0.0), markUv) * step(markUv, vec2(1.0));
  float markA = markIn.x * markIn.y * texture2D(uMarkMap, clamp(markUv, 0.0, 1.0)).r;
  // The night, inside the ring's front, everywhere but under the drawn mark while it is shown.
  // Distances as shares of the reach, as nightPulse.ts measures them.
  float nightD = distance(vMarkWorld.xz, uNightCentre) / uNightReach;
  float nightK = uNight * smoothstep(0.0, ${NIGHT_EDGE.toFixed(3)}, uNightFront - nightD);
  outgoingLight *= mix(vec3(1.0), uNightLight, nightK * (1.0 - uMarkStrength * markA));
  // The face's normal from the screen derivatives: up for roofs and ground.
  vec3 markN = normalize(cross(dFdx(vMarkWorld), dFdy(vMarkWorld)));
  float markUp = smoothstep(0.55, 0.9, abs(markN.y));
  float markFacing = mix(uMarkWalls, 1.0, markUp);
  float markK = uMarkStrength * markA * markFacing;
  outgoingLight = mix(outgoingLight, uMarkColor, markK * 0.85) + uMarkColor * markK * 0.08;
  // The ring at the front, on the roofs and the ground: a fine edge and a trail inside it.
  float ringX = nightD - uNightFront;
  float ring = uNightRing * markUp * (exp(-(ringX * ringX) / ${(2 * RING_CORE * RING_CORE).toExponential(3)}) * 0.9
    + exp(-(ringX * ringX) / ${(2 * RING_TRAIL * RING_TRAIL).toExponential(3)}) * step(ringX, 0.0) * 0.15);
  outgoingLight += vec3(${RING_LIGHT.toFixed(2)}) * ring;
}
${FRAGMENT_AT}`,
        );
    };
    material.customProgramCacheKey = () => `${innerKey}|citymark`;
    material.needsUpdate = true;
  };
  for (const tree of [root, ...alsoDarken]) {
    tree.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || skip.has(mesh)) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patch(material);
    });
  }

  let progress = 0;
  let target = 0;
  let nightProgress = 0;
  let nightTarget = 0;
  let night = 0;
  let isotypeGlow = 0;
  // Seconds since the night's ring left; negative before it does. Never sent,
  // it has long run out, and the night is wherever it is laid.
  let pulseClock = Number.POSITIVE_INFINITY;
  let drawClock: number = MARK_DRAW_SECONDS;
  const strengths = (): void => {
    uniforms.uMarkStrength.value = easeHighlight(progress);
    const strength = easeHighlight(nightProgress);
    const pulse = nightPulseAt(pulseClock);
    uniforms.uNight.value = strength;
    uniforms.uNightFront.value = pulse.done ? NO_FRONT : pulse.front;
    uniforms.uNightRing.value = strength * pulse.glow;
    night = strength * pulse.coverage;
    isotypeGlow = strength * pulse.isotypeGlow;
  };
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
      // The night's reach: past the farthest corner of this frame from the
      // tower, on the ground; the whole city if a corner looks above it.
      let frameReach = 0;
      for (const [x, y] of FRAME_CORNERS) {
        raycaster.setFromCamera(ndc.set(x, y), camera);
        const at = raycaster.ray.intersectPlane(ground, hit);
        frameReach = at ? Math.max(frameReach, Math.hypot(at.x - centre.x, at.z - centre.z)) : cityReach;
        if (!at) break;
      }
      uniforms.uNightReach.value = Math.min(cityReach, REACH_MARGIN * frameReach);
      raycaster.setFromCamera(ndc.set(view.mark.x, view.mark.y), camera);
      if (!raycaster.ray.intersectPlane(ground, hit)) return;
      uniforms.uMarkCentre.value.set(hit.x, hit.z);
      uniforms.uMarkSize.value = view.mark.size;
      camera.getWorldDirection(forward);
      const up = uniforms.uMarkUp.value.set(forward.x, forward.z).normalize();
      // Right of the eye, on the ground: up turned a quarter clockwise seen from above.
      uniforms.uMarkRight.value.set(-up.y, up.x);
      hologram?.place(camera, ndc, view.mark.size, groundY);
    },

    setTarget(on, flightSeconds) {
      // Each arrival draws it again, from an empty page.
      if (on && target === 0) {
        drawClock = -Math.max(0, flightSeconds - DRAW_LEAD);
        mark.draw(0);
      }
      target = on ? 1 : 0;
    },

    setNight(on, flightSeconds = 0) {
      if (on && nightTarget === 0) {
        if (nightProgress === 0) {
          // From the day: at full strength at once, laid by the ring as it runs out.
          pulseClock = -Math.max(0, flightSeconds - NIGHT_PULSE_LEAD);
          nightProgress = 1;
        } else {
          // Taken up again while it was going: it comes back from where it is, with no ring.
          pulseClock = Number.POSITIVE_INFINITY;
        }
      }
      nightTarget = on ? 1 : 0;
      strengths();
    },

    get night() {
      return night;
    },

    get isotypeGlow() {
      return isotypeGlow;
    },

    settle() {
      progress = target;
      nightProgress = nightTarget;
      pulseClock = Number.POSITIVE_INFINITY;
      strengths();
      hologram?.update(markDrawingAt(drawClock), drawClock, uniforms.uMarkStrength.value, 0);
    },

    update(delta) {
      if (progress === 0 && target === 0 && nightProgress === 0 && nightTarget === 0) return;
      progress = stepHighlight(progress, target, delta, FADE_SECONDS);
      nightProgress = stepHighlight(nightProgress, nightTarget, delta, FADE_SECONDS);
      pulseClock += Math.max(0, delta);
      strengths();
      // Leaving holds the drawing where it is and lets the strength take it down.
      if (target === 1 && drawClock < MARK_DRAW_SECONDS) {
        drawClock += Math.max(0, delta);
        if (drawClock > 0) mark.draw(Math.min(drawClock, MARK_DRAW_SECONDS));
      }
      hologram?.update(markDrawingAt(drawClock), drawClock, uniforms.uMarkStrength.value, delta);
    },

    dispose() {
      for (const [material, { hook, key }] of patched) {
        material.onBeforeCompile = hook;
        material.customProgramCacheKey = key;
        material.needsUpdate = true;
      }
      patched.clear();
      mark.texture.dispose();
      hologram?.dispose();
    },
  };
}
