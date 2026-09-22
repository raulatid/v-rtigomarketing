import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { attachLakeWater } from './lakeWater'
import { DEFAULT_RIO_WATER_CONFIG } from '../../water/rioWaterConfig'

// The lake takes the river's material. What is asserted here is the wiring
// around it, not the shader: that the meshes under the node are swapped and
// handed back, that the delta the host ticks is accumulated into the elapsed
// time the material wants, and that the lake's colours reach the uniforms.

function waterNode(): { node: THREE.Group; meshes: THREE.Mesh[] } {
  const node = new THREE.Group()
  const meshes = [0, 1].map(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial())
    node.add(mesh)
    return mesh
  })
  return { node, meshes }
}

describe('attachLakeWater', () => {
  it('puts the river material on every mesh and hands the originals back on dispose', () => {
    const { node, meshes } = waterNode()
    const originals = meshes.map((mesh) => mesh.material)

    const lake = attachLakeWater(node, DEFAULT_RIO_WATER_CONFIG)
    const shared = meshes[0]!.material
    expect(shared).toBeInstanceOf(THREE.ShaderMaterial)
    expect(meshes[1]!.material).toBe(shared)
    expect(originals).not.toContain(shared)

    lake.dispose()
    expect(meshes.map((mesh) => mesh.material)).toEqual(originals)
  })

  it('accumulates the frame delta into the elapsed time the material wants', () => {
    // `RioWater.update` takes elapsed seconds; the campus host ticks a delta.
    // Passing the delta through would pin the ripples near 1/60 s.
    const { node, meshes } = waterNode()
    const lake = attachLakeWater(node, DEFAULT_RIO_WATER_CONFIG)
    lake.update(0.25)
    lake.update(0.25)
    const uTime = (meshes[0]!.material as THREE.ShaderMaterial).uniforms['uTime']!.value
    expect(uTime).toBeCloseTo(0.5, 9)
  })

  it('configure carries the lake colours into the uniforms, sRGB converted', () => {
    const { node, meshes } = waterNode()
    const lake = attachLakeWater(node, DEFAULT_RIO_WATER_CONFIG)
    lake.configure({ ...DEFAULT_RIO_WATER_CONFIG, deepColor: 0x0d3a52 })

    const deep = (meshes[0]!.material as THREE.ShaderMaterial).uniforms['uDeepColor']!
      .value as THREE.Color
    expect(deep.getHex(THREE.SRGBColorSpace)).toBe(0x0d3a52)
  })
})
