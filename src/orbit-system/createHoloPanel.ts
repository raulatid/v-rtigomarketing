import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'

// The holographic brand panel floating above a satellite.
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
// purpose. See DECISIONS.md.

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
  uniform sampler2D uAtlas;
  uniform vec2 uCellOffset;
  uniform vec2 uCellScale;
  uniform vec3 uBrandColor;
  uniform vec3 uFrameColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAspect;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    // ── The brand plate ──
    vec4 plate = texture2D(uAtlas, uCellOffset + vUv * uCellScale);

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
  atlas: BrandAtlas
  /** Which atlas cell this panel shows. */
  index: number
  brandColor: string
}

export function createHoloPanel({ atlas, index, brandColor }: Options) {
  const cfg = ORBIT_CONFIG.panel
  const cell = atlas.cellUv(index)

  const uniforms = {
    uAtlas: { value: atlas.texture },
    uCellOffset: { value: cell.offset },
    uCellScale: { value: cell.scale },
    uBrandColor: { value: new THREE.Color(brandColor) },
    uFrameColor: { value: new THREE.Color(cfg.frameColor) },
    uOpacity: { value: 0 },
    uTime: { value: Math.random() * 100 },
    uAspect: { value: cfg.width / cfg.height },
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
  mesh.scale.set(cfg.width, cfg.height, 1)
  mesh.position.y = cfg.offsetY
  // The panel is decoration and must never intercept the satellite's hover
  // sphere, which is smaller and sits below it.
  mesh.raycast = () => {}
  // Transparent, unsorted, always drawn after the opaque scene.
  mesh.renderOrder = 2

  function setOpacity(factor: number) {
    uniforms.uOpacity.value = factor * cfg.maxOpacity
  }

  function update(delta: number) {
    uniforms.uTime.value += delta
  }

  function dispose() {
    // Geometry is shared and the atlas is owned by createOrbitSystem — only the
    // per-panel material belongs to this instance.
    material.dispose()
  }

  return { mesh, setOpacity, update, dispose }
}

export type HoloPanel = ReturnType<typeof createHoloPanel>
