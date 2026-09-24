import { prefersReducedMotion } from '../../platform/motionPreference'
import * as THREE from 'three';

import { createAppConfig, applyQueryOverrides } from './config/appConfig';
import type { AppConfig } from './config/appConfig';
import { murciaConfig } from './config/murciaConfig';
import type { BoundsRect, CameraPoseConfig, EnvironmentConfig } from './config/environmentConfig';
import { resolveCameraPose, resolveZoomFar } from './config/environmentConfig';
import {
  applyCameraTuningQueryOverrides,
  applyNavigationQueryOverrides,
} from './config/environmentQueryOverrides';
import { createScene } from './core/createScene';
import type { SceneBundle } from './core/createScene';
import type { ViewportSize } from './core/resize';
import { whileRevealed } from './core/whileRevealed';
import { createAssetLoader } from './assets/createAssetLoader';
import type { AssetLoader } from './assets/createAssetLoader';
import { loadCity, disposeLoadedCity } from './assets/loadCity';
import type { LoadedCity } from './assets/loadCity';
import { CameraRig } from './camera/CameraRig';
import { murciaWarpPose } from './camera/warpPose';
import { murciaZoomPose, murciaZoomTargets } from './camera/zoomPose';
import type { MurciaZoomTargets } from './camera/zoomPose';
import { createCameraInput } from './navigation/createCameraInput';
import type { CameraInput } from './navigation/createCameraInput';
import { createDefaultCameraTuning } from './camera/cameraTuning';
import type { CameraTuning } from './camera/cameraTuning';
import { containsPoint, expandRect } from './navigation/navigationBounds';
import { createTerrainTransition } from './environment/createTerrainTransition';
import type { TerrainTransition } from './environment/createTerrainTransition';
import { DebugOverlay } from './debug/DebugOverlay';
import { MurciaDebugTools } from './debug/MurciaDebugTools';
import { InteractionProbe } from './interaction/InteractionProbe';
import { createBlogDisplayEntry } from './blogDisplay/createBlogDisplayEntry';
import type { BlogDisplayEntry } from './blogDisplay/createBlogDisplayEntry';
import { createServicesCampus } from './campus/createServicesCampus';
import type { ServicesCampusSection } from './campus/createServicesCampus';
import { cityDistrictBindings } from './scene/cityDistrictBindings';
import { DISTRICT_CONTENT } from '../../content/generated/districts';
import { TOWER_SCREEN_CONTENT } from '../../content/tower';
import { layoutTowerSlides } from './landmark/towerScreen/content/layoutTowerSlides';
import { findDistrictContent } from '../../content/lookup';
import { StatusOverlay } from './ui/overlays';
import { CompassBar, type CompassPoi } from './ui/compassBar';
import { createCityGeotags } from './geotags/cityGeotags';
import type { Geotags } from './geotags/createGeotags';
import { createTowerLogo } from './landmark/createTowerLogo';
import type { TowerLogo } from './landmark/createTowerLogo';
import { attachTowerScreen } from './landmark/towerScreen/attachTowerScreen';
import type { TowerScreen } from './landmark/towerScreen/attachTowerScreen';
import { VERTIGO_BUILDING } from './landmark/vertigoBuildingConfig';
import { createCursorManager } from '../../interaction/cursorManager';
import type { CursorManager } from '../../interaction/cursorManager';
import { clientToNdc } from '../../interaction/screenSpace';

/**
 * The zoom's ease used to live here, as ZOOM_LERP_K and ZOOM_SETTLE_EPSILON.
 *
 * It moved into `CameraRig`, where distance is now spring state rather than a
 * pose rewritten every frame. That is not tidying: the rig runs the pitch on the
 * ZOOM's own spring coefficients, so tilt and distance settle as one motion, and
 * a single scalar lerp out here could not express that coupling at all.
 */

/**
 * How far past the authored city the wrapped surface must reach before it
 * counts as ground the camera can see the horizon over, in world units.
 *
 * A tolerance for float, not a tuning knob. The two surfaces this tells apart
 * differ by roughly 900 units on every side, and when they are the same surface
 * its measured bounds ARE `contentBounds` — that rectangle was measured off it.
 */
const GROUND_REACH_EPSILON = 1;

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
  /**
   * The document motion snapshot, obtained at construction. ONE value for the
   * environment: the campus's flights and the tower sign both answer to it,
   * and a second `matchMedia` per consumer is how two parts of one city end
   * up disagreeing about the same setting.
   */
  private readonly reducedMotion: boolean;
  /** See the constructor option of the same name. */
  private readonly onAttentionChange?: () => void;

  /**
   * The blog's entry point in the city.
   *
   * Emits a bare signal outward and nothing else — no argument, no category, no
   * knowledge of what the application does with it. Murcia must not learn that a
   * blog exists: `checks/architecture.ts` forbids `src/experiences/` from
   * importing `src/blog/` or the routing, and a callback with no payload is what
   * keeps that true rather than merely unenforced.
   */
  private readonly onOpenBlog?: () => boolean;
  private readonly onBlogApproachStart?: () => void;
  private readonly buildAssetsAvailable: boolean;
  private blogDisplay: BlogDisplayEntry | null = null;

  private sceneBundle!: SceneBundle;
  private camera!: THREE.PerspectiveCamera;
  /** Null once the city is decoded, which is the point — see `releaseDecoders`. */
  private assetLoader: AssetLoader | null = null;

  private rig: CameraRig | null = null;
  private cameraInput: CameraInput | null = null;
  private cameraTuning: CameraTuning | null = null;
  private transition: TerrainTransition | null = null;
  private debugOverlay: DebugOverlay | null = null;
  private interactionProbe: InteractionProbe | null = null;
  /**
   * The services section: the campus, its particles, its camera and its copy.
   * Null until the city loads, and for good when the campus could not be
   * assembled — the city then shows it as scenery.
   */
  private campus: ServicesCampusSection | null = null;
  /**
   * A pose a resize resolved while the campus held the camera. Applied once the
   * rig has the camera back: writing it earlier would move a camera the campus
   * owns, and the next adopt would read a pose nobody chose.
   */
  private deferredPose: CameraPoseConfig | null = null;
  /**
   * The two places worth clicking, pointed at from any heading. Built after the
   * city loads, from whichever of them actually loaded.
   */
  private compass: CompassBar | null = null;
  /** Pins over the same two places, from a distance. Self-contained: `geotags/`. */
  private geotags: Geotags | null = null;
  /** The header's Servicios button, waiting for a free camera. See `requestServices`. */
  private servicesRequested = false;
  /** The Vertigo tower's turning logo. Built after the city loads. */
  private towerLogo: TowerLogo | null = null;
  /** The tower's LED screen: its compositions, taking turns on the carousel. */
  private towerScreen: TowerScreen | null = null;
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
  private onLoadProgress: ((fraction: number) => void) | undefined;
  private loadFailed = true;
  /** 0 at the resting pose, 1 at the warp's extreme — which end depends on the role. */
  private warpAmount = 0;
  /** True while this city is the one being LEFT, which is the rising leg. */
  private warpDeparting = false;
  /** True while the cinematic owns the camera. Set by `setWarpPose`. */
  private warpEngaged = false;
  /**
   * Where the viewer has asked the zoom to be, -1 .. +1 (`adr/014`).
   *
   * ONE number here now. A wheel notch is a fifth of the band and lands whole,
   * so it still must not be written straight through to the camera — but the
   * smoothing moved into `CameraRig`, which holds distance and elevation as
   * spring state. This class publishes the request; the rig eases to it.
   */
  private zoomDepth = 0;

  private readonly statusOverlay: StatusOverlay;

  /**
   * This environment's cursor sources — district hovers and the drag — resolved
   * to a single state. The canvas is shared with Earth, which owns a manager of
   * its own; they never overlap because each clears its requests when it goes
   * inactive.
   */
  private readonly cursor: CursorManager;

  private viewport: ViewportSize = { width: 1, height: 1, aspect: 1 };
  /**
   * Where the viewer's navigation target may go.
   *
   * ONE RECTANGLE, and that is the whole of it since the camera-navigation port.
   * It used to be a six-stage pipeline — plate, visual, configured, footprint,
   * station, effective — that derived the navigable area from the camera's own
   * ground footprint every time the pose moved, so that the EYE could be kept
   * inside the authored city (DECISIONS §39) and pushed against a resistance
   * band on the way out (§40). Both are retired: the target is clamped to a
   * rectangle GROWN past the plate, the eye is free, and `checks/footprint.ts`
   * section 3 is what now guarantees the world still surrounds the camera.
   */
  private readonly bounds: BoundsRect;
  /** FPS meter, bounds wireframe and diagnostics. Inert unless debugTools. */
  private readonly debug: MurciaDebugTools;

  private firstFrameRecorded = false;

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
      /**
       * The blog's approach has reached its end: push the route.
       *
       * RETURNS whether it was accepted. `App` refuses while the warp is
       * running or before the city is ready, and a refusal the scene could not
       * see would leave the camera parked against the display under an opaque
       * cover with no blog behind it — see `blogApproach`'s `openBlog`.
       */
      onOpenBlog?: () => boolean;
      /**
       * The approach has started, three seconds before it needs the blog.
       *
       * `App` warms the lazy blog chunk on it, so the route change at the end
       * has nothing left to wait for. No payload, deliberately: nothing under
       * `src/experiences/` may learn what a blog is
       * (`checks/architecture.ts`).
       */
      onBlogApproachStart?: () => void;
      /**
       * Whether this build serves `dist/`, and so whether the blog display can
       * have a screenshot of the built `/blog` rather than its neutral plate.
       *
       * Passed in for the same reason `debugTools` is, and it is NOT that flag:
       * `DEBUG_TOOLS_ENABLED` is true under `vite preview`, which serves a real
       * `dist/` with a real capture in it.
       */
      buildAssetsAvailable?: boolean;
    } = {},
  ) {
    this.container = container;
    this.renderer = renderer;
    this.debugTools = options.debugTools ?? false;
    this.onAttentionChange = options.onAttentionChange;
    this.onOpenBlog = options.onOpenBlog;
    this.onBlogApproachStart = options.onBlogApproachStart;
    this.buildAssetsAvailable = options.buildAssetsAvailable ?? false;
    this.reducedMotion = prefersReducedMotion();
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
    this.cursor = createCursorManager(renderer.domElement);
    // After the query overrides, so a `?bounds=` override reaches the pipeline.
    // The authored rectangle, inset if the config asks for it. `navigation.bounds`
    // is already the grown one — the A2 ring — so this is a no-op at the shipped
    // inset of 0 and exists only so a caller can pull the viewer in further.
    this.bounds = expandRect(
      this.environment.navigation.bounds,
      -this.environment.navigation.boundsInset,
    );
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
    const assetLoader = createAssetLoader(this.renderer);
    this.assetLoader = assetLoader;

    try {
      await this.loadAndSetup(assetLoader);
      this.loadFailed = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[murcia] fatal load error', error);
      this.statusOverlay.setError(
        'No se pudo cargar la ciudad',
        `${message}\nExpected model at: ${this.environment.modelPath}`,
      );
      this.loadFailed = true;
    } finally {
      this.releaseDecoders();
    }
  }

  /**
   * Hands the Draco and Basis worker pools back the moment the city is decoded.
   *
   * They were held for the whole mounted session, which is the trade
   * `graphics/decoders.ts` exists to refuse: it ref-counts precisely so a pool
   * lives no longer than the load that needs it, and every other consumer —
   * `loadLogoAssets`, `createSatellite`, `loadTrimSheet` — already releases in a
   * `finally`. This one held its reference on the EXPERIENCE instead, so once
   * the intro was over one Draco pool and one Basis pool stayed resident for the
   * rest of the visit: four workers each at three's default, with a WASM heap
   * apiece, on exactly the device the reference counting was written for.
   *
   * Safe here and nowhere earlier. `loadCity` awaits the GLB and the trim sheet
   * together (`Promise.all`), the sheet and the lightmaps each acquire and
   * release their own transcoder reference, and nothing in this environment loads an asset after
   * that — the district, the blog building and the river all work on the graph
   * already in memory. A later feature that does load one acquires its own pair
   * rather than reviving this field.
   *
   * Idempotent, because `dispose()` can run before a load or after one.
   */
  private releaseDecoders(): void {
    this.assetLoader?.dispose();
    this.assetLoader = null;
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
   *
   * Both walks visit VISIBLE objects only, so the parts born hidden — the blog's
   * orbit ring, the campus particles — are revealed for the duration of each
   * call. Left out, their programs compiled on the arrival frame instead.
   */
  async warm(): Promise<void> {
    if (!this.sceneBundle || !this.camera) return;
    const scene = this.sceneBundle.scene;
    const camera = this.camera;
    const hiddenAtBirth = [
      ...(this.campus?.precompileTargets ?? []),
      ...(this.blogDisplay?.precompileTargets ?? []),
      ...(this.geotags?.precompileTargets ?? []),
    ];

    // One zero-length tick first, so the campus's strip paints its canvas and
    // the upload lands in the warm render below rather than on the first frame
    // anyone sees it. Nothing else in a zero tick moves.
    this.campus?.update(0);
    await whileRevealed(hiddenAtBirth, () => this.renderer.compileAsync(scene, camera));

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
      whileRevealed(hiddenAtBirth, () => this.renderer.render(scene, camera));
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
   * The cinematic claims the camera under `'warp'` for as long as it is engaged.
   * It used not to: ownership was a single boolean shared with every flight, and
   * taking it would have collided with `setActive(true)` firing at the cut and
   * releasing it. Freezing the springs through `update()`'s ladder was enough to
   * keep the POSE right, but it left the input layer — which asked that same
   * boolean — accepting drags across the second half of an arrival, where they
   * were invisible and surfaced as a lurch the moment the warp let go. Claims
   * are per-name, so `'inactive'` and `'warp'` now overlap without a fight.
   *
   * The warp does NOT touch the targets, so when it hands back the rig resumes
   * from exactly where the viewer parked it.
   */
  setWarpPose(amount: number, departing: boolean): void {
    this.warpAmount = amount;
    this.warpDeparting = departing;
    // The cinematic owns the camera for as long as it is anywhere but rest.
    // `MurciaLayer` pins back with exactly (0, false) when it disengages, and
    // the envelope is 0 at both ends — so amount alone cannot tell the first
    // departing frame from the pin-back, and the direction has to be read too.
    this.warpEngaged = amount > 0 || departing;
    // The cinematic used to own the camera without saying so — it froze the
    // springs through `update()`'s ladder and deliberately left the rig's
    // ownership flag alone, because that flag was a single boolean and
    // `setActive(true)` at the cut would have fought it. A named claim has no
    // such collision: `'inactive'` and `'warp'` are different names and both
    // can be held at once. Saying so is what stops the input layer accepting
    // gestures across the second half of an arrival, where the pose is frozen
    // and a drag would be invisible until the warp let go.
    this.rig?.setClaim('warp', this.warpEngaged);
  }

  /**
   * Where the viewer has zoomed to, -1 (closest) .. +1 (furthest and highest).
   *
   * Persistent: nothing here decays it back, which is the whole of `adr/014`.
   * The application owns the number — one band, shared by both worlds, so the
   * two cannot disagree about how much travel a zoom costs — and this owns what
   * the city does with it (`camera/zoomPose.ts`).
   *
   * `immediate` skips the smoothing, and its one caller is a committed warp. The
   * cinematic owns the pose for its duration and resets the depth at the cut, so
   * a depth still easing across that frame would leave the arriving city pulling
   * back toward a target that was still moving. In practice the two values are
   * already equal there — committing means having sat at the limit long enough
   * to push past it — so this is a guarantee rather than a visible correction.
   */
  setZoomDepth(depth: number, immediate = false): void {
    if (!Number.isFinite(depth)) return;
    this.zoomDepth = depth;
    this.publishZoomTargets(immediate);
  }

  /** The zoom band for the viewport as it is now: rest and far end both resolve by aspect. */
  private zoomBand(): MurciaZoomTargets {
    const aspect = this.viewport.aspect;
    return murciaZoomTargets(
      this.environment,
      resolveCameraPose(this.environment, aspect),
      resolveZoomFar(this.environment, aspect),
    );
  }

  /**
   * Hands the band's depth to the rig as a radius and an elevation.
   *
   * The band resolves a POSE rather than a scale (`adr/014`), which is what lets
   * a district flight's dolly compose with the viewer's zoom by multiplication
   * instead of the two fighting over one number.
   */
  private publishZoomTargets(immediate = false): void {
    if (!this.rig) return;
    const band = this.zoomBand();
    // The rig clamps every zoom target to the tuning's radius range, and that
    // range was derived once, at load, from the pose the viewport had THEN. A
    // phone rotated across `portraitAspectThreshold` has a different band, so
    // the clamp follows it here or the rig would cut the new band short at the
    // old one's ends.
    if (this.cameraTuning) {
      this.cameraTuning.minRadius = band.nearDistance;
      this.cameraTuning.maxRadius = band.farDistance;
    }
    const zoomed = murciaZoomPose(band, this.zoomDepth);
    this.rig.setTargetZoom(Math.log(zoomed.distance), immediate);
    this.rig.setTargetPitch(zoomed.elevationDegrees, immediate);
  }

  /**
   * Writes the cinematic's pose straight to the camera, springs frozen.
   *
   * Only called on a frame where `state.transitionCommitted` holds. The warp is
   * measured FROM the zoomed pose rather than from the configured rest, because
   * a zoom is a position the viewer parked at and a warp is a journey away from
   * wherever they are — otherwise the first frame of a cinematic committed from
   * full zoom-out would move the camera back IN toward the city it is leaving.
   * `murciaConfig.warpDepart*` sits beyond `zoomFar*` along the same arc so the
   * continuation always goes the way the zoom was going.
   *
   * Arriving is unaffected: the depth is reset at the cut, so the pose the city
   * pulls back out to is the configured rest it has always been.
   */
  private applyWarpPose(): void {
    if (!this.rig) return;
    const zoomed = murciaZoomPose(this.zoomBand(), this.zoomDepth);
    const pose = murciaWarpPose(
      {
        restDistance: zoomed.distance,
        restElevation: zoomed.elevationDegrees,
        closeDistance: this.environment.warpCloseDistance,
        departDistance: this.environment.warpDepartDistance,
        departElevation: this.environment.warpDepartElevationDegrees,
      },
      this.warpAmount,
      this.warpDeparting,
    );
    this.rig.applyWarpPose(pose.distance, pose.elevationDegrees);
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
    return this.campus?.isEngaged ?? false;
  }

  /**
   * The viewer is moving about the city on their own: no cinematic or blog
   * approach owns the camera, and no district holds their attention.
   *
   * Read off the rig's claims rather than off the systems that take them, so
   * "the viewer is not navigating" has one answer — the compass and the hint
   * both stand down on it.
   */
  get isNavigating(): boolean {
    const owned =
      (this.rig?.hasClaim('warp') ?? false) || (this.rig?.hasClaim('blog') ?? false);
    return !owned && !this.hasFocusedDistrict;
  }

  /** The logo only returns home from the city, never a building or its flight. */
  get isCityOverview(): boolean {
    return this.active && !this.hasFocusedDistrict && !!this.rig && !this.rig.isOwned;
  }

  /**
   * A horizontal wheel or trackpad swipe, in CSS px, signed like a drag's `dx`.
   *
   * The same yaw a horizontal drag gives, through the same rig call, so the
   * gain, the spring and the bounds are shared rather than restated. Arrives via
   * the application because the wheel is scene navigation's (`adr/009`).
   */
  lookBy(dxPx: number): void {
    // `isOwned`, which now includes the warp. A trackpad swipe arriving across
    // the second half of an arrival used to write yaw the frozen pose could not
    // show, and the camera turned to meet it once the cinematic let go.
    if (!this.rig || this.rig.isOwned) return;
    this.rig.drag(dxPx / Math.max(1, this.viewport.width), 0);
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
    if (!next) this.servicesRequested = false;

    // Frame work was always gated; INPUT was not. Both district interaction and
    // the click probe listen on the SHARED canvas, so while Earth was showing,
    // every click on the globe raycast the hidden city — and a district hit flew
    // Murcia's camera, so you warped into a city that had moved behind your
    // back. Frozen has to mean deaf as well as still.
    this.campus?.setEnabled(next);
    this.blogDisplay?.setEnabled(next);

    // The camera input listens on the SHARED canvas, so while Earth is
    // showing, every Earth drag also reaches it — its targets would drift and
    // the city would jump on return.
    //
    // External control is the answer to "another system owns the rig": the
    // input refuses presses and drops moves while it holds, and the springs are
    // not stepped, so there is nothing stray to discard on the way back.
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
    }

    // Nothing to adopt on the way back in: whatever moved the camera while this
    // was held wrote rig STATE through `setFocus`/`setYaw`, which re-seed the
    // damped value, the target and the velocity together.
    this.applyActiveClaim();
  }

  /**
   * The ONE writer of the `'inactive'` claim, and the reason the bug it fixes
   * cannot come back by the same route.
   *
   * This used to live inline in `setActive` behind two conditions: a
   * `suspendedRig` flag recording whether this object had been the one to take
   * ownership, and an `if (!rig.isExternallyControlled)` that declined to take
   * it when anyone else already had. Both were there to work around a boolean
   * with no reentrancy, and between them they left three holes — the rig came
   * back free if the campus released while Earth was showing, and, worse, the
   * claim was never taken at all on the ordinary path: `active` starts false,
   * `MurciaLayer` calls `setActive(false)` when it is already false, and the
   * early return above fires before any of it runs.
   *
   * Idempotent, and stated rather than tracked. Calling it twice is a no-op,
   * calling it from the rig's construction is how the seeding happens, and the
   * early return in `setActive` can no longer hide anything, because the rig is
   * born holding this claim and only this method lets go of it.
   */
  private applyActiveClaim(): void {
    this.rig?.setClaim('inactive', !this.active);
  }

  private async loadAndSetup(assetLoader: AssetLoader): Promise<void> {
    const env = this.environment;
    this.statusOverlay.setLoading('Cargando la ciudad…', env.modelPath);

    const loaded = await loadCity({
      loader: assetLoader.gltf,
      modelPath: env.modelPath,
      terrainObjectName: env.terrainTransition.terrainObjectName,
      groundObjectName: env.terrainTransition.groundObjectName,
      // The renderer travels with the sheet because a KTX2 set cannot be
      // decoded without asking this GPU which compressed formats it has.
      trimSheet: env.trimSheet,
      lightmaps: env.lightmaps,
      renderer: this.renderer,
      // Applied here rather than after the fact because the collar and the
      // skirt clone the plate's material, and they are built below.
      groundColor: env.sceneState.groundColor,
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

    // The measured plate used to seed the navigable-area pipeline here. The
    // rectangle is authored now — `navigation.bounds`, grown by `boundsInset` —
    // so the mesh's own extent is no longer an input to where the viewer may go.
    // `checks/city-asset.ts` still asserts the GLB carries the plate it was
    // measured from.

    // --- Terrain transition (Phase 6) --------------------------------------
    // Purely visual now. The skirt used to define the extent the navigable
    // bounds were inset from; nothing is inset from it since DECISIONS §44.
    //
    // The skirt wraps the OUTER ground when the model has one, and the plate
    // only when it does not. Both are the same job — dissolve the one hard edge
    // in the model — but which mesh carries that edge changed with the
    // 2026-09-04 city, and wrapping the plate now would fade out the middle.
    const wrapped = loaded.ground ?? loaded.terrain;
    // Does the surface being wrapped reach past the authored city?
    //
    // Two decisions below turn on this, and both used to be spelled
    // `if (loaded.ground)` — which was the same question asked of the node
    // table rather than of the geometry. That stopped working on 2026-09-06,
    // when the export merged the plate and the outer ground into one mesh:
    // `loaded.ground` is null now, and both answers silently flipped to the
    // ones for a world that ends at the plate edge. Measured, it survives an
    // export splitting the two meshes apart again.
    const reach = wrapped ? new THREE.Box3().setFromObject(wrapped) : null;
    const groundPastContent =
      reach !== null &&
      (reach.min.x < env.contentBounds.minX - GROUND_REACH_EPSILON ||
        reach.max.x > env.contentBounds.maxX + GROUND_REACH_EPSILON ||
        reach.min.z < env.contentBounds.minZ - GROUND_REACH_EPSILON ||
        reach.max.z > env.contentBounds.maxZ + GROUND_REACH_EPSILON);

    if (env.terrainTransition.enabled && wrapped) {
      // The river channel is an authored opening that reaches the plate edge on
      // both sides, so the collar has to be told about it or it seals the two
      // river mouths shut. It is a PLATE-perimeter opening: once the skirt has
      // moved out to the outer ground the channel no longer reaches the edge
      // being wrapped, and notching for it there would cut two holes in open
      // countryside.
      const openings = !groundPastContent && loaded.riverBounds ? [loaded.riverBounds] : [];
      const transition = createTerrainTransition(wrapped, env.terrainTransition, { openings });
      this.sceneBundle.scene.add(transition.group);
      this.transition = transition;
      // Nothing about where the viewer may go is decided here any more. This is
      // where the footprint inset used to be switched on or off; the inset went
      // with `NavigableArea` (DECISIONS §44), and the target is now clamped to an
      // authored rectangle. `checks/footprint.ts` is what asserts that the skirt
      // still covers every pose the viewer can reach.
      if (transition.warnings.length > 0) {
        console.warn('[terrain transition]\n- ' + transition.warnings.join('\n- '));
      }
    } else {
      // No skirt means the hard edge is real, and nothing else keeps it out of
      // frame: the target clamp is authored, not derived from the footprint. Say
      // so loudly rather than ship it silently.
      console.error(
        '[murcia] no terrain transition: the plate edge WILL be visible.',
      );
    }


    // --- Camera rig (Phase 5) ----------------------------------------------
    const pose = resolveCameraPose(env, this.viewport.aspect);
    // Created once and held BY REFERENCE by both the rig and the input, so a
    // query-string override applied at construction reaches both.
    this.cameraTuning = createDefaultCameraTuning(
      env,
      pose.distance,
      pose.elevationDegrees,
      this.bounds,
    );
    applyCameraTuningQueryOverrides(this.cameraTuning, window.location.search, this.debugTools);
    const rig = new CameraRig(this.camera, pose, this.cameraTuning);
    rig.setAspect(this.viewport.aspect);
    rig.setFocus(env.initialFocus.x, env.initialFocus.z);
    this.rig = rig;
    // Seeded for the reason the campus and the blog display are seeded below:
    // the city is built during the Earth intro, so `active` is normally still
    // false here and setActive() will not fire again to correct it. The rig was
    // the one consumer that never got this line, and its absence is the whole
    // bug — the camera input listens on the SHARED canvas, so every drag on the
    // globe reached it and piled up unbounded yaw that the springs then chased
    // the moment the viewer arrived.
    //
    // The rig is born holding `'inactive'`, so this line only ever RELEASES,
    // and forgetting it would strand a deaf camera rather than leak input.
    this.applyActiveClaim();
    // And the cinematic's, for the same reason: a warp can be in flight before
    // this rig exists, and the claim has to match the state the object is in
    // rather than the last transition it happened to observe.
    rig.setClaim('warp', this.warpEngaged);

    // Test seam, on the same flag as every other debug tool. Who owns the
    // camera is invisible by construction — an owned rig looks exactly like a
    // still one — so the only way to check the invariant from outside is to ask.
    // `targetYaw` is the number that carried the bug: it must not move by so
    // much as a degree while Earth is showing, however hard the globe is dragged.
    if (this.debugTools) {
      const seams = window as unknown as Record<string, unknown>;
      seams.__vertigoCamera = {
        claims: () => rig.claimList(),
        snapshot: () => rig.snapshot(),
      };
    }

    // --- Bounds -------------------------------------------------------------
    this.recomputeBounds();

    // --- Navigation ---------------------------------------------------------
    this.cameraInput = createCameraInput({
      element: this.renderer.domElement,
      rig,
      width: this.viewport.width,
      height: this.viewport.height,
      events: {
        onDragStateChanged: (dragging) => {
          this.cursor.request('drag', dragging ? 'grabbing' : '');
        },
      },
    });

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

    await this.setupCampus(loaded.root);
    this.setupBlogDisplay(loaded.root);
    this.setupCompass();
    // Before `warm()`, which runs after this method, so the pins compile with the city.
    this.geotags = createCityGeotags({
      root: loaded.root,
      campus: this.campus,
      blog: this.blogDisplay,
      reducedMotion: this.reducedMotion,
    });
    if (this.geotags) this.sceneBundle.scene.add(this.geotags.object3D);
    this.towerLogo = createTowerLogo(loaded.root, VERTIGO_BUILDING, {
      reducedMotion: this.reducedMotion,
    });
    // Placed here for two orderings. AFTER the city's material pass, which
    // dressed the tower in the trim sheet like every other building — the
    // palette replaces that on the tower's parts. And BEFORE `warm()`, which
    // runs after this method: the screen's shader and the palette's materials
    // exist synchronously, so they compile with the rest of the city instead of
    // on the first frame they are drawn. Not awaited: the slides' pictures are
    // tens of KB, and the screen draws a complete frame without them.
    this.towerScreen = attachTowerScreen(loaded.root, {
      // The CMS's slides on the template. Generated content is imported at
      // this level, like `DISTRICT_CONTENT`, so `towerScreen/` itself stays
      // feedable by the lab and the tests.
      document: layoutTowerSlides(TOWER_SCREEN_CONTENT),
      // The trim sheet's 4 (`loadCity.ts`, `TRIM_ANISOTROPY`): the screen is
      // seen at a grazing angle from the resting pose, like the sign before it.
      anisotropy: 4,
      reducedMotion: this.reducedMotion,
      screenNodeName: VERTIGO_BUILDING.screenNodeName,
      screenUvChannel: VERTIGO_BUILDING.screenUvChannel,
    });
    this.setupClickInteraction();
    this.statusOverlay.hide();
  }

  /**
   * The blog's entry point: a display floating above the `edificio-blog`
   * cluster, and the flight that clicking it starts (plan 022).
   *
   * Deliberately NOT part of the services section. There is no section state
   * and no service meaning; folding it in would teach the campus that a blog
   * exists. What it shares with the campus is a camera flight that writes the
   * camera directly — which is why it takes the rig and hands it back through
   * `adoptFromCamera`, and why `update()` branches on `ownsCamera`.
   *
   * Absent from the city is survivable and loud: the cluster is scenery that has
   * been in the GLB since it was the district stand-in, and
   * `check:asset:contract` fails the build if a re-export removes it.
   */
  private setupBlogDisplay(root: THREE.Object3D): void {
    if (this.onOpenBlog === undefined) return;
    const onOpenBlog = this.onOpenBlog;
    const onApproachStart = this.onBlogApproachStart;
    const rig = this.rig;
    if (!rig) return;

    this.blogDisplay = createBlogDisplayEntry({
      root,
      camera: this.camera,
      canvas: this.renderer.domElement,
      cursor: this.cursor,
      viewport: { width: this.viewport.width, height: this.viewport.height },
      // The live pose, never a copy of `murciaConfig`'s literal: that azimuth
      // has moved twice already, and a restatement here would silently turn the
      // panel away from the visitor the third time.
      restingYawDegrees: rig.getPose().azimuthDegrees,
      buildAssetsAvailable: this.buildAssetsAvailable,
      tapThresholdPx: {
        mouse: this.environment.navigation.dragThresholdPx,
        touch: this.environment.navigation.touchDragThresholdPx,
      },
      // A district panel or a flight owns attention; a press that reaches the
      // panel behind one of those is not a request to leave for the blog.
      blocked: () => this.hasFocusedDistrict,
      beginExternalControl: () => {
        this.rig?.claim('blog');
        // AND the campus goes deaf, which is not belt-and-braces. An entry
        // during the three-second approach would start the campus's flight
        // beside it — two owners writing the camera in one frame, which §9
        // forbids and which no ordering here could fix. "Frozen has to mean
        // deaf as well as still" is the same rule `setActive` applies for Earth.
        this.campus?.setEnabled(false);
        this.onAttentionChange?.();
      },
      endExternalControl: () => {
        // The approach flew the camera OFF the rig entirely, writing
        // `camera.position` and `camera.quaternion` directly, so the rig has no
        // idea where it is. Solve the pose back out before letting the springs
        // run again, or the first frame of navigation snaps.
        this.rig?.adoptFromCamera();
        this.rig?.release('blog');
        // Back to whatever the scene's own activity says, never a bare `true`:
        // the return can settle while Earth is showing.
        this.campus?.setEnabled(this.active);
        this.onAttentionChange?.();
      },
      openBlog: onOpenBlog,
      onApproachStart: () => onApproachStart?.(),
    });

    if (this.blogDisplay) this.sceneBundle.scene.add(this.blogDisplay.object3D);
    // Seeded for the same reason the campus is: the city is built during
    // the Earth intro, so `active` is normally still false here and setActive()
    // will not fire again to correct it.
    this.blogDisplay?.setEnabled(this.active);

    // Test seam, on the same flag as every other debug tool. The e2e round trip
    // must click this panel, and where it is on screen depends on the camera
    // pose and the GLB — not on anything a spec could hardcode without becoming
    // a test of the city's layout instead of the blog's behaviour.
    if (this.debugTools && this.blogDisplay) {
      const entry = this.blogDisplay;
      (window as unknown as Record<string, unknown>).__vertigoBlogDisplayPoint = () =>
        entry.screenPoint();
    }
  }

  /**
   * Flies back out of the display to where the visitor was standing when they
   * clicked it. A no-op for anyone who reached the blog another way.
   *
   * Called by `App` for EVERY warm route back to the scene, not only the blog's
   * own control: the browser's Back button and a step back through an article
   * are the same event as far as the city is concerned.
   */
  releaseFromBlog(): void {
    this.blogDisplay?.beginReturn();
  }

  /**
   * Lowers the cover the approach raised, now that the blog has painted under
   * it.
   *
   * `App` owns this call because `App` is what knows the blog is on screen —
   * and because by then `frameloop` is `never`, so nothing inside this class
   * will be asked for another frame in which to notice.
   */
  dismissBlogCover(): void {
    this.blogDisplay?.dismissCover();
  }

  /**
   * The compass, over whichever of the two places actually loaded.
   *
   * Built from what is in the scene rather than from a list: a city exported
   * without the blog cluster already logs an error and returns no building, and
   * a compass pointing at a place that is not there would be the second failure.
   */
  private setupCompass(): void {
    const pois: CompassPoi[] = [];

    const campus = this.campus;
    if (campus) {
      const content = findDistrictContent(DISTRICT_CONTENT, cityDistrictBindings[0].contentId);
      pois.push({
        id: 'servicios',
        anchor: (out: THREE.Vector3) => campus.anchor(out),
        // The name comes from the CMS, like every other district string.
        label: content?.label ?? 'Servicios',
      });
    }

    const blog = this.blogDisplay;
    if (blog) {
      pois.push({
        id: 'blog',
        anchor: (out: THREE.Vector3) => blog.anchor(out),
        label: 'Blog',
      });
    }

    if (pois.length === 0) return;
    this.compass = new CompassBar(this.container, pois);
  }

  /**
   * The services section, assembled on the campus the city carries.
   *
   * Replaces the display district (plan 024). Built during the Earth intro,
   * like everything in `load`, and awaited because the symbols are rasterised
   * once, here; it is the only asynchronous step, and it is small. A campus
   * that cannot be assembled has already said why and stays scenery — its
   * colours were put on in `loadCity` and do not depend on this.
   *
   * Before `warm()` for the tower's reason: the water, strip and particle
   * shaders compile with the rest of the city rather than on first sight.
   */
  private async setupCampus(root: THREE.Object3D): Promise<void> {
    const rig = this.rig;
    if (!rig) return;
    const binding = cityDistrictBindings[0];
    const content = binding ? findDistrictContent(DISTRICT_CONTENT, binding.contentId) : null;
    if (!binding || !content) {
      console.error(`[campus] no content for binding "${binding?.contentId}".`);
      return;
    }

    this.campus = await createServicesCampus({
      root,
      camera: this.camera,
      canvas: this.renderer.domElement,
      container: this.container,
      content,
      rig,
      viewportHeightPx: this.viewport.height * this.renderer.getPixelRatio(),
      reducedMotion: this.reducedMotion,
      // The trim sheet's 4, like the tower's screen: the strip is seen at a
      // grazing angle from the resting pose.
      anisotropy: 4,
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
      onCameraReturned: () => {
        this.applyDeferredPose();
        this.onAttentionChange?.();
      },
      onEngagedChange: this.onAttentionChange,
      cursor: this.cursor,
      isDragging: () => this.cameraInput?.isDragging ?? false,
      tapThresholdPx: {
        mouse: this.environment.navigation.dragThresholdPx,
        touch: this.environment.navigation.touchDragThresholdPx,
      },
    });
    // Seeded, not assumed: built during the Earth intro, so `active` is normally
    // false here and setActive() will not fire again to correct it.
    this.campus?.setEnabled(this.active);

    const campus = this.campus;
    if (this.debugTools && campus) {
      const seams = window as unknown as Record<string, unknown>;
      // The names the e2e specs already use: the point to tap is the lake now,
      // and "settled" is the campus's own flight being over.
      seams.__vertigoDistrictPoint = () => campus.screenPoint();
      seams.__vertigoDistrictSettled = () => !campus.isFlying;
      // The section's intents, for driving it from a console or a probe
      // without aiming a pointer at the lake.
      seams.__vertigoCampus = {
        enter: () => campus.enter(),
        next: () => campus.next(),
        previous: () => campus.previous(),
        back: () => campus.back(),
        exit: () => campus.releaseFocus(),
        snapshot: () => campus.snapshot,
      };
    }
  }

  /**
   * Releases whichever district is holding the viewer. A no-op when none is.
   *
   * Called by the scene navigation when a pinch toward the way out arrives while
   * `hasFocusedDistrict` is true — the touch-native exit that does not depend on
   * hitting the overlay's close. `onAttentionChange` fires through the campus's
   * own engaged edge, as it does for every other exit.
   */
  releaseFocusedDistrict(): void {
    this.campus?.releaseFocus();
  }

  /**
   * The header's Blog button, while the city is showing: the same approach a
   * press on the panel starts. False when it could not — no blog in the city,
   * not in the overview (a district or a flight has the camera), or already
   * flying — and the caller then opens the blog without the flight.
   */
  flyToBlog(): boolean {
    if (!this.isCityOverview || !this.blogDisplay) return false;
    return this.blogDisplay.open();
  }

  /**
   * The header's Servicios button: fly into the campus as soon as the camera is
   * free.
   *
   * A REQUEST, consumed in `update()`, because the button can be pressed on
   * Earth: the arrival's warp still holds the rig for the length of its
   * pin-back after the scene becomes active, and `campus.enter()` refuses a held
   * rig. It waits out the warp and nothing else — if the blog or the campus
   * itself has the camera when the warp lets go, the request is dropped rather
   * than acted on later, when the viewer has moved on. Leaving the city drops it
   * too, so no later arrival opens the campus by surprise.
   */
  requestServices(): void {
    if (this.campus) this.servicesRequested = true;
  }

  // --- Viewport and bounds --------------------------------------------------

  /**
   * Called by the R3F layer whenever the canvas size changes.
   *
   * Replaces the standalone ResizeObserver: R3F already measures the canvas and
   * owns renderer.setSize, so only the projection and the pose work that
   * depends on aspect remain here.
   */
  setViewport(size: ViewportSize): void {
    this.viewport = size;
    if (!this.camera) return;

    this.camera.aspect = size.aspect;
    this.camera.updateProjectionMatrix();

    // The panel takes the VIEWPORT's shape, because its readable core has to be
    // able to become the viewport exactly. Handed the CSS size rather than the
    // aspect, because the page image behind it is laid out in CSS pixels.
    //
    // It may queue this rather than apply it: while the blog is open the frame
    // loop is stopped, and rebuilding a geometry and uploading a texture into a
    // window nothing renders would move counts `e2e/blog.spec.ts` pins. See
    // `blogApproach.setViewport`.
    this.blogDisplay?.setViewport(size.width, size.height);
    // The particles attenuate by the drawing buffer's height, not the CSS one.
    this.campus?.resize(size.height * this.renderer.getPixelRatio());

    if (this.rig) {
      // Re-resolving the pose covers the portrait-override case; it is a few
      // trig calls and a projection-matrix update, so it is not worth guarding.
      this.rig.setAspect(size.aspect);
      // Safe to write directly now. `setPose` carries fov, near, far, azimuth
      // and lookAtHeight only — distance and elevation are spring state — so a
      // resize mid-zoom or mid-warp can no longer snap the pose back to rest.
      // The targets are re-derived because a portrait override moves the REST
      // the band is measured from.
      //
      // Unless the campus holds the camera: `setPose` places the camera, and
      // the campus is flying it. The pose waits for the hand-back.
      const pose = resolveCameraPose(this.environment, size.aspect);
      if (this.campus?.holdsCamera) this.deferredPose = pose;
      else this.rig.setPose(pose);
      this.publishZoomTargets();
      this.cameraInput?.setViewport(size.width, size.height);
      if (this.debug.hasBoundsHelper) {
        this.debug.rebuildBoundsHelper(
          this.sceneBundle.scene,
          this.bounds,
          this.environment.navigation.groundPlaneHeight,
        );
      }
    }
  }

  /**
   * Hands the rig its rectangle.
   *
   * A single assignment now. It used to re-derive the navigable area from the
   * camera's ground footprint on every yaw, zoom and resize, because the
   * rectangle depended on the pose; it does not any more, so this is called once
   * at load and left alone. Kept as a method rather than inlined because the
   * rectangle is still allowed to move — a query override can scale it.
   */
  private recomputeBounds(): void {
    this.rig?.setBounds(this.bounds);
  }

  /**
   * Lands a pose a resize resolved while the campus held the camera.
   *
   * Called by the campus hand-over AFTER the rig has adopted the camera: the
   * adopt reads the camera the campus left, and `setPose` then moves it to the
   * pose the viewport now needs — in that order, or the adopt would read a pose
   * nobody chose.
   */
  private applyDeferredPose(): void {
    const pose = this.deferredPose;
    this.deferredPose = null;
    if (pose) this.rig?.setPose(pose);
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
    if (this.cameraInput?.isDragging) return;

    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    clientToNdc(rect, event.clientX, event.clientY, this.ndc);
    this.interactionProbe?.probe(this.ndc);
  };

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

    // Exactly one system writes to the rig per frame — the owner switch below
    // enforces it. The campus ticks first, because its flight is what decides
    // who owns the camera this frame; it also runs its water, strip and
    // particles on the same delta.
    this.campus?.update(delta);

    // The blog's flight is a camera owner in its own right, so it is asked
    // before the two that would otherwise write: it takes the camera DIRECTLY
    // rather than through the rig, because its end pose has to equal the panel's
    // own quaternion at a solved distance and the rig fixes elevation.
    this.blogDisplay?.update(delta);

    // ONE OWNER PER FRAME (§9), and this switch is the enforcement.
    //
    // Four things can move this camera and exactly one of them writes per frame.
    // Not "write last and win": the springs INTEGRATE state, so letting them run
    // and then overwriting the result would leave them chasing a camera they do
    // not control and hand back a wrong pose the moment the other owner ends.
    // They do not run at all.
    //
    // The order is a precedence, and each rung earns its place:
    //
    //   1. the blog approach, which flew the camera off the rig entirely
    //   2. the cinematic, which writes the pose directly with springs frozen
    //   3. the campus, which has already written the camera this frame
    //   4. nobody — the springs run and write the pose
    //
    // PRECEDENCE LIVES HERE, and membership lives on the rig. The rig holds a
    // set of claims and attaches no order to the names in it; this ladder is
    // the only thing that says a blog approach outranks a warp. That split is
    // what lets the input layer ask one question — "is anyone holding it?" —
    // without learning the city's vocabulary, and it is why the two can no
    // longer disagree about who is driving. They used to: this ladder read four
    // separate booleans and the input read one of them.
    //
    // A spring that is not stepped keeps its velocity, and that is the point:
    // it is what makes handing control away and taking it back seamless rather
    // than a snap. The flight re-seeds value, target AND velocity through
    // `setFocus`/`setYaw`, which is why there is nothing left to "adopt".
    if (this.rig?.hasClaim('blog')) {
      // Nothing. It wrote camera.position and camera.quaternion itself.
    } else if (this.rig?.hasClaim('warp')) {
      this.applyWarpPose();
    } else if (this.rig?.hasClaim('campus')) {
      // The campus's flight already wrote the camera this frame, in its own
      // update — directly, like the blog's, and `adoptFromCamera` hands it back.
    } else if (this.rig?.isOwned) {
      // Held under a name this ladder does not place. Unreachable while the
      // four claims are the only four, and it is here so that adding a fifth
      // fails by freezing the camera rather than by silently stepping springs
      // underneath whoever is flying it.
    } else {
      this.rig?.update(delta);
    }

    // The Servicios button. After the ladder, so the flight it starts is picked
    // up by the campus's own update at the top of the next frame. It waits only
    // while the arrival's warp holds the rig; see `requestServices`.
    if (this.servicesRequested && !this.rig?.hasClaim('warp')) {
      this.servicesRequested = false;
      if (this.rig && !this.rig.isOwned) this.campus?.enter();
    }

    // THE COMPASS RUNS LAST, after whichever owner wrote the pose.
    //
    // It measures a bearing from the camera's own forward vector, so a frame
    // stale by one pose lags the city it is pointing into — visible as the marks
    // trailing the world during a turn, which is the one artefact an instrument
    // like this cannot have.
    //
    // Hidden while a cinematic or the blog approach owns the camera: the
    // bearings stay true and stop meaning anything, because the viewer is not
    // navigating. It sits below the flash in z-order, so the cut covers it.
    if (this.compass) {
      this.compass.setVisible(this.isNavigating);
      this.compass.update(this.camera);
    }
    // Last for the compass's reason: they face and fade on this frame's pose.
    // Shown on the same answer, so they are gone whenever the compass is.
    if (this.geotags) {
      this.geotags.setVisible(this.isNavigating);
      this.geotags.update(delta, this.camera);
    }

    // One uniform write. `water.update` wants elapsed seconds, not the delta —
    // passing `delta` straight through pins uTime at about 1/60 and the river
    // renders as a still photograph of plausible water.
    if (this.loaded?.water) {
      this.waterTime += delta;
      this.loaded.water.update(this.waterTime);
    }

    // The tower's logo turns on the same delta. A quaternion write per node, no
    // allocation — see createTowerLogo for why there is no loop of its own.
    this.towerLogo?.update(delta);
    // And its screen: the carousel's clock and the facade's crossfade, shimmer
    // and dust. A repaint happens only when a slide changes or its entrance
    // moves, so a settled slide costs one draw call.
    this.towerScreen?.update(delta);

    if (!this.firstFrameRecorded && this.loaded) {
      this.loaded.timings.firstRenderedFrameTime = performance.now();
      this.firstFrameRecorded = true;
    }

    const overlayBounds = this.bounds;
    if (this.debugOverlay && this.rig && this.loaded) {
      this.debugOverlay.update(delta, now, {
        renderer: this.renderer,
        focus: this.rig.focus,
        cameraHeight: this.rig.getHeight(),
        // Effective, so the readout follows the user's zoom. Reporting the
        // configured 165 while the camera sits at 198 makes the overlay
        // useless for exactly the verification zoom needs.
        cameraDistance: this.rig.getEffectivePose().distance,
        // Configured, for the copyable POSE line only — see OverlayInputs.
        configuredDistance: this.rig.getPose().distance,
        elevationDegrees: this.rig.getPose().elevationDegrees,
        // The lens and the aim point, so the overlay can report the EFFECTIVE
        // pitch. That, not the elevation, is what decides whether the frustum
        // passes the horizon — and it is the number `?elev=` and `?lookAt=` are
        // really being tuned against.
        fov: this.rig.getEffectivePose().fov,
        lookAtHeight: this.rig.getPose().lookAtHeight,
        azimuthDegrees: this.rig.getAzimuthDegrees(),
        insideBounds: containsPoint(
          this.rig.focus.x,
          this.rig.focus.z,
          expandRect(overlayBounds, 1e-3),
        ),
        bounds: overlayBounds,
        timings: this.loaded.timings,
      });
    }

    this.debug.frameEnd();
  }

  dispose(): void {
    this.blogDisplay?.dispose();
    this.blogDisplay = null;
    // The logo owns no resource, only a reference into the city that
    // disposeLoadedCity below takes down. The screen does: its canvases and
    // canvas textures are unreachable from the scene graph, so they are
    // released here. Its palette materials hang on the tower's meshes and go
    // with the city.
    this.towerLogo = null;
    this.towerScreen?.dispose();
    this.towerScreen = null;
    this.active = false;

    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUpForClick);

    // Hands the water's and the strip's own materials back to the meshes they
    // borrowed, so disposeLoadedCity below frees what the city made; frees its
    // particles, shaders, canvases and copy here.
    this.campus?.dispose();
    this.campus = null;

    this.compass?.dispose();
    this.compass = null;
    this.geotags?.dispose();
    this.geotags = null;
    this.cameraInput?.dispose();
    this.cameraInput = null;
    this.cameraTuning = null;

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
    // Normally released by `load` already. Here for the environment that was
    // constructed and disposed without ever loading.
    this.releaseDecoders();

    this.statusOverlay.dispose();
    this.debug.dispose(this.sceneBundle?.scene ?? null);

    // The renderer and its canvas belong to the application, not to this
    // environment. Disposing them here would take Earth down with it.
  }
}
