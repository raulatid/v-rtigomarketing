import * as THREE from 'three';
import Stats from 'stats.js';

import { createAppConfig, applyQueryOverrides } from './config/appConfig';
import type { AppConfig } from './config/appConfig';
import { murciaConfig } from './config/murciaConfig';
import type { BoundsRect, EnvironmentConfig } from './config/environmentConfig';
import { resolveCameraPose } from './config/environmentConfig';
import { applyNavigationQueryOverrides } from './config/environmentQueryOverrides';
import { createScene } from './core/createScene';
import type { SceneBundle } from './core/createScene';
import type { ViewportSize } from './core/resize';
import { createAssetLoader } from './assets/createAssetLoader';
import type { AssetLoader } from './assets/createAssetLoader';
import { loadCity, disposeLoadedCity } from './assets/loadCity';
import type { LoadedCity } from './assets/loadCity';
import { CameraRig } from './camera/CameraRig';
import { DragPanController } from './navigation/DragPanController';
import { computeGroundFootprint, computeEffectiveBounds } from './navigation/viewportFootprint';
import type { GroundFootprint } from './navigation/viewportFootprint';
import { containsPoint, expandRect } from './navigation/navigationBounds';
import { createTerrainTransition } from './environment/createTerrainTransition';
import type { TerrainTransition } from './environment/createTerrainTransition';
import { DebugOverlay } from './debug/DebugOverlay';
import { InteractionProbe } from './interaction/InteractionProbe';
import { resolveDistrict } from './interaction/resolveDistrict';
import { DistrictInteraction } from './interaction/DistrictInteraction';
import { cityDistrictBindings } from './scene/cityDistrictBindings';
import { findDistrictContent } from './content/districts';
import { StatusOverlay, ControlsHint } from './ui/overlays';

/**
 * Lifecycle coordinator for the Murcia environment.
 *
 * Deliberately thin — behaviour lives in the modules, and none of them changed
 * in the migration into the unified app. The shell duties this class used to
 * own (creating a renderer, running a rAF loop, observing the container for
 * resizes) now belong to the application: R3F owns the one renderer, the one
 * frame loop and the canvas size, and RenderPipeline owns the render call
 * (ADR 001). What remains is exactly what PROJECT_MEMORY §2.2 predicted would
 * remain — "a move rather than a rewrite".
 *
 * It owns its OWN THREE.Scene, deliberately not shared with Earth: a hidden
 * root still participates in raycasts, Box3.setFromObject and traversals, and
 * lights and fog are Scene-global. See ADR 001.
 *
 * Drive it as: new MurciaExperience(...) -> setViewport() -> load() ->
 * update(delta) per frame. setActive(false) makes update() a no-op without
 * losing any state.
 */
export class MurciaExperience {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly appConfig: AppConfig;
  private readonly environment: EnvironmentConfig;

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

  private loaded: LoadedCity | null = null;
  private active = false;
  private suspendedController = false;
  private onLoadProgress: ((fraction: number) => void) | undefined;

  private readonly statusOverlay: StatusOverlay;
  private readonly controlsHint: ControlsHint;

  private viewport: ViewportSize = { width: 1, height: 1, aspect: 1 };
  private plateBounds: BoundsRect | null = null;
  private configuredBounds: BoundsRect | null = null;
  private visualBounds: BoundsRect | null = null;
  private effectiveBounds: BoundsRect | null = null;
  private footprint: GroundFootprint | null = null;
  private footprintInsetsDisabled = false;

  private firstFrameRecorded = false;
  private hintFaded = false;

  private readonly ndc = new THREE.Vector2();

  constructor(container: HTMLElement, renderer: THREE.WebGLRenderer) {
    this.container = container;
    this.renderer = renderer;
    this.appConfig = applyQueryOverrides(createAppConfig(), window.location.search);

    const environment = this.appConfig.modelPathOverride
      ? { ...murciaConfig, modelPath: this.appConfig.modelPathOverride }
      : murciaConfig;
    // Applied after the model override so the two compose.
    this.environment = applyNavigationQueryOverrides(environment, window.location.search);

    this.statusOverlay = new StatusOverlay(container);
    this.controlsHint = new ControlsHint(container);
  }

  /**
   * Builds the scene graph and loads the city.
   *
   * Separate from construction because it is async and because the caller
   * decides *when* it runs — the unified app starts it during the Earth intro
   * so the transition never waits on it (ADR 004).
   *
   * Resolves once the environment is ready to be shown. Rejects nothing: a
   * fatal load surfaces on the status overlay and leaves the environment
   * inert, exactly as it did standalone.
   */
  async load(options: { onProgress?: (fraction: number) => void } = {}): Promise<void> {
    this.onLoadProgress = options.onProgress;
    this.sceneBundle = createScene(this.appConfig, this.environment.sceneState);
    this.camera = new THREE.PerspectiveCamera(
      this.environment.camera.fov,
      this.viewport.aspect,
      this.environment.camera.near,
      this.environment.camera.far,
    );

    // Debug instrumentation is opt-in now. Standalone this defaulted on, which
    // is fine for a prototype and not for a marketing site.
    if (this.appConfig.statsEnabled) {
      this.stats = new Stats();
      this.stats.dom.style.top = 'auto';
      this.stats.dom.style.bottom = '0';
      this.container.appendChild(this.stats.dom);
    }

    this.assetLoader = createAssetLoader(this.appConfig);

    try {
      await this.loadAndSetup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[murcia] fatal load error', error);
      this.statusOverlay.setError(
        'Error loading city',
        `${message}\nExpected model at: ${this.environment.modelPath}`,
      );
    }
  }

  /**
   * Pays the GPU cost of the first frame *before* the transition, not during
   * it (ADR 004). Safe to call more than once; a no-op before load().
   *
   * Two separate costs, because compileAsync only covers one of them:
   *
   * 1. Shader programs and texture uploads — `compileAsync(scene, camera)`.
   *    Verified against three 0.174: the signature is
   *    `compileAsync(scene, camera, targetScene = null)`, and it works on a
   *    scene that is not R3F's default one.
   * 2. Geometry attribute buffers, which three uploads lazily on first draw
   *    and which compileAsync does NOT cover (PROJECT_MEMORY §2.4). Forced
   *    here with one render into a 1x1 target — the smallest draw that still
   *    walks the whole visible graph. 957 GPU-instanced buildings' buffers
   *    landing on the transition frame is exactly the hitch this avoids.
   *
   * The tiny target is used rather than a real render so nothing reaches the
   * canvas: at this point Earth is still on screen.
   */
  async warm(): Promise<void> {
    if (!this.sceneBundle || !this.camera) return;

    await this.renderer.compileAsync(this.sceneBundle.scene, this.camera);

    const target = new THREE.WebGLRenderTarget(1, 1);
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.sceneBundle.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      target.dispose();
    }
  }

  /** The scene RenderPipeline draws when this experience is showing. */
  get scene(): THREE.Scene {
    return this.sceneBundle.scene;
  }

  /** This environment's camera. Never Earth's — the near/far planes differ. */
  get viewCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Frozen, not reset (ADR 003). update() stops advancing, so focus, yaw,
   * drag smoothing and district state all resume exactly where they were.
   */
  setActive(next: boolean): void {
    if (this.active === next) return;
    this.active = next;

    // The drag controller listens on the SHARED canvas, so while Earth is
    // showing, every Earth drag also reaches it — its target focus and yaw
    // would drift and the city would jump on return.
    //
    // beginExternalControl is the existing answer to "another system owns the
    // rig": it stops update() touching the rig and clears velocities, and the
    // matching endExternalControl({adoptRigState}) re-seeds current AND target
    // state from the rig, discarding whatever the stray events accumulated.
    // checks/district-flight.ts §2 asserts that pairing produces no snap-back.
    //
    // Guarded on who already holds control: a district flight in progress owns
    // it, and releasing on its behalf would strand it mid-flight.
    if (!next) {
      if (this.controller && !this.controller.isExternallyControlled) {
        this.controller.beginExternalControl();
        this.suspendedController = true;
      }
    } else if (this.suspendedController) {
      this.suspendedController = false;
      this.controller?.endExternalControl({ adoptRigState: true });
    }
  }

  private async loadAndSetup(): Promise<void> {
    const env = this.environment;
    this.statusOverlay.setLoading('Loading city…', env.modelPath);

    const loaded = await loadCity({
      loader: this.assetLoader.gltf,
      modelPath: env.modelPath,
      terrainObjectName: env.terrainTransition.terrainObjectName,
      onProgress: this.onLoadProgress,
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
        '[murcia] no terrain transition: the plate edge WILL be visible. ' +
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

    if (this.appConfig.debugOverlayEnabled) {
      this.debugOverlay = new DebugOverlay(this.container, this.appConfig);
    }

    this.interactionProbe = new InteractionProbe(this.camera);
    const interactiveCount = this.interactionProbe.collectFrom(loaded.root);
    console.info(`[murcia] cached ${interactiveCount} interactive object(s).`);

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

  /**
   * Called by the R3F layer whenever the canvas size changes.
   *
   * Replaces the standalone ResizeObserver: R3F already measures the canvas and
   * owns renderer.setSize, so only the projection and the pose/bounds work that
   * depended on aspect remain here. The footprint is aspect- and pose-dependent,
   * which is why the bounds must be recomputed on every resize.
   */
  setViewport(size: ViewportSize): void {
    this.viewport = size;
    if (!this.camera) return;

    this.camera.aspect = size.aspect;
    this.camera.updateProjectionMatrix();

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
    console.groupCollapsed('[murcia] asset report');
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
      `[murcia] model bounds: center=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) size=(${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`,
    );
  }

  // --- Frame ----------------------------------------------------------------

  /**
   * One frame of simulation. Does NOT render — RenderPipeline owns the single
   * render call for the whole application (ADR 001).
   *
   * Driven by R3F's loop, so `delta` arrives already measured; the standalone
   * version derived it from its own performance.now() bookkeeping.
   */
  update(delta: number): void {
    if (!this.active || !this.sceneBundle) return;

    const now = performance.now();
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
    this.active = false;

    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUpForClick);

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

    // The renderer and its canvas belong to the application, not to this
    // environment. Disposing them here would take Earth down with it.
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
