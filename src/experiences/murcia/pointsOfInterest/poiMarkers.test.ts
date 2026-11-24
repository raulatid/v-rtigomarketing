// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPoiMarkers, nearestDot, type PoiSite } from './poiMarkers'
import { POI } from './poiConfig'

// A camera at the origin looking down -Z over a 1000×500 canvas: a point on
// the axis lands in the middle, one to its right lands right of the middle.
const RECT = { left: 0, top: 0, width: 1000, height: 500 }

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 2, 0.1, 100)
  c.updateMatrixWorld(true)
  return c
}

function site(id: PoiSite['id'], at: THREE.Vector3, hovered = () => false): PoiSite {
  return { id, anchor: (out) => out.copy(at), hovered }
}

let container: HTMLElement
let current: ReturnType<typeof createPoiMarkers> | null = null
afterEach(() => {
  // Disposed here, so a failed assertion does not leave its Escape listener behind.
  current?.dispose()
  current = null
  container?.remove()
})

function setup(sites: PoiSite[]) {
  container = document.createElement('div')
  document.body.append(container)
  const markers = createPoiMarkers(container, sites)
  current = markers
  const element = (id: string) => container.querySelector<HTMLElement>(`.murcia-poi__site[data-poi="${id}"]`)!
  return { markers, element, root: container.querySelector<HTMLElement>('.murcia-poi')! }
}

describe('nearestDot', () => {
  it('takes the nearest dot within reach, and none beyond it', () => {
    const dots = [
      { id: 'blog' as const, x: 100, y: 100 },
      { id: 'servicios' as const, x: 110, y: 100 },
    ]
    expect(nearestDot(dots, 108, 100, 18)).toBe('servicios')
    expect(nearestDot(dots, 100, 130, 18)).toBeNull()
  })
})

describe('the points of interest', () => {
  it('pins each dot to its place on screen, in the defined order, and drops one that is off screen', () => {
    const { markers, element, root } = setup([
      site('servicios', new THREE.Vector3(0, 0, -10)),
      site('blog', new THREE.Vector3(0, 0, 10)),
    ])
    markers.update(0, camera(), RECT, true)
    expect(root.dataset.visible).toBe('true')
    expect(element('servicios').style.transform).toBe('translate3d(500px, 250px, 0)')
    expect(element('servicios').dataset.onScreen).toBe('true')
    // Behind the camera: no position, and nothing to hit.
    expect(element('blog').dataset.onScreen).toBe('false')
    expect([...root.children].map((child) => (child as HTMLElement).dataset.poi)).toEqual(['blog', 'servicios'])
    expect(markers.dotAt(505, 250, false)).toBe('servicios')
  })

  it('names every place for the announcement, then lets the names go', () => {
    const { markers, element, root } = setup([site('blog', new THREE.Vector3(0, 0, -10))])
    markers.update(0, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    markers.announce()
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
    expect(root.dataset.announcing).toBe('true')
    markers.update(POI.announceSeconds, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    expect(root.dataset.announcing).toBe('false')
  })

  it('names a place under the pointer, by its dot or by the place itself', () => {
    let hovered = false
    const { markers, element } = setup([site('blog', new THREE.Vector3(0, 0, -10), () => hovered)])
    markers.setPointed('blog')
    markers.update(0, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
    markers.setPointed(null)
    markers.update(0, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    hovered = true
    markers.update(0, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
  })

  it('keeps a label up while the mouse is on it, and counts it as its dot (M12)', () => {
    const { markers, element } = setup([site('blog', new THREE.Vector3(0, 0, -10))])
    const label = element('blog').querySelector<HTMLElement>('.murcia-poi__label')!
    // jsdom lays nothing out: the label's box is set by hand, above the dot.
    label.getBoundingClientRect = () => ({ left: 470, right: 530, top: 200, bottom: 225 }) as DOMRect
    markers.update(0, camera(), RECT, true)
    // Not shown: the label is nothing to the pointer.
    expect(markers.dotAt(500, 210, false)).toBeNull()
    markers.setPointed('blog')
    markers.update(0, camera(), RECT, true)
    expect(markers.dotAt(500, 210, false)).toBe('blog')
    expect(markers.dotAt(560, 210, false)).toBeNull()
    // Not for a finger: a tap is the dot's alone.
    expect(markers.dotAt(500, 210, true)).toBeNull()
    // Put away by Escape: no longer counts either.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    markers.update(0, camera(), RECT, true)
    expect(markers.dotAt(500, 210, false)).toBeNull()
  })

  it('puts the labels away on Escape until the pointer has left the place (M12)', () => {
    const { markers, element } = setup([site('blog', new THREE.Vector3(0, 0, -10))])
    markers.announce()
    markers.setPointed('blog')
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    // Still on it: still away. Left, then back: named again.
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    markers.setPointed(null)
    markers.update(0.1, camera(), RECT, true)
    markers.setPointed('blog')
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
  })

  it('ends an announcement on Escape, and ignores Escape while hidden (M12)', () => {
    const { markers, element } = setup([site('blog', new THREE.Vector3(0, 0, -10))])
    markers.announce()
    markers.update(0, camera(), RECT, false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    // Hidden when pressed: the announcement is still there to show.
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('false')
    // Nothing under the pointer: a hover names it again at once.
    markers.setPointed('blog')
    markers.update(0.1, camera(), RECT, true)
    expect(element('blog').dataset.labelled).toBe('true')
  })

  it('answers nothing and names nothing while hidden', () => {
    const { markers, element, root } = setup([site('blog', new THREE.Vector3(0, 0, -10), () => true)])
    markers.announce()
    markers.update(0, camera(), RECT, false)
    expect(root.dataset.visible).toBe('false')
    expect(element('blog').dataset.labelled).toBe('false')
    expect(markers.dotAt(500, 250, true)).toBeNull()
  })

  it('leaves the container as it found it', () => {
    const { markers } = setup([site('blog', new THREE.Vector3(0, 0, -10))])
    markers.dispose()
    expect(container.children).toHaveLength(0)
  })
})
