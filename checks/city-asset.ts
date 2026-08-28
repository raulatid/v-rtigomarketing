/**
 * The Blender export contract, asserted against the shipped GLB.
 *
 * `docs/murcia/blender-export-contract.md` writes down what has to be true of
 * the asset. Until this harness existed nothing checked, and the cost is on the
 * record: the terrain plate was looked up by a name the exporter had rewritten,
 * and the navigable area silently collapsed to 3.6% of the plate.
 *
 * The mirror-image cost is on the record too, and §5 is where it landed. This
 * file used to assert the district custom properties the contract asked for
 * before the 2026-08-27 re-export. Those assertions outlived the mechanism —
 * service buildings are identified by object name now and nothing reads
 * `extras.district` any more — and a harness that stays red for a retired rule
 * teaches its readers to ignore it, which costs exactly what not checking
 * costs. An assertion has to be retired as deliberately as it was added.
 *
 * That is the failure mode this file exists for. An export regression is not a
 * crash — it is a quieter city, a district that stops being tappable, a material
 * that samples nothing. All of them look like a working site.
 *
 * WHY IT READS THE CONTAINER DIRECTLY rather than loading through GLTFLoader.
 * The questions here are about the *file*: does this primitive carry
 * TEXCOORD_0, is this image a KTX2, is EXT_mesh_gpu_instancing still applied.
 * GLTFLoader answers a different question — what the runtime made of the file —
 * and by the time it has answered, Draco is decoded, defaults are filled in and
 * a missing material has become a real `MeshStandardMaterial`. The JSON chunk is
 * the contract; the scene graph is the consequence.
 *
 * Draco note: `KHR_draco_mesh_compression` moves the attribute *data* into a
 * compressed buffer but the spec requires `primitive.attributes` to stay
 * populated, so the UV assertion below is valid without decoding anything. The
 * extension's own attribute map is checked too, for the same answer twice.
 *
 * NOT YET IN `check:harnesses`, deliberately, and §1 is the whole reason. The UV
 * assertion fails against the GLB in the tree today because the trim-sheet
 * re-export has not happened. Chaining it now would fail `npm run build` for a
 * gap this harness was written to *measure*. Add `check:asset` to the chain in
 * `package.json` in the same commit that lands the re-exported GLB — and not
 * before, because a gate that is expected to fail is not a gate.
 */
import fs from 'node:fs';
import { PropertyBinding } from 'three';
import { banner, check, finish, section } from './lib/assert';
import { cityDistrictBindings } from '../src/experiences/murcia/scene/cityDistrictBindings';

const MODEL = process.argv[2] ?? 'public/models/city-prototype.glb';

/**
 * Ceilings, not targets. The trim sheet's whole promise is that many procedural
 * buildings share very few materials (plan 001 Phase 8), so a rise here means
 * the promise is being lost — one material per variant, or per building.
 *
 * Four allows the intended split: opaque architecture, glass, emissive strips
 * and one spare. Two images allows the trim sheet plus one more; a production
 * BaseColor/Normal/ORM set will raise this to four, with the memory budget in
 * `docs/audits/ios-safari-2026-08-14.md` §3 as the argument.
 */
const MATERIAL_CEILING = 4;
const IMAGE_CEILING = 2;

/** Names printed when an assertion fails. Forty is not more actionable than three. */
const OFFENDERS_SHOWN = 3;

interface Gltf {
  asset?: { generator?: string; version?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes?: Array<{ name?: string; extensions?: Record<string, unknown> }>;
  meshes?: Array<{ name?: string; primitives?: Primitive[] }>;
  materials?: Array<Record<string, unknown>>;
  textures?: Array<{ source?: number; sampler?: number; extensions?: Record<string, unknown> }>;
  images?: Array<{ name?: string; mimeType?: string; uri?: string; bufferView?: number }>;
  samplers?: Array<{ wrapS?: number; wrapT?: number }>;
  bufferViews?: Array<{ byteLength?: number }>;
  accessors?: Array<{ count?: number }>;
}

interface Primitive {
  attributes: Record<string, number>;
  material?: number;
  extensions?: {
    KHR_draco_mesh_compression?: { attributes: Record<string, number> };
  };
}

/**
 * The JSON chunk of a binary glTF.
 *
 * Hand-parsed because the container is twelve bytes of header and a length-
 * prefixed chunk, and pulling a glTF library in to read it would put a
 * dependency between this harness and the thing it is meant to be independent
 * of.
 */
function readGltfJson(file: string): { json: Gltf; bytes: number; version: number } {
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.toString('utf8', 0, 4) !== 'glTF') {
    throw new Error(`${file} is not a binary glTF (bad magic).`);
  }
  const version = buf.readUInt32LE(4);
  const chunkLength = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  // 0x4E4F534A === 'JSON'. The spec requires it to be the first chunk.
  if (chunkType !== 0x4e4f534a) {
    throw new Error(`${file}: first chunk is not JSON (type 0x${chunkType.toString(16)}).`);
  }
  return {
    json: JSON.parse(buf.toString('utf8', 20, 20 + chunkLength)) as Gltf,
    bytes: buf.length,
    version,
  };
}

/**
 * Every attribute name a primitive declares, from both the plain map and the
 * Draco extension's. A Draco-compressed primitive lists them in both places and
 * a malformed one lists them in only the extension — which would read as a
 * missing UV rather than as the malformed file it is.
 */
function attributeNames(prim: Primitive): Set<string> {
  const names = new Set(Object.keys(prim.attributes ?? {}));
  const draco = prim.extensions?.KHR_draco_mesh_compression?.attributes;
  if (draco) for (const key of Object.keys(draco)) names.add(key);
  return names;
}

function list(names: string[]): string {
  const shown = names.slice(0, OFFENDERS_SHOWN).join(', ');
  return names.length > OFFENDERS_SHOWN ? `${shown}, +${names.length - OFFENDERS_SHOWN} more` : shown;
}

// ---------------------------------------------------------------------------

const { json, bytes, version } = readGltfJson(MODEL);

const meshes = json.meshes ?? [];
const nodes = json.nodes ?? [];
const materials = json.materials ?? [];
const images = json.images ?? [];
const textures = json.textures ?? [];
const used = json.extensionsUsed ?? [];

interface PrimRef {
  prim: Primitive;
  /** Mesh name, or the mesh index when the exporter left it unnamed. */
  owner: string;
}
const primitives: PrimRef[] = [];
meshes.forEach((mesh, i) => {
  for (const prim of mesh.primitives ?? []) {
    primitives.push({ prim, owner: mesh.name || `mesh[${i}]` });
  }
});

banner(`CITY ASSET — Blender export contract (docs/murcia/blender-export-contract.md)`);
console.log(`\n  ${MODEL}`);
console.log(`  ${bytes.toLocaleString('en-US')} bytes · glTF ${version} · ${json.asset?.generator ?? 'unknown generator'}`);
console.log(
  `  ${nodes.length} nodes · ${meshes.length} meshes · ${primitives.length} primitives · ` +
    `${materials.length} materials · ${textures.length} textures · ${images.length} images`,
);
console.log(`  extensions: ${used.join(', ') || 'none'}`);

// --- 1. UVs ----------------------------------------------------------------
// The one that matters. A trim sheet is nothing but UV placement, so a
// primitive without TEXCOORD_0 samples texel (0,0) of the atlas for its whole
// surface — a flat, plausible-looking colour, which is exactly why this has to
// be an assertion and not an eyeball.

section('1. UV coordinates (plan 001 Phase 3 — Blender owns trim placement)');

const missingUv = primitives.filter((p) => !attributeNames(p.prim).has('TEXCOORD_0'));
check(
  'every primitive carries TEXCOORD_0',
  missingUv.length === 0,
  missingUv.length === 0
    ? `${primitives.length}/${primitives.length}`
    : `${primitives.length - missingUv.length}/${primitives.length} — missing on ${list(missingUv.map((p) => p.owner))}`,
);

// Printed rather than left to be inferred from the word FAIL, because this file
// has now retired two assertions that failed for a mechanism nobody uses, and a
// reader is entitled to ask which kind this one is. It is the other kind: a
// real, open gap in the asset, measured deliberately, and the only thing
// keeping `check:asset` out of `check:harnesses`.
if (missingUv.length > 0) {
  console.log(
    `        ^ OPEN ASSET GAP, not an obsolete rule — awaiting the trim-sheet\n` +
      `          re-export (plan 001 Phase 3). ${missingUv.length} of ${primitives.length} primitives\n` +
      `          sample texel (0,0) of the atlas across their whole surface.`,
  );
}

// TEXCOORD_1 is not wanted and its presence is a signal, not an error: it means
// a second UV map survived the export, which doubles per-vertex cost for
// nothing unless something is deliberately using it. glTF's occlusion texture
// defaults to TEXCOORD_0, so ORM packing does not need it.
const withUv1 = primitives.filter((p) => attributeNames(p.prim).has('TEXCOORD_1'));
check(
  'no second UV set (ORM packs onto TEXCOORD_0)',
  withUv1.length === 0,
  withUv1.length === 0 ? '0 primitives' : `${withUv1.length} carry TEXCOORD_1: ${list(withUv1.map((p) => p.owner))}`,
);

// --- 2. Materials and textures ---------------------------------------------

section('2. Material and texture economy (plan 001 Phase 8)');

check(
  `materials within ceiling (${MATERIAL_CEILING})`,
  materials.length <= MATERIAL_CEILING,
  `${materials.length} material(s)${materials.length ? `: ${list(materials.map((m, i) => String(m.name ?? `material[${i}]`)))}` : ''}`,
);

check(
  `images within ceiling (${IMAGE_CEILING})`,
  images.length <= IMAGE_CEILING,
  `${images.length} image(s)`,
);

// Reported rather than asserted: the test atlas ships as PNG on purpose and
// only the production set has to be KTX2. The byte sizes are here so the
// conversation about that happens against numbers.
for (const [i, image] of images.entries()) {
  const byteLength = image.bufferView != null ? json.bufferViews?.[image.bufferView]?.byteLength : undefined;
  const size = byteLength != null ? `${(byteLength / 1024).toFixed(0)} KB embedded` : (image.uri ?? 'external');
  console.log(`        image[${i}] ${image.name ?? '(unnamed)'} · ${image.mimeType ?? 'unknown type'} · ${size}`);
}

// Occlusion on a texCoord other than 0 would force a second UV set at runtime
// (three reads `aoMap` through its own channel), which §1 has just ruled out.
const occlusionOffUv0 = materials.filter((m) => {
  const occlusion = m.occlusionTexture as { texCoord?: number } | undefined;
  return occlusion != null && (occlusion.texCoord ?? 0) !== 0;
});
check(
  'occlusion textures sample TEXCOORD_0',
  occlusionOffUv0.length === 0,
  occlusionOffUv0.length === 0 ? `${materials.length} material(s) checked` : `${occlusionOffUv0.length} use a second UV set`,
);

// --- 3. Instancing ----------------------------------------------------------
// Realize Instances is one checkbox in Blender and turning it on would replace
// 14 shared geometries with thousands of unique ones. The GLB would still load,
// still look identical, and cost the download, the vertex memory and the
// draw calls all at once.

section('3. GPU instancing (kept — see the trim-sheet plan, decision 1)');

let instancedNodes = 0;
let instances = 0;
for (const node of nodes) {
  const ext = node.extensions?.EXT_mesh_gpu_instancing as
    | { attributes?: Record<string, number> }
    | undefined;
  if (!ext?.attributes) continue;
  instancedNodes += 1;
  const accessor = Object.values(ext.attributes)[0];
  instances += json.accessors?.[accessor]?.count ?? 0;
}

check(
  'EXT_mesh_gpu_instancing still applied',
  used.includes('EXT_mesh_gpu_instancing'),
  `${instancedNodes} instanced node(s) · ${instances} instance(s)`,
);

// --- 4. Lights --------------------------------------------------------------
// The shell owns the light rig. An exported light changes the Scene's light
// count, which invalidates every material's shader program — a full recompile,
// and on the city that lands during the transition.

section('4. Lighting (export contract §4)');

check(
  'no punctual lights exported',
  !used.includes('KHR_lights_punctual'),
  used.includes('KHR_lights_punctual') ? 'KHR_lights_punctual present' : 'none',
);

// --- 5. Service buildings ---------------------------------------------------
// RETIRED HERE: "nodes carry glTF extras" and "at least one node tagged
// district=". They asserted the pre-2026-08-27 mechanism, where a district was
// a cluster located through a Blender custom property exported into glTF
// `extras`. The city now ships one building per service, and the only
// production caller of `resolveDistrict` (`MurciaExperience`) passes `tag: ''`,
// so no code path reads `extras.district` at all. Those two checks could only
// ever fail, and their failing said nothing about the asset.
//
// The resolver still HAS the tag path, and this is not an argument for deleting
// it. It is the argument for not asserting a mechanism no caller uses.
//
// What replaced them is below, and it is a real contract with a real failure
// mode. Names are the identity of these objects, and a rename in Blender is
// silent: the building keeps rendering, loses its service, and the only report
// is a console line at load on a page nobody has open.

section('5. Service buildings (cityDistrictBindings — object names ARE the identity)');

console.log(
  '        district tags (extras.district) retired 2026-08-27 with the\n' +
    '        one-building-per-service re-export — no longer checked here.',
);

/**
 * Every GLB node name that `configured` would resolve to at runtime.
 *
 * `findByAnyNameSpelling` tries three spellings and two of them are decidable
 * from the file: GLTFLoader renames every node through
 * `PropertyBinding.sanitizeNodeName`, so a configured name matches a GLB name
 * either verbatim (the `userData.name` path) or after sanitisation (the
 * `getObjectByName` path). The sanitiser is imported rather than reimplemented
 * — a second copy of that rule drifting from the first is precisely the class
 * of bug this harness exists to catch.
 */
function nodesNamed(configured: string): string[] {
  return nodes
    .map((n) => n.name)
    .filter(
      (name): name is string =>
        name != null &&
        (name === configured || PropertyBinding.sanitizeNodeName(name) === configured),
    );
}

for (const binding of cityDistrictBindings) {
  const missing: string[] = [];
  const ambiguous: string[] = [];
  for (const building of binding.buildings) {
    const hits = nodesNamed(building.nodeName);
    if (hits.length === 0) missing.push(`${building.serviceId} -> ${building.nodeName}`);
    // Reported, not asserted: `getObjectByName` returns the first match, so two
    // nodes sharing a bound name means the service points at whichever one the
    // exporter happened to write first.
    else if (hits.length > 1) ambiguous.push(`${building.nodeName} x${hits.length}`);
  }
  const total = binding.buildings.length;
  check(
    `"${binding.contentId}" buildings all exist in the GLB`,
    missing.length === 0,
    missing.length === 0
      ? `${total}/${total} node(s)${ambiguous.length ? ` — AMBIGUOUS: ${list(ambiguous)}` : ''}`
      : `${total - missing.length}/${total} — missing ${list(missing)}`,
  );
}

// Informational. Unbound `edificio-servicio-*` objects are plain city by design
// — three of them are waiting for services that do not exist yet — but the
// count is worth printing: a re-export that renamed the whole family would show
// up here as every building unbound, rather than as one missing row.
const boundNames = new Set(cityDistrictBindings.flatMap((d) => d.buildings.map((b) => b.nodeName)));
const unbound = nodes
  .map((n) => n.name ?? '')
  .filter((name) => /^edificio-servicio-/.test(name) && !boundNames.has(name));
console.log(
  `        ${boundNames.size} bound · ${unbound.length} unbound edificio-servicio-* (plain city)` +
    `${unbound.length ? `: ${list(unbound)}` : ''}`,
);

// --- 6. Samplers ------------------------------------------------------------
// Reported, never asserted. Blender's Image Texture *Extension* is per-node and
// cannot express the split the banded atlas needs — repeat along U so trims tile
// with facade length, clamp along V so bands never bleed into each other. That
// split is applied at load in `loadCity.ts`, and is the single deliberate
// exception to "Blender owns the sampling".

section('6. Samplers (informational — wrapping is set at load, see loadCity.ts)');

const WRAP = new Map([
  [33071, 'ClampToEdge'],
  [33648, 'MirroredRepeat'],
  [10497, 'Repeat'],
]);
if ((json.samplers ?? []).length === 0) {
  console.log('        no samplers — nothing textured yet');
}
for (const [i, sampler] of (json.samplers ?? []).entries()) {
  const s = WRAP.get(sampler.wrapS ?? 10497) ?? String(sampler.wrapS);
  const t = WRAP.get(sampler.wrapT ?? 10497) ?? String(sampler.wrapT);
  console.log(`        sampler[${i}] wrapS ${s} · wrapT ${t}  (overridden at load)`);
}

finish();
