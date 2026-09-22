import { prefersReducedMotion } from '../../../platform/motionPreference'
import * as THREE from 'three'
import { type ElementRect, projectToClient, worldToClient } from '../../../interaction/screenSpace'
import {
  horizontalBearing,
  labelSide,
  proximityPulse,
  rangeCloseness,
  ringSlot,
  screenBearing,
  spreadBearings,
  stackLabels,
} from '../../../utils/compass'

/**
 * A compass round the pointer: which way the places worth clicking are.
 *
 * ## Why it is on the cursor
 *
 * Its predecessor was a bar under the header with a pin per place (2026-09-10
 * to 09-22, DECISIONS §44). Viewers did not read it: an instrument at the edge
 * of the frame was furniture, and nothing said which of the buildings under it
 * could be touched. So the instrument is now where the viewer is already
 * looking — a ring that follows the pointer, with one ARROWHEAD and one word
 * per place standing just off its rim at that place's bearing, so the ring
 * itself says "there, and there". On arrival from Earth each mark is born ON its
 * building on screen and travels to the ring, which is the one moment the
 * link between a word and a building is drawn rather than implied.
 *
 * ## Not a control
 *
 * `pointer-events: none` and `aria-hidden`, both load-bearing: `adr/009`'s
 * direction is that navigation is a gesture and parallel controls get deleted.
 * `DistrictA11y` is the real focusable route. A ring that moved with the
 * pointer could not be pressed anyway — moving toward a mark moves the mark.
 *
 * ## Screen space, because that is what the viewer sees
 *
 * A mark points from the ring to where its building IS ON SCREEN
 * (`projectToClient`, then `screenBearing`): the blog to the left of the cursor
 * gets an arrow pointing left. Moving the pointer turns the arrows, and so does
 * turning the camera, because both move the building relative to the ring —
 * the one frame of reference a viewer holds without thinking. The first version
 * (same day) drew the camera's ground bearing instead, which could point right
 * while the building sat visibly to the left of the pointer. A building that
 * has slid off the side is still projected and still pointed at; only one
 * behind the camera, which projects mirrored, falls back to the ground bearing
 * (`utils/compass.ts` explains that maths). Under the ring the direction is
 * undefined and would spin, so within `MARK_RADIUS` a mark holds its last one.
 *
 * ## Near is near on screen
 *
 * A mark warms with the distance in px between the ring and its building on
 * screen, as fractions of the canvas's shorter side so a phone and a monitor
 * agree. The warmth is handed to the building as well (`proximity`), scaled by
 * a slow blink, so the building and its mark say "this one" together; a hover
 * still outweighs it (`buildingHighlight.ts`).
 *
 * ## One ring, two pointers
 *
 * On a fine pointer the site's global cursor already draws a ring
 * (`CustomCursor.tsx`); this one hides it with a class on `<html>` while it is
 * showing, the way that cursor announces itself, so there is one circle. On a
 * coarse pointer there is no global cursor at all: the ring is born at the
 * centre of the canvas on arrival, so a viewer sees it before touching
 * anything, and from the first touch it follows the finger and stays where the
 * finger left it.
 */

/** One place the compass can point at. */
export interface CursorCompassLandmark {
  /** Stable, and used as the mark's `data-poi` for tests. */
  readonly id: string
  /** Where it is, in world space. Written into `out` and returned. */
  readonly anchor: (out: THREE.Vector3) => THREE.Vector3
  readonly label: string
  /**
   * How near the viewer is, 0..1 with the blink already applied; 0 whenever the
   * ring hides, so nothing keeps blinking inside the campus or the blog approach.
   */
  readonly proximity?: (strength: number) => void
}

/** The global cursor's trail (`CustomCursor.tsx`), so the two rings move alike. */
const FOLLOW_RATE = 13

/**
 * Where a mark's arrowhead stands: the ring's radius (murcia.css `--ring`, 56px
 * across) plus a gap, so the point never touches the circle.
 */
const MARK_RADIUS = 28 + 9
/** The least angle between two arrowheads: about one arrowhead's width at that radius. */
const MIN_SEPARATION = (12 * Math.PI) / 180
/**
 * The least vertical clearance between two words on the same side, in px:
 * a word's plate (murcia.css, about 22px tall on a desktop) plus a hairline of air.
 */
const LABEL_MIN_GAP = 26

/**
 * Screen distances at which a place reads as near and as far, as fractions of
 * the canvas's shorter side: about 72px and 240px on a 600px-tall canvas. The
 * knobs for the visual pass.
 */
const NEAR_FRACTION = 0.12
const FAR_FRACTION = 0.4
/** Warmth a mark rises through to read as near, and falls below to stop. */
const NEAR_ON = 0.55
const NEAR_OFF = 0.4
/** The blink handed to a near building: seconds per cycle, and its darkest. */
const PULSE_PERIOD = 1.6
const PULSE_FLOOR = 0.35

/** The arrival: a mark's travel from its building to the ring, and the fade for one off screen. */
const TRAVEL_MS = 800
const FADE_MS = 420
const TRAVEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** On `<html>` while the ring shows; styles.css hides the global cursor's ring under it. */
const PAGE_CLASS = 'has-cursor-compass'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The arrowhead, drawn pointing UP in its own box; `ringSlot`'s angle turns it outward. */
const ARROW_VIEWBOX = 10
const ARROW_PATH = 'M5 0.5 L9.5 8.5 L5 6.2 L0.5 8.5 Z'

interface Mark {
  readonly landmark: CursorCompassLandmark
  readonly el: HTMLDivElement
  readonly travel: HTMLSpanElement
  readonly label: HTMLSpanElement
  /** Its slot this frame, in px from the ring's centre; what the arrival travels to. */
  x: number
  y: number
  /** Its last defined direction, held while the ring sits on the building. */
  angle: number
  near: boolean
  side: 'left' | 'right' | ''
}

export class CursorCompass {
  private readonly root: HTMLDivElement
  private readonly canvas: HTMLElement
  private readonly marks: Mark[] = []
  private readonly anchor = new THREE.Vector3()
  private readonly projected = new THREE.Vector3()
  private readonly reducedMotion: boolean
  /** Whether the global cursor exists here (its own test, `CustomCursor.tsx`). */
  private readonly finePointer: boolean
  /**
   * The canvas's box, read once and again on resize, never per frame: the
   * projection needs it every frame, and a layout read there is the one cost
   * this instrument must not have. Absent where the platform has no observer
   * (the unit tier's jsdom), the first read stands.
   */
  private rect: ElementRect
  private readonly sizes: ResizeObserver | null

  private targetX = 0
  private targetY = 0
  private followX = 0
  private followY = 0
  /** A pointer has been seen, or arrival has placed the ring: the follow is real. */
  private seen = false
  private visible = false
  /** Seconds while showing: the blink's clock. */
  private clock = 0

  constructor(parent: HTMLElement, canvas: HTMLElement, landmarks: readonly CursorCompassLandmark[]) {
    this.canvas = canvas
    this.reducedMotion = prefersReducedMotion()
    this.finePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches

    this.root = document.createElement('div')
    this.root.className = 'murcia-cursor-compass'
    this.root.setAttribute('aria-hidden', 'true')
    this.root.dataset.visible = 'false'

    const ring = document.createElement('div')
    ring.className = 'murcia-cursor-compass__ring'
    this.root.append(ring)

    for (const landmark of landmarks) {
      const el = document.createElement('div')
      el.className = 'murcia-cursor-compass__mark'
      el.dataset.poi = landmark.id

      // The arrival animates this inner span, never the mark: the mark's
      // transform is written every frame from the bearing, and an animation on
      // the same element would fight it. A residual offset on the child rides
      // the slot wherever it goes and lands docked without a snap.
      const travel = document.createElement('span')
      travel.className = 'murcia-cursor-compass__travel'

      const arrow = document.createElementNS(SVG_NS, 'svg')
      arrow.setAttribute('viewBox', `0 0 ${ARROW_VIEWBOX} ${ARROW_VIEWBOX}`)
      arrow.setAttribute('class', 'murcia-cursor-compass__arrow')
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', ARROW_PATH)
      path.setAttribute('fill', 'currentColor')
      arrow.append(path)

      const label = document.createElement('span')
      label.className = 'murcia-cursor-compass__label'
      label.textContent = landmark.label

      travel.append(arrow, label)
      el.append(travel)
      this.root.append(el)
      this.marks.push({ landmark, el, travel, label, x: 0, y: 0, angle: 0, near: false, side: '' })
    }

    this.rect = canvas.getBoundingClientRect()
    this.sizes =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            this.rect = canvas.getBoundingClientRect()
          })
        : null
    this.sizes?.observe(canvas)

    // Moves and presses alike, and only the primary pointer: a mouse is its
    // moves, a finger is its press and the moves that follow, and the second
    // finger of a pinch is not the viewer's hand.
    window.addEventListener('pointermove', this.onPointer, { passive: true })
    window.addEventListener('pointerdown', this.onPointer, { passive: true })

    parent.append(this.root)
  }

  private readonly onPointer = (event: PointerEvent): void => {
    if (!event.isPrimary) return
    this.targetX = event.clientX
    this.targetY = event.clientY
    if (!this.seen) {
      // First sighting: the ring appears AT the pointer, not sliding in from a corner.
      this.seen = true
      this.followX = this.targetX
      this.followY = this.targetY
    }
  }

  /**
   * Hidden while a cinematic owns the camera, and inside the campus.
   *
   * The bearings are still true during a warp, and they are meaningless: the
   * viewer is not navigating, and marks sweeping round the ring as the camera
   * flies would read as the instrument breaking. Hiding also stands every
   * building down, since `update` stops writing to them.
   */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.root.dataset.visible = visible ? 'true' : 'false'
    document.documentElement.classList.toggle(PAGE_CLASS, visible)
    if (!visible) {
      for (const mark of this.marks) mark.landmark.proximity?.(0)
    }
  }

  /**
   * The landing from Earth: each mark is born on its building and travels to
   * the ring.
   *
   * Under reduced motion the marks simply appear docked, with the ring's fade.
   * A building off screen has nowhere to be born, so its mark fades in docked
   * too. jsdom has no `animate`, and the guard is what its tests exercise.
   */
  arrive(camera: THREE.Camera): void {
    // A one-off read at a moment that is already a cut, so the travel starts
    // from the box the buildings are actually drawn in.
    const rect = (this.rect = this.canvas.getBoundingClientRect())
    if (!this.finePointer || !this.seen) {
      // No pointer to follow yet: the centre of the canvas, so a viewer sees
      // the instrument before they have touched anything.
      this.seen = true
      this.targetX = rect.left + rect.width / 2
      this.targetY = rect.top + rect.height / 2
    }
    // Wherever the pointer is NOW, not wherever the trail was left when the ring
    // last showed.
    this.followX = this.targetX
    this.followY = this.targetY
    this.root.style.transform = `translate3d(${this.followX}px, ${this.followY}px, 0)`
    this.layout(camera)

    if (this.reducedMotion) return
    for (const mark of this.marks) {
      if (typeof mark.travel.animate !== 'function') return
      const target = mark.landmark.anchor(this.anchor)
      const point = worldToClient(rect, camera, target, this.projected)
      if (point === null) {
        mark.travel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: TRAVEL_EASING })
        continue
      }
      const dx = point.x - this.followX - mark.x
      const dy = point.y - this.followY - mark.y
      mark.travel.animate(
        [
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, opacity: 0.6 },
          { transform: 'translate(0px, 0px)', opacity: 1 },
        ],
        { duration: TRAVEL_MS, easing: TRAVEL_EASING },
      )
    }
  }

  /** After whichever owner wrote the camera's pose this frame, so the marks never lag the city. */
  update(camera: THREE.Camera, dt: number): void {
    if (!this.visible) return
    this.clock += dt

    // The global cursor's trail, so the two rings move as one: applied as
    // 1 - exp(-RATE * dt) so the feel is the same at 60Hz and 144Hz. Reduced
    // motion snaps, as that cursor does.
    const f = this.reducedMotion ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt)
    this.followX += (this.targetX - this.followX) * f
    this.followY += (this.targetY - this.followY) * f
    this.root.style.transform = `translate3d(${this.followX}px, ${this.followY}px, 0)`

    this.layout(camera)
  }

  /** The marks' slots and warmth for this camera pose and ring position; what `update` and `arrive` share. */
  private layout(camera: THREE.Camera): void {
    camera.updateMatrixWorld()
    const rect = this.rect
    const shorter = Math.min(rect.width, rect.height)
    const nearPx = NEAR_FRACTION * shorter
    const farPx = FAR_FRACTION * shorter

    const bearings: number[] = []
    const warmths: number[] = []
    for (const mark of this.marks) {
      const target = mark.landmark.anchor(this.anchor)
      const point = projectToClient(rect, camera, target, this.projected)
      if (point === null) {
        // Behind the camera: no place on screen to point at, so the ground
        // bearing from the camera's forward, flattened to x/z. Taken from the
        // world matrix's third basis column rather than from a Vector3
        // transformed per frame: the columns ARE the basis.
        const e = camera.matrixWorld.elements
        mark.angle = horizontalBearing(
          -e[8],
          -e[10],
          target.x - camera.position.x,
          target.z - camera.position.z,
        )
        bearings.push(mark.angle)
        warmths.push(0)
        continue
      }
      const dx = point.x - this.followX
      const dy = point.y - this.followY
      const distance = Math.hypot(dx, dy)
      // Under the ring the direction is undefined and would spin: hold the last.
      if (distance >= MARK_RADIUS) mark.angle = screenBearing(dx, dy)
      bearings.push(mark.angle)
      warmths.push(rangeCloseness(distance, nearPx, farPx))
    }

    const spread = spreadBearings(bearings, MIN_SEPARATION)
    const sides = spread.map(labelSide)
    const slots = spread.map((bearing) => ringSlot(bearing, MARK_RADIUS))
    const lifts = stackLabels(
      slots.map((slot, i) => ({ side: sides[i], y: slot.y })),
      LABEL_MIN_GAP,
    )
    const pulse = this.reducedMotion ? 1 : proximityPulse(this.clock, PULSE_PERIOD, PULSE_FLOOR)

    let warmest = -1
    let warmestEl: HTMLDivElement | null = null
    this.marks.forEach((mark, i) => {
      const slot = slots[i]
      const warmth = warmths[i]
      mark.x = slot.x
      mark.y = slot.y
      // Numbers only: the CSS draws them (murcia.css).
      mark.el.style.setProperty('--mx', `${slot.x.toFixed(1)}px`)
      mark.el.style.setProperty('--my', `${slot.y.toFixed(1)}px`)
      mark.el.style.setProperty('--angle', `${slot.angleDeg.toFixed(2)}deg`)
      mark.el.style.setProperty('--warmth', warmth.toFixed(4))
      mark.label.style.setProperty('--ly', `${lifts[i].toFixed(1)}px`)
      if (sides[i] !== mark.side) {
        mark.side = sides[i]
        mark.el.dataset.side = sides[i]
      }

      // Near is a state with a gap in it, for the reason every threshold read
      // per frame has one: warmth drifting across a single line would flicker
      // the vibration on and off.
      const near = mark.near ? warmth >= NEAR_OFF : warmth >= NEAR_ON
      if (near !== mark.near) {
        mark.near = near
        mark.el.toggleAttribute('data-near', near)
      }

      mark.landmark.proximity?.(warmth * pulse)

      if (warmth > warmest) {
        warmest = warmth
        warmestEl = mark.el
      }
    })

    // The warmer of two overlapping marks reads on top. Without this the one
    // that happens to be later in the DOM wins, which is a different landmark
    // depending on which way the viewer turned.
    for (const mark of this.marks) {
      mark.el.style.zIndex = mark.el === warmestEl ? '2' : '1'
    }
  }

  dispose(): void {
    this.sizes?.disconnect()
    window.removeEventListener('pointermove', this.onPointer)
    window.removeEventListener('pointerdown', this.onPointer)
    document.documentElement.classList.remove(PAGE_CLASS)
    this.root.remove()
    this.marks.length = 0
  }
}
