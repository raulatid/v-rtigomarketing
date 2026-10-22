import * as THREE from 'three';

/**
 * Where the camera stands at each of Conócenos' three stops, solved from the
 * tower's own geometry rather than written down: a re-export that moves the
 * screen or the logo moves the stops with it.
 *
 *   1. the screen — square in front of `LED_Main`, filling most of the view;
 *   2. the city — the whole of it, as on arriving from the warp, with the
 *      isotype drawn over it (`createCityMark.ts`); solved from the configured
 *      rest pose, not from wherever the visitor stood;
 *   3. the sky — in front of the tower and under the logo, looking up past it
 *      into the night, where the brands' satellites cross.
 *
 * Every number below came out of the prototypes of 2026-10-22
 * (`docs/plans/027-conocenos`, `028-conocenos-ciudad`), judged by eye, and is
 * a starting point to tune by eye rather than a measurement.
 *
 * Desktop and phone differ in where the copy sits — a plate to the right of
 * the subject, or a sheet under it — so the stops with copy are framed for one
 * or the other (`AboutLayout`). The screen stop has none: its slide is its
 * copy, so the screen is centred on both.
 */

/** The screen as a picture to stand in front of, in world space. */
export interface ScreenFrame {
  readonly centre: THREE.Vector3;
  /** Horizontal, unit length, pointing out of the picture. */
  readonly normal: THREE.Vector3;
  readonly height: number;
  /** The chord across the curved strip, measured square to the normal. */
  readonly width: number;
}

/** What the stops are solved from. */
export interface AboutGeometry {
  readonly screen: ScreenFrame;
  /** The middle of the logo's two parts together. */
  readonly logo: THREE.Vector3;
  /** The city's configured rest pose for this viewport (`resolveCameraPose` on `initialFocus`). */
  readonly rest: AboutPose;
}

/** Docked: the plate beside the subject. Sheet: the copy under it, on a phone. */
export type AboutLayout = 'docked' | 'sheet';

export interface AboutLens {
  /** Vertical, degrees. */
  readonly fov: number;
  readonly aspect: number;
}

/** A pose: where the eye is and what it looks at. The eye never rolls. */
export interface AboutPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

/**
 * How much of the view the screen fills on its tighter axis at stop 1, square
 * on and centred: nothing beside or under it, since the slide is the stop's
 * copy. A desktop is bound by the screen's height, a portrait phone by its width.
 */
export const SCREEN_FILL = { docked: 0.75, sheet: 0.9 } as const;

/**
 * Stop 2: how far the rest pose is pulled back along its own ray, eye from
 * target, for the whole city. The prototype pulled the entry pose 2.6 times
 * (`markPull`), from a visitor standing closer than rest; from the rest pose
 * 2.6 put the city under the fog, where its darkening does not read, and 1.3
 * matches the prototype's frame (looked at on 2026-10-22, 1440×900).
 */
export const CITY_PULL = 1.3;
/**
 * Stop 2: the isotype over the city — where in the frame it is centred, in
 * NDC (the point the view's ray meets the ground, `createCityMark.ts`), and
 * how many world units across. Left of the docked plate; on a phone, smaller,
 * for the narrow frame, and above the sheet, which covers the lower half.
 */
export const CITY_MARK = {
  docked: { x: -0.42, y: -0.05, size: 240 },
  sheet: { x: 0, y: 0.3, size: 180 },
} as const;

/**
 * Stop 3: out along the screen's normal and down from the logo, in world
 * units. The phone's eye stands lower than the prototype's 14: with the logo
 * lifted above the sheet, 14 left the view about 5° up, under the dark of the
 * sky where the satellites run (`sky/skyPasses.ts`); 36 tilts it about 20° up
 * and keeps the logo where the sheet does not cut it.
 */
const SKY_OFFSET = { docked: { back: 34, down: 10 }, sheet: { back: 75, down: 36 } } as const;
/**
 * Stop 3: where the logo lands in the frame, in NDC. Low and to the left on a
 * desktop, which tilts the view about 26° up and leaves the sky the rest of
 * the frame; centred and above the sheet on a phone — at y 0 the sheet's top
 * edge cut through the logo (looked at on 2026-10-22, 390×844).
 */
const SKY_NDC = { docked: { x: -0.45, y: -0.55 }, sheet: { x: 0, y: 0.3 } } as const;
/**
 * Stop 3: the patch of sky the satellites are aimed at, in NDC — up in the
 * dark, and on a desktop left of the docked plate, which covers the frame's
 * centre-right and hides any brand panel that passes behind it
 * (`sky/skyPasses.ts`, `about/aboutSky.ts`).
 */
export const SKY_FOCUS_NDC = { docked: { x: -0.4, y: 0.5 }, sheet: { x: 0, y: 0.5 } } as const;

/**
 * Where to stand to see the screen square on, filling `fill` of the view on
 * whichever axis is tighter: a portrait phone is bound by the screen's width,
 * a desktop by its height.
 */
export function solveScreenView(
  frame: ScreenFrame,
  fovDegrees: number,
  aspect: number,
  fill: number,
): AboutPose {
  const halfV = THREE.MathUtils.degToRad(fovDegrees) / 2;
  const tanH = Math.tan(halfV) * aspect;
  const byHeight = frame.height / fill / 2 / Math.tan(halfV);
  const byWidth = frame.width / fill / 2 / tanH;
  const distance = Math.max(byHeight, byWidth);
  return {
    position: frame.normal.clone().multiplyScalar(distance).add(frame.centre),
    target: frame.centre.clone(),
  };
}

/** Where a world point lands in NDC for an eye at `position` turned by `quaternion`. */
export function projectToNdc(
  point: THREE.Vector3,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  lens: AboutLens,
  out = new THREE.Vector2(),
): THREE.Vector2 {
  const local = point.clone().sub(position).applyQuaternion(quaternion.clone().invert());
  const tanV = Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2);
  const depth = -local.z;
  return out.set(local.x / depth / (tanV * lens.aspect), local.y / depth / tanV);
}

/**
 * Turns an eye at `position`, without roll, so `subject` lands at `ndc`: the
 * stop 3 framing, solved in screen space on purpose — "the logo in the bottom
 * left corner" is a statement about the picture, and a pan cannot make it
 * when the subject is close and the view tilts.
 *
 * Returns the point the eye looks at, one unit ahead, so the result is a pose
 * like any other. A few Newton-like steps on yaw and pitch; the projection is
 * smooth and starts a few degrees from the answer, so it converges well inside
 * the step count.
 */
export function aimSoSubjectLandsAt(
  position: THREE.Vector3,
  subject: THREE.Vector3,
  lens: AboutLens,
  ndc: { x: number; y: number },
): AboutPose {
  const toSubject = subject.clone().sub(position);
  let yaw = Math.atan2(-toSubject.x, -toSubject.z);
  let pitch = Math.atan2(toSubject.y, Math.hypot(toSubject.x, toSubject.z));
  const halfV = THREE.MathUtils.degToRad(lens.fov) / 2;
  const halfH = Math.atan(Math.tan(halfV) * lens.aspect);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion();
  const landed = new THREE.Vector2();
  for (let i = 0; i < 24; i += 1) {
    quaternion.setFromEuler(euler.set(pitch, yaw, 0));
    projectToNdc(subject, position, quaternion, lens, landed);
    const dx = ndc.x - landed.x;
    const dy = ndc.y - landed.y;
    if (Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5) break;
    // Turning left (yaw up) moves the subject right; looking up moves it down.
    yaw += dx * halfH;
    pitch = THREE.MathUtils.clamp(pitch - dy * halfV, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }
  quaternion.setFromEuler(euler.set(pitch, yaw, 0));
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  return { position: position.clone(), target: position.clone().add(forward) };
}

/**
 * Stop 2: the rest pose, its eye pulled `pull` times as far from its target
 * along the same ray. The view does not turn, so the city reads as the one the
 * visitor landed on, only whole.
 */
export function solveCityView(rest: AboutPose, pull = CITY_PULL): AboutPose {
  const position = rest.position.clone().sub(rest.target).multiplyScalar(pull).add(rest.target);
  return { position, target: rest.target.clone() };
}

/** The three stops, in order, for this lens and layout. */
export function solveAboutStops(geometry: AboutGeometry, lens: AboutLens, layout: AboutLayout): AboutPose[] {
  const { screen, logo } = geometry;

  const screenView = solveScreenView(screen, lens.fov, lens.aspect, SCREEN_FILL[layout]);

  const city = solveCityView(geometry.rest);

  const offset = SKY_OFFSET[layout];
  const skyEye = screen.normal.clone().multiplyScalar(offset.back).add(logo);
  skyEye.y -= offset.down;
  const sky = aimSoSubjectLandsAt(skyEye, logo, lens, SKY_NDC[layout]);

  return [screenView, city, sky];
}
