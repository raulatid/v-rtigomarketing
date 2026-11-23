// The round-point falloff, defined once for every point sprite in the app.
//
// A plain `gl_Points` sprite is a SQUARE. Nothing about it is round unless the
// fragment shader makes it so, and at small sizes the difference is easy to miss
// in a still — until something magnifies or blooms it and the field turns into
// visible boxes. That is exactly what happened to the warp tunnel: it ran on
// `PointsMaterial` with no map, so every star in it was a square, and adding
// bloom gave each square a halo that made it obvious.
//
// Every consumer shares this rather than rolling its own: `starShader.ts`
// (the resting backdrop) and the satellites' hover cue. The warp tunnel that
// was the second consumer went with the 2026-11-23 warp. They differ in
// blending, attenuation and colour, but a point is a point and they must not
// drift into looking like two different shapes.
//
// The squaring is not decoration. A linear falloff reads as a soft blob; the
// square tightens the core so a bright point keeps a definite centre with a
// small glow around it, instead of the whole field turning into haze.
//
// Nothing here imports three or touches `window` — it is a GLSL string.

export const POINT_SPRITE_FALLOFF = /* glsl */ `
  float pointSpriteFalloff() {
    // gl_PointCoord is 0..1 across the sprite, so this is 0 at the centre and
    // 1 at the inscribed circle's edge — the corners land at 1.414 and are
    // discarded, which is what turns the square into a disc.
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float falloff = 1.0 - smoothstep(0.0, 1.0, r);
    // Discarding rather than relying on alpha 0: these draw with depthWrite
    // off and blend, so a fully transparent corner fragment still costs a
    // blend, and with additive blending it is not reliably a no-op.
    if (falloff <= 0.0) discard;
    return falloff * falloff;
  }
`
