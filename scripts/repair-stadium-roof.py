"""Run with Blender --background --disable-autoexec <prepared.blend> --python
this-file -- --delivery <lightmaps-v2 directory> --project <repo> --out <staging>.

Repairs the omitted authoring roof, exports only that mesh and rebakes the
affected atlases. All outputs stay in staging; authoring files are never saved.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import time

import bpy
import numpy as np
from mathutils import Vector


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def read_glb(path):
    data = path.read_bytes()
    assert struct.unpack_from('<III', data) == (0x46546C67, 2, len(data))
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20 + length])
    offset = 20 + length
    length, kind = struct.unpack_from('<II', data, offset)
    assert kind == 0x004E4942
    return document, data[offset + 8:offset + 8 + length]


def append_roof(base_path, roof_path, output):
    base, binary = read_glb(base_path)
    addition, extra_binary = read_glb(roof_path)
    original = copy.deepcopy(base)
    assert not any(n.get('name') == 'estadio-techo' for n in base['nodes'])
    offsets = {key: len(base[key]) for key in ['nodes', 'meshes', 'accessors', 'bufferViews']}
    for view in addition['bufferViews']:
        assert view['buffer'] == 0
        view['byteOffset'] = view.get('byteOffset', 0) + len(binary)
    for accessor in addition['accessors']:
        assert 'sparse' not in accessor
        if 'bufferView' in accessor:
            accessor['bufferView'] += offsets['bufferViews']
    for mesh in addition['meshes']:
        for primitive in mesh['primitives']:
            primitive['attributes'] = {k: v + offsets['accessors'] for k, v in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] += offsets['accessors']
            primitive['material'] = 0
            draco = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if draco:
                draco['bufferView'] += offsets['bufferViews']
    for node in addition['nodes']:
        if 'mesh' in node:
            node['mesh'] += offsets['meshes']
        if 'children' in node:
            node['children'] = [n + offsets['nodes'] for n in node['children']]
    for key in offsets:
        base[key].extend(addition[key])
        assert base[key][:offsets[key]] == original[key], key
    base['scenes'][base.get('scene', 0)]['nodes'].extend(
        n + offsets['nodes'] for n in addition['scenes'][addition.get('scene', 0)]['nodes'])
    for key in ['extensionsUsed', 'extensionsRequired']:
        for extension in addition.get(key, []):
            if extension not in base.setdefault(key, []):
                base[key].append(extension)
    combined = binary + extra_binary
    base['buffers'][0]['byteLength'] = len(combined)
    document = json.dumps(base, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    document += b' ' * (-len(document) % 4)
    combined += b'\0' * (-len(combined) % 4)
    output.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(document) + len(combined))
                       + struct.pack('<II', len(document), 0x4E4F534A) + document
                       + struct.pack('<II', len(combined), 0x004E4942) + combined)
    assert read_glb(output)[1][:len(binary)] == binary


parser = argparse.ArgumentParser()
parser.add_argument('--delivery', type=Path, required=True)
parser.add_argument('--project', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--base-glb', type=Path, help='Original city GLB without the roof')
parser.add_argument('--resume', action='store_true', help='Reuse completed bakes from this staging directory')
parser.add_argument('--ktx-bin', type=Path, default=Path('C:/Program Files/KTX-Software/bin'))
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.out = args.out.resolve()
args.project = args.project.resolve()
args.delivery = args.delivery.resolve()
args.out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((args.project / 'public/textures/murcia/lightmaps-v2/lightmaps.json').read_text())
completed = json.loads((args.out / 'lightmaps-progress.json').read_text()) if args.resume else None
prep = json.loads((args.delivery / 'prepare.json').read_text())
scene = bpy.data.scenes['Murcia Lightmaps']
bpy.context.window.scene = scene
base = scene.objects['estadio-base']
pillars = scene.objects['estadio-pilares']
authoring = bpy.data.objects['estadio-techo']
authoring.name = 'Authoring__estadio-techo'
roof = authoring.copy()
roof.data = authoring.data.copy()
roof.animation_data_clear()
roof.name = 'estadio-techo'
roof.data.name = 'Nueva Condomina roof'
scene.collection.objects.link(roof)
roof.parent = None
roof.rotation_euler = base.rotation_euler.copy()
roof.scale = (1, 1, 1)
pillar_top = max((pillars.matrix_world @ v.co).z for v in pillars.data.vertices)
roof.location = (base.location.x, base.location.y, pillar_top - min(v.co.z for v in roof.data.vertices))
roof.hide_render = False
roof.hide_set(False)
roof['source_name'] = roof['runtime_name'] = 'estadio-techo'
roof['lightmap_atlas'] = 'stadium-roof'
roof.data.materials.clear()
band = scene.objects['estadio-banda-arriba']
roof.data.materials.append(band.data.materials[0])
color = band.data.color_attributes['Vertex_Color'].data[0].color
colors = roof.data.color_attributes.new(name='Vertex_Color', type='BYTE_COLOR', domain='CORNER')
for value in colors.data:
    value.color = color
roof.data.color_attributes.active_color = colors
for layer in list(roof.data.uv_layers):
    roof.data.uv_layers.remove(layer)
uv0 = roof.data.uv_layers.new(name='UVMap')
for uv in uv0.data:
    uv.uv = (0.5, 0.5)
roof.data.uv_layers.new(name='LightmapUV')
roof.data.uv_layers.active_index = 1
select([roof])
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.025)
bpy.ops.object.mode_set(mode='OBJECT')
roof.data.uv_layers[0].active_render = True
bpy.context.view_layer.update()
assert abs(min((roof.matrix_world @ v.co).z for v in roof.data.vertices) - pillar_top) < 1e-5
roof_path = args.out / 'roof.glb'
bpy.ops.export_scene.gltf(filepath=str(roof_path), export_format='GLB', use_selection=True,
    use_active_scene=True, export_extras=True, export_all_vertex_colors=True,
    export_texcoords=True, export_materials='NONE', export_lights=False, export_cameras=False,
    export_animations=False)
roof_json, _ = read_glb(roof_path)
attributes = roof_json['meshes'][0]['primitives'][0]['attributes']
assert all(k in attributes for k in ['POSITION', 'NORMAL', 'COLOR_0', 'TEXCOORD_0', 'TEXCOORD_1']), attributes
assert abs(roof.location.x - base.location.x) < 1e-5
assert abs(roof.location.y - base.location.y) < 1e-5
assert abs(min((roof.matrix_world @ v.co).z for v in roof.data.vertices) - pillar_top) < 1e-5
input_glb = args.base_glb or args.project / 'public/models/murcia-v4-lightmaps-v2.glb'
input_hash = hashlib.sha256(input_glb.read_bytes()).hexdigest()
assert input_hash == '74689e6b7092a4baf84a5616583db2e381751e5df411bf54aaa18bdb9bff7edf', (
    'This repair requires the original v4/v2 GLB; provide it with --base-glb')
append_roof(input_glb, roof_path, args.out / 'murcia-v4-lightmaps-v2.glb')
report = {'inputGLBSHA256': input_hash,
          'roofLocationBlender': list(roof.location), 'roofRotationBlender': list(roof.rotation_euler),
          'pillarTop': pillar_top, 'originalGeometryPreserved': True}
(args.out / 'geometry-report.json').write_text(json.dumps(report, indent=2))
print('ROOF_EXPORTED', report, flush=True)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 512
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 3
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.005
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'HIP'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'HIP'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
prep['atlases']['stadium-roof'] = {'objects': [roof.name]}

for key in ['static-NW', 'ground-NW', 'ground-NE', 'ground-Outer', 'stadium-roof']:
    if completed and key in completed['atlases'] and all(
        (args.out / f'{key}-{size}.{ext}').is_file() for size in [1024, 2048] for ext in ['ktx2', 'png']
    ):
        manifest['atlases'][key] = completed['atlases'][key]
        print('BAKE_REUSED', key, flush=True)
        continue
    start = time.time()
    originals = [scene.objects[name] for name in prep['atlases'][key]['objects']]
    copies = []
    for ob in originals:
        clone = ob.copy()
        clone.data = ob.data.copy()
        scene.collection.objects.link(clone)
        clone.hide_render = False
        copies.append(clone)
        ob.hide_render = True
    select(copies)
    if len(copies) > 1:
        bpy.ops.object.join()
    target = bpy.context.object
    materials = {}
    for slot in target.material_slots:
        mat = slot.material
        if mat.name not in materials:
            materials[mat.name] = mat.copy()
        slot.material = materials[mat.name]
    image = bpy.data.images.new(key, 2048, 2048, alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Linear Rec.709'
    for mat in materials.values():
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Metallic'].default_value = 0
                node.inputs['Transmission Weight'].default_value = 0
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.nodes.active = tex
    target.data.uv_layers.active_index = 1
    target.data.uv_layers[0].active_render = True
    print('BAKE_START', key, flush=True)
    try:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'},
            uv_layer='LightmapUV', margin=4, margin_type='EXTEND', use_clear=True)
    finally:
        for ob in originals:
            ob.hide_render = False
    pixels = np.empty(len(image.pixels), np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)
    maximum = float(pixels[:, :3].max())
    assert np.isfinite(pixels).all() and maximum > .01
    scale = float(2 ** math.ceil(math.log2(max(1, maximum))))
    pixels[:, :3] = np.clip(pixels[:, :3] / scale, 0, 1)
    pixels[:, 3] = 1
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    row = {'linearScale': scale, 'threeLightMapIntensity': math.pi * scale,
           'maximum': maximum, 'variants': {}}
    for size in [2048, 1024]:
        web_image = bpy.data.images.new(key + '-web', 2048, 2048, alpha=False, float_buffer=True)
        web_image.colorspace_settings.name = 'Linear Rec.709'
        web_image.pixels.foreach_set(pixels.ravel())
        if size == 1024:
            web_image.scale(size, size)
        web_image.save_render(str(args.out / f'{key}-{size}.png'), scene=scene)
        bpy.data.images.remove(web_image)
    for size in [2048, 1024]:
        variant = copy.deepcopy(manifest['atlases'].get(key, manifest['atlases']['static-NW'])['variants'][str(size)])
        variant['file'] = f'{key}-{size}.ktx2'
        output = args.out / variant['file']
        command = [str(args.ktx_bin / 'toktx.exe'), '--t2', '--encode', 'etc1s', '--qlevel', str(variant['qlevel']),
            '--endpoint_rdo_threshold', '1.25', '--selector_rdo_threshold', '1.25', '--clevel', '2',
            '--target_type', 'RGB', '--assign_oetf', 'srgb', '--threads', '8']
        if size == 2048:
            command.extend(['--mipmap', '--levels', '2'])
        command.extend([str(output), str(args.out / f'{key}-{size}.png')])
        if size == 2048:
            command.append(str(args.out / f'{key}-1024.png'))
        subprocess.run(command, check=True)
        subprocess.run([str(args.ktx_bin / 'ktx.exe'), 'validate', str(output)], check=True)
        variant['bytes'] = output.stat().st_size
        row['variants'][str(size)] = variant
    bpy.data.objects.remove(target, do_unlink=True)
    for mat in materials.values():
        bpy.data.materials.remove(mat)
    bpy.data.images.remove(image)
    row['seconds'] = time.time() - start
    manifest['atlases'][key] = row
    (args.out / 'lightmaps-progress.json').write_text(json.dumps(manifest, indent=2))
    print('BAKE_DONE', key, row['seconds'], flush=True)

if 'estadio-techo' not in manifest['requiredNames']:
    manifest['requiredNames'].append('estadio-techo')

# Allocate the new roof within the existing download budgets. Only textures
# rebaked by this repair are eligible, and the roof is compressed first.
compression_steps = {
    1024: [('stadium-roof', q) for q in [128, 80, 48]] + [('static-NW', q) for q in [160, 128]]
          + [('ground-NW', q) for q in [96, 80]],
    2048: [('stadium-roof', q) for q in [48, 24, 8]] + [('static-NW', q) for q in [64, 48]]
          + [('ground-NW', q) for q in [64, 48]] + [('ground-NE', q) for q in [32, 24]],
}
for profile in manifest['profiles'].values():
    size = profile['resolution']
    for key, quality in compression_steps[size]:
        total = sum(a['variants'][str(size)]['bytes'] for a in manifest['atlases'].values())
        if total <= profile['budgetBytes']:
            break
        variant = manifest['atlases'][key]['variants'][str(size)]
        if quality >= variant['qlevel']:
            continue
        output = args.out / variant['file']
        command = [str(args.ktx_bin / 'toktx.exe'), '--t2', '--encode', 'etc1s', '--qlevel', str(quality),
            '--endpoint_rdo_threshold', '1.25', '--selector_rdo_threshold', '1.25', '--clevel', '2',
            '--target_type', 'RGB', '--assign_oetf', 'srgb', '--threads', '8']
        if size == 2048:
            command.extend(['--mipmap', '--levels', '2'])
        command.extend([str(output), str(args.out / f'{key}-{size}.png')])
        if size == 2048:
            command.append(str(args.out / f'{key}-1024.png'))
        subprocess.run(command, check=True)
        subprocess.run([str(args.ktx_bin / 'ktx.exe'), 'validate', str(output)], check=True)
        variant.update(qlevel=quality, bytes=output.stat().st_size)
        print('BUDGET_COMPRESSION', key, size, quality, variant['bytes'], flush=True)
for profile in manifest['profiles'].values():
    size = str(profile['resolution'])
    total = sum(a['variants'][size]['bytes'] for a in manifest['atlases'].values())
    manifest['totals'][size] = profile['totalBytes'] = total
    profile['atlasCount'] = len(manifest['atlases'])
    assert total <= profile['budgetBytes'], (size, total, profile['budgetBytes'])
(args.out / 'lightmaps.json').write_text(json.dumps(manifest, indent=2) + '\n', newline='\r\n')
(args.out / 'lightmaps-progress.json').write_text(json.dumps(manifest, indent=2) + '\n', newline='\r\n')
print('COMPLETE', manifest['totals'], flush=True)

# A local camera render verifies the fit without exercising unrelated web flows.
camera = bpy.data.objects.new('Roof review camera', bpy.data.cameras.new('Roof review camera'))
scene.collection.objects.link(camera)
center = Vector((base.location.x, base.location.y, 4))
camera.location = center + Vector((85, -110, 95))
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 95
scene.camera = camera
scene.cycles.samples = 64
scene.render.resolution_x = 1100
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.filepath = str(args.out / 'stadium-after.png')
bpy.ops.render.render(write_still=True)
