import { describe, it, expect } from 'vitest'
import { resolveCameraPose, resolveZoomFar, type EnvironmentConfig } from './environmentConfig'
import { murciaConfig } from './murciaConfig'

describe('resolveCameraPose', () => {
  it('returns the landscape pose at wide aspects', () => {
    expect(resolveCameraPose(murciaConfig, 16 / 9)).toEqual(murciaConfig.camera)
  })

  it('returns the landscape pose at every aspect while there are no overrides', () => {
    const withoutOverrides: EnvironmentConfig = { ...murciaConfig, cameraPortraitOverrides: null }
    for (const aspect of [0.4, 0.5, 0.85, 1, 2.5, 3.56]) {
      expect(resolveCameraPose(withoutOverrides, aspect)).toEqual(murciaConfig.camera)
    }
  })

  it('ships a portrait pose that differs from landscape in distance alone, and outward', () => {
    // 2026-09-17: a vertical fov crops a portrait viewport to a sliver of the
    // landscape frame, so portrait rests further out. Pinned to DISTANCE so a
    // second overridden term cannot land silently — fov in particular grows
    // the footprint for free, which is the one thing the skirt cannot absorb.
    expect(Object.keys(murciaConfig.cameraPortraitOverrides ?? {})).toEqual(['distance'])
    expect(resolveCameraPose(murciaConfig, 0.5).distance).toBeGreaterThan(
      murciaConfig.camera.distance,
    )
    for (const aspect of [0.85, 1, 16 / 9, 2.5, 3.56]) {
      expect(resolveCameraPose(murciaConfig, aspect)).toBe(murciaConfig.camera)
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

describe('resolveZoomFar', () => {
  const landscapeFar = {
    distance: murciaConfig.zoomFarDistance,
    elevationDegrees: murciaConfig.zoomFarElevationDegrees,
  }

  it('returns the configured far end at every aspect while there are no overrides', () => {
    const withoutOverrides: EnvironmentConfig = { ...murciaConfig, zoomFarPortraitOverrides: null }
    for (const aspect of [0.4, 0.5, 0.85, 1, 3.56]) {
      expect(resolveZoomFar(withoutOverrides, aspect)).toEqual(landscapeFar)
    }
  })

  it('switches on the same threshold as the pose, so rest and far never disagree', () => {
    const threshold = murciaConfig.portraitAspectThreshold
    expect(resolveZoomFar(murciaConfig, threshold - 0.01)).toEqual(
      murciaConfig.zoomFarPortraitOverrides,
    )
    expect(resolveZoomFar(murciaConfig, threshold)).toEqual(landscapeFar)
  })

  it('keeps the shipped portrait far end outward of portrait rest and inward of the departure', () => {
    const rest = resolveCameraPose(murciaConfig, 0.5)
    const far = resolveZoomFar(murciaConfig, 0.5)
    expect(far.distance).toBeGreaterThan(rest.distance)
    expect(far.elevationDegrees).toBeGreaterThan(rest.elevationDegrees)
    expect(far.distance).toBeLessThan(murciaConfig.warpDepartDistance)
    expect(far.elevationDegrees).toBeLessThan(murciaConfig.warpDepartElevationDegrees)
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

  it('aims below the rig, so lookAtHeight lowers the effective pitch', () => {
    // Effective pitch is measured from the rig's target height, not the rig's
    // elevation, because lookAtHeight is a constant rather than a fraction of
    // distance. A positive lookAtHeight tilts the camera UP relative to the rig
    // and so widens the ground footprint; the sign of that is what the terrain
    // skirt is sized against, and it inverts if lookAtHeight ever goes negative.
    //
    // THIS TEST ALSO ASSERTED `effectivePitch > 26` until 2026-09-04. That floor
    // was not a property of the pose — it was the angle below which the ground
    // footprint diverged past a skirt wrapped around the 352-unit plate, and it
    // is why the elevation could not drop. The skirt now wraps `SUELO_CIUDAD`,
    // the resting pose is 19 degrees by client direction, and the frustum passes
    // the horizon on purpose. Re-asserting 26 here would be asserting the old
    // mechanism against the new one. What replaced it is a sweep, not a
    // one-liner, and it lives in `checks/footprint.ts` §3 — this file cannot
    // reach the skirt geometry the guarantee is now made of.
    const { distance, elevationDegrees, lookAtHeight } = murciaConfig.camera
    const height = distance * Math.sin((elevationDegrees * Math.PI) / 180)
    const ground = distance * Math.cos((elevationDegrees * Math.PI) / 180)
    const effectivePitch = (Math.atan2(height - lookAtHeight, ground) * 180) / Math.PI
    expect(effectivePitch).toBeGreaterThan(0)
    expect(effectivePitch).toBeLessThan(elevationDegrees)
  })

  it('carries ground beyond the plate, which is what the low pose rests on', () => {
    // The one config-level statement of the 2026-09-04 change that a unit test
    // can make. At 19 degrees the frustum reaches past the horizon, so there has
    // to BE something past the plate; `checks/footprint.ts` measures how much and
    // `checks/city-asset.ts` §7 asserts the GLB still ships it.
    const { groundBounds, contentBounds } = murciaConfig
    expect(groundBounds).not.toBeNull()
    expect(groundBounds!.minX).toBeLessThan(contentBounds.minX)
    expect(groundBounds!.maxX).toBeGreaterThan(contentBounds.maxX)
    expect(groundBounds!.minZ).toBeLessThan(contentBounds.minZ)
    expect(groundBounds!.maxZ).toBeGreaterThan(contentBounds.maxZ)
  })

  it('keeps the far plane beyond the ground the camera can see', () => {
    const { distance, far, near } = murciaConfig.camera
    expect(far).toBeGreaterThan(distance)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(far)
  })
})
