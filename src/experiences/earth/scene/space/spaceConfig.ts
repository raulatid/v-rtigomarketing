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
    // Widened from 3.4 once bloom existed. The point is not bigger dots: a star
    // above the bloom threshold gains a halo, so the top of this range is what
    // separates a few stars that read as LIGHT from a field that reads as
    // speckle. Below the threshold the extra size is just a fatter matte dot,
    // which is what the old ceiling bought.
    maxSize: 4.2,
    // Per-star brightness multiplier applied to its ramp colour, lerped across
    // the magnitude range. Replaces the old per-tier `opacity`.
    minBrightness: 0.35,
    maxBrightness: 1.0,

    // Only stars at least this large scintillate. Faint stars do not visibly
    // twinkle in reality, and at 1px they would just flicker.
    //
    // MOVES WITH maxSize, and that coupling is not optional. This is an
    // absolute pixel size against a range whose top end changed, so widening
    // maxSize to 4.2 while leaving this at 2.2 puts 27.8% of the sky above it —
    // past the 25% ceiling `checks/space-backdrop.ts` section 6 enforces, on
    // the grounds that a sky with too many scintillating stars boils. 2.6
    // restores it to 20.9%.
    twinkleSizeMin: 2.6,

    // Stellar temperature ramp, sampled by a per-star random value. Kept low
    // in saturation on purpose: this is variation, not confetti.
    colorRamp: [
      { at: 0.0, color: 0x9fb8ff },
      { at: 0.35, color: 0xf2f6ff },
      { at: 0.7, color: 0xfff4e6 },
      { at: 1.0, color: 0xffd9a8 },
    ],
  },

  sky: {
    // The photographic panorama, equirectangular in GALACTIC coordinates: the
    // galactic plane lies exactly on the horizontal centreline and the galactic
    // centre at u = 0.5. `shell.frag.glsl` and `skyOrientation()` both depend on
    // that framing — a celestial/equatorial panorama puts the plane on a
    // sinusoid instead and would need a further fixed rotation.
    //
    // Point stars were filtered out of it before it shipped. The star shell
    // draws its own, nearer, where they parallax against this and twinkle;
    // photographed stars would be a second static set contradicting them.
    // See CREDITS.md and scripts/prepare-sky-panorama.mjs.
    //
    // The image is PUBLIC DOMAIN and the site shows no credit for it, which is
    // a client requirement. It replaced ESO's CC BY 4.0 panorama for that reason
    // alone. Do not swap in an asset that wants attribution.
    //
    // Four files, of which exactly one is ever fetched. AVIF first because WebP
    // BLOCKS: it quantises smooth dark gradients into flat macroblocks at every
    // quality setting, and magnification turns 16-px blocks into 28-px squares
    // on screen at DPR 1 and 56 at DPR 2. That is what "you can see the pixels"
    // was. AVIF q50 measures 1.68 on the block-ratio harness in the prepare
    // script against WebP's 2.23, at 186 KB versus 319 KB. The desktop AVIF is
    // also held under a 200 KB client budget, which is what picked q50 over the
    // q80 that measures best — see the prepare script.
    //
    // WebP is the fallback for browsers without AVIF, reached by attempting the
    // AVIF and letting it fail to decode — see `loadFirstAvailable` in
    // SkyShell. A data-URI support probe was the alternative and is worse: it
    // hinges on a hand-pasted base64 blob that, if it ever rots, silently
    // serves everyone the blocky fallback with nothing to notice.
    wide: {
      avif: '/textures/sky-panorama.avif',
      webp: '/textures/sky-panorama.webp',
    },
    // Half width, a quarter of the VRAM. Phones have small viewports, so the
    // resolution buys them nothing, and 33.6 MB for a backdrop is not something
    // to hand a phone.
    narrow: {
      avif: '/textures/sky-panorama-narrow.avif',
      webp: '/textures/sky-panorama-narrow.webp',
    },
    // Matches the mobile breakpoint in styles.css and the `media` on the
    // preloads in index.html. All three must agree or the preload fetches one
    // file and the loader asks for the other.
    narrowMaxWidth: 767,

    // 4096x2048 spans 360 degrees at 11.4 px/deg, against a viewport showing
    // ~45 degrees over ~900px (20 px/deg) — so the sky is MAGNIFIED, never
    // minified, and mipmaps are dead weight. Leaving them off also removes the
    // equirect seam: the u wrap at atan's branch cut makes the derivative blow
    // up there, which with mips selects the smallest one and draws a visible
    // vertical line down the sky. RGBA8, no mips: 33.6 MB wide, 8.4 MB narrow.
    //
    // 4096 is the ceiling the SOURCE allows — it is a 4096x2048 PNG — not a
    // ceiling chosen for weight. Going wider is empty upscaling. Note this is
    // less resolution than the 6144 the previous ESO source allowed; the sky is
    // magnified 1.76x rather than very nearly 1:1. It survives that because it
    // is diffuse gas with no fine detail to lose, and because the shader
    // dithers. A source with hard structure in it would not.
    generateMipmaps: false,

    // The display sphere's radius. Far outside the star shell's slider ceiling
    // (400) and well inside the camera's far plane (5000).
    shellRadius: 1000,
  },
} as const
