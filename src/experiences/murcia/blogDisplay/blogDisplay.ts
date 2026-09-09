import * as THREE from 'three';
import { createDisplayShell, type DisplayShellDimensions } from './displayShell';
import displayFragmentShader from './shaders/display/fragment.glsl';
import displayVertexShader from './shaders/display/vertex.glsl';

/**
 * The blog's display: a shader-drawn face on an extruded plate, wearing the blog
 * page.
 *
 * Ported from `vertigo-lab`'s `blog-transition` experiment (plan 022), which had in
 * turn cut it out of `services-buildings/servicesDisplay.ts` — the same ancestor
 * this repo's `district/display/servicesDisplay.ts` came from on 2026-08-31 (§34).
 *
 * ## It is a COPY of that display, and that is the decision rather than an accident
 *
 * The two share an ancestor and roughly a third of their shape, and they are not
 * merged. The services display is a user interface: a text layout, a stroked glyph
 * atlas, control rects, hover and press state, a scrollbar, reading-viewport folds,
 * two content modes and a cross-fade between them. None of that exists here,
 * because this face has exactly one job — show one texture — and the whole point of
 * the transition is that the texture is a rendering of a real page rather than a
 * second renderer's opinion of one.
 *
 * A shared abstraction over those two would be a base class whose only common
 * member is "a rounded plate with a texture on it", parameterised by everything
 * that actually differs. It would also mean the services district could not be
 * changed without moving this, and §34 has an open restyle owed to it (plan 020).
 *
 * ## The plane is not square, and it must not be
 *
 * `servicesDisplay` is 48 x 48 and says so: its shader maps a text viewport onto
 * the core, so the panel's ratio must equal the viewport's. The invariant here is
 * the same one and the value is different — the readable core has to be able to
 * become the BROWSER viewport exactly, so `setAspect` takes the window's shape and
 * the page image is laid out for the same one.
 *
 * `display.frag` needed no change for it: `uAspect` normalises the SDF to the
 * plane's height, so the corner radius, both falloffs and the plate's dimensions
 * were always aspect-correct.
 *
 * ## What is still here, and why
 *
 * The plate, the halo, the corner SDF and the optical layer all stay. They sit
 * OUTSIDE the readable core, so they leave the frame before the swap and cost the
 * seam nothing — and they are what make the thing an object rather than a
 * full-screen image with a slow zoom. The one term that does reach inside the core
 * — the additive gloss — is ramped to zero by `setScreenPresence` across the
 * approach.
 */

/**
 * How far the plate overshoots the readable core on every side, in world units.
 *
 * NOT decoration, and it has a hard lower bound: the panel's alpha ramps to zero
 * over `uEdgeFalloff` measured OUTWARD from the core's edge, so if the plate
 * stopped at the core the face's soft fringe would hang outside the plate's hard
 * silhouette and the object would read with two edges a fraction apart. This must
 * stay greater than `uEdgeFalloff * panelHeight` — 0.25 world units at the current
 * defaults — so the fringe dies on top of the plate, dark on dark, and the only
 * edge anyone can see is the geometric one.
 *
 * Halved with `PANEL_HEIGHT` on 2026-09-09. It is in world units, so holding it while
 * the panel shrank would have doubled the plate's margin relative to the face it
 * carries — what has to stay proportional is the margin, not the number.
 */
const SHELL_BLEED = 0.45;

/**
 * Plate thickness in world units.
 *
 * About 2.8% of the plate's short side. It was tuned against the district camera —
 * 81 units out through a 50-degree fov, where one world unit is roughly 10.6 screen
 * pixels and the rim is seen at 34 degrees off the face's normal, so this projects
 * to about 4 pixels of visible edge. Below ~0.3 the rim starts to alias at that
 * distance; much above 1 and a thin premium plate turns into masonry.
 *
 * Murcia's resting camera is further out and through a different lens than either
 * of the two that number was tuned at, so the rim's APPARENT size here is a thing
 * to look at rather than a thing inherited. During the approach it grows and then
 * leaves the frame entirely, which is the one moment its thickness stops mattering.
 *
 * Halved with `PANEL_HEIGHT` on 2026-09-09, for `SHELL_BLEED`'s reason: a world-unit
 * rim on a half-size plate reads as twice as chunky. That lands it ON the aliasing
 * floor above rather than inside it, and from a camera further out again — so this is
 * the one number in that change that is a judgement by eye. If the rim shimmers or
 * disappears at rest, raise it toward 0.4 and accept that it is then deliberately not
 * proportional.
 */
const SHELL_THICKNESS = 0.3;

/**
 * The panel's HEIGHT in world units. The width follows the viewport.
 *
 * Height rather than width, because height is what the ELEVATION is derived against
 * — the panel's vertical half-extent under its tilt is what decides how far above
 * the cluster it has to float to read as floating. Driving the width from the
 * aspect instead leaves that derivation intact on every viewport shape, where
 * driving the height from it would move the panel's clearance every time someone
 * resized a window.
 *
 * 24, halved from 48 on 2026-09-09, and now deliberately HALF `servicesDisplay`'s
 * `PANEL_HEIGHT` rather than equal to it. Equal heights did not mean equal size: the
 * services panel is square, while this one wears a browser viewport and is
 * `24 * aspect` wide — at 48 and a 16:9 window it spanned 85 world units, which read
 * as a billboard over the city rather than as a screen standing in it. The two
 * displays still match in tilt, in follow and in material; they do not match in
 * height, because matching there is what made them look like different objects.
 *
 * `SHELL_BLEED` and `SHELL_THICKNESS` were halved with it — they are world units and
 * do not follow on their own. `coreInset` and `cornerRadius` are ratios and did not
 * move.
 */
const PANEL_HEIGHT = 24;

/** Seconds for the display to fade in on load. */
const ACTIVATION_DURATION = 0.9;

/**
 * The face's palette.
 *
 * Three, where `servicesDisplay.ts`'s `DISPLAY_COLORS` has five: `text` and
 * `control` went with the copy and the controls, because the page brings its own
 * colour in every pixel and nothing on this face tints a mask any more.
 *
 * The three that remain are the same values that display uses, and they are tuned
 * against `toneMapped: false` rather than merely carried over from a material that
 * had ACES applied — see the flag's docblock below.
 */
export const BLOG_DISPLAY_COLORS = {
  /** The screen itself, behind the page. Near-neutral, a hair cool, never pure black. */
  core: 0x0a0c0f,
  /** The fringe just outside the core. Neutral graphite, not atmosphere. */
  halo: 0x272b30,
  /** The fake reflection's tint. Cool near-white, as a room's light would be. */
  gloss: 0xaeb8c2,
} as const;

export interface BlogDisplayOptions {
  /** Where the panel hangs, in x and z. Its own y is `groundY + elevation`. */
  centre: THREE.Vector3;
  /** What "above" is measured from. Here: the top of the tower, not the plate. */
  groundY: number;
  /**
   * How high above `groundY` the panel's CENTRE floats.
   *
   * An option rather than a constant in here, because it is COUPLED to the tilt
   * and to the resting yaw: the panel's vertical half-extent under a lean swings
   * its bottom edge toward the camera, so the clearance that reads as floating
   * depends on the angle it is seen from. Keeping the three together at the call
   * site is what makes them tunable as the one decision they are.
   *
   * `servicesDisplay` reaches the same conclusion from the other end and pays for
   * it: its `PANEL_ELEVATION` is a constant in `displayConfig.ts`, and §34 records
   * it and `focusDistanceScale` as "a tuning pair that arithmetic cannot settle".
   */
  elevation: number;
  /** Width divided by height. The panel takes the viewport's shape. */
  aspect: number;
  /**
   * The panel's fixed lean, about its own X axis. Yaw follows the camera; this
   * never does — a full billboard is what plan 002 explicitly refuses, and §34
   * carries that forward for the services display.
   */
  tiltDegrees: number;
  /**
   * The resting yaw the follow is clamped around, in degrees.
   *
   * An option for the same reason `createServicesDisplay` takes one: the heading
   * a display rests at is scene composition, and `cityDistrictBindings.ts` is
   * where this application keeps that decision — not a literal buried in a
   * geometry module.
   */
  baseYawDegrees: number;
}

/**
 * The yaw follow's feel. INTERNAL, and shaped exactly like `servicesDisplay`'s
 * `FOLLOW`: tuning it means editing the literal below.
 */
interface FollowSettings {
  maxYawOffset: number;
  damping: number;
  deadZone: number;
  speedCap: number;
  baseYaw: number;
}

export interface BlogDisplay {
  readonly object: THREE.Object3D;
  /** The panel mesh — the pointer's only raycast target. */
  readonly panel: THREE.Mesh;
  /**
   * Public because `panelPointer` reads `uCoreInset` off it rather than restating
   * the number — one inset, not two. Nothing else has business here.
   */
  readonly panelMaterial: THREE.ShaderMaterial;
  /** Hands the face the rasterised page. Disposes the texture it replaces. */
  setPage(canvas: HTMLCanvasElement): void;
  /**
   * How much of a SCREEN this is: 1 at rest, 0 at the handoff.
   *
   * Scales the one term that reaches inside the readable core: the additive gloss.
   * An HTML page has no such thing, so it has to be gone before the panel becomes
   * one. Everything else that makes this an object
   * lives outside the core and needs no fading, because it leaves the frame.
   */
  setScreenPresence(presence: number): void;
  /**
   * Skips the arrival ramp and declares the panel already switched on.
   *
   * `activation` normally walks 0 -> 1 over ACTIVATION_DURATION so the display
   * fades up when the scene opens. A RETURN from /blog has the opposite need: the
   * camera starts at the panel, filling the frame with it, and a panel that faded
   * in from nothing there would be a 0.9 s dissolve at exactly the moment the
   * visitor is supposed to be looking at a page that was already there.
   *
   * A setter rather than a constructor option because the return decides this
   * AFTER the display exists — the token is read in `init`, and by then the
   * display has been built to frame the scene.
   */
  setActivation(value: number): void;
  /**
   * Locks the yaw follow for the length of a flight.
   *
   * A panel that keeps turning is a panel the camera is chasing rather than one it
   * is arriving at: the approach ends square to the face, and the face moving while
   * that is being solved is exactly where the seam would open.
   */
  freezeFollow(frozen: boolean): void;
  update(dt: number, camera: THREE.Camera): void;
  /** Width follows the aspect; the height is fixed. See `PANEL_HEIGHT`. */
  setAspect(aspect: number): void;
  /** The panel's centre in world space. What the camera frames on. */
  anchor(): THREE.Vector3;
  /**
   * The panel's world orientation.
   *
   * The camera's END rotation for the approach IS this quaternion: a camera looks
   * down its own -Z, the panel's +Z is its face normal, so a camera whose rotation
   * equals the panel's is exactly square-on to it. That identity is why the approach
   * needs no `lookAt` and has no up-vector edge case.
   */
  panelQuaternion(): THREE.Quaternion;
  /** World height of the READABLE CORE. What the fill distance is solved from. */
  coreHeight(): number;
  dispose(): void;
}

export function createBlogDisplay(options: BlogDisplayOptions): BlogDisplay {
  const { centre, groundY } = options;

  const panelHeight = PANEL_HEIGHT;
  let panelWidth = PANEL_HEIGHT * options.aspect;
  /**
   * Visible field as a fraction of the plane.
   *
   * 0.84. The readable core is `plane x inset`, so this and the plane's size move
   * together — raising one alone makes the display bigger rather than the field
   * wider. The margin it leaves holds an antialiased edge and a narrow bloom; the
   * silhouette itself is carried by the plate's geometry.
   */
  const coreInset = 0.84;
  /**
   * Face and plate share this. In `panelHeight` units, as the SDF works in — which
   * means its WORLD size scales with the panel.
   */
  const cornerRadius = 0.021;
  const shellThickness = SHELL_THICKNESS;
  const shellBleed = SHELL_BLEED;

  // Outer group owns POSITION and YAW; the panel inside owns the fixed tilt.
  // Splitting them keeps 45 degrees at 45 degrees while the yaw animates.
  const root = new THREE.Group();
  root.position.set(centre.x, groundY + options.elevation, centre.z);

  /**
   * A 1x1 transparent placeholder, so the material is complete before the page has
   * been rasterised.
   *
   * `init()` is synchronous and the raster is not, so there is a window — usually a
   * frame or two — in which the face exists and the page does not. A null sampler in
   * that window is undefined behaviour in WebGL and reads as black or as garbage
   * depending on the driver; one transparent texel is defined, costs nothing, and
   * shows the panel's own core colour until the page lands.
   */
  const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  placeholder.needsUpdate = true;

  let pageTexture: THREE.Texture = placeholder;

  const panelMaterial = new THREE.ShaderMaterial({
    vertexShader: displayVertexShader,
    fragmentShader: displayFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    /**
     * THE ONE DELIBERATE EXCEPTION TO PLAN 001 AMENDMENT A3, and it is here in
     * TypeScript rather than as a deleted `#include` so that it is greppable.
     *
     * A3 requires a raw `ShaderMaterial` to end with `<tonemapping_fragment>` and
     * `<colorspace_fragment>`, because the renderer applies neither on its own and
     * the failure is silent. `display.frag` still has both. This flag is what stops
     * the first one doing anything, and the reason is that this material's reference
     * is not the scene — it is a DOM document it is about to be replaced by.
     *
     * The measurement. Three 0.174.0 uses the full-matrix ACES, not the Narkowicz
     * curve: `ACESInputMat`, `RRTAndODTFit`, `ACESOutputMat`, and a `/0.6` exposure
     * prescale. Through it, `#ffffff` leaves as byte 226 and the error CHANGES SIGN
     * at mid-grey (`#808080` leaves as 141). A paper-white page does not merely dim
     * on the panel, it S-curves: `#f5f5f5` and `#e0e0e0` converge from 21 levels
     * apart to 7. With tone mapping off and the colour-space chunk kept, the round
     * trip is byte-exact for all 256 values.
     *
     * The alternative — pre-applying the inverse ACES to the page term — was costed
     * and rejected. It is analytically possible (both matrices invert, the fit is a
     * quadratic solve) and practically dead: white needs a pre-tone-mapping value of
     * 15.4, saturated colours need negative channels, the top ten authored levels
     * need a 6x spread in pre-value, and the raster's glyph edges are blended BEFORE
     * any inverse could be applied, so text would come out with the wrong weight.
     *
     * `WebGLPrograms.js` gates tone mapping on `material.toneMapped` alone, with no
     * material-type test, so this is honoured for a non-raw `ShaderMaterial`:
     * `#define TONE_MAPPING` is not emitted and the include compiles to nothing.
     *
     * IT APPLIES TO THE WHOLE MATERIAL. `uCoreColor`, `uHaloColor` and `uGlossColor`
     * were tuned by eye against ACES and are now shown as authored — they were
     * retuned with this flag, not merely carried over.
     */
    toneMapped: false,
    uniforms: {
      uActivation: { value: 0 },
      uAspect: { value: panelWidth / panelHeight },
      uCoreInset: { value: coreInset },
      uCornerRadius: { value: cornerRadius },
      // An antialiasing width, not a dissolve. The plate behind carries the
      // silhouette, so the face's job at its edge is to stop cleanly.
      //
      // In `panelHeight` units, so it followed the panel down: 0.0104 x 24 = 0.25
      // world units, comfortably inside `SHELL_BLEED` (0.45). Exceed that and the
      // fringe escapes the plate.
      uEdgeFalloff: { value: 0.0104 },
      uCoreOpacity: { value: 1 },
      // A narrow bloom hugging a real edge. Both this and `uEdgeFalloff` must fit
      // the margin outside the core, which is `0.5 - 0.5 * inset` = 0.08.
      uHaloWidth: { value: 0.026 },
      uHaloStrength: { value: 0.03 },
      uCoreColor: {
        value: new THREE.Color().setHex(BLOG_DISPLAY_COLORS.core, THREE.SRGBColorSpace),
      },
      uHaloColor: {
        value: new THREE.Color().setHex(BLOG_DISPLAY_COLORS.halo, THREE.SRGBColorSpace),
      },
      uPage: { value: pageTexture },
      // --- display material ---------------------------------------------------
      // Scaled by `setScreenPresence`, so this is the value at REST. At 0 the
      // screen is exactly a flat panel, which is both the A/B for whether the
      // optical layer earns its contrast and the state it must reach before the
      // handoff.
      uGloss: { value: 0.16 },
      uGlossColor: {
        value: new THREE.Color().setHex(BLOG_DISPLAY_COLORS.gloss, THREE.SRGBColorSpace),
      },
    },
  });

  /** Captured at rest, so `setScreenPresence` has something to scale toward zero. */
  const restGloss = panelMaterial.uniforms['uGloss']!.value as number;
  let screenPresence = 1;

  const applyScreenPresence = (): void => {
    panelMaterial.uniforms['uGloss']!.value = restGloss * screenPresence;
  };

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth, panelHeight), panelMaterial);
  panel.rotation.x = THREE.MathUtils.degToRad(-options.tiltDegrees);
  panel.renderOrder = 3;
  root.add(panel);

  /**
   * The plate's world dimensions, derived in exactly one place.
   *
   * `cornerRadius` is multiplied by `panelHeight` because the face's SDF works in
   * p-space, where 1.0 is the plane's height — the plate needs the same corner in
   * world units or the two silhouettes will not register.
   */
  const shellDimensions = (): DisplayShellDimensions => ({
    width: panelWidth * coreInset + shellBleed * 2,
    height: panelHeight * coreInset + shellBleed * 2,
    thickness: shellThickness,
    radius: cornerRadius * panelHeight + shellBleed,
  });

  const shell = createDisplayShell(shellDimensions());
  // A CHILD of the panel, and that is doing real work in two directions. It inherits
  // position, yaw and the fixed tilt, so `setTilt` needs no plate handling at all;
  // and `panelPointer` raycasts with `intersectObject(panel, false)` — NON-recursive
  // — so the plate is provably never hit. That `false` is load-bearing: flipping it
  // to `true` would return rim-wall intersections whose `uv` is meaningless.
  panel.add(shell.object);

  // --- state -----------------------------------------------------------------

  let activation = 0;
  const activationTarget = 1;

  // The same numbers `servicesDisplay.ts`'s `FOLLOW` carries, and deliberately so:
  // two displays in one city that turn at different rates read as one of them
  // being broken.
  const follow: FollowSettings = {
    maxYawOffset: 42,
    damping: 0.9,
    deadZone: 1.5,
    speedCap: 28,
    baseYaw: options.baseYawDegrees,
  };

  /** The transition's lock. See `freezeFollow`. */
  let followFrozen = false;

  let currentYaw = follow.baseYaw;
  root.rotation.y = THREE.MathUtils.degToRad(currentYaw);

  const rebuildPlane = (): void => {
    panel.geometry.dispose();
    panel.geometry = new THREE.PlaneGeometry(panelWidth, panelHeight);
    panelMaterial.uniforms['uAspect']!.value = panelWidth / panelHeight;
    shell.setDimensions(shellDimensions());
  };

  return {
    object: root,
    panel,
    panelMaterial,

    setPage(canvas) {
      const next = new THREE.CanvasTexture(canvas);
      // SRGB, and it is mandatory rather than tidy. The face samples this as COLOUR
      // now; at `NoColorSpace` its sRGB bytes would be read as linear and re-encoded
      // on output, and the page would render washed out with nothing to point at.
      next.colorSpace = THREE.SRGBColorSpace;
      // The panel is seen at a steep angle for most of the approach, which is
      // exactly the case anisotropy exists for.
      next.anisotropy = 8;
      next.wrapS = THREE.ClampToEdgeWrapping;
      next.wrapT = THREE.ClampToEdgeWrapping;

      // The outgoing texture, but never the placeholder — that one is released in
      // `dispose`, whether or not a page ever arrived.
      if (pageTexture !== placeholder) pageTexture.dispose();
      pageTexture = next;
      panelMaterial.uniforms['uPage']!.value = next;
    },

    setScreenPresence(presence) {
      screenPresence = THREE.MathUtils.clamp(presence, 0, 1);
      applyScreenPresence();
    },

    setActivation(value) {
      activation = THREE.MathUtils.clamp(value, 0, 1);
      // Written straight through to both consumers rather than left for `update`:
      // the return sets this during `init`, and the first frame the visitor sees
      // has to already be at this value, not one frame behind it.
      panelMaterial.uniforms['uActivation']!.value = activation;
      shell.setActivation(activation);
    },

    freezeFollow(frozen) {
      followFrozen = frozen;
    },

    anchor() {
      return root.position.clone();
    },

    panelQuaternion() {
      // From the WORLD matrix, not the local rotation: the yaw lives on `root` and
      // the tilt on `panel`, and the camera has to match their composition.
      panel.updateWorldMatrix(true, false);
      return panel.getWorldQuaternion(new THREE.Quaternion());
    },

    coreHeight() {
      return panelHeight * coreInset;
    },

    update(dt, camera) {
      // One linear ramp. There is no staged entrance here and no asymmetry between
      // arriving and leaving — the display simply appears, and the only cinematic in
      // this module is the one that takes you out of the scene.
      if (activation !== activationTarget) {
        activation = Math.min(activationTarget, activation + dt / ACTIVATION_DURATION);
        panelMaterial.uniforms['uActivation']!.value = activation;
        // The plate fades with the face rather than popping in behind it — the only
        // reason its material is `transparent` at all.
        shell.setActivation(activation);
      }

      // --- Y-only orientation -------------------------------------------------
      //
      // `followFrozen` is the approach's lock. The lab had a second flag beside it
      // — a debug checkbox's preference — and the two were kept apart so a toggle
      // could not hand the yaw back mid-approach. There is no checkbox here, so
      // there is one flag, and it belongs to the transition.
      if (followFrozen) return;

      const toCamera = new THREE.Vector3();
      camera.getWorldPosition(toCamera).sub(root.position);
      // Yaw only: the panel's tilt is fixed and the camera's height must not affect
      // it. A full billboard is what the original plan explicitly refuses.
      const desired = THREE.MathUtils.radToDeg(Math.atan2(toCamera.x, toCamera.z));

      // Clamped around a FIXED resting yaw, so the panel returns to the same pose
      // every visit and can never end up facing away. It matters more here than it
      // did in the district: this camera is a free orbit, so the clamp is the only
      // thing stopping the panel turning to face someone standing behind it.
      const clamped = THREE.MathUtils.clamp(
        shortestDelta(follow.baseYaw, desired) + follow.baseYaw,
        follow.baseYaw - follow.maxYawOffset,
        follow.baseYaw + follow.maxYawOffset,
      );

      const error = clamped - currentYaw;
      if (Math.abs(error) > follow.deadZone) {
        // Frame-rate independent smoothing. A fixed lerp factor would turn the panel
        // faster on a faster machine, which is the kind of motion difference that is
        // impossible to tune.
        const smoothing = 1 - Math.exp(-dt / Math.max(follow.damping, 0.001));
        const stepDegrees = THREE.MathUtils.clamp(
          error * smoothing,
          -follow.speedCap * dt,
          follow.speedCap * dt,
        );
        currentYaw += stepDegrees;
        root.rotation.y = THREE.MathUtils.degToRad(currentYaw);
      }
    },

    setAspect(aspect) {
      // Width follows, height holds. See `PANEL_HEIGHT`.
      panelWidth = panelHeight * Math.max(0.01, aspect);
      rebuildPlane();
    },

    dispose() {
      // Neither texture is released by `material.dispose()`, and neither hangs off
      // the scene graph in a way the disposal walk can reach.
      if (pageTexture !== placeholder) pageTexture.dispose();
      placeholder.dispose();
      panel.geometry.dispose();
      panelMaterial.dispose();
      // Geometry AND material: the plate is built here, so this module owns both
      // halves of it.
      shell.dispose();
    },
  };
}

/** Shortest signed angular difference, in degrees. */
function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
