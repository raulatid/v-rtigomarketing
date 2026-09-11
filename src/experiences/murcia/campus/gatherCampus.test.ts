import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAMPUS_GROUP_NAME, gatherCampus } from './gatherCampus'
import { CAMPUS_NODE_NAMES } from './campusConfig'

// The campus arrives as root-level siblings of the whole city. Gathering them
// must change which root the lab's code sees, and nothing else: every node
// stays exactly where it was in the world.

function city(): { root: THREE.Group; campusNodes: THREE.Object3D[] } {
  const root = new THREE.Group()
  // A city root that is itself transformed, so a gather that dropped the
  // parent's matrix would move everything and be caught.
  root.position.set(3, 0, -2)
  const campusNodes = CAMPUS_NODE_NAMES.map((name, i) => {
    const node = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    node.name = THREE.PropertyBinding.sanitizeNodeName(name)
    node.position.set(-126.6 + i, 0.235, 423.9)
    node.quaternion.set(0, -0.8262, 0, 0.5633).normalize()
    root.add(node)
    return node
  })
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  other.name = 'Edificios_Procedurales'
  root.add(other)
  return { root, campusNodes }
}

describe('gathering the campus', () => {
  it('puts every campus node under one group, and nothing else', () => {
    const { root } = city()
    const group = gatherCampus(root)
    expect(group?.name).toBe(CAMPUS_GROUP_NAME)
    expect(group?.children.length).toBe(CAMPUS_NODE_NAMES.length)
    expect(root.getObjectByName('Edificios_Procedurales')?.parent).toBe(root)
  })

  it('moves nothing in the world', () => {
    const { root, campusNodes } = city()
    root.updateMatrixWorld(true)
    const before = campusNodes.map((node) => node.matrixWorld.clone())
    gatherCampus(root)
    root.updateMatrixWorld(true)
    campusNodes.forEach((node, i) => {
      const after = node.matrixWorld.elements
      before[i]!.elements.forEach((value, k) => expect(after[k]).toBeCloseTo(value, 6))
    })
  })

  it('returns the same group when asked twice', () => {
    const { root } = city()
    const first = gatherCampus(root)
    expect(gatherCampus(root)).toBe(first)
    expect(first?.children.length).toBe(CAMPUS_NODE_NAMES.length)
  })

  it('is null for a city with no campus in it', () => {
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    expect(gatherCampus(root)).toBeNull()
  })
})
