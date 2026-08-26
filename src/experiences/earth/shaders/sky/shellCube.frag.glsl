precision highp float;

// The prototype sky. Deliberately, structurally, the shipped shell.frag.glsl
// with everything removed.
//
// shell.frag.glsl carries an equirect() projection, a second texture fetch
// through a 90-degree rotation to repair the polar caps, a latitude-ramped
// blend between the two, directional value-noise grain and a per-pixel dither.
// Every one of those exists to hide two properties of a flat photograph
// stretched over a sphere: it has no zenith and no nadir, and at 11.4 px/deg it
// is always magnified. A cubemap has neither problem — there is no branch cut,
// no pole, and no projection at all, just a direction — so the question this
// prototype asks is answered by what is NOT in this file.
//
// Which is also why nothing may be added back here to make a variant look
// better. If a sky needs the grain to be acceptable, that IS the finding.

uniform samplerCube uSkyCube;
uniform mat3 uSkyOrientation;
uniform float uSkyBrightness;
uniform float uSkyContrast;

varying vec3 vDirection;

void main() {
  // vDirection is object-space position on a shell that is never rotated, so it
  // is already the view direction; the orientation matrix aims the SKY inside
  // it, which is how a variant's best-looking region gets pointed away from the
  // Earth.
  vec3 dir = normalize(uSkyOrientation * normalize(vDirection));

  vec3 sky = textureCube(uSkyCube, dir).rgb;

  // max() before pow(): a negative base is undefined, and the texture is tagged
  // SRGBColorSpace so three has already decoded it to linear by the time it
  // arrives here. Contrast 1.0 is the identity, which is where every variant
  // starts — the shipped 0.60/1.00 pair is tuned to the photograph and does not
  // transfer (research part 3, §5).
  sky = pow(max(sky, 0.0), vec3(uSkyContrast));
  sky *= uSkyBrightness;

  gl_FragColor = vec4(sky, 1.0);

  // ONLY this, exactly as shell.frag.glsl ends, so OutputPass tone-maps the
  // result exactly once. A tonemapping_fragment here as well is the double
  // conversion DECISIONS §19 already recorded: the sky comes out looking like a
  // strength that needs dragging down rather than like a bug.
  #include <colorspace_fragment>
}
