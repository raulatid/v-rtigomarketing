import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeRiverFrame } from './riverFrame'

// What the river solver has to be true of, asserted without a GLB, a renderer or
// a GPU — it is pure geometry, so all of it is reachable from a synthetic ribbon.
//
// Every case here fails SILENTLY in the browser, which is the whole reason the
// module exists. A wrong bank set still renders as water: the shore ramp and the
// wall shadow are measured from these segments, so a cap edge left in the bank
// set drags the distance field across the river mouth, and a missed bank puts a
// hard edge down the middle of the channel. Both look like a shader that needs
// tuning rather than a solver that is wrong, and neither throws.

/**
 * A flat quad-strip ribbon — the shape `rio` is: a long thin plane with no
 * interior vertices, triangulated by quads along its length.
 *
 * `angleRadians` rotates it in XZ. Nothing in the solver may depend on the river
 * running along a world axis, and the real one does not.
 */
function ribbon(length: number, width: number, segments: number, angleRadians = 0) {
  const positions: number[] = []
  const indices: number[] = []
  const cos = Math.cos(angleRadians)
  const sin = Math.sin(angleRadians)

  for (let i = 0; i <= segments; i += 1) {
    const along = -length / 2 + (length * i) / segments
    for (const across of [-width / 2, width / 2]) {
      positions.push(along * cos - across * sin, 0, along * sin + across * cos)
    }
  }

  // Per quad: (left_i, right_i, right_i+1) and (left_i, right_i+1, left_i+1).
  // The shared diagonal is interior, so the outline is two banks plus two caps.
  for (let i = 0; i < segments; i += 1) {
    const l = i * 2
    const r = i * 2 + 1
    indices.push(l, r, r + 2, l, r + 2, l + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/** Unit direction the ribbon above runs in, for the axis assertions. */
function ribbonDirection(angleRadians: number) {
  return { x: Math.cos(angleRadians), z: Math.sin(angleRadians) }
}

describe('computeRiverFrame', () => {
  // 10 segments gives 22 vertices and 22 boundary edges — the same counts as the
  // shipped `rio` mesh, which measures 20 bank edges and 2 caps.
  const SEGMENTS = 10
  const LENGTH = 1000
  const WIDTH = 20

  it('tells the two end caps from the banks', () => {
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS))

    // The caps run ACROSS the channel. Left in the bank set they would pull the
    // shore ramp sideways across the whole river mouth — plausible water, wrong
    // water, and nothing to point at.
    expect(frame.bankEdgeCount).toBe(SEGMENTS * 2)
    expect(frame.capEdgeCount).toBe(2)
  })

  it('emits one 6-float segment per bank edge', () => {
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS))

    // `setBankSegments` strides this array by 6 and derives its own count from
    // the length. A mismatch there is read as garbage coordinates, not as an
    // error.
    expect(frame.bankSegments.length).toBe(frame.bankEdgeCount * 6)
  })

  it('measures the channel width from area and perimeter', () => {
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS))

    // 2 * area / perimeter, which under-reads the true width by the caps'
    // share of the outline. That is the contract `shoreWidth` and
    // `wallShadowWidth` were tuned against, in metres.
    const expected = (2 * (LENGTH * WIDTH)) / (2 * LENGTH + 2 * WIDTH)
    expect(frame.width).toBeCloseTo(expected, 3)
  })

  it('solves a ribbon that does not run along a world axis', () => {
    const angle = 0.61
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS, angle))

    expect(frame.bankEdgeCount).toBe(SEGMENTS * 2)
    expect(frame.capEdgeCount).toBe(2)
    expect(frame.warnings).toEqual([])
  })

  it('returns a unit axis along the river', () => {
    const angle = 0.61
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS, angle))
    const direction = ribbonDirection(angle)

    // `setFlowAxis` normalises defensively but the ripples are STRETCHED along
    // this vector, so a non-unit axis scales the ripple field rather than
    // failing. The sign is a genuine coin toss the geometry cannot settle —
    // that is `config.flowReversed` — so only alignment is asserted.
    expect(Math.hypot(frame.axis.x, frame.axis.z)).toBeCloseTo(1, 6)
    expect(Math.abs(frame.axis.x * direction.x + frame.axis.z * direction.z)).toBeCloseTo(1, 6)
  })

  it('says nothing when the ribbon is well formed', () => {
    const frame = computeRiverFrame(ribbon(LENGTH, WIDTH, SEGMENTS))

    // The warnings are the only channel this module has. If a healthy mesh
    // warns, the real warnings stop being read.
    expect(frame.warnings).toEqual([])
  })

  it('warns instead of inventing banks for a closed mesh', () => {
    // A tetrahedron: every edge is shared by two faces, so there is no outline
    // at all. Silently returning an empty bank set would render the whole
    // surface as mid-channel — uniformly deep water with no shore.
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0], 3),
    )
    geometry.setIndex([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3])

    const frame = computeRiverFrame(geometry)

    expect(frame.warnings.length).toBeGreaterThan(0)
    expect(frame.warnings.join(' ')).toContain('no boundary edges')
    expect(frame.bankEdgeCount).toBe(0)
  })

  it('warns instead of throwing when there is no position attribute', () => {
    // `loadCity` calls this on whatever mesh answers to `rio`. A throw here
    // would take the whole city down over one decorative plane.
    const frame = computeRiverFrame(new THREE.BufferGeometry())

    expect(frame.warnings.length).toBeGreaterThan(0)
    expect(frame.bankSegments.length).toBe(0)
    expect(Math.hypot(frame.axis.x, frame.axis.z)).toBeCloseTo(1, 6)
  })
})
