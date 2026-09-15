import { prefersReducedMotion } from '../../../platform/motionPreference'
import * as THREE from 'three'
import {
  arrivalEdge,
  centreCloseness,
  compassMark,
  edgeFadeOpacity,
  horizontalBearing,
  placeLabels,
  rangeCloseness,
  type LabelInput,
} from '../../../utils/compass'

/**
 * An instrument that says which way the places worth clicking are.
 *
 * ## The lab's shapes, the Night Window's colour
 *
 * The shapes are `vertigo-lab`'s camera-navigation compass (`demo/compassBar.ts`),
 * ported 2026-09-10: its quadratic lenses and geo-tag pin, below. Its colour is
 * not, since 2026-09-15 (DECISIONS §44): the lab's blue furniture, its glows and
 * its yellow arrival read as a game HUD, which DESIGN.md rules out. Everything on
 * the plate is white at the site's text strengths, and the hierarchy is mass and
 * strength rather than hue — the bar a feathered hairline, the forward needle at
 * full strength, a pin at secondary strength until it is arrived at, when it
 * rises to the needle's. Blue stays on the plate's edge, as on every density-A
 * tray.
 *
 * What is not the lab's either is the sizing: there it was computed in JS from a
 * measured width, which read zero while the bar was hidden; here the CSS sizes
 * everything (murcia.css) and the marks travel in percentages of the bar.
 *
 * ## Why it exists
 *
 * The new navigation makes turning away easy and continuous — one finger yaws
 * the whole city — so "where was the district?" became a question a viewer can
 * actually get stuck on. This answers it from any heading.
 *
 * ## Not a control
 *
 * `pointer-events: none` and `aria-hidden`, both load-bearing: `adr/009`'s
 * direction is that navigation is a
 * gesture and parallel controls get deleted. `DistrictA11y` is the real
 * focusable route, and a decorative echo here would be read out twice and
 * navigate nowhere.
 *
 * ## Yaw-only bearings
 *
 * The maths is `utils/compass.ts`, and its header explains at length why the
 * bearing is taken on the ground plane rather than in camera space: a
 * camera-space bearing moves when only the PITCH moves, and Murcia's pitch
 * sweeps 35 to 55 degrees across the zoom band. A marker that slid while the
 * viewer zoomed — without anything having moved — is exactly the artefact this
 * is meant to resolve rather than add.
 *
 * ## Arriving, and why it takes two claims
 *
 * A landmark rises to full strength only when it is BOTH near the centre of the
 * bar and near in the world. Bearing alone is not enough: a landmark can be dead
 * ahead from across the whole plate, and being pointed at something is not the
 * same as having arrived at it. The two closeness terms are multiplied, so both
 * have to agree.
 *
 * ## Labels that fit
 *
 * The arrival pose puts the two places a few degrees apart, and their labels
 * printed over each other. `placeLabels` decides which label is drawn and how far
 * one near an end moves inward; it needs the bar's width and each label's, which
 * a ResizeObserver reports — layout sizes, true while the plate is hidden (it
 * hides by opacity), and reported again when a font swaps in. Nothing is read
 * from the layout per frame.
 */

/** One place the compass can point at. */
export interface CompassPoi {
  /** Stable, and used as the mark's `data-poi` for tests. */
  readonly id: string
  /** Where it is, in world space. Written into `out` and returned. */
  readonly anchor: (out: THREE.Vector3) => THREE.Vector3
  readonly label: string
}

/** The whole bar spans this many degrees, so +/-90 lands at the ends. */
const SPAN_DEGREES = 180
/** Fraction of the offset axis, each side of centre, that counts as "ahead". */
const CENTRE_BAND_HALF_WIDTH = 0.25
/** Offset magnitude at which the edge fade begins. */
const EDGE_FADE_START = 0.7
const EDGE_MIN_OPACITY = 0.18
/** World distances at which a landmark reads as near and as far. */
const PROXIMITY_NEAR = 90
const PROXIMITY_FAR = 260

const DEG = Math.PI / 180

const SVG_NS = 'http://www.w3.org/2000/svg'

/*
 * The shapes, in their own viewBox units. The CSS sizes each box, so these fix
 * proportions and nothing else. The bar's lens is a hairline (2 at its centre)
 * and the forward lens a needle; the lab's were 5 and 6.5, which in blue read as
 * furniture and in white would outweigh the readings. The needle is also
 * shorter than the lab's 36, which ran as far below the bar as above it: in one
 * colour its lower half merged with an arriving pin.
 */
const BAR_VIEWBOX_W = 420
const BAR_VIEWBOX_H = 10
const BAR_CENTRE_THICKNESS = 2
const BAR_EDGE_THICKNESS = 0.4
const FORWARD_VIEWBOX_W = 11
const FORWARD_VIEWBOX_H = 18
const FORWARD_THICKNESS = 3.5
const PIN_VIEWBOX_W = 13
const PIN_VIEWBOX_H = 19
const PIN_HOLE_RADIUS = 2.7
/** The calibration above the bar: a tick every 15° of the span, in the bar's units. */
const TICK_STEP_DEGREES = 15
const TICKS_VIEWBOX_H = 8
const TICK_LONG = 6
const TICK_SHORT = 3

/** Warmth a pin rises through to pulse once, and falls below to arm again. */
const ARRIVAL_ON = 0.85
const ARRIVAL_OFF = 0.5
const PULSE_MS = 900

/**
 * The hairline's strength at its centre, feathered to nothing at both ends
 * (DESIGN.md: nothing terminates in a cut). A stop opacity on `currentColor`,
 * so the colour itself is the stylesheet's token.
 */
const BAR_ALPHA_CENTRE = 0.55
const BAR_ALPHA_EDGE = 0

/**
 * How much bigger an arrived label is drawn. murcia.css reserves the plate's
 * height for the same number; change both.
 */
const LABEL_ARRIVAL_SCALE = 1.2
/** Label placing, in px; see `placeLabels`. */
const LABEL_GAP = 8
const LABEL_REENTER_GAP = 14
const LABEL_STICKINESS = 0.05

/** Unique per instance, so two bars alive at once never share a gradient. */
let gradientSeq = 0

function svgBox(width: number, height: number, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('class', className)
  return svg
}

function svgPath(d: string, fill: string, evenOdd = false): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', fill)
  if (evenOdd) path.setAttribute('fill-rule', 'evenodd')
  return path
}

/**
 * A symmetric lens: `centre` thick in the middle, `edge` thick at both ends.
 *
 * A quadratic from P0 to P2 with control P1 passes through (P0 + 2·P1 + P2) / 4,
 * so a control `centre - edge / 2` out from the midline peaks at exactly
 * `centre` while the ends stay `edge`. `vertical` swaps the axes rather than
 * rotating, so the path is already in its own SVG's coordinates.
 */
function lensPath(span: number, box: number, centre: number, edge: number, vertical: boolean): string {
  const mid = box / 2
  const halfEdge = edge / 2
  const control = centre - halfEdge
  const half = span / 2
  // (along, across) -> (x, y).
  const p = (a: number, c: number): string => (vertical ? `${c} ${a}` : `${a} ${c}`)
  return (
    `M ${p(0, mid - halfEdge)} ` +
    `Q ${p(half, mid - control)} ${p(span, mid - halfEdge)} ` +
    `L ${p(span, mid + halfEdge)} ` +
    `Q ${p(half, mid + control)} ${p(0, mid + halfEdge)} Z`
  )
}

/**
 * A geo tag: a round head of diameter `width`, drawn down to a tip at `height`.
 *
 * The hole is a second subpath, and `evenodd` is what punches it through — there
 * is no background colour to paint one in, because the bar floats over the scene.
 * The flanks' control at 0.42 of the drop is the lab's: higher and the pin turns
 * into a lozenge, lower and it reads as a drip.
 */
function pinPath(width: number, height: number, holeRadius: number): string {
  const r = width / 2
  const controlY = r + (height - r) * 0.42
  return (
    // Body: tip, out to the right shoulder, over the top, back down to the tip.
    `M ${r} ${height} Q ${width} ${controlY} ${width} ${r} ` +
    `A ${r} ${r} 0 0 0 0 ${r} ` +
    `Q 0 ${controlY} ${r} ${height} Z ` +
    // Hole: two half-arcs, so it closes without a full-circle special case.
    `M ${r} ${r - holeRadius} ` +
    `A ${holeRadius} ${holeRadius} 0 1 0 ${r} ${r + holeRadius} ` +
    `A ${holeRadius} ${holeRadius} 0 1 0 ${r} ${r - holeRadius} Z`
  )
}

export class CompassBar {
  private readonly root: HTMLDivElement
  private readonly line: SVGSVGElement
  private readonly marks: Array<{
    poi: CompassPoi
    el: HTMLDivElement
    label: HTMLSpanElement
    pulse: HTMLSpanElement
    /** Waiting to arrive; see `arrivalEdge`. */
    armed: boolean
    /** Layout width in px, unscaled, from the observer. */
    labelWidth: number
    /** Drawn last frame; `placeLabels` reads it for its hysteresis. */
    labelShown: boolean
  }> = []
  private readonly anchor = new THREE.Vector3()
  /** The bar's width in px, from the observer; 0 until it first reports. */
  private barWidth = 0
  /** Absent where the platform has none (the unit tier's jsdom). */
  private readonly sizes: ResizeObserver | null
  /**
   * Read once: the pulse is a WAAPI animation, which the stylesheet's
   * reduced-motion block cannot reach.
   */
  private readonly reducedMotion: boolean
  private visible = false

  constructor(parent: HTMLElement, pois: readonly CompassPoi[]) {
    this.reducedMotion = prefersReducedMotion()

    this.root = document.createElement('div')
    this.root.className = 'murcia-compass'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.dataset.visible = 'false'

    // The bar: a hairline lens, thickest in the middle and tapering to a point
    // at both ends, feathered to nothing toward them. Stretched along its
    // length only (`preserveAspectRatio="none"`), so it keeps its thickness at
    // every width.
    //
    // The gradient is in USER units across the bar's width, not the default
    // bounding-box units: the ticks below take the same fade, and a
    // bounding-box gradient does not paint on a vertical line at all — its box
    // has no width to map the gradient onto. The lens looks the same either way.
    const gradientId = `murcia-compass-fade-${++gradientSeq}`
    const line = svgBox(BAR_VIEWBOX_W, BAR_VIEWBOX_H, 'murcia-compass__line')
    line.setAttribute('preserveAspectRatio', 'none')
    const defs = document.createElementNS(SVG_NS, 'defs')
    const gradient = document.createElementNS(SVG_NS, 'linearGradient')
    gradient.setAttribute('id', gradientId)
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse')
    gradient.setAttribute('x1', '0')
    gradient.setAttribute('x2', String(BAR_VIEWBOX_W))
    gradient.setAttribute('y1', '0')
    gradient.setAttribute('y2', '0')
    for (const [offset, alpha] of [
      [0, BAR_ALPHA_EDGE],
      [0.5, BAR_ALPHA_CENTRE],
      [1, BAR_ALPHA_EDGE],
    ] as const) {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', String(offset))
      stop.setAttribute('stop-color', 'currentColor')
      stop.setAttribute('stop-opacity', String(alpha))
      gradient.append(stop)
    }
    defs.append(gradient)
    line.append(
      defs,
      svgPath(
        lensPath(BAR_VIEWBOX_W, BAR_VIEWBOX_H, BAR_CENTRE_THICKNESS, BAR_EDGE_THICKNESS, false),
        `url(#${gradientId})`,
      ),
    )
    this.line = line
    this.root.append(line)

    // The calibration: a hairline every 15° above the bar, longer at ±45° and
    // ±90°, in the bar's own fade so the ends go quiet together. None at 0° —
    // the forward needle is that mark. Above rather than below, because below is
    // where the pins hang. Strokes with `non-scaling-stroke`, since this box is
    // stretched like the bar's and a tick has to stay one pixel at every width.
    const ticks = svgBox(BAR_VIEWBOX_W, TICKS_VIEWBOX_H, 'murcia-compass__ticks')
    ticks.setAttribute('preserveAspectRatio', 'none')
    const tickCount = SPAN_DEGREES / TICK_STEP_DEGREES
    for (let i = 0; i <= tickCount; i++) {
      if (i * 2 === tickCount) continue
      const x = String((i / tickCount) * BAR_VIEWBOX_W)
      const long = i % (tickCount / 4) === 0
      const tick = document.createElementNS(SVG_NS, 'line')
      tick.setAttribute('x1', x)
      tick.setAttribute('x2', x)
      tick.setAttribute('y1', String(TICKS_VIEWBOX_H))
      tick.setAttribute('y2', String(TICKS_VIEWBOX_H - (long ? TICK_LONG : TICK_SHORT)))
      tick.setAttribute('stroke', `url(#${gradientId})`)
      tick.setAttribute('stroke-width', '1')
      tick.setAttribute('vector-effect', 'non-scaling-stroke')
      ticks.append(tick)
    }
    this.root.append(ticks)

    // The forward needle: where the camera is actually pointing. A lens stood
    // on end on the bar, at full strength — it never moves, and it is what the
    // moving pins are read against. murcia.css places it.
    const forward = svgBox(FORWARD_VIEWBOX_W, FORWARD_VIEWBOX_H, 'murcia-compass__forward')
    forward.append(
      svgPath(lensPath(FORWARD_VIEWBOX_H, FORWARD_VIEWBOX_W, FORWARD_THICKNESS, 0, true), 'currentColor'),
    )
    this.root.append(forward)

    for (const poi of pois) {
      const el = document.createElement('div')
      el.className = 'murcia-compass__mark'
      el.dataset.poi = poi.id

      // A geo tag: the one icon a viewer already reads as "a place, there".
      // `currentColor`, so arriving brightens the pin and the label in one
      // write; `evenodd` is what makes the hole a hole.
      const pin = svgBox(PIN_VIEWBOX_W, PIN_VIEWBOX_H, 'murcia-compass__pin')
      pin.append(svgPath(pinPath(PIN_VIEWBOX_W, PIN_VIEWBOX_H, PIN_HOLE_RADIUS), 'currentColor', true))

      const label = document.createElement('span')
      label.className = 'murcia-compass__label'
      label.textContent = poi.label

      // The arrival ring: a circle on the pin's head that is invisible until
      // `update` fires it once. Animated from JS because it is a one-shot on an
      // event, not a state the CSS could transition to.
      const pulse = document.createElement('span')
      pulse.className = 'murcia-compass__pulse'

      el.append(pin, label, pulse)
      this.root.append(el)
      this.marks.push({ poi, el, label, pulse, armed: true, labelWidth: 0, labelShown: true })
    }

    this.sizes =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const width = entry.contentRect.width
              if (entry.target === this.line) {
                this.barWidth = width
                continue
              }
              const mark = this.marks.find((m) => m.label === entry.target)
              if (mark) mark.labelWidth = width
            }
          })
        : null
    this.sizes?.observe(this.line)
    for (const mark of this.marks) this.sizes?.observe(mark.label)

    parent.append(this.root)
  }

  /**
   * Hidden while a cinematic owns the camera.
   *
   * The bearings are still true during a warp, and they are meaningless: the
   * viewer is not navigating, and a bar sweeping wildly as the camera flies
   * would read as the instrument breaking. It sits below the flash in z-order,
   * so the cut covers its disappearance either way.
   */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.root.dataset.visible = visible ? 'true' : 'false'
  }

  update(camera: THREE.Camera): void {
    if (!this.visible) return

    camera.updateMatrixWorld()
    // The camera's forward, flattened to the ground plane. Taken from the world
    // matrix's third basis column rather than from a Vector3 transformed per
    // frame: the columns ARE the basis, so this is a read rather than a rotate.
    const e = camera.matrixWorld.elements
    const forwardX = -e[8]
    const forwardZ = -e[10]

    let warmest = -1
    let warmestEl: HTMLDivElement | null = null
    const labels: LabelInput[] = []

    for (const mark of this.marks) {
      const target = mark.poi.anchor(this.anchor)
      const toX = target.x - camera.position.x
      const toZ = target.z - camera.position.z

      const bearing = horizontalBearing(forwardX, forwardZ, toX, toZ)
      const { offset } = compassMark(bearing, SPAN_DEGREES * DEG)

      const groundDistance = Math.hypot(toX, toZ)
      const warmth =
        centreCloseness(offset, CENTRE_BAND_HALF_WIDTH) *
        rangeCloseness(groundDistance, PROXIMITY_NEAR, PROXIMITY_FAR)
      const labelScale = 1 + warmth * (LABEL_ARRIVAL_SCALE - 1)

      // Percentage rather than pixels, so the bar can be any width the CSS wants
      // it to be at any breakpoint and this never has to measure it. The lab's
      // version computed a width in JS and got it wrong, because the bar is
      // built hidden and `getBoundingClientRect` returned zero.
      mark.el.style.setProperty('--offset', `${(offset * 50).toFixed(3)}%`)
      mark.el.style.setProperty('--warmth', warmth.toFixed(4))
      mark.el.style.setProperty('--label-scale', labelScale.toFixed(4))
      mark.el.style.setProperty(
        '--fade',
        edgeFadeOpacity(offset, EDGE_FADE_START, EDGE_MIN_OPACITY).toFixed(4),
      )

      labels.push({
        x: (offset * this.barWidth) / 2,
        width: mark.labelWidth * labelScale,
        // Arrival first; nearer the centre breaks a tie between two cold labels.
        priority: warmth + 0.001 * (1 - Math.abs(offset)),
        shown: mark.labelShown,
      })

      // One ring per arrival. The edge is tracked even under reduced motion,
      // so turning the setting off mid-session does not fire a stale arrival.
      const edge = arrivalEdge(mark.armed, warmth, ARRIVAL_ON, ARRIVAL_OFF)
      mark.armed = edge.armed
      if (edge.fire && !this.reducedMotion) {
        mark.pulse.animate(
          [
            { transform: 'scale(1)', opacity: 0.8 },
            { transform: 'scale(3.2)', opacity: 0 },
          ],
          { duration: PULSE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
      }

      if (warmth > warmest) {
        warmest = warmth
        warmestEl = mark.el
      }
    }

    // Unmeasured (no observer, or before its first report) every label would
    // sit at x 0 with width 0 and collide with every other; draw them as they
    // are rather than hide all but one.
    if (this.barWidth > 0) {
      const placements = placeLabels(labels, {
        halfSpan: this.barWidth / 2,
        gap: LABEL_GAP,
        reenterGap: LABEL_REENTER_GAP,
        stickiness: LABEL_STICKINESS,
      })
      this.marks.forEach((mark, i) => {
        const { shift, shown } = placements[i]
        mark.label.style.setProperty('--label-shift', `${shift.toFixed(1)}px`)
        if (shown !== mark.labelShown) {
          mark.labelShown = shown
          mark.label.toggleAttribute('data-hidden', !shown)
        }
      })
    }

    // The warmer of two overlapping marks reads on top. Without this the one
    // that happens to be later in the DOM wins, which is a different landmark
    // depending on which way the viewer turned.
    for (const mark of this.marks) {
      mark.el.style.zIndex = mark.el === warmestEl ? '2' : '1'
    }
  }

  dispose(): void {
    this.sizes?.disconnect()
    this.root.remove()
    this.marks.length = 0
  }
}
