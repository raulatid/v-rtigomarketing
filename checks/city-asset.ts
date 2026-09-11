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
import { BLOG_BUILDING_NODE_NAMES } from '../src/experiences/murcia/blogDisplay/blogDisplayConfig';
import { CITY_A2, murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import { expandRect } from '../src/experiences/murcia/navigation/navigationBounds';
import {
  CAMPUS_NODE_NAMES,
  CAMPUS_SCREEN_NODE_NAME,
  CAMPUS_SCREEN_UV_CHANNEL,
  CAMPUS_WATER_NODE_NAME,
} from '../src/experiences/murcia/campus/campusConfig';
import { VERTIGO_BUILDING } from '../src/experiences/murcia/landmark/vertigoBuildingConfig';

const MODEL =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'public/models/murcia-v7.glb';

/**
 * `--contract-only` runs the NAME sections and skips the pending UV assertion.
 *
 * Why it exists: §1 is a real, OPEN asset gap — most primitives still carry no
 * TEXCOORD_0 while the trim-sheet re-export is outstanding — and the note at the
 * top of this file is right that a gate expected to fail is not a gate, which is
 * why the whole harness sits outside `check:harnesses`.
 *
 * Meanwhile the blog's only entry point is two node names in this same GLB, and
 * "a re-export renamed them" has to fail a build rather than log a warning
 * nobody reads. So the narrow gate is chained and the full one is not.
 *
 * NOTHING IS DISABLED. `npm run check:asset` still runs every section and still
 * reports the UV gap exactly as loudly as before; this only adds a subset that
 * can honestly be green today. When the re-export lands, chain the full harness
 * and delete this flag.
 */
const CONTRACT_ONLY = process.argv.includes('--contract-only');

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
  nodes?: Array<{
    name?: string;
    mesh?: number;
    translation?: number[];
    scale?: number[];
    rotation?: number[];
    matrix?: number[];
    extensions?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  }>;
  meshes?: Array<{ name?: string; primitives?: Primitive[] }>;
  materials?: Array<Record<string, unknown>>;
  textures?: Array<{ source?: number; sampler?: number; extensions?: Record<string, unknown> }>;
  images?: Array<{ name?: string; mimeType?: string; uri?: string; bufferView?: number }>;
  samplers?: Array<{ wrapS?: number; wrapT?: number }>;
  bufferViews?: Array<{ byteLength?: number }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
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

if (CONTRACT_ONLY) {
  console.log(
    '        --contract-only: skipping the UV, economy and sampler sections.\n' +
      '        They measure an open gap rather than gate one. Run\n' +
      '        `npm run check:asset` for the full report.',
  );
}

if (!CONTRACT_ONLY) {
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

// TEXCOORD_1 is the lightmap UV since murcia-v7 (DECISIONS §49): every baked
// receiver — a node carrying `asset_lightmap_kind` or one of the four baked
// `ground_lightmap_chunk`s — has to carry it, or its atlas samples nothing.
// This used to assert the opposite ("no second UV set"), when a second map was
// per-vertex cost nobody was spending; the cost is now bought deliberately.
// Unbaked geometry is still free to omit it, and is not asserted either way.
const bakedOwners = new Set(
  nodes
    .filter((n) => {
      const extras = n.extras as { asset_lightmap_kind?: string; ground_lightmap_chunk?: string } | undefined;
      return (
        extras?.asset_lightmap_kind != null ||
        (extras?.ground_lightmap_chunk != null && extras.ground_lightmap_chunk !== 'Context')
      );
    })
    .map((n) => n.name),
);
const bakedWithoutUv1 = primitives.filter(
  (p) => bakedOwners.has(p.owner) && !attributeNames(p.prim).has('TEXCOORD_1'),
);
check(
  'every baked receiver carries TEXCOORD_1, the lightmap UV',
  bakedOwners.size > 0 && bakedWithoutUv1.length === 0,
  bakedOwners.size === 0
    ? 'no baked receivers in the file'
    : bakedWithoutUv1.length === 0
      ? `${bakedOwners.size} receivers`
      : `${bakedWithoutUv1.length} lack it: ${list(bakedWithoutUv1.map((p) => p.owner))}`,
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

}

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

// --- 5. The services campus ------------------------------------------------
// RETIRED HERE, in order: the district custom properties (extras.district,
// 2026-08-27), the per-service buildings (2026-09-06), and the display
// district's plaza and buildings (2026-09-11, murcia-v6). Each asserted a
// mechanism the export had stopped carrying, and an assertion has to be
// retired as deliberately as it was added.
//
// What replaced them is the campus: fifteen objects found by NAME. A rename in
// Blender is silent — the part keeps the city's trim material, the lake stays
// flat, the strip stays dark — and the only report is a console line at load.

section('5. The services campus (campus/campusConfig — names ARE the identity)');

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

/** How much a re-export may differ from the configured rectangle, world units. */
const TOLERANCE = 1;

/**
 * The XZ extent of a named node's mesh, in world space.
 *
 * Deliberately narrow: it reads the POSITION accessor's `min`/`max` — which the
 * spec requires on every position accessor, Draco or not — and applies the
 * node's own translation and scale. That covers a ground plane sitting at the
 * scene root, which is what this is for, and it does NOT walk a parent chain or
 * apply a rotation matrix. Both would be needed for a general Box3, and the day
 * the ground is parented or turned, this returns the wrong rectangle rather than
 * a smaller one — so it asserts that assumption instead of hiding it.
 */
function worldXzBounds(
  configured: string,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const node = nodes.find(
    (n) =>
      n.name != null &&
      (n.name === configured || PropertyBinding.sanitizeNodeName(n.name) === configured),
  );
  if (!node || node.mesh == null) return null;
  if (node.rotation || node.matrix) {
    console.log(`        NOTE: "${configured}" is rotated; its bounds are read unrotated`);
  }

  const prim = meshes[node.mesh]?.primitives?.[0];
  const accessor = prim ? json.accessors?.[prim.attributes?.POSITION as number] : undefined;
  if (!accessor?.min || !accessor?.max) return null;

  const [tx, , tz] = node.translation ?? [0, 0, 0];
  const [sx, , sz] = node.scale ?? [1, 1, 1];
  return {
    minX: tx + accessor.min[0] * sx,
    maxX: tx + accessor.max[0] * sx,
    minZ: tz + accessor.min[2] * sz,
    maxZ: tz + accessor.max[2] * sz,
  };
}

const missingCampus: string[] = [];
const ambiguousCampus: string[] = [];
for (const configured of CAMPUS_NODE_NAMES) {
  const hits = nodesNamed(configured);
  if (hits.length === 0) missingCampus.push(configured);
  // Reported, not asserted: lookups take the first match, so two nodes sharing
  // a name means the campus picks up whichever the exporter wrote first.
  else if (hits.length > 1) ambiguousCampus.push(`${configured} x${hits.length}`);
}
check(
  'every campus node is in the GLB',
  missingCampus.length === 0,
  missingCampus.length === 0
    ? `${CAMPUS_NODE_NAMES.length}/${CAMPUS_NODE_NAMES.length} node(s)` +
        (ambiguousCampus.length ? ` — AMBIGUOUS: ${list(ambiguousCampus)}` : '')
    : `${CAMPUS_NODE_NAMES.length - missingCampus.length}/${CAMPUS_NODE_NAMES.length} — ` +
        `missing ${list(missingCampus)}. See murcia/campus/campusConfig.ts`,
);

{
  // The strip's UVs ARE the screen: every composition rides them, so a strip
  // exported without them is a dark ring rather than an error.
  const strip = nodes.find(
    (n) => n.name != null && PropertyBinding.sanitizeNodeName(n.name) === CAMPUS_SCREEN_NODE_NAME,
  );
  const prims = strip?.mesh != null ? (meshes[strip.mesh]?.primitives ?? []) : [];
  const stripUv = `TEXCOORD_${CAMPUS_SCREEN_UV_CHANNEL}`;
  check(
    `"${CAMPUS_SCREEN_NODE_NAME}" carries ${stripUv}, the set campusConfig names as the screen`,
    prims.length > 0 && prims.every((p) => attributeNames(p).has(stripUv)),
    prims.length === 0
      ? 'no strip mesh to read'
      : `${prims.length} primitive(s); the LED strip's compositions ride its UVs`,
  );

  // The campus stands on the authored plate. Read from the water node's own
  // translation — every campus part shares it — because the lake is what the
  // section is centred on, and a campus exported off the plate would put the
  // section's camera out over the skirt.
  const water = nodes.find((n) => n.name === CAMPUS_WATER_NODE_NAME);
  const [wx, , wz] = water?.translation ?? [Number.NaN, 0, Number.NaN];
  const plate = murciaConfig.contentBounds;
  check(
    'the campus stands on the authored plate',
    wx >= plate.minX && wx <= plate.maxX && wz >= plate.minZ && wz <= plate.maxZ,
    `campus origin (${wx.toFixed(1)}, ${wz.toFixed(1)}) in plate ` +
      `X [${plate.minX.toFixed(1)}, ${plate.maxX.toFixed(1)}] Z [${plate.minZ.toFixed(1)}, ${plate.maxZ.toFixed(1)}]`,
  );
}

// --- 5b. The blog's entry point ---------------------------------------------
//
// The blog is reachable from the city through exactly one cluster, and a
// re-export that renames or removes it takes the way in with it. That failure
// is silent in the worst way: the city still loads, the district still works,
// and the only symptom is a building that quietly stopped doing anything.
//
// BOTH runtime spellings are asserted, and the second is the whole point:
// `blog_edificios.001` is renamed by GLTFLoader to `blog_edificios001`, and the
// 2026-08-11 audit recorded exactly that biting on this same cluster.

section("5b. The blog's entry point (blogDisplayConfig.ts — names ARE the identity)");

for (const configured of BLOG_BUILDING_NODE_NAMES) {
  const matches = nodesNamed(configured);
  check(
    `"${configured}" is in the GLB`,
    matches.length > 0,
    matches.length > 0
      ? `as ${list(matches)}`
      : 'the blog has no way in from the city — see murcia/blogDisplay/blogDisplayConfig.ts',
  );
}

// --- 5d. The Vertigo building -----------------------------------------------
//
// The client's own tower: its sign turns (createTowerLogo) and its LED screen
// runs the tower's compositions (towerScreen/attachTowerScreen). Both are found
// by NAME and both degrade to a still, dark building when the name is gone —
// which is the quiet failure this section exists to catch. The contract the
// names stand for (logo pivots at their own centres with identity rotation, a
// screen with physical-aspect UVs) is written out in
// landmark/vertigoBuildingConfig.ts; a JSON read can assert the names and the
// logo's identity transform, and does.

section('5d. The Vertigo building (landmark/vertigoBuildingConfig — names ARE the identity)');

for (const configured of new Set(VERTIGO_BUILDING.logoNodeNames)) {
  const matches = nodesNamed(configured);
  check(
    `"${configured}" is in the GLB`,
    matches.length > 0,
    matches.length > 0
      ? `as ${list(matches)}`
      : 'the logo stands still or the screen goes blank — see murcia/landmark/vertigoBuildingConfig.ts',
  );
  // The spin composes onto whatever the node carries, so an authored rotation
  // would not break it — but it would mean the mark no longer turns about the
  // vertical, which is the thing worth being told about.
  const authored = nodes.filter((n) => n.name === configured);
  const identity = authored.every((n) => n.rotation === undefined && n.scale === undefined);
  check(
    `"${configured}" carries no authored rotation or scale`,
    identity,
    identity ? 'identity, so local +Y is vertical' : 'the mark would turn off the vertical',
  );
}

// The screen, by name only. It is a part of the tower and is exported with the
// tower's own turn, and nothing reads its orientation — the compositions ride
// its UVs — so the logo's identity rule would be a false failure here.
{
  const screens = nodesNamed(VERTIGO_BUILDING.screenNodeName);
  check(
    `"${VERTIGO_BUILDING.screenNodeName}" is in the GLB`,
    screens.length > 0,
    screens.length > 0
      ? `as ${list(screens)}`
      : "the tower's screen stays dark — see murcia/landmark/vertigoBuildingConfig.ts",
  );
  // The set the config names has to be there: the facade measures the screen
  // through it, and the wrong set reads as a 1 m × 800 m screen — a 2 px canvas
  // that renders black (2026-09-11, the first v7 load).
  const screenUv = `TEXCOORD_${VERTIGO_BUILDING.screenUvChannel}`;
  const screenNode = nodes.find(
    (n) => n.name != null && PropertyBinding.sanitizeNodeName(n.name) === VERTIGO_BUILDING.screenNodeName,
  );
  const screenPrims = screenNode?.mesh != null ? (meshes[screenNode.mesh]?.primitives ?? []) : [];
  check(
    `"${VERTIGO_BUILDING.screenNodeName}" carries ${screenUv}, the set vertigoBuildingConfig names as the screen`,
    screenPrims.length > 0 && screenPrims.every((p) => attributeNames(p).has(screenUv)),
    screenPrims.length === 0 ? 'no screen mesh to read' : `${screenPrims.length} primitive(s)`,
  );
}

// --- 7. The outer ground ----------------------------------------------------
// A NAME section, so it runs under --contract-only and gates the build.
//
// Murcia's camera rests at 19 degrees, which puts the horizon in frame. That is
// only affordable because `SUELO_CIUDAD` extends 741 units past the authored
// plate in its thinnest direction and the terrain skirt wraps THAT. Shrink it,
// rename it, or drop it in a re-export and the low pose starts showing the edge
// of the world — on wide viewports first, silently, exactly the way
// PROJECT_MEMORY's "the number that can hurt you" describes.
//
// `murciaConfig.groundBounds` is the rectangle `checks/footprint.ts` measures
// against, and it cannot open a GLB. This is the assertion that keeps the two in
// step: the shipped file must cover what the config claims.

section('7. The outer ground (murciaConfig.groundBounds — the low pose rests on it)');

// The authored plate, which is a separate name from the outer ground and is
// what `createTerrainTransition` looks up to decide where the skirt starts. It
// is the exact lookup that cost this project the navigable area once already —
// the plate was found by a name the exporter had rewritten — so it is asserted
// here beside the ground rather than left to the runtime to discover.
const plateName = murciaConfig.terrainTransition.terrainObjectName;
const plateNodes = nodesNamed(plateName);
check(
  `the authored plate "${plateName}" is in the GLB`,
  plateNodes.length > 0,
  plateNodes.length > 0
    ? `as ${list(plateNodes)}`
    : 'the terrain transition has nothing to fade from — see ' +
      'murciaConfig.terrainTransition.terrainObjectName',
);

const groundName = murciaConfig.terrainTransition.groundObjectName;
const claimed = murciaConfig.groundBounds;

if (groundName === null || claimed === null) {
  console.log('        no outer ground configured — the plate is the whole world');
} else {
  const groundNodes = nodesNamed(groundName);
  check(
    `"${groundName}" is in the GLB`,
    groundNodes.length > 0,
    groundNodes.length > 0
      ? `as ${list(groundNodes)}`
      : 'the skirt would fall back to wrapping the plate and the filler city would end in a ' +
        'hard edge — see murciaConfig.terrainTransition.groundObjectName',
  );

  const measured = groundNodes.length > 0 ? worldXzBounds(groundName) : null;
  check(
    'it covers the rectangle murciaConfig.groundBounds claims',
    measured !== null &&
      measured.minX <= claimed.minX + TOLERANCE &&
      measured.maxX >= claimed.maxX - TOLERANCE &&
      measured.minZ <= claimed.minZ + TOLERANCE &&
      measured.maxZ >= claimed.maxZ - TOLERANCE,
    measured === null
      ? 'no POSITION accessor with bounds — cannot measure it'
      : `GLB X [${measured.minX.toFixed(0)}, ${measured.maxX.toFixed(0)}] ` +
        `Z [${measured.minZ.toFixed(0)}, ${measured.maxZ.toFixed(0)}] vs config ` +
        `X [${claimed.minX.toFixed(0)}, ${claimed.maxX.toFixed(0)}] ` +
        `Z [${claimed.minZ.toFixed(0)}, ${claimed.maxZ.toFixed(0)}]`,
  );
}

// ---------------------------------------------------------------------------
// The ring the camera may be PUSHED into (DECISIONS §40).
//
// `murciaConfig.navigation.extendedBounds` is a rectangle measured out of this
// mesh and then written down, exactly as `groundBounds` was, because the harness
// that uses it cannot open a GLB. The rule it encodes is "the eye may leave the
// authored plate, but only onto built city" — so if a re-export shrinks or moves
// the ring, the rectangle stops describing anything and the camera can be pushed
// out over nothing. Nothing at runtime looks this node up by name; this check is
// the only thing keeping the number honest.

section('7b. The A2 ring (the ground the navigable rectangle stands on)');

// The ring is found by the nodes that CARRY it, not by the name it was
// measured under. `CITY_A2_SIMPLIFIED` was its own node in city-prototype.glb;
// v5 and v6 joined it into `Edificios_Procedurales` (X [-463.5, -56.1]
// Z [70.2, 490.3], within 0.4 of CITY_A2); v7 splits that same mesh into the
// four baked chunks, one per quadrant, and the ring is their union. So the rule
// this section guards — the eye may leave the plate only onto BUILT city —
// still has something built to point at, and the check reads the same
// rectangle it always did. Asserting the ground plate instead would have kept
// it green on bare filler ground, which is exactly what §40 rules out.
const RING_NODES = ['Assets_Static_NW', 'Assets_Static_NE', 'Assets_Static_SW', 'Assets_Static_SE'];
const ringClaimed = CITY_A2;
const ringNodes = RING_NODES.flatMap((name) => nodesNamed(name));

check(
  `the four baked chunks ${list(RING_NODES)} are in the GLB`,
  ringNodes.length === RING_NODES.length,
  ringNodes.length === RING_NODES.length
    ? `as ${list(ringNodes)}`
    : `found ${ringNodes.length}/${RING_NODES.length} — the navigable rectangle would extend the ` +
      'camera out over ground with nothing built on it — see CITY_A2 in murciaConfig',
);

/** The union of several nodes' rectangles, or null if any cannot be measured. */
function unionXzBounds(names: string[]): ReturnType<typeof worldXzBounds> {
  const rects = names.map(worldXzBounds);
  if (rects.some((r) => r === null)) return null;
  const all = rects as Array<NonNullable<(typeof rects)[number]>>;
  return {
    minX: Math.min(...all.map((r) => r.minX)),
    maxX: Math.max(...all.map((r) => r.maxX)),
    minZ: Math.min(...all.map((r) => r.minZ)),
    maxZ: Math.max(...all.map((r) => r.maxZ)),
  };
}

const ringMeasured = ringNodes.length === RING_NODES.length ? unionXzBounds(RING_NODES) : null;
check(
  'it covers the rectangle CITY_A2 claims',
  ringMeasured !== null &&
    ringMeasured.minX <= ringClaimed.minX + TOLERANCE &&
    ringMeasured.maxX >= ringClaimed.maxX - TOLERANCE &&
    ringMeasured.minZ <= ringClaimed.minZ + TOLERANCE &&
    ringMeasured.maxZ >= ringClaimed.maxZ - TOLERANCE,
  ringMeasured === null
    ? 'no POSITION accessor with bounds — cannot measure it'
    : `GLB X [${ringMeasured.minX.toFixed(1)}, ${ringMeasured.maxX.toFixed(1)}] ` +
      `Z [${ringMeasured.minZ.toFixed(1)}, ${ringMeasured.maxZ.toFixed(1)}] vs config ` +
      `X [${ringClaimed.minX.toFixed(1)}, ${ringClaimed.maxX.toFixed(1)}] ` +
      `Z [${ringClaimed.minZ.toFixed(1)}, ${ringClaimed.maxZ.toFixed(1)}]`,
);

check(
  'and it wraps the authored plate rather than sitting beside it',
  ringClaimed.minX < murciaConfig.contentBounds.minX &&
    ringClaimed.maxX > murciaConfig.contentBounds.maxX &&
    ringClaimed.minZ < murciaConfig.contentBounds.minZ &&
    ringClaimed.maxZ > murciaConfig.contentBounds.maxZ,
  `margins -X ${(murciaConfig.contentBounds.minX - ringClaimed.minX).toFixed(1)} ` +
    `+X ${(ringClaimed.maxX - murciaConfig.contentBounds.maxX).toFixed(1)} ` +
    `-Z ${(murciaConfig.contentBounds.minZ - ringClaimed.minZ).toFixed(1)} ` +
    `+Z ${(ringClaimed.maxZ - murciaConfig.contentBounds.maxZ).toFixed(1)} — ` +
    'the ring is what the grown navigable rectangle stands on, so a ring that does ' +
    'not contain the plate would put the viewer over nothing on whichever side it fell short',
);

{
  // THE ASSERTION THAT REPLACED §40's.
  //
  // The band the ring used to bound is gone; what remains is the grown
  // rectangle the viewer's navigation target is clamped to, and it has to stand
  // on ground that exists in the shipped file. Derived the same way
  // MurciaExperience derives it, so a change to `boundsInset` is caught here
  // rather than by eye.
  const navigable = expandRect(
    murciaConfig.navigation.bounds,
    -murciaConfig.navigation.boundsInset,
  );
  check(
    'the grown navigable rectangle stands on the ring',
    navigable.minX >= ringClaimed.minX - TOLERANCE &&
      navigable.maxX <= ringClaimed.maxX + TOLERANCE &&
      navigable.minZ >= ringClaimed.minZ - TOLERANCE &&
      navigable.maxZ <= ringClaimed.maxZ + TOLERANCE,
    `navigable X [${navigable.minX.toFixed(1)}, ${navigable.maxX.toFixed(1)}] ` +
      `Z [${navigable.minZ.toFixed(1)}, ${navigable.maxZ.toFixed(1)}] inside ring ` +
      `X [${ringClaimed.minX.toFixed(1)}, ${ringClaimed.maxX.toFixed(1)}] ` +
      `Z [${ringClaimed.minZ.toFixed(1)}, ${ringClaimed.maxZ.toFixed(1)}]`,
  );
}

// --- 6. Samplers ------------------------------------------------------------
// Reported, never asserted. Blender's Image Texture *Extension* is per-node and
// cannot express the split the banded atlas needs — repeat along U so trims tile
// with facade length, clamp along V so bands never bleed into each other. That
// split is applied at load in `loadCity.ts`, and is the single deliberate
// exception to "Blender owns the sampling".

if (!CONTRACT_ONLY) {
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

}

finish();
