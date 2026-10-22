// P1-P5 on a clock the frame loop steps (ADR 016, migration step 4).
//
// The opening machine owns which phase this is: every phase change here is an
// `elapsed` the page's one opening accepts, and the order of the phases is its
// sequence for the way in. This file owns only time — how long each phase
// lasts, and the motion inside it as functions of 0..1.
//
// It replaced a GSAP timeline, and keeps the one property of it that the debug
// overlay, the skip and the tests all rely on: setting the time forward fires
// every cue and finishes every motion on the way, in order, exactly as playing
// through does. Setting it BACK starts again from the beginning and walks
// forward, rather than undoing writes it never recorded.
//
// No visibility guard. It advances only when `step(dt)` is called, from a
// `useFrame`; rAF does not run in a hidden tab and the caller clamps the delta
// the tab returns with (`graphics/frameDelta`). A long main-thread frame advances
// it by at most that clamp, where GSAP's lag smoothing made its own jump.

import type { IntroConfig, Phase } from '../config/introConfig'
import type { SequenceState } from '../config/sequenceState'
import { cinematicSpeed, easeInOutCubic, narrowPeak } from '../../../utils/easing'
import { orbitRevealDuration } from '../orbit/orbitConfig'
import type { IntroDrawHandle } from '../../../intro-draw/introDraw'
import type { CornerLogoHandle } from '../../../corner-logo/cornerLogoConfig'
import { canSubstitute, tail } from '../../../intro-draw/openingMachine'
import type { OpeningStore } from '../../../intro-draw/openingStore'

// GSAP's power2.out, which the reveal was tuned with. The project's own copy
// (orbit/orbitUtils) shares a module with three, and this one is in the entry chunk.
const cubicOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

export interface OpeningTailOptions {
  config: IntroConfig
  state: SequenceState
  draw: IntroDrawHandle
  cornerLogo: { readonly current: CornerLogoHandle | null }
  satelliteCount: number
  /**
   * The page's one opening, past `draw`. Its way in decides the tail: a
   * returning visitor enters at the crossover, reduced motion has no tail.
   */
  opening: OpeningStore
}

export interface OpeningTail {
  /** Seconds, from `shrink` (or `site`, under reduced motion) to `site`. */
  readonly duration: number
  readonly time: number
  readonly paused: boolean
  /** When each phase begins on this clock. Only the phases this way in has. */
  readonly labels: Readonly<Partial<Record<Phase, number>>>
  /** Advances by `dt` seconds, unless paused or finished. */
  step(dt: number): void
  /** Moves to a time, or to a phase's start, firing everything in between. */
  seek(to: number | Phase): void
  play(): void
  pause(): void
}

/** Fires once, when the time reaches `at`. */
interface Cue {
  readonly at: number
  run(): void
}

/** Runs from `at` for `duration`, updated with 0..1 and last with exactly 1. */
interface Motion {
  readonly at: number
  readonly duration: number
  update(p: number): void
}

type Item = { kind: 'cue'; cue: Cue } | { kind: 'motion'; motion: Motion }

export function createOpeningTail(options: OpeningTailOptions): OpeningTail {
  const { config, state, draw, cornerLogo, satelliteCount, opening } = options

  // P0's own size is 1.0 by definition; every later phase scales relative to
  // it, so the shrink target is a ratio rather than a vmin count.
  const shrinkScale = config.shrinkTargetSize / config.introSize

  // Read once, as the timeline was built once: the collapse exists only for a
  // returning visitor whose load outlasted its grace and showed the drawing.
  const markShown = draw.isVisible()

  // The opening as the tail starts it: the fill has taken it out of `draw`
  // (§26.5), and a rewind puts it back at the first phase after that, wherever
  // an earlier tail had left it.
  const begin = () => {
    opening.send({ type: 'rewind' })
    if (opening.current().presentation === 'draw') throw new Error('the tail was built before the fill')
  }

  begin()
  const { way } = opening.current()
  const durations: Partial<Record<Phase, number>> =
    way === 'returning'
      ? {
          shrink: markShown ? config.returnCollapseDuration : 0,
          // The landing keeps the logo's time, not the fade's: the logo's spin and
          // flight run on its own clock from startSequence(), at the substitution.
          swap: config.swapDuration * (1 - config.swapCrossover),
        }
      : {
          shrink: config.shrinkDuration,
          warp: config.warpDuration,
          swap: config.swapDuration,
        }
  // The logo's spin and flight are driven by its own loop; the tail only holds
  // each phase open for them. Hold `orbits` for whichever finishes last: the
  // logo's flight or the reveal.
  durations.corner = config.spinPauseBefore + config.spinDuration
  durations.orbits =
    Math.max(config.orbitsStartOffset, 0) +
    Math.max(config.toCornerDuration, orbitRevealDuration(satelliteCount))

  // The phases' start times, walked off the machine's own sequence.
  const labels: Partial<Record<Phase, number>> = {}
  {
    let at = 0
    for (const phase of tail(opening.current())) {
      labels[phase] = at
      at += durations[phase] ?? 0
    }
  }
  const duration = labels.site ?? 0

  let substituted = false

  const items: Item[] = []
  const cue = (at: number, run: () => void) => items.push({ kind: 'cue', cue: { at, run } })
  const motion = (at: number, length: number, update: (p: number) => void) =>
    items.push({ kind: 'motion', motion: { at, duration: length, update } })

  // Every phase begins with the machine moving on. The first is where `begin()`
  // already stands. The phase itself is not written here: `state.phase` and
  // React both follow the opening (useMasterTimeline).
  const enter = (phase: Phase, also?: () => void) =>
    cue(labels[phase] ?? 0, () => {
      if (opening.current().presentation !== phase) opening.send({ type: 'elapsed' })
      // Built from the machine's sequence, so this can only fail if the two were
      // changed apart.
      if (opening.current().presentation !== phase) {
        throw new Error(`the tail entered ${phase}, the machine is in ${opening.current().presentation}`)
      }
      also?.()
    })

  if (way === 'reduced') {
    // No shrink, no warp, no crossover flight. Hand straight to the end state:
    // Earth at rest, logo already parked in the corner.
    enter('site', () => {
      draw.setVisible(false)
      // Satellites orbit at a calm ambient speed, so they stay — only the
      // reveal's staggered draw-in is skipped, by starting already-shown.
      state.orbitsStarted = true
      // Parked, not flown there: the spin and the flight are the motion this
      // way in exists to leave out. The corner's slow idle stays, like the orbits.
      cornerLogo.current?.snapToCorner()
    })
  } else if (way === 'returning') {
    // ── THE RETURNING VISITOR'S WAY IN ──
    //
    // It used to be a seek to `site` on the first tail frame, and that was a
    // cut with nothing over it: the mark vanished, the logo was parked, the
    // camera jumped from the star field to the planet and every control
    // mounted, all in one commit. What a second visit has no use for is the
    // drawing, the shrink and the warp — not the landing, which is the part
    // that says where they are. So their load waits unseen (`quiet`, in
    // intro-draw), they enter at the crossover, and the landing plays.
    //
    // The phases keep their names, so everything keyed on them holds: `shrink`
    // still means "the 2D mark, over the stars, planet hidden", `swap` still
    // means "the planet is up and the mark is changing hands". `warp` never
    // happens, so `warpProgress` stays 0 and CameraController's rest branch
    // places the camera at the planet from `swap`, as it does for any seek.
    enter('shrink')

    // Normally there is no 2D mark: the load waited unseen and the 3D mark is
    // the first thing this visitor sees. The collapse is for the load that
    // outlasted its grace and showed the drawing after all — that mark cannot
    // simply vanish, so it goes out through zero, power2.in like the real crossover.
    if (markShown) {
      motion(0, config.returnCollapseDuration, (t) => draw.setScale(1 - t * t))
    }

    enter('swap', () => {
      // Same tick, never a cross-fade — and under full cover, which is what
      // the planet appearing behind it needs.
      state.swapOverlay = 1
      draw.setVisible(false)
      cornerLogo.current?.startSequence()
    })
    // From the swap rather than to the next phase, so the fade runs over the
    // bloom and into the spin without holding the sequence open for it.
    motion(labels.swap ?? 0, config.returnRevealDuration, (p) => {
      state.swapOverlay = 1 - cubicOut(p)
    })
  } else {
    // ── P1 SHRINK ──
    enter('shrink')
    motion(0, config.shrinkDuration, (p) =>
      draw.setScale(1 + (shrinkScale - 1) * easeInOutCubic(p)),
    )

    // ── P2 WARP ──
    // Linear on purpose — the shaping lives in cinematicTravel / cinematicSpeed /
    // narrowPeak. An ease here would compound with them and break the width
    // relationship between the three curves.
    const warpAt = labels.warp ?? 0
    enter('warp')
    motion(warpAt, config.warpDuration, (p) => {
      state.warpProgress = p

      // AfterimagePass only touches the WebGL framebuffer, so the DOM mark
      // would otherwise sit pin-sharp through the most violent part of the
      // warp. Fake the same motion with a CSS filter driven by the very same
      // speed factor (plan 002 §4.2). cinematicSpeed is a bell, so both return
      // to zero on their own by progress 1.
      const speed = cinematicSpeed(p, config.sceneSwapProgress, config.speedPeakWidth)
      draw.setWarp(speed * config.svgWarpBlur, speed * config.svgWarpStretch)
    })
    cue(warpAt + config.warpDuration, () => {
      state.warpProgress = 1
      draw.setWarp(0, 0)
    })

    // ── P3 SWAP (scale-through-zero crossover) ──
    const swapAt = labels.swap ?? 0
    enter('swap', () => {
      substituted = false
    })
    motion(swapAt, config.swapDuration, (p) => {
      const x = config.swapCrossover

      // Without a model there is nothing to substitute INTO, and a
      // zero-crossing conceals nothing — so hold the 2D mark at full size
      // rather than collapsing it into an empty frame (§26.8).
      if (cornerLogo.current?.isReady()) opening.send({ type: 'logo-ready' })
      if (!canSubstitute(opening.current())) {
        draw.setScale(shrinkScale)
        return
      }

      if (p < x) {
        // Collapse: power2.in so it is near-vertical at the crossing.
        const t = p / x
        draw.setScale(shrinkScale * (1 - t * t))
      } else if (!substituted) {
        // Same tick, never a cross-fade (extraction 001 §1).
        substituted = true
        draw.setVisible(false)
        cornerLogo.current?.startSequence()
      }

      // The same smooth envelope as the planet reveal: zero velocity and
      // acceleration at the edges and peak, with no delay at the crossing.
      state.swapOverlay = narrowPeak(p, x, config.swapFlashWidth) * config.swapFlashStrength
    })
    cue(swapAt + config.swapDuration, () => {
      state.swapOverlay = 0
    })
  }

  if (way !== 'reduced') {
    // ── P4 CORNER, P5 ORBITS, END STATE ── shared by both ways in.
    //
    // The logo is alone at centre through the pause + spin, and the eye is on it.
    enter('corner')
    // Deliberately NOT simultaneous with the corner flight. Both are ~3.4s and
    // both are focal; run together, the eye tracks the large spinning logo and
    // the staggered orbit draw-in is missed entirely. Starting here — as the
    // logo departs centre — hands attention off instead of splitting it.
    enter('orbits', () => {
      state.orbitsStarted = true
    })
    // Earth at rest, isotype idling in the corner.
    enter('site')
  }

  // Stable: a cue and a motion at the same time run in the order written above.
  const order = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => start(a.item) - start(b.item) || a.index - b.index)
    .map(({ item }) => item)

  let time = 0
  let paused = false
  let finished = false
  const fired = new Set<Item>()

  // Continuous state starts clean, so a replay or a rewind does too.
  const reset = () => {
    state.warpProgress = 0
    state.warpOverlay = 0
    state.swapOverlay = 0
    state.motionBlur = 0
    state.orbitsStarted = false
    draw.setScale(1)
    draw.setWarp(0, 0)
    // A returning visitor's load may have ended with the mark never shown, and
    // that is the state their way in starts from — it is not this reset's to undo.
    // Under reduced motion too: that branch hides the mark itself on its first
    // tick, and showing it here first would flash the whole mark for a frame.
    if (way === 'first') draw.setVisible(true)
    time = 0
    finished = false
    fired.clear()
    begin()
    substituted = false
  }

  const advance = (to: number) => {
    time = Math.min(Math.max(to, time), duration)
    for (const item of order) {
      if (fired.has(item) || start(item) > time) continue
      if (item.kind === 'cue') {
        fired.add(item)
        item.cue.run()
      } else {
        const { at, duration: length, update } = item.motion
        const p = length > 0 ? Math.min(1, (time - at) / length) : 1
        if (p >= 1) fired.add(item)
        update(p)
      }
    }
    finished = time >= duration
  }

  reset()

  return {
    duration,
    labels,
    get time() {
      return time
    },
    get paused() {
      return paused
    },
    step(dt) {
      if (paused || finished || !Number.isFinite(dt)) return
      advance(time + Math.max(0, dt))
    },
    seek(to) {
      const target = typeof to === 'number' ? to : labels[to]
      if (target === undefined) return
      if (target < time) reset()
      // Before the beginning, nothing has happened yet — not even what is at 0.
      if (target >= 0) advance(target)
    },
    play() {
      paused = false
    },
    pause() {
      paused = true
    },
  }
}

function start(item: Item) {
  return item.kind === 'cue' ? item.cue.at : item.motion.at
}
