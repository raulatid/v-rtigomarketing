// @vitest-environment jsdom
import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { CompassBar } from './compassBar'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// `update` runs every frame. A camera that has not moved changes no mark, and
// must not rewrite the marks' custom properties either.
it('rewrites a mark only when its values change', () => {
  // jsdom has no Web Animations; the arrival ring is not under test here.
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: vi.fn(), configurable: true })
  const bar = new CompassBar(document.body, [
    { id: 'north', label: 'North', anchor: (out) => out.set(0, 0, -100) },
    { id: 'east', label: 'East', anchor: (out) => out.set(100, 0, 0) },
  ])
  bar.setVisible(true)
  const camera = new THREE.PerspectiveCamera()
  bar.update(camera)

  const north = document.querySelector<HTMLElement>('[data-poi="north"]')!
  const offset = north.style.getPropertyValue('--offset')
  expect(offset).not.toBe('')
  const writes = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')

  bar.update(camera)
  expect(writes).not.toHaveBeenCalled()

  camera.rotation.y = 0.3
  bar.update(camera)
  expect(writes).toHaveBeenCalled()
  expect(north.style.getPropertyValue('--offset')).not.toBe(offset)
})
