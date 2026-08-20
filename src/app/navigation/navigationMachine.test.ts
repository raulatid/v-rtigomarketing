import { describe, it, expect } from 'vitest'
import {
  createNavigationMachine,
  intentFor,
  isIntentLegal,
} from './navigationMachine'
import { NAVIGATION_COOLDOWN } from './navigationConfig'

// What this file asserts: that the illegal states named in `docs/plans/002` §5 are
// unreachable, and that the cooldown cannot deadlock. What `checks/` asserts
// instead: that real event streams reach the machine in the right order.

const LIMITS = NAVIGATION_COOLDOWN
const MIN_MS = LIMITS.minSeconds * 1000
const MAX_MS = LIMITS.maxSeconds * 1000
const QUIET_MS = LIMITS.quietGapSeconds * 1000

/** Commits and settles, leaving the machine in cooldown at t = `settledAt`. */
function intoCooldown(settledAt = 0) {
  const m = createNavigationMachine(LIMITS)
  m.beginGesture()
  m.commit('earth')
  m.settle(settledAt)
  return m
}

describe('intentFor / isIntentLegal', () => {
  it('maps each experience to the only move available from it', () => {
    expect(intentFor('earth')).toBe('enter-murcia')
    expect(intentFor('murcia')).toBe('exit-murcia')
  })

  it('rejects the two intents that would navigate to where you already are', () => {
    // "Earth + exit-to-Earth" and "Murcia + enter-Murcia", named in plan 002 §5.
    expect(isIntentLegal('exit-murcia', 'earth')).toBe(false)
    expect(isIntentLegal('enter-murcia', 'murcia')).toBe(false)
    expect(isIntentLegal('enter-murcia', 'earth')).toBe(true)
    expect(isIntentLegal('exit-murcia', 'murcia')).toBe(true)
  })
})

describe('createNavigationMachine', () => {
  it('starts idle and accepting', () => {
    const m = createNavigationMachine(LIMITS)
    expect(m.phase).toBe('idle')
    expect(m.canAccumulate()).toBe(true)
  })

  it('refuses all input while locked — there is no transition to accept it', () => {
    // "transitioning + accepting navigation input", plan 002 §5.
    const m = createNavigationMachine(LIMITS)
    m.beginGesture()
    m.commit('earth')
    expect(m.phase).toBe('locked')
    expect(m.canAccumulate()).toBe(false)

    // And the calls that would move it are inert rather than merely discouraged.
    m.beginGesture()
    expect(m.phase).toBe('locked')
    expect(m.commit('murcia')).toBe(null)
    expect(m.phase).toBe('locked')
  })

  it('refuses all input while cooling down', () => {
    // "cooldown + gesture accumulation", plan 002 §5.
    const m = intoCooldown()
    expect(m.phase).toBe('cooldown')
    expect(m.canAccumulate()).toBe(false)
    m.beginGesture()
    expect(m.phase).toBe('cooldown')
    expect(m.commit('murcia')).toBe(null)
  })

  it('locks synchronously on the committing call, not a frame later', () => {
    // The whole reason this is not driven by React state: `transitioning` lands a
    // render late, and the tail of the committing gesture arrives inside that gap.
    const m = createNavigationMachine(LIMITS)
    m.beginGesture()
    expect(m.canAccumulate()).toBe(true)
    m.commit('earth')
    expect(m.canAccumulate()).toBe(false)
  })

  it('returns the intent the current experience allows', () => {
    const fromEarth = createNavigationMachine(LIMITS)
    fromEarth.beginGesture()
    expect(fromEarth.commit('earth')).toBe('enter-murcia')

    const fromMurcia = createNavigationMachine(LIMITS)
    fromMurcia.beginGesture()
    expect(fromMurcia.commit('murcia')).toBe('exit-murcia')
  })

  it('does not enter cooldown until the transition genuinely settles', () => {
    const m = createNavigationMachine(LIMITS)
    m.beginGesture()
    m.commit('earth')
    // No amount of ticking releases a lock; only the transition ending does.
    expect(m.tick(999999, 0)).toBe(null)
    expect(m.phase).toBe('locked')
    m.settle(0)
    expect(m.phase).toBe('cooldown')
  })

  it('ignores settle() unless something is actually locked', () => {
    const m = createNavigationMachine(LIMITS)
    m.settle(0)
    expect(m.phase).toBe('idle')
  })

  it('holds the cooldown for at least the minimum, even in total silence', () => {
    const m = intoCooldown(0)
    // Silent from the start — `lastInputMs` far in the past.
    expect(m.tick(MIN_MS * 0.5, -100000)).toBe(null)
    expect(m.phase).toBe('cooldown')
  })

  it('releases on quiet once the minimum has passed', () => {
    const m = intoCooldown(0)
    const now = MIN_MS + 1
    const release = m.tick(now, now - QUIET_MS * 2)
    expect(release).not.toBe(null)
    expect(release!.onDeadline).toBe(false)
    expect(m.phase).toBe('idle')
  })

  it('does not release while the stream is still running', () => {
    const m = intoCooldown(0)
    const now = MIN_MS + 1
    // Last input was a moment ago — the tail is still arriving.
    expect(m.tick(now, now - QUIET_MS * 0.25)).toBe(null)
    expect(m.phase).toBe('cooldown')
  })

  it('CANNOT DEADLOCK against a viewer who never stops scrolling', () => {
    // The hole in pure quiescence, and it is the common case rather than a
    // pathological one: the committing gesture ends in a fast stream and "keep
    // scrolling to see whether it worked" refills it indefinitely.
    const m = intoCooldown(0)
    let now = 0
    let released = null as ReturnType<typeof m.tick>
    for (let i = 0; i < 10000 && released === null; i += 1) {
      now += 16
      // Never quiet: the last input is always this instant.
      released = m.tick(now, now)
    }
    expect(released).not.toBe(null)
    expect(m.phase).toBe('idle')
    expect(now).toBeLessThanOrEqual(MAX_MS + 32)
  })

  it('reports a deadline release, so the caller knows to latch', () => {
    // Releasing into a running stream without latching simply hands the momentum
    // tail a fresh gesture — the deadline would defeat its own purpose.
    const m = intoCooldown(0)
    const release = m.tick(MAX_MS + 1, MAX_MS + 1)
    expect(release).not.toBe(null)
    expect(release!.onDeadline).toBe(true)
  })

  it('prefers quiet over deadline when both are true', () => {
    // Latching a stream that really did stop would refuse the viewer's next
    // deliberate gesture for no reason.
    const m = intoCooldown(0)
    const now = MAX_MS + 1
    const release = m.tick(now, now - QUIET_MS * 10)
    expect(release!.onDeadline).toBe(false)
  })

  it('releases only once', () => {
    const m = intoCooldown(0)
    const now = MIN_MS + 1
    expect(m.tick(now, now - QUIET_MS * 2)).not.toBe(null)
    expect(m.tick(now + 16, now)).toBe(null)
  })

  it('ticks are inert outside cooldown', () => {
    const m = createNavigationMachine(LIMITS)
    expect(m.tick(999999, 0)).toBe(null)
    m.beginGesture()
    expect(m.tick(999999, 0)).toBe(null)
  })

  it('ends a gesture back to idle without committing', () => {
    const m = createNavigationMachine(LIMITS)
    m.beginGesture()
    expect(m.phase).toBe('gesturing')
    m.endGesture()
    expect(m.phase).toBe('idle')
  })

  it('endGesture cannot rescue a locked machine', () => {
    // Otherwise a decaying accumulator could unlock a transition in flight.
    const m = createNavigationMachine(LIMITS)
    m.beginGesture()
    m.commit('earth')
    m.endGesture()
    expect(m.phase).toBe('locked')
  })

  it('reset returns to idle from every phase', () => {
    for (const build of [
      () => createNavigationMachine(LIMITS),
      () => {
        const m = createNavigationMachine(LIMITS)
        m.beginGesture()
        return m
      },
      () => {
        const m = createNavigationMachine(LIMITS)
        m.beginGesture()
        m.commit('earth')
        return m
      },
      () => intoCooldown(0),
    ]) {
      const m = build()
      m.reset()
      expect(m.phase).toBe('idle')
      expect(m.canAccumulate()).toBe(true)
    }
  })
})
