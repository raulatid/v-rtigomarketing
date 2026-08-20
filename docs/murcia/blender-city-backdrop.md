# Blender: the city backdrop

The non-navigable filler city that surrounds the navigable Murcia model, so the horizon
reads as a larger city. Companion to `blender-export-contract.md`, which governs
`city-prototype.glb`; this file governs `city-backdrop.glb` only.

Built 2026-08-19 via the Blender MCP. **The GLB exists but nothing loads it yet** — wiring
it into `MurciaExperience` is not done.

---

## 1. What ships

| | |
|---|---|
| Asset | `public/models/city-backdrop.glb` — **206,604 B** |
| Source | `02_Identidad de Marca/Blender/assets/city-backdrop.blend` — 5,375,285 B, **never ships** |
| Meshes / draw calls | 36 (6 shapes × 6 tones) |
| Materials / images / textures | **1 / 0 / 0** |
| Instances | **3,146** via `EXT_mesh_gpu_instancing` |
| Unique triangles | 630 (~17.5 per shape) |
| Realized-equivalent triangles | ~55,000 |
| Extent | hollow ring, radius ~220 m to ~1,104 m about the plate centre |
| Determinism | layout `SEED = 20260819`, tone assignment `SEED = 48211` |

The `.blend` is ~5 MB because it holds 3,146 baked object datablocks. This is the working
file. It is not the asset, and it is not on any download path. *(Recorded because it was
misread as the asset size once.)*

### Geometry, in Blender coordinates

Plate centre `(-262.6, -300.0)`. Exclusion rect = plate bounds + 40 m margin:
X `[-478.2, -47.0]`, Y `[-520.0, -80.0]`. Nothing is generated inside it, verified as zero
violations. Blender ↔ three is 1:1 with `three.z = -blender.y`; 1 unit = 1 m.

Per building: footprint 8–26 m, height 6–40 m, rotation snapped to 90° steps, mean height
falling outward. Density falls off with distance so the outer band is sparse.

---

## 2. Non-navigability requires no mechanism

`DistrictInteraction` raycasts an explicit allowlist, non-recursively:

```ts
this.pickables = [...deps.district.meshes, this.highlight.proxy];
```

and `resolveDistrict` only ever matches `userData.district` tags or names listed in
`cityDistrictBindings.ts`. **Untagged, unlisted geometry is unreachable by construction.**

The backdrop therefore carries no `district` custom property and appears in no binding.
Do not invent an opt-out flag for it — it would be dead code.

---

## 3. The export trap — read before re-exporting

Two exports produced empty files before this was understood. Blender's glTF exporter emits
`EXT_mesh_gpu_instancing` **only for children of an Empty** — the option's own description
says *"Limited to children of a given Empty."*

**It does not export Geometry Nodes instances.** A GN modifier whose output is instances
evaluates to a mesh with zero primitives. The exporter logs
`Mesh 'backdrop_points' has no primitives and will be omitted` and writes a **~184-byte**
GLB containing nothing but the root node:

```json
"nodes": [ { "name": "CityBackdropRoot" } ]
```

The fix, and how this asset is structured: GN instances are **baked into 3,146 real objects
that share the 36 mesh datablocks**, all parented to one Empty, `CityBackdropRoot`.

### Required export settings

| Setting | Value | Why |
|---|---|---|
| Format | GLB | |
| Scene Graph → **GPU Instances** | **on** | without it the instances vanish entirely |
| Include → **Visible Objects** | **on** | excludes the hidden `CityBackdrop` GN generator |
| Mesh → Apply Modifiers | on | |
| Include → Custom Properties | on | consistency with the city export |
| `+Y up` | on | |
| Lights / Cameras | off | the shell owns the light rig |
| Draco | off | payload is instance transforms, not vertex data |

Exporting with **Selected Objects** and only the root Empty selected is what yields the
184-byte file.

> Worth checking whether `city-prototype.glb`'s 6,602 instances survive a re-export for the
> same reason. If those buildings are GN instances, a re-export with today's exporter may
> silently drop or realize them.

---

## 4. Colour

### There is a material; there are no textures

Colour is `COLOR_0` vertex colours baked per mesh, read by a Principled BSDF with no image
nodes. That *is* the material. Nothing is sampled, which is why the asset is small and why
adding tones costs no texture budget.

`EXT_mesh_gpu_instancing` carries only **translation, rotation, scale** per instance — there
is no per-instance colour slot. **A tone must live on a mesh**, so tones multiply meshes:
6 shapes × 6 tones = 36. Each further tone is +6 meshes, roughly +9 KB and +6 draw calls.

### Colours are solved backwards, never eyeballed

`@react-three/fiber@9.6.1` applies tone mapping itself — `SceneCanvas.tsx` passes no `flat`
and no `linear`, so R3F's configure step sets `ACESFilmicToneMapping` + `SRGBColorSpace`.
Murcia's `'direct'` route renders to a null target, so three applies ACES and the sRGB
encode in-shader. Authored values are **not** what appears on screen.

The authoring method is to model the runtime path and invert it:

```
COLOR_0 (linear) → × irradiance from the rig → ACES RRT/ODT fit → sRGB encode → screen
```

Rig, from `murciaConfig.ts` — hemisphere `sky #ffffff / ground #556070 @ 1.4`, directional
`#ffffff @ 1.6` from `[60, 100, 40]`, background `#9fb4c7`, no shadows. Feed the solver a
target on-screen colour; it returns the `COLOR_0` to author. It round-trips exactly.

**Blender's viewport is not evidence.** It has no ACES; previews were taken under `Standard`
view transform and run brighter and more saturated than the browser will.

### Walls vs roofs — the reason flat tones read white

Roofs face the sky hemisphere and receive **2.34×** the irradiance of walls (2.70 vs 1.15).
The runtime camera sits at **88 m**, above most 6–40 m buildings, so roofs dominate the
view. A wall-calibrated tone rendered `#dbd7c7` on a roof against `#aea892` on a wall.

Roof faces (`normal.z > 0.7`) therefore carry their own darker clay-tile tone, solved
against roof irradiance. This is also architecturally right — Murcian roofs are darker tile
than the facades.

### The palette

Six facade tones, solved for the wall (mid-orientation) irradiance. Targets are **on-screen**
values; `COLOR_0` is what is authored.

| # | Tone | Target | `COLOR_0` (linear) | Instances |
|---|---|---|---|---|
| 1 | cal / whitewash | `#c4bcab` | `1.34871, 1.14694, 0.82370` | 730 |
| 2 | cream / albero | `#bcae90` | `1.17457, 0.91891, 0.54642` | 667 |
| 3 | pale ochre | `#b09a6e` | `0.97487, 0.68908, 0.32914` | 579 |
| 4 | warm sand | `#a89478` | `0.86966, 0.63506, 0.39832` | 540 |
| 5 | salmon / rosa | `#a87f6a` | `0.87219, 0.47209, 0.32834` | 370 |
| 6 | brick / almagra | `#8f6650` | `0.62791, 0.33376, 0.21847` | 260 |

Roof tones, solved for roof irradiance, cycled across the six:

```
r1  #9c7355 -> 0.31761, 0.17426, 0.10361
r2  #8a6047 -> 0.25202, 0.13261, 0.08220
r3  #a37d5c -> 0.34817, 0.20018, 0.11518
```

Weighted `24/22/18/16/12/8` so light tones dominate, as Mediterranean cities do. Luminance
spans Y 0.506 → 0.159, a 3.2× range.

> **Tones 1 and 2 exceed albedo 1.0.** The rig is too dim to reach whitewash from a physical
> albedo. This is legal because `COLOR_0` exports as `VEC3/FLOAT`, **non-normalized**, and
> `baseColorFactor` is absent so it defaults to white — meaning `COLOR_0` *is* the albedo.
> If anyone later quantizes `COLOR_0` to normalized byte/short, these clamp to 1.0 and the
> two lightest tones go muddy.

### Other authoring details

- Colour attribute is **`FLOAT_COLOR`, `CORNER` domain, named `Col`**. Not `BYTE_COLOR` —
  that is sRGB-encoded 8-bit, adds a conversion to reason about, and bands across the
  gradient.
- A vertical gradient darkens walls to **0.82×** at the base, easing to full tone by half
  height (`smoothstep(0, 0.5, z)`). Fakes street-level occlusion. Free.
- The material sets `use_backface_culling = True`, which exports as `doubleSided: false`.
  It shipped as `true` once, doubling fragment work on closed boxes.

### Re-deriving the palette from the real trim sheet

There is no ground-truth colour in the project yet, confirmed by decoding both candidates:

- `04_Assets/trim-sheet-murcia.png` — 2048², but **exactly 8 distinct colours** in eight
  256 px bands of saturated flag colours at 12.5% each. It is a **UV calibration chart**
  validating the §6.3 band layout, not architectural colour.
- `04_Assets/satellite_Baked.png` — flat greys, white, and `#002ecd`, the same blue as the
  trim sheet's blue band. Also debug output.

The palette is therefore an interim Murcia architecture reference. When the real trim sheet
lands, swap the six literal targets for a median-cut of its **facade band** (per contract
§6.3 the bands stack in V with facade at the bottom), re-run the solver and the bake. Both
seeds are fixed, so the identical city returns with new tones.

---

## 5. Rebuilding

Order matters; each step assumes the previous.

1. **Shapes** — six meshes in `backdrop_sources`, built with `bmesh`: unit-footprint boxes,
   origin at base centre, **no bottom face**, each with one silhouette break (L-notch,
   corner chamfer, stepped setback). 10–28 triangles each.
2. **Layout** — Python, not Geometry Nodes, so it is deterministic and inspectable. Grid at
   24 m over the ring, drop points inside the exclusion rect, density falloff by distance,
   jitter ±7 m, re-test the rect after jitter. Emits position, variant, rotation, scale.
3. **Tones** — 6 copies of each shape, painted per §4.
4. **Bake** — 3,146 real objects sharing the 36 mesh datablocks, parented to
   `CityBackdropRoot`. This is what makes the exporter emit instancing.
5. **Export** — settings in §3.

A small Geometry Nodes group `Backdrop_City` also exists and drives the object
`CityBackdrop` (hidden). It was the original scatter path and is kept for reference.
**Its sources point only at tone-1 meshes**, so regenerating through it would produce a
single-tone city. The bake path is authoritative.

---

## 6. Verification

Parse the GLB JSON chunk directly and assert:

| Assertion | Expected |
|---|---|
| `extensionsUsed` contains `EXT_mesh_gpu_instancing` | yes |
| Total instances across instanced nodes | **3,146** |
| `meshes.length` | 36 |
| `materials.length` / `images.length` | 1 / 0 |
| `COLOR_0` on every primitive | 36 / 36 |
| `COLOR_0` accessor | `VEC3` / `FLOAT`, `normalized: false` |
| Distinct brightest-tone values across meshes | exactly 6, each on 6 meshes |
| `KHR_lights_punctual` | absent |
| Unique triangles | 630 |

**`npm run check:asset` cannot be pointed at this asset.** It asserts `TEXCOORD_0` on every
primitive; the backdrop is deliberately vertex-coloured with no UVs and would fail by
design. It is scoped to `city-prototype.glb`. A separate `checks/city-backdrop.ts` using the
shared helpers in `checks/lib/assert.ts` would be the right home for the table above.

Blender screenshots are indicative only (§4). The honest check is the browser, once the
asset is wired in.

---

## 7. Open

- **Not wired in.** Nothing loads `city-backdrop.glb`. When it is added, keep its root out
  of `NavigableArea.setPlateFromObject` and out of the `Box3.setFromObject(loaded.root)`
  bounds derivation — `PROJECT_MEMORY` records that model bounds coincide with the plate
  exactly, and geometry 1,100 m out would silently expand `contentBounds`, the navigation
  pipeline, and `check:footprint`. Keeping it a separate root preserves every existing
  navigation invariant with no code change.
- **773 instances (24.6%) sit beyond the terrain skirt's ~876 m ground reach** and will
  appear to float. Options: clip the ring to 876 m (drops to 2,373 instances), or give the
  backdrop its own ground. Untouched because the skirt is an ADR-backed system and putting
  solid ground under its alpha fade changes how it reads.
- **Fog.** `murciaConfig.ts` sets `fog: null` deliberately — *"Fog is support, not the
  edge-hiding mechanism."* The palette assumes fog will land. It is also the fix for the far
  plane: at 1,100 m the outer ring exceeds `far: 1200` when the camera pans to a plate edge
  (~1,400 units to the far side) and will pop. Fog ending ~1,000–1,100 m hides that. But fog
  is Scene-global per ADR-001 and will touch Earth during the warp, so it needs the ADR
  amended rather than a quiet config edit.

## 8. Deferred, with the facts to pick it up

- **Frustum culling.** three culls an `InstancedMesh` as one unit — `Frustum.intersectsObject`
  tests a single `boundingSphere` — so all 3,146 instances are submitted every frame even
  though the ~50.6° horizontal FOV sees a fraction of the ring. Splitting into 6 angular
  sectors (one Empty each, ~520 instances per sector) would cut submitted instances 65–83%
  for ~+20–30 KB. **Judged over-engineering for now (2026-08-19):** it saves vertex
  processing, not fill rate — off-screen instances are already clipped before
  rasterisation — so it is real but modest, and no profiling yet shows a frame cost.
- **Quantizing instance transforms** would take the file to roughly 90 KB at 12 meshes;
  transforms are **89.3%** of the payload (ROTATION 35.7%, TRANSLATION 26.8%, SCALE 26.8%)
  at 40 B per instance, and ROTATION holds only four discrete 90° steps as float
  quaternions. `KHR_mesh_quantization` needs **no decoder** — three supports it natively.
  But Blender will not emit it and the project has **no glTF post-processing tooling at
  all**: no `gltf-transform`, no `gltfpack`, no `meshopt`, only the read-only validator
  `checks/city-asset.ts`. This means adding a build dependency.
- **`EXT_meshopt_compression`** would additionally require shipping `MeshoptDecoder` and
  wiring it into `src/graphics/decoders.ts`, which registers only DRACO and KTX2 today from
  self-hosted `public/draco/` and `public/libs/basis/`. New shipped bytes; not justified.
- **A facade texture.** The next step if flat colour still reads plain. It is the first
  thing needing UVs and one image, and it pays off in the near band (220–400 m) where
  buildings are largest on screen; the far band is too small to justify it.
