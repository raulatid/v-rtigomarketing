import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { applyCampusPalette, CAMPUS_PALETTE } from './campusPalette'
import { CAMPUS_PART_NODE_NAMES } from './campusConfig'

// The campus's look travels as names, because the city ships it with no
// materials and dresses every mesh in its own. Asserted on a stand-in tree with
// the city's material already on every mesh, as `loadCity` leaves it, and with
// the names spelled the way GLTFLoader leaves them (dots stripped).

const CITY_MATERIAL = new THREE.MeshStandardMaterial({ name: 'city-trim' })

function mesh(name: string): THREE.Mesh {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), CITY_MATERIAL)
  object.name = THREE.PropertyBinding.sanitizeNodeName(name)
  return object
}

function campus(skip: readonly string[] = []): THREE.Group {
  const root = new THREE.Group()
  for (const name of CAMPUS_PART_NODE_NAMES) if (!skip.includes(name)) root.add(mesh(name))
  root.add(mesh('PARK_Water'), mesh('CAMPUS_SCREEN_Continuous'), mesh('Edificios_Procedurales'))
  return root
}

const materialOf = (root: THREE.Object3D, name: string) =>
  (root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) as THREE.Mesh)
    .material as THREE.MeshStandardMaterial

describe('the campus palette', () => {
  it('has exactly one colour per configured part', () => {
    expect(Object.keys(CAMPUS_PALETTE).sort()).toEqual([...CAMPUS_PART_NODE_NAMES].sort())
  })

  it('dresses every part in its own authored colour, metalness and roughness', () => {
    const root = campus()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(applyCampusPalette(root)).toBe(CAMPUS_PART_NODE_NAMES.length)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()

    const glazing = materialOf(root, 'ARCH_Glazing_Opaque_Blue')
    expect(glazing).not.toBe(CITY_MATERIAL)
    expect(glazing.name).toBe('MAT_ARCH_Glazing_Opaque_Blue')
    expect(glazing.color.r).toBeCloseTo(0.055, 5)
    expect(glazing.metalness).toBeCloseTo(0.43, 5)
    expect(glazing.roughness).toBeCloseTo(0.2, 5)
    // Replaced, never mutated: every other building still wears this.
    expect(CITY_MATERIAL.color.getHex()).toBe(0xffffff)
  })

  it('finds the dotted roof cap under the name the loader gave it', () => {
    const root = campus()
    applyCampusPalette(root)
    expect(materialOf(root, 'ARCH_Porcelain_White.001').name).toBe('MAT_ARCH_Porcelain_White.001')
  })

  it('lights the blue strips with their authored emissive strength', () => {
    const root = campus()
    applyCampusPalette(root)
    const light = materialOf(root, 'ARCH_Blue_Light')
    expect(light.emissive.b).toBeCloseTo(1, 5)
    expect(light.emissiveIntensity).toBeCloseTo(2.185, 5)
    expect(materialOf(root, 'PARK_Grass').emissive.getHex()).toBe(0)
  })

  it('leaves the water, the strip and the rest of the city in the city material', () => {
    const root = campus()
    applyCampusPalette(root)
    expect(materialOf(root, 'PARK_Water')).toBe(CITY_MATERIAL)
    expect(materialOf(root, 'CAMPUS_SCREEN_Continuous')).toBe(CITY_MATERIAL)
    expect(materialOf(root, 'Edificios_Procedurales')).toBe(CITY_MATERIAL)
  })

  it('names the parts a partial export is missing, and still dresses the rest', () => {
    const root = campus(['PARK_Trunks'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(applyCampusPalette(root)).toBe(CAMPUS_PART_NODE_NAMES.length - 1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('PARK_Trunks')
    warn.mockRestore()
  })

  it('says nothing about a city with no campus in it', () => {
    const city = new THREE.Group()
    city.add(mesh('Edificios_Procedurales'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(applyCampusPalette(city)).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
