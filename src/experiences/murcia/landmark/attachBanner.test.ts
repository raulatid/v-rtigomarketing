import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { applyBanner, bannerFaceUvs, resolveBannerSource } from './attachBanner'
import { VERTIGO_BUILDING } from './vertigoBuildingConfig'

// The banner on the Vertigo tower's sign, asserted without a GLB, a renderer
// or a network: what the content resolves to, how the band's faces are
// mapped, and what the material application does to the mesh it is given.

/** A band like the export's: four side faces, no top or bottom, normals out. */
function band(width = 9.77, height = 5.32): THREE.Mesh {
  const box = new THREE.BoxGeometry(width, height, width)
  // BoxGeometry orders its faces +x, -x, +y, -y, +z, -z, six vertices each
  // after indexing; drop the two Y faces by rebuilding without their groups.
  const g = box.toNonIndexed()
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const keep: number[] = []
  for (let i = 0; i < pos.count; i++) if (Math.abs(nor.getY(i)) < 0.5) keep.push(i)
  const out = new THREE.BufferGeometry()
  const p = new Float32Array(keep.length * 3)
  const n = new Float32Array(keep.length * 3)
  keep.forEach((i, k) => {
    p.set([pos.getX(i), pos.getY(i), pos.getZ(i)], k * 3)
    n.set([nor.getX(i), nor.getY(i), nor.getZ(i)], k * 3)
  })
  out.setAttribute('position', new THREE.BufferAttribute(p, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  // The export's UVs: a top-down projection, useless for an image on a side.
  const uv = new Float32Array(keep.length * 2)
  keep.forEach((i, k) => uv.set([(pos.getX(i) + width / 2) / width, (pos.getZ(i) + width / 2) / width], k * 2))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const mesh = new THREE.Mesh(out, new THREE.MeshStandardMaterial({ name: 'MAT_CITY_BUILDINGS' }))
  mesh.name = VERTIGO_BUILDING.bannerNodeName
  return mesh
}

describe('resolveBannerSource', () => {
  const placeholder = '/textures/murcia/vertigo-banner-placeholder.png'

  it('uses the mirrored image when the client has uploaded one', () => {
    expect(resolveBannerSource({ enabled: true, image: '/logos/x-1600x800.webp' }, placeholder)).toEqual({
      kind: 'image',
      url: '/logos/x-1600x800.webp',
    })
  })

  it('falls back to the placeholder through the same path when there is no image', () => {
    expect(resolveBannerSource({ enabled: true }, placeholder)).toEqual({ kind: 'image', url: placeholder })
  })

  it('resolves to nothing when the switch is off, image or not', () => {
    expect(resolveBannerSource({ enabled: false, image: '/logos/x.webp' }, placeholder)).toBeNull()
    expect(resolveBannerSource({ enabled: false }, placeholder)).toBeNull()
  })
})

describe('bannerFaceUvs', () => {
  it('maps each side face 0..1 across its width and 0..1 down its height', () => {
    const mesh = band()
    bannerFaceUvs(mesh.geometry)
    const pos = mesh.geometry.getAttribute('position')
    const nor = mesh.geometry.getAttribute('normal')
    const uv = mesh.geometry.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      // V is height, growing DOWN: glTF's UV origin is the top-left corner and
      // the texture keeps the glTF flip, so the top edge is 0 and the bottom 1.
      expect(uv.getY(i)).toBeCloseTo(y < 0 ? 1 : 0, 5)
      // U runs left to right AS SEEN FROM OUTSIDE the band, which is what makes
      // the image read the right way round on all four faces rather than
      // mirrored on two of them.
      const nx = nor.getX(i)
      const nz = nor.getZ(i)
      const x = pos.getX(i)
      const z = pos.getZ(i)
      let across: number
      if (nz > 0.5) across = x // +Z face: viewer looks toward -Z, +X is their right
      else if (nz < -0.5) across = -x
      else if (nx > 0.5) across = -z // +X face: viewer looks toward -X, -Z is their right
      else across = z
      expect(uv.getX(i)).toBeCloseTo(across < 0 ? 0 : 1, 5)
    }
  })

  it('leaves a face it cannot classify alone rather than guessing', () => {
    const g = new THREE.PlaneGeometry(2, 2) // faces +Z only — a top face would be +Y
    g.rotateX(-Math.PI / 2) // now +Y: not a side
    const before = Array.from(g.getAttribute('uv').array)
    bannerFaceUvs(g)
    expect(Array.from(g.getAttribute('uv').array)).toEqual(before)
  })
})

describe('applyBanner', () => {
  it('replaces the city material with an unlit, untone-mapped image, and leaves the old one alone', () => {
    // The material the band arrives with is the ONE applyTrimSheet handed to
    // every mesh in the city. Disposing it here would blank the whole city.
    const mesh = band()
    const old = mesh.material as THREE.Material
    const dispose = vi.spyOn(old, 'dispose')
    const texture = new THREE.Texture()
    applyBanner(mesh, texture)
    const material = mesh.material as THREE.MeshBasicMaterial
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(material.map).toBe(texture)
    expect(material.toneMapped).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('reads the image as sRGB colour with the glTF UV origin', () => {
    const mesh = band()
    const texture = new THREE.Texture()
    applyBanner(mesh, texture)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(texture.flipY).toBe(false)
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping)
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping)
  })

  it('remaps the band before binding, so the top-down export UVs are never sampled', () => {
    const mesh = band()
    applyBanner(mesh, new THREE.Texture())
    const uv = mesh.geometry.getAttribute('uv')
    let spread = 0
    for (let i = 0; i < uv.count; i++) spread = Math.max(spread, uv.getY(i))
    expect(spread).toBe(1)
  })
})
