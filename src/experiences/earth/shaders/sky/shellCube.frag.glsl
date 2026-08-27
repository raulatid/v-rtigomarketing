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

// DIAGNOSTIC ONLY, and it is not an exception to the rule above: it adds no
// pixel to any variant's look. 0 off, 1 faces, 2 mesh. See ProtoSkyParams.debug
// for why both exist — a cube face boundary and the shell mesh's polar triangle
// fan draw the same kind of line through the same part of the sky, and the
// seams were reported looking up and down, so they have to be told apart before
// anything is aimed at either.
uniform float uSkyDebug;
uniform float uSkyShellRadius;

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

  if (uSkyDebug > 0.5 && uSkyDebug < 1.5) {
    // FACES. Tint by dominant axis, then lay a hard line exactly on the
    // boundary. On a face boundary the two largest components of |dir| are
    // equal, so their ratio is 1 there and falls away from it — which locates
    // the edge without needing to know which face is which.
    vec3 a = abs(dir);
    float hi = max(a.x, max(a.y, a.z));
    float lo = min(a.x, min(a.y, a.z));
    float second = (a.x + a.y + a.z - hi - lo) / max(hi, 1e-6);

    vec3 tint = a.z >= hi ? vec3(0.2, 0.4, 1.0) : (a.y >= hi ? vec3(0.2, 1.0, 0.2) : vec3(1.0, 0.2, 0.2));
    sky = mix(sky, tint * 0.10, 0.75);
    // Two widths: the thick band says "near an edge", the thin core says
    // "this pixel IS the edge", so a seam can be lined up against it at a
    // glance and at native pixels.
    if (second > 0.985) sky = mix(sky, vec3(1.0, 0.85, 0.0), 0.35);
    if (second > 0.9985) sky = vec3(1.0, 0.85, 0.0);
  } else if (uSkyDebug > 1.5) {
    // MESH. vDirection is the interpolated vertex POSITION, so inside a
    // triangle it is the chord and falls short of the shell radius; it is exact
    // only at the vertices. That sag IS the tessellation, drawn without this
    // file knowing the segment counts. Peak sag for a 7.5-degree segment is
    // about 1 - cos(3.75) = 0.0021, hence the gain.
    float sag = 1.0 - length(vDirection) / max(uSkyShellRadius, 1e-6);
    sky = vec3(clamp(sag * 400.0, 0.0, 1.0));
  }

  gl_FragColor = vec4(sky, 1.0);

  // ONLY this, exactly as shell.frag.glsl ends, so OutputPass tone-maps the
  // result exactly once. A tonemapping_fragment here as well is the double
  // conversion DECISIONS §19 already recorded: the sky comes out looking like a
  // strength that needs dragging down rather than like a bug.
  #include <colorspace_fragment>
}
