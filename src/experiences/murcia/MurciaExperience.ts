import * as THREE from 'three';

import { createAppConfig, applyQueryOverrides } from './config/appConfig';
import type { AppConfig } from './config/appConfig';
import { murciaConfig } from './config/murciaConfig';
import type { EnvironmentConfig } from './config/environmentConfig';
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
import { murciaWarpPose } from './camera/warpPose';
import { DragPanController } from './navigation/DragPanController';
import { NavigableArea } from './navigation/navigableArea';
import { containsPoint, expandRect } from './navigation/navigationBounds';
import { createTerrainTransition } from './environment/createTerrainTransition';
import type { TerrainTransition } from './environment/createTerrainTransition';
import { DebugOverlay } from './debug/DebugOverlay';
import { MurciaDebugTools } from './debug/MurciaDebugTools';
import { InteractionProbe } from './interaction/InteractionProbe';
import { resolveDistrict } from './interaction/resolveDistrict';
import { DistrictInteraction } from './interaction/DistrictInteraction';
import type { ServiceSiteInput } from './interaction/DistrictInteraction';
import { cityDistrictBindings } from './scene/cityDistrictBindings';
import { DISTRICT_CONTENT } from '../../content/generated/districts';
import { findDistrictContent } from '../../content/lookup';
import { StatusOverlay, ControlsHint } from './ui/overlays';
import { createCursorManager } from '../../interaction/cursorManager';
import type { CursorManager } from '../../interaction/cursorManager';
import { clientToNdc } from '../../interaction/screenSpace';

/**
 * Lifecycle coordinator for the Murcia environment.
 *
 * Deliberately thin — behaviour lives in the modules, and none of them changed
 * in the migration into the unified app. The shell duties this class used to
 * own (creating a renderer, running a rAF loop, observing the container for
 * resizes) now belong to the application: R3F owns the one renderer, the one
 * frame loop and the canvas size, and RenderPipeline owns the render call
 * (ADR 001). What remains is exactly what the Murcia prototype's own memory
 * predicted would remain — "a move rather than a rewrite" (DECISIONS §1).
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
  /** False on a production build — see the constructor. */
  private readonly debugTools: boolean;
  /** See the constructor option of the same name. */
  private readonly onAttentionChange?: () => void;

  private sceneBundle!: SceneBundle;
  private camera!: THREE.PerspectiveCamera;
  private assetLoader!: AssetLoader;

  private rig: CameraRig | null = null;
  private controller: DragPanController | null = null;
  private transition: TerrainTransition | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private interactionProbe: InteractionProbe | null = null;
  /**
   * One interaction per district; today there is one district, engaged
   * through any of its service buildings. Kept as a list so a second district
   * is a table row, not a refactor.
   */
  private districts: DistrictInteraction[] = [];

  private loaded: LoadedCity | null = null;
  /**
   * Elapsed seconds handed to the water shader.
   *
   * `update` receives a DELTA and the shader wants absolute time, so it has to
   * be accumulated. It lives past the early-return in `update`, so the river
   * holds still while Murcia is not the active experience instead of jumping
   * forward by the whole time away on the next frame it draws.
   */
  private waterTime = 0;
  private active = false;
  private suspendedController = false;
  private onLoadProgress: ((fraction: number) => void) | undefined;
  private loadFailed = true;
  /** 0 at the resting pose, 1 at the warp's extreme — which end depends on the role. */
  private warpAmount = 0;
  /** True while this city is the one being LEFT, which is the rising leg. */
  private warpDeparting = false;

  private readonly statusOverlay: StatusOverlay;
  private readonly controlsHint: ControlsHint;

  /**
   * This environment's cursor sources — district hovers and the drag — resolved
   * to a single state. The canvas is shared with Earth, which owns a manager of
   * its own; they never overlap because each clears its requests when it goes
   * inactive.
   */
  private readonly cursor: CursorManager;

  private viewport: ViewportSize = { width: 1, height: 1, aspect: 1 };
  /** The navigable-area pipeline: plate -> visual -> configured -> effective. */
  private readonly bounds: NavigableArea;
  /** FPS meter, bounds wireframe and diagnostics. Inert unless debugTools. */
  private readonly debug: MurciaDebugTools;

  private firstFrameRecorded = false;
  private hintFaded = false;

  private readonly ndc = new THREE.Vector2();

  /**
   * `debugTools` gates every developer affordance: the query-parameter
   * overrides, the FPS meter, the F3 panel, the bounds wireframe and the
   * diagnostic logging. It is passed in rather than read here because
   * src/experiences may not depend upward on the shell, and because the
   * `checks/` harnesses bundle these modules for Node where `import.meta.env`
   * does not exist (see scene/cityDistrictBindings.ts).
   */
  constructor(
    container: HTMLElement,
    renderer: THREE.WebGLRenderer,
    options: {
      debugTools?: boolean;
      /**
       * Fired when `hasFocusedDistrict` may have flipped — a district was
       * engaged or released. The application re-derives navigation
       * availability from it (the rail must stand down the moment a panel
       * opens, not on the next wheel event). No payload: consumers read
       * `hasFocusedDistrict`, the same aggregate they already poll.
       */
      onAttentionChange?: () => void;
    } = {},
  ) {
    this.container = container;
    this.renderer = renderer;
    this.debugTools = options.debugTools ?? false;
    this.onAttentionChange = options.onAttentionChange;
    this.appConfig = applyQueryOverrides(
      createAppConfig(),
      window.location.search,
      this.debugTools,
    );

    const environment = this.appConfig.modelPathOverride
      ? { ...murciaConfig, modelPath: this.appConfig.modelPathOverride }
      : murciaConfig;
    // Applied after the model override so the two compose.
    this.environment = applyNavigationQueryOverrides(
      environment,
      window.location.search,
      this.debugTools,
    );

    this.statusOverlay = new StatusOverlay(container);
    this.controlsHint = new ControlsHint(container);
    this.cursor = createCursorManager(renderer.domElement);
    // After the query overrides, so a `?bounds=` override reaches the pipeline.
    this.bounds = new NavigableArea(this.environment.navigation);
    this.debug = new MurciaDebugTools(this.debugTools, this.appConfig, container);
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
    this.debug.mountStats();

    // The renderer, because the KTX2 transcoder has to ask the GPU which
    // compressed formats it supports before it can transcode anything.
    this.assetLoader = createAssetLoader(this.renderer);

    try {
      await this.loadAndSetup();
      this.loadFailed = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[murcia] fatal load error', error);
      this.statusOverlay.setError(
        'No se pudo cargar la ciudad',
        `${message}\nExpected model at: ${this.environment.modelPath}`,
      );
      this.loadFailed = true;
    }
  }

  /**
   * False when the city could not be loaded. The application uses this to
   * decide whether to offer the transition at all — an entry point into a
   * world that cannot render is worse than no entry point.
   */
  get isUsable(): boolean {
    return !this.loadFailed;
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
   *    and which compileAsync does NOT cover (PROJECT_MEMORY, "Loading").
   *    Forced here with one render into a 1x1 target — the smallest draw that
   *    still walks the whole visible graph. 957 GPU-instanced buildings'
   *    buffers landing on the transition frame is exactly the hitch this
   *    avoids.
   *
   * The tiny target is used rather than a real render so nothing reaches the
   * canvas: at this point Earth is still on screen.
   */
  async warm(): Promise<void> {
    if (!this.sceneBundle || !this.camera) return;

    await this.renderer.compileAsync(this.sceneBundle.scene, this.camera);

    const target = new THREE.WebGLRenderTarget(1, 1);
    const previousTarget = this.renderer.getRenderTarget();
    // The render target is not the only thing this render moves.
    //
    // three's WebGLBackground applies `scene.background` by calling
    // setClearColor on the RENDERER, and never puts it back — it is renderer
    // state, not scene state. This scene's background is the daylight sky
    // (`0x9fb4c7`), so a warm-up that only restores the target leaves the
    // shared renderer clearing to pale blue. Earth's RenderPass declares no
    // clear colour of its own, so its very next clear used that one, and with
    // the Earth still tiny mid-intro the result was a full pale-blue viewport
    // for exactly one frame. That is the white flash people reported: measured
    // at 3/3 reload captures with this restore absent and 0/8 with it present
    // (plan 008, `scripts/proto/capture-boot.mjs`).
    //
    // Restored in the same `finally` as the target, because it is the same
    // class of borrowed state and the next person to add a line here should
    // find both together.
    const previousClear = this.renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = this.renderer.getClearAlpha();
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.sceneBundle.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousClear, previousClearAlpha);
      target.dispose();
    }
  }

  /**
   * The warp pose: 0 is rest, 1 is the extreme reached at the cut. Which
   * extreme depends on `departing` — the two legs are not mirror images.
   *
   *   arriving  — distance falls to `warpCloseDistance` and back. Elevation and
   *               FOV are untouched, for the same reason `CameraFlight` leaves
   *               them alone: they set the ground footprint, and the terrain
   *               skirt is sized against a measured footprint at a specific
   *               pose (PROJECT_MEMORY, "The number that can hurt you").
   *   departing — the camera RISES. Murcia is inside the Earth, so leaving it
   *               has to recede, and distance alone cannot buy that: pulling
   *               back widens the footprint at ~1.33 units per unit of distance
   *               against a worst-case skirt margin of +50 at 5120x1440.
   *               Steepening the elevation shrinks the footprint faster than
   *               the extra distance grows it, so the rising pose reaches less
   *               far than rest does (ADR 006).
   *
   * FOV is untouched on both legs. `checks/warp-transition.ts` asserts the
   * footprint invariant against the real placement maths; this method does not
   * re-check it.
   *
   * No external control is taken. This owns distance and elevation;
   * `DragPanController` owns focus and yaw, and `setFocus`/`setYaw` re-apply
   * whatever pose is current, so the two compose. Taking
   * `beginExternalControl()` would collide with `setActive(true)` firing at the
   * cut, which releases it — and the flag is shared with every district flight
   * besides.
   */
  setWarpPose(amount: number, departing: boolean): void {
    if (!this.rig) return;
    this.warpAmount = amount;
    this.warpDeparting = departing;
    this.applyWarpPose();
  }

  private applyWarpPose(): void {
    if (!this.rig) return;
    // Rest comes from the viewport-resolved pose so portrait overrides survive
    // the warp; the far ends are environment data.
    const base = resolveCameraPose(this.environment, this.viewport.aspect);
    const pose = murciaWarpPose(
      {
        restDistance: base.distance,
        restElevation: base.elevationDegrees,
        closeDistance: this.environment.warpCloseDistance,
        departDistance: this.environment.warpDepartDistance,
        departElevation: this.environment.warpDepartElevationDegrees,
      },
      this.warpAmount,
      this.warpDeparting,
    );
    // A FRESH object every time. `rig.getPose()` hands back `murciaConfig.camera`
    // by identity, so mutating it would corrupt the environment config for the
    // rest of the session.
    this.rig.setPose({ ...base, ...pose });
  }

  /**
   * True while any district is focused or its panel is open.
   *
   * Read by the application to decide whether a scene-navigation gesture may be
   * accepted: global navigation stands down while the viewer is looking at
   * something (`adr/009`). Intent, not mechanics — the four-state district union
   * stays inside the interaction (ARCHITECTURE 27).
   *
   * Deliberately excludes `hovering`, which is re-resolved every frame: a rail that
   * went inert as the pointer crossed a district would flicker.
   */
  get hasFocusedDistrict(): boolean {
    return this.districts.some((district) => district.isEngaged);
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

    // Frame work was always gated; INPUT was not. Both district interaction and
    // the click probe listen on the SHARED canvas, so while Earth was showing,
    // every click on the globe raycast the hidden city — and a district hit flew
    // Murcia's camera, so you warped into a city that had moved behind your
    // back. Frozen has to mean deaf as well as still.
    for (const district of this.districts) district.setEnabled(next);

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
      // Hovers are resolved in update(), which stops here, so anything held at
      // this moment could never be retracted — it would keep the pointing hand
      // up for the whole time Earth is showing. Nothing is restored on the way
      // back in: the next pointer move resolves the hover against wherever the
      // pointer actually is by then.
      this.cursor.clear();

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
    this.statusOverlay.setLoading('Cargando la ciudad…', env.modelPath);

    const loaded = await loadCity({
      loader: this.assetLoader.gltf,
      modelPath: env.modelPath,
      terrainObjectName: env.terrainTransition.terrainObjectName,
      // The renderer travels with the sheet because a KTX2 set cannot be
      // decoded without asking this GPU which compressed formats it has.
      trimSheet: env.trimSheet,
      renderer: this.renderer,
      onProgress: this.onLoadProgress,
    });
    this.loaded = loaded;
    this.sceneBundle.scene.add(loaded.root);

    if (this.loaded) this.debug.logAssetReport(this.loaded.report);

    const box = new THREE.Box3().setFromObject(loaded.root);
    if (box.isEmpty()) {
      throw new Error('City model has no renderable geometry (empty bounds).');
    }
    this.debug.logModelBounds(box);

    // --- Terrain plate ------------------------------------------------------
    if (loaded.terrain) {
      this.bounds.setPlateFromObject(loaded.terrain);
    }

    // --- Terrain transition (Phase 6) --------------------------------------
    // Built before the bounds, because the skirt is what defines the visual
    // extent that the bounds are inset from.
    if (env.terrainTransition.enabled && loaded.terrain) {
      // The river channel is an authored opening that reaches the plate edge on
      // both sides, so the collar has to be told about it or it seals the two
      // river mouths shut.
      const transition = createTerrainTransition(loaded.terrain, env.terrainTransition, {
        openings: loaded.riverBounds ? [loaded.riverBounds] : [],
      });
      this.sceneBundle.scene.add(transition.group);
      this.transition = transition;
      this.bounds.setVisualBounds(transition.visualBounds);
      if (transition.warnings.length > 0) {
        console.warn('[terrain transition]\n- ' + transition.warnings.join('\n- '));
      }
    } else {
      // No skirt means the hard edge is real, so the footprint inset is the
      // only thing keeping it out of frame — but applying it against the raw
      // content bounds collapses the navigable area to a sliver. Prefer an
      // honest, usable area plus a loud error over a silently unusable one.
      this.bounds.disableFootprintInsets(env.contentBounds);
      console.error(
        '[murcia] no terrain transition: the plate edge WILL be visible. ' +
          'Footprint insets disabled so navigation stays usable.',
      );
    }

    // --- Navigable area -----------------------------------------------------
    this.bounds.deriveConfigured(env.navigation.bounds);

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
      this.bounds.initialBounds(env.navigation.bounds),
      {
        onFirstInteraction: () => this.fadeHint(),
        // The footprint is azimuth-dependent, so free yaw means the navigable
        // area changes continuously. Four ray/plane intersections per changed
        // frame; measurably nothing next to the render.
        onYawChanged: () => this.recomputeBounds(),
        onDragStateChanged: (dragging) =>
          this.cursor.request('drag', dragging ? 'grabbing' : ''),
      },
    );

    this.debug.logNavigation(this.bounds, this.loaded?.terrainSource ?? 'n/a');

    if (this.appConfig.navigationDebugEnabled) {
      this.debug.rebuildBoundsHelper(
        this.sceneBundle.scene,
        this.bounds,
        this.environment.navigation.groundPlaneHeight,
      );
    }

    if (this.appConfig.debugOverlayEnabled) {
      this.debugOverlay = new DebugOverlay(this.container, this.appConfig);
    }

    this.interactionProbe = new InteractionProbe(this.camera, this.debugTools);
    const interactiveCount = this.interactionProbe.collectFrom(loaded.root);
    if (this.debugTools) {
      console.info(`[murcia] cached ${interactiveCount} interactive object(s).`);
    }

    this.setupDistricts(loaded.root);

    this.setupClickInteraction();
    this.statusOverlay.hide();
  }

  /**
   * Resolves each configured district's service buildings and builds ONE
   * interaction per district.
   *
   * A building that cannot be located is skipped rather than half-initialised:
   * highlighting, picking, flight and UI against an empty mesh list would give
   * an affordance that does nothing, which is the silent degradation this
   * project has been bitten by before (PROJECT_MEMORY, "Things that will bite
   * you again"). Every skip is reported, and a district with no buildings left
   * is skipped whole.
   */
  private setupDistricts(root: THREE.Object3D): void {
    if (!this.rig || !this.controller) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const binding of cityDistrictBindings) {
      const content = findDistrictContent(DISTRICT_CONTENT, binding.contentId);
      if (!content) {
        console.error(`[district] no content for binding "${binding.contentId}".`);
        continue;
      }

      const sites: ServiceSiteInput[] = [];
      const known = new Set(content.services.map((s) => s.id));
      for (const building of binding.buildings) {
        if (!known.has(building.serviceId)) {
          console.warn(
            `[district] ${binding.contentId}: building "${building.nodeName}" is bound to ` +
              `"${building.serviceId}", which is not one of the district's services.`,
          );
        }
      }

      // Content order is the tour order.
      for (const service of content.services) {
        const building = binding.buildings.find((b) => b.serviceId === service.id);
        if (!building) {
          console.warn(
            `[district] ${binding.contentId}: service "${service.id}" has no building ` +
              'in cityDistrictBindings; it is not in the city.',
          );
          continue;
        }

        // Identified by name by contract, so no tag (which also keeps the
        // "add a custom property" nag off) and no spatial fallback.
        const lookup = resolveDistrict(root, {
          id: `${binding.contentId}/${service.id}`,
          tag: '',
          nodeNames: [building.nodeName],
          allowSpatialFallback: false,
        });
        if (this.debugTools) {
          console.groupCollapsed(`[district] ${binding.contentId}/${service.id}`);
          console.info(`node     ${building.nodeName}`);
          console.info(`source   ${lookup.source}`);
          console.info(`meshes   ${lookup.meshes.length}`);
          console.groupEnd();
        }
        // Outside the gate: a building resolving with warnings is a real problem
        // with the asset, and the next person to hit it should see it wherever
        // they are.
        if (lookup.warnings.length > 0) {
          console.warn(
            `[district] ${binding.contentId}/${service.id}:\n- ` + lookup.warnings.join('\n- '),
          );
        }
        if (lookup.source === 'not-found' || lookup.meshes.length === 0) {
          console.error(
            `[district] "${service.id}" could not be located (node "${building.nodeName}"). ` +
              'That service is not in the city.',
          );
          continue;
        }
        sites.push({ service, binding: building, lookup });
      }

      if (sites.length === 0) {
        console.error(`[district] "${binding.contentId}" has no locatable buildings. It is inert.`);
        continue;
      }

      const interaction = new DistrictInteraction({
        container: this.container,
        canvas: this.renderer.domElement,
        camera: this.camera,
        rig: this.rig,
        controller: this.controller,
        binding,
        content,
        sites,
        cursor: this.cursor,
        groundPlaneHeight: this.environment.navigation.groundPlaneHeight,
        // The rig's EFFECTIVE pose, not the configured one. computeFramedFocus
        // builds a detached rig from this to work out where the focus must sit
        // to put the district beside the panel; fed the unzoomed distance it
        // would frame for a camera the user is not looking through and miss by
        // the zoom ratio. The rig re-resolves the pose on resize, so this stays
        // viewport-correct as well.
        getPose: () => this.rig?.getEffectivePose() ??
          resolveCameraPose(this.environment, this.viewport.aspect),
        getAspect: () => this.viewport.aspect,
        resolveBounds: () => {
          this.recomputeBounds();
          return this.bounds.effectiveBounds;
        },
        focusFlight: this.environment.focusFlight,
        tapThresholdPx: {
          mouse: this.environment.navigation.dragThresholdPx,
          touch: this.environment.navigation.touchDragThresholdPx,
        },
        reducedMotion,
        onEngagedChange: this.onAttentionChange,
      });

      // Seeded, not assumed: districts are built during the Earth intro (ADR
      // 004 prefetches the city), so at this point `active` is normally false
      // and setActive() will not fire again to correct it.
      interaction.setEnabled(this.active);

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
      // Through applyWarpPose, not setPose directly: a resize mid-warp would
      // otherwise snap the pose back to rest and fight the warp.
      this.applyWarpPose();
      // The footprint depends on aspect and pose, so it must be recomputed here
      // — and only here, plus on pose change. It is independent of the focus
      // position, because the camera sits at a fixed offset from it.
      this.recomputeBounds();
      if (this.debug.hasBoundsHelper) {
        this.debug.rebuildBoundsHelper(
          this.sceneBundle.scene,
          this.bounds,
          this.environment.navigation.groundPlaneHeight,
        );
      }
    }
  }

  private recomputeBounds(): void {
    if (!this.rig) return;
    const effective = this.bounds.recompute(this.camera, this.rig.focus);
    if (effective) this.controller?.setBounds(effective);
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
    // The canvas is shared with Earth, so without this every click on the globe
    // raycasts the city standing behind it.
    if (!this.active) return;
    if (event.button !== 0) return;
    if (this.controller?.isDragging) return;

    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    clientToNdc(rect, event.clientX, event.clientY, this.ndc);
    this.interactionProbe?.probe(this.ndc);
  };

  private fadeHint(): void {
    if (this.hintFaded) return;
    this.hintFaded = true;
    this.controlsHint.fadeOut();
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
    this.debug.frameBegin();

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

    // One uniform write. `water.update` wants elapsed seconds, not the delta —
    // passing `delta` straight through pins uTime at about 1/60 and the river
    // renders as a still photograph of plausible water.
    if (this.loaded?.water) {
      this.waterTime += delta;
      this.loaded.water.update(this.waterTime);
    }

    if (!this.firstFrameRecorded && this.loaded) {
      this.loaded.timings.firstRenderedFrameTime = performance.now();
      this.firstFrameRecorded = true;
    }

    const overlayBounds = this.bounds.effectiveBounds;
    if (this.debugOverlay && this.rig && this.loaded && overlayBounds) {
      this.debugOverlay.update(delta, now, {
        renderer: this.renderer,
        focus: this.rig.focus,
        cameraHeight: this.rig.getHeight(),
        // Effective, so the readout follows the user's zoom. Reporting the
        // configured 165 while the camera sits at 198 makes the overlay
        // useless for exactly the verification zoom needs.
        cameraDistance: this.rig.getEffectivePose().distance,
        elevationDegrees: this.rig.getPose().elevationDegrees,
        azimuthDegrees: this.rig.getAzimuthDegrees(),
        insideBounds: containsPoint(
          this.rig.focus.x,
          this.rig.focus.z,
          expandRect(overlayBounds, 1e-3),
        ),
        bounds: overlayBounds,
        footprintClamped: this.bounds.footprintClamped,
        timings: this.loaded.timings,
      });
    }

    this.debug.frameEnd();
  }

  dispose(): void {
    this.active = false;

    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUpForClick);

    for (const district of this.districts) district.dispose();
    this.districts = [];

    this.controller?.dispose();
    this.controller = null;

    this.cursor.dispose();

    this.debugOverlay?.dispose();
    this.debugOverlay = null;

    if (this.transition) {
      this.transition.group.removeFromParent();
      this.transition.dispose();
      this.transition = null;
    }

    if (this.loaded) {
      disposeLoadedCity(this.loaded);
      this.loaded = null;
    }

    this.sceneBundle?.dispose();
    this.assetLoader?.dispose();

    this.statusOverlay.dispose();
    this.controlsHint.dispose();
    this.debug.dispose(this.sceneBundle?.scene ?? null);

    // The renderer and its canvas belong to the application, not to this
    // environment. Disposing them here would take Earth down with it.
  }
}

