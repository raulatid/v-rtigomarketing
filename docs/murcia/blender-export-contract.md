# Blender export contract

What the runtime reads out of the GLB, and what has to be true in the .blend for
it to be there. Short on purpose — every item below exists because something
either broke or could not be built without it.

---

## 1. Collection names are not exported. Use custom properties.

**The important one.** Blender's glTF exporter flattens collections: a collection
called `edificios_servicios` produces **no node of that name**, and no trace of
the grouping survives. Only object names become nodes.

This was confirmed by dumping all 294 node names in `city-prototype.glb`. The
names present are `Plane.013`, `Edificios_Procedurales`, `parque.007`,
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

### What happens today, before the re-export

`src/experiences/murcia/scene/cityDistrictBindings.ts` lists `blog_edificios` and
`blog_edificios.001` as a **stand-in** so the interaction can be built and
judged. Once the objects carry `district = "servicios"` the tag path wins
automatically and no code changes.

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
- **The terrain plate** is located by name (`Plane.013`) with a largest-flat-mesh
  fallback. Renaming it is fine; the fallback and the reported `terrainSource`
  will say what happened.
- Keep 1 unit ≈ 1 metre. Every camera and navigation value assumes it.

---

## 6. The trim sheet

The Geometry Nodes buildings are textured from a single trim sheet. Blender owns
where the geometry samples it; Three.js only renders the result
(`docs/plans/001-trim-sheet-implementation.md`). Everything below is a
requirement on the .blend, and `npm run check:asset` asserts the ones that are
visible in the exported file.

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

**As of the last audit, 184 of 257 primitives have no `TEXCOORD_0`**, and they
are exactly the Geometry Nodes buildings (the ones the exporter names `Mesh`).
That is the gap this section exists to close.

### 6.2 Realize Instances stays OFF

The asset ships **6602 instances across 14 shared geometries** via
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
      │  roof                      │
      ├────────────────────────────┤
      │  parapet                   │
      ├────────────────────────────┤
      │  cornice                   │
      ├────────────────────────────┤
      │  facade                    │
 v=0  └────────────────────────────┘
      u=0                        u=1
```

This is what lets a facade tile its trim along its own length — U runs past 1 by
design — while V never leaves its band. `loadCity.ts` sets `wrapS = Repeat` and
`wrapT = ClampToEdge` at load to express that, because Blender's Image Texture
*Extension* is one setting for both axes and cannot say it. Set **Extension =
Clip** in Blender regardless; the runtime supplies the U half.

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

### 6.5 Textures

The test atlas of flat colour bands ships as PNG. **The production
BaseColor / Normal / ORM set must ship as KTX2, and 2048² is the ceiling** — an
uncompressed 2048² RGBA8 set is 67 MB of GPU memory against a budget measured at
~70 MB total (`docs/audits/ios-safari-2026-08-14.md` §3). The runtime is already
wired for it (`createAssetLoader` attaches the shared KTX2 transcoder), so this
is a file swap.

Pack occlusion, roughness and metallic as glTF expects — **R = occlusion,
G = roughness, B = metallic** — in one texture. In Blender, occlusion has no
Principled BSDF input: it must be wired through the `glTF Material Output` group
node named **`glTF Settings`**, or the exporter writes no occlusion at all and
the packed texture's R channel goes unused.

Leave the occlusion texture on **TEXCOORD_0**. A second UV set would double
per-vertex cost for nothing, and `check:asset` fails on one.

### 6.6 It will not look identical to Blender

Do not chase a pixel match. The renderer applies **ACES filmic tone mapping**
(R3F's default, and shared with Earth — changing it is not a Murcia decision),
and the shell supplies its own hemisphere + directional rig rather than the
.blend's lighting. The thing to verify is that **each surface samples the trim
region it was assigned** — checked by band identity and ordering, with clearly
distinct test colours — not that the two screenshots match.
