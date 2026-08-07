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
 */
export class InteractionProbe {
  private readonly raycaster = new THREE.Raycaster();
  private readonly center = new THREE.Vector2(0, 0);
  private readonly camera: THREE.Camera;
  private readonly interactiveObjects: THREE.Object3D[] = [];
  private readonly hits: THREE.Intersection[] = [];

  constructor(camera: THREE.Camera) {
    this.camera = camera;
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
