import * as THREE from 'three';
import { applyLightInheritance, type LightInheritance } from './applyLightInheritance';
import { DEFAULT_SHADE, type InheritanceShade } from './lightInheritance';
import { prepareLightmapTexture } from './lightmapMaterial';

/**
 * The judging surface of the light-inheritance prototype (`?inherit=1`, debug
 * builds only; loaded on demand by `MurciaExperience`).
 *
 * - `I` swaps the inherited windows and parapets with the delivery's, on the
 *   same frame and pose.
 * - `V` draws the inherited windows as front quads (`windowFront.ts`) or as
 *   their geometry; the light is the same both ways.
 * - `window.__lightInheritance.shade({ windowReveal: 0.5 })` rebuilds with
 *   other shade constants; `.shade()` prints the current ones.
 * - `window.__lightInheritance.kinds(true)` paints parapet faces by their
 *   classification (`applyLightInheritance`, `debugKinds`).
 * - `window.__lightInheritance.windows(true)` is `V` from the console.
 * - `?inheritWall=<atlas>:<same-origin path>` (plan 031) loads a rebaked atlas
 *   as a plain image (the RGB decode of its KTX2) and puts it on every material
 *   that reads that atlas: walls, delivery windows and inherited copies. `P`
 *   or `.wall(on)` swaps it with the delivery's; the intensity stays the
 *   delivery's, so the rebake must keep its `linearScale`.
 */
export function attachLightInheritancePrototype(root: THREE.Object3D): { dispose(): void } {
  let shade: InheritanceShade = { ...DEFAULT_SHADE };
  let kinds = false;
  let fronts = false;
  let current: LightInheritance = build();
  const wall = attachWallOverride(root);

  function build(): LightInheritance {
    const built = applyLightInheritance(root, shade, kinds, fronts);
    console.info(`[inherit] on (I to compare, V for window quads)\n${built.report.join('\n')}`);
    return built;
  }
  /** Rebuilds with the current settings, keeping which light is showing. */
  function rebuild(): void {
    const enabled = current.enabled;
    current.dispose();
    current = build();
    current.setEnabled(enabled);
  }
  const onKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key !== 'i' && key !== 'v' && !(key === 'p' && wall)) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (key === 'p') {
      wall!.set(!wall!.on);
      return;
    }
    if (key === 'v') {
      fronts = !fronts;
      rebuild();
      console.info(`[inherit] windows as ${fronts ? 'front quads' : 'geometry'}`);
      return;
    }
    current.setEnabled(!current.enabled);
    console.info(`[inherit] ${current.enabled ? 'inherited' : 'delivery'} light`);
  };
  window.addEventListener('keydown', onKey);
  const seams = window as unknown as Record<string, unknown>;
  seams.__lightInheritance = {
    set: (on: boolean) => current.setEnabled(on),
    kinds: (on: boolean) => {
      kinds = on;
      rebuild();
    },
    windows: (on: boolean) => {
      fronts = on;
      rebuild();
    },
    wall: (on: boolean) => wall?.set(on),
    shade: (next?: Partial<InheritanceShade>) => {
      if (!next) return { ...shade };
      shade = { ...shade, ...next };
      rebuild();
      return { ...shade };
    },
  };
  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      delete seams.__lightInheritance;
      current.dispose();
      wall?.dispose();
    },
  };
}

/** `?inheritWall=`: one atlas swapped for a rebake, or null without the parameter. */
function attachWallOverride(root: THREE.Object3D): { readonly on: boolean; set(on: boolean): void; dispose(): void } | null {
  const value = new URLSearchParams(window.location.search).get('inheritWall');
  if (!value) return null;
  const split = value.indexOf(':');
  const key = value.slice(0, split), url = value.slice(split + 1);
  // Same-origin paths only, as `?model=`.
  if (split <= 0 || !url.startsWith('/') || url.startsWith('//')) {
    console.warn(`[inherit] ignored inheritWall=${value}: expected <atlas>:/<path>`);
    return null;
  }
  let delivery: THREE.Texture | null = null;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (delivery || !mesh.isMesh || mesh.userData.lightmap_atlas !== key || Array.isArray(mesh.material)) return;
    delivery = (mesh.material as THREE.MeshBasicMaterial).lightMap ?? null;
  });
  if (!delivery) {
    console.warn(`[inherit] ignored inheritWall: no lightmapped mesh reads ${key}`);
    return null;
  }
  const original: THREE.Texture = delivery;
  let rebake: THREE.Texture | null = null;
  let on = false;
  let disposed = false;
  /** Every material in the city, inherited copies included, that reads `from`. */
  const swap = (from: THREE.Texture, to: THREE.Texture): number => {
    const seen = new Set<THREE.Material>();
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ((material as THREE.MeshBasicMaterial).lightMap === from) seen.add(material);
      }
    });
    for (const material of seen) (material as THREE.MeshBasicMaterial).lightMap = to;
    return seen.size;
  };
  const set = (next: boolean) => {
    if (!rebake || next === on) return;
    const count = next ? swap(original, rebake) : swap(rebake, original);
    on = next;
    console.info(`[inherit] ${key}: ${on ? `rebake ${url}` : 'delivery'} on ${count} materials`);
  };
  new THREE.TextureLoader().loadAsync(url).then(texture => {
    if (disposed) { texture.dispose(); return; }
    prepareLightmapTexture(texture, original.channel);
    // One level, like the delivery's KTX2 (its footprint clamp already keeps level 0).
    texture.minFilter = THREE.LinearFilter;
    rebake = texture;
    set(true);
    console.info(`[inherit] ${key} rebake ready (P to swap)`);
  }, error => console.warn(`[inherit] inheritWall ${url} failed`, error));
  return {
    get on() { return on; },
    set,
    dispose() {
      disposed = true;
      set(false);
      rebake?.dispose();
    },
  };
}
