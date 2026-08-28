import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyTrimSheet, CITY_MATERIAL_NAME, GROUND_MATERIAL_NAME } from './applyTrimSheet'
import { isCompressedTexturePath } from './loadTrimSheet'
import type { TrimSheet } from './loadTrimSheet'
import { collectTextures } from '../../../graphics/disposal'

// What the city's material has to be true of, asserted without a GLB, a
// renderer or a GPU. Every one of these fails silently in the browser: a second
// material is invisible until somebody reads a profiler, a map on the terrain
// plate only shows up hundreds of units away on the skirt, and a wrong name
// only breaks a harness nobody re-reads.

function sheet(textures: TrimSheet['textures'] = {}): TrimSheet {
  return { textures }
}

function named(name: string): THREE.Texture {
  const tex = new THREE.Texture()
  tex.name = name
  return tex
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
    // The promise of a trim sheet is many surfaces behind few materials, and
    // `check:asset`'s MATERIAL_CEILING of 4 is that promise written down. One
    // material per mesh would render identically and cost 222 of them.
    const { root, meshes, terrain } = city(5)

    applyTrimSheet({ root, sheet: sheet({ baseColor: named('base') }), terrain, authored: false })

    const distinct = new Set(meshes.map((mesh) => mesh.material))
    expect(distinct.size).toBe(1)
  })

  it('keeps the trim sheet off the terrain plate', () => {
    // Not squeamishness about the ground. `createTerrainTransition` clones the
    // plate's material for the collar and the skirt, and both of those
    // geometries are built from positions and vertex colours with NO uv
    // attribute — so a map inherited down that chain samples texel (0,0) across
    // the whole horizon.
    const { root, terrain } = city(3)

    const applied = applyTrimSheet({
      root,
      sheet: sheet({ baseColor: named('base') }),
      terrain,
      authored: false,
    })

    const ground = terrain.material as THREE.MeshStandardMaterial
    expect(ground).toBe(applied.ground)
    expect(ground.name).toBe(GROUND_MATERIAL_NAME)
    expect(ground.map).toBeNull()
  })

  it('lights the ground the same way it lights the buildings', () => {
    // The plate is separated to keep the MAP off it, not to give it a different
    // response. Leaving it on the fabricated metalness-1 default would trade the
    // bug being fixed for a new inconsistency between ground and buildings.
    const { root, terrain } = city(2)

    const applied = applyTrimSheet({ root, sheet: sheet(), terrain, authored: false })
    const buildings = applied.textured[0] as THREE.MeshStandardMaterial
    const ground = applied.ground as THREE.MeshStandardMaterial

    expect(ground.metalness).toBe(buildings.metalness)
    expect(ground.roughness).toBe(buildings.roughness)
  })

  it('never writes to the material it displaces', () => {
    // That instance is shared by every primitive of this load, so setting a map
    // on it would texture the whole city at once — including the plate this
    // function just went to the trouble of excluding.
    const { root, terrain, fabricated } = city(2)

    applyTrimSheet({ root, sheet: sheet({ baseColor: named('base') }), terrain, authored: false })

    expect(fabricated.map).toBeNull()
    expect(fabricated.metalness).toBe(1)
  })

  it('carries the name the district harness asserts against', () => {
    // `checks/district-flight.ts` proves the highlight path keeps the trim sheet
    // using a fixture material of this name. A rename here would leave that
    // harness green and testing nothing.
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, sheet: sheet(), terrain, authored: false })

    expect(applied.textured[0].name).toBe(CITY_MATERIAL_NAME)
  })

  it('is not metallic', () => {
    // GLTFLoader's fabricated default is `metalness: 1`, and this scene has no
    // environment map — a fully metallic surface has almost no diffuse term, so
    // a base colour on it is very nearly invisible. Without this the sheet would
    // look like it had failed to load.
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, sheet: sheet(), terrain, authored: false })

    expect((applied.textured[0] as THREE.MeshStandardMaterial).metalness).toBe(0)
  })

  it('routes each map to its slot and omits the ones that are absent', () => {
    const base = named('base')
    const normal = named('normal')
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({
      root,
      sheet: sheet({ baseColor: base, normal }),
      terrain,
      authored: false,
    })
    const material = applied.textured[0] as THREE.MeshStandardMaterial

    expect(material.map).toBe(base)
    expect(material.normalMap).toBe(normal)
    // Not a black or white stand-in: a wrong ORM is worse than none.
    expect(material.aoMap).toBeNull()
    expect(material.roughnessMap).toBeNull()
  })

  it('shares one ORM texture across the three slots it packs, and disposal sees it once', () => {
    // The glTF packing is occlusion/roughness/metallic in one image. Three reads
    // the UV set from `Texture.channel`, which belongs to the texture rather
    // than the slot, so one instance cannot disagree with itself about which
    // UVs to use — and `collectTextures` dedupes it, so `disposeObject3D` will
    // not free it three times.
    const orm = named('orm')
    const { root, terrain } = city(1)

    const applied = applyTrimSheet({ root, sheet: sheet({ orm }), terrain, authored: false })
    const material = applied.textured[0] as THREE.MeshStandardMaterial

    expect(material.aoMap).toBe(orm)
    expect(material.roughnessMap).toBe(orm)
    expect(material.metalnessMap).toBe(orm)
    expect(orm.channel).toBe(0)

    const found = new Set<THREE.Texture>()
    collectTextures(material, found)
    expect(found.size).toBe(1)
  })
})

describe('applyTrimSheet, on a GLB that declares its own materials', () => {
  it('dresses the authored material instead of replacing it', () => {
    // The state after the artist's re-export: the export contract §6.4 asks for
    // one authored material, and `DistrictHighlight` reads an authored emissive
    // and SCALES rather than overwrites it. Replacing the material would throw
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
    const base = named('base')

    applyTrimSheet({ root, sheet: sheet({ baseColor: base }), terrain: null, authored: true })

    expect(mesh.material).toBe(authoredMaterial)
    expect(authoredMaterial.map).toBe(base)
    expect(authoredMaterial.name).toBe('ciudad')
    expect(authoredMaterial.color.getHex()).toBe(0x8899aa)
    expect(authoredMaterial.emissive.getHex()).toBe(0xff8800)
    expect(authoredMaterial.roughness).toBe(0.4)
  })

  it('still keeps the sheet off the terrain plate', () => {
    const authoredMaterial = new THREE.MeshStandardMaterial({ name: 'ciudad' })
    const groundMaterial = new THREE.MeshStandardMaterial({ name: 'suelo' })
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), authoredMaterial))
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundMaterial)
    root.add(terrain)

    applyTrimSheet({ root, sheet: sheet({ baseColor: named('base') }), terrain, authored: true })

    expect(authoredMaterial.map).not.toBeNull()
    expect(groundMaterial.map).toBeNull()
  })
})

describe('isCompressedTexturePath', () => {
  // The whole PNG-now / KTX2-later migration is this one predicate, so it is
  // asserted rather than trusted to a manual swap.
  it('recognises a KTX2 file, whatever the case or query string', () => {
    expect(isCompressedTexturePath('/textures/murcia/murcia-basecolor.ktx2')).toBe(true)
    expect(isCompressedTexturePath('/textures/murcia/MURCIA-BASECOLOR.KTX2')).toBe(true)
    expect(isCompressedTexturePath('/textures/murcia/murcia-basecolor.ktx2?v=2')).toBe(true)
  })

  it('sends everything else to the plain loader', () => {
    expect(isCompressedTexturePath('/textures/murcia/murcia-basecolor.png')).toBe(false)
    expect(isCompressedTexturePath('/textures/murcia/murcia-basecolor.jpg')).toBe(false)
    // Not a substring match: a directory named for the format must not decide
    // the loader.
    expect(isCompressedTexturePath('/textures/ktx2/sheet.png')).toBe(false)
  })
})
