import { describe, expect, it } from 'vitest'
import {
  CASE_PANEL_DOCK_MIN_HEIGHT,
  CASE_PANEL_DOCK_MIN_WIDTH,
  CLOSE_UP_OFFSET_FRACTION,
  closeUpScreenOffset,
  isPhoneViewport,
} from './closeUpFraming'

// The close-up distance and FOV the shipped composition was judged at.
// Duplicated rather than imported so this file states the case it is asserting
// — if either moves in interactionConfig, the desktop-parity test below is
// meant to be re-derived by a person, not to follow along silently.
const SUBJECT_DISTANCE = 0.55 * 2 // closeUp.distance, R = 2
const FOV = 45 // introConfig.normalFov
const DESKTOP = { width: 1600, height: 900 }

/** The angle between the view axis and the subject, which is what clips. */
function offsetAngleDeg(offset: number): number {
  return (Math.atan(offset / SUBJECT_DISTANCE) * 180) / Math.PI
}

/** Half the frame's horizontal angular width. */
function horizontalHalfFovDeg(aspect: number): number {
  return (Math.atan(Math.tan((FOV * Math.PI) / 360) * aspect) * 180) / Math.PI
}

describe('closeUpScreenOffset', () => {
  it('reproduces the shipped desktop composition', () => {
    // The constant it replaced was 0.16 * R = 0.32 world units, chosen by eye at
    // 16:9. Parity here is what makes this a refactor of the framing rather
    // than a retune of it.
    const offset = closeUpScreenOffset({
      subjectDistance: SUBJECT_DISTANCE,
      verticalFovDegrees: FOV,
      aspect: DESKTOP.width / DESKTOP.height,
      viewportWidthPx: DESKTOP.width,
      viewportHeightPx: DESKTOP.height,
    })
    expect(offset).toBeCloseTo(0.32, 3)
  })

  it('keeps the subject inside the frustum at every aspect the dock is used at', () => {
    // The defect: at 3:4 the old constant sat at 84% of the half-width and at
    // 9:19.5 it was outside the frame entirely. The fraction is aspect-relative,
    // so the ratio below is constant by construction — asserted across the range
    // rather than at one point, because a single sample cannot tell a fixed
    // fraction from a fixed distance.
    for (const [w, h] of [
      [1600, 900],
      [1280, 800],
      [1024, 1366],
      [768, 1024],
      [5120, 1440],
    ]) {
      const aspect = w / h
      const offset = closeUpScreenOffset({
        subjectDistance: SUBJECT_DISTANCE,
        verticalFovDegrees: FOV,
        aspect,
        viewportWidthPx: w,
        viewportHeightPx: h,
      })
      const ratio =
        Math.tan((offsetAngleDeg(offset) * Math.PI) / 180) /
        Math.tan((horizontalHalfFovDeg(aspect) * Math.PI) / 180)
      expect(ratio).toBeCloseTo(CLOSE_UP_OFFSET_FRACTION, 6)
      expect(offsetAngleDeg(offset)).toBeLessThan(horizontalHalfFovDeg(aspect))
    }
  })

  it('centres the subject below the breakpoint, where the panel is a bottom sheet', () => {
    // Not a smaller offset — none at all. A sheet occupies the bottom of the
    // frame, so shifting sideways would move the subject off centre to clear
    // something that is not there.
    for (const width of [320, 390, 430, CASE_PANEL_DOCK_MIN_WIDTH - 1]) {
      expect(
        closeUpScreenOffset({
          subjectDistance: SUBJECT_DISTANCE,
          verticalFovDegrees: FOV,
          aspect: width / 844,
          viewportWidthPx: width,
          viewportHeightPx: 844,
        }),
      ).toBe(0)
    }
  })

  it('applies the offset from the breakpoint upward', () => {
    expect(
      closeUpScreenOffset({
        subjectDistance: SUBJECT_DISTANCE,
        verticalFovDegrees: FOV,
        aspect: CASE_PANEL_DOCK_MIN_WIDTH / 1024,
        viewportWidthPx: CASE_PANEL_DOCK_MIN_WIDTH,
        viewportHeightPx: 1024,
      }),
    ).toBeGreaterThan(0)
  })

  it('centres the subject on a SHORT viewport too', () => {
    // A phone in landscape is 852x393: wide enough to pass the width test, and
    // less than half as tall as the panel's own content. It used to get the
    // desktop dock — 324px wide and 820px tall on a 393px screen, unscrollable
    // — and this offset, shifting the satellite aside to clear a column that
    // did not fit on the screen at all. Both halves of that are now the sheet's.
    for (const [w, h] of [
      [852, 393],
      [932, 430],
      [1024, CASE_PANEL_DOCK_MIN_HEIGHT - 1],
    ]) {
      expect(
        closeUpScreenOffset({
          subjectDistance: SUBJECT_DISTANCE,
          verticalFovDegrees: FOV,
          aspect: w / h,
          viewportWidthPx: w,
          viewportHeightPx: h,
        }),
        `${w}x${h} is a bottom sheet, so there is nothing beside the subject to clear`,
      ).toBe(0)
    }
  })

  it('still applies the offset on a short-but-not-mobile window', () => {
    // The height test must not catch a desktop browser dragged to a squat
    // shape: at 1440x520 the dock is still a dock. This is the negative control
    // for the rule above.
    expect(
      closeUpScreenOffset({
        subjectDistance: SUBJECT_DISTANCE,
        verticalFovDegrees: FOV,
        aspect: 1440 / 520,
        viewportWidthPx: 1440,
        viewportHeightPx: 520,
      }),
    ).toBeGreaterThan(0)
  })

  it('returns zero rather than NaN for a viewport that has not been measured', () => {
    // R3F reports 0x0 for a frame or two before the container is measured.
    expect(
      closeUpScreenOffset({
        subjectDistance: SUBJECT_DISTANCE,
        verticalFovDegrees: FOV,
        aspect: 0,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      }),
    ).toBe(0)
    expect(
      closeUpScreenOffset({
        subjectDistance: 0,
        verticalFovDegrees: FOV,
        aspect: 1.78,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      }),
    ).toBe(0)
  })
})

describe('isPhoneViewport', () => {
  // Extracted from this module's own two guards on 2026-09-09, because the
  // satellites' size now asks the same question (orbit/satelliteScale.ts). What
  // is asserted here is therefore load-bearing twice: it decides whether the
  // case panel is a dock or a sheet, AND how large a satellite is.

  it('calls a phone a phone in either orientation', () => {
    // THE FAILURE THIS CATCHES, and `styles.css` shipped it once: a breakpoint
    // written only in width does not describe a phone. Landscape is 852x393 —
    // wider than any width test, and still a phone in someone's hand.
    expect(isPhoneViewport(393, 852), 'portrait').toBe(true)
    expect(isPhoneViewport(852, 393), 'landscape').toBe(true)
    expect(isPhoneViewport(412, 915), 'larger portrait').toBe(true)
  })

  it('does not call a tablet or a desktop a phone', () => {
    expect(isPhoneViewport(768, 1024), 'tablet portrait').toBe(false)
    expect(isPhoneViewport(1024, 768), 'tablet landscape').toBe(false)
    expect(isPhoneViewport(1600, 900), 'desktop').toBe(false)
  })

  it('sits exactly on the constants it is named for', () => {
    // Both bounds, because an off-by-one here moves the site's phone breakpoint
    // away from the stylesheet's and that divergence is invisible until it is
    // on a device.
    expect(isPhoneViewport(CASE_PANEL_DOCK_MIN_WIDTH, 900)).toBe(false)
    expect(isPhoneViewport(CASE_PANEL_DOCK_MIN_WIDTH - 1, 900)).toBe(true)
    expect(isPhoneViewport(1600, CASE_PANEL_DOCK_MIN_HEIGHT)).toBe(false)
    expect(isPhoneViewport(1600, CASE_PANEL_DOCK_MIN_HEIGHT - 1)).toBe(true)
  })

  it('answers "phone" for a viewport that has not been measured yet', () => {
    // R3F reports 0x0 for a frame or two before the container is measured, so
    // this case is reached on every boot. Of the two wrong answers it is the
    // harmless one — it is what `closeUpScreenOffset` already did by falling
    // through to zero, and a satellite that is briefly phone-sized before the
    // first real measurement is corrected on the next read. Pinned so nobody
    // "fixes" it into a desktop default, which would pop the satellites down a
    // size on the first frame of every phone boot.
    expect(isPhoneViewport(0, 0)).toBe(true)
  })
})
