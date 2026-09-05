import * as THREE from 'three'

/**
 * The 3D mark's material: brand white, unlit, and outside the tone curve.
 *
 * ── Why there is no bake any more (plan 019 §3, 2026-09-05) ──
 *
 * The mark used to bind `logoBake.ktx2` onto a lit `MeshStandardMaterial`.
 * Compared side by side at the sizes the mark is ever drawn — 44px in the
 * blog's bar, ~60px in the scene's corner — the bake supplied a white
 * appearance and no detail the eye could find; and the geometry the mark is
 * moving to (`vertigo-isotipo-3d.glb`) carries `POSITION` and `NORMAL` and no
 * UV set at all, so there it could not have been sampled in the first place.
 * What the bake had been supplying was a white appearance, and this supplies
 * it directly.
 *
 * `MeshBasicMaterial` because the mark must be the SAME white over the black
 * sky, over Murcia's pale morning and on the blog's bar: a lit material takes
 * its brightness from lights this scene would then have to carry (three of
 * them, now gone) and still reads a shade darker at a glancing angle.
 * `toneMapped: false` because both renderers that draw it run ACES, and ACES
 * maps 1.0 to roughly 0.8 — brand white would ship as light grey. The same pair
 * `DistrictHighlight` and the city's banner use, for the same reason.
 *
 * Nothing else about the pass changes: the pipeline still clears depth before
 * the mark is drawn, and the material is opaque, so there is no render order,
 * transparency or depth setting to preserve here — there never was one.
 */
export function applyBrandWhite(model: THREE.Object3D): void {
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const arrived = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const white = arrived.map(
      () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    )
    // A material per slot, so a multi-material mesh keeps its groups; the
    // defaults GLTFLoader fabricated for a material-less GLB are released now
    // rather than left for a traversal that would no longer find them.
    mesh.material = Array.isArray(mesh.material) ? white : white[0]
    for (const material of arrived) material.dispose()
  })
}
