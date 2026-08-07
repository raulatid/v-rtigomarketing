import * as THREE from 'three';
import type { BoundsRect, TerrainTransitionConfig } from '../config/environmentConfig';
import { extractBoundaryLoops, offsetLoopInward, signedAreaXZ } from './meshBoundary';
import type { BoundaryLoop } from './meshBoundary';

export interface TerrainTransition {
  /** Holds the collar and the skirt. Add/remove this, not the meshes. */
  group: THREE.Group;
  /** Terrain plate bounds on XZ, in world space. */
  plateBounds: BoundsRect;
  /** Plate plus skirt — the full visual extent of the ground. */
  visualBounds: BoundsRect;
  /** True when the plate's real outline was used to build a collar. */
  hasCollar: boolean;
  warnings: string[];
  dispose: () => void;
}

/**
 * Hides the terrain plate's hard edge, in two parts.
 *
 * **Collar** — the plate is an irregular low-poly polygon (134 vertices, 88
 * triangles), so it does not fill its own bounding rectangle. The gap between
 * its real outline and that rectangle was showing the scene background. The
 * collar is the exact difference between the two: an opaque ring triangulated
 * from the plate's extracted boundary loop out to the rectangle.
 *
 * **Skirt** — a rectangular fade continuing outward from the rectangle, from
 * fully opaque to fully transparent.
 *
 * Deliberate choices, from the Phase 1 audit:
 *
 *  - **Alpha reaches zero rather than matching the background colour.** The
 *    renderer uses ACES tone mapping, but `scene.background` is written as an
 *    untone-mapped clear colour, so a mesh authored to the background value
 *    renders visibly darker. Fading to transparent sidesteps the mismatch.
 *  - **Materials are cloned from the terrain.** The GLB ships zero materials, so
 *    all 111 meshes share one default instance; modifying it in place would
 *    change the whole city. Cloning also keeps the join matching automatically
 *    once real materials arrive.
 *  - **Nothing is coplanar with the plate.** The collar sits `verticalOffset`
 *    below the plate's top and tucks `innerOverlap` under its outline, so the
 *    opaque plate wins the depth test in the overlap instead of z-fighting.
 *
 * Why the fade is not simply offset along the boundary: offsetting a concave
 * outline outward self-intersects wherever a feature is narrower than the
 * offset, and the skirt reaches 380 units on a plate only 352 across. Morphing
 * to the bounding rectangle first keeps the geometry simple and robust; the
 * cost is that the fade is rectangular rather than following the coastline.
 */
export function createTerrainTransition(
  terrain: THREE.Mesh,
  config: TerrainTransitionConfig,
): TerrainTransition {
  const warnings: string[] = [];

  terrain.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(terrain);
  const plateBounds: BoundsRect = {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
  const plateTopY = box.max.y;

  const group = new THREE.Group();
  group.name = 'TerrainTransition';

  const disposables: Array<{ dispose: () => void }> = [];
  const material = resolveMaterial(terrain, warnings);
  disposables.push(material);

  // --- Collar --------------------------------------------------------------
  const boundary = extractBoundaryLoops(terrain);
  warnings.push(...boundary.warnings);

  let hasCollar = false;
  const outerLoop = boundary.loops[0];

  if (outerLoop && outerLoop.length >= 3) {
    const coverage = loopCoverage(outerLoop, plateBounds);
    if (coverage < 0.995) {
      warnings.push(
        `Plate outline covers ${(coverage * 100).toFixed(1)}% of its bounding rectangle; ` +
          'collar fills the remainder.',
      );
    }
    const collar = buildCollar(
      outerLoop,
      plateBounds,
      plateTopY - config.verticalOffset,
      config.innerOverlap,
      material.clone(),
      warnings,
    );
    if (collar) {
      group.add(collar.mesh);
      disposables.push(collar);
      hasCollar = true;
    }
  }

  if (!hasCollar) {
    warnings.push(
      'Could not build a boundary collar; the skirt starts at the bounding rectangle, ' +
        'so any gap between the plate outline and that rectangle will show the background.',
    );
  }

  // --- Skirt ---------------------------------------------------------------
  // Joins the collar's outer edge, which is flat at the rectangle, so the inner
  // ring height is known rather than sampled.
  const skirt = buildSkirt(
    plateBounds,
    plateTopY - config.verticalOffset,
    config,
    material.clone(),
  );
  group.add(skirt.mesh);
  disposables.push(skirt);

  return {
    group,
    plateBounds,
    visualBounds: expand(plateBounds, config.width),
    hasCollar,
    warnings,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}

// --- Collar ----------------------------------------------------------------

interface BuiltMesh {
  mesh: THREE.Mesh;
  dispose: () => void;
}

/**
 * Triangulates the region between the plate's real outline and its bounding
 * rectangle, using earcut via ShapeUtils with the outline as a hole.
 *
 * Heights are interpolated: outline vertices keep the plate's actual edge
 * height, rectangle vertices take the plate top, so the join has no step.
 */
function buildCollar(
  loop: BoundaryLoop,
  rect: BoundsRect,
  topY: number,
  innerOverlap: number,
  material: THREE.Material,
  warnings: string[],
): BuiltMesh | null {
  // Tuck slightly under the plate so the seam cannot show a hairline gap.
  const hole = offsetLoopInward(loop, innerOverlap);

  // Contour must enclose the hole; the rectangle is the plate's own AABB, so
  // nudge it out a fraction to guarantee strict containment.
  const outer = expand(rect, 0.01);
  const contour2D = [
    new THREE.Vector2(outer.minX, outer.minZ),
    new THREE.Vector2(outer.maxX, outer.minZ),
    new THREE.Vector2(outer.maxX, outer.maxZ),
    new THREE.Vector2(outer.minX, outer.maxZ),
  ];
  const hole2D = hole.map((p) => new THREE.Vector2(p.x, p.z));

  let faces: number[][];
  try {
    faces = THREE.ShapeUtils.triangulateShape(contour2D, [hole2D]);
  } catch (error) {
    warnings.push(
      `Collar triangulation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
  if (faces.length === 0) {
    warnings.push('Collar triangulation produced no faces.');
    return null;
  }

  const heights = [
    ...contour2D.map(() => topY),
    ...hole.map((p) => Math.min(p.y, topY)),
  ];
  const points = [...contour2D, ...hole2D];

  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    positions[i * 3] = points[i]!.x;
    positions[i * 3 + 1] = heights[i]!;
    positions[i * 3 + 2] = points[i]!.y;
  }

  const indices: number[] = [];
  for (const face of faces) indices.push(face[0]!, face[1]!, face[2]!);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  ensureUpwardWinding(geometry);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TerrainCollar';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.raycast = () => {};

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Flips the index order if the faces point downward.
 *
 * Triangulation happens in a 2D space where world Z stands in for Y, which
 * mirrors handedness; rather than reasoning about it, measure and correct.
 */
function ensureUpwardWinding(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) return;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let upward = 0;

  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    upward += cross.y;
  }

  if (upward >= 0) return;

  const flipped = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i += 3) {
    flipped[i] = index.getX(i);
    flipped[i + 1] = index.getX(i + 2);
    flipped[i + 2] = index.getX(i + 1);
  }
  geometry.setIndex(new THREE.BufferAttribute(flipped, 1));
}

// --- Skirt -----------------------------------------------------------------

function buildSkirt(
  plateBounds: BoundsRect,
  topY: number,
  config: TerrainTransitionConfig,
  material: THREE.Material,
): BuiltMesh {
  const loops = Math.max(2, Math.floor(config.loops));
  const segments = Math.max(1, Math.floor(config.segmentsPerSide));
  const perimeterCount = segments * 4;
  const vertexCount = perimeterCount * (loops + 1);

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);

  for (let loop = 0; loop <= loops; loop += 1) {
    const t = loop / loops;
    const offset = -config.innerOverlap + t * (config.width + config.innerOverlap);
    const rect = expand(plateBounds, offset);
    const alpha = fadeAlpha(t, config.fadeEndFraction, config.fadeExponent);

    for (let p = 0; p < perimeterCount; p += 1) {
      const index = loop * perimeterCount + p;
      const point = perimeterPoint(rect, p, segments);

      positions[index * 3] = point.x;
      positions[index * 3 + 1] = topY;
      positions[index * 3 + 2] = point.z;

      // RGB stays white so the cloned material's own colour is preserved;
      // only alpha is modulated.
      colors[index * 4] = 1;
      colors[index * 4 + 1] = 1;
      colors[index * 4 + 2] = 1;
      colors[index * 4 + 3] = alpha;
    }
  }

  const indices: number[] = [];
  for (let loop = 0; loop < loops; loop += 1) {
    for (let p = 0; p < perimeterCount; p += 1) {
      const q = (p + 1) % perimeterCount;
      const a = loop * perimeterCount + p;
      const b = loop * perimeterCount + q;
      const c = (loop + 1) * perimeterCount + p;
      const d = (loop + 1) * perimeterCount + q;
      // Wound so the faces point +Y.
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  material.transparent = true;
  material.vertexColors = true;
  // The fading region must not occlude anything behind it.
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TerrainTransitionSkirt';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.raycast = () => {};

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Alpha across the skirt: 1 at the plate edge, reaching 0 at `endFraction` of
 * the way out and staying there.
 *
 * Decoupling the gradient width from the geometry width matters: the skirt has
 * to reach far enough that its outer edge is never in frame, but a gradient
 * that wide would wash the whole horizon.
 */
function fadeAlpha(t: number, endFraction: number, exponent: number): number {
  const end = THREE.MathUtils.clamp(endFraction, 0.05, 1);
  const normalized = THREE.MathUtils.clamp(t / end, 0, 1);
  // Shaping before smoothstep holds opacity nearer the plate for exponent > 1,
  // while smoothstep keeps the derivative zero at both ends so neither the join
  // nor the outer termination shows as a band.
  const shaped = Math.pow(normalized, exponent);
  return 1 - shaped * shaped * (3 - 2 * shaped);
}

// --- Shared helpers ---------------------------------------------------------

function expand(rect: BoundsRect, amount: number): BoundsRect {
  return {
    minX: rect.minX - amount,
    maxX: rect.maxX + amount,
    minZ: rect.minZ - amount,
    maxZ: rect.maxZ + amount,
  };
}

/** Fraction of the bounding rectangle the outline actually encloses. */
function loopCoverage(loop: BoundaryLoop, rect: BoundsRect): number {
  const rectArea = (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ);
  if (rectArea <= 0) return 1;
  return Math.min(1, Math.abs(signedAreaXZ(loop)) / rectArea);
}

/**
 * Walks the rectangle perimeter with `segments` steps per side. Index `p` maps
 * to the same fractional position on every loop, so consecutive loops can be
 * joined by quads without any corner special-casing.
 */
function perimeterPoint(
  rect: BoundsRect,
  p: number,
  segments: number,
): { x: number; z: number } {
  const side = Math.floor(p / segments);
  const f = (p % segments) / segments;

  switch (side) {
    case 0:
      return { x: THREE.MathUtils.lerp(rect.minX, rect.maxX, f), z: rect.minZ };
    case 1:
      return { x: rect.maxX, z: THREE.MathUtils.lerp(rect.minZ, rect.maxZ, f) };
    case 2:
      return { x: THREE.MathUtils.lerp(rect.maxX, rect.minX, f), z: rect.maxZ };
    default:
      return { x: rect.minX, z: THREE.MathUtils.lerp(rect.maxZ, rect.minZ, f) };
  }
}

/**
 * Clones the terrain's material so the transition matches it exactly without
 * mutating the instance the rest of the city shares.
 */
function resolveMaterial(terrain: THREE.Mesh, warnings: string[]): THREE.Material {
  const source = Array.isArray(terrain.material) ? terrain.material[0] : terrain.material;
  if (!source) {
    warnings.push('Terrain has no material; transition falls back to a neutral standard material.');
    return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1 });
  }
  if (Array.isArray(terrain.material)) {
    warnings.push('Terrain uses multiple materials; transition matches the first.');
  }
  return source.clone();
}
