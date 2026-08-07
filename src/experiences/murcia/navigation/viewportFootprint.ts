import * as THREE from 'three';
import type { BoundsRect } from '../config/environmentConfig';
import { collapseIfInverted, intersectRect } from './navigationBounds';

/**
 * How far the visible ground reaches from the navigation focus, per direction.
 * All values are non-negative distances in world units.
 */
export interface GroundFootprint {
  reachNegX: number;
  reachPosX: number;
  reachNegZ: number;
  reachPosZ: number;
  /**
   * True when at least one corner ray had to be clamped — because it pointed
   * above the horizon, or because its ground intersection exceeded
   * maxGroundDistance. The footprint is still usable; this flags that it is a
   * conservative approximation rather than the exact frustum.
   */
  clampedRays: boolean;
}

const NDC_CORNERS: ReadonlyArray<THREE.Vector2> = [
  new THREE.Vector2(-1, -1),
  new THREE.Vector2(1, -1),
  new THREE.Vector2(-1, 1),
  new THREE.Vector2(1, 1),
];

// Reused across calls; the footprint is recomputed on resize and pose change,
// never per frame, but allocating here would still be pointless garbage.
const raycaster = new THREE.Raycaster();
const hit = new THREE.Vector3();
const horizontal = new THREE.Vector3();

/**
 * Projects the four viewport corners onto the ground plane and measures how far
 * the view reaches from the focus in each direction.
 *
 * Rays that point above the horizon, or that would reach implausibly far at a
 * shallow camera angle, are clamped to `maxGroundDistance` along their
 * horizontal direction. Without that clamp a low camera produces a near-infinite
 * footprint, which would invert the bounds and — if left unhandled — remove the
 * limits entirely (docs/plans/002 Phase 4 and Appendix A).
 */
export function computeGroundFootprint(
  camera: THREE.PerspectiveCamera,
  focus: THREE.Vector3,
  groundHeight: number,
  maxGroundDistance: number,
): GroundFootprint {
  const footprint: GroundFootprint = {
    reachNegX: 0,
    reachPosX: 0,
    reachNegZ: 0,
    reachPosZ: 0,
    clampedRays: false,
  };

  camera.updateMatrixWorld();

  for (const corner of NDC_CORNERS) {
    raycaster.setFromCamera(corner, camera);
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;

    let clamped = false;

    // Downward component must be meaningful for a ground intersection to exist.
    if (direction.y < -1e-6) {
      const t = (groundHeight - origin.y) / direction.y;
      hit.copy(origin).addScaledVector(direction, t);
    } else {
      clamped = true;
      hit.copy(origin);
    }

    horizontal.set(hit.x - origin.x, 0, hit.z - origin.z);
    const distance = horizontal.length();

    if (clamped || distance > maxGroundDistance) {
      clamped = true;
      // Fall back to the ray's horizontal heading at the clamp distance. For an
      // upward ray that heading is still well defined.
      horizontal.set(direction.x, 0, direction.z);
      if (horizontal.lengthSq() < 1e-12) {
        // Perfectly vertical ray: no horizontal reach to contribute.
        continue;
      }
      horizontal.normalize().multiplyScalar(maxGroundDistance);
      hit.set(origin.x + horizontal.x, groundHeight, origin.z + horizontal.z);
    }

    if (clamped) footprint.clampedRays = true;

    const dx = hit.x - focus.x;
    const dz = hit.z - focus.z;
    footprint.reachNegX = Math.max(footprint.reachNegX, -dx);
    footprint.reachPosX = Math.max(footprint.reachPosX, dx);
    footprint.reachNegZ = Math.max(footprint.reachNegZ, -dz);
    footprint.reachPosZ = Math.max(footprint.reachPosZ, dz);
  }

  return footprint;
}

/**
 * Reduces the configured navigation bounds so that no allowed focus position
 * can bring the visual boundary into frame.
 *
 *   effective = configuredNavigationBounds
 *             ∩ (visualBounds − viewport footprint − safety margin)
 *
 * `visualBounds` is the terrain plate *plus* the transition skirt, not the
 * plate alone. That distinction is what keeps the navigable area usable: with a
 * generous skirt the footprint term stops binding and the limits follow the
 * configured content area instead (docs/plans/002 Appendix A).
 */
export function computeEffectiveBounds(
  configured: BoundsRect,
  visualBounds: BoundsRect,
  footprint: GroundFootprint,
  safetyMargin: number,
): BoundsRect {
  const footprintLimited: BoundsRect = {
    minX: visualBounds.minX + footprint.reachNegX + safetyMargin,
    maxX: visualBounds.maxX - footprint.reachPosX - safetyMargin,
    minZ: visualBounds.minZ + footprint.reachNegZ + safetyMargin,
    maxZ: visualBounds.maxZ - footprint.reachPosZ - safetyMargin,
  };

  return collapseIfInverted(intersectRect(configured, footprintLimited));
}
