# Murcia v5.2-r1 web delivery

The selected city now includes the colored Teatro Romea, the cleared surrounding plots and new trees, and Nueva Condomina relocated outside the central city. The authored scene is preserved; web preparation, UV work and baking take place in separate files.

## Delivered assets

- Model: `public/models/murcia-v5.2-lightmaps-r1.glb` (8,730,832 bytes, Draco).
- Lightmaps: `public/textures/murcia/lightmaps-v5.2-r1/`, with 20 atlases and a versioned `lightmaps.json`.
- Mobile selected lightmaps: 4,489,081 bytes, within 4,500,000.
- Desktop selected lightmaps: 6,488,961 bytes, within 6,500,000.
- CITY_B remains 2K on both profiles. Central ground and the cathedral remain 2K on mobile. Cathedral and rooftop parapets retain UASTC.
- 23,303 instances in 19 groups. The Romea is joined into one mesh, preserving its colors, geometry and UVs. The active GLB contains 105 primitives before application additions and culling.

## Lighting and geometry

The delivery preserves the existing light rig: a warm central area light, peripheral sun and sky. Masters use 512 samples and diffuse direct plus indirect light without albedo. The cathedral, rooftop parapets and northwest atlas use 4K masters, downsampled for delivery.

Deleting procedural buildings also changed generated roof heights and window placements across the city. Comparison found changes in 12 receiver atlases and visibility differences in the remaining 8. All 20 were therefore rebaked, as authorized after reviewing those measurements. The 18,299 unchanged instances retain their atlas cells; existing prototype UVs remain intact. The theatre's narrow details receive a minimum four-pixel face width at 2K to avoid black slivers from subpixel UV islands.

Screens, animated logos, glass, interaction names and the terrain measurement contract are preserved. The stadium bounds in the asset contract are updated to the new authored position. The prior v5.2 assets remain available for rollback. Installation updates only the selected asset paths, their size test, the stadium/Romea contract and these notes; unrelated user edits are preserved.

## Source and verification evidence

- Authoring scene: `murcia-v5.2.blend`, SHA-256 `270d5c36468760f38c357e9d7868556fb7e6270b3b62c726710cd22ab773a15c`.
- Local delivery directory: `murcia-v5.2-web-r1/` beside the authoring scene.
- `changes.json`, `procedural-delta-measurement.json`, `lighting-probe-comparison.json`: measured scope of changes.
- `qa/latest-save-equivalence.json`: the latest save has the same evaluated export geometry, materials, prototypes and instances as the prepared source.
- `prepare.json`, `incremental-uv.json`, `qa/romea-uv-refinement.json`: source mapping and UV checks.
- `bake-progress.json`, `compression-verification.json`: per-atlas bake provenance and selected encoding.
- `qa/glb-verification.json`, `delivery-verification.json`: instance transforms, atlas rectangles, required names, KTX2 headers, byte counts, budgets and source checksum.
- Browser images and reports are stored under `previews/` and `qa/`.

The stadium's exterior location is subject to the website's existing distance/height fog. Diagnostic views without fog are used to inspect the asset; the production fog settings are unchanged.

## Installed validation results

- TypeScript: passed. Lightmap tests: 25/25. City asset contract: 22/22.
- Final asset review: ten views across desktop/mobile, with animation and interaction checks passing and no browser errors.
- Installed hashes: 45 files verified; existing user changes and previous assets retained. The original Blender source checksum is unchanged.
- Standard production build is blocked by the existing initial JavaScript budget. With the previous asset paths, current project code measures 1,636,376 bytes against 1,630,000; the new paths measure 1,636,382 bytes (six additional bytes). The budget and unrelated application code have not been changed.
- A separate diagnostic build under the delivery's `qa/diagnostic-dist/` downgrades only that measured budget error to a warning. It is not a passing production build or a deployment. Both browser profiles load the new model, all 20 selected maps and one canvas; measured draw calls are 110 desktop and 98 mobile in the initial city view.
- That diagnostic build does not run the blog preview generation stage, so its only browser error is the expected missing `/generated/blog-preview.json`. Publication hygiene ran during the diagnostic build; the normal post-build blog/publication commands were not reached after the production build failed.
- Evidence: `qa/web-typecheck.log`, `qa/web-tests.log`, `qa/web-asset-contract.log`, `qa/web-browser-review.json`, `qa/installed-verification.json`, `qa/build-diagnosis.json`, and `qa/production-smoke.json` (marked `diagnosticOnly`).
