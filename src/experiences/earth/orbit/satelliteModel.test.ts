import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The published satellite, read as JSON (no decoder): the shape the recipe in
 * `04_Assets/optimizados/recodificacion-2026-11-23/` promises.
 *
 * One primitive is what takes six satellites from 90 draw calls to 6, and the
 * bounding box is what `createSatellite` centres and scales the model by: a
 * re-encode that moved it would move every satellite's framing without a
 * single error. The box is the one `satellite.glb` had before the merge.
 */
function readGlbJson(path: string) {
  const bytes = readFileSync(path)
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67)
  const length = bytes.readUInt32LE(12)
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'))
}

describe('the satellite model', () => {
  const json = readGlbJson('public/models/satellite-v2.glb')

  it('is one Draco primitive on one node', () => {
    expect(json.nodes).toHaveLength(1)
    expect(json.meshes).toHaveLength(1)
    expect(json.meshes[0].primitives).toHaveLength(1)
    expect(json.extensionsRequired).toEqual(['KHR_draco_mesh_compression'])
    expect(Object.keys(json.meshes[0].primitives[0].attributes).sort()).toEqual(['NORMAL', 'POSITION', 'TEXCOORD_0'])
  })

  it('keeps the bounding box the merge started from, to the millimetre', () => {
    const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
    const min = [-0.9576, -0.5646, -11.2711]
    const max = [3.2182, 3.8454, 11.2277]
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(position.min[k] - min[k])).toBeLessThan(1e-3)
      expect(Math.abs(position.max[k] - max[k])).toBeLessThan(1e-3)
    }
  })
})
