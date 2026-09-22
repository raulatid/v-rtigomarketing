# Nueva Condomina roof repair

Historical v4 repair only. The current v5.1 r3 delivery uses the author's roof
after its Blender animation was removed. Do not apply the placement adjustment
below to that source; see [the r3 integration](lightmaps-v5.1-r3-integration.md).

## Cause

The original delivery excluded `estadio-techo`: its Blender position was
`(0, 0, 25.79767)`, away from the stadium. It also retained animation data that
restored that transform during export.

Authoring sources, relative to `04_Assets/3D-assets/ciudad-de-murcia/`:

- `color-phase4d/README.md`: records the roof as awaiting placement and excluded.
- `city-export-policy.json`: lists `estadio-techo` in `pending_placement_review`.
- `murcia-v4-lightmaps/murcia-v4-lightmaps.blend`: prepared lighting scene,
  original roof geometry and stadium part transforms.
- `murcia-v4-lightmaps-v2/prepare.json` and `bake.py`: selected UV allocation,
  receivers and bake settings.

## Repair

[The repair script](../../scripts/repair-stadium-roof.py) copies the original
roof, clears the copy's animation and aligns it with `estadio-base`. It retains
the roof's original scale because its dimensions already include the overhang.
Its Blender position becomes `(-267.76941, -110.01694, 9.01128)`, with the
stadium's rotation. The lowest underside matches the top of the support
pillars at `9.39132`.

The roof uses the upper band's vertex color, two UV channels and its own
`stadium-roof` atlas. `static-NW`, `ground-NW`, `ground-NE` and `ground-Outer`
are also rebaked at 512 samples. The stadium crosses the ground quadrant
boundary, so both northern quadrants need updated shadows.

The script appends only the new mesh to the GLB and verifies that all existing
nodes, meshes, accessors, bufferViews and binary bytes remain intact. The repair
adds no runtime positioning or animation. Authoring `.blend` files are never
overwritten.

## Reproduction

Run Blender 5.1 in background mode with `--disable-autoexec`, open the prepared
file above and pass `--python scripts/repair-stadium-roof.py`. After `--`, the
script accepts:

- `--delivery`: the original `murcia-v4-lightmaps-v2` delivery directory.
- `--project`: this repository's root directory.
- `--base-glb`: the original roofless GLB (`web/murcia-city-draco.glb`).
- `--out`: a staging directory, such as `out/stadium-roof`.
- `--resume`: reuse completed bakes from that same staging directory.

KTX-Software is required for texture compression and validation. All outputs,
intermediate PNGs and the review render are written to `--out`. Before copying
the model, KTX2 files and `lightmaps.json` into `public`, check the manifest
budgets and inspect `stadium-after.png`.

## Validation

The asset contract checks for exactly one roof, alignment, pillar contact,
overhang, vertex color and both UV channels. Run `npm run check:asset:contract`.
For a staged GLB, use
`npm run check:asset -- out/stadium-roof/murcia-v4-lightmaps-v2.glb --contract-only`.

The repaired GLB is 5,454,976 bytes (+20,976). Its 12 instanced groups and 1,335
instances are unchanged. The 14 lightmap atlases total 1,998,483 bytes on mobile
and 3,991,258 bytes on desktop, within the existing 2 MB / 4 MB limits.

To accommodate the roof, ETC1S quality is reallocated within the affected maps:
`static-NW` uses q128/q48 (mobile/desktop), `ground-NW` uses q128/q48,
`ground-NE` uses q128/q24, and the roof uses q48/q8. Resolution, bake sample
count and mip limits are unchanged. Atlas variants outside the affected area
are preserved.

Validation for this repair: a focused Blender render, the asset contract,
TypeScript checks, the lightmap tests (including shipped texture metadata and
budgets), KTX validation and publication metadata scanning. No full E2E suite
was run. Local visual evidence: `out/stadium-roof/stadium-after.png`.
