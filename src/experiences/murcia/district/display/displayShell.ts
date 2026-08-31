import * as THREE from 'three';
import fragmentShader from '../shaders/shell/fragment.glsl';
import vertexShader from '../shaders/shell/vertex.glsl';

/**
 * The display's body — the thin plate the front face sits on.
 *
 * ## Why this is a second mesh and not one extruded panel
 *
 * The obvious move is to extrude the panel itself. It fails on four counts, and
 * the first is the one that matters:
 *
 *   RAYCAST. `ExtrudeGeometry` packs the front cap, the rim walls and the back
 *   cap into one non-indexed buffer, and `intersectObject` returns them
 *   nearest-first. At the district's oblique angle the bottom rim wall faces the
 *   camera, so a click near the panel's lower edge can land on a wall whose `uv`
 *   is (position along the contour, depth) — meaningless. Recovering the front
 *   face would mean filtering by face index or normal, which is a SECOND
 *   statement of "which surface is the front" that can disagree with the first.
 *
 *   MATERIAL STATE. The face wants `DoubleSide` + `depthWrite: false`; the body
 *   wants `FrontSide` + `depthWrite: true`. One mesh means a material array and
 *   geometry groups, and then the interaction's core-inset read has to reach
 *   into `material[0]` and hope.
 *
 *   COST. The panel's own geometry is a four-vertex plane. One mesh would
 *   re-triangulate a rounded extrusion every time anything about it moved.
 *
 *   UVs, which are unusable on the walls. That is the fourth reason, not the
 *   first.
 *
 * The split then costs nothing, because this mesh is added as a CHILD of the
 * panel: position, yaw and the 45-degree tilt all follow for free, and the
 * interaction's `intersectObject(panel, false)` is non-recursive, so a child is
 * provably never hit.
 *
 * ## Dimension-ignorant on purpose
 *
 * It takes finished world dimensions and knows nothing about the core inset that
 * produced them. `servicesDisplay` keeps the single derivation, so the "one
 * owner for these coordinates" rule `displayConfig` states is not quietly broken
 * across a new module boundary.
 */

export interface DisplayShellDimensions {
  width: number;
  height: number;
  thickness: number;
  /** Corner radius of the plate itself, world units. */
  radius: number;
}

export interface DisplayShell {
  readonly object: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  setActivation(value: number): void;
  dispose(): void;
}

export function createDisplayShell(dimensions: DisplayShellDimensions): DisplayShell {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // Transparent ONLY so `uActivation` can fade the plate in with the panel. At
    // rest its alpha is 1 and it behaves exactly like an opaque object. Do not
    // "simplify" this to `false` — it would move to the opaque queue, where it
    // could not fade at all.
    transparent: true,
    // Scene-level, and free while Murcia's fog is null. Same opt-in as rio.
    fog: true,
    // The mechanism of the whole design. This is what backs the copy with a
    // solid surface and what stops the projector beams drawing through the
    // plate.
    depthWrite: true,
    depthTest: true,
    // The back cap is never seen: the follow yaw is clamped to ±42 degrees, so
    // the visitor cannot get behind the display. Culling it halves the fill.
    side: THREE.FrontSide,
    uniforms: {
      uActivation: { value: 0 },
      uThickness: { value: dimensions.thickness },
      uHalfSize: { value: new THREE.Vector2(dimensions.width / 2, dimensions.height / 2) },
      uCornerRadius: { value: dimensions.radius },
      uBevelWidth: { value: 0.9 },
      uBevelLift: { value: 0.18 },
      uRimBase: { value: 0.14 },
      uRimPeak: { value: 0.3 },
      uRimGrazing: { value: 0.22 },
      uRimDepthFade: { value: 0.35 },
      // One notch lighter than the panel's core, so the ring of plate outside
      // the readable area reads as a frame around the copy rather than as more
      // of it.
      uBodyColor: { value: new THREE.Color().setHex(0x0b1524, THREE.SRGBColorSpace) },
      // Between the panel's halo and the beams' cyan — the same family as both,
      // identical to neither.
      uRimColor: { value: new THREE.Color().setHex(0x2f7fa0, THREE.SRGBColorSpace) },
    },
  });

  const object = new THREE.Mesh(buildGeometry(dimensions), material);
  // Belt and braces. The real guarantee is the `false` in the interaction's
  // `intersectObject(panel, false)`, which never descends into children.
  object.raycast = () => {};
  // Before the beams (2) and the panel (3) in the transparent queue. The plate
  // has to be down before anything is composited onto it.
  object.renderOrder = 0;

  // `ExtrudeGeometry` spans z 0..depth, so the whole plate is pushed behind the
  // panel plane. `FRONT_GAP` must stay greater than zero: two coplanar meshes
  // with different triangulations disagree at the last bit of interpolation and
  // speckle against each other even under `LessEqualDepth`. At the district
  // camera the gap is under a pixel.
  object.position.z = -(dimensions.thickness + FRONT_GAP);

  return {
    object,
    material,

    setActivation(value) {
      material.uniforms['uActivation'].value = value;
    },

    dispose() {
      // Geometry AND material — this module built both, unlike `districtFlow`,
      // which draws on authored meshes and therefore owns only its materials.
      object.geometry.dispose();
      material.dispose();
    },
  };
}

/** How far behind the panel plane the plate's front cap sits, in world units. */
const FRONT_GAP = 0.06;

/**
 * The plate, at fixed dimensions.
 *
 * If a resize is ever wanted, it must REBUILD this rather than scale the mesh,
 * and the reason is not performance. A non-uniform x/y scale turns the corner
 * arcs into ellipses, which then no longer register with the front face's
 * aspect-corrected circular SDF — a misregistered corner is the exact defect
 * that reads as "broken". It would also invalidate the `mat3(modelMatrix)` the
 * vertex shader uses as a normal transform.
 */
function buildGeometry(dimensions: DisplayShellDimensions): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(
    roundedRect(dimensions.width, dimensions.height, dimensions.radius),
    {
      depth: dimensions.thickness,
      // MUST be explicit. It defaults to TRUE, and a bevel grows the silhouette
      // past the size the front face's SDF is registered against — which puts a
      // sliver of lit plate outside the face at every corner.
      bevelEnabled: false,
      // The default of 12 is twelve segments per FULL circle, so three per
      // corner, which is visibly faceted at this radius.
      curveSegments: 12,
      steps: 1,
    },
  );
}

/** A rounded rectangle centred on its own origin. */
function roundedRect(width: number, height: number, radius: number): THREE.Shape {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const r = Math.max(0, Math.min(radius, Math.min(halfWidth, halfHeight)));

  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + r, -halfHeight);
  shape.lineTo(halfWidth - r, -halfHeight);
  shape.absarc(halfWidth - r, -halfHeight + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(halfWidth, halfHeight - r);
  shape.absarc(halfWidth - r, halfHeight - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-halfWidth + r, halfHeight);
  shape.absarc(-halfWidth + r, halfHeight - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfWidth, -halfHeight + r);
  shape.absarc(-halfWidth + r, -halfHeight + r, r, Math.PI, Math.PI * 1.5, false);

  return shape;
}
