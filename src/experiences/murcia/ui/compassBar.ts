import * as THREE from 'three'
import {
  centreCloseness,
  compassMark,
  edgeFadeOpacity,
  horizontalBearing,
  rangeCloseness,
} from '../../../utils/compass'

/**
 * A hairline that says which way the places worth clicking are.
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
 * A landmark goes from the resting hairline colour to the warm one only when it
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

    const line = document.createElement('div')
    line.className = 'murcia-compass__line'
    this.root.append(line)

    // The forward mark: where the camera is actually pointing. Furniture rather
    // than reading — it never moves, and it is what gives the moving pins
    // something to be measured against.
    const forward = document.createElement('div')
    forward.className = 'murcia-compass__forward'
    this.root.append(forward)

    for (const poi of pois) {
      const el = document.createElement('div')
      el.className = 'murcia-compass__mark'
      el.dataset.poi = poi.id

      const pin = document.createElement('span')
      pin.className = 'murcia-compass__pin'

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
