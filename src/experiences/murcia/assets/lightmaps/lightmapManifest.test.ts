import { describe, expect, it } from 'vitest'
import {
  chooseLightmapResolution,
  maxMipLevel,
  parseAssetLightmapManifest,
  parseGroundLightmapManifest,
  variantFile,
} from './lightmapManifest'

const map = (name: string) => ({
  threeLightMapIntensity: 12.566370614359172,
  variants: { '2048': { ktx2: `${name}-2048.ktx2` }, '1024': { ktx2: `${name}-1024.ktx2` } },
  // Fields the pipeline writes and nothing reads.
  linearScale: 4,
  hdr: `${name}-master.exr`,
})

const groundRaw = {
  uvChannel: 1,
  chunks: { NW: map('ground-NW'), NE: map('ground-NE'), SW: map('ground-SW'), SE: map('ground-SE') },
}

const assetsRaw = {
  uvChannel: 1,
  chunks: Object.fromEntries(
    ['NW', 'NE', 'SW', 'SE'].map((q) => [q, { static: map(`assets-${q}-static`), instances: map(`assets-${q}-instances`) }]),
  ),
}

describe('the lightmap manifests', () => {
  it('read every chunk and keep the intensity the pipeline computed', () => {
    const ground = parseGroundLightmapManifest(groundRaw)
    expect(ground.chunks.SW.threeLightMapIntensity).toBeCloseTo(4 * Math.PI)
    expect(variantFile(ground.chunks.SW, 1024, 'ground SW')).toBe('ground-SW-1024.ktx2')

    const assets = parseAssetLightmapManifest(assetsRaw)
    expect(variantFile(assets.chunks.NE.instances, 2048, 'x')).toBe('assets-NE-instances-2048.ktx2')
  })

  it('refuse a manifest with a chunk missing rather than light three quarters of the city', () => {
    const { SE: _dropped, ...three } = groundRaw.chunks
    expect(() => parseGroundLightmapManifest({ ...groundRaw, chunks: three })).toThrow(/missing chunk SE/)
    expect(() => parseAssetLightmapManifest({ chunks: { NW: assetsRaw.chunks.NW } })).toThrow(/missing chunk NE/)
    // A chunk that is there but half-written is named the same way.
    expect(() => parseAssetLightmapManifest({ ...assetsRaw, chunks: { ...assetsRaw.chunks, SW: {} } })).toThrow(
      /assets SW static/,
    )
  })

  it('name the resolution that is absent', () => {
    const entry = { threeLightMapIntensity: 1, variants: { '2048': { ktx2: 'a.ktx2' } } }
    expect(() => variantFile(entry, 1024, 'ground NW')).toThrow(/ground NW has no 1024/)
  })
})

describe('the resolution a device gets', () => {
  const desktop = { narrow: false, coarse: false, touchCapable: false, lowMemory: false }

  it('is the small atlas on a phone-width or touch-first viewport, the full one elsewhere', () => {
    expect(chooseLightmapResolution(desktop)).toBe(2048)
    expect(chooseLightmapResolution({ ...desktop, narrow: true })).toBe(1024)
    expect(chooseLightmapResolution({ ...desktop, coarse: true })).toBe(1024)
  })

  it('is the small atlas on a touch screen behind a fine pointer, like an iPad with a trackpad', () => {
    expect(chooseLightmapResolution({ ...desktop, touchCapable: true })).toBe(1024)
  })

  it('is the small atlas on a device reporting 4 GB of memory or less', () => {
    expect(chooseLightmapResolution({ ...desktop, lowMemory: true })).toBe(1024)
  })

  it('drops one mip level with the atlas size, and never lets instances leave the base level', () => {
    expect(maxMipLevel('ground', 2048)).toBe(2)
    expect(maxMipLevel('ground', 1024)).toBe(1)
    expect(maxMipLevel('static', 2048)).toBe(1)
    expect(maxMipLevel('static', 1024)).toBe(0)
    expect(maxMipLevel('instances', 2048)).toBe(0)
  })
})
