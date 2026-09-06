// The services display's FRONT FACE — the readable surface of a premium embedded
// display.
//
// ## This pass supersedes plan 002 §18 and plan 003 §17 on colour and atmosphere
//
// Both of those documents read as binding, and both are now deliberately reversed
// on this one axis. They specify a "projected holographic panel": dark BLUE-BLACK
// core, teal halo, light-gray typography, diffuse silhouette. That was coherent
// while the display was a projection — something the focos generate out of the air.
//
// The object is not that any more. It has a body (`displayShell`), a machined rim,
// and copy that people are meant to read for a while. Those are the properties of a
// SCREEN BUILT INTO ARCHITECTURE, and the treatment now says so: deep graphite
// instead of blue-black, a neutral edge instead of a teal atmosphere, and a fake
// optical top layer instead of a glow.
//
// Everything mechanical is unchanged. The copy still windows out of a tall canvas,
// the controls are still hit-tested against the same rects the shader draws from,
// the corner SDF still registers against the plate's geometry, and the alpha
// behaviour is what it was. This is an art-direction pass and nothing else — which
// is why it is worth being explicit that it overrules two plans.
//
// Two regions, still:
//
//   core   dense, calm, opaque, deep graphite — typography sits here
//   halo   narrow, very low alpha — an antialiasing fringe, never a second frame
//
// ## Three live warnings
//
// The margin outside the core is `0.5 - 0.5 * uCoreInset` — 0.08 shader units at
// the current inset — and `uEdgeFalloff + uHaloWidth` must fit inside it. Push
// `uHaloWidth` past about 0.08 and the halo clips flat against the mesh boundary,
// which draws a visible rectangle where the plate's silhouette should be the only
// findable edge.
//
// `uEdgeFalloff * panelHeight` must stay under `SHELL_BLEED`, or the face's fringe
// hangs outside the plate and the object reads with two edges a fraction apart.
//
// NOTHING HERE VARIES WITH TIME, and that is now enforced by there being no `uTime`
// uniform at all. The animated halo noise this file used to carry was the last
// moving part on the face; a premium display is stable, and anything that drifts or
// shimmers under type reads as a prop. `shell.frag` has said the same about its rim
// since it was written — this file has simply caught up.

uniform float uActivation;
/** Fades the copy alone, so content can swap without the panel blinking. */
uniform float uTextOpacity;
uniform float uAspect;
/**
 * The visible field's size as a fraction of the plane, 0..1.
 *
 * Below 1 the field ends before the geometry does, which is what leaves room for
 * the antialiasing fringe to die on top of the plate rather than outside it.
 */
uniform float uCoreInset;
uniform float uCornerRadius;
/** Width of the core's own fade, in the plane's half-height units. */
uniform float uEdgeFalloff;
uniform float uCoreOpacity;
/** How far past the core the fringe reaches. */
uniform float uHaloWidth;
uniform float uHaloStrength;
uniform vec3 uCoreColor;
uniform vec3 uHaloColor;
uniform vec3 uTextColor;
/**
 * The CONTROLS colour, and deliberately not `uTextColor`.
 *
 * These were one uniform until the controls became symbols. That was defensible
 * while every control was a word — the same treatment as the copy, only dimmer —
 * but a chevron and a paragraph in the same grey read as one undifferentiated
 * field of type, and the whole point of the glyph pass is that a visitor can find
 * what is pressable without reading it. Splitting the uniform is what lets the
 * controls carry a hue while the copy stays neutral, which is the only way to say
 * "interactive" here: there is no cursor on touch and no hover on a first look.
 */
uniform vec3 uControlColor;
uniform sampler2D uText;

// --- display material --------------------------------------------------------
/** Amplitude of the screen's own tonal gradient. Zero is a flat fill. */
uniform float uScreenDepth;
/** Master strength of the fake optical layer. Zero is the A/B against a flat panel. */
uniform float uGloss;
uniform vec3 uGlossColor;

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

#include <fog_pars_fragment>

/** Signed distance to a rounded box. Negative inside. */
float roundedBoxSdf(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  // Centred and aspect-corrected, so the corner radius and both falloffs stay
  // circular instead of stretching with the panel.
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 halfPlane = vec2(uAspect, 1.0) * 0.5;

  // The visible field, inset from the mesh.
  vec2 coreHalf = halfPlane * uCoreInset;
  float sdf = roundedBoxSdf(p, coreHalf, uCornerRadius);

  // Dense within the core, fading across an antialiasing width.
  float core = 1.0 - smoothstep(0.0, uEdgeFalloff, sdf);

  // The fringe: narrow, weak, and measured from the CORE CENTRE rather than from
  // the core's edge.
  //
  // Deriving it from the edge and weighting it by (1 - core) — which is what this
  // did first — makes it peak exactly where the core ends, painting a bright band
  // along the silhouette. That is a glowing rectangle outline arriving by a
  // different route, and it is still the failure mode to avoid.
  float halo = pow(1.0 - smoothstep(-uHaloWidth * 0.5, uHaloWidth, sdf), 2.4);

  float coreAlpha = core * uCoreOpacity;
  float haloAlpha = halo * uHaloStrength;

  // Tinted toward the fringe colour only well outside the dense area. Driving
  // this from `core` alone put a colour change at the boundary, which reads as
  // an outline even when its alpha is low.
  vec3 color = mix(uCoreColor, uHaloColor, clamp(smoothstep(0.0, uHaloWidth, sdf), 0.0, 1.0));

  // Added, not weighted by (1 - core). Two smooth ramps summing have no peak at
  // the handover; the weighted version had one, and that peak was the band.
  float panelAlpha = coreAlpha + haloAlpha;

  // The canvas maps onto the CORE, not the plane. That keeps the copy the same
  // physical size it was before the field was inset, and means the text region
  // follows the readable area automatically whenever the inset is retuned.
  vec2 textUv = (vUv - 0.5) / max(uCoreInset, 0.001) + 0.5;
  float inside =
    step(0.0, textUv.x) * step(textUv.x, 1.0) * step(0.0, textUv.y) * step(textUv.y, 1.0);

  // --- screen body -----------------------------------------------------------
  //
  // A very gentle luminance gradient, so the screen stops being a flat fill. Real
  // emissive panels are never uniform, and a perfectly even dark rectangle is the
  // single strongest tell that a surface is a texture rather than a display.
  //
  // A MIX toward `uHaloColor`, not an addition of `uCoreColor`.
  //
  // Adding the core to itself was the obvious move and it is nearly a no-op: the
  // core is almost black, so scaling it produces almost nothing, and the screen's
  // whole tonal range ended up being carried by the optical layer below — which is
  // backwards. The fringe colour is already defined as one step up from the screen
  // and is part of the same palette, so mixing toward it gives a real range while
  // staying hue-locked by construction.
  //
  // The 0.22 ceiling is what keeps it a gradient rather than a wash: at the default
  // `uScreenDepth` the brightest corner is about 15% of the way to the fringe.
  //
  // BEFORE the copy, so it never sits on top of type, and masked by `inside` so it
  // stays on the screen and off the plate's bleed ring.
  float lift = mix(0.35, 1.0, smoothstep(0.0, 0.85, textUv.y)) *
               (1.0 - 0.35 * smoothstep(0.45, 1.0, length((textUv - 0.5) * 1.6)));
  color = mix(color, uHaloColor, clamp(lift * uScreenDepth, 0.0, 1.0) * 0.22 * inside);

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

    // Named `press` rather than `lift`: the screen body's gradient above already
    // owns that name in this scope, and two different `lift`s in one function is
    // how the wrong one gets edited.
    float press = 0.0;
    if (i == uHoverIndex) press = 0.5;
    if (i == uPressedIndex) press = 1.0;

    // A soft field, not a filled button: the silhouette work applies here too.
    vec2 p2 = (local - 0.5) * 2.0;
    float field = 1.0 - smoothstep(0.35, 1.0, max(abs(p2.x), abs(p2.y)));
    controlAlpha = max(controlAlpha, field * uControlStrength * (0.5 + press));

    // Labels come from a stacked atlas, one row per control, chosen per slot.
    //
    // The row is stretched across the whole rect with no aspect correction, which
    // is why `paintLabels` draws each one pre-distorted by the inverse: the two
    // cancel, and a chevron in a square-ish rect stays a chevron instead of being
    // crushed into a vertical sliver.
    float row = float(uRectRows[i]);
    vec2 labelUv = vec2(local.x, (uLabelRows - row - 1.0 + local.y) / uLabelRows);
    controlGlyph = max(controlGlyph, texture2D(uControlLabels, labelUv).a * (0.75 + press * 0.25));
  }

  // The soft field CARRIES COLOUR now, and that is a fix rather than a flourish.
  //
  // `controlAlpha` only ever fed the alpha `max` at the bottom of this function, and
  // inside the core `panelAlpha` is already 1 — so it was mathematically incapable of
  // changing a single pixel. Every field the loop above computed was discarded, and
  // the entire hover and press response rested on the glyph term's 0.75 -> 1.0
  // brightening, which is a 33% alpha step on a thin stroke. That is close to
  // invisible at the district camera, and it is why the controls read as inert.
  //
  // Weighted by `controlAlpha` rather than by `field`, so the press term rides along
  // for free: at rest this lands about 4% toward the control colour, and pressed
  // about 11%. A tint, never a filled button — plan 003 §16 rules those out, and the
  // silhouette reasoning in this file's header applies to a control just as it does
  // to the panel's own edge.
  color = mix(color, uControlColor, controlAlpha * 0.18 * uTextOpacity);
  color = mix(color, uControlColor, controlGlyph * uTextOpacity);

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

  // --- optical top layer -----------------------------------------------------
  //
  // Fake reflections, and fake is the specification rather than a compromise. There
  // is no scene capture, no probe, no SSR and no environment map anywhere in this
  // experiment; what a laminated screen actually contributes to a render is a broad
  // low-contrast lightening that has almost nothing to do with what is behind the
  // viewer, and that is exactly what is cheap to fabricate convincingly.
  //
  // ANCHORED IN CORE SPACE, NEVER IN VIEW SPACE. The panel yaws +/-42 degrees to
  // follow the camera, so a view-derived highlight would slide across the screen as
  // it turned — and a moving reflection reads as an animated effect rather than as
  // a surface. `shell.frag` gives the same reasoning for keeping its rim highlight
  // in object space, so this is house vocabulary rather than a new idea; and the
  // plate's grazing term already supplies all the view response this object needs,
  // on real geometry, where it means something.
  //
  // COMPOSITED LAST, on top of the copy and the controls, because that is what a
  // laminated surface does: the reflection is in front of the glyphs, not behind
  // them. It costs a little contrast, which is why the amplitudes are single-digit
  // percent — enough that the surface reads as optical, far too little to soften a
  // glyph edge.
  //
  // Nothing here touches alpha. `inside` confines it to the core, where `coreAlpha`
  // is already 1, so the panel's transparency, depth and render order are provably
  // unchanged by this block.
  vec2 g = textUv;
  // The broadest, softest, lowest-frequency ingredient. No edge in it should be
  // locatable — if this one can be pointed at, it has become a gradient overlay.
  float sheen = smoothstep(0.15, 1.0, g.y);
  // One broad diagonal lobe, as a GAUSSIAN rather than a wrapped sawtooth.
  //
  // The first version built this from `fract`, which was a real defect and a visible
  // one: the sawtooth wrapped part way up the panel and left a soft but locatable
  // seam running diagonally across the screen. A reflection with an edge in it is
  // not a reflection, it is a shape. `exp` has no wrap and no discontinuity
  // anywhere, and the lobe is wider than the panel so only a section of it lands.
  float axis = (g.x * 0.6 + g.y * 0.8) / 1.4;
  float band = exp(-pow((axis - 0.62) / 0.42, 2.0));
  // Light catching the laminate at the screen's own edge. Hugs the INSIDE of the
  // core boundary, where the plate's bevel band picks up on the outside — the two
  // together are what make the join read as a lamination rather than as a seam.
  float edge = smoothstep(-0.02, -0.004, sdf) * (1.0 - smoothstep(-0.004, 0.0, sdf));

  float gloss = (sheen * 0.45 + band * 0.40 + edge * 0.15) * uGloss * inside;
  color += uGlossColor * gloss;

  float alpha = max(max(panelAlpha, glyph), max(controlAlpha + controlGlyph, scrollAlpha)) * uActivation;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));

  #include <fog_fragment>

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
