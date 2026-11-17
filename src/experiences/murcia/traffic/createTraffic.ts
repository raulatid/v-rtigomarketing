import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRoutePath, createSample, type RoutePath } from './routePath';
import { readTrafficRoutes } from './readTrafficRoutes';
import { createTrafficSchedule, type TrafficSchedule } from './trafficSchedule';
import { MODEST_DEVICE_SHARE, TRAFFIC_KINDS, type TrafficKind } from './trafficConfig';
import trafficRoutes from './trafficRoutes.json';

/**
 * The city's ambient traffic: boats on the river and cars on the streets, each
 * on a one-way route drawn in Blender (`rutas-trafico`).
 *
 * The routes are not in the city GLB: `scripts/blender/export-traffic-routes.py`
 * writes them to `trafficRoutes.json`, in the city's runtime space. What moves
 * where is `trafficSchedule.ts`; this only draws it.
 *
 * One `InstancedMesh` per shape, one draw call each, whatever its tones. The
 * live vehicles of a shape are packed at the front of its instances and `count`
 * is how many are drawn, so a vehicle that leaves costs nothing and no object
 * is created or freed during the session. Each instance carries its tone
 * (`instanceTone`), which replaces the vertex colour where the GLB's `_TONE`
 * mask is 1: the body, not the glass or the wheels. The material is the GLB's
 * own, lit by the scene's lights: no lightmap, no shadows. Scenery only: no
 * raycast.
 */

export interface Traffic {
  readonly group: THREE.Group;
  update(delta: number): void;
  dispose(): void;
}

interface KindRuntime {
  schedule: TrafficSchedule;
  paths: RoutePath[];
  meshes: THREE.InstancedMesh[];
  /** Each mesh's `instanceTone`, written with its matrices. */
  toneAttributes: THREE.InstancedBufferAttribute[];
  tones: readonly (readonly [number, number, number])[];
}

/** `_TONE` in the GLB, lowercased by `GLTFLoader`. */
const GLTF_TONE_ATTRIBUTE = '_tone';
const COLOR_VERTEX = '#include <color_vertex>';

/** The template's one mesh, its transform inside the GLB baked into its geometry. */
function modelGeometry(template: THREE.Object3D, path: string): THREE.Mesh {
  const meshes: THREE.Mesh[] = [];
  template.updateMatrixWorld(true);
  template.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh || Array.isArray(mesh.material)) {
    throw new Error(`[traffic] ${path} must hold exactly one mesh with one material`);
  }
  const mask = mesh.geometry.getAttribute(GLTF_TONE_ATTRIBUTE);
  if (!mask || !mesh.geometry.getAttribute('color') || !(mesh.material as THREE.MeshStandardMaterial).vertexColors) {
    throw new Error(`[traffic] ${path} needs vertex colours and a _TONE attribute`);
  }
  mesh.geometry.deleteAttribute(GLTF_TONE_ATTRIBUTE);
  mesh.geometry.setAttribute('toneMask', mask);
  mesh.geometry.applyMatrix4(mesh.matrixWorld);
  tintByInstance(mesh.material as THREE.Material, path);
  return mesh;
}

/**
 * The body takes the instance's tone instead of its vertex colour. Patched at
 * load, before `createCityMark` wraps the hook and the key for Conócenos.
 */
function tintByInstance(material: THREE.Material, path: string): void {
  material.onBeforeCompile = (shader) => {
    if (!shader.vertexShader.includes(COLOR_VERTEX)) {
      console.warn(`[traffic] ${path}: no ${COLOR_VERTEX}, every tone draws as exported`);
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float toneMask;\nattribute vec3 instanceTone;')
      .replace(COLOR_VERTEX, `${COLOR_VERTEX}\nvColor.xyz = mix(vColor.xyz, instanceTone, toneMask);`);
  };
  material.customProgramCacheKey = () => 'traffic-tone';
}

/**
 * Loads every kind's models through the city's loader and builds the traffic.
 * A model that does not load warns and its kind carries on with the rest; a
 * kind with none draws nothing.
 */
export async function loadTraffic(
  loader: GLTFLoader,
  options: { reducedMotion: boolean; modestDevice: boolean; random?: () => number },
): Promise<Traffic> {
  const random = options.random ?? Math.random;
  const group = new THREE.Group();
  group.name = 'traffic';
  const routes = readTrafficRoutes(
    trafficRoutes,
    TRAFFIC_KINDS.map((kind) => kind.routePrefix),
  );

  const loadModels = async (kind: TrafficKind): Promise<THREE.Mesh[]> => {
    const settled = await Promise.allSettled(kind.models.map((path) => loader.loadAsync(path)));
    const models: THREE.Mesh[] = [];
    settled.forEach((result, i) => {
      const path = kind.models[i]!;
      try {
        if (result.status === 'rejected') throw result.reason;
        models.push(modelGeometry(result.value.scene, path));
      } catch (error) {
        console.warn(`[traffic] ${kind.name}: no ${path}:`, error);
      }
    });
    return models;
  };

  const kinds: KindRuntime[] = [];
  const loaded = await Promise.all(TRAFFIC_KINDS.map(loadModels));
  TRAFFIC_KINDS.forEach((kind, k) => {
    const models = loaded[k]!;
    const kindRoutes = routes.get(kind.routePrefix)!;
    if (models.length === 0 || kindRoutes.length === 0 || kind.tones.length === 0) {
      for (const model of models) disposeMesh(model);
      return;
    }
    const maxActive = options.modestDevice
      ? Math.max(1, Math.ceil(kind.schedule.maxActive * MODEST_DEVICE_SHARE))
      : kind.schedule.maxActive;
    const paths = kindRoutes.map((route) => createRoutePath(route.points, kind.turnRadius));
    const schedule = createTrafficSchedule({
      routeLengths: paths.map((path) => path.length),
      // A model is a shape and a tone: shape `model / tones`, tone `model % tones`.
      modelCount: models.length * kind.tones.length,
      config: { ...kind.schedule, maxActive },
      random,
      warmUp: true,
    });
    const toneAttributes: THREE.InstancedBufferAttribute[] = [];
    // Each shape can hold the whole cap, so the cap is the only limit on a spawn.
    const meshes = models.map((model, m) => {
      const tones = new THREE.InstancedBufferAttribute(new Float32Array(maxActive * 3), 3);
      tones.setUsage(THREE.DynamicDrawUsage);
      model.geometry.setAttribute('instanceTone', tones);
      toneAttributes.push(tones);
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, maxActive);
      mesh.name = `traffic:${kind.name}:${m}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      // The instances span half the city: the one bounding sphere would be culled wrongly.
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      group.add(mesh);
      return mesh;
    });
    kinds.push({ schedule, paths, meshes, toneAttributes, tones: kind.tones });
  });

  const sample = createSample();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  const place = (kind: KindRuntime): void => {
    for (const mesh of kind.meshes) mesh.count = 0;
    for (const agent of kind.schedule.agents) {
      kind.paths[agent.route]!.sample(agent.distance, 0, false, sample);
      position.set(sample.x, sample.y, sample.z);
      // Front is -Z: a yaw of θ points it at (-sin θ, -cos θ) in XZ.
      rotation.setFromAxisAngle(up, Math.atan2(-sample.dirX, -sample.dirZ));
      const shape = Math.floor(agent.model / kind.tones.length);
      const mesh = kind.meshes[shape]!;
      const tone = kind.tones[agent.model % kind.tones.length]!;
      kind.toneAttributes[shape]!.setXYZ(mesh.count, tone[0], tone[1], tone[2]);
      mesh.setMatrixAt(mesh.count++, matrix.compose(position, rotation, scale));
    }
    for (const mesh of kind.meshes) mesh.instanceMatrix.needsUpdate = true;
    for (const tones of kind.toneAttributes) tones.needsUpdate = true;
  };

  for (const kind of kinds) place(kind);

  return {
    group,
    update(delta) {
      // The warmed-up picture, held: a still city is not a broken one.
      if (options.reducedMotion) return;
      for (const kind of kinds) {
        kind.schedule.step(delta);
        place(kind);
      }
    },
    dispose() {
      group.removeFromParent();
      for (const kind of kinds) {
        for (const mesh of kind.meshes) {
          disposeMesh(mesh);
          mesh.dispose();
        }
      }
      kinds.length = 0;
    },
  };
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}
