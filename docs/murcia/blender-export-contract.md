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

`src/scene/cityDistrictBindings.ts` lists `blog_edificios` and
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
silently collapsed to 3.6% of the plate (PROJECT_MEMORY §4.1).

The original name survives on `userData.name`. `findByAnyNameSpelling`
(`src/assets/nodeNames.ts`) tries all three spellings, so configuration may be
written either way — but **prefer names without dots** for anything new.

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
