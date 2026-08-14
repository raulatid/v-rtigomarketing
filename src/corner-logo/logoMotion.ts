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

export interface LogoMotion {
  /** Begins the reveal: bloom up from zero, spin, fly to the corner, idle. */
  start(): void
  /** Straight to the idle corner pose, skipping the spin and the flight. */
  snapToCorner(): void
  update(delta: number): void
  reset(): void
  /** False only while hidden — nothing to draw and no clock to advance. */
  isVisible(): boolean
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

  // This module owns the group's visibility on every other transition — start()
  // shows it, reset() hides it — so it owns the initial state too. It used to
  // be set by the caller immediately before construction, which meant the
  // machine was only in a consistent HIDDEN state if the caller remembered a
  // line that looked like scene setup (PRINCIPLES §10).
  modelGroup.visible = false

  // ─── Screen-position math (world units at the model plane, z = 0) ───

  /**
   * Where the top-left corner is, in world units at z = 0.
   *
   * The mapping is linear only because the framing padding flattens the frustum
   * toward orthographic (extraction 001 §5) — with a normal frustum a pixel
   * margin would not be a constant world offset.
   *
   * Recomputed on every frame that uses it, so a resize re-anchors the logo
   * without anything having to notice the resize.
   */
  function computeCornerTarget(target: THREE.Vector3): THREE.Vector3 {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
    const halfW = halfH * camera.aspect
    return target.set(
      halfW * (-1 + (2 * config.cornerMarginX) / window.innerWidth),
      halfH * (1 - (2 * config.cornerMarginY) / window.innerHeight),
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
      modelGroup.scale.setScalar(1)
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
        const eased = easeInOutCubic(clamp01(stateT / config.toCornerDuration))
        computeCornerTarget(cornerTarget)
        modelGroup.position.set(cornerTarget.x * eased, cornerTarget.y * eased, 0)
        if (stateT >= config.toCornerDuration) {
          modelGroup.position.copy(cornerTarget)
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
  }
}
