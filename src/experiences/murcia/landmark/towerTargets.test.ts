import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createTowerTargets } from './towerTargets'
import { VERTIGO_BUILDING } from './vertigoBuildingConfig'

// The lobby's node with two primitives: the street-level glazing and a taller part.
function lobby(): THREE.Group {
  const node = new THREE.Group()
  node.name = VERTIGO_BUILDING.baseNodeName
  const low = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), new THREE.MeshBasicMaterial())
  low.name = 'low'
  low.position.y = 3
  const tall = new THREE.Mesh(new THREE.BoxGeometry(4, 40, 4), new THREE.MeshBasicMaterial())
  tall.name = 'tall'
  tall.position.y = 20
  node.add(low, tall)
  return node
}

afterEach(() => vi.restoreAllMocks())

describe('the tower targets', () => {
  it('finds the LOWER mesh of the lobby, and stands the dot on it', () => {
    const root = new THREE.Group()
    root.add(lobby())
    const tower = createTowerTargets(root, VERTIGO_BUILDING)
    expect(tower.base?.name).toBe('low')
    expect(tower.baseAnchor(new THREE.Vector3()).y).toBeCloseTo(3)
  })

  it('says so and carries on when the city has no base', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tower = createTowerTargets(new THREE.Group(), VERTIGO_BUILDING)
    expect(tower.base).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(() => tower.update(0.016)).not.toThrow()
  })
})
