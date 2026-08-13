import { describe, it, expect } from 'vitest'
import { resolveCameraPose, type EnvironmentConfig } from './environmentConfig'
import { murciaConfig } from './murciaConfig'

describe('resolveCameraPose', () => {
  it('returns the landscape pose at wide aspects', () => {
    expect(resolveCameraPose(murciaConfig, 16 / 9)).toEqual(murciaConfig.camera)
  })

  it('returns the landscape pose at every aspect while there are no overrides', () => {
    // murciaConfig ships cameraPortraitOverrides: null, so the portrait branch
    // is unreachable today. Asserted so a future override cannot land silently.
    expect(murciaConfig.cameraPortraitOverrides).toBeNull()
    for (const aspect of [0.4, 0.5, 0.85, 1, 2.5, 3.56]) {
      expect(resolveCameraPose(murciaConfig, aspect)).toEqual(murciaConfig.camera)
    }
  })

  it('applies portrait overrides below the threshold, and only there', () => {
    const withOverrides: EnvironmentConfig = {
      ...murciaConfig,
      cameraPortraitOverrides: { distance: 220 },
    }
    const threshold = murciaConfig.portraitAspectThreshold

    expect(resolveCameraPose(withOverrides, threshold - 0.01).distance).toBe(220)
    // The threshold itself is landscape: the comparison is `aspect >=`.
    expect(resolveCameraPose(withOverrides, threshold).distance).toBe(
      murciaConfig.camera.distance,
    )
  })

  it('keeps the un-overridden terms when overriding one', () => {
    const withOverrides: EnvironmentConfig = {
      ...murciaConfig,
      cameraPortraitOverrides: { distance: 220 },
    }
    const pose = resolveCameraPose(withOverrides, 0.5)
    expect(pose.elevationDegrees).toBe(murciaConfig.camera.elevationDegrees)
    expect(pose.fov).toBe(murciaConfig.camera.fov)
    expect(pose.lookAtHeight).toBe(murciaConfig.camera.lookAtHeight)
  })

  it('hands back the config object itself on the landscape path — a live trap', () => {
    // Recorded, not endorsed. PROJECT_MEMORY, "Things that will bite you again":
    // `rig.getPose()` returns murciaConfig.camera BY IDENTITY, so mutating the
    // returned pose corrupts the config for the rest of the session. The same is
    // true here, and it is why callers must build a fresh pose object rather
    // than adjusting the one they were given.
    expect(resolveCameraPose(murciaConfig, 16 / 9)).toBe(murciaConfig.camera)

    // The portrait path does copy, which is the inconsistency worth knowing
    // about: whether you get a shared reference depends on the viewport.
    const withOverrides: EnvironmentConfig = {
      ...murciaConfig,
      cameraPortraitOverrides: { distance: 220 },
    }
    expect(resolveCameraPose(withOverrides, 0.5)).not.toBe(withOverrides.camera)
  })
})

describe('the shipped Murcia pose', () => {
  it('keeps the camera above the ground it looks at', () => {
    // height = distance * sin(elevation). Below the lookAtHeight the effective
    // pitch inverts and the footprint maths stops meaning anything.
    const { distance, elevationDegrees, lookAtHeight } = murciaConfig.camera
    const height = distance * Math.sin((elevationDegrees * Math.PI) / 180)
    expect(height).toBeGreaterThan(lookAtHeight)
  })

  it('stays clear of the pitch floor where the bounds maths degenerates', () => {
    // Effective pitch is measured from the rig's target height, not the rig's
    // elevation, because lookAtHeight is a constant rather than a fraction of
    // distance. PROJECT_MEMORY records ~28 degrees as the floor.
    const { distance, elevationDegrees, lookAtHeight } = murciaConfig.camera
    const height = distance * Math.sin((elevationDegrees * Math.PI) / 180)
    const ground = distance * Math.cos((elevationDegrees * Math.PI) / 180)
    const effectivePitch = (Math.atan2(height - lookAtHeight, ground) * 180) / Math.PI
    expect(effectivePitch).toBeGreaterThan(26)
    expect(effectivePitch).toBeLessThan(elevationDegrees)
  })

  it('keeps the far plane beyond the ground the camera can see', () => {
    const { distance, far, near } = murciaConfig.camera
    expect(far).toBeGreaterThan(distance)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(far)
  })
})
