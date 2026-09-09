// The display's FRONT FACE — a screen wearing a rasterised web page.
//
// Copied from `services-buildings`' face and then substantially cut. What survives
// is the object: a rounded, antialiased silhouette registered against the plate
// behind it, a deep graphite body, and a fake optical top layer. What is gone is
// everything that made it a UI — the control fields, the label atlas, the scrollbar,
// the reading-viewport folds and the tall-canvas windowing.
//
// ## The texture is COLOUR here, not a mask
//
// This is the substantive change and it inverts the original mechanism. The source
// painted white glyphs on a transparent canvas, sampled `.a`, and mixed the panel
// toward `uTextColor` by that alpha — the shader supplied the colour and the canvas
// supplied only a stencil. A rasterised page has its own colour in every pixel, so
// `uPage` is now sampled as RGBA and composited over the panel by its own alpha.
// `uTextColor` went with the change; there is nothing left for it to tint.
//
// The texture must therefore be uploaded as `SRGBColorSpace`. At `NoColorSpace` —
// which was correct while only alpha was read, since alpha is never colour-managed —
// sRGB bytes would be taken as linear and then re-encoded on output, and a mid-grey
// would land near 0.735 instead of 0.5. Washed out, with nothing to point at.
//
// ## Two regions, still
//
//   core   dense, calm, opaque — the page sits here
//   halo   narrow, very low alpha — an antialiasing fringe, never a second frame
//
// ## Three live warnings
//
// The margin outside the core is `0.5 - 0.5 * uCoreInset` — 0.08 shader units at the
// current inset — and `uEdgeFalloff + uHaloWidth` must fit inside it. Push
// `uHaloWidth` past that and the halo clips flat against the mesh boundary, drawing
// a visible rectangle where the plate's silhouette should be the only findable edge.
//
// `uEdgeFalloff * panelHeight` must stay under `SHELL_BLEED`, or the face's fringe
// hangs outside the plate and the object reads with two edges a fraction apart.
//
// NOTHING HERE VARIES WITH TIME, enforced by there being no `uTime` at all. A
// premium display is stable, and anything that drifts under type reads as a prop.
//
// ## The optical layer is now RAMPED FROM OUTSIDE, and that is the transition
//
// `uGloss` is what makes this read as a lit screen rather than a poster: an additive
// sheen composited in front of the content. An HTML page has no such thing, and on a
// paper-white one it would clip — see the headroom weight where it is applied.
//
// So it is neither deleted nor left on. `blogDisplay` drives it to zero across the
// tail of the approach, so the object sheds its screen-ness exactly as it turns into
// the page. At the moment of the handoff this shader is drawing the raster and
// nothing else.

uniform float uActivation;
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

/** The rasterised page. RGBA, in sRGB — see the header. */
uniform sampler2D uPage;

// --- display material --------------------------------------------------------
/** Master strength of the fake optical layer. Zero is a flat panel. */
uniform float uGloss;
uniform vec3 uGlossColor;

varying vec2 vUv;

/** Signed distance to a rounded box. Negative inside. */
float roundedBoxSdf(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  // Centred and aspect-corrected, so the corner radius and both falloffs stay
  // circular instead of stretching with the panel.
  //
  // THIS IS WHY THE PLANE MAY NOW BE ANY SHAPE. `uAspect` normalises to the plane's
  // HEIGHT, so the SDF, the corner radius, the edge falloff and the halo width are
  // all in one isotropic space and none of them had to change when the panel stopped
  // being square to take the viewport's proportions. The square assumption never
  // lived in this file; it lived in the canvas the copy was painted on.
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

  // The page maps onto the CORE, not the plane. That is what makes the readable
  // area and the image the same rectangle whatever the inset is retuned to — and it
  // is the mapping the fill distance is solved against, so the page's edge and the
  // viewport's edge can be made to coincide.
  vec2 pageUv = (vUv - 0.5) / max(uCoreInset, 0.001) + 0.5;
  float inside =
    step(0.0, pageUv.x) * step(pageUv.x, 1.0) * step(0.0, pageUv.y) * step(pageUv.y, 1.0);

  // --- the screen body is GONE, and this note is why -------------------------
  //
  // There used to be a `lift` term here: a gentle luminance gradient written into
  // `color` before the page, on the reasoning that a perfectly even dark rectangle
  // is the strongest tell that a surface is a texture rather than a display.
  //
  // It could not draw anything, and had not been able to since the page became a
  // texture. It wrote into `color` BEFORE the composite below, and `pageAlpha` is 1
  // across the entire core — the raster is opaque, and `pageUv` is derived from the
  // same `uCoreInset` as `coreHalf`, so the margin it claimed to tone has width
  // zero by construction. Measured before removing it: sweeping its uniform across
  // its whole range changed 153 pixels of a 700,000-pixel frame, all of them on the
  // one-pixel mask edge.
  //
  // So `uScreenDepth` went with it, and its debug slider too. A knob that does
  // nothing is worse than a missing knob: it invites the next person to spend an
  // hour deciding whether it is broken or merely subtle.
  //
  // If a screen gradient is wanted again it has to go AFTER the page and be
  // multiplicative, like the gloss below — an emissive panel's unevenness is
  // something you see THROUGH the content, not behind it.

  // --- the page --------------------------------------------------------------
  //
  // RGBA, composited by its own alpha. The raster is opaque, so inside the core this
  // is a straight replacement — which is the point: at the end of the approach the
  // only thing on screen must be the page, pixel for pixel, or the handoff shows.
  //
  // Sampled unconditionally and masked afterwards rather than branched on `inside`:
  // a texture fetch inside a conditional forces the derivative computation the mip
  // selection needs into undefined territory, and the symptom is a shimmering band
  // at the core's edge.
  vec4 page = texture2D(uPage, pageUv);
  float pageAlpha = page.a * inside;
  color = mix(color, page.rgb, pageAlpha);

  // --- optical top layer -----------------------------------------------------
  //
  // Fake reflections, and fake is the specification rather than a compromise. There
  // is no scene capture, no probe and no environment map anywhere in this
  // experiment; what a laminated screen actually contributes to a render is a broad
  // low-contrast lightening that has almost nothing to do with what is behind the
  // viewer, and that is exactly what is cheap to fabricate convincingly.
  //
  // ANCHORED IN CORE SPACE, NEVER IN VIEW SPACE. The panel yaws to follow the
  // camera, so a view-derived highlight would slide across the screen as it turned —
  // and a moving reflection reads as an animated effect rather than as a surface.
  //
  // COMPOSITED LAST, on top of the page, because that is what a laminated surface
  // does: the reflection is in front of the content, not behind it. It is also
  // ADDITIVE, which is why `uGloss` must reach zero before the handoff — there is no
  // additive haze on an HTML document, and on a bright region it would clip.
  //
  // Nothing here touches alpha. `inside` confines it to the core, where `coreAlpha`
  // is already 1, so the panel's transparency, depth and render order are provably
  // unchanged by this block.
  vec2 g = pageUv;
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

  // WEIGHTED BY THE HEADROOM IT HAS, and this line is what lets a paper-white page
  // wear a sheen at all.
  //
  // The term is ADDITIVE, and the page it now sits on is `#fbfbfa` — linear 0.965.
  // `uGlossColor` is linear (0.423, 0.479, 0.540) and the lobes peak around 0.85,
  // so at `uGloss` 0.16 the peak adds (0.058, 0.065, 0.073) to a channel that has
  // 0.035 left. Every channel clips, and BLUE CLIPS FIRST — which leaves a band
  // where blue is pinned at 255 while red and green are still climbing, i.e. a
  // yellow-to-white gradient ending in a hard contour drawn across the copy. This
  // file's own header names that failure: "a reflection with an edge in it is not
  // a reflection, it is a shape."
  //
  // Turning the amplitude down does not fix it, it removes it: the no-clip ceiling
  // on paper is `uGloss` around 0.065, which is worth about four sRGB levels.
  //
  // So the weight is the remaining headroom. On the old black page it is 1.0 and
  // the look is preserved EXACTLY, which is what makes this safe. On paper it is
  // 0.035 and the sheen steps aside. And it survives where there IS headroom — the
  // 74px black bar across the top of the blog, and the black active pill — which is
  // a better result than before: the reflection lands on the dark chrome and leaves
  // the reading surface alone, which is what a laminated screen actually does.
  gloss *= 1.0 - max(color.r, max(color.g, color.b));

  color += uGlossColor * gloss;

  float alpha = max(panelAlpha, pageAlpha) * uActivation;

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));

  // NOT OPTIONAL, AND THE FAILURE IS SILENT — plan 001 amendment A3.
  //
  // Worth knowing what they cost here specifically: the page goes through ACES, and
  // a DOM element does not, so the panel's rendering of a colour and the browser's
  // are not the same number. ACES maps zero to zero exactly and is near-linear again
  // by the highlights, which is precisely why `blogPage` is authored on pure black
  // with near-white type — that palette crosses the boundary untouched, and a large
  // mid-grey field would not.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
