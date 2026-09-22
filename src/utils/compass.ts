/**
 * Where a point of interest sits on a horizontal compass bar.
 *
 * Pure functions and no state. The DOM is `experiences/murcia/ui/compassBar.ts`;
 * this is the part worth measuring — a compass is all sign conventions, and every
 * one of them is invisible until a marker slides the wrong way and nobody can say
 * by how much.
 *
 * ## Yaw only, deliberately
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

/** Where a bearing lands on the bar, and whether it had to be held at an edge. */
export interface CompassMark {
  /** -1 at the left end of the bar, 0 at the centre, +1 at the right. */
  readonly offset: number
  /**
   * The target is outside the bar's span and the offset is pinned to an edge.
   *
   * Reported rather than hidden here, because "off the left" and "hard left" are
   * different things and only the caller knows how it wants to draw the
   * difference. Clamping without saying so would make a target behind you
   * indistinguishable from one at the edge of the span.
   */
  readonly beyond: boolean
}

/**
 * Bearing -> a position on a bar spanning `spanRadians` in total.
 *
 * The span is the WHOLE bar, so a 180-degree span puts +/-90 at the ends. Anything
 * further is clamped and flagged.
 */
export function compassMark(bearing: number, spanRadians: number): CompassMark {
  const half = Math.max(1e-6, spanRadians / 2)
  const raw = bearing / half
  if (raw > 1) return { offset: 1, beyond: true }
  if (raw < -1) return { offset: -1, beyond: true }
  return { offset: raw, beyond: false }
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
 * How centred a mark is, 1 dead ahead and 0 at the edge of the band and beyond.
 *
 * `bandHalfWidth` is in the same -1..1 units as `CompassMark.offset`, so a band
 * covering the middle QUARTER of the bar is a half-width of 0.25: the offset axis
 * is two units wide, and a quarter of two is a half, centred.
 *
 * Ramped rather than thresholded because the caller draws this as a size and a
 * colour, and a landmark that snapped to its warm colour the instant it crossed a
 * line would read as a state change rather than as an approach. It also breaks the
 * tie between two landmarks in the band at once: the more centred one always wins.
 */
export function centreCloseness(offset: number, bandHalfWidth: number): number {
  if (bandHalfWidth <= 0) return 0
  return smoothstep(1 - Math.abs(offset) / bandHalfWidth)
}

/**
 * How near a target is, 1 at `near` or closer and 0 at `far` or beyond.
 *
 * The compass is a BEARING instrument and knows nothing about distance on its own,
 * which is exactly why this is separate: a landmark can be dead ahead across the
 * whole plate, and being pointed at something is not the same as having arrived
 * near it. The caller multiplies the two, so both have to agree before anything
 * lights up.
 *
 * Returns 0 for a degenerate range rather than dividing by it — an unset threshold
 * should light nothing, not everything.
 */
export function rangeCloseness(distance: number, near: number, far: number): number {
  if (!(far > near)) return 0
  return smoothstep(1 - (distance - near) / (far - near))
}

/**
 * A mark's opacity, faded across the outermost stretch of the bar.
 *
 * `fadeStart` is an offset magnitude, so 0.7 begins the fade with 15% of the bar's
 * width left on that side. EXPRESSED AS A FRACTION OF THE BAR AND NOT IN PIXELS,
 * which is the whole point: the bar is narrower on a phone than on a desktop, and
 * a pixel threshold would put the fade in a different place on each — or, on a
 * narrow enough bar, never reach it at all.
 *
 * Beyond the span the fade is already complete, so a clamped mark needs no special
 * case here: its offset is +/-1, which lands on `minOpacity` by construction.
 */
export function edgeFadeOpacity(
  offset: number,
  fadeStart: number,
  minOpacity: number,
): number {
  if (fadeStart >= 1) return 1
  const past = (Math.abs(offset) - fadeStart) / (1 - fadeStart)
  if (past <= 0) return 1
  return minOpacity + (1 - minOpacity) * smoothstep(1 - past)
}

/** Whether a mark is waiting to arrive, and whether it just did. */
export interface ArrivalEdge {
  /** True while the mark may fire on its next rise through `on`. */
  readonly armed: boolean
  /** True on exactly the frame warmth rose through `on` while armed. */
  readonly fire: boolean
}

/**
 * One event per arrival, from a warmth that is read every frame.
 *
 * Fires when `warmth` rises through `on` while armed, and re-arms only once it
 * has fallen below `off`. The gap between the two is the point: warmth is a
 * continuous product of two ramps, and a pin drifting across a single threshold
 * and back every frame would fire like a fault light. Nothing here is drawn —
 * the caller decides what an arrival looks like.
 */
export function arrivalEdge(armed: boolean, warmth: number, on: number, off: number): ArrivalEdge {
  if (armed) {
    if (warmth >= on) return { armed: false, fire: true }
    return { armed: true, fire: false }
  }
  return { armed: warmth < off, fire: false }
}

/** One label as the bar would draw it this frame, before any placing. */
export interface LabelInput {
  /** Its mark's centre, in px from the bar's centre: negative is left. */
  readonly x: number
  /** Its drawn width in px, arrival growth included. */
  readonly width: number
  /** The higher of two colliding labels keeps its place. */
  readonly priority: number
  /** Whether it was drawn last frame — what the hysteresis below reads. */
  readonly shown: boolean
}

/** Where a label goes relative to its mark, and whether it is drawn at all. */
export interface LabelPlacement {
  /** Px to move the label along the bar, off its mark, to keep it on the bar. */
  readonly shift: number
  readonly shown: boolean
}

export interface LabelRules {
  /** Half the bar's width, in px: no label may reach past it. */
  readonly halfSpan: number
  /** The least clear space between two drawn labels, in px. */
  readonly gap: number
  /**
   * The clear space a hidden label needs before it comes back. Wider than `gap`,
   * for `arrivalEdge`'s reason: two marks drifting across one threshold would
   * blink a label on and off every frame.
   */
  readonly reenterGap: number
  /**
   * Priority a drawn label keeps over one that is not. Two cold labels crossing
   * the centre from either side swap which is nearer it; without this they would
   * swap which one is drawn at the same moment.
   */
  readonly stickiness: number
}

/**
 * Keeps labels on the bar and off each other.
 *
 * Two places a few degrees apart put their labels on top of each other, and the
 * arrival pose is exactly such a view — the first thing Murcia shows. So labels
 * are placed in priority order and a label that would come within `gap` of one
 * already placed is not drawn: the pin still marks where that place is, the words
 * belong to the one being arrived at. A label near an end is moved inward until
 * it fits, so its pin can sit at the very end of the span without the word
 * running off the glass.
 *
 * Everything is in px from the bar's centre, and the caller measures: this only
 * places.
 */
export function placeLabels(labels: readonly LabelInput[], rules: LabelRules): LabelPlacement[] {
  const shifts = labels.map((label) => keepOnBar(label.x, label.width / 2, rules.halfSpan))
  const rank = (i: number): number =>
    labels[i].priority + (labels[i].shown ? rules.stickiness : 0)
  const order = labels.map((_, i) => i).sort((a, b) => rank(b) - rank(a))

  const shown = labels.map(() => false)
  const placed: number[] = []
  for (const i of order) {
    const need = labels[i].shown ? rules.gap : rules.reenterGap
    const centre = labels[i].x + shifts[i]
    const clear = placed.every((j) => {
      const between = Math.abs(centre - (labels[j].x + shifts[j]))
      return between - (labels[i].width + labels[j].width) / 2 >= need
    })
    if (clear) {
      shown[i] = true
      placed.push(i)
    }
  }
  return labels.map((_, i) => ({ shift: shifts[i], shown: shown[i] }))
}

/** The shift that holds a label of half-width `half`, centred on `x`, inside the bar. */
function keepOnBar(x: number, half: number, halfSpan: number): number {
  // Wider than the bar: centred on it, the least-bad place.
  if (half >= halfSpan) return -x
  const held = Math.min(halfSpan - half, Math.max(-halfSpan + half, x))
  return held - x
}
