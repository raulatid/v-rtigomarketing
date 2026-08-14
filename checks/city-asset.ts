/**
 * The Blender export contract, asserted against the shipped GLB.
 *
 * `docs/murcia/blender-export-contract.md` writes down what has to be true of
 * the asset. Until now nothing checked, and the cost is on the record twice: the
 * terrain plate was looked up by a name the exporter had rewritten, and the
 * navigable area silently collapsed to 3.6% of the plate; and the district tags
 * the contract has demanded since it was written are *still* absent from the
 * asset three re-exports later, which nothing reported because the runtime
 * fallback works.
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
 * NOT YET IN `check:harnesses`, deliberately. The UV assertion fails against the
 * GLB in the tree today — 73 of 257 primitives — because the trim-sheet
 * re-export has not happened. Chaining it now would fail `npm run build` for a
 * gap this harness was written to *measure*. Add `check:asset` to the chain in
 * `package.json` in the same commit that lands the re-exported GLB.
 */
import fs from 'node:fs';
import { banner, check, finish, section } from './lib/assert';

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
  nodes?: Array<{ name?: string; extras?: unknown; extensions?: Record<string, unknown> }>;
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

// --- 5. District tags -------------------------------------------------------
// The contract has asked for these since it was written and no export has ever
// carried them, so districts resolve by node name against a hardcoded stand-in.
// Include → Custom Properties is the checkbox.

section('5. District tags (export contract §1)');

const withExtras = nodes.filter((n) => n.extras != null);
const tagged = withExtras.filter(
  (n) => (n.extras as Record<string, unknown>).district != null,
);

check(
  'nodes carry glTF extras',
  withExtras.length > 0,
  withExtras.length > 0
    ? `${withExtras.length} node(s)`
    : 'none — "Include → Custom Properties" was unchecked on export',
);

check(
  'at least one node tagged district=',
  tagged.length > 0,
  tagged.length > 0
    ? `${tagged.length} node(s): ${list(tagged.map((n) => n.name ?? '(unnamed)'))}`
    : 'none — resolveDistrict will fall back to node names',
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
