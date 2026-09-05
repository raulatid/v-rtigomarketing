import * as THREE from 'three';
// TYPE-ONLY, and it has to stay that way. stats.js ships as a UMD build whose
// top level is a side-effectful IIFE, so Rollup cannot tree-shake it: a value
// import kept the whole library in the production chunk no matter how the call
// below was gated. Loaded on demand in mountStats instead.
import type Stats from 'stats.js';
import { DEBUG_TOOLS_ENABLED } from '../../../app/buildFlags';
import type { AppConfig } from '../config/appConfig';
import type { BoundsRect } from '../config/environmentConfig';
import type { NavigableArea } from '../navigation/navigableArea';
import type { SceneReport } from '../assets/loadCity';

/**
 * Every developer affordance for the Murcia environment, in one place.
 *
 * These were six fields and four methods on MurciaExperience, interleaved with
 * asset loading, camera rigging and the frame loop — so reading the production
 * path meant stepping over an FPS meter, a wireframe rebuild and three console
 * dumps, and the `if (!this.debugTools) return;` guard was repeated at the top
 * of each of them. It is one guard here: nothing is built when the tools are
 * off, so there is nothing to check later.
 *
 * On a production build `DEBUG_TOOLS_ENABLED` is false, this is constructed
 * with `enabled: false`, and every method below is a no-op returning early
 * before it touches Stats or three.
 *
 * The three log* methods are DIAGNOSTICS, not error reporting: together they
 * printed a mesh/material table, the model's bounding box and eight lines of
 * bounds rectangles into the console of every visitor on every page load.
 * Correct for the standalone prototype, where the page WAS the diagnostic;
 * wrong for a marketing site. Real failures are unaffected — console.error and
 * console.warn stay in the modules that detect them.
 */
export class MurciaDebugTools {
  private stats: Stats | null = null;
  private boundsHelper: THREE.LineSegments | null = null;

  constructor(
    private readonly enabled: boolean,
    private readonly appConfig: AppConfig,
    private readonly container: HTMLElement,
  ) {}

  /**
   * The FPS meter, if `?stats=1` asked for one.
   *
   * DEBUG_TOOLS_ENABLED first, and it is what removes the library from a
   * production build rather than merely silencing it: `enabled` is a
   * constructor argument and cannot be folded, so the import below stayed
   * reachable and `showPanel` / `addPanel` shipped to every visitor. With a
   * literal in front of it the whole branch — the dynamic import included — is
   * gone from the emitted chunk.
   *
   * Not awaited, and nothing waits on the meter: the frame loop reads
   * `this.stats?`, so the panel simply appears a tick after the scene does.
   */
  mountStats(): void {
    if (!DEBUG_TOOLS_ENABLED || !this.enabled || !this.appConfig.statsEnabled) return;
    void import('stats.js').then(({ default: Stats }) => {
      const stats = new Stats();
      stats.dom.style.top = 'auto';
      stats.dom.style.bottom = '0';
      this.container.appendChild(stats.dom);
      this.stats = stats;
    });
  }

  frameBegin(): void {
    this.stats?.begin();
  }

  frameEnd(): void {
    this.stats?.end();
  }

  /** True once a wireframe exists, so a resize knows whether to rebuild one. */
  get hasBoundsHelper(): boolean {
    return this.boundsHelper !== null;
  }

  /**
   * The bounds wireframe: effective, visual, configured and plate, drawn as
   * four nested rectangles just above the ground plane.
   *
   * Rebuilt rather than updated. It changes only on a resize, a yaw or a zoom
   * settle — never per frame — and a rebuild cannot leave a stale vertex behind
   * the way an in-place buffer update can.
   */
  rebuildBoundsHelper(scene: THREE.Scene, area: NavigableArea, groundPlaneHeight: number): void {
    if (!this.enabled) return;
    this.disposeBoundsHelper(scene);

    const effective = area.effectiveBounds;
    const visual = area.visualBounds;
    if (!effective || !visual) return;

    const y = groundPlaneHeight + HELPER_LIFT;
    const points: number[] = [];
    pushRect(points, effective, y);
    pushRect(points, visual, y);
    const configured = area.configuredBounds;
    const plate = area.plateBounds;
    if (configured) pushRect(points, configured, y);
    if (plate) pushRect(points, plate, y);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: HELPER_COLOUR });
    this.boundsHelper = new THREE.LineSegments(geometry, material);
    this.boundsHelper.name = 'NavigationBoundsHelper';
    scene.add(this.boundsHelper);
  }

  /** What the GLB actually contained. */
  logAssetReport(report: SceneReport): void {
    if (!this.enabled) return;
    console.groupCollapsed('[murcia] asset report');
    console.table({
      objects: report.objectCount,
      meshes: report.meshCount,
      materials: report.materialCount,
      textures: report.textureCount,
      lights: report.lightCount,
      cameras: report.cameraCount,
      skinnedMeshes: report.skinnedMeshCount,
      animations: report.animationCount,
      transparentMaterials: report.transparentMaterialCount,
      doubleSidedMaterials: report.doubleSidedMaterialCount,
    });
    if (report.warnings.length > 0) {
      console.warn('Asset warnings:\n- ' + report.warnings.join('\n- '));
    }
    console.groupEnd();
  }

  /** Where the model sits and how big it is, for comparing against the config. */
  logModelBounds(box: THREE.Box3): void {
    if (!this.enabled) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    console.info(
      `[murcia] model bounds: center=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) size=(${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`,
    );
  }

  /** The navigable-area pipeline's own report. Owned by NavigableArea. */
  logNavigation(area: NavigableArea, terrainSource: string): void {
    if (!this.enabled) return;
    area.logDiagnostics(terrainSource);
  }

  dispose(scene: THREE.Scene | null): void {
    if (scene) this.disposeBoundsHelper(scene);
    if (this.stats) {
      this.stats.dom.remove();
      this.stats = null;
    }
  }

  private disposeBoundsHelper(scene: THREE.Scene): void {
    if (!this.boundsHelper) return;
    scene.remove(this.boundsHelper);
    this.boundsHelper.geometry.dispose();
    (this.boundsHelper.material as THREE.Material).dispose();
    this.boundsHelper = null;
  }
}

/** Lifted off the ground plane so the lines are not z-fighting the terrain. */
const HELPER_LIFT = 0.5;

/** Green, to read against the city's greys at any zoom. */
const HELPER_COLOUR = 0x7bff8e;

/** A rectangle as four line segments on the XZ plane, at height `y`. */
function pushRect(out: number[], rect: BoundsRect, y: number): void {
  const { minX, maxX, minZ, maxZ } = rect;
  const corners: Array<[number, number]> = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    out.push(ax, y, az, bx, y, bz);
  }
}
