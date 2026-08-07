import * as THREE from 'three';
import { PropertyBinding } from 'three';

/**
 * Node-name lookup that survives GLTFLoader's renaming.
 *
 * `GLTFLoader` passes every node name through `PropertyBinding.sanitizeNodeName`,
 * which strips the reserved characters `[ ] . : /`. Blender's ubiquitous `.001`
 * suffixes are therefore silently rewritten:
 *
 *     "Plane.013"  ->  "Plane013"
 *     "parque.001" ->  "parque001"
 *
 * so `getObjectByName('Plane.013')` returns undefined. This cost the project a
 * long-running bug where the terrain plate was never found and the navigable
 * area silently collapsed to 3.6% of the plate (PROJECT_MEMORY section 4.1).
 *
 * The original name survives on `userData.name`, so all three spellings are
 * tried. Extracted from `findTerrainPlate` so district resolution cannot
 * reintroduce the same bug by reimplementing it.
 */
export type NameMatchSource = 'configured-name' | 'sanitized-name' | 'original-name';

export interface NameMatch {
  object: THREE.Object3D;
  source: NameMatchSource;
  /** The spelling that actually matched, for diagnostics. */
  matchedName: string;
}

/**
 * First object matching `configuredName` in any of its three spellings.
 *
 * `accept` filters candidates, and a rejected candidate does **not** end the
 * search — the remaining spellings are still tried. That matters because a name
 * can legitimately resolve to a group in one spelling and the wanted mesh in
 * another, and giving up on the first non-match would silently reintroduce the
 * lookup miss this module exists to prevent.
 */
export function findByAnyNameSpelling(
  root: THREE.Object3D,
  configuredName: string,
  accept: (obj: THREE.Object3D) => boolean = () => true,
): NameMatch | null {
  const byExact = root.getObjectByName(configuredName);
  if (byExact && accept(byExact)) {
    return { object: byExact, source: 'configured-name', matchedName: configuredName };
  }

  const sanitized = PropertyBinding.sanitizeNodeName(configuredName);
  if (sanitized !== configuredName) {
    const bySanitized = root.getObjectByName(sanitized);
    if (bySanitized && accept(bySanitized)) {
      return { object: bySanitized, source: 'sanitized-name', matchedName: sanitized };
    }
  }

  let byOriginal: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (byOriginal) return;
    if (obj.userData?.['name'] === configuredName && accept(obj)) byOriginal = obj;
  });
  if (byOriginal) {
    return { object: byOriginal, source: 'original-name', matchedName: configuredName };
  }

  return null;
}
