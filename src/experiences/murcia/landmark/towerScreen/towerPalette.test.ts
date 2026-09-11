import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { applyTowerPalette, TOWER_PALETTE } from './towerPalette'

// The tower's look travels as names, because the city ships it with no
// materials and dresses every mesh in its own. Asserted on a stand-in tree with
// the city's material already on every mesh, as `loadCity` leaves it.

const CITY_MATERIAL = new THREE.MeshStandardMaterial({ name: 'city-trim' })

function mesh(name: string): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), CITY_MATERIAL)
  object.name = name
  return object
}

function tower(): THREE.Group {
  const root = new THREE.Group()
  for (const name of Object.keys(TOWER_PALETTE)) {
    if (name !== 'BRAND_VERTIGO') root.add(mesh(name))
  }
  // Exported with two primitives, which arrive as a group of two meshes.
  const brand = new THREE.Group()
  brand.name = 'BRAND_VERTIGO'
  brand.add(mesh('VERTIGO_Uppercase'), mesh('VERTIGO_Uppercase_1'))
  root.add(brand)
  return root
}

const materialOf = (root: THREE.Object3D, name: string) =>
  (root.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial

describe('the tower palette', () => {
  it('dresses every part in its own colour, with no metalness', () => {
    const root = tower()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(applyTowerPalette(root)).toBe(Object.keys(TOWER_PALETTE).length)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()

    const deepBlue = materialOf(root, 'ARCH_Glass_DeepBlue')
    expect(deepBlue).not.toBe(CITY_MATERIAL)
    expect(deepBlue.metalness).toBe(0)
    expect(deepBlue.color.r).toBeCloseTo(0.032, 5)
    expect(deepBlue.color.b).toBeCloseTo(0.098, 5)
    // Replaced, never mutated: every other building still wears this.
    expect(CITY_MATERIAL.color.getHex()).toBe(0xffffff)
  })

  it('keeps the lobby glass see-through', () => {
    const root = tower()
    applyTowerPalette(root)
    const lobby = materialOf(root, 'ARCH_Glass_Lobby')
    expect(lobby.transparent).toBe(true)
    expect(lobby.opacity).toBeCloseTo(0.24, 5)
  })

  it('dresses every mesh under a node exported as several primitives', () => {
    const root = tower()
    applyTowerPalette(root)
    expect(materialOf(root, 'VERTIGO_Uppercase')).toBe(materialOf(root, 'VERTIGO_Uppercase_1'))
    expect(materialOf(root, 'VERTIGO_Uppercase').name).toBe('MAT_BRAND_VERTIGO')
  })

  it('warns about a tower part it has no colour for, and leaves it alone', () => {
    // `ARCH_Light_Warm` was removed from the export; if it comes back, it is
    // told about rather than silently worn in the city's material.
    const root = tower()
    root.add(mesh('ARCH_Light_Warm'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyTowerPalette(root)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('ARCH_Light_Warm')
    expect(materialOf(root, 'ARCH_Light_Warm')).toBe(CITY_MATERIAL)
    warn.mockRestore()
  })

  it('leaves another building\'s ARCH_ parts alone, and says nothing about them', () => {
    // murcia-v6 ships the services campus beside the tower, and its parts share
    // the prefix. They are not tower parts, so they are neither dressed nor
    // warned about: a warning per campus part on every load would bury the one
    // that means a tower part lost its colour.
    const city = new THREE.Group()
    city.add(tower(), mesh('ARCH_Porcelain_White'), mesh('ARCH_Vertigo_Blue'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(applyTowerPalette(city)).toBe(Object.keys(TOWER_PALETTE).length)
    expect(warn).not.toHaveBeenCalled()
    expect(materialOf(city, 'ARCH_Porcelain_White')).toBe(CITY_MATERIAL)
    warn.mockRestore()
  })
})
