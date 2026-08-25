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
  uniform vec3 uFrameColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAspect;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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

  void main() {
    // ── The brand plate ──
    // Both artworks are fitted against the CURRENT quad aspect, so each stays
    // undistorted at every point of the unfold, and the crossfade is the only
    // thing that changes between them.
    vec4 isotype = sampleArt(uIsotype, uIsoOffset, uIsoScale, vUv, uAspect, uIsoAspect);
    vec4 logo = sampleArt(uLogo, uLogoOffset, uLogoScale, vUv, uAspect, uLogoAspect);
    vec4 plate = mix(isotype, logo, uExpand);

    // Projection feel, deliberately restrained: the plate is the one thing that
    // must stay readable, so it gets travelling scanlines and a little grain,
    // never a hue shift or a displacement.
    float scan = 0.5 + 0.5 * sin(vUv.y * 220.0 - uTime * 1.6);
    float grain = hash(vUv * 320.0 + floor(uTime * 24.0));
    float plateMod = 0.88 + 0.12 * scan + 0.05 * (grain - 0.5);
    vec3 plateColor = plate.rgb * plateMod;
    float plateAlpha = plate.a * (0.9 + 0.1 * scan);

    // ── The pane ──
    // A faint brand-tinted wash so the panel reads as a surface rather than
    // floating text, brightest at the bottom edge like a projected beam.
    float paneGradient = mix(0.10, 0.03, vUv.y);
    vec3 paneColor = uBrandColor * 0.55;

    // ── The frame ──
    // Distance to the nearest edge, aspect-corrected so a 2:1 panel gets an
    // even border rather than a stretched one.
    vec2 edges = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
    float edge = min(edges.x, edges.y);

    float border = 1.0 - smoothstep(0.012, 0.020, edge);
    // Corner brackets: the border, kept only where BOTH axes are near an end.
    // min(), not max() — max() is true all along an edge (a point mid-way down
    // the top edge is still "near the top"), which lights the whole border
    // uniformly and loses the bracket read entirely.
    float towardCornerX = 1.0 - smoothstep(0.16, 0.30, edges.x);
    float towardCornerY = 1.0 - smoothstep(0.10, 0.20, edges.y);
    float bracket = min(towardCornerX, towardCornerY);
    // A continuous hairline everywhere, brightening hard into the corners.
    float frame = border * (0.22 + 0.78 * bracket);

    // Outward bleed, which is most of what sells "emitted, not printed".
    float bleed = exp(-edge * 26.0) * 0.30;

    // Flicker rides only the frame — a flickering wordmark reads as broken
    // rather than holographic.
    float flicker = 0.92 + 0.08 * sin(uTime * 9.0) * hash(vec2(floor(uTime * 12.0), 3.0));
    float frameAlpha = clamp((frame + bleed) * flicker, 0.0, 1.0);

    // ── Composite ──
    vec3 color = mix(paneColor, plateColor, plateAlpha);
    float alpha = paneGradient + plateAlpha * (1.0 - paneGradient);

    // The frame is emissive: added to colour, unioned into coverage.
    color += uFrameColor * frameAlpha;
    alpha = clamp(alpha + frameAlpha, 0.0, 1.0);

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
    uFrameColor: { value: new THREE.Color(cfg.frameColor) },
    uOpacity: { value: 0 },
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
