import { describe, it, expect } from 'vitest'
import { unobstructedCenterNdc, unobstructedRect, type ScreenRect } from './cameraFraming'

const CANVAS: ScreenRect = { left: 0, top: 0, width: 1600, height: 900 }

describe('unobstructedRect', () => {
  it('returns the whole canvas when nothing obstructs it', () => {
    expect(unobstructedRect(CANVAS, null)).toEqual(CANVAS)
  })

  it('returns the whole canvas when the obstruction misses it', () => {
    // The panel is measured relative to the canvas, and an app shell that puts
    // something beside the canvas can produce a rect that does not overlap.
    const elsewhere: ScreenRect = { left: 2000, top: 0, width: 300, height: 900 }
    expect(unobstructedRect(CANVAS, elsewhere)).toEqual(CANVAS)
  })

  it('leaves the strip beside a right-docked panel', () => {
    const panel: ScreenRect = { left: 1220, top: 0, width: 380, height: 900 }
    const visible = unobstructedRect(CANVAS, panel)
    expect(visible.left).toBe(0)
    expect(visible.width).toBe(1220)
    expect(visible.height).toBe(900)
  })

  it('leaves the strip beside a left-docked panel', () => {
    // Same implementation serves both sides deliberately — it does not assume
    // the UI is flush with a particular canvas edge.
    const panel: ScreenRect = { left: 0, top: 0, width: 380, height: 900 }
    const visible = unobstructedRect(CANVAS, panel)
    expect(visible.left).toBe(380)
    expect(visible.width).toBe(1220)
  })

  it('leaves the band above a bottom sheet', () => {
    const sheet: ScreenRect = { left: 0, top: 540, width: 1600, height: 360 }
    const visible = unobstructedRect(CANVAS, sheet)
    expect(visible.top).toBe(0)
    expect(visible.height).toBe(540)
    expect(visible.width).toBe(1600)
  })

  it('picks the larger region when the obstruction splits the canvas', () => {
    const stripe: ScreenRect = { left: 400, top: 0, width: 100, height: 900 }
    const visible = unobstructedRect(CANVAS, stripe)
    // Left of the stripe is 400 wide, right of it is 1100. The bigger one wins.
    expect(visible.left).toBe(500)
    expect(visible.width).toBe(1100)
  })

  it('falls back to the whole canvas when fully covered', () => {
    // Framing into a degenerate strip would put the district in a sliver; the
    // whole canvas is the honest answer when there is nothing left to aim at.
    expect(unobstructedRect(CANVAS, { ...CANVAS })).toEqual(CANVAS)
  })
})

describe('unobstructedCenterNdc', () => {
  it('is the canvas centre when nothing obstructs', () => {
    expect(unobstructedCenterNdc(CANVAS, null)).toEqual({ x: 0, y: 0 })
  })

  it('reproduces the closed form for a right-docked panel', () => {
    // x = -P/W. Asserted against the arithmetic rather than a recorded number,
    // so the relationship is what is protected.
    const panelWidth = 380
    const panel: ScreenRect = { left: CANVAS.width - panelWidth, top: 0, width: panelWidth, height: 900 }
    const ndc = unobstructedCenterNdc(CANVAS, panel)
    expect(ndc.x).toBeCloseTo(-panelWidth / CANVAS.width, 10)
    expect(ndc.y).toBeCloseTo(0, 10)
  })

  it('reproduces the closed form for a bottom sheet, y positive', () => {
    // y = +S/H. The sign is the trap: NDC y runs upward while a DOM rect's top
    // runs downward, so a sheet at the BOTTOM moves the aim point UP.
    const sheetHeight = 360
    const sheet: ScreenRect = { left: 0, top: CANVAS.height - sheetHeight, width: 1600, height: sheetHeight }
    const ndc = unobstructedCenterNdc(CANVAS, sheet)
    expect(ndc.y).toBeCloseTo(sheetHeight / CANVAS.height, 10)
    expect(ndc.y).toBeGreaterThan(0)
    expect(ndc.x).toBeCloseTo(0, 10)
  })

  it('measures relative to the canvas, not the viewport', () => {
    // An offset canvas is the case that breaks a viewport-relative
    // implementation while looking correct on a full-bleed layout.
    const offset: ScreenRect = { left: 200, top: 100, width: 1600, height: 900 }
    expect(unobstructedCenterNdc(offset, null)).toEqual({ x: 0, y: 0 })

    const panel: ScreenRect = { left: 200 + 1220, top: 100, width: 380, height: 900 }
    expect(unobstructedCenterNdc(offset, panel).x).toBeCloseTo(-380 / 1600, 10)
  })

  it('stays inside the NDC cube for every panel width', () => {
    for (let width = 0; width <= CANVAS.width; width += 50) {
      const panel: ScreenRect = { left: CANVAS.width - width, top: 0, width, height: 900 }
      const ndc = unobstructedCenterNdc(CANVAS, panel)
      expect(ndc.x).toBeGreaterThanOrEqual(-1)
      expect(ndc.x).toBeLessThanOrEqual(1)
    }
  })

  it('returns the centre rather than dividing by zero on a degenerate canvas', () => {
    expect(unobstructedCenterNdc({ left: 0, top: 0, width: 0, height: 0 }, null)).toEqual({ x: 0, y: 0 })
  })
})
