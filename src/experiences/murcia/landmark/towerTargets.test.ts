import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createTowerTargets, measureScreenFrame } from './towerTargets'
import { VERTIGO_BUILDING } from './vertigoBuildingConfig'

// A 10 × 40 screen facing +X (a plane turned a quarter about Y), centred 20 up.
function screenMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 40), new THREE.MeshBasicMaterial())
  mesh.name = VERTIGO_BUILDING.screenNodeName
  mesh.rotation.y = Math.PI / 2
  mesh.position.set(5, 20, 0)
  return mesh
}

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

describe('the tower screen as a picture', () => {
  it('measures its centre, its facing, its height and its chord', () => {
    const frame = measureScreenFrame(screenMesh())!
    expect(frame.centre.toArray().map((v) => +v.toFixed(5))).toEqual([5, 20, 0])
    expect(frame.normal.x).toBeCloseTo(1)
    expect(frame.normal.z).toBeCloseTo(0)
    expect(frame.height).toBeCloseTo(40)
    expect(frame.width).toBeCloseTo(10)
  })
})

describe('the tower targets', () => {
  it('finds the screen and the LOWER mesh of the lobby, and stands the dots on them', () => {
    const root = new THREE.Group()
    root.add(screenMesh(), lobby())
    const tower = createTowerTargets(root, VERTIGO_BUILDING)
    expect(tower.screen?.name).toBe(VERTIGO_BUILDING.screenNodeName)
    expect(tower.base?.name).toBe('low')
    const dot = tower.screenAnchor(new THREE.Vector3())
    // A hair proud of the face, along its normal.
    expect(dot.x).toBeGreaterThan(5)
    expect(dot.y).toBeCloseTo(20)
    expect(tower.baseAnchor(new THREE.Vector3()).y).toBeCloseTo(3)
  })

  it('lights the screen through a shell nobody can hit, and only while lit', () => {
    const root = new THREE.Group()
    root.add(screenMesh())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tower = createTowerTargets(root, VERTIGO_BUILDING)
    const shell = tower.precompileTargets[0] as THREE.Mesh
    expect(shell.visible).toBe(false)
    const hits: THREE.Intersection[] = []
    shell.raycast(new THREE.Raycaster(), hits)
    expect(hits).toHaveLength(0)

    tower.setScreenHover(true)
    tower.update(1)
    expect(shell.visible).toBe(true)
    expect((shell.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0)
    tower.setScreenHover(false)
    tower.update(1)
    expect(shell.visible).toBe(false)

    tower.dispose()
    expect(shell.parent).toBeNull()
  })

  it('says so and carries on when the city has neither', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tower = createTowerTargets(new THREE.Group(), VERTIGO_BUILDING)
    expect(tower.screen).toBeNull()
    expect(tower.base).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(() => tower.update(0.016)).not.toThrow()
  })
})
