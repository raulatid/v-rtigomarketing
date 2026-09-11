import * as THREE from 'three';
import { CAMPUS_NODE_NAMES } from './campusConfig';

/**
 * The campus's fifteen root-level nodes, gathered under one group.
 *
 * The export writes them as siblings of every other city object, and the lab's
 * code was written for a root that IS the campus: `lake/lakeBasin.ts` picks the
 * lake as the body of water nearest the centre of the root it is given. Handed
 * the city, that centre is the city's, about 150 units away, and the nearest
 * body could be an entrance pool. Gathered, the centre is the campus's again.
 *
 * `attach` keeps each node's world transform and the group sits at identity
 * beside them, so nothing moves. Idempotent: a second call finds the group by
 * name and returns it. Null when none of the campus is in the model — a city
 * without it is a quieter city, not a broken one.
 */
export const CAMPUS_GROUP_NAME = 'CAMPUS';

export function gatherCampus(root: THREE.Object3D): THREE.Group | null {
  const existing = root.getObjectByName(CAMPUS_GROUP_NAME);
  if (existing instanceof THREE.Group) return existing;

  const wanted = new Set(CAMPUS_NODE_NAMES.map((name) => THREE.PropertyBinding.sanitizeNodeName(name)));
  const nodes: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (wanted.has(object.name) && !nodes.some((node) => node.name === object.name)) nodes.push(object);
  });
  const parent = nodes[0]?.parent;
  if (!parent) return null;

  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = CAMPUS_GROUP_NAME;
  parent.add(group);
  group.updateMatrixWorld(true);
  for (const node of nodes) group.attach(node);
  return group;
}
