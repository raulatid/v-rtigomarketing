import * as THREE from 'three'
import { clamp01, easeInOutCubic } from '../utils/easing'
import type { CornerLogoConfig } from './cornerLogoConfig'

const STATES = {
  HIDDEN: 'hidden',
  SPINNING: 'spinning',
  TO_CORNER: 'toCorner',
  IDLE: 'idle',
} as const

type State = (typeof STATES)[keyof typeof STATES]

const IDLE_ROTATION_SPEED = 0.15 // rad/s
const IDLE_FLOAT_AMPLITUDE = 0.035
const IDLE_FLOAT_FREQUENCY = 0.8 // Hz

/** One full turn. The spin's total, and the resting rotation it settles at. */
const SPIN_TOTAL_RAD = Math.PI * 2

/**
 * Where the header's line is, in CSS px, as measured off the DOM.
 *
 * The header (components/siteHeader.css) is the single owner of these numbers;
 * CornerLogoLayer measures `.site-header__row` and pushes the result here, so
 * the logo and the buttons cannot drift apart the way two copies did (the
 * old `cornerMarginX/Y` config placed the logo's CENTRE 48px in while CSS put
 * the buttons' EDGE 48px in, and on a phone the buttons moved and the logo did
 * not).
 */
export interface CornerMetrics {
  /** The logo box's left edge, px from the viewport's left. */
  insetLeftPx: number
  /** The line's vertical centre, px from the viewport's top. */
  centerYPx: number
  /** The logo box's height at rest — the buttons' height. */
  heightPx: number
}

/** The desktop header's numbers, used until the DOM has been measured. */
export const DEFAULT_CORNER_METRICS: CornerMetrics = {
  insetLeftPx: 48,
  centerYPx: 48,
  heightPx: 46,
}

export interface LogoMotion {
  /** Begins the reveal: bloom up from zero, spin, fly to the corner, idle. */
  start(): void
  /** Straight to the idle corner pose, skipping the spin and the flight. */
  snapToCorner(): void
  update(delta: number): void
  reset(): void
  /** False only while hidden — nothing to draw and no clock to advance. */
  isVisible(): boolean
  /** The model's bounding box at scale 1, from assembly. Anchors the box's edge. */
  setModelSize(size: THREE.Vector3): void
  /** Where the header's line is. Re-read per frame while idling, so a resize
   *  that re-measures re-anchors the logo without any other notice. */
  setCornerMetrics(metrics: CornerMetrics): void
  /**
   * The height, in CSS px, of the surface being rendered into.
   *
   * The pixel→world mapping needs the height of the RENDER TARGET, and for the
   * scene that is the window — which is why this was `window.innerHeight` read
   * inline. The blog header draws the same logo into a canvas a few dozen
   * pixels tall (BlogHeaderLogo), where that global is wrong by two orders of
   * magnitude: the model would be scaled ~30x and placed far off screen.
   *
   * Unset means `window.innerHeight`, so the scene is unchanged and the tests
   * that never call this still describe a full-viewport surface.
   */
  setSurfaceHeight(px: number): void
}

/** The frustum's half-extents at the model plane (z = 0), and the px->world scale. */
export interface FrustumExtents {
  halfW: number
  halfH: number
  /** World units per CSS pixel at z = 0. */
  perPx: number
}

/**
 * The ONE copy of this module's pixel->world mapping.
 *
 * Linear only because `cornerFramePadding` flattens the frustum toward
 * orthographic (extraction 001 §5) — with a normal frustum a pixel margin would
 * not be a constant world offset.
 *
 * Takes the surface height rather than reading `window` itself: which surface
 * is being drawn into is the caller's knowledge, and it is exactly the
 * distinction `setSurfaceHeight` exists to make. Pure, and exported because the
 * header's other corner needs the same mapping — `headerBurger.ts` places the
 * phone burger's bars with it, anchored to the right instead of the left.
 */
export function frustumExtents(
  camera: THREE.PerspectiveCamera,
  surfaceHeightPx: number,
): FrustumExtents {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
  return { halfH, halfW: halfH * camera.aspect, perPx: (2 * halfH) / surfaceHeightPx }
}

/**
 * The logo's four-state reveal: hidden -> spinning -> flying -> idling.
 *
 * Split out of createCornerLogo because it is the half with no I/O in it. It
 * reads a config, a group and a camera, and writes a transform — no loaders, no
 * renderer, no promises, nothing that can fail. That was hard to see while it
 * shared a 314-line closure with two async loads, a GPU warm-up and a
 * cancellation flag.
 *
 * The camera is read, never written: `computeCornerTarget` needs the framing
 * distance to turn a pixel margin into a world offset, and that distance is
 * `camera.position.z` — the caller places the camera there during assembly and
 * nothing moves it afterwards. The previous version kept a separate
 * `framedDistance` variable and fell back to `camera.position.z` when it was
 * zero; the two were always the same number, because they are assigned from
 * each other on the same line.
 */
export function createLogoMotion(
  config: CornerLogoConfig,
  modelGroup: THREE.Group,
  camera: THREE.PerspectiveCamera,
): LogoMotion {
  let state: State = STATES.HIDDEN
  let stateT = 0
  const idle = { rotY: 0, elapsed: 0 }
  const cornerTarget = new THREE.Vector3()
  const modelSize = new THREE.Vector3()
  let metrics: CornerMetrics = DEFAULT_CORNER_METRICS
  /** Null until a caller supplies one — see `setSurfaceHeight`. */
  let surfaceHeightPx: number | null = null

  // This module owns the group's visibility on every other transition — start()
  // shows it, reset() hides it — so it owns the initial state too. It used to
  // be set by the caller immediately before construction, which meant the
  // machine was only in a consistent HIDDEN state if the caller remembered a
  // line that looked like scene setup (PRINCIPLES §10).
  modelGroup.visible = false

  // ─── Screen-position math (world units at the model plane, z = 0) ───

  /**
   * World units per CSS pixel at z = 0.
   *
   * Divides by the SURFACE's height, not the window's. The two are the same
   * number for the scene canvas and nothing else — see `setSurfaceHeight`.
   */
  function worldPerPx(): number {
    return frustumExtents(camera, surfaceHeightPx ?? window.innerHeight).perPx
  }

  /**
   * The scale that makes the model's box exactly `heightPx` tall on screen.
   *
   * At scale 1 the model's height is `innerHeight / cornerFramePadding` px —
   * the size the crossover needs it to be at screen centre, and the reason the
   * corner logo used to grow with the window while the buttons did not. Until
   * the model is measured (size zero) the scale is 1, so the machine is still
   * pure arithmetic in a test that never assembles a GLB.
   */
  function cornerScale(): number {
    if (modelSize.y <= 0) return 1
    return (metrics.heightPx * worldPerPx()) / modelSize.y
  }

  /**
   * Where the corner is, in world units at z = 0.
   *
   * The model is recentred on its bounding-box centre at assembly, so the box's
   * left edge is half its (scaled) width left of the target. The mapping is
   * linear only because the framing padding flattens the frustum toward
   * orthographic (extraction 001 §5) — with a normal frustum a pixel margin
   * would not be a constant world offset.
   *
   * Recomputed on every frame that uses it, so a resize re-anchors the logo
   * without anything having to notice the resize.
   */
  function computeCornerTarget(target: THREE.Vector3): THREE.Vector3 {
    const { halfW, halfH, perPx } = frustumExtents(camera, surfaceHeightPx ?? window.innerHeight)
    return target.set(
      -halfW + metrics.insetLeftPx * perPx + (cornerScale() * modelSize.x) / 2,
      halfH - metrics.centerYPx * perPx,
      0,
    )
  }

  return {
    start() {
      if (state !== STATES.HIDDEN) return
      modelGroup.visible = true
      modelGroup.scale.setScalar(0)
      state = STATES.SPINNING
      stateT = 0
    },

    snapToCorner() {
      modelGroup.visible = true
      modelGroup.scale.setScalar(cornerScale())
      modelGroup.rotation.y = SPIN_TOTAL_RAD
      idle.rotY = SPIN_TOTAL_RAD
      idle.elapsed = 0
      computeCornerTarget(cornerTarget)
      modelGroup.position.copy(cornerTarget)
      state = STATES.IDLE
    },

    update(delta: number) {
      stateT += delta

      if (state === STATES.SPINNING) {
        // Bloom up from zero as the 2D mark collapses to zero — the crossover
        // that replaces the particle burst (plan 002 §6.1). power2.out.
        const bloomT = clamp01(stateT / (config.swapDuration * (1 - config.swapCrossover)))
        modelGroup.scale.setScalar(1 - (1 - bloomT) * (1 - bloomT))

        const t = clamp01(Math.max(stateT - config.spinPauseBefore, 0) / config.spinDuration)
        modelGroup.rotation.y = easeInOutCubic(t) * SPIN_TOTAL_RAD
        if (t >= 1) {
          modelGroup.rotation.y = SPIN_TOTAL_RAD
          modelGroup.scale.setScalar(1)
          state = STATES.TO_CORNER
          stateT = 0
        }
      } else if (state === STATES.TO_CORNER) {
        // Position and size travel together: the centre-stage size was the
        // crossover's, the corner's is the header's, and the flight is where
        // one becomes the other.
        const eased = easeInOutCubic(clamp01(stateT / config.toCornerDuration))
        computeCornerTarget(cornerTarget)
        modelGroup.position.set(cornerTarget.x * eased, cornerTarget.y * eased, 0)
        modelGroup.scale.setScalar(1 + (cornerScale() - 1) * eased)
        if (stateT >= config.toCornerDuration) {
          modelGroup.position.copy(cornerTarget)
          modelGroup.scale.setScalar(cornerScale())
          idle.rotY = SPIN_TOTAL_RAD
          idle.elapsed = 0
          state = STATES.IDLE
        }
      } else if (state === STATES.IDLE) {
        idle.elapsed += delta
        idle.rotY += delta * IDLE_ROTATION_SPEED
        modelGroup.rotation.y = idle.rotY
        const float =
          Math.sin(2 * Math.PI * IDLE_FLOAT_FREQUENCY * idle.elapsed) * IDLE_FLOAT_AMPLITUDE
        // Recomputed each frame so a resize re-anchors the corner automatically.
        computeCornerTarget(cornerTarget)
        modelGroup.position.set(cornerTarget.x, cornerTarget.y + float, 0)
        modelGroup.scale.setScalar(cornerScale())
      }
    },

    reset() {
      state = STATES.HIDDEN
      stateT = 0
      modelGroup.visible = false
      modelGroup.position.set(0, 0, 0)
      modelGroup.rotation.set(0, 0, 0)
      modelGroup.scale.setScalar(0)
    },

    isVisible() {
      return state !== STATES.HIDDEN
    },

    setModelSize(size) {
      modelSize.copy(size)
    },

    setCornerMetrics(next) {
      metrics = next
    },

    setSurfaceHeight(px) {
      // A zero-height surface is a measurement that has not happened yet (a
      // display:none ancestor, a ResizeObserver's first callback). Keeping the
      // previous basis is right: dividing by it would make every world offset
      // infinite.
      if (px > 0) surfaceHeightPx = px
    },
  }
}
