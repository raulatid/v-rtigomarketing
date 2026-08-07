import * as THREE from 'three';
import Stats from 'stats.js';

import { createAppConfig, applyQueryOverrides } from '../config/appConfig';
import type { AppConfig } from '../config/appConfig';
import { murciaConfig } from '../config/murciaConfig';
import type { BoundsRect, EnvironmentConfig } from '../config/environmentConfig';
import { resolveCameraPose } from '../config/environmentConfig';
import { applyNavigationQueryOverrides } from '../config/environmentQueryOverrides';
import { createRenderer } from '../core/createRenderer';
import { createScene } from '../core/createScene';
import type { SceneBundle } from '../core/createScene';
import { attachViewportObserver, applyViewportSize } from '../core/resize';
import type { ViewportSize } from '../core/resize';
import { createAssetLoader } from '../assets/createAssetLoader';
import type { AssetLoader } from '../assets/createAssetLoader';
import { loadCity, disposeLoadedCity } from '../assets/loadCity';
import type { LoadedCity } from '../assets/loadCity';
import { CameraRig } from '../camera/CameraRig';
import { DragPanController } from '../navigation/DragPanController';
import { computeGroundFootprint, computeEffectiveBounds } from '../navigation/viewportFootprint';
import type { GroundFootprint } from '../navigation/viewportFootprint';
import { containsPoint, expandRect } from '../navigation/navigationBounds';
import { createTerrainTransition } from '../environment/createTerrainTransition';
import type { TerrainTransition } from '../environment/createTerrainTransition';
import { DebugOverlay } from '../debug/DebugOverlay';
import { InteractionProbe } from '../interaction/InteractionProbe';
import { resolveDistrict } from '../interaction/resolveDistrict';
import { DistrictInteraction } from '../interaction/DistrictInteraction';
import { cityDistrictBindings } from '../scene/cityDistrictBindings';
import { findDistrictContent } from '../content/districts';
import { StatusOverlay, ControlsHint } from '../ui/overlays';

/**
 * Lifecycle coordinator for the Murcia environment.
 *
 * Deliberately thin — behaviour lives in the modules. Nothing below reaches for
 * a global renderer, Scene, camera or config; every dependency is constructed
 * here and injected, so extracting a shared app shell for the second
 * environment is a move rather than a rewrite (docs/plans/002 Amendment A2).
 */
export class CityPrototype {
  private readonly container: HTMLElement;
  private readonly appConfig: AppConfig;
  private readonly environment: EnvironmentConfig;

  private renderer!: THREE.WebGLRenderer;
  private sceneBundle!: SceneBundle;
  private camera!: THREE.PerspectiveCamera;
  private assetLoader!: AssetLoader;

  private rig: CameraRig | null = null;
  private controller: DragPanController | null = null;
  private transition: TerrainTransition | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private interactionProbe: InteractionProbe | null = null;
  private districts: DistrictInteraction[] = [];
  private stats: Stats | null = null;
  private boundsHelper: THREE.LineSegments | null = null;

  private detachViewport: (() => void) | null = null;
  private loaded: LoadedCity | null = null;

  private readonly statusOverlay: StatusOverlay;
  private readonly controlsHint: ControlsHint;

  private viewport: ViewportSize = { width: 1, height: 1, aspect: 1 };
  private plateBounds: BoundsRect | null = null;
  private configuredBounds: BoundsRect | null = null;
  private visualBounds: BoundsRect | null = null;
  private effectiveBounds: BoundsRect | null = null;
  private footprint: GroundFootprint | null = null;
  private footprintInsetsDisabled = false;

  private running = false;
  private frameHandle = 0;
  private lastTime = 0;
  private firstFrameRecorded = false;
  private hintFaded = false;

  private readonly ndc = new THREE.Vector2();

  constructor(container: HTMLElement) {
    this.container = container;
    this.appConfig = applyQueryOverrides(createAppConfig(), window.location.search);

    const environment = this.appConfig.modelPathOverride
      ? { ...murciaConfig, modelPath: this.appConfig.modelPathOverride }
      : murciaConfig;
    // Applied after the model override so the two compose.
    this.environment = applyNavigationQueryOverrides(environment, window.location.search);

    this.statusOverlay = new StatusOverlay(container);
    this.controlsHint = new ControlsHint(container);
  }

  async start(): Promise<void> {
    if (!this.initRenderer()) return;

    this.sceneBundle = createScene(this.appConfig, this.environment.sceneState);
    this.camera = new THREE.PerspectiveCamera(
      this.environment.camera.fov,
      1,
      this.environment.camera.near,
      this.environment.camera.far,
    );

    this.detachViewport = attachViewportObserver(this.container, (size) => {
      this.onViewportResize(size);
    });

    if (this.appConfig.statsEnabled) {
      this.stats = new Stats();
      this.stats.dom.style.top = 'auto';
      this.stats.dom.style.bottom = '0';
      this.container.appendChild(this.stats.dom);
    }

    // Render an empty scene immediately so the canvas is live during load.
    this.renderer.render(this.sceneBundle.scene, this.camera);

    this.assetLoader = createAssetLoader(this.appConfig);

    try {
      await this.loadAndSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[CityPrototype] fatal load error', error);
      this.statusOverlay.setError(
        'Error loading city',
        `${message}\nExpected model at: ${this.environment.modelPath}`,
      );
      return;
    }

    this.startLoop();
  }

  private initRenderer(): boolean {
    try {
      this.renderer = createRenderer(this.appConfig);
    } catch (error) {
      console.error('[CityPrototype] WebGL init failed', error);
      this.statusOverlay.setError(
        'WebGL unavailable',
        'This browser or device could not initialize WebGL.',
      );
      return false;
    }
    this.container.appendChild(this.renderer.domElement);
    return true;
  }

  private async loadAndSetup(): Promise<void> {
    const env = this.environment;
    this.statusOverlay.setLoading('Loading city…', env.modelPath);

    const loaded = await loadCity({
      loader: this.assetLoader.gltf,
      modelPath: env.modelPath,
      terrainObjectName: env.terrainTransition.terrainObjectName,
    });
    this.loaded = loaded;
    this.sceneBundle.scene.add(loaded.root);

    this.logReport();

    const box = new THREE.Box3().setFromObject(loaded.root);
    if (box.isEmpty()) {
      throw new Error('City model has no renderable geometry (empty bounds).');
    }
    this.logBounds(box);

    // --- Terrain plate ------------------------------------------------------
    if (loaded.terrain) {
      const plateBox = new THREE.Box3().setFromObject(loaded.terrain);
      this.plateBounds = {
        minX: plateBox.min.x,
        maxX: plateBox.max.x,
        minZ: plateBox.min.z,
        maxZ: plateBox.max.z,
      };
    }

    // --- Terrain transition (Phase 6) --------------------------------------
    // Built before the bounds, because the skirt is what defines the visual
    // extent that the bounds are inset from.
    if (env.terrainTransition.enabled && loaded.terrain) {
      const transition = createTerrainTransition(loaded.terrain, env.terrainTransition);
      this.sceneBundle.scene.add(transition.group);
      this.transition = transition;
      this.visualBounds = transition.visualBounds;
      if (transition.warnings.length > 0) {
        console.warn('[terrain transition]\n- ' + transition.warnings.join('\n- '));
      }
    } else {
      // No skirt means the hard edge is real, so the footprint inset is the
      // only thing keeping it out of frame — but applying it against the raw
      // content bounds collapses the navigable area to a sliver. Prefer an
      // honest, usable area plus a loud error over a silently unusable one.
      this.visualBounds = this.plateBounds ?? { ...env.contentBounds };
      this.footprintInsetsDisabled = true;
      console.error(
        '[CityPrototype] no terrain transition: the plate edge WILL be visible. ' +
          'Footprint insets disabled so navigation stays usable.',
      );
    }

    // --- Navigable area -----------------------------------------------------
    this.configuredBounds =
      env.navigation.deriveBoundsFromTerrain && this.plateBounds
        ? expandRect(this.plateBounds, -env.navigation.boundsInset)
        : { ...env.navigation.bounds };

    // --- Camera rig (Phase 5) ----------------------------------------------
    const pose = resolveCameraPose(env, this.viewport.aspect);
    const rig = new CameraRig(this.camera, pose);
    rig.setAspect(this.viewport.aspect);
    rig.setFocus(env.initialFocus.x, env.initialFocus.z);
    this.rig = rig;

    // --- Bounds (Phase 4) ---------------------------------------------------
    this.recomputeBounds();

    // --- Navigation (Phase 3) ----------------------------------------------
    this.controller = new DragPanController(
      this.renderer.domElement,
      this.camera,
      rig,
      env.navigation,
      this.effectiveBounds ?? this.configuredBounds ?? env.navigation.bounds,
      {
        onFirstInteraction: () => this.fadeHint(),
        // The footprint is azimuth-dependent, so free yaw means the navigable
        // area changes continuously. Four ray/plane intersections per changed
        // frame; measurably nothing next to the render.
        onYawChanged: () => this.recomputeBounds(),
      },
    );

    this.logNavigationDiagnostics();

    if (this.appConfig.navigationDebugEnabled) {
      this.rebuildBoundsHelper();
    }

    this.debugOverlay = new DebugOverlay(this.container, this.appConfig);

    this.interactionProbe = new InteractionProbe(this.camera);
    const interactiveCount = this.interactionProbe.collectFrom(loaded.root);
    console.info(`[CityPrototype] cached ${interactiveCount} interactive object(s).`);

    this.setupDistricts(loaded.root);

    this.setupClickInteraction();
    this.statusOverlay.hide();
  }

  /**
   * Resolves each configured district and builds its interaction.
   *
   * A district that cannot be located is skipped entirely rather than
   * half-initialised: highlighting, picking, flight and UI against an empty mesh
   * list would give an affordance that does nothing, which is the silent
   * degradation this project has been bitten by before (PROJECT_MEMORY 4.2).
   */
  private setupDistricts(root: THREE.Object3D): void {
    if (!this.rig || !this.controller) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const binding of cityDistrictBindings) {
      const content = findDistrictContent(binding.contentId);
      if (!content) {
        console.error(`[district] no content for binding "${binding.contentId}".`);
        continue;
      }

      const lookup = resolveDistrict(root, binding);
      console.groupCollapsed(`[district] ${binding.contentId}`);
      console.info(`source   ${lookup.source}`);
      console.info(`meshes   ${lookup.meshes.length}`);
      if (lookup.warnings.length > 0) {
        console.warn('- ' + lookup.warnings.join('\n- '));
      }
      console.groupEnd();

      if (lookup.source === 'not-found' || lookup.meshes.length === 0) {
        console.error(
          `[district] "${binding.contentId}" could not be located (tag "${binding.tag}", ` +
            `names ${binding.nodeNames.join(', ') || 'none'}). The district is inert.`,
        );
        continue;
      }

      const interaction = new DistrictInteraction({
        container: this.container,
        canvas: this.renderer.domElement,
        camera: this.camera,
        rig: this.rig,
        controller: this.controller,
        district: lookup,
        binding,
        content,
        groundPlaneHeight: this.environment.navigation.groundPlaneHeight,
        getPose: () => resolveCameraPose(this.environment, this.viewport.aspect),
        getAspect: () => this.viewport.aspect,
        resolveBounds: () => {
          this.recomputeBounds();
          return this.effectiveBounds;
        },
        reducedMotion,
      });

      this.sceneBundle.scene.add(interaction.object3D);
      this.districts.push(interaction);
    }
  }

  // --- Viewport and bounds --------------------------------------------------

  private onViewportResize(size: ViewportSize): void {
    this.viewport = size;
    if (!this.renderer) return;

    applyViewportSize(this.renderer, this.camera, size);

    if (this.rig) {
      // Re-resolving the pose covers the portrait-override case; it is a few
      // trig calls and a projection-matrix update, so it is not worth guarding.
      this.rig.setAspect(size.aspect);
      this.rig.setPose(resolveCameraPose(this.environment, size.aspect));
      // The footprint depends on aspect and pose, so it must be recomputed here
      // — and only here, plus on pose change. It is independent of the focus
      // position, because the camera sits at a fixed offset from it.
      this.recomputeBounds();
      if (this.boundsHelper) this.rebuildBoundsHelper();
    }

    if (!this.running && this.sceneBundle) {
      this.renderer.render(this.sceneBundle.scene, this.camera);
    }
  }

  private recomputeBounds(): void {
    if (!this.rig || !this.visualBounds || !this.configuredBounds) return;
    const nav = this.environment.navigation;

    this.footprint = computeGroundFootprint(
      this.camera,
      this.rig.focus,
      nav.groundPlaneHeight,
      nav.maxGroundDistance,
    );

    this.effectiveBounds = this.footprintInsetsDisabled
      ? { ...this.configuredBounds }
      : computeEffectiveBounds(
          this.configuredBounds,
          this.visualBounds,
          this.footprint,
          nav.edgeSafetyMargin,
        );

    this.controller?.setBounds(this.effectiveBounds);
  }

  /**
   * One-shot report of every rectangle that feeds the navigable area, so a
   * mismatch between config and asset is visible instead of silently shrinking
   * navigation.
   */
  private logNavigationDiagnostics(): void {
    if (!this.effectiveBounds || !this.configuredBounds || !this.visualBounds) return;
    const eff = this.effectiveBounds;
    const plate = this.plateBounds;

    const navW = eff.maxX - eff.minX;
    const navD = eff.maxZ - eff.minZ;
    const fmt = (r: BoundsRect): string =>
      `X [${r.minX.toFixed(0)}, ${r.maxX.toFixed(0)}]  Z [${r.minZ.toFixed(0)}, ${r.maxZ.toFixed(0)}]  (${(r.maxX - r.minX).toFixed(0)} x ${(r.maxZ - r.minZ).toFixed(0)})`;

    console.groupCollapsed('[navigation] bounds');
    console.info(`terrain source   ${this.loaded?.terrainSource ?? 'n/a'}`);
    console.info(`plate            ${plate ? fmt(plate) : 'NOT FOUND'}`);
    console.info(`configured       ${fmt(this.configuredBounds)}`);
    console.info(`visual (+skirt)  ${fmt(this.visualBounds)}`);
    if (this.footprint) {
      const f = this.footprint;
      console.info(
        `footprint reach  -X ${f.reachNegX.toFixed(0)}  +X ${f.reachPosX.toFixed(0)}  -Z ${f.reachNegZ.toFixed(0)}  +Z ${f.reachPosZ.toFixed(0)}  clampedRays=${f.clampedRays}`,
      );
    }
    console.info(`effective        ${fmt(eff)}`);
    if (plate) {
      const coverage = ((navW * navD) / ((plate.maxX - plate.minX) * (plate.maxZ - plate.minZ))) * 100;
      const line = `navigable        ${coverage.toFixed(0)}% of the plate`;
      if (coverage < 50) console.warn(line + ' — smaller than expected');
      else console.info(line);
    }
    console.groupEnd();
  }

  // --- Interaction ----------------------------------------------------------

  private setupClickInteraction(): void {
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUpForClick);
  }

  /**
   * A pointerup only counts as a click when the drag threshold was never
   * exceeded, so panning the city never selects a building.
   */
  private readonly onPointerUpForClick = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (this.controller?.isDragging) return;

    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.interactionProbe?.probe(this.ndc);
  };

  private fadeHint(): void {
    if (this.hintFaded) return;
    this.hintFaded = true;
    this.controlsHint.fadeOut();
  }

  // --- Debug ----------------------------------------------------------------

  private rebuildBoundsHelper(): void {
    if (this.boundsHelper) {
      this.sceneBundle.scene.remove(this.boundsHelper);
      this.boundsHelper.geometry.dispose();
      (this.boundsHelper.material as THREE.Material).dispose();
      this.boundsHelper = null;
    }
    if (!this.effectiveBounds || !this.visualBounds) return;

    const y = this.environment.navigation.groundPlaneHeight + 0.5;
    const points: number[] = [];
    pushRect(points, this.effectiveBounds, y);
    pushRect(points, this.visualBounds, y);
    if (this.configuredBounds) pushRect(points, this.configuredBounds, y);
    if (this.plateBounds) pushRect(points, this.plateBounds, y);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x7bff8e });
    this.boundsHelper = new THREE.LineSegments(geometry, material);
    this.boundsHelper.name = 'NavigationBoundsHelper';
    this.sceneBundle.scene.add(this.boundsHelper);
  }

  private logReport(): void {
    if (!this.loaded) return;
    const r = this.loaded.report;
    console.groupCollapsed('[CityPrototype] asset report');
    console.table({
      objects: r.objectCount,
      meshes: r.meshCount,
      materials: r.materialCount,
      textures: r.textureCount,
      lights: r.lightCount,
      cameras: r.cameraCount,
      skinnedMeshes: r.skinnedMeshCount,
      animations: r.animationCount,
      transparentMaterials: r.transparentMaterialCount,
      doubleSidedMaterials: r.doubleSidedMaterialCount,
    });
    if (r.warnings.length > 0) {
      console.warn('Asset warnings:\n- ' + r.warnings.join('\n- '));
    }
    console.groupEnd();
  }

  private logBounds(box: THREE.Box3): void {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    console.info(
      `[CityPrototype] model bounds: center=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) size=(${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`,
    );
  }

  // --- Render loop ----------------------------------------------------------

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number): void => {
      if (!this.running) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private tick(now: number): void {
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.stats?.begin();

    // Exactly one system writes to the rig per frame. `DragPanController.update`
    // returns early while a district flight holds external control, so the order
    // here is composition rather than a race — but the districts still tick
    // first, because their flight is what decides who owns the rig this frame.
    //
    // Each district resolves at most one hover raycast per frame, against its
    // own meshes and proxy only. Never the Scene.
    for (const district of this.districts) district.update(delta);

    // Advances drag smoothing and release momentum. Cheap arithmetic only —
    // no raycasting happens here, only on pointer events.
    this.controller?.update(delta);

    this.renderer.render(this.sceneBundle.scene, this.camera);

    if (!this.firstFrameRecorded && this.loaded) {
      this.loaded.timings.firstRenderedFrameTime = performance.now();
      this.firstFrameRecorded = true;
    }

    if (this.debugOverlay && this.rig && this.loaded && this.effectiveBounds) {
      this.debugOverlay.update(delta, now, {
        renderer: this.renderer,
        focus: this.rig.focus,
        cameraHeight: this.rig.getHeight(),
        cameraDistance: this.rig.getPose().distance,
        elevationDegrees: this.rig.getPose().elevationDegrees,
        azimuthDegrees: this.rig.getAzimuthDegrees(),
        insideBounds: containsPoint(
          this.rig.focus.x,
          this.rig.focus.z,
          expandRect(this.effectiveBounds, 1e-3),
        ),
        bounds: this.effectiveBounds,
        footprintClamped: this.footprint?.clampedRays ?? false,
        timings: this.loaded.timings,
      });
    }

    this.stats?.end();
  }

  dispose(): void {
    this.stop();

    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUpForClick);
    this.detachViewport?.();
    this.detachViewport = null;

    for (const district of this.districts) district.dispose();
    this.districts = [];

    this.controller?.dispose();
    this.controller = null;

    this.debugOverlay?.dispose();
    this.debugOverlay = null;

    if (this.transition) {
      this.transition.group.removeFromParent();
      this.transition.dispose();
      this.transition = null;
    }

    if (this.boundsHelper) {
      this.boundsHelper.removeFromParent();
      this.boundsHelper.geometry.dispose();
      (this.boundsHelper.material as THREE.Material).dispose();
      this.boundsHelper = null;
    }

    if (this.loaded) {
      disposeLoadedCity(this.loaded);
      this.loaded = null;
    }

    this.sceneBundle?.dispose();
    this.assetLoader?.dispose();

    this.statusOverlay.dispose();
    this.controlsHint.dispose();
    if (this.stats) {
      this.stats.dom.remove();
      this.stats = null;
    }

    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}

function pushRect(out: number[], rect: BoundsRect, y: number): void {
  const corners: Array<[number, number]> = [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
    [rect.minX, rect.maxZ],
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    out.push(a[0], y, a[1], b[0], y, b[1]);
  }
}
