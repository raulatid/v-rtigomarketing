import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { configureTrimTextures, isConstantUv } from './loadCity'

// The trim sheet's two runtime invariants, asserted without a GLB, a renderer or
// a GPU. Both of them fail *silently* in the browser — a wrong wrap mode samples
// a neighbouring band and a duplicated texture just costs memory — so neither is
// something a screenshot would catch.

function texture(name: string): THREE.Texture {
  const tex = new THREE.Texture()
  tex.name = name
  return tex
}

/** A mesh carrying one standard material, which is what the GLB will ship. */
function meshWith(material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
}

describe('configureTrimTextures', () => {
  it('repeats along U and clamps along V', () => {
    // The layout the atlas is authored for: full-width bands stacked in V. A
    // facade tiles its trim along its own length, so U must repeat; V must not,
    // or a facade samples the cornice band above it.
    const map = texture('trim')
    const root = new THREE.Group()
    root.add(meshWith(new THREE.MeshStandardMaterial({ map })))

    configureTrimTextures(root)

    expect(map.wrapS).toBe(THREE.RepeatWrapping)
    expect(map.wrapT).toBe(THREE.ClampToEdgeWrapping)
  })

  it('reaches every texture slot, not only the base colour', () => {
    // Enumerated by `collectTextures` rather than by a hardcoded list of slot
    // names, so a normal or ORM map added later is covered without editing this.
    const map = texture('basecolor')
    const normalMap = texture('normal')
    const aoMap = texture('orm')
    const root = new THREE.Group()
    root.add(meshWith(new THREE.MeshStandardMaterial({ map, normalMap, aoMap })))

    configureTrimTextures(root)

    for (const tex of [map, normalMap, aoMap]) {
      expect(tex.wrapT, tex.name).toBe(THREE.ClampToEdgeWrapping)
      expect(tex.anisotropy, tex.name).toBe(4)
    }
  })

  it('configures a shared trim sheet once, however many materials reach it', () => {
    // The whole promise of a trim sheet is one texture behind many materials.
    // Walking meshes instead of distinct textures would set `needsUpdate` once
    // per material on a single GPU resource.
    const shared = texture('trim')
    const root = new THREE.Group()
    root.add(meshWith(new THREE.MeshStandardMaterial({ map: shared, name: 'facades' })))
    root.add(meshWith(new THREE.MeshStandardMaterial({ map: shared, name: 'glass' })))

    let updates = 0
    Object.defineProperty(shared, 'needsUpdate', {
      set() {
        updates += 1
      },
    })

    configureTrimTextures(root)

    expect(updates).toBe(1)
  })

  it('is a no-op on the untextured model that ships today', () => {
    const root = new THREE.Group()
    root.add(meshWith(new THREE.MeshStandardMaterial()))

    expect(() => configureTrimTextures(root)).not.toThrow()
  })

  it('sees materials shared through an array assignment', () => {
    // A multi-material mesh is how a building carrying both opaque architecture
    // and glass arrives from the exporter.
    const map = texture('trim')
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial({ map }),
    ])
    const root = new THREE.Group()
    root.add(mesh)

    configureTrimTextures(root)

    expect(map.wrapS).toBe(THREE.RepeatWrapping)
  })
})

describe('isConstantUv', () => {
  // The trap this exists for: `checks/city-asset.ts` reads the exported file and
  // can only ask whether TEXCOORD_0 is PRESENT. An attribute written once and
  // copied to every vertex is present, passes, and still samples one texel — so
  // the export goes green and the building comes out flat.

  function uv(pairs: number[][]): THREE.BufferAttribute {
    return new THREE.BufferAttribute(new Float32Array(pairs.flat()), 2)
  }

  it('catches an attribute that holds one value for every vertex', () => {
    // Measured shape: `suelo-principal` ships 106 vertices all at (0, 1).
    expect(isConstantUv(uv([[0, 1], [0, 1], [0, 1], [0, 1]]))).toBe(true)
  })

  it('passes a real unwrap, however small the variation', () => {
    // Exact equality rather than a tolerance: the case being caught is an
    // attribute copied from a constant, and those values are bit identical. A
    // tolerance would start calling tight, legitimate trims broken.
    expect(isConstantUv(uv([[0, 1], [0, 1], [0, 0.999], [0, 1]]))).toBe(false)
  })

  it('notices a U that varies while V does not', () => {
    // A band layout stacks in V, so V being constant across a face is normal
    // and only BOTH being constant is the defect.
    expect(isConstantUv(uv([[0, 0.5], [1, 0.5], [2, 0.5]]))).toBe(false)
  })

  it('says nothing about a missing or single-vertex attribute', () => {
    // Absent UVs are `meshesMissingUv`'s business, and one vertex cannot vary
    // from itself — reporting either here would double-count a mesh.
    expect(isConstantUv(undefined)).toBe(false)
    expect(isConstantUv(uv([[0, 1]]))).toBe(false)
  })
})
