// The galaxy plane's defaults, kept apart from the functions that use them.
//
// SPLIT FROM `galaxyBand.ts` FOR ONE REASON, and it is a load-time one: this
// object is reachable from the APP ENTRY (App.tsx -> introConfig.ts, which
// publishes the three values as debug sliders), while `bandAxis`,
// `bandDensity`, `skyOrientation` and `skyCapRotation` are reached only through
// the scene's dynamic import. `galaxyBand.ts` imports three at module scope, so
// while these numbers lived there the entry chunk carried a static
// `import ... from "./three-*.js"` for them — and a static edge is not a
// download, it is an EVALUATION: all 820 KB of three.js ran on the main thread
// during boot, before React rendered anything, measured at t=369ms under a 4x
// CPU throttle. Three numbers were holding the whole library on the critical
// path.
//
// So: constants here, geometry next door. `galaxyBand.ts` re-exports this so
// every existing consumer is unaffected, and the build asserts the result —
// see the three.js structural guard in `assertChunkBudgets` in vite.config.ts.
//
// Nothing in this module may import a `.glsl` file or touch `window`: it is
// bundled into `checks/space-backdrop.ts` and run in Node. Nor may it import
// three — that is the entire point of the file.

export const GALAXY_BAND = {
  // Degrees away from a horizontal band. 0 puts the galactic plane on the XZ
  // plane; the default tips it so the band cuts the frame diagonally rather
  // than sitting level with the Earth's equator.
  defaultTilt: 22,
  // Half-width of the gaussian, in units of `dot(direction, axis)`.
  //
  // Tuned down from 0.35 on the evidence of a screenshot: 0.35 puts the band's
  // edges about 41 degrees off the plane, so against a 45 degree FOV the gas
  // ran past both edges of the frame and there was no dark sky to read it
  // against. A band you cannot see the edge of is not a band.
  defaultWidth: 0.22,
  // Rotation about the galactic pole, in degrees — which stretch of the Milky
  // Way ends up behind the Earth. Purely compositional: it changes the view,
  // never the geometry, and the star field is invariant under it because the
  // band is rotationally symmetric about its own axis.
  //
  // At 0 the default camera (down -Z) looks at u = 0.25 of the panorama, a
  // plain stretch of the band. u falls by 1/360 per degree of yaw, so 270 puts
  // the galactic core — u = 0.5, the brightest and most structured thing in the
  // sky — dead centre, which is exactly where the Earth is and therefore the
  // one place it cannot be seen.
  //
  // 250 offsets it by about 0.055 in u. The 16:9 frame spans ~0.2 at a 45
  // degree vertical FOV and the Earth covers roughly the middle 0.04 of that,
  // so the core clears the planet and still sits well inside the frame.
  defaultYaw: 250,
} as const
