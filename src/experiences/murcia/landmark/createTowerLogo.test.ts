import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createTowerLogo } from './createTowerLogo'
import { VERTIGO_BUILDING } from './vertigoBuildingConfig'

// The Vertigo tower's logo turns. Asserted without a GLB or a renderer, on the
// same footing as loadCity.test.ts: the contract is a NAME and an AXIS, and
// everything the frame loop does to the node is arithmetic on its transform.

function city(names: readonly string[] = VERTIGO_BUILDING.logoNodeNames): THREE.Group {
  const root = new THREE.Group()
  for (const name of names) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.name = name
    mesh.position.set(-276, 50.3, 299.8)
    root.add(mesh)
  }
  return root
}

const logo = (root: THREE.Object3D, reducedMotion = false) =>
  createTowerLogo(root, VERTIGO_BUILDING, { reducedMotion })

describe('the tower logo', () => {
  it('resolves every node the contract names', () => {
    const root = city()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = logo(root)
    expect(s.nodeCount).toBe(VERTIGO_BUILDING.logoNodeNames.length)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns and turns nothing when the city has no logo', () => {
    // Optional by contract, like the river: the city must still load without
    // it, and the harness (checks/city-asset.ts) is what fails the export.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = logo(new THREE.Group())
    expect(s.nodeCount).toBe(0)
    expect(warn).toHaveBeenCalledTimes(VERTIGO_BUILDING.logoNodeNames.length)
    expect(() => s.update(0.016)).not.toThrow()
    warn.mockRestore()
  })

  it('turns about the configured axis at the configured rate, per second of delta', () => {
    const root = city()
    const s = logo(root)
    // Two half-second frames must land exactly where one one-second frame does:
    // the angle is speed × elapsed, never speed × frame count.
    s.update(0.5)
    s.update(0.5)
    const twoFrames = root.children.map((n) => n.quaternion.clone())

    const again = city()
    const s2 = logo(again)
    s2.update(1)
    again.children.forEach((n, i) => {
      expect(n.quaternion.angleTo(twoFrames[i])).toBeCloseTo(0, 6)
    })

    const expected = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      VERTIGO_BUILDING.logo.angularSpeedRadPerSec,
    )
    expect(again.children[0].quaternion.angleTo(expected)).toBeCloseTo(0, 6)
  })

  it('composes with the node’s own orientation and leaves position and scale alone', () => {
    const root = city()
    const node = root.children[0]
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0.1))
    node.quaternion.copy(base)
    node.scale.set(2, 3, 4)
    const position = node.position.clone()
    const s = logo(root)
    s.update(2)
    // The spin is applied in the node's LOCAL frame, on top of what Blender
    // authored: base × spin, so a re-export that tilts the mark keeps its tilt.
    const spin = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      2 * VERTIGO_BUILDING.logo.angularSpeedRadPerSec,
    )
    expect(node.quaternion.angleTo(base.clone().multiply(spin))).toBeCloseTo(0, 6)
    expect(node.position.equals(position)).toBe(true)
    expect(node.scale.toArray()).toEqual([2, 3, 4])
  })

  it('holds still under reduced motion', () => {
    const root = city()
    const before = root.children[0].quaternion.clone()
    logo(root, true).update(1)
    expect(root.children[0].quaternion.angleTo(before)).toBe(0)
  })

  it('never starts a frame loop of its own', () => {
    // Murcia has ONE update loop, driven by R3F through MurciaLayer. The plan
    // forbids a second, and the cheapest proof is the source itself.
    const source = fs.readFileSync(path.join(__dirname, 'createTowerLogo.ts'), 'utf8')
    expect(source).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/)
  })
})
