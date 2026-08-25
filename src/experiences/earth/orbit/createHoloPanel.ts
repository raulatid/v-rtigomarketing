import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'
import { advanceExpansion, easeExpansion } from './panelExpansion'

// The holographic brand panel floating above a satellite.
//
// It has two states. At rest it is a SQUARE showing the brand's isotype — its
// symbol alone. While its case study is selected it UNFOLDS to a 2:1 quad
// showing the full logo lockup, and folds back on deselect. Six wordmarks
// permanently on screen was a lot of horizontal text competing with the Earth;
// the isotype is the same identity at a quarter of the footprint, and the
// lockup is a reward for showing interest.
//
// ONE EASED VALUE DRIVES EVERYTHING. Each frame produces a single number and
// the quad's width, the frame's aspect correction and the isotype→logo
// crossfade are all derived from it. They are not three tweens that happen to
// share a duration — that arrangement drifts, and it drifts visibly: an aspect
// correction a frame behind the width draws a border thicker on one axis than
// the other, which is exactly the kind of wrong that survives review.
//
// Geometry is a plain unit quad created in code — a Blender round trip would
// add a GLB fetch and a Draco decode for two triangles, and would freeze the
// dimensions into an asset instead of leaving them as config knobs.
//
// It BILLBOARDS IN THE VERTEX SHADER rather than through lookAt(). That keeps
// the per-frame CPU cost at zero (no matrix writes, no camera reads on the JS
// side) and, more importantly, keeps the "satellite orientation never reads
// camera state" rule intact for the model itself — this panel is a separate
// object that is allowed to face the viewer, because an unreadable label has no
// purpose. See DECISIONS.md 26.11.

const VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Column lengths recover the accumulated parent scale — the orbit group's
    // Earth-radius scale, the entrance animation's growth and the hover bump —
    // which a camera-aligned quad would otherwise discard along with the
    // rotation it is deliberately throwing away.
    vec2 parentScale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));

    // Billboard: place the quad's ORIGIN through the normal transform, then
    // spread its corners across the camera's own axes in view space.
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvPosition.xy += position.xy * parentScale;

    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uIsotype;
  uniform vec2 uIsoOffset;
  uniform vec2 uIsoScale;
  uniform float uIsoAspect;

  uniform sampler2D uLogo;
  uniform vec2 uLogoOffset;
  uniform vec2 uLogoScale;
  uniform float uLogoAspect;

  uniform float uExpand;
  uniform vec3 uBrandColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAspect;
  uniform float uInset;
  uniform float uGlassAlpha;

  varying vec2 vUv;

  // The pane. rgb(12, 15, 22) — the case panel's dark — given here in LINEAR
  // space, since everything below colorspace_fragment is linear.
  const vec3 GLASS = vec3(0.0037, 0.0048, 0.0080);
  // The frame and ticks: white at a whisper, the case panel's 1px hairline.
  const float HAIRLINE_ALPHA = 0.16;

  // Straight-alpha "over": lays (sc, sa) on top of the running (c, a).
  // Everything in this panel is a layer over transparent space, and the
  // emitter is a layer too — a line of light over dark sky composes the same
  // way a line of paint does once alpha is accounted for.
  void over(inout vec3 c, inout float a, vec3 sc, float sa) {
    float na = sa + a * (1.0 - sa);
    c = na > 0.0 ? (sc * sa + c * a * (1.0 - sa)) / na : c;
    a = na;
  }

  // Quad uv → art uv, artwork CONTAINED and centred in a quad of aspect Q.
  //
  // Needed because the quad's aspect animates from 1:1 to 2:1 while each
  // artwork's is fixed. Without it the isotype would stretch to twice its width
  // as the panel unfolds, which is precisely the "never deform a trademark"
  // rule the atlas already goes to some trouble to honour.
  vec2 containUv(vec2 uv, float Q, float A) {
    vec2 cover = A > Q ? vec2(1.0, Q / A) : vec2(A / Q, 1.0);
    return (uv - 0.5) / cover + 0.5;
  }

  // The sample order is: contain-fit → BOUNDS CHECK → atlas-cell mapping.
  //
  // The bounds check has to happen on the contained uv, before the cell fold.
  // Afterwards the coordinate is inside its cell by construction, so the test
  // would always pass, and the letterbox either side of a contained artwork
  // would instead sample the cell's edge texel — ClampToEdge smearing the
  // neighbouring plate's border across the gap. Transparent is the only correct
  // answer outside the artwork.
  vec4 sampleArt(sampler2D atlas, vec2 offset, vec2 scale, vec2 uv, float Q, float A) {
    vec2 art = containUv(uv, Q, A);
    if (any(lessThan(art, vec2(0.0))) || any(greaterThan(art, vec2(1.0)))) {
      return vec4(0.0);
    }
    return texture2D(atlas, offset + art * scale);
  }

  // Corner ticks, in pane-height units: how far past the corner each edge line
  // is continued, and the gap before it starts. Registration marks, not
  // brackets — the same "this is a projection" cue at a tenth of the weight.
  const float TICK_GAP = 0.006;
  const float TICK_LEN = 0.022;

  // THE CHROME IS DESIGNED TO BE LOOKED THROUGH, NOT AT. Dark glass, a
  // screen-constant hairline, the artwork untouched, and exactly one
  // brand-coloured element — the emitter line along the bottom edge, whose
  // bloom is what makes the panel read as projected up from the satellite. The
  // brand colour lives on the light source, never on the pane, so a real
  // full-colour trademark shows its own colours with no cast.
  void main() {
    // ── Pane space ──
    // The glass occupies the central uInset of the quad. uv is the pane's own
    // 0..1 space and runs a little past it into the band where the ticks and
    // the bloom live; q is the same space aspect-corrected and centred, so a
    // distance measured in it is the same on both axes of a 2:1 panel.
    vec2 uv = (vUv - 0.5) / uInset + 0.5;
    vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
    vec2 d = abs(q) - vec2(uAspect, 1.0) * 0.5;   // signed distance past each pane edge
    vec2 px = fwidth(q);                          // one screen pixel, per axis
    float band = (1.0 / uInset - 1.0) * 0.5;      // the outside band, in uv units
    float inside = step(max(d.x, d.y), 0.0);

    // ── The brand plate ──
    // Both artworks are fitted against the CURRENT pane aspect, so each stays
    // undistorted at every point of the unfold, and the crossfade is the only
    // thing that changes between them. Sampled clean: no scanlines, no grain.
    // The plate is a trademark and is drawn exactly as delivered.
    vec4 isotype = sampleArt(uIsotype, uIsoOffset, uIsoScale, uv, uAspect, uIsoAspect);
    vec4 logo = sampleArt(uLogo, uLogoOffset, uLogoScale, uv, uAspect, uLogoAspect);
    vec4 plate = mix(isotype, logo, uExpand);

    // ── The glass ──
    // Neutral dark, a touch denser toward the bottom where the emitter is, and
    // one faint diagonal sheen — a glass highlight, not a CRT.
    float sheen = 0.03 * smoothstep(0.35, 0.65, uv.x + uv.y * 0.4);
    vec3 color = GLASS + vec3(sheen);
    float alpha = uGlassAlpha * mix(0.7, 1.0, 1.0 - uv.y) * inside;

    over(color, alpha, plate.rgb, plate.a);

    // ── The hairline ──
    // Width from screen-space derivatives, so it is ~1px at the close-up AND
    // ~1px on the 30px resting isotype. A width fixed in uv would be a fat band
    // on the small panel — the loudest thing in it, six times over.
    float edge = max(d.x, d.y);
    float epx = fwidth(edge);
    float hairline = 1.0 - smoothstep(epx * 0.8, epx * 2.0, abs(edge));

    // Corner ticks: each edge line continued past the corner, after a gap.
    float onH = 1.0 - smoothstep(px.y * 0.8, px.y * 2.0, abs(d.y));
    float onV = 1.0 - smoothstep(px.x * 0.8, px.x * 2.0, abs(d.x));
    float tickH = onH * step(TICK_GAP, d.x) * step(d.x, TICK_GAP + TICK_LEN);
    float tickV = onV * step(TICK_GAP, d.y) * step(d.y, TICK_GAP + TICK_LEN);

    over(color, alpha, vec3(1.0), max(hairline, max(tickH, tickV)) * HAIRLINE_ALPHA);

    // ── The emitter ──
    // The signature. A brand-colour line along the pane's bottom edge, the
    // exact width of the pane, with a soft bloom falling away beneath it into
    // the band — fading to nothing before the quad's edge would clip it. The
    // bloom breathes, slowly; nothing flickers.
    float onBottom = 1.0 - smoothstep(px.y * 0.8, px.y * 2.0, abs(uv.y));
    float span = step(0.0, uv.x) * step(uv.x, 1.0);
    float emit = onBottom * span * 0.9;

    float below = max(-uv.y, 0.0);
    float fall = exp(-below / band * 4.0);
    float ends = 1.0 - smoothstep(0.0, band, max(-uv.x, uv.x - 1.0));
    float breath = 0.92 + 0.08 * sin(uTime * 1.4);
    float bloom = step(uv.y, 0.0) * fall * ends * 0.35 * breath;

    over(color, alpha, uBrandColor, max(emit, bloom));

    gl_FragColor = vec4(color, alpha * uOpacity);

    // A raw ShaderMaterial gets no automatic output conversion, unlike the
    // built-in materials. Everything above is in linear space — the atlas is
    // tagged SRGBColorSpace so sampling linearises it, and THREE.Color converts
    // hex literals on assignment — so without this the panel renders visibly
    // dark and desaturated against the rest of the scene.
    #include <colorspace_fragment>
  }
`

// One quad shared by every panel; per-panel size lives in mesh.scale, which the
// vertex shader reads back out of the model matrix.
//
// Module-level because the sharing is the point — one geometry for every panel
// in every orbit. That leaves it with no natural owner among the panels, so the
// owner is declared instead: createOrbitSystem builds the satellites that build
// the panels, and releases this with them. See disposeSharedGeometry below.
let sharedGeometry: THREE.PlaneGeometry | null = null
function getGeometry() {
  if (!sharedGeometry) sharedGeometry = new THREE.PlaneGeometry(1, 1)
  return sharedGeometry
}

/**
 * Releases the shared quad. Called by `createOrbitSystem.dispose()` — the panels
 * themselves must not, since any one of them disposing it would pull the
 * geometry out from under its siblings.
 *
 * Safe to call more than once, and safe to call before a later orbit system is
 * built: `getGeometry()` is lazy, so the next panel rebuilds the quad.
 */
export function disposeSharedGeometry(): void {
  sharedGeometry?.dispose()
  sharedGeometry = null
}

interface Options {
  /** The square symbol, shown at rest. */
  isotypeAtlas: BrandAtlas
  /** The full horizontal lockup, shown while the case study is selected. */
  logoAtlas: BrandAtlas
  /** Which cell of BOTH atlases this panel shows — the grids are parallel. */
  index: number
  brandColor: string
}

export function createHoloPanel({ isotypeAtlas, logoAtlas, index, brandColor }: Options) {
  const cfg = ORBIT_CONFIG.panel
  const isoCell = isotypeAtlas.cellUv(index)
  const logoCell = logoAtlas.cellUv(index)

  const uniforms = {
    uIsotype: { value: isotypeAtlas.texture },
    uIsoOffset: { value: isoCell.offset },
    uIsoScale: { value: isoCell.scale },
    uIsoAspect: { value: isotypeAtlas.aspect },

    uLogo: { value: logoAtlas.texture },
    uLogoOffset: { value: logoCell.offset },
    uLogoScale: { value: logoCell.scale },
    uLogoAspect: { value: logoAtlas.aspect },

    uExpand: { value: 0 },
    uBrandColor: { value: new THREE.Color(brandColor) },
    uOpacity: { value: 0 },
    uInset: { value: cfg.inset },
    uGlassAlpha: { value: cfg.glassAlpha },
    uTime: { value: Math.random() * 100 },
    // Written every frame by applyExpansion, never independently — see the
    // header note. Seeded with the collapsed value so the first frame drawn
    // before any update() is already correct.
    uAspect: { value: cfg.collapsedWidth / cfg.height },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Never occludes the satellite behind it, and no sorting fight with the
    // orbit lines or the atmosphere shell.
    depthWrite: false,
    // The billboard always faces the camera, but the quad's winding flips when
    // the satellite passes behind the Earth — double-sided avoids it vanishing.
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(getGeometry(), material)
  mesh.scale.set(cfg.collapsedWidth, cfg.height, 1)
  mesh.position.y = cfg.offsetY
  // The panel is decoration and must never intercept the satellite's hover
  // sphere, which is smaller and sits below it.
  mesh.raycast = () => {}
  // Transparent, unsorted, always drawn after the opaque scene.
  mesh.renderOrder = 2

  function setOpacity(factor: number) {
    uniforms.uOpacity.value = factor * cfg.maxOpacity
  }

  // Raw, un-eased position of the unfold. Stored as a VALUE rather than a start
  // timestamp so a target flipped mid-flight reverses from where the panel
  // actually is — see panelExpansion.ts.
  let expansion = 0
  let expansionTarget = 0

  /**
   * The single point where the eased value becomes geometry and uniforms.
   *
   * Note `uAspect` is derived from the width that was just written, not lerped
   * in parallel with it. The frame's aspect correction and the quad's real shape
   * are then the same number by construction, and cannot disagree for a frame.
   */
  function applyExpansion() {
    const eased = easeExpansion(expansion)
    const width = THREE.MathUtils.lerp(cfg.collapsedWidth, cfg.expandedWidth, eased)
    mesh.scale.x = width
    uniforms.uAspect.value = width / cfg.height
    uniforms.uExpand.value = eased
  }

  /** Asks the panel to unfold or fold. Animated; takes effect over `expandDuration`. */
  function setExpanded(on: boolean) {
    expansionTarget = on ? 1 : 0
  }

  /**
   * Collapses immediately, with no animation.
   *
   * Distinct from `setExpanded(false)` because a scene reset is a teardown to
   * the pre-intro state, not a transition. A fold left running across a replay
   * would be visible underneath the entrance re-staggering the satellites in —
   * the same reason `reset()` already clears the hover bump outright rather than
   * tweening it away.
   */
  function resetExpansion() {
    expansion = 0
    expansionTarget = 0
    applyExpansion()
  }

  function update(delta: number) {
    uniforms.uTime.value += delta
    if (expansion !== expansionTarget) {
      expansion = advanceExpansion(expansion, expansionTarget, delta, cfg.expandDuration)
      applyExpansion()
    }
  }

  function dispose() {
    // Geometry is shared and both atlases are owned by createOrbitSystem — only
    // the per-panel material belongs to this instance.
    material.dispose()
  }

  return { mesh, setOpacity, setExpanded, resetExpansion, update, dispose }
}

export type HoloPanel = ReturnType<typeof createHoloPanel>
