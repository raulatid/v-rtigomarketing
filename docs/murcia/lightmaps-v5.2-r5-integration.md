# Murcia v5.2-r5 web delivery

A geometry-only re-encode of [v5.2-r4](lightmaps-v5.2-r4-integration.md). Same scene, same bake, same atlases: every KTX2 and `lightmaps.json` is byte-identical to r4; the folder is renamed only because a delivery's two halves share one version name.

## What changed

- Model: `public/models/murcia-v5.2-lightmaps-r5.glb`, 3,673,964 → 2,615,876 bytes (−28.8 %). SHA-256 `a9719dc042661d0551d1fedd1f18cbb1157a2f28c0cc2329dc6117984f088a7c`.
- Lightmaps: `public/textures/murcia/lightmaps-v5.2-r5/`, r4's folder renamed. Selected bytes are unchanged (1,837,076 on both profiles).
- **Instance attributes** (`EXT_mesh_gpu_instancing`, 23,303 instances in 19 groups):
  - `ROTATION`: float → normalized int16. Every rotation was Y-only.
  - `SCALE`: omitted on the 21,897 instances whose scale is 1 within 1e-6 (windows and the Belluga furniture). Trees and the river wall keep it.
  - `_LIGHTMAP_ST`: float → normalized uint16. Every value is in [0, 1].
  - `TRANSLATION`: stays float32, as the extension requires.
  - Identical TRS accessors are shared (tree types 02 and 03). ST accessors are not, because `campusTrees` compacts that array in place.
- **Draco** re-encoded with three 0.174's `draco_encoder.js`, edgebreaker, speed 4/4, with bits chosen per primitive:
  - position: the fewest bits that keep the world step ≤ 4.8 mm, which was already r4's coarsest step (`rio`, the outer ground);
  - lightmap UV: the fewest bits that keep the error ≤ 1/16 texel at 1024;
  - the 42 primitives that share vertices with another primitive, and the 7 unbaked ones, stay at 18 bits position and 16 bits UV, so no seam can open.
- **Runtime:** no code change. three's `GLTFMeshGpuInstancing` denormalizes normalized accessors and leaves a missing `SCALE` at 1. `ownGeometryWithSt` (`loadUnifiedLightmaps.ts`) keeps the ST array type and its `normalized` flag. `murciaConfig` and the stadium-roof name lists in `checks/city-asset.ts` name r5.

## Verification at delivery

- **Every primitive decoded again and matched against r4:**
  - 371,720 triangles before and after, all matched; 4 needed the tolerance pass because vertices merged.
  - Worst position error: 3.8 mm (`NuevaCondomina_Stands`).
  - Worst `uv1` error: 0.062 texel at 1024.
  - Near-coincident vertex pairs across primitives: 9,775, with a maximum separation growth of 0.000 mm.
  - Instances: worst corner displacement 0.23 mm, rotation 0.0024°, ST 0.008 texel.
- **Decode time:** WASM decode in Node is 176 ms, against 182 ms for r4.
- **Checks:** `npm run check:asset` passes 27/27.
- **In the scene:** production build in Chrome with the GPU, 1600×900. Rest pose and the closest zoom over the tower and the cathedral, compared with r4 in 2× crops: no visible difference.
  - The difference image shows sub-pixel edge noise and the moving traffic.
  - SSIM of r5 against the same GLB with 14-bit UV is 0.9962. Two captures of one build give 0.9955.
- **Rejected:**
  - int8 rotation: 0.55° of error and a 1 % scale error, because three does not renormalize.
  - Position bits that ignore seams: gaps grew by up to 4.8 mm.
  - 12-bit UV.
  - Draco speed 0: it saves another 50 KB but makes decoding 42 % slower.

## Source

- **Local delivery directory:** `murcia-v5.2-web-r5/`, beside the authoring scene. It holds `tools/` (`build.cjs`, `verify.cjs`, the keep-list `seams.json`, three's Draco encoder and decoder) and `LEEME.md` with the exact command.
- **Input:** the r4 GLB (`git show 91182a6:public/models/murcia-v5.2-lightmaps-r4.glb`, SHA-256 `867eb2f2…`).
- **Reproduced byte for byte** from that directory on 2026-11-18.
