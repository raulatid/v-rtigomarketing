import * as THREE from 'three';

/** The attribute GLTFLoader gives `TEXCOORD_n`: `uv`, `uv1`, ... */
export function uvAttributeName(channel: number): string {
  return channel === 0 ? 'uv' : `uv${channel}`;
}

export function findScreen(root: THREE.Object3D, nodeName: string, uvChannel: number): THREE.Mesh | null {
  const name = THREE.PropertyBinding.sanitizeNodeName(nodeName);
  const attribute = uvAttributeName(uvChannel);
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!found && mesh.isMesh && object.name === name && mesh.geometry.getAttribute(attribute)) {
      found = mesh;
    }
  });
  return found;
}

/**
 * Makes the configured UV set the mesh's `uv`, which is the one attribute the
 * facade's shader and `measureFacade` read.
 *
 * The screen owns its geometry — it is one named mesh, never instanced — so
 * the attribute is moved on the geometry itself. Whatever sat in `uv` before
 * (the trim-band UV, since v7) is dropped from the screen: nothing on this
 * mesh samples the trim, and leaving it would be a second, wrong `uv` for the
 * next reader to find.
 */
export function selectScreenUv(mesh: THREE.Mesh, uvChannel: number): void {
  if (uvChannel === 0) return;
  const source = mesh.geometry.getAttribute(uvAttributeName(uvChannel));
  if (!source) return;
  mesh.geometry.setAttribute('uv', source);
  mesh.geometry.deleteAttribute(uvAttributeName(uvChannel));
}

