import * as THREE from 'three';
import fragmentShader from './shaders/shell/fragment.glsl';
import vertexShader from './shaders/shell/vertex.glsl';

/**
 * The display's body — the thin plate the front face sits on.
 *
 * A sibling of `district/display/displayShell.ts`, and a deliberate copy of it
 * rather than a shared module — `blogDisplay`'s header carries the argument for
 * why the two displays are not merged. Two exports did not come across:
 * `SHELL_FRONT_Z` and `shellPerimeterPoints()`, whose only consumer is the
 * particle materialisation this display does not have. `side` differs; see the
 * material below for why.
 *
 * ## Why this is a second mesh and not one extruded panel
 *
 * The obvious move is to extrude the panel itself. It fails on four counts, and
 * the first is the one that matters:
 *
 *   RAYCAST. `ExtrudeGeometry` packs the front cap, the rim walls and the back cap
 *   into one non-indexed buffer, and `intersectObject` returns them nearest-first.
 *   At an oblique viewing angle the bottom rim wall faces the camera, so a click
 *   near the panel's lower edge can land on a wall whose `uv` is
 *   (position along the contour, depth) — meaningless. Recovering the front face
 *   would mean filtering by face index or normal, which is a SECOND statement of
 *   "which surface is the front" that can disagree with the first.
 *
 *   That is not dormant here. `panelPointer` raycasts the face to decide whether a
 *   three-second navigation starts, and it does so non-recursively — the plate
 *   being a separate mesh is what makes one `false` argument enough.
 *
 *   MATERIAL STATE. The face wants `depthWrite: false`; the body wants
 *   `depthWrite: true`. One mesh means a material array and geometry groups, and
 *   then anything reading the face's uniforms has to reach `material[0]` and hope.
 *
 *   COST. `setSize` rebuilds a four-vertex plane today. One mesh would
 *   re-triangulate a rounded extrusion on every window resize.
 *
 *   UVs, which are unusable on the walls. That is the fourth reason, not the
 *   first.
 *
 * The split then costs nothing, because this mesh is added as a CHILD of the
 * panel: position, yaw and the 45-degree tilt all follow for free, and a
 * non-recursive `intersectObject(panel, false)` provably never hits a child.
 *
 * ## Dimension-ignorant on purpose
 *
 * It takes finished world dimensions and knows nothing about the core inset that
 * produced them. `blogDisplay` keeps the single derivation, so the
 * "one owner for these coordinates" rule that `displayConfig` states is not
 * quietly broken across a new module boundary.
 */

/**
 * The plate's palette.
 *
 * Neutral now, and `rim` is the single biggest change of the premium-display pass.
 * It used to be `0x2f7fa0` — "between the panel's halo and the beams' cyan" — which
 * was correct for an object that was supposed to look projected. A machined edge on
 * a real plate catches ROOM light, and room light is not teal. Nothing else in this
 * shader had to change to convert the whole object from hologram to hardware.
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
  /** Rebuilds the geometry. Disposes what it replaces. */
  setDimensions(dimensions: DisplayShellDimensions): void;
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
    // The mechanism of the whole change. This is what backs the copy with a solid
    // surface and what stops the projector beams drawing through the plate.
    depthWrite: true,
    depthTest: true,
    // `DoubleSide`, and this is the ONE place this copy departs from the district's
    // plate. There the back cap is never seen — the follow yaw is clamped to +/-42
    // degrees, so the visitor cannot get behind the display, and culling it halves
    // the fill. Here the camera is a free orbit and the visitor can walk right
    // round, at which point a culled back cap leaves the face hanging in the air
    // with no body behind it — which is exactly what this module exists to prevent.
    //
    // The cost is the back cap's fill, on a plate that is a few hundred triangles.
    // Restore `FrontSide` the moment a clamped camera owns this scene again.
    side: THREE.DoubleSide,
    uniforms: {
      uActivation: { value: 0 },
      uThickness: { value: dimensions.thickness },
      uHalfSize: { value: new THREE.Vector2(dimensions.width / 2, dimensions.height / 2) },
      uCornerRadius: { value: dimensions.radius },
      uBevelWidth: { value: 0.9 },
      // Three scalars came DOWN together, and for one reason: they were tuned to
      // make a projected object read as lit from within. A satin housing is lit from
      // without, and its whole character is that it does not compete with the screen
      // it surrounds.
      uBevelLift: { value: 0.1 },
      uRimBase: { value: 0.1 },
      uRimPeak: { value: 0.16 },
      // The ONLY one going up, and the exception is the point.
      //
      // Grazing response on real extruded geometry is the genuine optical cue here —
      // it is what a machined edge does, it is stable at every camera angle by
      // construction, and it is the one place this object can afford to be brighter
      // without becoming a hologram again. The face deliberately has no view-
      // dependent term at all (`display.frag`), so this carries all of it.
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
  // Before the beams (2) and the panel (3) in the transparent queue. The plate has
  // to be down before anything is composited onto it.
  object.renderOrder = 0;

  place(object, dimensions.thickness);

  return {
    object,
    material,

    setDimensions(next) {
      // REBUILT, never scaled, and the reason is not performance.
      //
      // A non-uniform x/y scale turns the plate's circular corner arcs into
      // ellipses, which then no longer register with the front face's
      // aspect-corrected circular SDF — a misregistered corner is the exact defect
      // that reads as "broken". It would also invalidate the `mat3(modelMatrix)`
      // the vertex shader uses as a normal transform.
      //
      // The cost is a tuning-session cost only: `setSize`, `setCoreInset` and
      // `setCornerRadius` are debug-panel paths that production never calls, and
      // `setSize` already rebuilds the panel's own geometry on the same resize.
      object.geometry.dispose();
      object.geometry = buildGeometry(next);

      material.uniforms['uThickness']!.value = next.thickness;
      (material.uniforms['uHalfSize']!.value as THREE.Vector2).set(
        next.width / 2,
        next.height / 2,
      );
      material.uniforms['uCornerRadius']!.value = next.radius;

      place(object, next.thickness);
    },

    setActivation(value) {
      material.uniforms['uActivation']!.value = value;

      // DEPTH FOLLOWS VISIBILITY, and this fixes a real bug rather than tidying one.
      //
      // `depthWrite` is what makes this plate back the copy and occlude the beams,
      // and it was left permanently true. But alpha does not gate depth writes: at
      // `uActivation = 0` the plate is completely invisible and STILL fills the depth
      // buffer with a 42-unit square hanging over the plaza. Everything behind it was
      // being discarded — the projector beams for as long as they have existed, and
      // then every mote of the materialisation, which is how this was finally found.
      //
      // The symptom is the worst kind: no error, no warning, and an effect that is
      // provably running with correct positions and correct alpha while rendering
      // nothing at all.
      //
      // Nothing invisible should occlude anything. While the plate is fading it does
      // write depth, which is correct — it is genuinely there, backing the copy.
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

/**
 * How far behind the panel plane the plate's front cap sits, in world units.
 *
 * Must be greater than zero. Two coplanar meshes with different triangulations
 * disagree at the last bit of interpolation and speckle against each other even
 * under `LessEqualDepth`. At the district camera this is under a pixel.
 */
const FRONT_GAP = 0.06;

/** `ExtrudeGeometry` spans z 0..depth, so the whole plate is pushed behind. */
function place(mesh: THREE.Mesh, thickness: number): void {
  mesh.position.z = -(thickness + FRONT_GAP);
}

function buildGeometry(dimensions: DisplayShellDimensions): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(
    roundedRect(dimensions.width, dimensions.height, dimensions.radius),
    {
      depth: dimensions.thickness,
      // MUST be explicit. It defaults to TRUE, and a bevel grows the silhouette
      // past the size the front face's SDF is registered against — which puts a
      // sliver of lit plate outside the face at every corner.
      bevelEnabled: false,
      // The default of 12 is twelve segments per FULL circle, so three per corner,
      // which is visibly faceted at this radius.
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
