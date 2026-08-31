// The services display's FRONT FACE — the readable surface of a solid object.
//
// ## What changed, and why the old rule is gone
//
// This file used to open with the opposite instruction: "the mesh edge should be
// impossible to locate in the render." That was correct while the display was one
// zero-thickness plane. A lone plane whose rectangle can be found reads as a
// rectangle, so the fix was to make it unfindable — inset the field to 52% of the
// mesh, widen the falloff until it reached zero well short of the boundary, and
// let nothing draw a line along the silhouette.
//
// The display has a body now (`displayShell`). The silhouette is carried by that
// plate's GEOMETRY, which is the only way an edge stays consistent from every
// camera angle the visitor can reach, and a face that dissolved into nothing in
// front of a solid plate would read as a rendering fault rather than as
// atmosphere. So the field is inset only 16% instead of 48%, the falloff is an
// antialiasing width instead of a dissolve, and the halo is a narrow bloom that
// hugs a real edge instead of a wide one hiding a fake edge.
//
// Two regions, still:
//
//   core   dense, calm, opaque, dark blue-black — typography sits here
//   halo   narrow, very low alpha, atmospheric — a bloom, never a second frame
//
// ## One live warning survives from that pass
//
// The margin outside the core is `0.5 - 0.5 * uCoreInset` — 0.08 shader units at
// the current inset — and `uEdgeFalloff + uHaloWidth` must fit inside it. Push
// `uHaloWidth` past about 0.08 and the halo clips flat against the mesh boundary,
// which draws exactly the visible rectangle that pass existed to remove. That
// failure mode has not gone away; only its likelihood has.
//
// `uRimStrength` stays at zero for the same family of reason: a rim here would
// draw a second edge a fraction in front of the plate's, and the object would read
// as doubled. The rim treatment this display wants lives on the plate.

#include <fog_pars_fragment>

uniform float uActivation;
/** Fades the copy alone, so content can swap without the panel blinking. */
uniform float uTextOpacity;
uniform float uAspect;
/**
 * The visible field's size as a fraction of the plane, 0..1.
 *
 * The whole point of the pass: below 1 the field ends before the geometry does,
 * which is what leaves room for a falloff wide enough to dissolve.
 */
uniform float uCoreInset;
uniform float uCornerRadius;
/** Width of the core's own fade, in the plane's half-height units. */
uniform float uEdgeFalloff;
uniform float uCoreOpacity;
/** How far past the core the atmospheric region reaches. */
uniform float uHaloWidth;
uniform float uHaloStrength;
/** Kept only so it can be dialled up deliberately. Zero by default. */
uniform float uRimStrength;
/** Low-frequency modulation, confined to the halo. */
uniform float uNoiseStrength;
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uHaloColor;
uniform vec3 uTextColor;
uniform sampler2D uText;

// --- copy windowing ----------------------------------------------------------
// The canvas is taller than one screenful. These slide a viewport-sized slice
// over it, so scrolling is a uniform change rather than a repaint and upload.
uniform float uTextWindow;
uniform float uTextOffset;

// --- controls ----------------------------------------------------------------
// Rects arrive in core-UV space from displayConfig, which is the SAME source the
// pointer code hit-tests against. Two copies is how a control ends up drawn in
// one place and clickable in another.
uniform vec4 uRects[4];
uniform int uRectRows[4];
uniform int uControlCount;
uniform int uHoverIndex;
uniform int uPressedIndex;
uniform float uControlStrength;
uniform float uDetailOpen;
uniform sampler2D uControlLabels;

// --- scrollbar ---------------------------------------------------------------
uniform vec4 uScrollRect;
uniform float uScrollThumb;
uniform float uScrollAmount;

/** How many rows the label atlas has. Fed from `LABEL_ROWS.length`. */
uniform float uLabelRows;

varying vec2 vUv;

/** Signed distance to a rounded box. Negative inside. */
float roundedBoxSdf(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

/** Smooth value noise. Cheap, and low-frequency is all the halo wants. */
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  // Centred and aspect-corrected, so the corner radius and both falloffs stay
  // circular instead of stretching with the panel.
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 halfPlane = vec2(uAspect, 1.0) * 0.5;

  // The visible field, inset from the mesh.
  vec2 coreHalf = halfPlane * uCoreInset;
  float sdf = roundedBoxSdf(p, coreHalf, uCornerRadius);

  // Dense within the core, fading across a deliberately generous band.
  float core = 1.0 - smoothstep(0.0, uEdgeFalloff, sdf);

  // The atmospheric region: far wider, far weaker, and measured from the CORE
  // CENTRE rather than from the core's edge.
  //
  // Deriving it from the edge and weighting it by (1 - core) — which is what
  // this did first — makes the halo peak exactly where the core ends, which
  // paints a bright band along the silhouette. That is the glowing rectangle
  // outline this pass exists to remove, arriving by a different route.
  float halo = pow(1.0 - smoothstep(-uHaloWidth * 0.5, uHaloWidth, sdf), 2.4);

  // Irregularity belongs to the halo only. Weighted by (1 - core) so the text
  // never sits on modulated alpha.
  float wobble = valueNoise(p * 2.6 + vec2(0.0, uTime * 0.05));
  float noiseMix = mix(1.0, 0.45 + 1.0 * wobble, uNoiseStrength * (1.0 - core));

  float coreAlpha = core * uCoreOpacity;
  float haloAlpha = halo * uHaloStrength * noiseMix;

  // A broad transition band, NOT a traced outline. Zero by default; if it is
  // ever raised it widens rather than sharpens, because it rides the same wide
  // falloff the core does.
  float rim = core * (1.0 - core) * uRimStrength;

  // Tinted toward the halo colour only well outside the dense area. Driving
  // this from `core` alone put a colour change at the boundary, which reads as
  // an outline even when its alpha is low.
  vec3 color = mix(uCoreColor, uHaloColor, clamp(smoothstep(0.0, uHaloWidth, sdf), 0.0, 1.0));
  color += uHaloColor * rim;

  // Added, not weighted by (1 - core). Two smooth ramps summing have no peak at
  // the handover; the weighted version had one, and that peak was the band.
  float panelAlpha = coreAlpha + haloAlpha + rim * 0.5;

  // The canvas maps onto the CORE, not the plane. That keeps the copy the same
  // physical size it was before the field was inset, and means the text region
  // follows the readable area automatically whenever the inset is retuned.
  vec2 textUv = (vUv - 0.5) / max(uCoreInset, 0.001) + 0.5;
  float inside =
    step(0.0, textUv.x) * step(textUv.x, 1.0) * step(0.0, textUv.y) * step(textUv.y, 1.0);

  // Window into the tall canvas. v runs bottom-up while the canvas is authored
  // top-down, so the slice is measured back from the top.
  float sampleV = 1.0 - uTextOffset - uTextWindow + textUv.y * uTextWindow;
  // Text alpha is INDEPENDENT of the falloff: tying them would fade the copy
  // exactly where readability is already under pressure.
  float glyph = texture2D(uText, vec2(textUv.x, sampleV)).a * inside * uTextOpacity;

  // In detail mode the copy is folded away at BOTH ends of its reading viewport.
  //
  // The bottom fold came first: `glyph` was masked only by `inside`, so the long
  // copy ran the full height of the core and printed straight through the footer
  // controls, leaving them unreadable.
  //
  // The top fold is the same fault at the opposite edge, and moving VOLVER to the
  // top-left is what creates it — scrolled body copy would print straight through
  // the one control the reading state has. The old objection to clipping the top,
  // that it would cut off the detail title, dissolved once the title was laid out
  // BELOW the fold line rather than above the viewport.
  //
  // Both are softened over a small band rather than cut, so lines fade at the fold
  // instead of being sliced through the middle of their glyphs.
  float foldBottom = smoothstep(uScrollRect.y - 0.025, uScrollRect.y + 0.01, textUv.y);
  float viewportTop = uScrollRect.y + uScrollRect.w;
  float foldTop = 1.0 - smoothstep(viewportTop - 0.01, viewportTop + 0.025, textUv.y);
  glyph *= mix(1.0, foldBottom * foldTop, uDetailOpen);

  color = mix(color, uTextColor, glyph);

  // --- controls --------------------------------------------------------------
  float controlAlpha = 0.0;
  float controlGlyph = 0.0;

  for (int i = 0; i < 4; i++) {
    if (i >= uControlCount) break;

    vec4 r = uRects[i];
    vec2 local = (textUv - r.xy) / r.zw;
    if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) continue;

    float lift = 0.0;
    if (i == uHoverIndex) lift = 0.5;
    if (i == uPressedIndex) lift = 1.0;

    // A soft field, not a filled button: the silhouette work applies here too.
    vec2 p2 = (local - 0.5) * 2.0;
    float field = 1.0 - smoothstep(0.35, 1.0, max(abs(p2.x), abs(p2.y)));
    controlAlpha = max(controlAlpha, field * uControlStrength * (0.5 + lift));

    // Labels come from a stacked atlas, one row per control, chosen per slot.
    //
    // The row is stretched across the whole rect with no aspect correction, which
    // is why `paintLabels` draws each one pre-distorted by the inverse: the two
    // cancel, and a chevron in a square-ish rect stays a chevron instead of being
    // crushed into a vertical sliver.
    float row = float(uRectRows[i]);
    vec2 labelUv = vec2(local.x, (uLabelRows - row - 1.0 + local.y) / uLabelRows);
    controlGlyph = max(controlGlyph, texture2D(uControlLabels, labelUv).a * (0.75 + lift * 0.25));
  }

  color = mix(color, uTextColor, controlGlyph * uTextOpacity);

  // --- scrollbar -------------------------------------------------------------
  // Drawn here rather than onto the canvas, so it stays put while the copy moves.
  float scrollAlpha = 0.0;
  if (uScrollThumb > 0.0) {
    float trackX = uScrollRect.x + uScrollRect.z + 0.02;
    float onTrack =
      (1.0 - smoothstep(0.004, 0.009, abs(textUv.x - trackX))) *
      step(uScrollRect.y, textUv.y) * step(textUv.y, uScrollRect.y + uScrollRect.w);

    float travel = uScrollRect.w * (1.0 - uScrollThumb);
    // Amount 0 is the TOP of the copy, which is the top of the track.
    float thumbTop = uScrollRect.y + uScrollRect.w - uScrollAmount * travel;
    float thumbBottom = thumbTop - uScrollRect.w * uScrollThumb;
    float onThumb = step(thumbBottom, textUv.y) * step(textUv.y, thumbTop);

    scrollAlpha = onTrack * mix(0.12, 0.55, onThumb) * inside;
    color = mix(color, uTextColor, scrollAlpha * 0.8);
  }

  float alpha = max(max(panelAlpha, glyph), max(controlAlpha + controlGlyph, scrollAlpha)) * uActivation;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
