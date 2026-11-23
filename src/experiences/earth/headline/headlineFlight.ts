import * as THREE from 'three'
import { clamp01, easeInOutCubic } from '../../../utils/easing'

/**
 * The h1's arrival on a wide orbit (block 9, I3: a prototype, `?h1=b|c` only).
 *
 * One big orbit round the planet whose near point passes close to the camera.
 * The title's letters ride it as a train, the first letter leading: they come
 * round from behind the planet, swing in from the right and brake across the
 * front of everything, several times their size and cropped by the screen,
 * over the planet's middle. The word holds there a moment, and then each
 * letter, in reading order, pulls back and up to its glyph in the real h1. It
 * arrives once and does not go round again. (The first prototype went round a
 * satellite-sized ring; dropped on review, 2026-11-23.)
 *
 * Everything here is the geometry and the schedule, free of the DOM so it can
 * be tested; `HeadlineFlightLayer` reads the camera and writes the letters. The
 * orbit is built from the camera every frame rather than fixed in the world,
 * and its radius from the size the word should have at the front, so it brakes
 * on the same spot of the screen whatever distance the camera rests at.
 */
export const HEADLINE_FLIGHT = {
  /** How much bigger than in the title the word is at the front of the orbit. */
  nearScale: 2.6,
  /** How far the orbit's near half dips towards the viewer, in radians. Low, so the front stays on screen. */
  tilt: THREE.MathUtils.degToRad(5),
  /** Radians the word's middle travels to the front: π starts it straight behind the planet. */
  sweep: Math.PI,
  /** Seconds of the swing, fast from behind and braking across the front. */
  travel: 1.5,
  /** Seconds it holds at the front, already almost still, before the first letter pulls back. */
  hold: 0.18,
  /** Seconds between one letter pulling back and the next. */
  stagger: 0.028,
  /** Seconds from the front to sitting in the h1. */
  lift: 0.95,
  /** Seconds the word takes to fade in. */
  fadeIn: 0.3,
  /** The smallest radius it may take, in Earth radii, so it never cuts through the planet. */
  minRadius: 1.4,
  /** How far past edge-on (`ringTurn` 0) a letter fades in over, so it does not blink at the orbit's ends. */
  edgeOn: 0.25,
  /** Width of the limb's soft edge, as a fraction of the planet's radius. */
  limbSoftness: 0.04,
  /**
   * How far in front of the planet's centre the h1 sits in depth, in Earth
   * radii. Past the surface, so a letter at rest is never behind the globe, and
   * the plane the depth scale is measured against: a letter reads at its own
   * size there.
   */
  restDepth: 1.1,
} as const

/** Fast start, long brake. */
function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4
}

/**
 * The orbit's radius: the one whose nearest point is at the depth where the
 * word is `nearScale` times its size at the rest plane.
 */
export function orbitRadius(centreDistance: number, restDistance: number, earthRadius: number): number {
  const { nearScale, tilt, minRadius } = HEADLINE_FLIGHT
  const near = restDistance / nearScale
  return Math.max(minRadius * earthRadius, (centreDistance - near) / Math.cos(tilt))
}

/**
 * Where a letter is on the orbit at `time`, in radians (0 the orbit's right
 * end, π/2 its nearest point, π its left end). `offset` is how far ahead of the
 * word's middle it rides: the first letter, on the left at the front, leads.
 */
export function letterAngle(time: number, offset: number): number {
  const { sweep, travel } = HEADLINE_FLIGHT
  const done = easeOutQuart(clamp01(time / travel))
  return Math.PI / 2 - sweep * (1 - done) + offset
}

/** When the letter `order` places in reading order starts pulling back from the front. */
export function liftStart(order: number): number {
  const { travel, hold, stagger } = HEADLINE_FLIGHT
  return travel + hold + order * stagger
}

/** 0 at the front, 1 in place, eased. */
export function liftAmount(time: number, order: number): number {
  return easeInOutCubic(clamp01((time - liftStart(order)) / HEADLINE_FLIGHT.lift))
}

/** Seconds until the last of `count` letters is in place. */
export function flightDuration(count: number): number {
  return liftStart(Math.max(0, count - 1)) + HEADLINE_FLIGHT.lift
}

/** The word's opacity while it fades in. */
export function fadeIn(time: number): number {
  return clamp01(time / HEADLINE_FLIGHT.fadeIn)
}

/**
 * The angle that spaces the letters on the orbit as they are spaced in the h1.
 *
 * `advance` is the distance in CSS pixels along the title from the first
 * letter's centre to this one's. At the rest plane a world length `L` spans
 * `L · focal / restDistance` pixels, so an arc `R · dθ` spans the same when
 * `dθ = advance · restDistance / (R · focal)`. A letter's size scales with depth
 * as its arc does, so the spacing holds wherever on the orbit it faces the eye.
 */
export function letterLag(advance: number, restDistance: number, ringRadius: number, focal: number): number {
  return (advance * restDistance) / (ringRadius * focal)
}

/** The orbit's frame: its centre, its right end and its nearest point, as directions. */
export interface RingFrame {
  centre: THREE.Vector3
  right: THREE.Vector3
  toward: THREE.Vector3
  radius: number
}

/**
 * The orbit as the camera sees it: the plane through the camera's right axis,
 * tipped from the line of sight by `tilt` so the near half is lower.
 */
export function ringFrame(
  eye: THREE.Vector3,
  cameraRight: THREE.Vector3,
  cameraUp: THREE.Vector3,
  centre: THREE.Vector3,
  radius: number,
  tilt: number,
  out: RingFrame,
): RingFrame {
  out.centre.copy(centre)
  out.right.copy(cameraRight).normalize()
  // From the centre back towards the eye, then down.
  out.toward
    .copy(eye)
    .sub(centre)
    .normalize()
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(cameraUp, -Math.sin(tilt))
    .normalize()
  out.radius = radius
  return out
}

export function ringPoint(frame: RingFrame, angle: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(frame.centre)
    .addScaledVector(frame.right, Math.cos(angle) * frame.radius)
    .addScaledVector(frame.toward, Math.sin(angle) * frame.radius)
}

/**
 * How square-on a letter printed on the orbit at `angle` faces the eye: 1
 * facing it, 0 edge-on, below 0 turned away. It is how much narrower the letter
 * looks, and on an orbit passing close to the camera it is what keeps the
 * letters round its sides from running into each other.
 */
export function ringTurn(frame: RingFrame, angle: number, eye: THREE.Vector3, point: THREE.Vector3): number {
  const ox = Math.cos(angle) * frame.right.x + Math.sin(angle) * frame.toward.x
  const oy = Math.cos(angle) * frame.right.y + Math.sin(angle) * frame.toward.y
  const oz = Math.cos(angle) * frame.right.z + Math.sin(angle) * frame.toward.z
  const dx = eye.x - point.x
  const dy = eye.y - point.y
  const dz = eye.z - point.z
  const length = Math.hypot(dx, dy, dz)
  if (length === 0) return 1
  return (ox * dx + oy * dy + oz * dz) / length
}

/**
 * How much of a point the planet leaves visible: 1 in front of it or clear of
 * its disc, 0 behind it, and a soft step across the limb so a letter going
 * round the edge fades rather than blinks.
 */
export function planetCover(
  eye: THREE.Vector3,
  point: THREE.Vector3,
  centre: THREE.Vector3,
  radius: number,
  softness: number = HEADLINE_FLIGHT.limbSoftness,
): number {
  const dx = point.x - eye.x
  const dy = point.y - eye.y
  const dz = point.z - eye.z
  const length = Math.hypot(dx, dy, dz)
  if (length === 0) return 1
  const ox = centre.x - eye.x
  const oy = centre.y - eye.y
  const oz = centre.z - eye.z
  // Distance along the sight line to the centre's closest approach.
  const along = (ox * dx + oy * dy + oz * dz) / length
  if (along <= 0) return 1
  const miss2 = Math.max(0, ox * ox + oy * oy + oz * oz - along * along)
  const r2 = radius * radius
  if (miss2 >= r2) return 1
  // Where the sight line enters the sphere. A point nearer than that is in front.
  const entry = along - Math.sqrt(r2 - miss2)
  if (entry >= length) return 1
  const edge = Math.sqrt(miss2) / radius
  const t = clamp01((edge - (1 - softness)) / softness)
  return t * t * (3 - 2 * t)
}
