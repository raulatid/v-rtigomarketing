import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'
import { advanceExpansion, easeExpansion } from './panelExpansion'
import { deploymentFrom } from './holoDeployment'
import { prefersReducedMotion } from '../../../app/warpTransition'
import { PROTO_HOLO } from '../../../app/protoHolo'

// The holographic brand panel floating above a satellite.
//
// It has two states. At rest it is a SQUARE CORE showing the brand's isotype —
// its symbol alone. While its case study is selected, two lateral WINGS deploy
// from the core to open the 2:1 field the full logo lockup needs, and fold back
// on deselect. Six wordmarks permanently on screen was a lot of horizontal text
// competing with the Earth; the isotype is the same identity at a quarter of
// the footprint, and the lockup is a reward for showing interest.
//
// A PROJECTION SYSTEM DEPLOYS; A RECTANGLE DOES NOT GET WIDER. That is plan
// 007's one conceptual shift, and it decides the geometry: the quad is always
// the fully deployed footprint, and the fragment shader draws only the parts
// the expansion has opened — the core at rest, the wings travelling out from a
// gap beside it, a stem beneath carrying the emitter beam toward the satellite.
// One quad, one draw call per panel, and a three-part silhouette; separate
// wing meshes would each need a view-space offset to survive the billboard
// below, for no visual gain.
//
// ONE EASED VALUE DRIVES EVERYTHING. Each frame produces a single number and
// `holoDeployment.ts` remaps it into the stages the shader consumes — the
// core's activation, the wings' travel, the logo's resolve. They are not three
// tweens that happen to share a duration — that arrangement drifts, and it
// drifts visibly: a field aspect a frame behind the wings draws the lockup past
// the structure that is meant to hold it.
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

  // The single scalar, eased, and its stages: (activation, deploy, resolve,
  // wing extent). See holoDeployment.ts — the shader never remaps ranges.
  uniform float uExpand;
  uniform vec4 uDeploy;

  uniform vec3 uBrandColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uBreath;
  uniform float uGlassAlpha;

  // Quad → pane space. The quad's size in pane heights, and the core's centre
  // in quad uv. Constant per panel; both come from the config.
  uniform vec2 uQuadScale;
  uniform vec2 uOrigin;
  // (wing gap, wing height / 2, bracket length, stem length), in pane heights.
  uniform vec4 uShape;

  varying vec2 vUv;

  // The pane. rgb(12, 15, 22) — the case panel's dark — given here in LINEAR
  // space, since everything below colorspace_fragment is linear.
  const vec3 GLASS = vec3(0.0037, 0.0048, 0.0080);
  // The structure: white at a whisper, the case panel's 1px hairline.
  const float HAIRLINE_ALPHA = 0.16;
  // Mid-edge registration segments on the core's top and bottom, half-length.
  const float MID_SEGMENT = 0.09;
  // Alignment ticks along the wing rails: spacing and length.
  const float TICK_SPACING = 0.15;
  const float TICK_LENGTH = 0.05;
  // The terminal node at each rail's end: half-side of the filled square.
  const float NODE_HALF = 0.018;

  // Straight-alpha "over": lays (sc, sa) on top of the running (c, a).
  // Everything in this panel is a layer over transparent space, and the
  // emitter is a layer too — a line of light over dark sky composes the same
  // way a line of paint does once alpha is accounted for.
  void over(inout vec3 c, inout float a, vec3 sc, float sa) {
    float na = sa + a * (1.0 - sa);
    c = na > 0.0 ? (sc * sa + c * a * (1.0 - sa)) / na : c;
    a = na;
  }

  // A screen-constant hairline at d == 0. Width from the screen-space
  // derivative, so it is ~1px at the close-up AND ~1px on the 30px resting
  // core. A width fixed in pane units would be a fat band on the small panel —
  // the loudest thing in it, six times over.
  float line(float d, float px) {
    return 1.0 - smoothstep(px * 0.8, px * 2.0, abs(d));
  }

  // 1 inside [a, b].
  float seg(float t, float a, float b) {
    return step(a, t) * step(t, b);
  }

  // Field uv → art uv, artwork CONTAINED and centred in a field of aspect Q.
  //
  // Needed because the field's aspect animates from 1:1 to 2:1 while each
  // artwork's is fixed. Without it the isotype would stretch to twice its width
  // as the wings deploy, which is precisely the "never deform a trademark"
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

  // THE CHROME IS DESIGNED TO BE LOOKED THROUGH, NOT AT. Dark glass, a
  // screen-constant hairline, the artwork untouched, and the brand colour on
  // exactly one thing — the light: the emitter line under the core, the beam
  // it stands on, and the trace that runs out along the wings. The brand colour
  // lives on the light source, never on the pane, so a real full-colour
  // trademark shows its own colours with no cast.
  void main() {
    float activation = uDeploy.x;
    float deploy = uDeploy.y;
    float resolve = uDeploy.z;
    float extent = uDeploy.w;

    float gap = uShape.x;
    float wingHalf = uShape.y;
    float bracket = uShape.z;
    float stem = uShape.w;

    // ── Pane space ──
    // Pane-height units, origin at the core's centre: the core is the unit
    // square |p| <= 0.5, the wings lie along ±x beyond it, the stem below it.
    // A distance measured here is the same on both axes and at every point of
    // the deployment, because the quad never changes shape.
    vec2 p = (vUv - uOrigin) * uQuadScale;
    vec2 px = fwidth(p);                       // one screen pixel, per axis
    float ax = abs(p.x);
    vec2 dc = abs(p) - 0.5;                    // signed distance past each core edge
    float insideCore = step(max(dc.x, dc.y), 0.0);

    // The selected-state energy: a small surge as the core activates, easing
    // back into a stable glow once the logo has resolved. Peak, then settle.
    float energy = 1.0 + 0.35 * activation - 0.15 * resolve;

    // ── The brand plate ──
    // The artwork field is centred on the core and opens from 1:1 to 2:1 with
    // the wings — the same stage, so the lockup can never be fitted into a
    // field the structure has not yet opened. Both artworks are fitted against
    // the CURRENT field aspect, so each stays undistorted at every point of the
    // deployment, and the crossfade is the only thing that changes between
    // them. Sampled clean: no scanlines, no grain. The plate is a trademark and
    // is drawn exactly as delivered.
    float fieldAspect = 1.0 + deploy;
    vec2 fuv = p / vec2(fieldAspect, 1.0) + 0.5;
    vec4 isotype = sampleArt(uIsotype, uIsoOffset, uIsoScale, fuv, fieldAspect, uIsoAspect);
    vec4 logo = sampleArt(uLogo, uLogoOffset, uLogoScale, fuv, fieldAspect, uLogoAspect);
    vec4 plate = mix(isotype, logo, resolve);

    vec3 color = GLASS;
    float alpha = 0.0;

    // ── The core's projection field ──
    // Neutral dark, denser at the centre and toward the emitter beneath it,
    // thinning toward the edges: a field the isotype hangs in, not a card it is
    // printed on. One faint diagonal sheen — a glass highlight, not a CRT.
    float radial = 1.0 - 0.45 * smoothstep(0.15, 0.72, length(p));
    float vertical = mix(0.75, 1.0, 0.5 - p.y);
    float sheen = 0.03 * smoothstep(0.2, 0.9, (p.x + 0.5) + (p.y + 0.5) * 0.4);
    float coreGlass = uGlassAlpha * 0.75 * radial * vertical * insideCore;
    over(color, alpha, GLASS + vec3(sheen), coreGlass);

    // A soft internal glow behind the symbol, brightening a little on
    // activation. White, not brand: a tint behind a trademark is a cast on it.
    float halo = exp(-length(p) * 3.2) * (0.05 + 0.04 * activation) * insideCore;
    over(color, alpha, vec3(1.0), halo);

    // ── The wings' projection wash ──
    // Faint, fading toward the tips: the field thins as it leaves the core.
    float root = 0.5 + gap;
    float tip = root + extent;
    float insideWing = seg(ax, root, tip) * step(abs(p.y), wingHalf);
    float reach = extent > 0.0 ? clamp((ax - root) / extent, 0.0, 1.0) : 0.0;
    float wingGlass = uGlassAlpha * 0.38 * (1.0 - 0.6 * reach) * insideWing * deploy;
    over(color, alpha, GLASS, wingGlass);

    // The artwork sits over the glass of both, untinted.
    over(color, alpha, plate.rgb, plate.a);

    // ── The core's structure ──
    // No complete outline — that is the card language being left behind. Four
    // corner brackets, two registration segments at the middle of the top and
    // bottom edges, and nothing along the sides: that is where the wings root.
    float onH = line(dc.y, px.y);              // on the top or bottom edge line
    float onV = line(dc.x, px.x);              // on the left or right edge line
    float corner = onH * seg(ax, 0.5 - bracket, 0.5 + px.x)
                 + onV * seg(abs(p.y), 0.5 - bracket, 0.5 + px.y);
    float mid = onH * step(ax, MID_SEGMENT);
    float structure = clamp(corner + mid, 0.0, 1.0);

    // ── The wings' structure ──
    // A root bracket that appears with activation — the wing's origin, visible
    // before it travels — then rails along the top and bottom edges, alignment
    // ticks hanging from them, and a filled node terminating each rail.
    float rootLine = line(ax - root, px.x) * step(abs(p.y), wingHalf) * activation;
    float rails = line(abs(p.y) - wingHalf, px.y) * seg(ax, root, tip);
    float endCap = line(ax - tip, px.x) * step(abs(p.y), wingHalf) * step(0.001, extent);
    float along = ax - root;
    float tickIndex = floor(along / TICK_SPACING + 0.5);
    float tickDist = abs(along - tickIndex * TICK_SPACING);
    float ticks = line(tickDist, px.x) * step(1.0, tickIndex) * step(ax, tip - NODE_HALF)
                * seg(abs(p.y), wingHalf - TICK_LENGTH, wingHalf);
    vec2 node = vec2(ax - tip, abs(p.y) - wingHalf);
    float nodes = step(max(abs(node.x), abs(node.y)), NODE_HALF) * step(0.001, extent);
    float wingStructure = clamp(rootLine + (rails + endCap + ticks + nodes) * deploy, 0.0, 1.0);

    over(color, alpha, vec3(1.0), max(structure, wingStructure) * HAIRLINE_ALPHA * energy);

    // ── The emitter ──
    // The signature. A brand-colour line along the core's bottom edge, the
    // core's exact width; beneath it a beam narrowing down the stem toward the
    // satellite, with a soft cone of light that is widest under the line and
    // gathers to a point at the foot, where a small glow marks the origin.
    // The viewer should infer satellite → emitter → hologram. The cone
    // breathes, slowly; nothing flickers.
    float onBottom = line(p.y + 0.5, px.y) * step(ax, 0.5);
    float emit = onBottom * 0.9 * energy;

    float down = -0.5 - p.y;                   // distance below the core's edge
    float u = clamp(down / stem, 0.0, 1.0);    // 0 at the core, 1 at the foot
    float inStem = step(0.0, down) * step(down, stem);
    float beam = line(p.x, px.x) * inStem * (1.0 - u) * 0.6 * energy;

    float breath = 1.0 - uBreath + uBreath * (0.92 + 0.08 * sin(uTime * 1.4));
    float coneWidth = mix(0.42, 0.03, u);
    float cone = exp(-ax / coneWidth) * exp(-u * 2.6) * inStem * 0.32 * breath * energy;

    vec2 foot = vec2(0.0, -0.5 - stem);
    float footGlow = exp(-length(p - foot) / 0.05) * 0.55 * energy;

    // The wings' bottom rails carry the light out from the core — the one
    // brand-coloured element extends rather than a second one appearing — and
    // a short trace at each root joins rail to emitter line.
    float trace = line(p.y + wingHalf, px.y) * seg(ax, root, tip) * 0.7 * deploy;
    float joint = line(ax - root, px.x) * seg(-p.y, wingHalf, 0.5) * 0.7 * deploy;

    float light = max(max(emit, beam), max(max(cone, footGlow), max(trace, joint)));
    over(color, alpha, uBrandColor, light);

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

/**
 * The quad's footprint, in pane heights, and where the core's centre sits in it.
 *
 * Exported for the config tests: the footprint is the fully deployed structure
 * plus a margin, and the core is offset upward by the stem below it. Neither
 * number is otherwise visible outside the shader.
 */
export function panelFootprint(cfg = ORBIT_CONFIG.panel) {
  const width = 1 + 2 * (cfg.wingGap + cfg.wingLength + cfg.margin)
  const height = 1 + cfg.stemLength + 2 * cfg.margin
  // Quad uv of the core's centre: from the bottom, the margin, then the stem,
  // then half the core.
  const originY = (cfg.margin + cfg.stemLength + 0.5) / height
  return { width, height, originY }
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
  const footprint = panelFootprint(cfg)

  // Sampled once, at construction, the way SpaceBackdrop samples it for the
  // twinkle: under reduced motion the deployment resolves immediately (a zero
  // duration snaps — see advanceExpansion) and the emitter's breathing stops.
  // Selection semantics and the isotype/logo state are untouched.
  const reducedMotion = prefersReducedMotion()
  const expandDuration = reducedMotion ? 0 : cfg.expandDuration

  const uniforms = {
    uIsotype: { value: isotypeAtlas.texture },
    uIsoOffset: { value: isoCell.offset },
    uIsoScale: { value: isoCell.scale },
    uIsoAspect: { value: isotypeAtlas.aspect },

    uLogo: { value: logoAtlas.texture },
    uLogoOffset: { value: logoCell.offset },
    uLogoScale: { value: logoCell.scale },
    uLogoAspect: { value: logoAtlas.aspect },

    // Both written every frame by applyExpansion, never independently — see
    // the header note. Seeded collapsed so the first frame drawn before any
    // update() is already correct.
    uExpand: { value: 0 },
    uDeploy: { value: new THREE.Vector4(0, 0, 0, 0) },

    uBrandColor: { value: new THREE.Color(brandColor) },
    uOpacity: { value: 0 },
    uTime: { value: Math.random() * 100 },
    uBreath: { value: reducedMotion ? 0 : 1 },
    uGlassAlpha: { value: cfg.glassAlpha },

    uQuadScale: { value: new THREE.Vector2(footprint.width, footprint.height) },
    uOrigin: { value: new THREE.Vector2(0.5, footprint.originY) },
    uShape: {
      value: new THREE.Vector4(cfg.wingGap, cfg.wingHeight / 2, cfg.bracketLength, cfg.stemLength),
    },
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
  // The FULLY DEPLOYED footprint, always: the shader opens and closes the
  // structure inside it. Positioned so the core's centre — not the quad's —
  // sits at offsetY; the stem hangs below toward the satellite.
  mesh.scale.set(footprint.width * cfg.height, footprint.height * cfg.height, 1)
  mesh.position.y = cfg.offsetY - (footprint.originY - 0.5) * footprint.height * cfg.height
  // The panel is decoration and must never intercept the satellite's hover
  // sphere, which is smaller and sits below it.
  mesh.raycast = () => {}
  // Transparent, unsorted, always drawn after the opaque scene.
  mesh.renderOrder = 2

  function setOpacity(factor: number) {
    uniforms.uOpacity.value = factor * cfg.maxOpacity
  }

  // Raw, un-eased position of the deployment. Stored as a VALUE rather than a
  // start timestamp so a target flipped mid-flight reverses from where the
  // panel actually is — see panelExpansion.ts.
  let expansion = 0
  let expansionTarget = 0

  /**
   * The single point where the eased value becomes uniforms.
   *
   * Every stage the shader reads is derived here from the one value that was
   * just eased — never lerped in parallel with it — so the wings' travel, the
   * field's aspect and the logo's crossfade cannot disagree for a frame.
   */
  function applyExpansion() {
    const eased = easeExpansion(expansion)
    const d = deploymentFrom(eased, cfg.wingLength)
    uniforms.uExpand.value = eased
    uniforms.uDeploy.value.set(d.activation, d.deploy, d.resolve, d.wingExtent)
  }

  /** Asks the panel to deploy or fold. Animated; takes effect over `expandDuration`. */
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
    // Prototype scaffolding (plan 007 phase 2): `?holo=1&holoExpand=` pins
    // every panel at one expansion so the structure can be inspected in the
    // real scene without the select/deselect journey. Inert unless the gate is
    // open, and unreachable in production — see protoHolo.ts.
    if (!PROTO_HOLO.freeze) uniforms.uTime.value += delta
    if (PROTO_HOLO.expand !== null) {
      if (expansion !== PROTO_HOLO.expand) {
        expansion = PROTO_HOLO.expand
        expansionTarget = PROTO_HOLO.expand
        applyExpansion()
      }
      return
    }
    if (expansion !== expansionTarget) {
      expansion = advanceExpansion(expansion, expansionTarget, delta, expandDuration)
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
