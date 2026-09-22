"""Selective v5.1 r3 delivery. Run with Blender 5.1 --background --disable-autoexec.

--python scripts/rebake-city-lightmaps.py -- --source <blend> --baseline <r2>
  --out <new revision directory> --stage prepare|bake|compress|export|verify|finalize

The source and baseline are read-only. The current authored stadium roof is
included without the historical animation repair or any placement adjustment.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--stage', choices=['prepare', 'bake', 'compress', 'export', 'verify', 'finalize'], required=True)
parser.add_argument('--ktx-bin', type=Path, default=Path('C:/Program Files/KTX-Software/bin'))
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.source, args.baseline, args.out = [p.resolve() for p in [args.source, args.baseline, args.out]]
assert args.source.is_file() and args.baseline.is_dir()
assert args.out != args.baseline and not args.out.is_relative_to(args.baseline)
assert not args.source.is_relative_to(args.out), 'Never write over the authoring source'
for sub in ['', 'web', 'masters', 'qa']:
    (args.out / sub).mkdir(parents=True, exist_ok=True)

REBAKE = ['static-NW', 'static-NE', 'outer-buildings', 'ground-Outer', 'ground-NW', 'instances-0', 'instances-1']
REPACK = ['static-NW', 'ground-Outer']

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf8'))

def write(path, value):
    path.write_text(json.dumps(value, indent=2), encoding='utf8')

source_hash = sha(args.source)
baseline_hash = sha(args.baseline / 'prepare.json')
# This dependency assessment belongs to these exact inputs. A future source
# needs a new geometry/lighting comparison before reusing any of its maps.
assert source_hash == 'ffbc85f3632b3595686a5c427933ead726ff38a0c5a52a8a573d70e2e40a2783', 'Source differs from the assessed r3 input'
assert baseline_hash == 'ebee89a375d0886da1d6e874b31760fb64b55fc9d4346b007df6f3c066ae9d93', 'Baseline differs from the assessed r2 delivery'
helper_path = args.baseline / 'assets_common.py'
spec = importlib.util.spec_from_file_location('lightmap_assets_common', helper_path)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

def open_blend(path, scene_name):
    bpy.ops.wm.open_mainfile(filepath=str(path), use_scripts=False)
    scene = bpy.data.scenes[scene_name]
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    return scene

def matrix(ob):
    return [list(row) for row in ob.matrix_world]

def uv_hash(ob):
    return hashlib.sha256(helper.array(ob.data.uv_layers['LightmapUV'].data, 'uv', 2).tobytes()).hexdigest()

def bounds(ob):
    points = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
    return [[min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)]

def canonical_materials(mesh):
    for i, mat in enumerate(mesh.materials):
        if mat and mat.name[-4:-3] == '.' and mat.name[-3:].isdigit():
            original = bpy.data.materials.get(mat.name[:-4])
            if original:
                mesh.materials[i] = original

def prepared_path():
    return args.out / 'murcia-v5.1-lightmaps.blend'

def validate_revision():
    revision = read(args.out / 'revision.json')
    assert revision['sourceSHA256'] == source_hash, 'Source changed; start a new revision'
    assert revision['baselinePrepareSHA256'] == baseline_hash
    assert revision['preparedSHA256'] == sha(prepared_path()), 'Prepared scene changed after approval'
    return revision

def prepare():
    assert not (args.out / 'revision.json').exists(), 'Preparation already exists; do not overwrite a bake'
    old = read(args.baseline / 'prepare.json')
    manifest = read(args.baseline / 'web/lightmaps.json')
    source_scene = open_blend(args.source, 'Scene')
    dg = bpy.context.evaluated_depsgraph_get()
    roof = source_scene.objects['estadio-techo']
    assert roof.visible_get() and not roof.hide_render
    assert not roof.animation_data and not roof.constraints and not roof.modifiers
    roof_source = {'matrix': matrix(roof), 'bounds': bounds(roof)}
    changed_names = [n for n in old['objects'] if 'JMC' in n]
    changed_names += ['CITY_C_SIMPLIFIED', 'rio', 'suelo-principal', 'caminata-rio', 'estadio-techo']
    snapshot = []
    source_rows = {}
    for name in changed_names:
        original = source_scene.objects[name]
        mesh = bpy.data.meshes.new_from_object(original.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        mesh.calc_loop_triangles()
        source_rows[name] = {'triangles': len(mesh.loop_triangles), 'matrix': matrix(original), 'dataHash': helper.digest(mesh)}
        ob = bpy.data.objects.new('R3_SNAPSHOT_' + name, mesh)
        ob.matrix_world = original.matrix_world.copy()
        ob['source_name'] = name
        snapshot.append(ob)
    bpy.data.libraries.write(str(args.out / 'source-snapshot.blend'), set(snapshot))
    scene = open_blend(args.baseline / 'murcia-v5.1-lightmaps.blend', 'Murcia Lightmaps')
    old_uv = {n: uv_hash(scene.objects[n]) for a in old['atlases'].values() for n in a['objects']}
    with bpy.data.libraries.load(str(args.out / 'source-snapshot.blend'), link=False) as (available, target):
        target.objects = [n for n in available.objects if n.startswith('R3_SNAPSHOT_')]
    incoming = {ob['source_name']: ob for ob in target.objects}
    for ob in incoming.values():
        canonical_materials(ob.data)

    for name in changed_names:
        ob = incoming[name]
        source_matrix = Matrix(source_rows[name]['matrix'])
        if 'JMC' in name:
            dest = scene.objects[name]
            assert helper.digest(dest.data) == source_rows[name]['dataHash'], name
            dest.matrix_world = source_matrix
        elif name == 'CITY_C_SIMPLIFIED':
            dest = scene.objects[name]
            assert len(dest.data.vertices) == len(ob.data.vertices)
            assert np.array_equal(helper.array(dest.data.loops, 'vertex_index', 1, np.int32), helper.array(ob.data.loops, 'vertex_index', 1, np.int32))
            dest.data.vertices.foreach_set('co', helper.array(ob.data.vertices, 'co', 3).ravel())
            dest.data.update()
            assert helper.digest(dest.data) == source_rows[name]['dataHash']
        elif name == 'rio':
            dest = scene.objects[name]
            dest.data = ob.data.copy()
            dest.matrix_world = source_matrix
        elif name == 'estadio-techo':
            prior = bpy.data.objects.get(name)
            if prior:
                prior.name = 'Authoring__excluded-roof'
            roof = bpy.data.objects.new(name, ob.data.copy())
            scene.collection.objects.link(roof)
            roof.matrix_world = source_matrix
            helper.add_uv(roof.data)
            # An unassigned Blender surface uses the default diffuse shader.
            # Make that appearance explicit for baking and glTF, without
            # borrowing the old repair's roof color or changing the geometry.
            if not roof.data.materials:
                material = bpy.data.materials.new('MURCIA_Stadium_Roof_Default')
                material.use_nodes = True
                roof.data.materials.append(material)
            if not roof.data.color_attributes:
                colors = roof.data.color_attributes.new(name='Vertex_Color', type='BYTE_COLOR', domain='CORNER')
                for value in colors.data:
                    value.color = (1, 1, 1, 1)
                roof.data.color_attributes.active_color = colors
            roof['source_name'] = name
            roof['lightmap_atlas'] = 'static-NW'
            old['atlases']['static-NW']['objects'].append(name)
            bpy.context.view_layer.update()
            assert np.max(np.abs(np.array(matrix(roof)) - np.array(roof_source['matrix']))) < 1e-5, (matrix(roof), roof_source['matrix'])
        else:
            # Match the original partition, replacing only the changed Outer receiver.
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.transform(bm, matrix=source_matrix, verts=list(bm.verts))
            for axis, cuts in [(0, [-470, -260, -50]), (1, [-500, -280, -60])]:
                for cut in cuts:
                    point = Vector((0, 0, 0)); point[axis] = cut
                    normal = Vector((0, 0, 0)); normal[axis] = 1
                    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=point, plane_no=normal, dist=1e-6, clear_inner=False, clear_outer=False)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if helper.inside(f.calc_center_median())], context='FACES')
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
            mesh = bpy.data.meshes.new(name + '__Outer_r3')
            bm.to_mesh(mesh); bm.free(); mesh.update()
            for mat in ob.data.materials:
                mesh.materials.append(mat)
            helper.add_uv(mesh)
            scene.objects[name + '__Outer'].data = mesh
        old['objects'][name] = source_rows[name]

    for atlas in REPACK:
        obs = [scene.objects[n] for n in old['atlases'][atlas]['objects']]
        old['atlases'][atlas]['uvOverlapHistory'] = helper.unwrap(obs, 6 / 2048, 6 / 2048)
    preserved = {}
    for atlas, row in old['atlases'].items():
        if atlas not in REPACK:
            for name in row['objects']:
                assert uv_hash(scene.objects[name]) == old_uv[name], name
                preserved[name] = old_uv[name]
    old['source'] = str(args.source)
    old['sourceSHA256'] = source_hash
    old['excluded'] = [n for n in old['excluded'] if n != 'estadio-techo']
    old['sourceVisibleMeshes'] += 1
    write(args.out / 'prepare.json', old)
    manifest['sourceSHA256'] = source_hash
    manifest['requiredNames'] = sorted(set(manifest['requiredNames']) | {'estadio-techo'})
    manifest['revision'] = 'v5.1-r3'
    reused = {}
    for atlas, row in manifest['atlases'].items():
        if atlas in REBAKE:
            continue
        for variant in row['variants'].values():
            filename = variant['file']
            shutil.copyfile(args.baseline / 'web' / filename, args.out / 'web' / filename)
            reused[filename] = sha(args.out / 'web' / filename)
    write(args.out / 'baseline-manifest.json', manifest)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(prepared_path()))
    revision = {'source': str(args.source), 'sourceSHA256': source_hash, 'baseline': str(args.baseline), 'baselinePrepareSHA256': baseline_hash,
                'preparedSHA256': sha(prepared_path()), 'rebakedAtlases': REBAKE, 'repackedAtlases': REPACK,
                'reusedAtlases': sorted(set(old['atlases']) - set(REBAKE)), 'reusedFiles': reused,
                'preservedUV': preserved, 'roofSource': roof_source, 'changedSourceObjects': source_rows,
                'instancesUnchanged': old['sourceInstances'], 'instanceLightingReason': 'Instances near the stadium and JMC occur in atlases 0 and 1; rebake their entire atlases to update received shadows.'}
    write(args.out / 'revision.json', revision)
    assert sha(args.source) == source_hash
    print('PREPARE_COMPLETE', json.dumps({'rebake': REBAKE, 'reuse': revision['reusedAtlases']}), flush=True)

def gpu(scene):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 512
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = .005
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'HIP'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == 'HIP'
    assert any(d.use for d in prefs.devices), 'HIP GPU unavailable'
    scene.cycles.device = 'GPU'

def bake():
    revision = validate_revision()
    scene = open_blend(prepared_path(), 'Murcia Lightmaps')
    gpu(scene)
    prep = read(args.out / 'prepare.json')
    progress_path = args.out / 'bake-progress.json'
    progress = read(progress_path) if progress_path.exists() else {'preparedSHA256': revision['preparedSHA256'], 'atlases': {}}
    assert progress['preparedSHA256'] == revision['preparedSHA256']
    for atlas in REBAKE:
        if atlas in progress['atlases']:
            for filename, fingerprint in progress['atlases'][atlas]['masters'].items():
                assert sha(args.out / 'masters' / filename) == fingerprint
            continue
        started = time.time()
        originals = [scene.objects[n] for n in prep['atlases'][atlas]['objects']]
        copies = []
        visibility = {o.name: o.hide_render for o in originals}
        for ob in originals:
            clone = ob.copy(); clone.data = ob.data.copy()
            scene.collection.objects.link(clone)
            clone.parent = None; clone.matrix_world = ob.matrix_world.copy()
            clone.hide_render = False; copies.append(clone); ob.hide_render = True
        target = helper.join(copies, 'LM_TRANSIENT_BAKE_TARGET')
        materials = {}
        for slot in target.material_slots:
            mat = slot.material
            if mat.name not in materials:
                materials[mat.name] = mat.copy()
            slot.material = materials[mat.name]
        image = bpy.data.images.new(atlas, 2048, 2048, alpha=False, float_buffer=True)
        image.colorspace_settings.name = 'Linear Rec.709'
        for mat in materials.values():
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    node.inputs['Metallic'].default_value = 0
                    node.inputs['Transmission Weight'].default_value = 0
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = image
            mat.node_tree.nodes.active = tex
        target.data.uv_layers.active_index = 1
        target.data.uv_layers[0].active_render = True
        print('BAKE_START', atlas, flush=True)
        try:
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, uv_layer='LightmapUV', margin=4, margin_type='EXTEND', use_clear=True)
        finally:
            for ob in originals:
                ob.hide_render = visibility[ob.name]
        pixels = np.empty(len(image.pixels), np.float32)
        image.pixels.foreach_get(pixels); pixels = pixels.reshape(-1, 4)
        maximum = float(pixels[:, :3].max())
        assert np.isfinite(pixels).all() and maximum > .01
        scale = float(2 ** math.ceil(math.log2(max(1, maximum))))
        settings = scene.render.image_settings
        settings.file_format = 'OPEN_EXR'; settings.color_mode = 'RGB'; settings.color_depth = '16'; settings.exr_codec = 'ZIP'
        image.save_render(str(args.out / 'masters' / (atlas + '.exr')), scene=scene)
        pixels[:, :3] = np.clip(pixels[:, :3] / scale, 0, 1); pixels[:, 3] = 1
        scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
        settings.file_format = 'PNG'; settings.color_depth = '8'; settings.compression = 100
        masters = {atlas + '.exr': sha(args.out / 'masters' / (atlas + '.exr'))}
        for size in [2048, 1024]:
            web_image = bpy.data.images.new(atlas + '-web', 2048, 2048, alpha=False, float_buffer=True)
            web_image.colorspace_settings.name = 'Linear Rec.709'; web_image.pixels.foreach_set(pixels.ravel())
            if size == 1024:
                web_image.scale(size, size)
            filename = f'{atlas}-{size}.png'
            web_image.save_render(str(args.out / 'masters' / filename), scene=scene)
            masters[filename] = sha(args.out / 'masters' / filename)
            bpy.data.images.remove(web_image)
        bpy.data.objects.remove(target, do_unlink=True)
        for mat in materials.values():
            if not mat.users:
                bpy.data.materials.remove(mat)
        bpy.data.images.remove(image)
        progress['atlases'][atlas] = {'linearScale': scale, 'threeLightMapIntensity': math.pi * scale, 'maximum': maximum, 'seconds': time.time() - started, 'masters': masters}
        write(progress_path, progress)
        print('BAKE_DONE', atlas, progress['atlases'][atlas]['seconds'], flush=True)
    assert sha(args.source) == source_hash

def compress():
    revision = validate_revision()
    manifest = read(args.out / 'baseline-manifest.json')
    baked = read(args.out / 'bake-progress.json')
    assert baked['preparedSHA256'] == revision['preparedSHA256'] and set(baked['atlases']) == set(REBAKE)
    candidates_path = args.out / 'qa/compression-candidates.json'
    candidates = read(candidates_path) if candidates_path.exists() else {}
    for atlas in REBAKE:
        for size in [1024, 2048]:
            png = args.out / 'masters' / f'{atlas}-{size}.png'
            fingerprint = sha(png)
            assert fingerprint == baked['atlases'][atlas]['masters'][png.name]
            old_variant = manifest['atlases'][atlas]['variants'][str(size)]
            # Keep the old quality as a candidate; lower alternatives are used only if needed.
            old_quality = old_variant.get('qlevel') if old_variant.get('codec') != 'uastc' else 'uastc'
            qualities = list(dict.fromkeys([old_quality, 128, 80, 48, 24, 8]))
            key = f'{atlas}-{size}'
            entry = candidates.setdefault(key, {'masterSHA256': fingerprint, 'rows': []})
            assert entry['masterSHA256'] == fingerprint, 'Stale compression candidates'
            image = bpy.data.images.load(str(png), check_existing=False)
            image.colorspace_settings.name = 'Non-Color'
            values = np.empty(len(image.pixels), np.float32); image.pixels.foreach_get(values)
            original = values.reshape(-1, 4)[:, :3].copy(); bpy.data.images.remove(image)
            mask = original.max(1) > .02
            for quality in qualities:
                if any(c['quality'] == quality for c in entry['rows']):
                    continue
                filename = f'{key}-q{quality}.ktx2'; dest = args.out / 'qa' / filename
                cmd = [str(args.ktx_bin / 'toktx.exe'), '--t2']
                if quality == 'uastc':
                    cmd += ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '.5', '--zcmp', '18']
                else:
                    cmd += ['--encode', 'etc1s', '--qlevel', str(quality), '--endpoint_rdo_threshold', '1.25', '--selector_rdo_threshold', '1.25', '--clevel', '2']
                if old_variant['mipLevels'] == 2:
                    cmd += ['--mipmap', '--levels', '2']
                cmd += ['--target_type', 'RGB', '--assign_oetf', 'srgb', '--threads', '8', str(dest), str(png)]
                if old_variant['mipLevels'] == 2:
                    cmd += [str(args.out / 'masters' / f'{atlas}-1024.png')]
                subprocess.run(cmd, check=True)
                subprocess.run([str(args.ktx_bin / 'ktx.exe'), 'validate', str(dest)], check=True)
                decoded = dest.with_suffix('.png')
                subprocess.run([str(args.ktx_bin / 'ktx.exe'), 'extract', '--transcode', 'rgb8', '--level', '0', str(dest), str(decoded)], check=True)
                im = bpy.data.images.load(str(decoded), check_existing=False); im.colorspace_settings.name = 'Non-Color'
                a = np.empty(len(im.pixels), np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
                mse = float(np.mean((a.reshape(-1, 4)[mask, :3] - original[mask]) ** 2))
                entry['rows'].append({'quality': quality, 'bytes': dest.stat().st_size, 'mse': mse, 'file': filename, 'sha256': sha(dest)})
                write(candidates_path, candidates)
                print('CANDIDATE', key, quality, dest.stat().st_size, flush=True)
    selection = {}
    for size, budget in [(1024, 2_000_000), (2048, 4_000_000)]:
        fixed = sum(row['variants'][str(size)]['bytes'] for key, row in manifest['atlases'].items() if key not in REBAKE)
        states = {0: (0, [])}
        for atlas in REBAKE:
            nxt = {}
            for cost, (score, path) in states.items():
                for c in candidates[f'{atlas}-{size}']['rows']:
                    new_cost = cost + math.ceil(c['bytes'] / 1000)
                    if new_cost * 1000 + fixed > budget:
                        continue
                    weight = .45 if atlas in ['outer-buildings', 'ground-Outer'] else 1
                    value = score - weight * c['mse']
                    if new_cost not in nxt or value > nxt[new_cost][0]:
                        nxt[new_cost] = (value, path + [c])
            assert nxt, f'{size}: no compression solution within budget'
            best = -float('inf'); states = {}
            for cost, row in sorted(nxt.items()):
                if row[0] > best:
                    states[cost] = row; best = row[0]
        _, chosen = max(states.values(), key=lambda row: row[0])
        for atlas, c in zip(REBAKE, chosen):
            assert sha(args.out / 'qa' / c['file']) == c['sha256']
            variant = manifest['atlases'][atlas]['variants'][str(size)]
            shutil.copyfile(args.out / 'qa' / c['file'], args.out / 'web' / variant['file'])
            shutil.copyfile((args.out / 'qa' / c['file']).with_suffix('.png'), args.out / 'masters' / f'{atlas}-{size}-final-decoded.png')
            variant.update(bytes=c['bytes'], codec='uastc' if c['quality'] == 'uastc' else 'etc1s', qlevel=None if c['quality'] == 'uastc' else c['quality'])
            for field in ['endpointRDO', 'selectorRDO', 'uastcRDO', 'zstdLevel']:
                variant.pop(field, None)
            variant.update({'uastcRDO': .5, 'zstdLevel': 18} if c['quality'] == 'uastc' else {'endpointRDO': 1.25, 'selectorRDO': 1.25})
            selection[f'{atlas}-{size}'] = c
        total = sum(row['variants'][str(size)]['bytes'] for row in manifest['atlases'].values())
        assert total <= budget
        profile = 'mobile' if size == 1024 else 'desktop'
        manifest['profiles'][profile]['totalBytes'] = total
        manifest['totals'][str(size)] = total
    for atlas in REBAKE:
        manifest['atlases'][atlas].update({k: v for k, v in baked['atlases'][atlas].items() if k != 'masters'})
    manifest['rebakedAtlases'] = REBAKE
    manifest['reusedAtlases'] = revision['reusedAtlases']
    write(args.out / 'web/lightmaps.json', manifest)
    write(args.out / 'compression-verification.json', selection)
    print('COMPRESSION_COMPLETE', manifest['totals'], flush=True)

def export():
    validate_revision()
    open_blend(prepared_path(), 'Murcia Lightmaps')
    # Retain the established Draco and EXT_mesh_gpu_instancing exporter.
    script = (args.baseline / 'export.py').read_text(encoding='utf8')
    needle = 'export_lights=False,export_cameras=False,**kw'
    assert script.count(needle) == 1
    script = script.replace(needle, 'export_lights=False,export_cameras=False,export_animations=False,**kw')
    path = args.out / 'export.py'
    path.write_text(script, encoding='utf8')
    exec(compile(script, str(path), 'exec'), {'__file__': str(path), '__name__': '__main__'})
    for filename in ['web/murcia-city-draco.glb', 'qa/murcia-city.glb']:
        data = (args.out / filename).read_bytes()
        length = struct.unpack_from('<I', data, 12)[0]
        doc = json.loads(data[20:20 + length])
        assert not doc.get('animations'), 'Static city export must not contain animation clips'
        roofs = [n for n in doc['nodes'] if n.get('extras', {}).get('runtime_name', n.get('name')) == 'estadio-techo']
        assert len(roofs) == 1 and roofs[0]['extras']['lightmap_atlas'] == 'static-NW'
    print('ROOF_EXPORTED_WITHOUT_ANIMATION', flush=True)

def finalize():
    revision = validate_revision()
    scene = open_blend(prepared_path(), 'Murcia Lightmaps')
    prep = read(args.out / 'prepare.json')
    manifest = read(args.out / 'web/lightmaps.json')
    for filename, fingerprint in revision['reusedFiles'].items():
        assert sha(args.out / 'web' / filename) == fingerprint
    # Retain complete masters for the unchanged atlases as future authoring inputs.
    for atlas in revision['reusedAtlases']:
        filenames = [atlas + '.exr'] + [f'{atlas}-{size}{suffix}.png'
                    for size in [1024, 2048] for suffix in ['', '-final-decoded']]
        for filename in filenames:
            shutil.copyfile(args.baseline / 'masters' / filename, args.out / 'masters' / filename)
    shutil.copyfile(helper_path, args.out / 'assets_common.py')
    pipeline = Path(__file__).resolve()
    if pipeline != args.out / pipeline.name:
        shutil.copyfile(pipeline, args.out / pipeline.name)
    script = (args.baseline / 'finalize.py').read_text(encoding='utf8')
    # Finalization packs the textures and saves a reviewable blend; no automatic render.
    script = script[:script.index("s.render.engine='CYCLES'")]
    path = args.out / 'finalize.py'; path.write_text(script, encoding='utf8')
    exec(compile(script, str(path), 'exec'), {'__file__': str(path), '__name__': '__main__'})
    assert sha(args.source) == source_hash
    files = {p.name: sha(p) for p in (args.out / 'web').iterdir() if p.is_file()}
    write(args.out / 'delivery-verification.json', {'sourceSHA256': source_hash, 'sourceUnchanged': True, 'files': files, 'roofSource': revision['roofSource'], 'reusedFiles': revision['reusedFiles'], 'rebakedAtlases': REBAKE, 'profiles': manifest['profiles']})
    print('DELIVERY_FINALIZED', manifest['profiles'], flush=True)

def verify():
    revision = validate_revision()
    scene = open_blend(prepared_path(), 'Murcia Lightmaps')
    conversion = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))

    def glb(path):
        data = path.read_bytes()
        length = struct.unpack_from('<I', data, 12)[0]
        return json.loads(data[20:20 + length]), data[28 + length:]

    def accessor(doc, binary, index):
        acc = doc['accessors'][index]
        view = doc['bufferViews'][acc['bufferView']]
        dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[acc['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
        offset = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        itemsize = np.dtype(dtype).itemsize
        return np.ndarray((acc['count'], width), dtype=dtype, buffer=binary, offset=offset,
                          strides=(view.get('byteStride', itemsize * width), itemsize))

    doc, binary = glb(args.out / 'qa/murcia-city.glb')
    assert not doc.get('animations')
    transforms, active = {}, {}

    def walk(index, parent):
        node = doc['nodes'][index]
        if 'matrix' in node:
            local = Matrix(np.array(node['matrix']).reshape(4, 4).T.tolist())
        else:
            from mathutils import Quaternion
            r = node.get('rotation', [0, 0, 0, 1])
            local = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])),
                                      Quaternion((r[3], *r[:3])), Vector(node.get('scale', [1, 1, 1])))
        world = parent @ local
        name = node.get('extras', {}).get('runtime_name', node.get('name'))
        active[name], transforms[name] = node, world
        for child in node.get('children', []):
            walk(child, world)

    for index in doc['scenes'][doc.get('scene', 0)]['nodes']:
        walk(index, Matrix.Identity(4))
    for name, fingerprint in revision['preservedUV'].items():
        assert uv_hash(scene.objects[name]) == fingerprint, name
    checked = {}
    for name, source in revision['changedSourceObjects'].items():
        if name in ['suelo-principal', 'caminata-rio']:
            continue  # Partition equivalence is checked before preparation.
        ob = scene.objects[name]
        assert np.max(np.abs(np.array(matrix(ob)) - np.array(source['matrix']))) < 1e-5, name
        if name != 'estadio-techo':
            assert helper.digest(ob.data) == source['dataHash'], name
        node = active[name]
        expected = conversion @ ob.matrix_world @ conversion.inverted()
        assert np.max(np.abs(np.array(transforms[name]) - np.array(expected))) < .0001, name
        points, triangles = [], 0
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            points.extend(transforms[name] @ Vector(p) for p in accessor(doc, binary, primitive['attributes']['POSITION']))
            triangles += len(accessor(doc, binary, primitive['indices'])) // 3
        assert triangles == source['triangles'], (name, triangles, source['triangles'])
        actual = np.array(points)
        authored = np.array([conversion @ ob.matrix_world @ v.co for v in ob.data.vertices])
        error = float(max(np.max(np.abs(actual.min(0) - authored.min(0))), np.max(np.abs(actual.max(0) - authored.max(0)))))
        assert error < .001, (name, error)
        checked[name] = {'triangles': triangles, 'exportBoundsMaxError': error}
    with bpy.data.libraries.load(str(args.out / 'source-snapshot.blend'), link=False) as (available, target):
        target.objects = ['R3_SNAPSHOT_estadio-techo']
    assert np.array_equal(helper.array(scene.objects['estadio-techo'].data.vertices, 'co', 3),
                          helper.array(target.objects[0].data.vertices, 'co', 3))
    old_doc, old_binary = glb(args.baseline / 'web/murcia-city-draco.glb')
    old_groups = {n['name']: n for n in old_doc['nodes'] if 'EXT_mesh_gpu_instancing' in n.get('extensions', {})}
    count = groups = 0
    for name, node in active.items():
        attrs = node.get('extensions', {}).get('EXT_mesh_gpu_instancing', {}).get('attributes')
        if not attrs:
            continue
        previous = old_groups[name]['extensions']['EXT_mesh_gpu_instancing']['attributes']
        for key, index in attrs.items():
            assert np.array_equal(accessor(doc, binary, index), accessor(old_doc, old_binary, previous[key])), (name, key)
        count += doc['accessors'][attrs['TRANSLATION']]['count']; groups += 1
    assert count == revision['instancesUnchanged'] and groups == len(old_groups)
    write(args.out / 'geometry-verification.json', {'sourceSHA256': source_hash, 'changedObjects': checked,
          'roofVerticesMatchSource': True, 'preservedUVReceivers': len(revision['preservedUV']),
          'unchangedInstanceTransformsAndLightmapRectangles': count, 'instanceGroups': groups, 'animationClips': 0})
    print('GEOMETRY_VERIFIED', len(checked), count, groups, flush=True)


globals()[args.stage]()
