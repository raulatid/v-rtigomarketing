"""
Writes the ambient traffic routes authored in Blender to a JSON file the
runtime reads (`src/experiences/murcia/traffic/trafficRoutes.json`).

Run headless against the city .blend; it only reads the file, never saves it:

    blender -b murcia-v5.2.blend --python scripts/blender/export-traffic-routes.py -- <out.json>

Every object in the `rutas-trafico` collection is one route, named after the
object; its prefix says which traffic takes it (`ruta-naval-`, `ruta-vial-`).
Points are in world space and converted to glTF axes (Blender Z-up -> Y-up:
x, z, -y), which is the city's runtime space: `loadCity` adds the GLB root
untransformed.

Every route is ONE-WAY: vehicles run it from its first point to its last, so
the order is exported exactly and the export fails rather than guess it.

- A curve is one open spline, poly or Bézier, and runs in the spline's own
  direction (Edit Mode shows it; Segment > Switch Direction turns it round).
  Bézier segments are sampled at the curve's `resolution_u`.
- A mesh is one open chain of edges with no faces. Its vertex order is not
  the order along the chain, so its start is the one vertex in a vertex group
  named `inicio`, at one end of the chain.
"""

import json
import sys
from collections import defaultdict

import bpy
from mathutils.geometry import interpolate_bezier

COLLECTION = "rutas-trafico"
START_GROUP = "inicio"


def chain_from_mesh(obj):
    mesh = obj.data
    if len(mesh.polygons) > 0:
        raise ValueError(f"{obj.name}: a route mesh must have no faces")
    adjacency = defaultdict(list)
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    ends = [v for v, near in adjacency.items() if len(near) == 1]
    if len(ends) != 2 or any(len(near) > 2 for near in adjacency.values()):
        raise ValueError(f"{obj.name}: a route mesh must be one open chain of edges")

    group = obj.vertex_groups.get(START_GROUP)
    if group is None:
        raise ValueError(f'{obj.name}: a route mesh needs its start in a vertex group "{START_GROUP}"')
    starts = [v.index for v in mesh.vertices if any(g.group == group.index and g.weight > 0 for g in v.groups)]
    if len(starts) != 1 or starts[0] not in ends:
        raise ValueError(f'{obj.name}: "{START_GROUP}" must hold exactly one vertex, at an end of the chain')

    order = [starts[0]]
    previous = None
    while len(order) < len(adjacency):
        here = order[-1]
        step = next(v for v in adjacency[here] if v != previous)
        previous = here
        order.append(step)
    return [obj.matrix_world @ mesh.vertices[i].co for i in order]


def chain_from_curve(obj):
    splines = obj.data.splines
    if len(splines) != 1:
        raise ValueError(f"{obj.name}: a route curve must have exactly one spline")
    spline = splines[0]
    if spline.use_cyclic_u:
        raise ValueError(f"{obj.name}: a route curve must be open (cyclic is off)")

    if spline.type == "POLY":
        local = [p.co.xyz for p in spline.points]
    elif spline.type == "BEZIER":
        knots = spline.bezier_points
        steps = max(1, obj.data.resolution_u)
        local = [knots[0].co.copy()]
        for a, b in zip(knots[:-1], knots[1:]):
            # interpolate_bezier returns steps + 1 points, the first one being `a`.
            local.extend(interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, steps + 1)[1:])
    else:
        raise ValueError(f"{obj.name}: a route curve must be poly or Bézier, not {spline.type}")

    points = [obj.matrix_world @ co for co in local]
    # Coincident neighbours (a handle-less Bézier, a doubled point) are a zero-length segment.
    out = [points[0]]
    for p in points[1:]:
        if (p - out[-1]).length > 1e-6:
            out.append(p)
    return out


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 1:
        raise SystemExit("usage: blender -b city.blend --python export-traffic-routes.py -- <out.json>")
    collection = bpy.data.collections.get(COLLECTION)
    if collection is None:
        raise SystemExit(f'no "{COLLECTION}" collection in {bpy.data.filepath}')

    routes = {}
    for obj in sorted(collection.all_objects, key=lambda o: o.name):
        if obj.type == "MESH":
            points = chain_from_mesh(obj)
        elif obj.type == "CURVE":
            points = chain_from_curve(obj)
        else:
            continue
        if len(points) < 2:
            raise ValueError(f"{obj.name}: a route needs at least two distinct points")
        routes[obj.name] = [[round(p.x, 3), round(p.z, 3), round(-p.y, 3)] for p in points]

    with open(argv[0], "w", encoding="utf-8", newline="\n") as out:
        json.dump({"source": bpy.path.basename(bpy.data.filepath), "routes": routes}, out, indent=2)
        out.write("\n")
    print(f"[traffic] wrote {len(routes)} route(s) to {argv[0]}: {', '.join(routes)}")


main()
