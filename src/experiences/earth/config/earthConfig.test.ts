// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  EARTH_TEXTURES,
  resetEarthTextureTier,
  usesNarrowEarthTextures,
} from './earthConfig'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'

/**
 * Which surface maps a session carries, and the one property that makes the
 * answer worth storing rather than recomputing.
 *
 * The tier decides two things now: the files `EarthScene` loads, and how close
 * the zoom may take the camera (`zoomNearFactorNarrow` — the 1024-wide maps
 * magnify x3.6 at the desktop near end, against x1.03 for the 4096 ones). Two
 * readers of one fact, and the fact has to be the SAME for both or the
 * restriction stops protecting the thing it was written for.
 */

const setWidth = (value: number) => {
  Object.defineProperty(window, 'innerWidth', { value, configurable: true, writable: true })
}

afterEach(() => {
  resetEarthTextureTier()
  setWidth(1024)
})

describe('the surface-map tier', () => {
  it('says narrow at the breakpoint and wide one pixel past it', () => {
    setWidth(EARTH_TEXTURES.narrowMaxWidth)
    expect(usesNarrowEarthTextures()).toBe(true)
    resetEarthTextureTier()
    setWidth(EARTH_TEXTURES.narrowMaxWidth + 1)
    expect(usesNarrowEarthTextures()).toBe(false)
  })

  it('LATCHES, so a phone turned sideways keeps the maps it loaded', () => {
    // THE assertion this file exists for. A phone in landscape is 852x393:
    // wide enough to pass a 767 width test, and still a phone holding the
    // narrow maps, because `EarthScene` chose them once and does not re-read.
    //
    // A second reader asking the live width would hand that rotated phone the
    // desktop zoom end — 7.2 units, where the 1024 maps magnify x3.6 — which is
    // precisely the framing the narrow end exists to keep it out of.
    setWidth(390)
    expect(usesNarrowEarthTextures()).toBe(true)
    setWidth(852)
    expect(usesNarrowEarthTextures()).toBe(true)
  })

  it('latches the other way too: a landscape load keeps the wide maps', () => {
    // The mirror case, and it matters because it is the one where the
    // restriction would be wrong: this session really did download 4096-wide
    // maps, so holding it at 12 units would cost framing it has paid for.
    setWidth(852)
    expect(usesNarrowEarthTextures()).toBe(false)
    setWidth(390)
    expect(usesNarrowEarthTextures()).toBe(false)
  })
})

describe('the near end each tier earns', () => {
  it('is nearer for the maps that can carry it', () => {
    const cfg = INTERACTION_CONFIG.camera
    expect(cfg.zoomNearFactorNarrow).toBeGreaterThan(cfg.zoomNearFactor)
    // Stated as radii, which is how both are judged: 12 against 7.2.
    expect(cfg.overviewRadius * cfg.zoomNearFactorNarrow).toBeCloseTo(12, 9)
  })
})
