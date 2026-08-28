import * as THREE from 'three';
import type { BoundsRect, TerrainTransitionConfig } from '../config/environmentConfig';
import { expandRect } from '../navigation/navigationBounds';

export interface TerrainTransitionOptions {
  /**
   * World-space rectangles of authored openings in the ground — today, the
   * river channel.
   *
   * Only openings that REACH the plate perimeter matter here; an opening that
   * stops short of it is interior, and nothing in this module ever touches the
   * plate's interior. Where one does reach an edge, the collar is interrupted
   * across it so the channel reads as continuing out of the scene rather than
   * being sealed by a wall of terrain.
   */
  openings?: readonly BoundsRect[];
}

export interface TerrainTransition {
  /** Holds the collar and the skirt. Add/remove this, not the meshes. */
  group: THREE.Group;
  /** Terrain plate bounds on XZ, in world space. */
  plateBounds: BoundsRect;
  /** Plate plus skirt — the full visual extent of the ground. */
  visualBounds: BoundsRect;
  warnings: string[];
  dispose: () => void;
}

/**
 * Keeps the terrain plate from reading as a finite slab floating in the scene,
 * in two parts, BOTH ENTIRELY OUTSIDE the authored ground.
 *
 * **Collar** — an opaque band of four strips around the plate's rectangular
 * footprint, so the ground continues past the authored edge.
 *
 * **Skirt** — a rectangular fade continuing outward from there, from fully
 * opaque to fully transparent.
 *
 * WHY THE INTERIOR IS OFF LIMITS. This used to work the other way round: it
 * extracted the plate's boundary loop and filled everything between that
 * outline and the bounding rectangle, on the premise that the plate was an
 * irregular polygon that did not fill its own AABB. The ground has since been
 * authored with a rectangular perimeter and an intentional river channel cut
 * through it, and that premise inverted:
 *
 *  - the channel splits the plate into TWO pieces, so there are two boundary
 *    loops, and taking `loops[0]` silently ignored 36% of the ground;
 *  - the only region inside the rectangle not covered by the plate is the
 *    channel, so "fill the difference" meant "pave over the river".
 *
 * Authored geometry is authoritative. Interior holes are intentional and are
 * never reconstructed. The only thing this module may draw is terrain beyond
 * the outer footprint.
 *
 * Deliberate choices carried over from the Phase 1 audit:
 *
 *  - **Alpha reaches zero rather than matching the background colour.** The
 *    renderer uses ACES tone mapping, but `scene.background` is written as an
 *    untone-mapped clear colour, so a mesh authored to the background value
 *    renders visibly darker. Fading to transparent sidesteps the mismatch.
 *  - **Materials are cloned from the terrain.** The GLB ships zero materials, so
 *    all meshes share one default instance; modifying it in place would change
 *    the whole city. Cloning also keeps the join matching automatically once
 *    real materials arrive.
 *  - **Nothing is coplanar with the plate.** Both meshes sit `verticalOffset`
 *    below the plate's top and tuck `innerOverlap` under its edge, so the
 *    opaque plate wins the depth test in the overlap instead of z-fighting.
 */
export function createTerrainTransition(
  terrain: THREE.Mesh,
  config: TerrainTransitionConfig,
  options: TerrainTransitionOptions = {},
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
  const topY = box.max.y - config.verticalOffset;

  const group = new THREE.Group();
  group.name = 'TerrainTransition';

  const disposables: Array<{ dispose: () => void }> = [];
  const material = resolveMaterial(terrain, warnings);
  disposables.push(material);

  const gaps = perimeterGaps(plateBounds, options.openings ?? [], warnings);

  const collar = buildCollar(plateBounds, topY, config, gaps, material.clone());
  group.add(collar.mesh);
  disposables.push(collar);

  // The skirt is notched too, not just the collar. It reaches alpha 1 at the
  // plate edge, so a skirt left closed would paint over the mouths the collar
  // just opened and the notch would be invisible.
  const skirt = buildSkirt(plateBounds, topY, config, gaps, material.clone());
  group.add(skirt.mesh);
  disposables.push(skirt);

  return {
    group,
    plateBounds,
    visualBounds: terrainVisualBounds(plateBounds, config),
    warnings,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}

// --- Perimeter openings -----------------------------------------------------

/** A run along one side of the rectangle, in that side's own axis. */
interface Span {
  min: number;
  max: number;
}

/**
 * The four sides. `minX`/`maxX` run along Z; `minZ`/`maxZ` run along X.
 */
interface SideGaps {
  minX: Span[];
  maxX: Span[];
  minZ: Span[];
  maxZ: Span[];
}

/** How close an opening must come to an edge to count as reaching it. */
const EDGE_TOLERANCE = 1;

/**
 * Which stretches of each side an authored opening reaches, so the collar can
 * be interrupted there.
 *
 * An opening that does not come within `EDGE_TOLERANCE` of a side is interior
 * and contributes nothing: the collar never needed to know it existed.
 */
function perimeterGaps(
  plate: BoundsRect,
  openings: readonly BoundsRect[],
  warnings: string[],
): SideGaps {
  const gaps: SideGaps = { minX: [], maxX: [], minZ: [], maxZ: [] };

  for (const opening of openings) {
    if (Math.abs(opening.minX - plate.minX) <= EDGE_TOLERANCE) {
      gaps.minX.push({ min: opening.minZ, max: opening.maxZ });
    }
    if (Math.abs(opening.maxX - plate.maxX) <= EDGE_TOLERANCE) {
      gaps.maxX.push({ min: opening.minZ, max: opening.maxZ });
    }
    if (Math.abs(opening.minZ - plate.minZ) <= EDGE_TOLERANCE) {
      gaps.minZ.push({ min: opening.minX, max: opening.maxX });
    }
    if (Math.abs(opening.maxZ - plate.maxZ) <= EDGE_TOLERANCE) {
      gaps.maxZ.push({ min: opening.minX, max: opening.maxX });
    }
  }

  const reached =
    gaps.minX.length + gaps.maxX.length + gaps.minZ.length + gaps.maxZ.length;
  if (openings.length > 0 && reached === 0) {
    warnings.push(
      `${openings.length} authored opening(s) reported, none reaching the plate perimeter; ` +
        'the collar is a plain ring. If the river now stops short of the edge this is correct, ' +
        'and the opening no longer needs to be passed in.',
    );
  }

  return gaps;
}

/** `full`, minus every gap, as the runs that remain. Gaps may overlap. */
function spansOutsideGaps(full: Span, gaps: readonly Span[]): Span[] {
  const sorted = gaps
    .map((g) => ({ min: Math.max(g.min, full.min), max: Math.min(g.max, full.max) }))
    .filter((g) => g.max > g.min)
    .sort((a, b) => a.min - b.min);

  const runs: Span[] = [];
  let cursor = full.min;
  for (const gap of sorted) {
    if (gap.min > cursor) runs.push({ min: cursor, max: gap.min });
    cursor = Math.max(cursor, gap.max);
  }
  if (cursor < full.max) runs.push({ min: cursor, max: full.max });
  return runs;
}

// --- Collar ------------------------------------------------------------------

interface BuiltMesh {
  mesh: THREE.Mesh;
  dispose: () => void;
}

/**
 * Four opaque strips around the plate's rectangular footprint.
 *
 * The two Z-running sides span the full extended X range so the corners are
 * covered once and without a seam; the two X-running sides span only the
 * plate's own Z range. Every strip is split by the gaps its side carries, so an
 * opening that reaches the perimeter is left open rather than paved over.
 *
 * Flat at `topY` rather than following the plate's edge heights: with a
 * rectangular perimeter every edge vertex is already at the plate top, so
 * interpolating would be arithmetic with no visible effect.
 */
function buildCollar(
  plate: BoundsRect,
  topY: number,
  config: TerrainTransitionConfig,
  gaps: SideGaps,
  material: THREE.Material,
): BuiltMesh {
  const w = Math.max(config.collarWidth, 0);
  const tuck = config.innerOverlap;
  const outer = expandRect(plate, w);

  const positions: number[] = [];
  const indices: number[] = [];

  const quad = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    if (maxX - minX <= 0 || maxZ - minZ <= 0) return;
    const base = positions.length / 3;
    positions.push(minX, topY, minZ, maxX, topY, minZ, maxX, topY, maxZ, minX, topY, maxZ);
    // Wound so the faces point +Y.
    indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
  };

  // Z-running sides first: they own the corners.
  for (const run of spansOutsideGaps({ min: outer.minX, max: outer.maxX }, gaps.minZ)) {
    quad(run.min, run.max, outer.minZ, plate.minZ + tuck);
  }
  for (const run of spansOutsideGaps({ min: outer.minX, max: outer.maxX }, gaps.maxZ)) {
    quad(run.min, run.max, plate.maxZ - tuck, outer.maxZ);
  }
  // X-running sides fill between them.
  for (const run of spansOutsideGaps({ min: plate.minZ, max: plate.maxZ }, gaps.minX)) {
    quad(outer.minX, plate.minX + tuck, run.min, run.max);
  }
  for (const run of spansOutsideGaps({ min: plate.minZ, max: plate.maxZ }, gaps.maxX)) {
    quad(plate.maxX - tuck, outer.maxX, run.min, run.max);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
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

// --- Skirt -----------------------------------------------------------------

function buildSkirt(
  plateBounds: BoundsRect,
  topY: number,
  config: TerrainTransitionConfig,
  gaps: SideGaps,
  material: THREE.Material,
): BuiltMesh {
  const loops = Math.max(2, Math.floor(config.loops));
  const segments = Math.max(1, Math.floor(config.segmentsPerSide));
  const ring = buildRing(plateBounds, segments, gaps);
  const perimeterCount = ring.length;
  const vertexCount = perimeterCount * (loops + 1);

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);

  for (let loop = 0; loop <= loops; loop += 1) {
    const t = loop / loops;
    const offset = -config.innerOverlap + t * (config.width + config.innerOverlap);
    const rect = expandRect(plateBounds, offset);
    const alpha = fadeAlpha(t, config.fadeEndFraction, config.fadeExponent);

    for (let p = 0; p < perimeterCount; p += 1) {
      const index = loop * perimeterCount + p;
      const sample = ring[p]!;
      const point = perimeterPoint(rect, sample.side, sample.fraction);

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
      if (ring[p]!.openAfter) continue;
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

/**
 * Full visual extent of the ground: the terrain plate plus the skirt around it.
 *
 * Split out of `createTerrainTransition` so `checks/footprint.ts` can
 * measure the real rectangle without a GL context or a loaded GLB — building
 * the skirt needs a mesh and a shader material, and neither says anything about
 * how far the ground visibly reaches. The alternative was a check that
 * recomputes `plate + width` itself, which is the "harness that rebuilds what
 * it is testing" failure; see `applyPoseToCamera` for the same split.
 *
 * This rectangle is what the navigable area is inset from, so it is the term
 * that pays for zooming out.
 */
export function terrainVisualBounds(
  plateBounds: BoundsRect,
  config: TerrainTransitionConfig,
): BoundsRect {
  return expandRect(plateBounds, config.width);
}

// --- Shared helpers ---------------------------------------------------------

/** One sample on the perimeter walk, shared by every loop of the skirt. */
interface RingSample {
  /** 0: minZ, 1: maxX, 2: maxZ, 3: minX — the walk order. */
  side: number;
  /** Position along that side, 0..1 in the side's own direction of travel. */
  fraction: number;
  /** True when the span from here to the next sample is an open channel. */
  openAfter: boolean;
}

/**
 * The perimeter walk, as fractions rather than a fixed step count.
 *
 * Every loop of the skirt reuses this one list, so sample `p` sits at the same
 * fractional position on every loop and consecutive loops still join with plain
 * quads — the property the uniform walk had, kept while allowing extra samples.
 *
 * Gaps are held as FRACTIONS of the base plate side, not as world coordinates.
 * That makes the opening splay outward with the skirt rather than staying a
 * fixed width, which is both what a channel running to the horizon should look
 * like and the only version where the sample order cannot change between loops
 * — a world-fixed gap would drift past the uniform samples as the rectangle
 * expands and twist the strip.
 */
function buildRing(plate: BoundsRect, segments: number, gaps: SideGaps): RingSample[] {
  const spanX = plate.maxX - plate.minX;
  const spanZ = plate.maxZ - plate.minZ;

  /** A side's gaps as fractions, in that side's direction of travel. */
  const fractionsFor = (side: number): Span[] => {
    const map = (min: number, max: number): Span => {
      switch (side) {
        case 0:
          return { min: (min - plate.minX) / spanX, max: (max - plate.minX) / spanX };
        case 1:
          return { min: (min - plate.minZ) / spanZ, max: (max - plate.minZ) / spanZ };
        case 2:
          return { min: (plate.maxX - max) / spanX, max: (plate.maxX - min) / spanX };
        default:
          return { min: (plate.maxZ - max) / spanZ, max: (plate.maxZ - min) / spanZ };
      }
    };
    const source = [gaps.minZ, gaps.maxX, gaps.maxZ, gaps.minX][side]!;
    return source
      .map((g) => map(g.min, g.max))
      // A gap touching a corner would leave the ring open around it; clamp
      // strictly inside so every side always starts and ends closed.
      .map((g) => ({ min: Math.max(g.min, 1e-4), max: Math.min(g.max, 1 - 1e-4) }))
      .filter((g) => g.max > g.min);
  };

  const ring: RingSample[] = [];
  for (let side = 0; side < 4; side += 1) {
    const sideGaps = fractionsFor(side);
    const fractions = new Set<number>();
    for (let i = 0; i < segments; i += 1) fractions.add(i / segments);
    for (const gap of sideGaps) {
      fractions.add(gap.min);
      fractions.add(gap.max);
    }
    const ordered = [...fractions].sort((a, b) => a - b);

    ordered.forEach((fraction, i) => {
      // The last sample of a side spans the corner into the next side, which is
      // never part of a gap.
      const next = ordered[i + 1];
      const openAfter =
        next !== undefined &&
        sideGaps.some((g) => {
          const mid = (fraction + next) / 2;
          return mid > g.min && mid < g.max;
        });
      ring.push({ side, fraction, openAfter });
    });
  }
  return ring;
}

/** Point at `fraction` along one side of the rectangle. */
function perimeterPoint(rect: BoundsRect, side: number, f: number): { x: number; z: number } {
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
