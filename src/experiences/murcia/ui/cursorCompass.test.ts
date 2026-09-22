// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CursorCompass, type CursorCompassLandmark } from './cursorCompass'

// The instrument's DOM and its per-frame writes, on a real camera. The arrival
// travel is a WAAPI one-shot jsdom cannot run, so what these pin is everything
// round it: the slots, the sides, the nearness, the follow and the clean-up.

const RECT = { left: 0, top: 0, width: 800, height: 600 }

/** A camera at the origin looking down -Z: three's own default orientation. */
function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, RECT.width / RECT.height, 0.1, 5000)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

function canvas(): HTMLCanvasElement {
  const el = document.createElement('canvas')
  el.getBoundingClientRect = () => ({ ...RECT, right: RECT.width, bottom: RECT.height, x: 0, y: 0, toJSON() {} })
  document.body.append(el)
  return el
}

function landmark(id: string, x: number, y: number, z: number, proximity?: (s: number) => void): CursorCompassLandmark {
  return { id, label: id, anchor: (out) => out.set(x, y, z), proximity }
}

function move(x: number, y: number): void {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, isPrimary: true }))
}

let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: fine)' }) as MediaQueryList)
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.className = ''
  vi.unstubAllGlobals()
})

describe('the cursor compass', () => {
  it('builds one decorative mark per landmark', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 1, 0, -1), landmark('blog', -1, 0, -1)])
    const root = host.querySelector('.murcia-cursor-compass')!
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelectorAll('.murcia-cursor-compass__mark[data-poi]')).toHaveLength(2)
    expect(root.querySelector('[data-poi="blog"] .murcia-cursor-compass__label')?.textContent).toBe('blog')
    compass.dispose()
  })

  it('tells the page it is showing, and every building it has gone quiet when it hides', () => {
    const near = vi.fn()
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 0, 0, -10, near)])
    const root = host.querySelector<HTMLElement>('.murcia-cursor-compass')!

    compass.setVisible(true)
    expect(root.dataset.visible).toBe('true')
    expect(document.documentElement.classList.contains('has-cursor-compass')).toBe(true)

    // The ring lands on the centre of the canvas, where this building is drawn.
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(near).toHaveBeenLastCalledWith(expect.any(Number))
    expect(near.mock.lastCall?.[0]).toBeGreaterThan(0)

    compass.setVisible(false)
    expect(root.dataset.visible).toBe('false')
    expect(document.documentElement.classList.contains('has-cursor-compass')).toBe(false)
    expect(near).toHaveBeenLastCalledWith(0)
    compass.dispose()
  })

  it('arrives at the centre of the canvas when no pointer has been seen', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 0, 0, -10)])
    const root = host.querySelector<HTMLElement>('.murcia-cursor-compass')!
    compass.setVisible(true)
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(root.style.transform).toBe('translate3d(400px, 300px, 0)')
    compass.dispose()
  })

  it('points at a building that is up and to the right of the ring ON SCREEN, its word to the right', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 2, 1.5, -10)])
    const mark = host.querySelector<HTMLElement>('[data-poi="servicios"]')!
    compass.setVisible(true)
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(parseFloat(mark.style.getPropertyValue('--mx'))).toBeGreaterThan(0)
    expect(parseFloat(mark.style.getPropertyValue('--my'))).toBeLessThan(0)
    const angle = parseFloat(mark.style.getPropertyValue('--angle'))
    expect(angle).toBeGreaterThan(0)
    expect(angle).toBeLessThan(90)
    expect(mark.dataset.side).toBe('right')
    compass.dispose()
  })

  it('points left when the building is to the left of the CURSOR, wherever the camera faces', () => {
    // The building sits dead centre of the screen; the pointer is to its right.
    const compass = new CursorCompass(host, canvas(), [landmark('blog', 0, 0, -10)])
    const mark = host.querySelector<HTMLElement>('[data-poi="blog"]')!
    compass.setVisible(true)
    move(700, 300)
    compass.update(camera(), 10)
    expect(parseFloat(mark.style.getPropertyValue('--mx'))).toBeLessThan(0)
    expect(parseFloat(mark.style.getPropertyValue('--angle'))).toBeCloseTo(-90, 3)
    expect(mark.dataset.side).toBe('left')
    compass.dispose()
  })

  it('marks a building near when the cursor is near it on screen, and only then', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('near', 0, 0, -10), landmark('far', 6, 0, -10)])
    compass.setVisible(true)
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(host.querySelector('[data-poi="near"]')?.hasAttribute('data-near')).toBe(true)
    expect(host.querySelector('[data-poi="far"]')?.hasAttribute('data-near')).toBe(false)
    expect(parseFloat(host.querySelector<HTMLElement>('[data-poi="far"]')!.style.getPropertyValue('--warmth'))).toBe(0)
    compass.dispose()
  })

  it('holds its last direction while the cursor sits on the building', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('blog', 0, 0, -10)])
    const mark = host.querySelector<HTMLElement>('[data-poi="blog"]')!
    compass.setVisible(true)
    move(100, 300)
    compass.update(camera(), 10)
    expect(parseFloat(mark.style.getPropertyValue('--angle'))).toBeCloseTo(90, 3)
    move(400, 300)
    compass.update(camera(), 10)
    expect(parseFloat(mark.style.getPropertyValue('--angle'))).toBeCloseTo(90, 3)
    compass.dispose()
  })

  it('keeps pointing at a building that has left the frame', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 30, 0, -10)])
    const mark = host.querySelector<HTMLElement>('[data-poi="servicios"]')!
    compass.setVisible(true)
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(parseFloat(mark.style.getPropertyValue('--mx'))).toBeGreaterThan(0)
    expect(parseFloat(mark.style.getPropertyValue('--angle'))).toBeCloseTo(90, 3)
    compass.dispose()
  })

  it('falls back to the ground bearing for a building behind the camera', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 0, 0, 10)])
    const mark = host.querySelector<HTMLElement>('[data-poi="servicios"]')!
    compass.setVisible(true)
    compass.arrive(camera())
    compass.update(camera(), 0.016)
    expect(parseFloat(mark.style.getPropertyValue('--my'))).toBeGreaterThan(0)
    expect(parseFloat(mark.style.getPropertyValue('--warmth'))).toBe(0)
    compass.dispose()
  })

  it('follows the pointer with a trail rather than snapping to it', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 0, 0, -10)])
    const root = host.querySelector<HTMLElement>('.murcia-cursor-compass')!
    compass.setVisible(true)

    move(100, 100)
    compass.update(camera(), 10)
    expect(root.style.transform).toBe('translate3d(100px, 100px, 0)')

    move(200, 200)
    compass.update(camera(), 0.001)
    const x = Number(root.style.transform.match(/translate3d\(([-\d.]+)px/)![1])
    expect(x).toBeGreaterThan(100)
    expect(x).toBeLessThan(110)
    compass.dispose()
  })

  it('takes down its root and its page class on dispose', () => {
    const compass = new CursorCompass(host, canvas(), [landmark('servicios', 0, 0, -10)])
    compass.setVisible(true)
    compass.dispose()
    expect(host.querySelector('.murcia-cursor-compass')).toBeNull()
    expect(document.documentElement.classList.contains('has-cursor-compass')).toBe(false)
  })
})
