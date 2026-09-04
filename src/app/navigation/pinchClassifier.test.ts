import { describe, it, expect } from 'vitest'
import { createPinchClassifier } from './pinchClassifier'
import { NAVIGATION_GESTURE, NAVIGATION_PINCH, commitTravelPx, pinchGain } from './navigationConfig'

const START = 150
const CLAIM = NAVIGATION_PINCH.claimGrowthPx
const RIVAL = NAVIGATION_PINCH.declineRivalPx
const make = () => createPinchClassifier(NAVIGATION_PINCH)

/** A phone-sized shorter side, so the derived numbers below mean something. */
const PHONE_SHORT_SIDE = 393

// Note what this module is NOT given: a distance, a direction, or a world. It
// receives growth already signed "toward the other world" by the caller, which
// is why there is no Earth-versus-Murcia axis in these tests. Both worlds arrive
// here as the same positive number; `pinchInput.test.ts` proves the signing.

describe('createPinchClassifier', () => {
  describe('the direction contract', () => {
    it('claims growth toward the other world', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM)).toBe('claimed')
    })

    it('claims growth away from it too, because a zoom has two ends', () => {
      // The rule this inverts was right while a pinch could only mean "leave
      // this world". `adr/014` made it a zoom, and the far end of the band is a
      // real place a viewer parks — declining it left the fingers doing nothing.
      const c = make()
      c.begin(START)
      expect(c.sample(-CLAIM)).toBe('claimed')
    })

    it('is symmetric about rest, exactly', () => {
      // Free, since the signal is a signed distance and the threshold is on its
      // magnitude: one constant serves both ways and they cannot be tuned into
      // disagreeing.
      const out = make()
      out.begin(START)
      const back = make()
      back.begin(START)
      expect(out.sample(CLAIM)).toBe('claimed')
      expect(back.sample(-CLAIM)).toBe('claimed')
    })

    it('carries the sign through to the caller rather than absorbing it', () => {
      // The magnitude decides ownership; the SIGN is what the band reads to know
      // which way to zoom. Losing it here would make every pinch zoom the same
      // way whatever the fingers did.
      const c = make()
      c.begin(START)
      c.sample(-CLAIM * 2)
      expect(c.backlogPx).toBeCloseTo(-CLAIM * 2, 10)
    })

    it('never leaves a backlog behind a declined gesture', () => {
      const c = make()
      c.begin(START)
      c.decline()
      for (const g of [-4, -9, -20, -60, -120]) c.sample(g)
      expect(c.verdict).toBe('declined')
      expect(c.backlogPx).toBe(0)
    })
  })

  describe('the rival gesture', () => {
    it('hands the fingers back when a rival is carrying them', () => {
      // Murcia turns on the centroid. If the pair is travelling as a unit, the
      // viewer is turning the city, not leaving it.
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM, RIVAL)).toBe('declined')
    })

    it('lets a clean pinch through when the rival has barely moved', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM, RIVAL - 1)).toBe('claimed')
    })

    it('gives a tie to the gesture that already exists', () => {
      // Checked BEFORE the claim, deliberately. A false decline leaves you
      // turning a city you were already turning; a false claim throws you out of
      // it. The asymmetry decides ties, and it decides them the safe way.
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM * 4, RIVAL)).toBe('declined')
    })

    it('ignores the rival entirely when the caller reports none', () => {
      // Earth has no two-finger meaning at all, so its caller passes 0 — and a
      // pinch there must never be handed back to a gesture that does not exist.
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM, 0)).toBe('claimed')
    })

    it('defaults to no rival when the caller says nothing', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM)).toBe('claimed')
    })

    it('reads the rival as a magnitude, whichever way it points', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM, -RIVAL)).toBe('declined')
    })
  })

  describe('two fingers that are not pinching', () => {
    it('keeps watching while the separation is stable', () => {
      const c = make()
      c.begin(START)
      for (const g of [0, 2, -2, 1, -1, 0]) {
        expect(c.sample(g)).toBe('watching')
      }
    })

    it('keeps watching just below the claim', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM - 0.5)).toBe('watching')
    })

    it('declines two contacts too close together to be two fingers', () => {
      const c = make()
      expect(c.begin(NAVIGATION_PINCH.minStartDistancePx - 1)).toBe('declined')
      expect(c.sample(CLAIM * 10)).toBe('declined')
    })

    it('accepts a grip exactly at the floor', () => {
      const c = make()
      expect(c.begin(NAVIGATION_PINCH.minStartDistancePx)).toBe('watching')
    })

    it('accepts a tight grip, because a spread starts tight', () => {
      // The floor dropped from 40px to 24px when the ratio went: it was only
      // ever high to protect a division, and at 40 it risked refusing exactly
      // the close-fingered spread people actually make.
      const c = make()
      expect(c.begin(30)).toBe('watching')
      expect(c.sample(CLAIM)).toBe('claimed')
    })

    it('declines a gesture that lifts while undecided', () => {
      const c = make()
      c.begin(START)
      c.sample(3)
      expect(c.end()).toBe('declined')
    })

    it('declines a degenerate reading', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(Number.NaN)).toBe('declined')
    })

    it('declines a classifier that was never begun', () => {
      // A caller that refuses a gesture leaves this at 'watching' with no start.
      // It must not answer questions about a gesture nobody wanted.
      const c = make()
      expect(c.sample(CLAIM * 10)).toBe('declined')
    })
  })

  describe('the latch', () => {
    it('a claimed gesture stays claimed however the fingers then move', () => {
      const c = make()
      c.begin(START)
      expect(c.sample(CLAIM)).toBe('claimed')
      // Reversing must NOT flip it: the zoom is two-directional by design, and
      // ownership changing mid-gesture would hand the world back at a random
      // position — mid-pinch, with the fingers still down.
      expect(c.sample(-CLAIM * 5)).toBe('claimed')
      expect(c.sample(CLAIM * 5)).toBe('claimed')
      // Nor may a rival take it back once it is owned.
      expect(c.sample(CLAIM, RIVAL * 10)).toBe('claimed')
      expect(c.end()).toBe('claimed')
    })

    it('a declined gesture stays declined however the fingers then move', () => {
      // Declined by the RIVAL, which is the only way a gesture is refused now
      // that both directions are eligible. It used to be enough to move the
      // fingers the wrong way; since `adr/014` that is a zoom rather than a
      // mistake, so the decline has to be provoked by the turn it loses to.
      const c = make()
      c.begin(START)
      expect(c.sample(RIVAL, RIVAL * 2)).toBe('declined')
      expect(c.sample(CLAIM * 10)).toBe('declined')
      expect(c.end()).toBe('declined')
    })

    it('reset re-arms it for the next gesture', () => {
      const c = make()
      c.begin(START)
      c.sample(RIVAL, RIVAL * 2)
      c.reset()
      expect(c.verdict).toBe('watching')
      expect(c.backlogPx).toBe(0)
      c.begin(START)
      expect(c.sample(CLAIM)).toBe('claimed')
    })

    it('decline is explicit, for a caller that refuses the gesture outright', () => {
      const c = make()
      c.begin(START)
      c.decline()
      expect(c.sample(CLAIM * 10)).toBe('declined')
    })
  })

  describe('the backlog', () => {
    it('records the growth actually spent proving intent', () => {
      const c = make()
      c.begin(START)
      c.sample(CLAIM)
      expect(c.backlogPx).toBeCloseTo(CLAIM, 10)
    })

    it('records the overshoot when a fast spread jumps past the threshold', () => {
      // A real finger does not stop on the threshold, and the first sample past
      // it is usually well past it. Recording only the threshold would drop the
      // difference on the floor and open a dead zone.
      const c = make()
      c.begin(START)
      c.sample(CLAIM * 3)
      expect(c.backlogPx).toBeCloseTo(CLAIM * 3, 10)
    })
  })

  describe('the tuning invariants', () => {
    it('a full commit growth is worth the whole journey, not one stage of it', () => {
      // The mapping stated as its own definition. It takes the TOTAL — across
      // the zoom band and then against its limit — because that is what a
      // full-viewport pinch has to be worth. Scaled against the accumulator
      // alone, as it was before `adr/014` split the gesture in two, the same
      // pinch would deliver a third of it and never reach the other world.
      const total = commitTravelPx()
      const gain = pinchGain(total, PHONE_SHORT_SIDE)
      const commitGrowthPx = PHONE_SHORT_SIDE * NAVIGATION_PINCH.commitFraction
      expect(commitGrowthPx * gain).toBeCloseTo(total, 6)
      expect(total).toBeGreaterThan(NAVIGATION_GESTURE.commitDistancePx)
    })

    it('the claim is a small fraction of a commit, so the world answers early', () => {
      const commitGrowthPx = PHONE_SHORT_SIDE * NAVIGATION_PINCH.commitFraction
      const fraction = CLAIM / commitGrowthPx
      expect(fraction).toBeGreaterThan(0.02)
      expect(fraction).toBeLessThan(0.2)
    })

    it('the claim is above the wander of two settling fingers', () => {
      // 12px is what both worlds treat as a tap's worth of drift.
      expect(CLAIM).toBeGreaterThan(12)
    })

    it('the rival threshold is below the claim, so a turn wins a race it enters', () => {
      // If it were the other way round a rotation could never take a gesture
      // back: the pinch would always have claimed first.
      expect(RIVAL).toBeLessThan(CLAIM)
    })

    it('a commit takes a deliberate opening of the hand, at any grip', () => {
      // The regression the 2026-08-26 retune exists to prevent. Under the ratio
      // signal a 60px grip committed after 36px of growth — 18px per finger.
      const commitGrowthPx = PHONE_SHORT_SIDE * NAVIGATION_PINCH.commitFraction
      expect(commitGrowthPx).toBeGreaterThan(120)
      // And it must stay physically reachable on the narrowest phone we target.
      expect(commitGrowthPx).toBeLessThan(PHONE_SHORT_SIDE * 0.6)
    })

    it('the claim backlog survives the accumulator per-event clamp', () => {
      // The backlog is handed over as ONE event. Past the clamp the remainder is
      // carried by deliverPinch rather than dropped, but staying under it keeps
      // the claim landing whole in the frame it happens.
      const gain = pinchGain(commitTravelPx(), PHONE_SHORT_SIDE)
      expect(CLAIM * gain).toBeLessThanOrEqual(NAVIGATION_GESTURE.maxEventTravelPx)
    })
  })
})
