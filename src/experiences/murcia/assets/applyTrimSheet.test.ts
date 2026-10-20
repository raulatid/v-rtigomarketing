import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  applyTrimSheet,
  CITY_MATERIAL_NAME,
  CITY_VERTEX_COLOR_MATERIAL_NAME,
  GROUND_MATERIAL_NAME,
} from './applyTrimSheet'

// What the city's material has to be true of, asserted without a GLB, a
// renderer or a GPU. Every one of these fails silently in the browser: a second
// material is invisible until somebody reads a profiler, a wrong ground
// material only shows up hundreds of units away on the skirt, and a wrong name
// only breaks a harness nobody re-reads.

/** Gives a mesh a white COLOR_0, as GLTFLoader names it: `color`, RGBA. */
function coloured(mesh: THREE.Mesh): void {
  const count = mesh.geometry.getAttribute('position').count
  mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 4).fill(1), 4))
}

/**
 * A city as GLTFLoader hands it over when the GLB declares no materials: one
 * fabricated `MeshStandardMaterial` instance shared by every primitive.
 */
function city(meshCount: number): {
  root: THREE.Group
  meshes: THREE.Mesh[]
  terrain: THREE.Mesh
  fabricated: THREE.MeshStandardMaterial
} {
  const root = new THREE.Group()
  const fabricated = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 1 })
  const meshes: THREE.Mesh[] = []
  for (let i = 0; i < meshCount; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), fabricated)
    meshes.push(mesh)
    root.add(mesh)
  }
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), fabricated)
  terrain.name = 'suelo-principal'
  root.add(terrain)
  return { root, meshes, terrain, fabricated }
}

describe('applyTrimSheet, on a GLB that declares no materials', () => {
  it('gives every building the same material instance', () => {
    // Many surfaces behind few materials: `check:asset`'s MATERIAL_CEILING of 4
    // is that rule written down. One material per mesh would render identically
    // and cost 222 of them.
    const { root, meshes, terrain } = city(5)

    applyTrimSheet({ root, terrain, authored: false })

    const distinct = new Set(meshes.map((mesh) => mesh.material))
    expect(distinct.size).toBe(1)
  })

  it('gives the terrain plate its own ground material', () => {
    // `createTerrainTransition` clones the plate's material for the collar and
    // the skirt, so the plate's material is the horizon's.
    const { root, terrain } = city(3)

    const applied = applyTrimSheet({
      root,
      terrain,
      authored: false,
    })

    const ground = terrain.material as THREE.MeshStandardMaterial
    expect(ground).toBe(applied.ground)
    expect(ground.name).toBe(GROUND_MATERIAL_NAME)
  })

  it('lights the ground the same way it lights the buildings', () => {
    // The plate is separated to give it its own colour, not a different
    // response. Leaving it on the fabricated metalness-1 default would trade the
    // bug being fixed for a new inconsistency between ground and buildings.
    const { root, terrain } = city(2)

    const applied = applyTrimSheet({ root, terrain, authored: false })
    const buildings = applied.textured[0] as THREE.MeshStandardMaterial
    const ground = applied.ground as THREE.MeshStandardMaterial

    expect(ground.metalness).toBe(buildings.metalness)
    expect(ground.roughness).toBe(buildings.roughness)
  })

  it('tints the ground with the colour it is given, and only the ground', () => {
    // The plate is the one large flat surface in the scene, so its albedo is
    // what decides how bright the floor is. At white it reached 227/255 and the
    // warp's borrowed bloom pass caught it. The buildings take their colour from
    // their vertex colour and must not be tinted with it.
    const { root, terrain } = city(2)

    const applied = applyTrimSheet({
      root,
      terrain,
      authored: false,
      groundColor: 0x8a8f94,
    })

    expect((applied.ground as THREE.MeshStandardMaterial).color.getHex()).toBe(0x8a8f94)
    expect((applied.textured[0] as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff)
  })

  it('leaves the ground white when no colour is given', () => {
    // A caller that only wants geometry has no opinion about the art, and the
    // absent case must stay the material's own default rather than some
    // fallback invented here.
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, terrain, authored: false })

    expect((applied.ground as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff)
  })

  it('never writes to the material it displaces', () => {
    // That instance is shared by every primitive of this load, so writing to it
    // would recolour the whole city at once — including the plate this function
    // just went to the trouble of separating.
    const { root, terrain, fabricated } = city(2)

    applyTrimSheet({ root, terrain, authored: false })

    expect(fabricated.map).toBeNull()
    expect(fabricated.metalness).toBe(1)
  })

  it('carries the name plan 001 specified', () => {
    // Nothing downstream reads the name since the display district's harness
    // went (plan 024); it is pinned so a rename is a decision, not an accident.
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, terrain, authored: false })

    expect(applied.textured[0].name).toBe(CITY_MATERIAL_NAME)
  })

  it('is not metallic', () => {
    // GLTFLoader's fabricated default is `metalness: 1`, and this scene has no
    // environment map — a fully metallic surface has almost no diffuse term, so
    // a base colour on it is very nearly invisible.
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, terrain, authored: false })

    expect((applied.textured[0] as THREE.MeshStandardMaterial).metalness).toBe(0)
  })

  it('gives every coloured building ONE shared vertex-colour material, and the rest the plain one', () => {
    // COLOR_0 is the per-building tint layer. The split is per shader variant,
    // not per mesh: a material per coloured mesh would be hundreds of them.
    const { root, meshes, terrain } = city(4)
    coloured(meshes[0])
    coloured(meshes[1])

    const applied = applyTrimSheet({ root, terrain, authored: false })
    const plain = meshes[2].material as THREE.MeshStandardMaterial
    const tinted = meshes[0].material as THREE.MeshStandardMaterial

    expect(meshes[1].material).toBe(tinted)
    expect(meshes[3].material).toBe(plain)
    expect(tinted).not.toBe(plain)
    expect(tinted.vertexColors).toBe(true)
    expect(tinted.name).toBe(CITY_VERTEX_COLOR_MATERIAL_NAME)
    // Without it a building with no COLOR_0 reads (0,0,0,1) and renders black.
    expect(plain.vertexColors).toBe(false)
    expect(plain.name).toBe(CITY_MATERIAL_NAME)
    expect(applied.textured).toEqual([plain, tinted])
  })

  it('lets the vertex-colour material differ from the plain one ONLY in vertexColors', () => {
    // Same lighting: white COLOR_0 must reproduce the plain material exactly,
    // or the comparison the experiment rests on is void.
    const { root, meshes, terrain } = city(2)
    coloured(meshes[0])

    applyTrimSheet({ root, terrain, authored: false })
    const tinted = meshes[0].material as THREE.MeshStandardMaterial
    const plain = meshes[1].material as THREE.MeshStandardMaterial

    expect(tinted.metalness).toBe(plain.metalness)
    expect(tinted.roughness).toBe(plain.roughness)
    expect(tinted.color.getHex()).toBe(plain.color.getHex())
  })

  it('creates no vertex-colour material when no building is coloured', () => {
    // The shipped city has no COLOR_0: its material set must be exactly today's.
    const { root, terrain } = city(3)

    const applied = applyTrimSheet({ root, terrain, authored: false })

    expect(applied.textured).toHaveLength(1)
    expect((applied.textured[0] as THREE.MeshStandardMaterial).vertexColors).toBe(false)
  })

  it('keeps the ground on its own material even when the plate carries COLOR_0', () => {
    // A coloured plate must not become a building: the collar and skirt clone
    // its material across the horizon.
    const { root, terrain } = city(1)
    coloured(terrain)

    const applied = applyTrimSheet({ root, terrain, authored: false })

    expect(terrain.material).toBe(applied.ground)
    expect(applied.textured).toHaveLength(1)
  })
})

describe('applyTrimSheet, on a GLB that declares its own materials', () => {
  it('leaves the authored materials untouched', () => {
    // The artist's export: `DistrictHighlight` reads an authored emissive and
    // SCALES rather than overwrites it. Replacing the material would throw
    // both away silently — plan 001 Phase 4 exists to prevent exactly this.
    const authoredMaterial = new THREE.MeshStandardMaterial({
      name: 'ciudad',
      color: 0x8899aa,
      emissive: 0xff8800,
      roughness: 0.4,
    })
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), authoredMaterial)
    root.add(mesh)

    const applied = applyTrimSheet({ root, terrain: null, authored: true })

    expect(applied.textured).toEqual([])
    expect(mesh.material).toBe(authoredMaterial)
    expect(authoredMaterial.name).toBe('ciudad')
    expect(authoredMaterial.color.getHex()).toBe(0x8899aa)
    expect(authoredMaterial.emissive.getHex()).toBe(0xff8800)
    expect(authoredMaterial.roughness).toBe(0.4)
  })

  it('does not tint an authored ground material', () => {
    // Same rule as the emissive above: once the artist exports a material, the
    // config's colour is a default that has been superseded, not an override.
    const authoredMaterial = new THREE.MeshStandardMaterial({ name: 'ciudad' })
    const groundMaterial = new THREE.MeshStandardMaterial({ name: 'suelo', color: 0x223344 })
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), authoredMaterial))
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundMaterial)
    root.add(terrain)

    const applied = applyTrimSheet({
      root,
      terrain,
      authored: true,
      groundColor: 0x8a8f94,
    })

    expect(applied.ground).toBeNull()
    expect(terrain.material).toBe(groundMaterial)
    expect(groundMaterial.color.getHex()).toBe(0x223344)
  })
})
