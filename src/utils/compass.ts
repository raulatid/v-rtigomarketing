/**
 * Where a point of interest sits round a compass ring.
 *
 * Pure functions and no state. The DOM is `experiences/murcia/ui/cursorCompass.ts`;
 * this is the part worth measuring — a compass is all sign conventions, and every
 * one of them is invisible until a marker slides the wrong way and nobody can say
 * by how much. Until 2026-09-22 the instrument was a horizontal bar under the
 * header drawn from the camera's ground bearing; the ring draws from where the
 * building is ON SCREEN relative to the cursor (`screenBearing`), and the
 * ground bearing below is the fallback for a building behind the camera, which
 * has no place on screen.
 *
 * ## Yaw only, deliberately (the fallback)
 *
 * The bearing is computed on the GROUND PLANE, from the camera's forward flattened
 * to x/z. The obvious alternative — projecting the target into camera space and
 * taking `atan2(local.x, -local.z)` — is shorter and handles handedness for free,
 * and it is not what is here because IT MOVES WHEN ONLY THE TILT MOVES.
 *
 * Measured, camera held in one place with nothing changing but its pitch:
 *
 *   pitch    yaw-only     camera-space
 *   20deg    21.80deg     19.26deg
 *   35deg    21.80deg     18.98deg
 *   55deg    21.80deg     20.58deg
 *   70deg    21.80deg     23.83deg
 *
 * A camera-space bearing wanders by nearly a quarter of its own value under a
 * rotation that did not change where anything IS. Murcia's camera tilts from 35 to
 * 55 degrees as the viewer scrolls out (`murcia/camera/zoomPose.ts`), so that
 * wander would land squarely inside the gesture the compass is meant to help with.
 *
 * ## What yaw-only does NOT promise, and should not
 *
 * It is invariant to the camera's PITCH. It is not invariant to the camera's
 * POSITION.
 *
 * The distinction matters because the two are coupled here: the rig orbits, so
 * tilting also moves the camera horizontally, and a zoom-out therefore changes
 * both. The markers do slide during a zoom — correctly, because the bearing
 * genuinely changed when the camera moved. What they no longer do is slide because
 * the camera merely looked further down from the same place.
 *
 * ## The sign convention, worked out rather than guessed
 *
 * With the camera at the origin looking down -Z, forward is `(0, -1)` in (x, z) and
 * a target on the SCREEN RIGHT is at `(1, 0)`:
 *
 *   cross = fx*tz - fz*tx = 0*0 - (-1)*1 = +1
 *   dot   = fx*tx + fz*tz = 0
 *   atan2(+1, 0) = +PI/2
 *
 * So POSITIVE IS RIGHT. Straight ahead gives `atan2(0, 1) = 0`, and directly behind
 * gives `atan2(0, -1) = PI` — the far edge, from either side, which is what a
 * compass should do.
 */

/**
 * Signed horizontal angle from the camera's forward to a target, in radians.
 *
 * -PI..PI, positive to the right. Neither argument need be normalised; `atan2`
 * cares only about the ratio, so the caller can pass raw deltas.
 *
 * Returns 0 when either vector is degenerate — a target the camera is standing
 * exactly on has no bearing, and 0 puts its marker at the centre, which is the
 * least surprising place for something you are inside of.
 */
export function horizontalBearing(
  forwardX: number,
  forwardZ: number,
  toTargetX: number,
  toTargetZ: number,
): number {
  const forwardLength = Math.hypot(forwardX, forwardZ)
  const targetLength = Math.hypot(toTargetX, toTargetZ)
  if (forwardLength < 1e-6 || targetLength < 1e-6) return 0

  const cross = forwardX * toTargetZ - forwardZ * toTargetX
  const dot = forwardX * toTargetX + forwardZ * toTargetZ
  return Math.atan2(cross, dot)
}

/**
 * Smooth 0..1 ramp. Zero slope at both ends, so nothing arrives or leaves with a
 * visible corner.
 *
 * Here rather than in `utils/easing.ts` because that file's curves are for
 * TRANSITIONS — they take a clock and are read once per animation. These take a
 * measurement and are read every frame for every landmark, which is a different
 * thing wearing the same shape.
 */
function smoothstep(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

/**
 * How near a target is, 1 at `near` or closer and 0 at `far` or beyond.
 *
 * A distance in whatever unit the caller measures: the cursor compass hands it
 * client px from the ring to a building on screen, so "near" means the cursor
 * is near the building the viewer sees. The compass is a BEARING instrument and
 * knows nothing about distance on its own, which is exactly why this is
 * separate: on the ring a mark already sits at its bearing, so nearness is the
 * one thing left to say.
 *
 * Returns 0 for a degenerate range rather than dividing by it — an unset threshold
 * should light nothing, not everything.
 */
export function rangeCloseness(distance: number, near: number, far: number): number {
  if (!(far > near)) return 0
  return smoothstep(1 - (distance - near) / (far - near))
}

const DEG = Math.PI / 180
const TAU = 2 * Math.PI

/** A mark's place round the ring, in px from its centre, and its arrowhead's turn. */
export interface RingSlot {
  readonly x: number
  /** Screen y, so a mark AHEAD is at negative y: up. */
  readonly y: number
  /** For CSS `rotate()`, which turns clockwise on a y-down screen. */
  readonly angleDeg: number
}

/**
 * Bearing -> a slot on a ring of `radius`.
 *
 * Zero is straight up and a positive bearing goes right, which is
 * `horizontalBearing`'s "positive is right" drawn on a screen whose y grows
 * DOWNWARD: `x = r·sin(b)` and `y = -r·cos(b)`. An arrowhead drawn pointing up
 * and rotated by `angleDeg` therefore points outward along its own radius, so
 * the CSS never has to know the sign convention.
 */
export function ringSlot(bearing: number, radius: number): RingSlot {
  return {
    x: radius * Math.sin(bearing),
    y: -radius * Math.cos(bearing),
    angleDeg: bearing / DEG,
  }
}

/**
 * Where a point on the SCREEN is from the ring, as a bearing `ringSlot` draws.
 *
 * `dx`, `dy` are client px from the ring's centre to the point, y growing
 * downward as the screen's does. Straight up is 0 and the right is +PI/2 —
 * `ringSlot`'s own convention, so the two compose without a flip, and the same
 * sign `horizontalBearing` uses, so a mark can fall back from one to the other
 * without turning round. This is what the cursor compass draws from (2026-09-22):
 * a building to the left of the cursor gets an arrow pointing left, whichever
 * way the camera faces, because that is what the viewer sees.
 */
export function screenBearing(dx: number, dy: number): number {
  return Math.atan2(dx, -dy)
}

/**
 * Which side of its arrowhead a label reads on.
 *
 * Text is never rotated with the mark — a word upside down is a word nobody
 * reads — so it hangs off the arrowhead horizontally, on the side away from the
 * ring: right of a mark on the right half, left of one on the left. Dead ahead
 * is the right, so a label there has one home rather than flipping on the sign
 * of a rounding error.
 */
export function labelSide(bearing: number): 'left' | 'right' {
  return Math.sin(bearing) >= 0 ? 'right' : 'left'
}

/** -PI..PI. */
function wrap(angle: number): number {
  let a = (angle + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}

/**
 * Pushes bearings apart until every neighbouring pair is `minSeparation` apart.
 *
 * Two places a few degrees apart put their arrowheads on top of each other, and
 * the arrival pose is exactly such a view — the first thing Murcia shows. Each
 * short pair is pushed apart SYMMETRICALLY, so a mark never moves more than it
 * has to and the pair keeps its order and its midpoint. Round the circle, so a
 * pair straddling the seam at ±PI is as close as any other. Continuous in its
 * inputs: nothing here pops.
 *
 * Passes rather than a solve: with the handful of landmarks a city has, a pass
 * per bearing settles every chain, and the cost is nothing.
 */
export function spreadBearings(bearings: readonly number[], minSeparation: number): number[] {
  const n = bearings.length
  if (n < 2) return bearings.slice()
  const order = bearings.map((_, i) => i).sort((a, b) => bearings[a] - bearings[b])
  const spread = bearings.slice()
  for (let pass = 0; pass < n; pass++) {
    for (let k = 0; k < n; k++) {
      const i = order[k]
      const j = order[(k + 1) % n]
      // The next mark round the circle; the last one's neighbour is the first, a turn on.
      const gap = k + 1 < n ? spread[j] - spread[i] : spread[j] + TAU - spread[i]
      const short = minSeparation - gap
      if (short <= 0) continue
      spread[i] -= short / 2
      spread[j] += short / 2
    }
  }
  return spread.map(wrap)
}

/**
 * Vertical offsets that keep labels on the same side of the ring off each other.
 *
 * Near the top of the ring an angular spread barely moves a label's height —
 * `r(1 - cos 20°)` is two pixels at this radius — while both words hang to the
 * right, one over the other. So the axis that matters is handled on its own:
 * labels on a side are sorted by height and pushed apart symmetrically to
 * `minGap`, as `spreadBearings` does round the circle. Opposite sides never
 * meet and are not touched.
 */
export function stackLabels(
  labels: readonly { readonly side: 'left' | 'right'; readonly y: number }[],
  minGap: number,
): number[] {
  const y = labels.map((label) => label.y)
  for (const side of ['left', 'right'] as const) {
    const order = labels
      .map((_, i) => i)
      .filter((i) => labels[i].side === side)
      .sort((a, b) => y[a] - y[b])
    for (let pass = 0; pass < order.length; pass++) {
      for (let k = 0; k + 1 < order.length; k++) {
        const i = order[k]
        const j = order[k + 1]
        const short = minGap - (y[j] - y[i])
        if (short <= 0) continue
        y[i] -= short / 2
        y[j] += short / 2
      }
    }
  }
  return y.map((value, i) => value - labels[i].y)
}

/**
 * A slow blink for a place the viewer is near: 0..1 over `period` seconds,
 * never below `floor`.
 *
 * A sine rather than a square wave, and never fully dark, because it is drawn
 * on a building's surface: a light that snapped off would read as the building
 * losing its hover, and the point is the opposite — that it has one waiting.
 * The caller scales it by how near the place is.
 */
export function proximityPulse(seconds: number, period: number, floor: number): number {
  if (!(period > 0)) return 1
  const wave = 0.5 + 0.5 * Math.sin((TAU * seconds) / period)
  return floor + (1 - floor) * wave
}
