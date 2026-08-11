import * as THREE from 'three';

export interface InteractiveMetadata {
  interactive: boolean;
  interactionType?: string;
  interactionId?: string;
}

/**
 * Minimal center-screen interaction probe. Builds a cached list of interactive
 * objects once after loading (via userData.interactive), and raycasts only that
 * list on click — never the full scene.
 *
 * THIS IS A DIAGNOSTIC. `probe()` returns void and its only effect is a
 * console.info; nothing in the product reads it. It is called from
 * MurciaExperience's pointerup handler, which is gated on `active` and the drag
 * state but NOT on the build environment — so without the flag below it would
 * log node names and interaction metadata on every click in production.
 *
 * It is inert today only by accident: the GLB ships zero `extras`, so
 * `collectFrom` caches nothing and `probe()` returns immediately. The Blender
 * re-export in `murcia/blender-export-contract.md` is what would silently switch
 * it on. Gating it on the same flag as every other debug affordance means that
 * re-export cannot turn a public site chatty as a side effect.
 */
export class InteractionProbe {
  private readonly raycaster = new THREE.Raycaster();
  private readonly center = new THREE.Vector2(0, 0);
  private readonly camera: THREE.Camera;
  private readonly enabled: boolean;
  private readonly interactiveObjects: THREE.Object3D[] = [];
  private readonly hits: THREE.Intersection[] = [];

  constructor(camera: THREE.Camera, enabled = false) {
    this.camera = camera;
    this.enabled = enabled;
  }

  /** Traverse once after load to cache interactive objects. */
  collectFrom(root: THREE.Object3D): number {
    root.traverse((obj) => {
      const data = obj.userData as InteractiveMetadata;
      if (data && data.interactive === true) {
        this.interactiveObjects.push(obj);
      }
    });
    return this.interactiveObjects.length;
  }

  /**
   * Casts a ray and logs metadata of the first interactive hit.
   * Pass normalized device coordinates (-1..1); defaults to screen center.
   */
  probe(ndc?: THREE.Vector2): void {
    if (!this.enabled) return;
    if (this.interactiveObjects.length === 0) return;

    this.raycaster.setFromCamera(ndc ?? this.center, this.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.interactiveObjects, true, this.hits);

    const hit = this.hits[0];
    if (!hit) return;

    let node: THREE.Object3D | null = hit.object;
    while (node) {
      const data = node.userData as InteractiveMetadata;
      if (data && data.interactive === true) {
        console.info('[interaction] selected', {
          name: node.name,
          type: data.interactionType,
          id: data.interactionId,
          point: hit.point,
        });
        return;
      }
      node = node.parent;
    }
  }
}
