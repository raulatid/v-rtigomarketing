import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'
import { advanceExpansion, easeExpansion } from './panelExpansion'
import { invitationPulse } from './invitation'
import { deploymentFrom } from './holoDeployment'
import { createEmitterCone } from './createEmitterCone'
import { prefersReducedMotion } from '../../../app/warpTransition'
import { PROTO_HOLO } from '../../../app/protoHolo'

// The SATELLITE PROJECTION FIELD: the brand artwork suspended in light above a
// satellite, with `createEmitterCone.ts` supplying the volume it hangs in.
//
// It has two states. At rest the field is square and holds the brand's isotype,
// its symbol alone. While its case study is selected the field opens to the 2:1
// the full lockup needs, and closes again on deselect. Six wordmarks
// permanently on screen was a lot of horizontal text competing with the Earth;
// the isotype is the same identity at a quarter of the footprint, and the
// lockup is a reward for showing interest.
//
// NOTHING HERE HAS AN EDGE. That is the whole design, and it is what three
// previous passes got wrong. Every one of them bounded the hologram with a
// mask — an inset pane, then a core and two wings, each a hard step() — and
// every one of them therefore read as a CARD, because a hard edge is what a
// card is. Brackets, ticks and terminal nodes were added on top to make the
// card look technical, which only made it a busier card. What bounds this field
// instead is falloff: a halo with compact support, and the artwork itself,
// feathered at its own boundary rather than cut there. No rectangle, no border,
// no bracket. See the fragment shader's main().
//
// The brand colour lives on the LIGHT and never on the artwork, so a real
// full-colour trademark shows its own colours with no cast. What the artwork
// does take from the field is its luminance modulation — the same scan and
// unevenness the light has — which is what stops it reading as a decal laid
// over a glow rather than something inside it.
//
// ONE EASED VALUE DRIVES EVERYTHING, the field and the cone alike. Each frame
// produces a single number and `holoDeployment.ts` remaps it into the stages
// both consume. They are not tweens that happen to share a duration — that
// arrangement drifts, and it drifts visibly: a field aspect a frame behind the
// deployment draws the lockup past the light meant to be carrying it.
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

  // The eased scalar's stages: (activation, deploy, resolve, field aspect).
  // See holoDeployment.ts — the shader never remaps ranges of its own, and it
  // does not recompute the aspect from deploy either: one derived value,
  // produced once, so the field and the cone cannot disagree about how far open
  // the projection is.
  //
  // uDeploy.y is written here for the CONE ALONE since the rails went
  // (2026-09-07): it reaches the cone through setDeployment, and this shader
  // reads only the aspect that same value produced.
  uniform vec4 uDeploy;

  uniform vec3 uHoloColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uBreath;

  // Quad → pane space. The quad's size in pane heights, and the core's centre
  // in quad uv. Constant per panel; both come from the config.
  uniform vec2 uQuadScale;
  uniform vec2 uOrigin;
  // (halo radius, halo strength, invitation gain).
  uniform vec3 uField;
  // 0..1: how much of the invitation — the brighter breath — this panel is
  // carrying right now. Eased from the CPU, never set directly.
  uniform float uInvite;
  // Hover strength (0..1, eased by the satellite) and its gain on the halo and
  // emitter — the same strength that drives the scale bump.
  uniform float uHover;
  uniform float uHoverGain;
  varying vec2 vUv;

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

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
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

  // The sample order is: contain-fit → BOUNDARY → atlas-cell mapping.
  //
  // The boundary has to be applied on the contained uv, before the cell fold.
  // Afterwards the coordinate is inside its cell by construction, so any test
  // would always pass, and the letterbox either side of a contained artwork
  // would instead sample the cell's edge texel — ClampToEdge smearing the
  // neighbouring plate's border across the gap.
  //
  // FEATHERED, NOT CUT. This used to reject outright, and a hard reject draws a
  // RECTANGLE: the artwork's own edge, straight, with visible corners. It shows
  // up worst in the overview, where the panel is small enough that mipmapping
  // spreads the cell's content out to fill it, so what gets cut is not empty
  // space but a faint haze — a box with corners around every mark. The window
  // below fades over about a screen pixel instead, and the clamp keeps the
  // sample inside its own cell so nothing bleeds in from the neighbouring
  // brand. Alpha carries the window; rgb is left exactly as delivered.
  vec4 sampleArt(sampler2D atlas, vec2 offset, vec2 scale, vec2 uv, float Q, float A) {
    vec2 art = containUv(uv, Q, A);
    // Outside any branch: derivatives are undefined in non-uniform flow.
    vec2 fw = fwidth(art);
    vec2 edge = min(art, 1.0 - art);
    float window = smoothstep(0.0, fw.x * 1.5, edge.x) * smoothstep(0.0, fw.y * 1.5, edge.y);
    if (window <= 0.0) return vec4(0.0);
    vec4 texel = texture2D(atlas, offset + clamp(art, 0.0, 1.0) * scale);
    return vec4(texel.rgb, texel.a * window);
  }


  // A PROJECTION, NOT A PANE. Nothing here has an edge: there is no mask that
  // gives the field an outline, no rectangle, no bracket, no border. What
  // bounds it is falloff — the halo fades to nothing, and the artwork is
  // feathered at its own boundary rather than cut there.
  //
  // THERE IS DELIBERATELY NOTHING DARK BEHIND THE MARK. A dilated shadow hugging
  // the artwork was tried here, to hold it against the daylight Earth. It read
  // worse, and it brought a rectangle back: the dilation grows outward, the
  // contain-fit boundary cut it off square, and the result was a dark box with
  // corners around every logo. Legibility over the lit hemisphere is still an
  // open problem — solve it in the LIGHT, not with a backing.
  //
  // The brand colour stays on the LIGHT — the halo and the emitter — and never
  // on the artwork, so a real full-colour trademark shows its own colours with
  // no cast. What the mark does take from the field is its MODULATION: the same
  // scan and unevenness the light has, in luminance only. That is what stops it
  // reading as a decal laid over a glow.
  void main() {
    float activation = uDeploy.x;
    float resolve = uDeploy.z;

    float haloRadius = uField.x;
    float haloStrength = uField.y;

    // Pane-height units, origin at the field's centre. A distance measured here
    // is the same on both axes and at every point of the deployment, because
    // the quad never changes shape.
    vec2 p = (vUv - uOrigin) * uQuadScale;
    vec2 px = fwidth(p);

    // The invitation arrives already breathing: uInvite is the pulse from
    // invitation.ts, computed once per frame in update() and shared with the
    // cone and the satellite's scale, so all three swell together.
    float invite = uInvite;

    // The selected-state energy: a surge as the field activates, easing back
    // once the logo has resolved. Peak, then settle. The invitation lifts it
    // too — at overview scale the halo alone is a few pixels of brand light
    // behind the mark and does not read from across the room; the emitter line
    // and its wash are what actually say "lit".
    // Hover lifts it the same way, on the same eased strength that drives the
    // satellite's scale bump — one response, shared by the pointer and the
    // tutorial that demonstrates it.
    float hover = uHover * uHoverGain;
    float energy = (1.0 + 0.35 * activation - 0.15 * resolve)
                 * (1.0 + 0.5 * uField.z * invite)
                 * (1.0 + 0.5 * hover);

    // The artwork field opens from 1:1 to 2:1 with the deployment. Both
    // artworks are fitted against the CURRENT aspect, so neither distorts at
    // any point of it, and the crossfade is the only thing that changes.
    // Clamped: the field is square at rest and never narrower, so anything
    // below 1 is a uniform that was never written. It divides into fuv below,
    // and a zero there does not degrade the artwork — it deletes it.
    float fieldAspect = max(uDeploy.w, 1.0);
    vec2 fuv = p / vec2(fieldAspect, 1.0) + 0.5;
    vec4 isotype = sampleArt(uIsotype, uIsoOffset, uIsoScale, fuv, fieldAspect, uIsoAspect);
    vec4 logo = sampleArt(uLogo, uLogoOffset, uLogoScale, fuv, fieldAspect, uLogoAspect);
    vec4 plate = mix(isotype, logo, resolve);

    // ── The field's unevenness ──
    // Slow drifting noise plus a soft horizontal scan. Low amplitude on
    // purpose: this is what keeps the volume from reading as flat glass, and
    // the moment it is strong enough to notice on its own it is a filter over
    // somebody's logo.
    float drift = vnoise(vec2(p.x * 3.1, p.y * 4.3 - uTime * 0.11));
    float scan = 0.5 + 0.5 * sin(p.y * 26.0 - uTime * 0.8);
    float modulation = mix(0.88, 1.06, drift * 0.65 + scan * 0.35);

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    // ── Layer 1: the rear halo ──
    // The projection's own light, very soft, wider than the mark and fading to
    // nothing in every direction. This is the only thing that says where the field is, and
    // it says it without drawing a boundary.
    //
    // COMPACT SUPPORT, NOT AN EXPONENTIAL. exp() never actually reaches zero,
    // so a halo built from one is still faintly alight at the quad's edge and
    // the quad clips it — which drew a crisp brand-coloured RECTANGLE around
    // every panel. That is the card again, in the brand's own colour, arrived
    // at from the opposite direction. This falloff is exactly zero beyond
    // haloRadius, so there is nothing left at the boundary to cut.
    vec2 h = p / vec2(fieldAspect, 1.0);
    float reach = clamp(1.0 - length(h) / haloRadius, 0.0, 1.0);
    float halo = pow(reach, 2.2) * haloStrength * modulation
               * (1.0 + 0.6 * activation)
               * (1.0 + uField.z * invite)
               * (1.0 + hover);
    over(color, alpha, uHoloColor, halo);

    // ── Layer 3: the artwork ──
    // True colour, untinted. It takes the field's luminance modulation so that
    // it belongs to the projection, and nothing else.
    over(color, alpha, plate.rgb * modulation, plate.a);

    // ── Layer 5: the emitter ──
    // Where the cone arrives. A holo-colour line along the field's base, at
    // the core's width, fading out at both ends rather than stopping — a line
    // that stops is an edge, and an edge is the whole problem. Above it a short
    // wash climbs into the field, so the light visibly enters rather than
    // sitting under it. The cone mesh carries everything below this point.
    float breath = 1.0 - uBreath + uBreath * (0.92 + 0.08 * sin(uTime * 1.4));

    // A GAUSSIAN, not a super-Gaussian. At exponent 3 this was effectively a box
    // window — flat across the middle with steep shoulders — which put two
    // straight vertical cuts at the ends of the emitter and its wash.
    float ends = exp(-pow(abs(p.x) / 0.46, 2.0));

    // Signed distance from the emitter line, split so the falloff can differ by
    // direction. It must be SIGNED: max(0.0, p.y + 0.5) clamps to zero below
    // the line, and exp(-0) is 1, so the wash was at FULL strength across
    // everything beneath it — a solid slab running down to the quad's edge,
    // where the quad cut it into a rectangle with corners. It read as a plate
    // under every mark, which is the exact thing this design exists to remove.
    float above = max(0.0, p.y + 0.5);
    float below = max(0.0, -(p.y + 0.5));
    float emit = line(p.y + 0.5, px.y) * ends * 0.85 * energy * breath;
    // Climbs into the field, and drops away quickly downward — below the line
    // is the cone's territory, and two glows overlapping there just make a
    // brighter smudge.
    float wash = exp(-above / 0.20) * exp(-below / 0.05) * ends * 0.16 * energy * breath;
    over(color, alpha, uHoloColor, max(emit, wash));

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
  /**
   * The colour of the LIGHT: the halo, the emitter line and the cone below.
   *
   * Not the brand's — see ORBIT_CONFIG.panel.holoColor, which is where the
   * value is chosen and where the reasoning for splitting the two lives. The
   * artwork this field carries is still the brand's own, sampled untinted from
   * the atlases above, and nothing here recolours it.
   */
  holoColor: string
}

export function createHoloPanel({ isotypeAtlas, logoAtlas, index, holoColor }: Options) {
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
    // SEEDED FROM THE SAME FUNCTION THAT WRITES IT, never from literals.
    //
    // `applyExpansion` only runs when the eased value CHANGES, so a panel that
    // is never touched keeps whatever it was constructed with — which is the
    // resting state of every satellite in the overview, and the pinned state
    // under `?holoExpand=`. Hardcoding zeros here was correct while .w carried
    // the wings' extent, whose rest value really is 0. It became a division by
    // zero the moment .w started carrying the field's ASPECT, and every resting
    // panel lost its isotype: the mark vanished, the emitter line stayed, and
    // it read as a tuning problem rather than as the regression it was.
    uDeploy: { value: (() => {
      const rest = deploymentFrom(0)
      return new THREE.Vector4(rest.activation, rest.deploy, rest.resolve, rest.fieldAspect)
    })() },

    uHoloColor: { value: new THREE.Color(holoColor) },
    uOpacity: { value: 0 },
    uTime: { value: Math.random() * 100 },
    uBreath: { value: reducedMotion ? 0 : 1 },

    uQuadScale: { value: new THREE.Vector2(footprint.width, footprint.height) },
    uOrigin: { value: new THREE.Vector2(0.5, footprint.originY) },
    uField: { value: new THREE.Vector3(cfg.haloRadius, cfg.haloStrength, cfg.inviteGain) },
    uInvite: { value: 0 },
    // Hover strength, 0..1, eased by the satellite (`setHighlight`); the gain
    // is a uniform so it can be judged live rather than by recompiling.
    uHover: { value: 0 },
    uHoverGain: { value: cfg.hoverGain },
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

  // The volume this field hangs inside. Owned here rather than by the satellite
  // because the two are one object to everything outside: they share the eased
  // expansion, they fade together, and a cone that outlived its field — or vice
  // versa — would be a projection of nothing.
  const cone = createEmitterCone({ holoColor, animate: !reducedMotion })

  const group = new THREE.Group()
  group.add(cone.mesh)
  group.add(mesh)

  function setOpacity(factor: number) {
    uniforms.uOpacity.value = factor * cfg.maxOpacity
    cone.setOpacity(factor)
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
    const d = deploymentFrom(eased)
    uniforms.uDeploy.value.set(d.activation, d.deploy, d.resolve, d.fieldAspect)
    // The cone reads the SAME stages, from this one call. It is not a second
    // animation kept in sympathy with the first: a mouth opening a frame behind
    // the field would show light arriving at a structure that is already there.
    cone.setDeployment(d.activation, d.deploy)
  }

  /** Asks the panel to deploy or fold. Animated; takes effect over `expandDuration`. */
  function setExpanded(on: boolean) {
    expansionTarget = on ? 1 : 0
  }

  // The invitation, eased the same way as the expansion and for the same
  // reason: hover takes it away mid-breath and gives it back a moment later,
  // and a value-based ease reverses from wherever it is instead of restarting.
  let invite = 0
  let inviteTarget = 0
  // The breath applied to it this frame — what the shaders and the satellite's
  // scale actually receive. See invitation.ts for why it is computed here.
  let pulse = 0

  /** Asks the halo to carry the invitation — the brighter breath — or to let it go. */
  function setInvited(on: boolean) {
    inviteTarget = on ? 1 : 0
  }

  // The hover light. Already eased by the time it arrives — the satellite
  // owns the ease so its scale and this light rise on one curve — so it is
  // written straight through, and the cone takes its share through the
  // invitation channel it already has: whichever of the two is asking louder.
  let hover = 0
  let coneDrive = -1
  function applyConeDrive() {
    const drive = Math.max(pulse, cfg.coneHoverGain * hover)
    if (drive === coneDrive) return
    coneDrive = drive
    cone.setInvite(drive)
  }

  /** The hover strength this frame, 0..1. See createSatellite.setHighlight. */
  function setHighlight(strength: number) {
    const next = Number.isFinite(strength) ? (strength < 0 ? 0 : strength > 1 ? 1 : strength) : 0
    if (next === hover) return
    hover = next
    uniforms.uHover.value = next
    applyConeDrive()
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
    if (!PROTO_HOLO.freeze) {
      uniforms.uTime.value += delta
      cone.update(delta)
    }
    if (invite !== inviteTarget) {
      invite = advanceExpansion(invite, inviteTarget, delta, cfg.inviteDuration)
    }
    // Written every frame the invitation is alive, not only while it eases:
    // the breath is a function of the clock, so a value written once would
    // hold the light at whatever phase it was in when the fade finished.
    if (invite > 0 || pulse > 0) {
      pulse = invitationPulse(invite, uniforms.uTime.value, !reducedMotion)
      uniforms.uInvite.value = pulse
      applyConeDrive()
    }
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
    cone.dispose()
  }

  /** The invitation's breath this frame, in [0, 1]. Read by the satellite for its scale. */
  function invitePulse() {
    return pulse
  }

  return {
    group,
    setOpacity,
    setExpanded,
    setInvited,
    setHighlight,
    invitePulse,
    resetExpansion,
    update,
    dispose,
  }
}

export type HoloPanel = ReturnType<typeof createHoloPanel>
