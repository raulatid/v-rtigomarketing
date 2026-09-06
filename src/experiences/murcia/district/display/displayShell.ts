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

/**
 * The plate's palette.
 *
 * Neutral since the 2026-09-06 port from the lab, and `rim` is the whole of that
 * change. It used to be `0x2f7fa0` — "between the panel's halo and the beams'
 * cyan" — which was right for an object that was supposed to look projected. A
 * machined edge on a real plate catches ROOM light, and room light is not teal.
 * Nothing else in this shader had to move to turn the object from hologram into
 * hardware.
 */
export const SHELL_COLORS = {
  /** The housing. Still one notch lighter than the screen, so it frames the copy. */
  body: 0x15171b,
  /** The machined edge, and the bevel band it also tints. Neutral silver-grey. */
  rim: 0x8e959d,
} as const;

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
      // Three scalars came DOWN together, and for one reason: they were tuned to
      // make a projected object read as lit from within. A satin housing is lit
      // from without, and its whole character is that it does not compete with
      // the screen it surrounds.
      uBevelLift: { value: 0.1 },
      uRimBase: { value: 0.1 },
      uRimPeak: { value: 0.16 },
      // The ONLY one going up, and the exception is the point. Grazing response
      // on real extruded geometry is the genuine optical cue here — it is what a
      // machined edge does, it is stable at every camera angle by construction,
      // and the face deliberately has no view-dependent term at all, so this
      // carries all of it.
      uRimGrazing: { value: 0.28 },
      uRimDepthFade: { value: 0.35 },
      uBodyColor: { value: new THREE.Color().setHex(SHELL_COLORS.body, THREE.SRGBColorSpace) },
      uRimColor: { value: new THREE.Color().setHex(SHELL_COLORS.rim, THREE.SRGBColorSpace) },
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

      // DEPTH FOLLOWS VISIBILITY, and this is a bug fix rather than tidying.
      //
      // `depthWrite` is what makes this plate back the copy and occlude the
      // beams, and it was left permanently true. Alpha does not gate depth
      // writes: at `uActivation = 0` the plate is completely invisible and STILL
      // fills the depth buffer with a 42-unit square hanging over the plaza, so
      // everything behind it was being discarded — the projector beams for as
      // long as they have existed. The symptom is the worst kind: no error, no
      // warning, and geometry that is provably drawing with correct positions
      // and correct alpha while rendering nothing at all.
      //
      // While the plate is FADING it does write depth, which is correct: it is
      // genuinely there, backing the copy. Only invisible must mean intangible.
      material.depthWrite = value > 0;
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
 * Where the plate's FRONT CAP sits in panel space. Independent of thickness.
 *
 * The mesh is pushed to `-(thickness + FRONT_GAP)` and `ExtrudeGeometry` spans
 * z 0..depth from there, so the cap the visitor actually sees lands at
 * `-FRONT_GAP` and the far side at `-(thickness + FRONT_GAP)`. Exported because
 * `displayReveal` has to place motes in front of that cap, and deriving it from
 * the mesh position — the obvious reading — yields the BACK of the plate and
 * buries them inside it, where the front cap depth-tests them away.
 */
export const SHELL_FRONT_Z = -FRONT_GAP;

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

/**
 * Evenly spaced points around the plate's silhouette, in the plate's own x/y.
 *
 * Exported from HERE rather than reimplemented by whoever needs it.
 * `displayReveal` scatters motes onto this outline, and if it built its own
 * rounded rectangle the two would agree only until one of them was retuned —
 * then the motes would settle a fraction off the edge they are supposed to be
 * drawing, which is exactly the "misregistered corner" failure this module
 * already refuses to allow between the plate and the face. Reading the SAME
 * `roundedRect` the extrusion is built from makes that impossible.
 *
 * `getSpacedPoints` samples by arc length rather than by control point, so the
 * spacing stays even around the corners instead of bunching in them.
 */
export function shellPerimeterPoints(
  dimensions: DisplayShellDimensions,
  count: number,
): THREE.Vector2[] {
  const shape = roundedRect(dimensions.width, dimensions.height, dimensions.radius);
  return shape.getSpacedPoints(Math.max(3, Math.floor(count)));
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
