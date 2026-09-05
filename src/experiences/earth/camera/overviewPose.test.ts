import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { overviewRestPosition } from './overviewPose'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'

const cfg = INTERACTION_CONFIG.camera
const DEG = Math.PI / 180

describe('overviewRestPosition', () => {
  it('sits at the overview radius', () => {
    const [x, y, z] = overviewRestPosition()
    expect(Math.hypot(x, y, z)).toBeCloseTo(cfg.overviewRadius, 10)
  })

  it('reads back as the configured angles in the convention the rig uses', () => {
    // The rig seeds its orbit with `THREE.Spherical.setFromVector3`, so the
    // vector has to round-trip through exactly that, not through any other
    // spherical convention.
    const s = new THREE.Spherical().setFromVector3(new THREE.Vector3(...overviewRestPosition()))
    expect(s.theta).toBeCloseTo(cfg.overviewThetaDegrees * DEG, 10)
    expect(s.phi).toBeCloseTo(cfg.overviewPhiDegrees * DEG, 10)
  })

  it('keeps the same direction at another radius, so the dolly pulls straight in', () => {
    const rest = new THREE.Vector3(...overviewRestPosition()).normalize()
    const far = new THREE.Vector3(...overviewRestPosition(80)).normalize()
    expect(rest.distanceTo(far)).toBeLessThan(1e-12)
    expect(new THREE.Vector3(...overviewRestPosition(80)).length()).toBeCloseTo(80, 10)
  })

  it('rests inside the band the drag is clamped to', () => {
    // A rest pose outside [phiMin, phiMax] would be clamped by the rig on
    // activate and the intro would land somewhere the rig then jumps away from.
    const phi = cfg.overviewPhiDegrees * DEG
    expect(phi).toBeGreaterThanOrEqual(cfg.phiMin)
    expect(phi).toBeLessThanOrEqual(cfg.phiMax)
  })
})
