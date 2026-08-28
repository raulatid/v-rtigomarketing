# Blender export contract

What the runtime reads out of the GLB, and what has to be true in the .blend for
it to be there. Short on purpose — every item below exists because something
either broke or could not be built without it.

---

## 1. Collection names are not exported. Use custom properties.

**The important one.** Blender's glTF exporter flattens collections: a collection
called `edificios_servicios` produces **no node of that name**, and no trace of
the grouping survives. Only object names become nodes.

This was confirmed by dumping every node name in `city-prototype.glb` (294 in
the first export, 1079 in the 2026-08-27 one). The names present are
`suelo-principal`, `Edificios_Procedurales`, `edificio-servicio-001`,
`blog_edificios`, `Estadio futbol` and similar. No collection name appears.

**So a collection can never be a runtime contract.** Organise in collections
however you like; tag with custom properties.

### Tagging a district

On **every object** that belongs to the district — Object Properties → Custom
Properties → New:

```
district = "servicios"
```

On the emission strips or light-line geometry, additionally:

```
districtPart = "emission"
```

### Export settings

**Include → Custom Properties must be checked.** Without it the properties are
silently dropped and the district falls back to name matching, which the console
will tell you about.

Custom properties land in glTF `extras`, which `GLTFLoader` puts on
`object.userData`. `resolveDistrict` reads `userData.district`.

### Service buildings are identified by object name

Since the 2026-08-27 re-export the services district is not a cluster picked as
a whole but **one building per service**: objects named `edificio-servicio-NNN`
(`001`–`007`, `009` today). These are identified by **object name**, not by
tag — a per-building custom property would add nothing the name does not
already say, and the names are dot-free so sanitisation cannot bite.

Which building shows which service lives in one place,
`src/experiences/murcia/scene/cityDistrictBindings.ts` (`buildings[]`). Every
service slug in Sanity needs a row there — the unit test fails otherwise — and a
row whose node is missing from the GLB is reported at load and skipped. Unbound
`edificio-servicio-*` objects are plain city.

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

## 3. A tagged `InstancedMesh` must belong to exactly one district

The asset ships 957 GPU-instanced buildings via `EXT_mesh_gpu_instancing`. All
instances in one `InstancedMesh` share a single material, so highlighting a
district by swapping that material lights **every** instance in the mesh.

If a district's geometry is instanced, the instances in that mesh must all belong
to that district. `resolveDistrict` warns when it sees a tagged `InstancedMesh`,
because the alternative — per-instance attributes and instance IDs — is a
different implementation and should be a decision, not a surprise.

---

## 4. Materials

The current GLB contains **zero materials and zero textures**, so every mesh
falls back to a *single shared* `MeshStandardMaterial` instance. Anything that
modifies a material must clone first, or it recolours the entire city.

For emission strips: author the emissive colour and any emissive map in Blender.
`DistrictHighlight` detects an authored emissive and **scales** it rather than
overwriting it, so the modelled look survives. Materials with a black emissive
get the interaction tint instead — three multiplies `emissive` by
`emissiveIntensity`, so intensity alone on a black emissive is invisible.

Do not export lights. The shell owns the light rig, and changing the Scene's
light count invalidates every material's shader program (§2.3, §10.4).

---

## 5. Geometry hygiene

- **Apply transforms.** Negative scale is reported as a warning by
  `buildSceneReport` and breaks normals.
- **The terrain plate** is located by name (`suelo-principal`) with a largest-flat-mesh
  fallback. Renaming it is fine; the fallback and the reported `terrainSource`
  will say what happened.
- Keep 1 unit ≈ 1 metre. Every camera and navigation value assumes it.

---

## 6. The trim sheet

The city is textured from a single trim sheet. Blender owns where the geometry
samples it; Three.js only renders the result
(`docs/plans/001-trim-sheet-implementation.md`). Everything below is a
requirement on the .blend, and `npm run check:asset` asserts the ones that are
visible in the exported file.

**The sheet is not in the GLB, and must not be.** It is served from
`public/textures/murcia/` and put onto the city's material at load
(`loadTrimSheet.ts`, `applyTrimSheet.ts`). That split is the whole iteration
loop: changing a colour is overwriting a file and reloading the page, not
re-exporting 1.29 MB of Draco geometry (docs/plans/009 Phase 4). Export the
.blend with **no images at all**; `check:asset` still fails above two, which
guards against one arriving by accident.

The half that IS the .blend's is the half that cannot be served: the UVs. Every
requirement below is about those.

### 6.1 The UV attribute must be a UV map, not just an attribute

Write it with **Store Named Attribute**, and all three of these must be right:

```
Domain     Face Corner      (not Point — a Point-domain attribute is per-vertex
                             and cannot describe a seam)
Data type  2D Vector        (not Vector — a 3-component attribute exports as a
                             custom `_NAME`, never as TEXCOORD_0)
Name       UVMap
```

Get any of them wrong and the export does not fail. The mesh arrives with no
`TEXCOORD_0`, three leaves `geometry.attributes.uv` undefined, and every fragment
samples texel (0,0) of the atlas — one flat colour across the whole building,
which looks like a deliberate art choice.

**As of the 2026-08-28 measurement, 183 of 222 meshes have no `TEXCOORD_0`**,
and they are exactly the Geometry Nodes buildings (the ones the exporter names
`Mesh`). That is the gap this section exists to close, and it is now visible on
screen rather than only in a harness: with the test sheet in place, every mesh
without UVs renders in the sheet's top-left colour while every mesh with them
shows bands.

**A constant UV set is the same bug wearing a disguise.** 19 more meshes —
`suelo-principal`, `rio`, `plaza-toros-fachada`, `edificio-servicio-003` and
`-004` among them — carry a `TEXCOORD_0` in which *every vertex holds the same
value*. It is present, so `check:asset` passes it, and it samples exactly one
texel, so the building is flat. That combination is the most expensive failure
available here: the gate says green and the city says wrong. The runtime catches
it instead (`meshesWithConstantUv` in the load report), because it has the
decoded geometry that the file-level harness deliberately does not.

Of the 20 meshes that do have a real unwrap, none is mapped into bands yet —
they are plain 0..1 box unwraps, so they stretch the entire sheet across each
surface. Adding UVs to the Geometry Nodes buildings is therefore half the job;
re-mapping the ones that already have them is the other half.

### 6.2 Realize Instances stays OFF

The asset ships **6690 instances across 16 instanced nodes** via
`EXT_mesh_gpu_instancing`. Every instance of a geometry shares that geometry's
UVs, so **trim variation is per-geometry-variant, never per-building**.

Realizing instances would allow per-building UV placement and cost the sharing
that makes the city affordable: unique vertex data per building, a much larger
GLB on the intro's prefetch path, and one draw call each. If a look genuinely
needs per-building variation, that is a decision to take deliberately with
per-instance attributes — not a checkbox.

`check:asset` reports the instanced-node and instance counts on every run so a
stray realize shows up as a number, not as a slow site.

### 6.3 Layout: full-width horizontal bands

Each trim spans the full width of the sheet, stacked vertically:

```
 v=1  ┌────────────────────────────┐
      │  band 1                    │
      ├────────────────────────────┤
      │  band 2                    │
      ├────────────────────────────┤
      │  …                         │
 v=0  └────────────────────────────┘
      u=0                        u=1
```

**Which band is which material is not written down here, on purpose.** An
earlier version of this section named four — roof, parapet, cornice, facade —
and the sheet that exists has eight. The region list belongs to whoever is
painting the sheet, it will change while they iterate, and a copy of it in this
document or in the code would be one more thing to keep in step by hand. Nothing
in the runtime knows or needs to know: it loads an image and hands it to a
material. Record the final list here once it stops moving.

What *is* fixed is the shape. Full-width bands stacked in V is what lets a
facade tile its trim along its own length — U runs past 1 by design — while V
never leaves its band. `loadCity.ts` sets `wrapS = Repeat` and
`wrapT = ClampToEdge` at load to express that, because Blender's Image Texture
*Extension* is one setting for both axes and cannot say it. Set **Extension =
Clip** in Blender regardless; the runtime supplies the U half.

**Which end of the sheet is `v = 0`** is worth settling by looking rather than
by reasoning: Blender's exporter flips V, the runtime loads the sheet with
`flipY = false`, and the two compose. A sheet of distinctly coloured bands
answers it in one screenshot, which is what a calibration chart is for. Note
that a mesh with no UVs samples texel (0,0), so whichever band ends up there is
also the colour of every un-unwrapped building — useful, if you keep it
distinctive.

Keep bands **≥ 128 px tall in a 2048 sheet, with padding**. Adjacent bands blend
into each other in the lower mip levels, which shows up at distance and at
grazing angles — never as an error, only as mud. Do not disable mipmaps to hide
it.

### 6.4 One material for the architecture

The point of a trim sheet is that hundreds of buildings share very few
materials. Separate a material only where the *render state* genuinely differs —
transparent glass, emissive strips — never to get a colour or a facade variant,
which is what the sheet's regions are for.

`check:asset` fails above **4 materials**. Raising that ceiling should require
the same argument as any other architectural change.

**While the GLB exports none, the runtime builds one.** The file currently
declares zero materials, so `GLTFLoader` fabricates a single `metalness: 1`
default for all 222 primitives — no environment map in this scene, so a fully
metallic surface has almost no diffuse term and a base colour on it is nearly
invisible. `applyTrimSheet` replaces it with `MAT_CITY_BUILDINGS`
(`metalness: 0`), plus a second, map-free material for the terrain plate.

**The moment the export ships a material, the runtime stops replacing it** and
assigns the sheet's maps onto what arrived instead, leaving colour, roughness
and emissive exactly as authored. So exporting a material is safe and is the
preferred end state — but do not export one carrying an *image*.

The terrain plate stays off the sheet either way. `createTerrainTransition`
clones the plate's material for the horizon collar and skirt, and those two
geometries are generated at runtime with no UV attribute at all — a map
inherited down that chain would smear one texel across the whole horizon.

### 6.5 Textures

They live in `public/textures/murcia/`, **not in the GLB**:

```
public/textures/murcia/murcia-basecolor.png   <- the calibration chart shipping today
                       murcia-normal.*        <- when authored
                       murcia-orm.*           <- when authored
```

The paths are listed in `murciaConfig.trimSheet`, and the loader picks its
decoder from the file extension. To change the look: **overwrite the file and
reload the page.** No Blender, no re-export, no build.

The test atlas of flat colour bands ships as PNG. **The production
BaseColor / Normal / ORM set must ship as KTX2, and 2048² is the ceiling** — an
uncompressed 2048² RGBA8 set is 67 MB of GPU memory against a budget measured at
~70 MB total (`docs/audits/ios-safari-2026-08-14.md` §3). Promoting to it is
three edits to those path strings: `.ktx2` routes to the shared transcoder
`createAssetLoader` already attaches, and everything downstream is unchanged.

Pack occlusion, roughness and metallic as glTF expects — **R = occlusion,
G = roughness, B = metallic** — in one texture. In Blender, occlusion has no
Principled BSDF input: it must be wired through the `glTF Material Output` group
node named **`glTF Settings`**, or the exporter writes no occlusion at all and
the packed texture's R channel goes unused.

Leave the occlusion texture on **TEXCOORD_0**. A second UV set would double
per-vertex cost for nothing, and `check:asset` fails on one.

### 6.6 Manually modelled buildings use the same sheet

A trim sheet is a material library, not a Geometry Nodes output format. An
iconic building modelled by hand — `plaza-toros-fachada`, the
`edificio-vertigo-*` set — consumes it by being unwrapped into the same bands,
and needs nothing else: no Geometry Nodes, no custom property, no separate
texture. It is the same material and the same image, so it costs no extra draw
call and no extra byte.

Give it its own material only if its *render state* genuinely differs — glass
that must be transparent, strips that must be emissive — never to give it a
different colour, which is what the bands are for (§6.4).

### 6.7 It will not look identical to Blender

Do not chase a pixel match. The renderer applies **ACES filmic tone mapping**
(R3F's default, and shared with Earth — changing it is not a Murcia decision),
and the shell supplies its own hemisphere + directional rig rather than the
.blend's lighting. The thing to verify is that **each surface samples the trim
region it was assigned** — checked by band identity and ordering, with clearly
distinct test colours — not that the two screenshots match.
