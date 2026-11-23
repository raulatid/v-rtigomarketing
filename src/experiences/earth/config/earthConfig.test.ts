// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EARTH_TEXTURES,
  EARTH_TEXTURE_FALLBACK,
  earthTextureSet,
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

// jsdom has no matchMedia. Only the pointer query is answered; anything else
// would be a reader this file does not know about, so it fails loudly.
const setFinePointer = (fine: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      if (query !== EARTH_TEXTURES.finePointerQuery) throw new Error(`unexpected media query ${query}`)
      return { matches: fine, media: query } as MediaQueryList
    },
  })
}

afterEach(() => {
  resetEarthTextureTier()
  setWidth(1024)
  Reflect.deleteProperty(window, 'matchMedia')
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

describe('the files each session loads', () => {
  it('gives a desktop the AVIF day and night, with the KTX2 clouds', () => {
    setWidth(1440)
    setFinePointer(true)
    expect(earthTextureSet()).toEqual({
      day: '/earth/day.avif',
      night: '/earth/night.avif',
      clouds: '/earth/clouds.ktx2',
    })
  })

  it('keeps a wide coarse-pointer device (an iPad) on the KTX2 set', () => {
    // R13: an AVIF uploads as RGBA8, and the iPad's GPU memory is what the
    // KTX2 set exists for. Width alone cannot tell a tablet from a laptop.
    setWidth(1180)
    setFinePointer(false)
    expect(earthTextureSet()).toBe(EARTH_TEXTURES.wide)
  })

  it('keeps a phone on the narrow KTX2 set, whatever its pointer says', () => {
    setWidth(390)
    setFinePointer(true)
    expect(earthTextureSet()).toBe(EARTH_TEXTURES.narrow)
  })

  it('latches the format, so a pointer plugged in mid-visit loads nothing again', () => {
    setWidth(1180)
    setFinePointer(false)
    expect(earthTextureSet()).toBe(EARTH_TEXTURES.wide)
    setFinePointer(true)
    expect(earthTextureSet()).toBe(EARTH_TEXTURES.wide)
  })

  it('falls back from each AVIF map to the KTX2 file of the same map', () => {
    expect(EARTH_TEXTURE_FALLBACK[EARTH_TEXTURES.wideAvif.day]).toBe(EARTH_TEXTURES.wide.day)
    expect(EARTH_TEXTURE_FALLBACK[EARTH_TEXTURES.wideAvif.night]).toBe(EARTH_TEXTURES.wide.night)
    // Every AVIF in the set has somewhere to go; nothing else needs one.
    const avif = Object.values(EARTH_TEXTURES.wideAvif).filter((url) => url.endsWith('.avif'))
    expect(Object.keys(EARTH_TEXTURE_FALLBACK).sort()).toEqual([...avif].sort())
  })
})

describe('the preloads in index.html', () => {
  // A preload that disagrees with the loader downloads the map twice (the
  // comment above them in index.html). One media query per set, and every file
  // of every set preloaded under its set's query — and under no other.
  const html = readFileSync('index.html', 'utf8')
  const tags = (html.match(/<link\b[^>]*>/g) ?? []).filter((tag) => /\bhref="\/earth\//.test(tag))
  const preloads = new Map<string, string[]>()
  for (const tag of tags) {
    const href = /\bhref="(\/earth\/[^"]+)"/.exec(tag)?.[1] ?? ''
    const media = /\bmedia="([^"]+)"/.exec(tag)?.[1] ?? ''
    preloads.set(href, [...(preloads.get(href) ?? []), media])
  }

  it('fetches every map the way its loader does, so the preload is reused', () => {
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      expect(tag).toMatch(/\brel="preload"/)
      expect(tag).toMatch(/\bas="fetch"/)
      expect(tag).toMatch(/\bcrossorigin\b/)
      // The AVIF pair carries its type, like the sky's: a browser that cannot
      // decode it then skips the preload instead of fetching it in vain.
      if (tag.includes('.avif"')) expect(tag).toMatch(/\btype="image\/avif"/)
    }
  })

  const wide = `(min-width: ${EARTH_TEXTURES.narrowMaxWidth + 1}px)`
  const fine = `${wide} and ${EARTH_TEXTURES.finePointerQuery}`
  const notFine = `${wide} and (pointer: coarse), ${wide} and (pointer: none)`
  const narrow = `(max-width: ${EARTH_TEXTURES.narrowMaxWidth}px)`

  it('preloads the desktop AVIF pair on a fine pointer and the KTX2 pair on any other', () => {
    expect(preloads.get(EARTH_TEXTURES.wideAvif.day)).toEqual([fine])
    expect(preloads.get(EARTH_TEXTURES.wideAvif.night)).toEqual([fine])
    expect(preloads.get(EARTH_TEXTURES.wide.day)).toEqual([notFine])
    expect(preloads.get(EARTH_TEXTURES.wide.night)).toEqual([notFine])
  })

  it('preloads the wide clouds on every wide viewport and the narrow set on phones', () => {
    expect(preloads.get(EARTH_TEXTURES.wide.clouds)).toEqual([wide])
    for (const url of Object.values(EARTH_TEXTURES.narrow)) expect(preloads.get(url)).toEqual([narrow])
  })

  it('preloads nothing under /earth/ that no set loads', () => {
    const loaded = new Set<string>([
      ...Object.values(EARTH_TEXTURES.wideAvif),
      ...Object.values(EARTH_TEXTURES.wide),
      ...Object.values(EARTH_TEXTURES.narrow),
    ])
    for (const href of preloads.keys()) expect(loaded.has(href)).toBe(true)
  })
})
