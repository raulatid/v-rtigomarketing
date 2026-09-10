import * as THREE from 'three'
import {
  centreCloseness,
  compassMark,
  edgeFadeOpacity,
  horizontalBearing,
  rangeCloseness,
} from '../../../utils/compass'

/**
 * An instrument that says which way the places worth clicking are.
 *
 * ## The lab's instrument
 *
 * The look is `vertigo-lab`'s camera-navigation compass (`demo/compassBar.ts`),
 * ported 2026-09-10. Blue is furniture — the lens-shaped bar and the forward
 * mark, always there and meaning nothing alone. White is a reading — the map
 * pins and their labels, the part that moves. Yellow is an arrival. The shapes
 * are its quadratic lenses and geo-tag pin, below. What is NOT the lab's is the
 * sizing: there it was computed in JS from a measured width, which read zero
 * while the bar was hidden; here the CSS sizes everything (murcia.css) and the
 * marks travel in percentages of the bar.
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
 * ## Warming, and why it takes two claims
 *
 * A landmark goes from white to yellow only when it
 * is BOTH near the centre of the bar and near in the world. Bearing alone is not
 * enough: a landmark can be dead ahead from across the whole plate, and being
 * pointed at something is not the same as having arrived at it. The two
 * closeness terms are multiplied, so both have to agree.
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
 * The shapes, in their own viewBox units — the lab's numbers. The CSS sizes
 * each box, so these fix proportions and nothing else.
 */
const BAR_VIEWBOX_W = 420
const BAR_VIEWBOX_H = 10
const BAR_CENTRE_THICKNESS = 5
const BAR_EDGE_THICKNESS = 0.6
const FORWARD_VIEWBOX_W = 13
const FORWARD_VIEWBOX_H = 36
const FORWARD_THICKNESS = 6.5
const PIN_VIEWBOX_W = 13
const PIN_VIEWBOX_H = 19
const PIN_HOLE_RADIUS = 2.7

/** The furniture's blue, faded toward the bar's ends rather than cut off. */
const BLUE = '28, 103, 255'
const BAR_ALPHA_CENTRE = 0.95
const BAR_ALPHA_EDGE = 0.1

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
  private readonly marks: Array<{ poi: CompassPoi; el: HTMLDivElement; label: HTMLSpanElement }> = []
  private readonly anchor = new THREE.Vector3()
  private visible = false

  constructor(parent: HTMLElement, pois: readonly CompassPoi[]) {
    this.root = document.createElement('div')
    this.root.className = 'murcia-compass'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.dataset.visible = 'false'

    // The bar: a lens, thickest in the middle and tapering to a point at both
    // ends, in a blue that fades toward them. Stretched along its length only
    // (`preserveAspectRatio="none"`), so it keeps its thickness at every width.
    const gradientId = `murcia-compass-fade-${++gradientSeq}`
    const line = svgBox(BAR_VIEWBOX_W, BAR_VIEWBOX_H, 'murcia-compass__line')
    line.setAttribute('preserveAspectRatio', 'none')
    const defs = document.createElementNS(SVG_NS, 'defs')
    const gradient = document.createElementNS(SVG_NS, 'linearGradient')
    gradient.setAttribute('id', gradientId)
    gradient.setAttribute('x1', '0')
    gradient.setAttribute('x2', '1')
    gradient.setAttribute('y1', '0')
    gradient.setAttribute('y2', '0')
    for (const [offset, alpha] of [
      [0, BAR_ALPHA_EDGE],
      [0.5, BAR_ALPHA_CENTRE],
      [1, BAR_ALPHA_EDGE],
    ] as const) {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', String(offset))
      stop.setAttribute('stop-color', `rgba(${BLUE}, ${alpha})`)
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
    this.root.append(line)

    // The forward mark: where the camera is actually pointing. The same lens
    // stood on end and drawn THROUGH the bar, blue with it because it is
    // furniture — it never moves, and it is what the moving pins are read
    // against.
    const forward = svgBox(FORWARD_VIEWBOX_W, FORWARD_VIEWBOX_H, 'murcia-compass__forward')
    forward.append(
      svgPath(lensPath(FORWARD_VIEWBOX_H, FORWARD_VIEWBOX_W, FORWARD_THICKNESS, 0, true), `rgb(${BLUE})`),
    )
    this.root.append(forward)

    for (const poi of pois) {
      const el = document.createElement('div')
      el.className = 'murcia-compass__mark'
      el.dataset.poi = poi.id

      // A geo tag: the one icon a viewer already reads as "a place, there".
      // `currentColor`, so warming the mark warms the pin and the label in one
      // write; `evenodd` is what makes the hole a hole.
      const pin = svgBox(PIN_VIEWBOX_W, PIN_VIEWBOX_H, 'murcia-compass__pin')
      pin.append(svgPath(pinPath(PIN_VIEWBOX_W, PIN_VIEWBOX_H, PIN_HOLE_RADIUS), 'currentColor', true))

      const label = document.createElement('span')
      label.className = 'murcia-compass__label'
      label.textContent = poi.label

      el.append(pin, label)
      this.root.append(el)
      this.marks.push({ poi, el, label })
    }

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

      // Percentage rather than pixels, so the bar can be any width the CSS wants
      // it to be at any breakpoint and this never has to measure it. The lab's
      // version computed a width in JS and got it wrong, because the bar is
      // built hidden and `getBoundingClientRect` returned zero.
      mark.el.style.setProperty('--offset', `${(offset * 50).toFixed(3)}%`)
      mark.el.style.setProperty('--warmth', warmth.toFixed(4))
      mark.el.style.setProperty(
        '--fade',
        edgeFadeOpacity(offset, EDGE_FADE_START, EDGE_MIN_OPACITY).toFixed(4),
      )

      if (warmth > warmest) {
        warmest = warmth
        warmestEl = mark.el
      }
    }

    // The warmer of two overlapping marks reads on top. Without this the one
    // that happens to be later in the DOM wins, which is a different landmark
    // depending on which way the viewer turned.
    for (const mark of this.marks) {
      mark.el.style.zIndex = mark.el === warmestEl ? '2' : '1'
    }
  }

  dispose(): void {
    this.root.remove()
    this.marks.length = 0
  }
}
