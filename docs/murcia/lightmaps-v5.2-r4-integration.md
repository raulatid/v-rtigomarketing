# Murcia v5.2-r4 web delivery

A lightmap-only revision of [v5.2-r3](lightmaps-v5.2-r3-integration.md). Same scene, same bake, same geometry: the GLB is r3's, byte for byte, renamed because a delivery's two halves share one version name. Two changes: both profiles select every atlas at 1024, and the cathedral's 2048 variant moves from UASTC to ETC1S.

## What changed

- Model: `public/models/murcia-v5.2-lightmaps-r4.glb` (3,673,964 bytes), identical to r3.
- Lightmaps: `public/textures/murcia/lightmaps-v5.2-r4/`. Every file except `landmark-cathedral-2048.ktx2` and `lightmaps.json` is identical to r3.
- `profiles.desktop` and `profiles.mobile` set all 20 atlases to 1024. Selected totals: desktop 5,796,208 → 1,837,076 bytes, mobile 4,265,441 → 1,837,076. Budgets (4.5 / 6.5 MB) unchanged.
- `landmark-cathedral-2048` is encoded with ETC1S q192, two mip levels, each from its own r1 master (`compress.py`'s ETC1S command plus `--mipmap --levels 2`): 1,386,832 → 398,653 bytes, masked PSNR 41.19 → 37.41 dB. No profile loads it; it stays because `parseUnifiedManifest` requires both variants per atlas, and in the codec that was reviewed in the scene.
- The 2048 variants of the other atlases stay as they were, for the same reason. Removing them would change the manifest contract.

## Verification at delivery

- Review in the scene by the user on 2026-11-18, through a temporary dev-only prototype (removed): first the ETC1S cathedral at 2048, then every atlas at 1024, on desktop and in mobile emulation at 390×844. No difference was seen against r3, including at the camera's closest approach.
- The 2026-11-17 finding that ETC1S showed in the cathedral's gradients and island edges was a texture comparison; it did not hold in the scene.
- In mobile emulation, the r4 profile selection was confirmed from the network log: no 2048 atlas was requested.
- The cathedral file shipped is byte-identical to the one reviewed.

## Source

- Local delivery directory: `murcia-v5.2-web-r4/` beside the authoring scene, with `make-r4.cjs`, `LEEME.md` and the decoded PNG in `qa/`.
- Inputs: the published r3 lightmaps and GLB, and `murcia-v5.2-web-r1/masters/landmark-cathedral-{1024,2048}.png`.
