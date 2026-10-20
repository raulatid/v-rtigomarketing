# Blender export contract

What the runtime reads out of the GLB, and what has to be true in the .blend for
it to be there. Short on purpose — every item below exists because something
either broke or could not be built without it.

The active v5.1 r3 delivery includes `estadio-techo` at its corrected authored
transform, with `static-NW` lightmapping and no exported animation clips. The
old roof exclusion and v4 placement repair do not apply. See the
[r3 integration and source measurements](lightmaps-v5.1-r3-integration.md).

---

## 1. Collection names are not exported. Name the objects.

**The important one.** Blender's glTF exporter flattens collections: a collection
called `edificios_servicios` produces **no node of that name**, and no trace of
the grouping survives. Only object names become nodes.

This was confirmed by dumping every node name in `city-prototype.glb` (294 in
the first export, 1079 in the 2026-08-27 one). The names present are
`suelo-principal`, `Edificios_Procedurales`, `Edificios-servicios-001`,
`blog_edificios`, `Estadio futbol` and similar. No collection name appears.

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

Since murcia-v7 the GLB carries **one authored material**
(`MURCIA_SingleTrim_VertexColor`) with an embedded neutral white trim, and
`COLOR_0` on every primitive. The runtime keeps that material on the unbaked
exterior, drops the white trim (multiplying by white is nothing), and builds
its own unlit materials for the baked centre (§7). Anything that modifies the
authored material must still clone first, or it recolours every exterior block.

Before v7 the GLB carried zero materials and every mesh shared one fabricated
`MeshStandardMaterial`; `applyTrimSheet` still handles that file, which is why
it has two branches.

The named landmarks carry their look as runtime palettes keyed by node name —
the tower (§6.8) and the campus (§6.9) — because the city exports no materials.
An emissive part is a palette entry with an emissive colour and an intensity;
three multiplies `emissive` by `emissiveIntensity`, so an intensity on a
black emissive is invisible.

Do not export lights. The shell owns the light rig, and changing the Scene's
light count invalidates every material's shader program (§2.3, §10.4).

---

## 5. Geometry hygiene

- **Apply transforms.** Negative scale is reported as a warning by
  `buildSceneReport` and breaks normals.
- **The terrain plate** is located by name (`suelo-principal`) with a largest-flat-mesh
  fallback. Renaming it is fine; the fallback and the reported `terrainSource`
  will say what happened.
- **The outer ground** is located by name (`SUELO_CIUDAD`) with **no fallback**, and
  it is load-bearing in a way the plate is not — see below.
- Keep 1 unit ≈ 1 metre. Every camera and navigation value assumes it.

### 5.1 The outer ground carries the camera

Added 2026-09-04 with the filler city, and it is the one geometry fact the camera
pose depends on.

Murcia rests at **19° elevation**, which puts the horizon in frame. That is only
affordable because `SUELO_CIUDAD` extends **741 units past the authored plate in
its thinnest direction**, and because the terrain skirt wraps *that* mesh rather
than the plate. Shrink it, rename it, or drop it and the resting camera starts
showing the edge of the model — on wide viewports first, silently.

Three rules follow:

1. **`SUELO_CIUDAD` must exist, by that name.** There is deliberately no
   largest-flat-mesh fallback: that fallback would find this very mesh, so a
   mistyped *plate* name would hand both lookups the same object and the skirt
   would wrap the rectangle navigation is bounded to. A miss logs loudly and
   falls back to wrapping the plate, which fades out the middle of the city.
2. **It must cover `murciaConfig.groundBounds`.** `checks/city-asset.ts` §7
   asserts the shipped GLB against that rectangle and runs under
   `check:asset:contract`, so a re-export that shrinks the ground fails the
   build. If the ground legitimately changes size, re-measure and update
   `GROUND` in `murciaConfig.ts` — then re-run `npm run check:footprint`, which
   is what decides whether the pose is still legal.
3. **Keep it at the scene root, unrotated, at y = 0.** The contract check reads
   its bounds from the POSITION accessor plus the node's own translation and
   scale; it does not walk a parent chain or apply a rotation. Parent it or turn
   it and the check reports the wrong rectangle (it prints a NOTE if it sees a
   rotation, but the number is still wrong).

When the runtime builds the materials (§6.4), it gives it the ground material,
like the plate.

---

## 6. Instances, materials and the named buildings

**The trim sheet is retired** (2026-10-20). The city's colour is vertex colour
(`COLOR_0`, §4); the runtime loads no sheet and the .blend exports no image for
one. The sections that described it — UV maps, band layout, textures, hand-modelled
buildings on the sheet (6.1, 6.3, 6.5, 6.6) — are in git history. The numbering
below is kept because code and §7 cite §6.8 and §6.9.

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

`check:asset` fails above **4 materials**. Raising that ceiling should require
the same argument as any other architectural change.

**If an export ships no materials, the runtime builds them.** `GLTFLoader` would
otherwise fabricate a single `metalness: 1` default for every primitive — no
environment map in this scene, so a fully metallic surface has almost no diffuse
term and a base colour on it is nearly invisible. `applyTrimSheet` replaces it
with `MAT_CITY_BUILDINGS` (`metalness: 0`), a vertex-colour twin, and a separate
ground material for the terrain plate. **When the export ships materials, the
runtime leaves them exactly as authored** (§4).

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

`ARCH_Light_Warm` (the tower's warm light strips) is **not** exported: it was
never meant to be in the city, and a part the palette has no colour for is
warned about at load.

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
   campus as scenery. `check:asset:contract` §5 asserts all fifteen names, the
   strip's `TEXCOORD_0`, and that the campus stands on the plate.

---

## 7. Lightmaps (murcia-v7)

The centre of the city ships with its light baked. The bake is diffuse direct +
indirect **without albedo**, so the atlas texel is light and nothing else; base
colour stays `COLOR_0` (× a white trim the runtime drops). The runtime renders
every baked surface **unlit** (`MeshBasicMaterial` + `lightMap`) and leaves the
scene's rig to the unbaked exterior. DECISIONS §49 records why.

What the export has to carry, and what `check:asset` asserts:

1. **Receivers are marked by extras, never by name.** A baked building node
   carries `asset_lightmap_kind` (`static` or `instances`) and
   `asset_lightmap_chunk` (`NW`/`NE`/`SW`/`SE`). A baked ground node carries
   `ground_lightmap_chunk` with the same four values; the unbaked outer ground
   carries it with the value `Context`. Unbaked exterior blocks carry
   `unbaked_context: true`.
2. **`TEXCOORD_1` is the lightmap UV** on every receiver (the manifests say
   `uvChannel: 1`). This reverses the old "no second UV set" rule.
3. **Instanced receivers carry a per-instance `_LIGHTMAP_ST`** (VEC4: scale.xy,
   offset.zw into the atlas) as an `EXT_mesh_gpu_instancing` attribute, and the
   node's `asset_st_accessor` names that group's accessor. Needed because
   groups instancing the same prototype share one geometry in three, so the
   attribute cannot live on the prototype.
4. **The 21 named nodes the site dresses itself** (§6.8, §6.9, the blog
   building, `rio`, `suelo-principal`) carry `runtime_named_node` and
   `runtime_lightmap: false`. They are exported as their own root nodes with
   their pivots and `TEXCOORD_0`, and they must not also exist inside a baked
   chunk — the two would overlap.
5. **The plate and the ground chunks cover the same rectangle.** The runtime
   hides `suelo-principal` under the baked ground and keeps it for measurement
   and as the skirt's material template. Do not delete it from the export.
6. **The A2 ring is the union of the four `Assets_Static_*` chunks** now that
   `Edificios_Procedurales` is gone; §7b of `check:asset` measures it there.

The atlases are served from `public/textures/murcia/lightmaps/` beside the two
manifests the bake pipeline writes (`assets-lightmaps.json`,
`ground-lightmaps.json`); the runtime reads file names, intensities and the UV
channel from those, so a re-bake is a file drop. Both 2048 and 1024 sets ship;
a phone-width or touch-first viewport gets 1024.
