import * as THREE from 'three'

/**
 * Releases every GPU resource reachable from a loaded model.
 *
 * Three's own `dispose()` is per-object and knows nothing about the graph, so
 * every consumer that loads a GLTF ends up writing this traversal. There were
 * two copies and they were not equivalent — `createCornerLogo` disposed
 * geometries and materials but never the materials' textures, and called
 * `dispose()` once per mesh on materials that several meshes share. On a model
 * whose meshes share one material that is N redundant dispose events, and the
 * textures — which are almost always the largest thing a GLTF brings — were
 * simply left resident.
 *
 * Shared rather than duplicated because both call sites want identical
 * semantics: release everything this model owns, once each. That is the §16 bar
 * — one responsibility, same semantics for every consumer — and the version
 * that was wrong is the reason it is worth centralising rather than an
 * incidental similarity.
 *
 * NOT for models whose geometry is shared with a cached template. `createSatellite`
 * clones from a template it keeps for the session, so disposing geometry through
 * this would pull the rug from every later clone; it disposes only its own
 * per-instance materials and says so at the call site.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (mat) materials.add(mat)
    }
  })

  // Materials first, so a texture reachable from two materials is still only
  // collected once and disposed once.
  for (const mat of materials) {
    collectTextures(mat, textures)
    mat.dispose()
  }
  for (const tex of textures) {
    tex.dispose()
  }
}

/**
 * Every texture hanging off a material, added to `out`.
 *
 * Enumerated rather than listed by name (`map`, `normalMap`, `aoMap`, …)
 * because the set differs per material class and a hardcoded list silently
 * misses whichever slot a future material introduces — which fails as a leak
 * rather than as an error.
 *
 * Exported because counting a model's textures and releasing them are the same
 * question asked twice: `loadCity`'s scene report uses this to say how many
 * distinct textures a GLTF brought, which is the number that has to be true for
 * the disposal above to be complete.
 */
export function collectTextures(mat: THREE.Material, out: Set<THREE.Texture>): void {
  const record = mat as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (value && (value as THREE.Texture).isTexture) {
      out.add(value as THREE.Texture)
    }
  }
}
