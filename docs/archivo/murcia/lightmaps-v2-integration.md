# Selected city bake: v4 geometry, v2 lightmaps

The selected delivery replaces the active v7 asset paths. Previous public assets remain available for rollback; no source Blender file is moved or modified.

## Sources and payload

- Authoring source: `04_Assets/3D-assets/ciudad-de-murcia/murcia-v4-vertex-colors.blend`.
- Approved delivery: `04_Assets/3D-assets/ciudad-de-murcia/murcia-v4-lightmaps-v2/web/`.
- Delivery references: `LEEME.md`, `delivery-verification.json`, `compression-verification.json` and `web/attach-lightmaps.mjs` in that delivery.
- Shipped model: `public/models/murcia-v4-lightmaps-v2.glb` (5,454,976 bytes, original Draco meshes plus the uncompressed roof).
- Shipped manifest: `public/textures/murcia/lightmaps-v2/lightmaps.json`.
- Mobile: fourteen 1024px KTX2 atlases, **1,998,483 bytes total** (2 MB budget).
- Desktop: fourteen 2048px KTX2 atlases, **3,991,258 bytes total** (4 MB budget).
- Both profiles use the selected 512-sample bake. The model is identical between profiles. File sizes are download sizes; GPU residency depends on the transcoded format. The roof adds one atlas compared with the original delivery.
- [Nueva Condomina roof repair](stadium-roof-repair.md) records the added geometry, affected bakes and validation.

## Runtime contract

`loadUnifiedLightmaps.ts` adapts the delivery helper to the project's existing Three.js revision and shared KTX2 decoder pool. It retains vertex colours and authored albedo, uses unlit lightmapped materials to avoid adding scene lights a second time, and uses the manifest's intensity and safe mip limits. Decoding is sequential. Failure restores original geometry/materials and releases new resources.

`lightmap_atlas` identifies receivers. `instance_st_accessor` supplies one atlas rectangle per GPU instance. `runtime_name` retains exact Blender identifiers; the runtime continues using GLTFLoader's sanitized object names and the shared `findByAnyNameSpelling` resolver. The manifest's 136 required building names are validated before attachment.

Vértigo, Blog and Campus remain separate named meshes. `logo-V` and `logo-curva` keep their pivots and rotation animation and receive no static lightmap. `LED_Main`, `CAMPUS_SCREEN_Continuous`, `PARK_Water` and `rio` retain their website materials. Both display strips still use UV channel 1. The existing tower and campus palettes leave baked receivers intact.

Campus has twelve named architecture/water/screen meshes in this export. The three former `PARK_Trunks` / `PARK_Leaves_*` meshes are no longer standalone campus nodes: vegetation is GPU-instanced with the city. Legacy models still use the fifteen-name vocabulary; the selected asset check requires the twelve current named parts and preserves the instancing check.

`suelo-principal` is now a group of five baked ground meshes. `splitTerrainMeasurement.ts` creates an invisible eight-point bounds template under that group for the existing terrain collar/skirt API. It adds no rendered surface, does not cover the river, and does not receive pointer hits. Procedural architecture is split into four `Edificios_Procedurales__*` nodes; the asset check measures their full hierarchy with world transforms.

The river's new attribute seams duplicate position vertices. `computeRiverFrame` now welds a temporary position-only copy for bank measurement, without changing the rendered geometry. The selected river has 40 actual bank segments; the existing shader's capacity is increased from 32 to 48 so all 40 are supplied. This adds eight segment distance evaluations for river fragments compared with the previous truncated limit. Water colours and animation settings are unchanged.

These details supersede the v7-specific names and two-manifest assumptions in the historical export contract. The old loader remains available for legacy configurations. The active paths are defined together in `src/experiences/murcia/config/murciaConfig.ts`.

## Original delivery verification (before the roof repair)

Run `npm run typecheck`, the focused lightmap/terrain/palette tests, and `npm run build`. `checks/city-asset.ts` reads the active model path from configuration, so the build contract checks the file actually used by the site. Browser verification must check both profile requests, baked materials after landmark attachment, the animated V, both display strips, and Campus/Blog interaction. Mobile browser emulation does not replace a physical Safari/Android check.

### Results — 2026-09-15

- Full build gate: 126 test files / 1,845 tests, architecture and all project harnesses passed. Full asset validation: 22/22 checks.
- After the river compatibility adjustment: typecheck, 11 focused test files / 71 tests, Vite production compilation and all three blog preview variants passed.
- SHA-256 comparison: all 28 shipped files (model, manifest and 26 KTX2 files) are identical to the selected delivery in both `public/` and `dist/`.
- Edge production-build verification at 1440×1000 and touch-emulated 390×844: 13 correct atlases per profile; all 220 receivers retain baked materials after website landmark setup; 12 instanced groups / 1,335 instances retain their per-instance atlas rectangles.
- Named building meshes remain 13 Vértigo / 110 Blog / 12 Campus. Both display strips use shader materials with the selected UV spanning [0,1]. The V rotates independently. Campus opens, and a real click on the framed Blog display opens `/blog`; browser Back returns to the city in both profiles.
- No console errors or shader compile errors in either profile. Existing brand-image padding warnings remain. The selected model also reports three prototypes with constant base UVs and double-sided surfaces; lightmap UVs are present on every receiver. These geometry/material properties were preserved.
- Browser inspection adds an observation-only reference at the existing campus setup call; it does not replace application behavior. For the Blog pointer test the camera is framed in front of its display. Physical mobile devices have not been tested.

Detailed local evidence and screenshots: `04_Assets/3D-assets/ciudad-de-murcia/.integration-new-lightmaps/` (`build.log`, `final-checks.log`, `asset-integrity.json`, `browser-report.json`, desktop/mobile PNGs). The local preview is served at `http://127.0.0.1:4173/` while the preview process is running.
