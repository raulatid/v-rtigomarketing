# Murcia v5.2-r2 web delivery

A geometry-only re-encode of [v5.2-r1](lightmaps-v5.2-r1-integration.md). Same scene, same bake, same atlases: every KTX2 and `lightmaps.json` is byte-identical to r1; the folder is renamed only because a delivery's two halves share one version name.

## What changed

- Model: `public/models/murcia-v5.2-lightmaps-r2.glb` (3,673,964 bytes, Draco), down from 8,730,832.
- Lightmaps: `public/textures/murcia/lightmaps-v5.2-r2/`, unchanged contents. Mobile 4,489,081 bytes, desktop 6,488,961 bytes, as in r1.
- Every Draco primitive was re-encoded with three's own `draco_encoder.js` (three 0.174.0) at the export's quantization (position 18, normal 12, texcoord 16; `COLOR_0` uint16 unquantized), edgebreaker, speed 4/4. Blender 5.1's level-6 output was about 1.8 times larger for the same data: 7,284,567 → 4,054,993 bytes with nothing removed.
- The 92 baked opaque primitives drop `NORMAL` and `TEXCOORD_2`, and `TEXCOORD_0` is collapsed to (0,0). They are drawn with an unlit material that reads only `uv1`. `TEXCOORD_0` stays because glTF requires `TEXCOORD_n` indices to start at 0. Draco total: 2,236,087 bytes. 111 orphaned accessors were removed and references remapped.
- The lobby glass (`MURCIA_Vertigo_Base_Cristal`, BLEND) and the six unbaked nodes (`LED_Main`, `rio`, `logo-V`, `logo-curva`, `CAMPUS_SCREEN_Continuous`, `PARK_Water`) keep every attribute.
- Instances, node names, extras, materials and the embedded trim image are unchanged.

## Verification at delivery

- Each primitive was decoded again and compared triangle by triangle with the r1 source within quantization tolerance. All visible triangles match. Draco discarded 312 zero-area triangles, which draw nothing.
- The re-encode is deterministic: the same input gives the same file (SHA-256 `867eb2f2f5f84592de32f3058ff2dcdbdda6d70c9f69523eec9f6da80ff79f94`).
- Decoding all primitives in Node with three's decoder: about 680 ms for r1, about 330 ms for r2.
- The decision behind the step is in [compression and decoders](../decisiones/build/compresion-y-decodificadores.md). The attribute contract is in [GLB contract](../decisiones/build/contrato-del-glb.md), §1.

## Source

- Input: `murcia-v5.2-web-r1/web/murcia-city-draco.glb`, identical to the published r1 GLB (SHA-256 `944cc5dce081873a8e337d7b52abacc4a15988a62004496d9871599a223a497a`).
- Local delivery directory: `murcia-v5.2-web-r2/` beside the authoring scene, with `recode.cjs`, `recode-report.json` and `LEEME.md`.
