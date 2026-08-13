import * as THREE from 'three';
import type { DistrictLookup } from './resolveDistrict';
import { clamp01 } from '../../../utils/easing';

/**
 * Layer reserved for interaction proxies.
 *
 * Layers are the only visibility-like property the raycaster consults: in the
 * pinned three r171, `intersect()` tests `object.layers.test(raycaster.layers)`
 * and never reads `object.visible`. So an object hidden with `visible = false`
 * is still picked, and a picking proxy has to be controlled by layers or not at
 * all. Anything on this layer is invisible and exists only to be hit.
 */
export const INTERACTION_LAYER = 1;

export type HighlightState = 'idle' | 'hover' | 'active';

export interface DistrictHighlightConfig {
  /** Emissive tint applied to materials that carry no authored emissive. */
  highlightColor: number;
  /** Emissive intensity per state. Idle is non-zero on purpose — see below. */
  idleIntensity: number;
  hoverIntensity: number;
  activeIntensity: number;
  /** Seconds to close ~63% of the gap to the state's target intensity. */
  timeConstant: number;
  /** Ground marker radius as a multiple of the district's half-extent. */
  markerRadiusScale: number;
  markerColor: number;
  markerIdleOpacity: number;
  markerActiveOpacity: number;
  /** Idle pulse period in seconds. 0 disables the pulse. */
  markerPulsePeriod: number;
  /** How far the picking proxy extends beyond the district bounds, world units. */
  proxyPadding: number;
}

const defaultDistrictHighlightConfig: DistrictHighlightConfig = {
  highlightColor: 0x4fb0ff,
  // Not zero. Touch devices have no hover, so the district has to read as
  // special before any interaction happens; the marker carries most of that, and
  // a faint self-illumination keeps the buildings tied to it.
  idleIntensity: 0.12,
  hoverIntensity: 0.55,
  activeIntensity: 0.95,
  timeConstant: 0.12,
  markerRadiusScale: 0.95,
  markerColor: 0x4fb0ff,
  markerIdleOpacity: 0.3,
  markerActiveOpacity: 0.55,
  markerPulsePeriod: 3.4,
  proxyPadding: 6,
};

interface HighlightTarget {
  material: THREE.Material;
  /**
   * Emissive the material was authored with. When it is non-black — the future
   * `districtPart = "emission"` strips from Blender — highlighting scales it
   * instead of replacing it, so the authored look survives.
   */
  baseEmissive: THREE.Color;
  /** Authored emissiveIntensity, which the state value multiplies. */
  baseIntensity: number;
  /** True when the material had no emissive of its own to preserve. */
  tinted: boolean;
}

/**
 * Everything a district looks like: building emissive, ground marker, and the
 * invisible proxy that makes the marker clickable.
 *
 * ## No lights and no bloom
 *
 * The glow is `emissive` on the district's own materials. Adding a `THREE.Light`
 * would change the Scene's light count and invalidate every material's shader
 * program (PROJECT_MEMORY, "Things that will bite you again") — a full
 * recompile at exactly the wrong moment. There is no post-processing in this
 * project either, so the effect is a self-illuminated *surface*, not a halo in
 * the air around it. The ground marker is what supplies the spread.
 */
export class DistrictHighlight {
  readonly group = new THREE.Group();
  readonly proxy: THREE.Mesh;

  private readonly config: DistrictHighlightConfig;
  private readonly targets: HighlightTarget[] = [];
  /** Original assignments, restored before the clones are disposed. */
  private readonly originalMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >();
  private readonly clones: THREE.Material[] = [];

  private readonly marker: THREE.Mesh;
  private readonly markerMaterial: THREE.MeshBasicMaterial;
  private readonly markerTexture: THREE.Texture;

  private state: HighlightState = 'idle';
  private intensity: number;
  private pulseTime = 0;
  private readonly reducedMotion: boolean;

  constructor(
    district: DistrictLookup,
    groundY: number,
    config: DistrictHighlightConfig = defaultDistrictHighlightConfig,
    reducedMotion = false,
  ) {
    this.config = config;
    this.reducedMotion = reducedMotion;
    this.intensity = config.idleIntensity;

    this.group.name = 'DistrictHighlight';
    this.prepareMaterials(district.meshes);

    const size = new THREE.Vector3();
    district.bounds.getSize(size);
    const radius = (Math.max(size.x, size.z) / 2) * config.markerRadiusScale;

    this.markerTexture = createRadialGradientTexture();
    this.markerMaterial = new THREE.MeshBasicMaterial({
      map: this.markerTexture,
      color: config.markerColor,
      transparent: true,
      opacity: config.markerIdleOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      this.markerMaterial,
    );
    this.marker.name = 'DistrictMarker';
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.set(district.center.x, groundY + 0.06, district.center.z);
    // Decorative only. The proxy below is what gets picked; see INTERACTION_LAYER.
    this.marker.raycast = () => {};
    this.marker.renderOrder = 1;
    this.group.add(this.marker);

    // Picking proxy. Larger than the buildings so the gaps between them are not
    // dead space and the visible marker is itself clickable — a marker that says
    // "select me" while being excluded from raycasting is the wrong affordance.
    const proxyHeight = Math.max(size.y, 1) + config.proxyPadding;
    this.proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + config.proxyPadding, radius + config.proxyPadding, proxyHeight, 16),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.proxy.name = 'DistrictPickProxy';
    this.proxy.position.set(district.center.x, groundY + proxyHeight / 2, district.center.z);
    // Belt and braces: the layer keeps it out of ordinary raycasts, and an
    // invisible material keeps it off screen even if the layer is widened later.
    this.proxy.layers.set(INTERACTION_LAYER);
    this.group.add(this.proxy);

    this.applyIntensity();
  }

  /**
   * Clones each distinct original material once and reuses that clone for every
   * mesh that shared it.
   *
   * Cloning at all is mandatory: while the GLB ships no materials every mesh
   * shares one default instance, so mutating it recolours the whole city
   * (section 10.2). Cloning *by identity* rather than one clone for all is what
   * keeps facades, roofs, windows and emission strips distinct once the
   * texturing work lands.
   */
  private prepareMaterials(meshes: THREE.Mesh[]): void {
    const cloneOf = new Map<THREE.Material, THREE.Material>();

    const resolve = (original: THREE.Material): THREE.Material => {
      const existing = cloneOf.get(original);
      if (existing) return existing;

      const clone = original.clone();
      clone.name = `${original.name || 'material'}__district`;
      cloneOf.set(original, clone);
      this.clones.push(clone);

      const emissive = (clone as THREE.MeshStandardMaterial).emissive;
      if (emissive) {
        const authored = emissive.getHex() !== 0x000000 ||
          (clone as THREE.MeshStandardMaterial).emissiveMap != null;
        const standard = clone as THREE.MeshStandardMaterial;
        if (!authored) {
          // Nothing to preserve: intensity alone would do nothing, because
          // three multiplies emissive by emissiveIntensity and the colour is
          // black. Give it a colour to scale.
          emissive.setHex(this.config.highlightColor);
        }
        this.targets.push({
          material: clone,
          baseEmissive: emissive.clone(),
          baseIntensity: authored ? standard.emissiveIntensity : 1,
          tinted: !authored,
        });
      }
      return clone;
    };

    for (const mesh of meshes) {
      this.originalMaterials.set(mesh, mesh.material);
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(resolve)
        : resolve(mesh.material);
    }
  }

  setState(state: HighlightState): void {
    this.state = state;
  }

  getState(): HighlightState {
    return this.state;
  }

  update(deltaTime: number): void {
    const target = this.targetIntensity();
    // Same frame-rate independent approach used throughout navigation.
    const alpha =
      this.config.timeConstant > 0 ? 1 - Math.exp(-deltaTime / this.config.timeConstant) : 1;
    this.intensity += (target - this.intensity) * alpha;

    if (!this.reducedMotion && this.config.markerPulsePeriod > 0) {
      this.pulseTime += deltaTime;
    }
    this.applyIntensity();
  }

  private targetIntensity(): number {
    switch (this.state) {
      case 'hover':
        return this.config.hoverIntensity;
      case 'active':
        return this.config.activeIntensity;
      default:
        return this.config.idleIntensity;
    }
  }

  private applyIntensity(): void {
    for (const target of this.targets) {
      const standard = target.material as THREE.MeshStandardMaterial;
      if (target.tinted) {
        standard.emissiveIntensity = this.intensity;
      } else {
        // Authored emissive: scale it around its own value rather than replacing
        // it, so a strip modelled as glowing still glows at idle.
        standard.emissiveIntensity = target.baseIntensity * (1 + this.intensity);
      }
    }

    const cfg = this.config;
    const span = cfg.markerActiveOpacity - cfg.markerIdleOpacity;
    const range = Math.max(cfg.activeIntensity - cfg.idleIntensity, 1e-6);
    const progress = (this.intensity - cfg.idleIntensity) / range;
    let opacity = cfg.markerIdleOpacity + span * clamp01(progress);

    // The pulse is an idle-only invitation; once the district is engaged it
    // holds steady, and reduced motion removes it entirely.
    if (!this.reducedMotion && cfg.markerPulsePeriod > 0 && this.state === 'idle') {
      const phase = (this.pulseTime / cfg.markerPulsePeriod) * Math.PI * 2;
      opacity *= 0.78 + 0.22 * Math.sin(phase);
    }
    this.markerMaterial.opacity = opacity;
  }

  dispose(): void {
    // Restore first. Disposing a clone that a mesh still points at leaves a
    // dangling reference which a remount would render against, and would also
    // leave the original — the material disposeLoadedCity expects to find —
    // unreachable.
    for (const [mesh, material] of this.originalMaterials) {
      mesh.material = material;
    }
    this.originalMaterials.clear();

    for (const clone of this.clones) clone.dispose();
    this.clones.length = 0;
    this.targets.length = 0;

    this.marker.geometry.dispose();
    this.markerMaterial.dispose();
    this.markerTexture.dispose();

    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();

    this.group.removeFromParent();
    this.group.clear();
  }
}

/**
 * Soft radial gradient, generated rather than shipped as an asset.
 *
 * A hard-edged disc reads as a UI element sitting on the ground; the falloff is
 * what makes it read as light.
 */
function createRadialGradientTexture(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

