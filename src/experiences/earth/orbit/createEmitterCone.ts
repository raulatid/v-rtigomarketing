import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'

// The volume the brand hologram is projected into.
//
// A satellite emits a cone of light; the artwork hangs inside it. This mesh is
// the cone. It exists so the viewer can infer SATELLITE → EMITTER → HOLOGRAM
// without being told, which the old in-quad beam never managed: that beam was
// painted inside the billboarded panel, so it pointed screen-down instead of at
// the satellite the moment the camera rolled, and the "projection" read as a
// rectangle that happened to have a stripe under it.
//
// REAL GEOMETRY, NOT A PAINTING. The cone is an actual mesh parented to the
// satellite's content group, so it inherits that transform: it points at its
// satellite from every camera angle, foreshortens correctly as the camera
// orbits, and is occluded by the Earth when it passes behind. None of those
// three come free to a billboard, and all three are what make it read as
// something in the scene rather than something on the screen.
//
// THE GOVERNING CONSTRAINT: it must never reveal itself as a readable
// cone-shaped shell. What we want is a presence — light gathered in a volume —
// not an object with a boundary. That constraint is at war with the standard
// technique, which is why most of this file is about holding the technique back
// rather than applying it. See the fragment shader.

const VERTEX = /* glsl */ `
  uniform float uDeploy;
  uniform float uSpread;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vUv = uv;

    // Deployment opens the MOUTH and leaves the FOOT alone. Scaling the whole
    // mesh would drag the foot off the satellite — the one attachment the cone
    // exists to make — so the displacement ramps with height: zero at the
    // bottom ring, full at the top. uv.y is 0 at the foot and 1 at the mouth.
    float ramp = uv.y;
    vec3 pos = position;
    pos.xz *= 1.0 + uSpread * uDeploy * ramp;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    // Normal without the scale: the frustum's own taper already makes this a
    // non-uniform transform, and a normal stretched by it would bias the rim
    // term below toward one axis and draw a brighter seam down two sides.
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uActivation;
  // The invitation's breath (see invitation.ts) and how much of it the cone
  // takes. The field's halo carries the same pulse; a cone that stayed at rest
  // under a swelling field would look like the light was arriving from nowhere.
  uniform float uInvite;
  uniform float uInviteGain;
  // footRadius / mouthRadius. See the taper compensation below.
  uniform float uRadiusRatio;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  // Value noise on a WRAPPED coordinate. The cone's uv.x runs 0..1 around the
  // circumference, and sampling noise on it directly puts a discontinuity at
  // the seam — a hard vertical line down one side of the cone, which is exactly
  // the kind of readable feature this whole file exists to avoid. Mapping the
  // angle onto a circle first makes the sample continuous all the way round.
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

  void main() {
    float y = vUv.y;                       // 0 at the foot, 1 at the mouth
    float a = vUv.x * 6.2831853;
    vec2 ring = vec2(cos(a), sin(a));      // wraps seamlessly

    // ── Optical depth ──
    // The one term that decides whether this reads as a volume or as an object,
    // and it is the OPPOSITE of the usual glow trick.
    //
    // A fresnel rim — brightest where the surface is edge-on — is how you shade
    // a hollow SHELL, and it is wrong here for the reason it looks right: it
    // puts the most light exactly along the silhouette, drawing two clean
    // converging sides and an ellipse at the mouth. That was the first attempt
    // and the cone read as a solid wedge hanging off the satellite.
    //
    // A VOLUME behaves the other way round. Looking through a column of haze,
    // the line of sight is longest through the middle and grazes to nothing at
    // the edges, so it is brightest at the centre and feathers out to
    // transparent — no boundary anywhere. That is abs(dot(N, V)), not its
    // complement, and the silhouette dissolves instead of being outlined.
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    // A HIGH exponent, chosen at overview scale rather than at the close-up.
    // The falloff has to do its feathering within the cone's screen width, and
    // in the overview that is about sixty pixels: at a gentle exponent the
    // transition lands in one or two of them and the cone reads as a solid
    // megaphone, however soft it looked magnified. Pushing the exponent up
    // keeps only the centre bright and gives the edge somewhere to fade.
    float depth = pow(clamp(facing, 0.0, 1.0), 2.6);

    // ── Break it up ──
    // Three octaves drifting at different rates, climbing the cone and sliding
    // around it, so no edge line stays continuous long enough to trace. The
    // range reaches most of the way to zero: at the intensities below, a narrow
    // range leaves a smooth surface, and a smooth surface is a skin.
    float n1 = vnoise(vec2(ring.x * 2.3 + y * 2.6, ring.y * 2.3 - uTime * 0.09));
    float n2 = vnoise(vec2(ring.x * 5.7 - y * 1.4, ring.y * 5.7 + uTime * 0.05));
    float n3 = vnoise(vec2(ring.x * 11.0 + y * 4.1, ring.y * 11.0 - uTime * 0.13));
    float grain = mix(0.10, 1.0, n1 * 0.5 + n2 * 0.32 + n3 * 0.18);

    // ── Axial shape ──
    // Faded at both ends so neither terminates on a rim: no ring at the mouth,
    // no disc at the foot.
    //
    // The foot's fade is deliberately SHORT. The taper compensation below
    // already removes the bright tip, and fading the foot as well darkened the
    // light exactly where the cone has to meet its satellite — the one
    // attachment it exists to make — leaving the panel floating above a gap
    // again. Two mechanisms were solving the same problem and between them they
    // solved it twice.
    float foot = smoothstep(0.0, 0.07, y);
    float mouth = 1.0 - smoothstep(0.66, 1.0, y);
    float axial = foot * mouth;

    // ── Taper compensation ──
    // Toward the foot the frustum's two shells converge onto nearly the same
    // pixels, and additive blending turns that into a bright solid tip — the
    // cone reading as a plumb-bob hanging off the satellite. Scaling by the
    // local radius spreads the same light over the circumference that actually
    // exists there, which removes the hotspot without flattening the taper.
    float radius = mix(uRadiusRatio, 1.0, y);

    float density = axial * radius * grain * depth;

    // A small surge as the projection activates, settling back afterwards.
    density *= uIntensity * (1.0 + 0.5 * uActivation) * (1.0 + uInviteGain * uInvite);

    // Density goes in ONCE, through alpha. AdditiveBlending is (SrcAlpha, One),
    // so the pipeline already multiplies rgb by alpha on its way to the frame
    // buffer — premultiplying here as well squared the density and the whole
    // cone all but vanished, which then read as "the effect is too weak" and
    // invited turning the intensity up to compensate for a bug.
    gl_FragColor = vec4(uColor, density * uOpacity);

    #include <colorspace_fragment>
  }
`

// One frustum shared by every cone, like the panel quad. Unit height and unit
// top radius; each cone's real dimensions live in mesh.scale, so the shared
// geometry never has to know a satellite's numbers.
//
// Module-level because the sharing is the point, which leaves it without a
// natural owner among the cones — so the owner is declared instead, exactly as
// `createHoloPanel.disposeSharedGeometry` is: createOrbitSystem releases it.
let sharedGeometry: THREE.CylinderGeometry | null = null

function getGeometry(cfg = ORBIT_CONFIG.panel) {
  if (!sharedGeometry) {
    // openEnded — caps would give the volume two flat lids, and a lid catches
    // the light as a disc the moment the camera is not level with it.
    sharedGeometry = new THREE.CylinderGeometry(
      1,
      cfg.coneFootRadius / cfg.coneMouthRadius,
      1,
      32,
      1,
      true,
    )
  }
  return sharedGeometry
}

/**
 * Releases the shared frustum. Called by `createOrbitSystem.dispose()` — never
 * by an individual cone, which would pull the geometry out from under its
 * siblings.
 *
 * Safe to call more than once and safe to call before a later orbit system is
 * built: `getGeometry()` is lazy, so the next cone rebuilds it.
 */
export function disposeSharedConeGeometry(): void {
  sharedGeometry?.dispose()
  sharedGeometry = null
}

interface Options {
  /** The light's colour, shared with the field above. See ORBIT_CONFIG.panel.holoColor. */
  holoColor: string
  /**
   * False under reduced motion: the volume holds a still frame.
   *
   * The drift is ambient, decorative and never conveys state, which is exactly
   * the category the panel already silences by stopping its emitter breathing.
   * Six of them turning over slowly in the corner of the eye is more motion
   * than that one breath, not less.
   */
  animate: boolean
}

export function createEmitterCone({ holoColor, animate }: Options) {
  const cfg = ORBIT_CONFIG.panel

  const uniforms = {
    uColor: { value: new THREE.Color(holoColor) },
    uOpacity: { value: 0 },
    uIntensity: { value: cfg.coneIntensity },
    // Offset per cone so six of them do not drift in lockstep, which reads as
    // one animation driving six objects. Same trick as the panel's uTime.
    uTime: { value: Math.random() * 100 },
    uActivation: { value: 0 },
    uInvite: { value: 0 },
    uInviteGain: { value: cfg.coneInviteGain },
    uDeploy: { value: 0 },
    uSpread: { value: cfg.coneSpread },
    uRadiusRatio: { value: cfg.coneFootRadius / cfg.coneMouthRadius },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    // Light ADDS to what is behind it. This is the whole reason the cone reads
    // as luminous rather than as a pane of tinted plastic.
    blending: THREE.AdditiveBlending,
    // Both shells contribute, which is what lets an open surface accumulate
    // like a volume — and it keeps the cone from vanishing when the satellite
    // carries it round to the far side.
    side: THREE.DoubleSide,
    // Occluded BY the Earth (depthTest stays on) but never occluding the
    // satellite or the field.
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(getGeometry(cfg), material)

  // Spans the gap between the satellite and the field's lower edge. The foot
  // stops clear of the model body rather than at the satellite's origin: a cone
  // that starts inside the mesh emerges from its middle, which reads as an
  // intersection rather than an emission.
  const height = cfg.coneMouthY - cfg.coneFootY
  mesh.scale.set(cfg.coneMouthRadius, height, cfg.coneMouthRadius)
  // CylinderGeometry is centred on its own origin, so the midpoint of the span.
  mesh.position.y = cfg.coneFootY + height / 2
  mesh.raycast = () => {}
  // Below the field quad (renderOrder 2): the artwork is in front of its light.
  mesh.renderOrder = 1

  function setOpacity(factor: number) {
    uniforms.uOpacity.value = factor
  }

  /** Written every frame from the panel's single eased value. */
  function setDeployment(activation: number, deploy: number) {
    uniforms.uActivation.value = activation
    uniforms.uDeploy.value = deploy
  }

  /**
   * Written every frame by the panel from the one shared pulse. Lands under
   * reduced motion too: the pulse is already steady there, and the cone must
   * still show the invitation, just without breathing.
   */
  function setInvite(pulse: number) {
    uniforms.uInvite.value = pulse
  }

  function update(delta: number) {
    if (!animate) return
    uniforms.uTime.value += delta
  }

  function dispose() {
    // Geometry is shared; only the material belongs to this cone.
    material.dispose()
  }

  return { mesh, setOpacity, setDeployment, setInvite, update, dispose }
}

export type EmitterCone = ReturnType<typeof createEmitterCone>
