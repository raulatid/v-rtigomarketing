import * as THREE from 'three';
import { createRioWater, type RioWater } from '../../water/createRioWater';
import type { RioWaterConfig } from '../../water/rioWaterConfig';

/**
 * The lake's surface: the river's water material on the export's water meshes.
 *
 * The lake had its own shader — crossing sine wave trains, caustics and a sun
 * glint — and read as a different water from the river a few hundred metres
 * away. It now takes the river's material (`water/createRioWater.ts`), so the
 * two surfaces are one water in two colours. Only the tunables differ.
 *
 * Two of the river's features are off here, by construction rather than by
 * choice. The shore ramp and the wall shadow measure the distance to bank
 * segments the shader holds at most 48 of, and the water node's outline is
 * 192 edges across three bodies, so no segments are supplied: the whole lake
 * reads as mid-channel, `shallowColor` and the wall shadow never show, and the
 * colour is `deepColor` under the fresnel sky. The ripples still need a
 * direction to be stretched along; with no current to read they run along
 * world X, and `flowReversed` has nothing to reverse.
 *
 * This swaps every mesh under the water node onto the one material and keeps
 * the originals, so `dispose` can hand the meshes back as they were and free
 * the shader. The geometry is untouched, so the click raycast still hits the
 * same surface.
 */

export type LakeWaterConfig = RioWaterConfig;

export interface LakeWater {
  configure(config: LakeWaterConfig): void;
  /** Takes the frame DELTA; the elapsed time the material wants is kept here. */
  update(dt: number): void;
  dispose(): void;
}

/** Where the ripples run. The lake has no current, so this is a wind. */
const LAKE_DRIFT_AXIS = { x: 1, z: 0 };

export function attachLakeWater(water: THREE.Object3D, initial: LakeWaterConfig): LakeWater {
  const river: RioWater = createRioWater(initial);
  river.setFlowAxis(LAKE_DRIFT_AXIS, water.matrixWorld, false);

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  water.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    originals.set(mesh, mesh.material);
    mesh.material = river.material;
  });

  let elapsed = 0;

  return {
    configure(config) {
      river.configure(config);
    },
    update(dt) {
      elapsed += dt;
      river.update(elapsed);
    },
    dispose() {
      for (const [mesh, original] of originals) mesh.material = original;
      originals.clear();
      river.dispose();
    },
  };
}
