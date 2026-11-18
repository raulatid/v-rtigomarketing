# Murcia v5.2-r3 web delivery

A lightmap-only revision of [v5.2-r2](lightmaps-v5.2-r2-integration.md). Same scene, same bake, same geometry: the GLB is r2's, byte for byte, renamed because a delivery's two halves share one version name. The only change is `rooftop-parapets`, re-encoded from UASTC to ETC1S.

## What changed

- Model: `public/models/murcia-v5.2-lightmaps-r3.glb` (3,673,964 bytes), identical to r2.
- Lightmaps: `public/textures/murcia/lightmaps-v5.2-r3/`. Every file except the two parapet atlases and `lightmaps.json` is identical to r2.
- `rooftop-parapets` is encoded with ETC1S q192 at both sizes, one mip level as before. The command is `compress.py`'s own ETC1S one, run from the r1 masters:

| Variant | r2 (UASTC) | r3 (ETC1S q192) | Masked PSNR r2 → r3 |
|---|---|---|---|
| 1024 (mobile) | 313,443 bytes | 89,803 bytes | 37.26 → 31.71 dB |
| 2048 (desktop) | 979,827 bytes | 287,074 bytes | 39.66 → 35.67 dB |

- Selected totals: mobile 4,489,081 → 4,265,441 bytes, desktop 6,488,961 → 5,796,208 bytes. Budgets (4.5 / 6.5 MB) unchanged.
- `landmark-cathedral` stays UASTC: in ETC1S its gradients and island edges visibly lost quality (test of 2026-11-17).

## Verification at delivery

- The PSNR uses `compress.py`'s metric (texels where any master channel exceeds 0.01) and reproduces its recorded UASTC values.
- In the scene, ETC1S and UASTC parapets could not be told apart at the camera's closest approach. This was checked on desktop at DSF 1 and 2 and at 390×844 at DSF 2 and 3. An 8× amplified difference shows only thin lines along the parapet edges. The shipped files are byte-identical to the ones checked.

## Source

- Local delivery directory: `murcia-v5.2-web-r3/` beside the authoring scene, with `make-r3.cjs`, `LEEME.md` and the decoded PNGs in `qa/`.
- Inputs: the published r2 lightmaps and GLB, and `murcia-v5.2-web-r1/masters/rooftop-parapets-{1024,2048}.png`.
