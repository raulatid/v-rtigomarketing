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
afterEach(() => container?.remove())

function setup(sites: PoiSite[]) {
  container = document.createElement('div')
  document.body.append(container)
  const markers = createPoiMarkers(container, sites)
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
