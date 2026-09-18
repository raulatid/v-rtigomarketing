# Murcia v5.1 integration

The active city is the exact v5.1 delivery, with the updated building positions,
window instances, roof colours, bullring and Vértigo glass. Previous public assets
remain available for rollback. No Blender source or delivery asset was changed.

## Active files

- Model: `public/models/murcia-v5.1-lightmaps.glb` — 5,797,464 bytes.
- Manifest: `public/textures/murcia/lightmaps-v5.1/lightmaps.json`.
- Mobile: 15 KTX2 atlases at 1024 px, 1,993,111 bytes total (2 MB limit).
- Desktop: 15 KTX2 atlases at 2048 px, 3,985,388 bytes total (4 MB limit).
- Configuration: `src/experiences/murcia/config/murciaConfig.ts`.

The model and lightmaps are versioned together. The model is separate from the
texture download budgets. All 32 copied files match the delivery by SHA-256.

## Runtime changes

The existing Three.js r174 loader and decoder pool are retained. Multi-material
glTF nodes become groups; primitive children now inherit the lightmap atlas and
building/dynamic tags. Names and geometry remain unchanged.

The opaque lobby primitive receives its lightmap. Its transparent primitive
retains the authored PBR material, opacity 0.24 and roughness 0.24, with depth
writes disabled and no opaque lightmap. Cloned materials are restored and disposed
through the existing resource lifecycle.

The v5.1 GLB does not contain `estadio-techo`. The author explicitly selected this
delivery without importing the previous Nueva Condomina repair on 2026-09-18.
The asset contract records that choice for this version; the previous placement
checks and legacy atlas test remain for the repaired v4 model. This does not
claim that the roof is present or that animation removal alone restored it.

## Verification

- TypeScript: passed.
- Focused lightmap and campus/tower material tests: 24 tests across 6 files passed
  (23 initially, followed by the updated 5-test manifest suite).
- Complete active GLB contract: 23/23 checks passed.
- Edge development-server verification: both profiles requested their 15 atlases,
  with no console errors. All 235 tagged receiver meshes use their expected baked
  or transparent material; 24 GPU instance groups retain 6,057 instances and their
  atlas rectangles. Glass opacity/roughness remain 0.24.
- Animated V, Campus entry, Blog display click and browser Back passed in both
  profiles. City and Campus screenshots were visually reviewed.
- The mobile profile is browser emulation, not a physical phone test.

**Production build remains blocked by an existing JavaScript budget overrun.**
The unchanged HEAD code produces 1,623,257 bytes against a 1,612,000-byte limit
(11,257 bytes over). With this integration it produces 1,623,572 bytes
(11,572 bytes over; this change adds 315 bytes). Baseline verification used the
original configuration and loader in memory, without reverting project files.
The budget was not raised or bypassed. Browser verification therefore used the
development server, not a successful new production build.

Existing geometry diagnostics remain: three prototype base UV sets are constant
and materials are double-sided. Lightmap UVs are present on all baked receivers.

## Sources and local evidence

Source delivery, relative to the assets workspace:
`04_Assets/3D-assets/ciudad-de-murcia/murcia-v5.1-lightmaps/`.
Its `LEEME.md`, `delivery-verification.json`, `web/lightmaps.json` and
`web/attach-lightmaps.mjs` define the asset and material contract.

Evidence in that same workspace: `.integration-v5.1/asset-integrity.json`,
`browser-report.json`, `browser-check.log`, `baseline-build.log`, and the
desktop/mobile screenshots. The development preview was served at
`http://127.0.0.1:4175/`.
