# Blender export contract

What the runtime reads out of the GLB, and what has to be true in the .blend for
it to be there. Short on purpose — every item below exists because something
either broke or could not be built without it.

The active delivery is the one `murciaConfig.modelPath` names; its record is
[lightmaps-v5.2-r1-integration.md](lightmaps-v5.2-r1-integration.md). It
includes `estadio-techo` at its authored transform, in the `static-NW` atlas,
with no exported animation clips. `checks/city-asset.ts` picks the roof rules
by the GLB's **file name**: a new delivery's file name has to be added to that
list, or the harness applies the old v4 repair rules to it and fails.
How a delivery is packaged and served is in
[`decisiones/build/entrega-de-la-ciudad.md`](../decisiones/build/entrega-de-la-ciudad.md).

---

## 1. Collection names are not exported. Name the objects.

**The important one.** Blender's glTF exporter flattens collections: a collection
called `edificios_servicios` produces **no node of that name**, and no trace of
the grouping survives. Only object names become nodes.

This was confirmed in August 2026 by dumping every node name in
`city-prototype.glb`, an export since retired. The names present were object
names such as `suelo-principal` and `Edificios_Procedurales`; no collection
name appeared. The current GLB's nodes are object names too (`edificio-blog`,
`suelo-principal`, `Edificios_Procedurales__NE`); `npm run check:asset` prints
the counts.

**So a collection can never be a runtime contract.** Organise in collections
however you like; what the runtime finds, it finds by object name.

### Nothing reads a district tag any more

A district was located by a `district = "servicios"` custom property until
2026-08-27, and by object name after that. Since the services campus replaced
the display district (2026-09-11, `plans/024`) no feature reads a custom
property. Every object the city looks for, it looks for by NAME: the campus in
§6.9, the tower in §6.8, the blog building in `blogDisplayConfig.ts`. The one
reader left is the debug click probe (`userData.interactive`), which only logs.
Custom properties are harmless to export.

---

## 2. Reserved characters are stripped from node names

`GLTFLoader` passes every name through `PropertyBinding.sanitizeNodeName`, which
removes `[ ] . : /`:

```
"Plane.013"          ->  "Plane013"
"blog_edificios.001" ->  "blog_edificios001"
```

So `getObjectByName('Plane.013')` returns `undefined`. This cost the project a
long-running bug where the terrain plate was never found and the navigable area
silently collapsed to 3.6% of the plate (PROJECT_MEMORY, *Things that will bite
you again*).

The original name survives on `userData.name`. `findByAnyNameSpelling`
(`src/experiences/murcia/assets/nodeNames.ts`) tries all three spellings, so
configuration may be written either way — but **prefer names without dots** for
anything new.

The runtime also accepts a node whose `extras.runtime_name` equals the
configured name. `checks/city-asset.ts` does not: it matches the node name
only. A node renamed in Blender that keeps only its `runtime_name` works on the
site and fails `check:asset:contract`. That is intended — the node name is the
contract.

---

## 3. Instanced geometry shares one material

The asset ships thousands of GPU-instanced buildings via
`EXT_mesh_gpu_instancing`, and all instances in one `InstancedMesh` share a
single material — so recolouring one by swapping that material recolours
**every** instance in the mesh.

This section used to require a district's instanced geometry to belong to that
district alone, because the district lit its buildings by material swap
(`resolveDistrict`, `DistrictHighlight`). Both went with the display district
on 2026-09-11. The fact stays true for anything that dresses geometry by node:
the tower's and the campus's palettes (§6.8, §6.9) replace materials on plain
meshes, and a part that arrived instanced would take its whole mesh with it.

---

## 4. Materials

The GLB carries **few authored materials** — today as many as the
`MATERIAL_CEILING` of `checks/city-asset.ts` allows: `MURCIA_SingleTrim_VertexColor`
(almost everything, with an embedded neutral white trim),
`MURCIA_Vertigo_Base_Cristal`, `MURCIA_Plaza_VertexColor` and
`Stadium_Roof_Default`. Colour is `COLOR_0`. The runtime drops the white trim
first (`dropEmbeddedTrim`; multiplying by white is nothing, and the baked
materials would otherwise copy it), then builds its own unlit materials for
every baked receiver (§7). The few surfaces left unbaked keep the authored
material. Anything that modifies an authored material must clone first, or it
recolours every mesh that shares it.

An export with zero materials still loads: every mesh would share one
fabricated `MeshStandardMaterial`, and `applyTrimSheet` replaces it (§6.4),
which is why it has two branches.

The named landmarks that are **not** baked carry their look as runtime palettes
keyed by node name — the tower (§6.8) and the campus (§6.9). A part that
carries `lightmap_atlas` keeps its vertex colour and baked light, and the
palette skips it. An emissive part is a palette entry with an emissive colour
and an intensity; three multiplies `emissive` by `emissiveIntensity`, so an
intensity on a black emissive is invisible.

Do not export lights. The shell owns the light rig, and changing the Scene's
light count invalidates every material's shader program. `check:asset:contract`
§4 asserts there are none.

---

## 5. Geometry hygiene

- **Apply transforms.** Negative scale is reported as a warning by
  `buildSceneReport` and breaks normals.
- **The terrain plate** is located by name (`suelo-principal`,
  `murciaConfig.terrainTransition.terrainObjectName`), with a largest-flat-mesh
  fallback. Renaming it is fine at runtime; the fallback and the reported
  `terrainSource` will say what happened. `check:asset:contract` §7 asserts the
  name, so a rename fails the build until the config follows.
- Keep 1 unit ≈ 1 metre. Every camera and navigation value assumes it.

### 5.1 The plate is the outer ground

Since the 2026-09-06 export there is **no separate outer ground**: the mesh once
exported as `SUELO_CIUDAD` was merged into the plate, and
`terrainTransition.groundObjectName` is `null`. `suelo-principal` is both the
plate and the outermost ground, and the terrain skirt wraps it.
`check:asset:contract` §7 prints "no outer ground configured" for that case.

In the current export `suelo-principal` is an empty node whose children are
the five baked ground chunks (§7, rule 5). The runtime measures their union
(`splitTerrainMeasurement`) and builds a hidden stand-in from it for the skirt.

Rules:

1. **Do not export a second ground under another name** without also setting
   `terrainTransition.groundObjectName` and `murciaConfig.groundBounds`. The
   outer-ground lookup has deliberately no largest-flat-mesh fallback: it would
   find the plate, and the skirt would wrap the rectangle navigation is bounded
   to. Naming the plate there too is exactly what `findOuterGround` rejects.
2. **If a separate ground comes back, it must cover `murciaConfig.groundBounds`.**
   §7 asserts that rectangle whenever `groundObjectName` is set. Then re-run
   `npm run check:footprint`, which decides whether the resting pose
   (`ELEVATION_DEGREES` in `murciaConfig.ts`) still keeps the edge out of frame.
3. **Bounds are measured in world space.** The harness composes every parent's
   transform (`worldBounds`); parenting or rotating a node does not falsify the
   rectangle. Rotated boxes are measured conservatively (they can overestimate
   the footprint).

---

## 6. Instances, materials and the named buildings

**The trim sheet is retired** (2026-10-20). The city's colour is vertex colour
(`COLOR_0`, §4); the runtime loads no sheet and the .blend exports no image for
one. The sections that described it — UV maps, band layout, textures, hand-modelled
buildings on the sheet (6.1, 6.3, 6.5, 6.6) — are in git history. The numbering
below is kept because code and other sections cite §6.8 and §6.9.

### 6.2 Realize Instances stays OFF

The asset ships its repeated geometry via `EXT_mesh_gpu_instancing`. Every
instance of a geometry shares that geometry's vertex data, so **variation is
per-geometry-variant, never per-building**.

Realizing instances would allow per-building variation and cost the sharing
that makes the city affordable: unique vertex data per building, a much larger
GLB on the intro's prefetch path, and one draw call each. If a look genuinely
needs per-building variation, that is a decision to take deliberately with
per-instance attributes — not a checkbox.

`check:asset` reports the instanced-node and instance counts on every run so a
stray realize shows up as a number, not as a slow site.

### 6.4 Few materials for the architecture

Hundreds of buildings share very few materials. Separate a material only where
the *render state* genuinely differs — transparent glass, emissive strips —
never to get a colour or a facade variant, which is what `COLOR_0` is for.

`check:asset` fails above `MATERIAL_CEILING` (`checks/city-asset.ts`). Raising
that ceiling should require the same argument as any other architectural
change.

**If an export ships no materials, the runtime builds them.** `GLTFLoader` would
otherwise fabricate a single `metalness: 1` default for every primitive — no
environment map in this scene, so a fully metallic surface has almost no diffuse
term and a base colour on it is nearly invisible. `applyTrimSheet` replaces it
with `MAT_CITY_BUILDINGS` (`metalness: 0`), a vertex-colour twin, and a separate
ground material for the terrain plate. **When the export ships materials,
`applyTrimSheet` leaves them alone**; the runtime still drops the embedded trim
and builds its own unlit materials for the baked receivers (§4).

### 6.7 It will not look identical to Blender

Do not chase a pixel match. The renderer applies **ACES filmic tone mapping**
(R3F's default, and shared with Earth — changing it is not a Murcia decision),
and the shell supplies its own hemisphere + directional rig rather than the
.blend's lighting. The thing to verify is that **each surface carries the colour
it was given** — checked with clearly distinct test colours — not that the two
screenshots match.

### 6.8 The Vertigo building: its parts, its screen, and the logo's pivots

The client's own tower is the one landmark the runtime moves and dresses by
name. Since `murcia-v4` it is the detailed tower from `edificio-vertigo.glb`,
exported as `VERTIGO_ROOT` and its parts with the scale **applied** (about 0.307
of the modelled 208 m building) and **no materials**:

| Node | What it is | Rule |
|---|---|---|
| `ARCH_Glass_*`, `ARCH_Metal_*`, `ARCH_Roof_Zinc`, `ARCH_Stone_Limestone`, `BRAND_VERTIGO` | the building | coloured at runtime BY THESE NAMES (`towerScreen/towerPalette.ts`) — a rename loses the colour |
| `LED_Main` | the LED screen the tower's compositions run on | keeps its authored UVs: physical aspect, the 1024 × 3686 artwork, v top to bottom. **Since v7 they are `TEXCOORD_1`**: the exporter writes the material graph's trim-band UV first. `vertigoBuildingConfig.screenUvChannel` (and `CAMPUS_SCREEN_UV_CHANNEL` for the ring) names the set; `check:asset` asserts it |
| `logo-V` | the logo's V, standing on the crown | direct child of the scene root, pivot at its own centre, **no rotation, no scale** |
| `logo-curva` | the logo's arc, above the V | same as `logo-V` |

**In the current, baked export** the building parts share the city's material
and carry `lightmap_atlas` (`landmark-vertigo-blog`; the campus's parts,
`landmark-campus`). A baked part keeps its vertex colour and baked light, and
the palette skips it; the unbaked parts (`LED_Main`, `logo-V`, `logo-curva`)
carry `runtime_material` and get their look at runtime (§7, rule 4). The same
export also contains `ARCH_Light_Warm`, baked like the rest. An unbaked `ARCH_`
part the palette has no colour for is warned about at load.

**The logo turns.** `createTowerLogo` turns both meshes about their local +Y
from Murcia's own frame loop, composing the turn onto whatever orientation the
export carries. Their pivots share `(x, z)` to within a hair, so the two halves
turn as one piece. Keep the pivots at each mesh's centre: a pivot dragged to a
corner makes the mark orbit its post instead of turning on it, and no code can
tell the two apart.

**The screen can be any size.** Its layouts are in the metres of the modelled
building and the runtime scales whatever it measures back to that width, so a
re-export at another applied scale needs no code change — but the screen's UVs
must survive the export untouched, since every composition rides them.

All of these are optional at runtime — a missing node warns and the city
loads — and the logo's two names and `LED_Main` are asserted on the file by
`check:asset:contract` §5d, which also checks the logo's identity transform.

### 6.9 The services campus

Since `murcia-v6` (2026-09-11) the services campus is modelled in the city: the
lab's `campus_vertigo.glb`, exported as fifteen objects that are **root-level
siblings sharing one transform**, the scale applied at 0.7417 of the standalone
export, and **no materials**. The runtime gathers them into one group
(`campus/gatherCampus.ts`) and hands that to the lab's code, which was written
for a root that is the campus.

| Node | What it is | Rule |
|---|---|---|
| `ARCH_Porcelain_White` (and `.001`, the roof cap), `ARCH_Glazing_Opaque_Blue`, `ARCH_Blue_Light`, `ARCH_Window_Frames`, `ARCH_Vertigo_Blue`, `ARCH_Roof_Joints`, `ARCH_Solar_Blue`, `SITE_Light_Limestone`, `PARK_Grass`, `PARK_Trunks`, `PARK_Leaves_Olive`, `PARK_Leaves_Sage` | the building and its park | coloured at runtime BY THESE NAMES (`campus/campusPalette.ts`) with the lab's authored values — a rename loses the colour |
| `PARK_Water` | ONE mesh: the lake and the two entrance pools | the lake is found by clustering its vertices round the campus's centre, so a pool must never touch the lake in the ground plane. The lake is the section's only entry target |
| `CAMPUS_SCREEN_Continuous` | the LED strip round the ring | keeps its authored UVs: U runs round the wall from the right entrance jamb. V was MEASURED top to bottom, like the tower's, so the upload is not flipped; the word stood on its head with the flip on |

Three rules follow:

1. **Keep the campus's parts out of `VERTIGO_ROOT`.** They share the tower's
   `ARCH_` prefix, and the tower's palette warns about an uncoloured `ARCH_`
   node only when it stands beside a tower part. Parented into the tower they
   would be warned about on every load.
2. **Scale is free, proportions are not.** Every size in the section — the
   particles, the disc, the symbols, the camera's ring — is derived from the
   lake's measured radius, and the strip normalises to its 343.9 m design width,
   so a re-export at another applied scale needs no code change. A lake that
   changes SHAPE moves every stop.
3. **Every name is optional at runtime and required by the build.** A missing
   part keeps the city's material and warns once; a missing lake leaves the
   campus as scenery. `check:asset:contract` §5 asserts the names
   (`CAMPUS_BAKED_NODE_NAMES` when the export carries `lightmap_atlas`,
   `CAMPUS_NODE_NAMES` otherwise), that the strip carries the UV set
   `CAMPUS_SCREEN_UV_CHANNEL` names (today `TEXCOORD_1`, as on the tower's
   screen), and that the campus stands on the plate.

---

## 7. Lightmaps

The city ships with its light baked. The bake is diffuse direct + indirect
**without albedo**, so the atlas texel is light and nothing else; base colour
stays `COLOR_0` (× a white trim the runtime drops, §4). The runtime renders
every baked surface **unlit** (`MeshBasicMaterial` + `lightMap`), except
transparent glass, which keeps its lit material. DECISIONS §49 records why.

What the export has to carry. `loadUnifiedLightmaps` refuses the whole bake
(`[lightmaps] not applied`, city on its unbaked material) when one of these is
broken; the full `check:asset` asserts rule 2:

1. **Receivers are marked by extras, never by name.** A baked node carries
   `extras.lightmap_atlas`, the key of its atlas in the delivery's
   `lightmaps.json`. A multi-material mesh may carry it on its parent node; the
   runtime copies it down. A key the manifest does not have is refused
   (`unknown atlas`).
2. **`TEXCOORD_1` is the lightmap UV** on every receiver (the manifest says
   `uvChannel: 1`). The runtime refuses a receiver without it (`missing uv1`).
3. **Instanced receivers carry a per-instance `_LIGHTMAP_ST`** (VEC4: scale.xy,
   offset.zw into the atlas) as an `EXT_mesh_gpu_instancing` attribute, and the
   node's `extras.instance_st_accessor` names that accessor (with
   `instance_count` beside it). Its count must equal the instance count. Needed
   because groups instancing the same prototype share one geometry in three,
   so the attribute cannot live on the prototype.
4. **Nodes the site moves or re-dresses itself are never baked.** They carry
   `runtime_material: true` — the tower's screen and logo, the campus strip and
   water, `rio` — and the logo's two meshes also `dynamic_rotation: true`. A
   node with either flag and a `lightmap_atlas` is refused
   (`dynamic surface was baked`). Interactive building parts carry
   `building_id` and may be baked. Nodes the site looks up by name carry
   `runtime_name` (§2).
5. **The plate and the ground chunks.** `suelo-principal` is an empty node over
   the five baked chunks `suelo-principal__{NE,NW,SE,SW,Outer}` (§5.1). Keep the
   parent and its name: it is what the plate lookup and §7 of the harness find.
6. **The A2 ring is the union of the four baked chunks
   `Edificios_Procedurales__{NE,NW,SE,SW}`**; §7b of `check:asset` measures it
   there.
7. **Required names.** The manifest's `requiredNames` lists the nodes that must
   exist (`missing runtime node` otherwise). It belongs to the bake, not to
   code: a re-bake that drops a node has to drop it there too.

The atlases are served from a versioned folder,
`public/textures/murcia/lightmaps-<version>/`, beside **one** `lightmaps.json`
that names every atlas, its 1024 and 2048 files with their exact bytes and mip
counts, its intensity, and optional per-profile resolutions; the runtime reads
all of it, so a re-bake is a file drop. The total download per profile is
capped (`LIGHTMAP_BUDGET_BYTES` in `unifiedManifest.ts`). Which atlases a device
loads follows `deviceResolution` and the manifest's profiles. The packaging
rules are in
[`decisiones/build/entrega-de-la-ciudad.md`](../decisiones/build/entrega-de-la-ciudad.md).

### 7.1 Re-baking

The bake and its compression are prepared outside this repository. What
carries over between deliveries:

- **Start from the previous delivery's frozen preparation**, not from a fresh
  one: it keeps the lightmap UVs, the instance order and the `_LIGHTMAP_ST`
  rectangles of everything that did not change.
- **Decide which atlases to re-bake by light dependency**, not only by which
  meshes changed: unchanged geometry can receive new shadows or bounce light.
  The whole city stays in the scene as blocker and indirect source.
- **Start in a new working directory after the source changes.** The delivery
  tools resume by atlas name, not by a fingerprint of their input.
- **Recompressing an unchanged atlas to fit the budget is not re-baking it**,
  and the delivery record has to say which one happened.
