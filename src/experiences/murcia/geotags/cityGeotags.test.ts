import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createCityGeotags, topOfNodes } from './cityGeotags'
import { CAMPUS_BUILDING_NODE_NAMES } from '../campus/campusConfig'
import { BLOG_PANEL_HALF_RISE } from './geotagConfig'

/** A box `height` tall standing on the ground, under `name`. */
function building(name: string, height: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, height, 10), new THREE.MeshBasicMaterial())
  mesh.name = THREE.PropertyBinding.sanitizeNodeName(name)
  mesh.position.y = height / 2
  return mesh
}

const place = (x: number, y: number, pulse = 0) => ({
  anchor: (out: THREE.Vector3) => out.set(x, y, 0),
  highlightPulse: pulse,
})

describe('topOfNodes', () => {
  it('is the highest point of the named nodes', () => {
    const root = new THREE.Group()
    root.add(building('a', 12), building('b', 30), building('elsewhere', 99))
    expect(topOfNodes(root, ['a', 'b'])).toBeCloseTo(30, 10)
  })

  it('is null when none of them is in the city', () => {
    expect(topOfNodes(new THREE.Group(), ['a'])).toBeNull()
  })
})

describe('createCityGeotags', () => {
  const pinBase = (tags: NonNullable<ReturnType<typeof createCityGeotags>>, id: string) => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 5000)
    tags.setVisible(true)
    tags.update(0, camera)
    return tags.object3D.getObjectByName(`geotag:${id}`)!.position
  }

  it('stands the campus pin over the lake, at the tallest campus building', () => {
    const root = new THREE.Group()
    root.add(building(CAMPUS_BUILDING_NODE_NAMES[0], 25), building(CAMPUS_BUILDING_NODE_NAMES[1], 40))
    const tags = createCityGeotags({ root, campus: place(7, 0), blog: null, reducedMotion: true })!
    const at = pinBase(tags, 'servicios')
    expect(at.x).toBe(7)
    expect(at.y).toBeCloseTo(40 + 6, 10)
  })

  it('stands the blog pin over the top edge of the panel', () => {
    const tags = createCityGeotags({
      root: new THREE.Group(),
      campus: null,
      blog: place(-3, 50),
      reducedMotion: true,
    })!
    const at = pinBase(tags, 'blog')
    expect(at.x).toBe(-3)
    expect(at.y).toBeCloseTo(50 + BLOG_PANEL_HALF_RISE + 6, 10)
  })

  it('pins only what loaded, and makes nothing when neither did', () => {
    expect(createCityGeotags({ root: new THREE.Group(), campus: null, blog: null, reducedMotion: true })).toBeNull()
  })

  it('skips the campus, loudly, when its buildings are not in the city', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tags = createCityGeotags({
      root: new THREE.Group(),
      campus: place(0, 0),
      blog: place(0, 0),
      reducedMotion: true,
    })!
    expect(tags.object3D.children.map((pin) => pin.name)).toEqual(['geotag:blog'])
    expect(error).toHaveBeenCalledWith(expect.stringContaining('campus'))
    error.mockRestore()
  })
})
