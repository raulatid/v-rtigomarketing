import * as THREE from 'three';

/**
 * Where the camera stands at each of Conócenos' three stops, solved from the
 * tower's own geometry rather than written down: a re-export that moves the
 * screen or the logo moves the stops with it.
 *
 *   1. the screen — square in front of `LED_Main`, filling most of the view;
 *   2. the rooftop — over the logo, looking down at it, so no horizon enters;
 *   3. the sky — in front of the tower and under the logo, looking up past it
 *      into the night, where the brands' satellites cross.
 *
 * Every number below came out of the prototypes of 2026-10-22
 * (`docs/plans/027-conocenos`), judged by eye, and is a starting point to tune
 * by eye rather than a measurement.
 *
 * Desktop and phone differ in where the copy sits — a plate to the right of
 * the subject, or a sheet under it — so each stop is framed for one or the
 * other (`AboutLayout`).
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

/** How much of the view the screen fills on its tighter axis at stop 1. */
export const SCREEN_FILL = { docked: 0.7, sheet: 0.5 } as const;

/**
 * Where the screen's centre sits at stop 1, in NDC: left of the plate on a
 * desktop, as the logo is at stop 2 — centred, the docked plate covered half
 * the strip (looked at on 2026-10-22, 1440×900); lifted on a phone, above the
 * sheet.
 */
const SCREEN_NDC = { docked: { x: -0.42, y: 0 }, sheet: { x: 0, y: 0.32 } } as const;
/**
 * Stop 1 on a phone: world units the eye rises above the screen's middle,
 * looking down at it rather than panned under it. Bound by the strip's width,
 * the phone stands about 200 units back, and the pan that lifts the screen
 * above the sheet took the eye down to the rooftops, where a building in front
 * covered half the strip (looked at on 2026-10-22, 390×844).
 */
const SCREEN_RISE = { docked: 0, sheet: 20 } as const;

/** Stop 2: the elevation the logo is seen from — high enough that no horizon enters. */
const ROOFTOP_ELEVATION_DEGREES = 40;
/** Stop 2: how far back the camera stands from the logo's middle. */
const ROOFTOP_DISTANCE = { docked: 44, sheet: 70 } as const;
/** Stop 2: where the logo sits in the frame, in NDC. Left of the plate, or above the sheet. */
const ROOFTOP_NDC = { docked: { x: -0.42, y: 0 }, sheet: { x: 0, y: 0.45 } } as const;

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

/**
 * Slides a pose sideways and up, eye and target together, so its subject
 * lands at `ndc` without the view turning — `CampusFraming`'s pan.
 */
export function panPose(pose: AboutPose, lens: AboutLens, ndc: { x: number; y: number }): AboutPose {
  if (ndc.x === 0 && ndc.y === 0) return pose;
  const forward = pose.target.clone().sub(pose.position);
  const distance = forward.length();
  forward.divideScalar(distance);
  const right = forward.clone().cross(THREE.Object3D.DEFAULT_UP).normalize();
  const up = right.clone().cross(forward).normalize();
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2) * distance;
  const offset = right
    .multiplyScalar(-halfHeight * lens.aspect * ndc.x)
    .addScaledVector(up, -halfHeight * ndc.y);
  return { position: pose.position.clone().add(offset), target: pose.target.clone().add(offset) };
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

/** The three stops, in order, for this lens and layout. */
export function solveAboutStops(geometry: AboutGeometry, lens: AboutLens, layout: AboutLayout): AboutPose[] {
  const { screen, logo } = geometry;

  const square = solveScreenView(screen, lens.fov, lens.aspect, SCREEN_FILL[layout]);
  const screenView =
    SCREEN_RISE[layout] > 0
      ? aimSoSubjectLandsAt(square.position.setY(square.position.y + SCREEN_RISE[layout]), screen.centre, lens, SCREEN_NDC[layout])
      : panPose(square, lens, SCREEN_NDC[layout]);

  const elevation = THREE.MathUtils.degToRad(ROOFTOP_ELEVATION_DEGREES);
  const rooftopEye = screen.normal
    .clone()
    .multiplyScalar(Math.cos(elevation))
    .setY(Math.sin(elevation))
    .multiplyScalar(ROOFTOP_DISTANCE[layout])
    .add(logo);
  const rooftop = panPose({ position: rooftopEye, target: logo.clone() }, lens, ROOFTOP_NDC[layout]);

  const offset = SKY_OFFSET[layout];
  const skyEye = screen.normal.clone().multiplyScalar(offset.back).add(logo);
  skyEye.y -= offset.down;
  const sky = aimSoSubjectLandsAt(skyEye, logo, lens, SKY_NDC[layout]);

  return [screenView, rooftop, sky];
}
