// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTROLS_HINT_MIN_MS, ControlsHint } from './overlays'

// The controls plate is the only place the city's controls are taught, so it is
// owed a reading time: it fades once the viewer has demonstrated a drag, and
// never sooner than CONTROLS_HINT_MIN_MS after they arrived. A bare tap or click
// is not a demonstration — that is what took it away before anyone read it.

let host: HTMLDivElement
let hint: ControlsHint

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  hint = new ControlsHint(host)
})

afterEach(() => {
  hint.dispose()
  host.remove()
  vi.useRealTimers()
})

const plate = () => host.querySelector<HTMLElement>('#controls-hint')!
const faded = () => plate().classList.contains('faded')

describe('the controls plate', () => {
  it('teaches the mouse when the pointer is fine', () => {
    // jsdom has no matchMedia, which reads as a fine pointer — the same fallback
    // a browser without the query would take.
    expect(plate().textContent).toContain('Botón derecho')
    expect(plate().textContent).not.toContain('Dos dedos')
  })

  it('stays on screen while nothing but time passes', () => {
    hint.offer()
    vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS * 4)
    expect(faded()).toBe(false)
  })

  it('fades at once when the drag comes after the reading time', () => {
    hint.offer()
    vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS)
    hint.demonstrated()
    expect(faded()).toBe(true)
  })

  it('holds an early drag until the reading time is up', () => {
    hint.offer()
    vi.advanceTimersByTime(4000)
    hint.demonstrated()
    expect(faded()).toBe(false)
    vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS - 4000 - 1)
    expect(faded()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(faded()).toBe(true)
  })

  it('owes the full reading time to a drag that lands before any arrival', () => {
    hint.demonstrated()
    vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS - 1)
    expect(faded()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(faded()).toBe(true)
  })

  it('does not come back on a second arrival', () => {
    hint.offer()
    vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS)
    hint.demonstrated()
    hint.offer()
    hint.demonstrated()
    expect(faded()).toBe(true)
  })

  it('dispose cancels a pending fade', () => {
    hint.offer()
    hint.demonstrated()
    hint.dispose()
    expect(() => vi.advanceTimersByTime(CONTROLS_HINT_MIN_MS)).not.toThrow()
  })
})
