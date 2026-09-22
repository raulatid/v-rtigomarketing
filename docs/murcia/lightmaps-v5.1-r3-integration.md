# Murcia v5.1 revision 3

This delivery updates the river and outer terrain, the rotated JMC buildings,
one changed peripheral building, and the Nueva Condomina roof. The application
selects the versioned r3 GLB and lightmap directory together. Earlier deliveries
remain available.

- Model: `public/models/murcia-v5.1-lightmaps-r3.glb` (5,800,012 bytes).
- Lightmaps: `public/textures/murcia/lightmaps-v5.1-r3/`.
- Mobile total: **1,993,861 bytes**; desktop total: **3,995,942 bytes**.

## Roof

The current `murcia-v5.1.blend` has no roof animation, drivers, constraints or
modifiers. Its transform is stable at frames 1, 54 and 250. The old preparation
script still excluded `estadio-techo`, and the web asset check required that
absence. Both assumptions are replaced for r3.

The new preparation includes the authored roof without changing its placement.
Its Blender world translation is `(-410.423157, -118.291397, 8.831154)`.
The GLB conversion is `(x, y, z) -> (x, z, -y)`. The asset check verifies the
source bounds, vertex colors, both UV channels and `static-NW` atlas assignment.
Static export explicitly disables animation clips. Runtime logo animation is
still independent of those clips.

The roof has no assigned material or vertex colors in the source. Preparation
gives it an explicit default Principled material and white vertex colors so its
surface can participate in baking and the existing runtime material path.
It does not use the historical repair's color or centering/pillar alignment.
The [v4 repair](stadium-roof-repair.md) is retained only as historical tooling.

## Selective bake

| Action | Atlases |
| --- | --- |
| Rebake at 512 samples | `static-NW`, `static-NE`, `outer-buildings`, `ground-Outer`, `ground-NW`, `instances-0`, `instances-1` |
| Reuse byte for byte | `ground-NE`, `ground-SE`, `ground-SW`, `instances-2`, `landmark-campus`, `landmark-vertigo-blog`, `static-SE`, `static-SW` |
| Repack UVs | `static-NW` (new receiver), `ground-Outer` (changed topology) |

The comparison uses the frozen r2 prepared scene, not newly evaluated procedural
hashes alone. Ground partition triangles and vertex colors were compared against
the current authoring scene. Only the outer terrain/promenade partitions changed;
the four procedural building partitions still match. The 6,047 instance
transforms, prototypes and lightmap rectangles are unchanged. Nearby instances
around the stadium and JMC belong to atlases 0 and 1, which are rebaked to update
received lighting. Reuse is a spatial dependency decision; no new visual review
was performed.

All updated city geometry stays present as lighting blockers and indirect-light
contributors while selected receivers are baked. The bake remains diffuse
direct plus indirect light without albedo, with the established HIP Cycles
settings. Radiance scales are recalculated. The other 13 UV atlas layouts
(185 receiver meshes) are preserved exactly.

Changed maps are compressed into 1024 mobile and 2048 desktop variants, within
the existing 2,000,000 / 4,000,000-byte total budgets. Existing mip limits remain:
one mobile level, at most two desktop levels, one for instance atlases.
Compression candidates are compared numerically and selected within those
budgets; unchanged maps retain their original bytes and metadata.

## Reproduction and provenance

Run [the selective pipeline](../../scripts/rebake-city-lightmaps.py) with Blender
5.1.2 in background mode, factory startup, automatic script execution disabled,
and `--python-exit-code 1`. Pass `--source`, `--baseline`, `--out`, and `--stage`
after Blender's `--` separator. Stages are `prepare`, `bake`, `compress`, `export`,
`verify`, `finalize`. Export and geometry verification do not depend on baking.
Preparation must run once into a new directory; later stages verify source and
prepared-scene hashes before resuming. Baking and compression also fingerprint
their intermediate inputs. This script accepts only the assessed source and r2
manifest hashes: future authoring changes need a fresh dependency assessment.

- Source: `04_Assets/3D-assets/ciudad-de-murcia/murcia-v5.1.blend`.
- Source SHA-256: `ffbc85f3632b3595686a5c427933ead726ff38a0c5a52a8a573d70e2e40a2783`.
- Baseline: `murcia-v5.1-lightmaps-r2`, including `assets_common.py`, `export.py`,
  `finalize.py`, `prepare.json` and its frozen preparation blend.
- Working delivery: `.cache/murcia-v5.1-lightmaps-r3/`; contains prepared and
  packed final Blender files, EXR/PNG masters, the GLB, KTX2 files and reports.
- Archived delivery: `04_Assets/3D-assets/ciudad-de-murcia/murcia-v5.1-lightmaps-r3/`.
  All 299 copied files were verified against `delivery-files.json` by SHA-256.
- Evidence: `revision.json`, `geometry-verification.json`,
  `partition-verification.json`, `bake-progress.json`,
  `compression-verification.json`, `export-verification.json`, and
  `delivery-verification.json` in that delivery.

The source Blender and baseline delivery are never saved or overwritten.

## Validation

The independent geometry check verifies changed object transforms, triangle
counts, exported bounds and exact source roof vertices. It also compares all
instance transforms and lightmap rectangles with the baseline export. The
partition comparison verifies current ground and procedural meshes, including
their vertex colors. The shipped GLB passes all 26 asset checks.

All 32 integrated web files match the delivery by SHA-256. The 13 focused
lightmap tests pass, including exact byte reuse of the eight unaffected atlases.
`npm run build` passes with the new active assets: TypeScript, the full test
suite, repository harnesses, Vite, blog preview generation and final publication
verification (154 test files, 2,065 passing tests). The build needed network access to read the configured Sanity
content source. No browser visual review or e2e suite was run.
