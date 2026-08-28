import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTerrainTransition, terrainVisualBounds } from './createTerrainTransition'
import type { BoundsRect, TerrainTransitionConfig } from '../config/environmentConfig'

// The ownership contract between the authored ground and the runtime terrain,
// asserted without a GLB, a renderer or a GPU.
//
// Both failures here are silent in the browser. Filling the plate's interior
// renders as perfectly convincing ground — it just quietly buries whatever the
// artist cut a hole for, which is how the river spent its first day invisible.
// Sealing a channel where it leaves the plate is the same mistake one step
// further out, and it looks like terrain rather than like a bug.

const CONFIG: TerrainTransitionConfig = {
  enabled: true,
  terrainObjectName: 'plate',
  width: 700,
  collarWidth: 30,
  fadeEndFraction: 0.21,
  loops: 4,
  segmentsPerSide: 4,
  innerOverlap: 0.5,
  verticalOffset: 0.05,
  fadeExponent: 1.6,
}

/** A rectangular plate, which is what the ground's outer footprint now is. */
function plate(sizeX: number, sizeZ: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sizeX, 2, sizeZ),
    new THREE.MeshStandardMaterial(),
  )
  mesh.updateMatrixWorld(true)
  return mesh
}

/** Every collar triangle's centroid, in world XZ. */
function collarCentroids(group: THREE.Object3D): Array<{ x: number; z: number }> {
  const collar = group.getObjectByName('TerrainCollar') as THREE.Mesh
  const position = collar.geometry.getAttribute('position')
  const index = collar.geometry.getIndex()!
  const out: Array<{ x: number; z: number }> = []
  for (let i = 0; i < index.count; i += 3) {
    let x = 0
    let z = 0
    for (const corner of [0, 1, 2]) {
      const v = index.getX(i + corner)
      x += position.getX(v)
      z += position.getZ(v)
    }
    out.push({ x: x / 3, z: z / 3 })
  }
  return out
}

function triangleCount(group: THREE.Object3D, name: string): number {
  const mesh = group.getObjectByName(name) as THREE.Mesh
  return mesh.geometry.getIndex()!.count / 3
}

describe('createTerrainTransition', () => {
  it('never puts collar geometry inside the authored footprint', () => {
    // The regression this file exists for. The collar used to be built as
    // "bounding rectangle minus the plate's outline", so every authored hole
    // was read as terrain to reconstruct.
    const transition = createTerrainTransition(plate(100, 200), CONFIG)

    for (const c of collarCentroids(transition.group)) {
      const inside =
        c.x > -50 + CONFIG.innerOverlap &&
        c.x < 50 - CONFIG.innerOverlap &&
        c.z > -100 + CONFIG.innerOverlap &&
        c.z < 100 - CONFIG.innerOverlap
      expect(inside, `collar triangle at ${c.x.toFixed(1)},${c.z.toFixed(1)} is inside the plate`)
        .toBe(false)
    }
  })

  it('closes a full ring when nothing reaches the perimeter', () => {
    // Four strips, two triangles each. If a future change starts emitting
    // degenerate quads this is the number that moves.
    const transition = createTerrainTransition(plate(100, 200), CONFIG)
    expect(triangleCount(transition.group, 'TerrainCollar')).toBe(8)
    expect(transition.warnings).toEqual([])
  })

  it('leaves the channel open where it reaches the plate edge', () => {
    // The river runs the full width of the plate and exits through both the
    // west and east edges. Terrain closing over those two mouths is the
    // "silently fill the river exit" failure: it renders as ground.
    const river: BoundsRect = { minX: -50, maxX: 50, minZ: -20, maxZ: 20 }
    const transition = createTerrainTransition(plate(100, 200), CONFIG, {
      openings: [river],
    })

    for (const c of collarCentroids(transition.group)) {
      const inChannel = c.z > river.minZ && c.z < river.maxZ
      const beyondSideEdge = c.x < -50 || c.x > 50
      expect(
        inChannel && beyondSideEdge,
        `collar triangle at ${c.x.toFixed(1)},${c.z.toFixed(1)} seals a river mouth`,
      ).toBe(false)
    }

    // Both side strips split in two, so six quads rather than four.
    expect(triangleCount(transition.group, 'TerrainCollar')).toBe(12)
  })

  it('ignores an opening that stops short of the perimeter', () => {
    // An interior hole is the plate's own business — the collar lives outside
    // the footprint and must not grow a notch for something it never covers.
    const transition = createTerrainTransition(plate(100, 200), CONFIG, {
      openings: [{ minX: -10, maxX: 10, minZ: -20, maxZ: 20 }],
    })

    expect(triangleCount(transition.group, 'TerrainCollar')).toBe(8)
    // ...and it says so, rather than leaving a caller to wonder why passing the
    // river in changed nothing.
    expect(transition.warnings.join(' ')).toContain('none reaching the plate perimeter')
  })

  it('leaves the channel open through the skirt as well as the collar', () => {
    // The skirt reaches alpha 1 at the plate edge, so a notch cut only in the
    // collar is painted straight over and the mouths still read as sealed.
    // Nothing about that failure looks wrong — it looks like terrain.
    const river: BoundsRect = { minX: -50, maxX: 50, minZ: -20, maxZ: 20 }
    const transition = createTerrainTransition(plate(100, 200), CONFIG, {
      openings: [river],
    })

    const skirt = transition.group.getObjectByName('TerrainTransitionSkirt') as THREE.Mesh
    const position = skirt.geometry.getAttribute('position')
    const index = skirt.geometry.getIndex()!

    let westOrEast = 0
    for (let i = 0; i < index.count; i += 3) {
      let x = 0
      let z = 0
      for (const corner of [0, 1, 2]) {
        const v = index.getX(i + corner)
        x += position.getX(v)
        z += position.getZ(v)
      }
      x /= 3
      z /= 3
      // The gap is held as a fraction of the side, so it only ever widens
      // outward — the river's own Z band is inside it at every loop.
      if (x < -50 + 1 || x > 50 - 1) {
        westOrEast += 1
        const inChannel = z > river.minZ && z < river.maxZ
        expect(inChannel, `skirt triangle at ${x.toFixed(1)},${z.toFixed(1)} seals a river mouth`)
          .toBe(false)
      }
    }
    // Guard against the assertion passing because nothing was on those sides.
    expect(westOrEast).toBeGreaterThan(0)
  })

  it('keeps the skirt a closed ring everywhere else', () => {
    // The notch is cut by dropping quads from a shared perimeter walk. If the
    // sample order ever differed between loops the strip would twist rather
    // than fail, so this asserts the ring still closes around all four corners
    // and every vertex is finite.
    const transition = createTerrainTransition(plate(100, 200), CONFIG, {
      openings: [{ minX: -50, maxX: 50, minZ: -20, maxZ: 20 }],
    })
    const skirt = transition.group.getObjectByName('TerrainTransitionSkirt') as THREE.Mesh
    const position = skirt.geometry.getAttribute('position')

    for (let i = 0; i < position.count; i += 1) {
      expect(Number.isFinite(position.getX(i))).toBe(true)
      expect(Number.isFinite(position.getZ(i))).toBe(true)
    }

    // Every corner of the plate must still be spanned by skirt geometry.
    const corners = [
      { x: -50, z: -100 },
      { x: 50, z: -100 },
      { x: 50, z: 100 },
      { x: -50, z: 100 },
    ]
    for (const corner of corners) {
      let near = 0
      for (let i = 0; i < position.count; i += 1) {
        if (
          Math.abs(position.getX(i) - corner.x) < 30 &&
          Math.abs(position.getZ(i) - corner.z) < 30
        ) {
          near += 1
        }
      }
      expect(near, `no skirt vertices near corner ${corner.x},${corner.z}`).toBeGreaterThan(0)
    }
  })

  it('reports the visual extent the navigable area is inset from', () => {
    // `checks/footprint.ts` and the navigable area both read this. The collar
    // is opaque and narrower than the skirt, so it must NOT widen the number —
    // if it did, the camera would be allowed to reach past the fade.
    const transition = createTerrainTransition(plate(100, 200), CONFIG)
    expect(transition.visualBounds).toEqual(
      terrainVisualBounds(transition.plateBounds, CONFIG),
    )
    expect(transition.visualBounds.minX).toBe(-50 - CONFIG.width)
  })
})
