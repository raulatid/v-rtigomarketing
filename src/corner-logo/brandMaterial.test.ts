import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { applyBrandWhite } from './brandMaterial'

// The 3D mark is brand white and nothing else (plan 019 §3). Asserted on a
// bare group: what the GLB arrives with is replaced, what it arrives with is
// released, and nothing that is not a mesh is touched.

function model(): THREE.Group {
  const group = new THREE.Group()
  const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x336699 }))
  const b = new THREE.Mesh(new THREE.BoxGeometry(), [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
  ])
  group.add(a, b, new THREE.Object3D())
  return group
}

describe('applyBrandWhite', () => {
  it('gives every mesh an unlit white that the tone curve cannot grey', () => {
    const group = model()
    applyBrandWhite(group)
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
        expect((material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff)
        expect(material.toneMapped).toBe(false)
      }
    })
  })

  it('releases the materials the model arrived with, one dispose each', () => {
    const group = model()
    const arrived: THREE.Material[] = []
    group.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      arrived.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
    })
    const spies = arrived.map((m) => vi.spyOn(m, 'dispose'))
    applyBrandWhite(group)
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1)
  })

  it('keeps a multi-material mesh multi-material, so its groups still draw', () => {
    const group = model()
    applyBrandWhite(group)
    const b = group.children[1] as THREE.Mesh
    expect(Array.isArray(b.material)).toBe(true)
    expect((b.material as THREE.Material[]).length).toBe(2)
  })
})
