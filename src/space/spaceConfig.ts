// Structural constants for the space backdrop — the values that are NOT
// exposed as debug sliders. Slider-exposed tunables live in `introConfig.ts`
// alongside the rest of the debug surface, following the same split
// `orbitConfig.ts` and `interactionConfig.ts` already use.
//
// Nothing here may import a `.glsl` file or touch `window`: this module is
// bundled into `checks/space-backdrop.ts` and run in Node.

export const SPACE_CONFIG = {
  star: {
    // Fixed, so the sky is identical on every load. That is what makes the
    // occlusion screenshots in the verification pass diffable at all.
    seed: 20260811,

    // Local knots. Real skies clump; the Fibonacci spiral this replaced was a
    // maximally even distribution, which is precisely why it read as combed.
    //
    // These three were tuned against `checks/space-backdrop.ts` section 4,
    // which requires clustering to beat plain uniform randomness by 15% on the
    // spread of nearest-neighbour distance. The first values tried (48 knots,
    // 0.14 spread, 0.45 share) reached only 11%: uniform randomness is already
    // fairly clumpy on its own, so loose knots barely register against it.
    // Fewer, tighter, fuller knots is what actually reads as structure.
    clusterCount: 36,
    // Angular spread of a knot, as the magnitude of a random offset applied to
    // a unit direction BEFORE renormalising. Not a radius in world units.
    clusterSpread: 0.09,
    // Fraction of stars placed inside a knot rather than by the band sampler.
    clusterShare: 0.6,

    // Magnitude follows `rand ** exponent`, so higher means more faint stars.
    // A real magnitude distribution is heavily bottom-weighted; three discrete
    // tiers at 70/25/5% was the previous approximation.
    magnitudeExponent: 2.6,
    minSize: 0.7,
    maxSize: 3.4,
    // Per-star brightness multiplier applied to its ramp colour, lerped across
    // the magnitude range. Replaces the old per-tier `opacity`.
    minBrightness: 0.35,
    maxBrightness: 1.0,

    // Only stars at least this large scintillate. Faint stars do not visibly
    // twinkle in reality, and at 1px they would just flicker.
    twinkleSizeMin: 2.2,

    // Stellar temperature ramp, sampled by a per-star random value. Kept low
    // in saturation on purpose: this is variation, not confetti.
    colorRamp: [
      { at: 0.0, color: 0x9fb8ff },
      { at: 0.35, color: 0xf2f6ff },
      { at: 0.7, color: 0xfff4e6 },
      { at: 1.0, color: 0xffd9a8 },
    ],
  },

  nebula: {
    // Per cube face. At this size the cubemap is MAGNIFIED on screen, never
    // minified — 1024px covers a 90 degree face (11 px/deg) against a viewport
    // showing ~45 degrees over ~1080px (24 px/deg) — so mipmaps are dead
    // weight and are deliberately not generated. RGBA8, six faces, no mips:
    // exactly 25.2 MB of VRAM.
    faceSize: 1024,
    // The display sphere's radius. Far outside the star shell's slider ceiling
    // (400) and well inside the camera's far plane (5000).
    shellRadius: 1000,

    coreColor: 0x9ec6ff,
    dustColor: 0xd8a273,
    hydrogenColor: 0xc65a9c,
    // Offsets the noise fields so the three structures do not share features.
    seed: 137.24,
  },
} as const
