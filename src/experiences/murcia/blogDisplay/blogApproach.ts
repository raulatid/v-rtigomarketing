import * as THREE from 'three';
import type { BlogDisplay } from './blogDisplay';
import {
  BLOG_TRANSITION,
  cinematicTravel,
  prefersReducedMotion,
  smootherstep,
} from './blogTransition';
import { createHandoffImage, type HandoffImage } from './handoffImage';
import type { PageImageSource } from './pageImage';
import { createTransitionClock, type TransitionClock } from './transitionClock';

/**
 * The two flights, and everything that has to be true while one is running.
 *
 * The approach: a click on the display takes the camera off the rig and, over three
 * seconds, moves it onto the panel's own normal until the readable core fills the
 * frame — at which point the blog's route is pushed behind a cover wearing the same
 * image the panel is wearing. The return is that flight backwards.
 *
 * ## What this port did NOT have to bring across
 *
 * The lab's version of this ended in `window.location.assign('/blog')`, and about a
 * third of it existed to survive a document swap: a `sessionStorage` token carrying
 * the departure pose with a TTL and total validation, an inline classic script in
 * `index.html` that dressed the boot element before the bundle ran, a
 * `pageshow`/`persisted` reload for the back/forward cache, and a cover deliberately
 * leaked past teardown so a restored document had something to show.
 *
 * None of it is here, because none of it applies. `App` changes a route in the same
 * document (`useRoute.openBlogIndex`), `<LazyScene suspended>` sets
 * `frameloop="never"`, `.app__scene` goes `data-hidden` and `inert`, and the scene,
 * the rig and this module all stay alive with the camera parked exactly where the
 * approach left it. The departure pose does not travel because the rig still holds
 * it: nothing wrote to the rig during the flight, so releasing external control puts
 * the camera back on its own.
 *
 * ## What it introduced instead: the loop stops
 *
 * `update()` is not called at all while the blog is open. Every consequence is
 * handled explicitly rather than left to a frame that will not arrive:
 *
 * - the cover's last-resort dismissal is a DOM timer inside `handoffImage`, not a
 *   ramp in `update()`;
 * - a resize is QUEUED rather than applied, because applying it would allocate a
 *   geometry and a texture inside a window `e2e/blog.spec.ts` asserts nothing is
 *   allocated in — and would lay out a page for a frame nobody will ever see;
 * - the return is started by `App` from a layout effect, before paint, so the cover
 *   is up in the same commit that unhides a canvas still holding the last frame it
 *   drew.
 *
 * ## One camera owner per frame (DECISIONS §9)
 *
 * `ownsCamera` is what `MurciaExperience.update()` branches on, and the branch is an
 * `if/else`: while this owns the camera the drag controller and the zoom do not run
 * at all. Writing last over them would be two owners and a race, not one owner.
 */

/**
 * How long a resize waits before the page is requested again, in milliseconds.
 *
 * A resize is a stream of events and each request is an image decode. The texture in
 * place stays on the panel throughout — a blank face while someone drags a window
 * edge would be worse than a slightly stale one, and the stale one is only wrong in
 * its aspect.
 */
const RESIZE_DEBOUNCE_MS = 180;

/**
 * What the cover wears before the first page image lands.
 *
 * The element is created EAGERLY with this rather than by whichever request
 * finishes first, which was a real race in the lab: the initial request and a
 * resize's request can both be in flight, both find the field null, and both create
 * an element — leaving the loser a full-screen `<img>` nothing holds a reference to
 * and nothing will ever remove.
 */
const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * How long the return will wait for a page image before giving up on it.
 *
 * The flight begins with the panel filling the frame, so starting before the texture
 * lands would lift the cover onto a near-black placeholder — the one failure the
 * cover exists to prevent. But waiting forever is worse: it strands the visitor on a
 * still image with no way back into the scene and no sign anything is wrong. Past
 * this, they are delivered to their pose with the cover down and the fault reported.
 */
const RETURN_TEXTURE_TIMEOUT_MS = 2500;

type Phase = 'rest' | 'approaching' | 'parked' | 'returning';

export interface BlogApproachDeps {
  camera: THREE.PerspectiveCamera;
  display: BlogDisplay;
  pageImages: PageImageSource;
  /**
   * Stands the drag controller down for the length of a flight, and picks it back
   * up afterwards.
   *
   * Two callbacks rather than the controller itself, so this module never learns
   * that a `DragPanController` exists — `MurciaExperience` owns that relationship
   * and already brackets the district's flights the same way.
   */
  beginExternalControl: () => void;
  endExternalControl: () => void;
  /**
   * Push the blog's route. Returns whether it was accepted.
   *
   * The boolean is load-bearing rather than decorative. `App.handleOpenBlog` refuses
   * while the warp is running or before the city is ready, and a refusal that this
   * module could not see would leave the camera parked at the panel under an opaque
   * cover with no blog behind it and nothing to take either of them away.
   */
  openBlog: () => boolean;
  /**
   * Fired at the click, so `App` can warm the blog's lazy chunk.
   *
   * No payload and no blog knowledge: `checks/architecture.ts` forbids anything
   * under `src/experiences/` from importing `src/blog/`, and a callback that says
   * only "something is about to want the blog" keeps that true.
   */
  onApproachStart: () => void;
}

export interface BlogApproach {
  /** True while this owns the camera. `MurciaExperience`'s `if/else` reads it. */
  readonly ownsCamera: boolean;
  /** True while a click must not start anything. `panelPointer` reads it. */
  readonly isBusy: boolean;
  /** Begins the approach. Refused, silently, if one is already in flight. */
  commit(): void;
  /**
   * Flies back out to where the visitor was standing when they clicked.
   *
   * Called by `App` for EVERY warm route back to the scene — the blog's own control,
   * the browser's Back button, a forward/back through an article — because they are
   * all the same event as far as the scene is concerned, and hooking only the
   * control would leave Back landing nose-against the display.
   *
   * A no-op unless this module is the reason the blog is open.
   */
  beginReturn(): void;
  /** `App`, once the blog has painted. Lowers the cover it no longer needs. */
  dismissCover(): void;
  /** The display's half of a viewport change. Queued while the blog is open. */
  setViewport(width: number, height: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createBlogApproach(deps: BlogApproachDeps): BlogApproach {
  const { camera, display, pageImages } = deps;
  const limits = BLOG_TRANSITION;

  /**
   * Read ONCE, at construction. A preference, not a live signal — re-reading it
   * mid-flight could change which branch a running one is in and leave the camera
   * parked wherever the last motion frame put it.
   */
  const reducedMotion = prefersReducedMotion();

  let phase: Phase = 'rest';
  let disposed = false;

  /**
   * The approach's origin, captured at the click and not before.
   *
   * Where the visitor ACTUALLY left the camera, never a configured rest pose:
   * measuring from a constant makes the flight's first frame a jump.
   */
  const fromPosition = new THREE.Vector3();
  const fromQuaternion = new THREE.Quaternion();
  const toPosition = new THREE.Vector3();
  const toQuaternion = new THREE.Quaternion();
  const returnFromPosition = new THREE.Vector3();
  const returnFromQuaternion = new THREE.Quaternion();
  const returnToPosition = new THREE.Vector3();
  const returnToQuaternion = new THREE.Quaternion();

  const normal = new THREE.Vector3();

  const handoff: HandoffImage = createHandoffImage(TRANSPARENT_PIXEL);

  /** Viewport in CSS pixels, as the page is laid out for. */
  let viewportWidth = 1;
  let viewportHeight = 1;
  /** Set while the blog is open and a resize arrived. Drained by `beginReturn`. */
  let pendingViewport: { width: number; height: number } | null = null;

  let resizeTimer: number | null = null;
  /** Supersedes an in-flight request whose answer would land after a newer one. */
  let requestGeneration = 0;

  /**
   * Where the camera must stand for the readable core to fill the frame exactly.
   *
   * A perspective camera at distance `d` sees `2 * d * tan(fov/2)` of world height,
   * so `d = coreHeight / 2 / tan(fov/2)`. The core's WIDTH needs no separate solve:
   * the panel takes the viewport's aspect, so the two constraints are the same one.
   *
   * `fillOvershoot` below 1 puts the camera slightly inside that, so the core
   * OVER-fills. At exactly 1 the core's edge lands on the viewport's edge, and a
   * rounded corner or a half-pixel of the antialiased fringe would show at the one
   * moment nothing may.
   */
  const fillDistance = (): number => {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    return (display.coreHeight() / 2 / Math.tan(halfFov)) * limits.fillOvershoot;
  };

  /**
   * The pose the flight is heading for, SOLVED EVERY FRAME rather than captured.
   *
   * The origin is captured because it is a fact about the past. The destination is
   * not: it is a function of where the panel is, how big its core is and what shape
   * the viewport is, and every one of those can change while a flight runs. A window
   * resized mid-approach changes the core's aspect; a return begins after a resize
   * that moved the panel's anchor and normal entirely. Freezing it made all of those
   * silently wrong, and re-solving costs one quaternion and two vector ops a frame.
   */
  const solveDestination = (): void => {
    // The camera's end rotation IS the panel's: a camera looks down its own -Z, the
    // panel's +Z is its face normal, so equal rotations are exactly square-on. No
    // `lookAt`, and no up-vector edge case to get wrong.
    toQuaternion.copy(display.panelQuaternion());
    normal.set(0, 0, 1).applyQuaternion(toQuaternion);
    toPosition.copy(display.anchor()).addScaledVector(normal, fillDistance());
  };

  /** Parks the camera exactly where the approach ended, re-solved from the live panel. */
  const holdAtPanel = (): void => {
    solveDestination();
    returnFromPosition.copy(toPosition);
    returnFromQuaternion.copy(toQuaternion);
    camera.position.copy(returnFromPosition);
    camera.quaternion.copy(returnFromQuaternion);
    display.freezeFollow(true);
    // Already switched on. Without this the panel would fade up over its activation
    // ramp in the one situation where it fills the entire frame.
    display.setActivation(1);
    // The mirror of the approach, which ramps this to 0 as the panel becomes a page.
    // Coming back, a page is becoming a panel again, so it starts at 0.
    display.setScreenPresence(0);
  };

  /** Hands the camera back to the rig, which never stopped holding the pose. */
  const releaseToRig = (): void => {
    phase = 'rest';
    display.freezeFollow(false);
    display.setScreenPresence(1);
    deps.endExternalControl();
  };

  const approachClock: TransitionClock = createTransitionClock({
    duration: () => limits.duration,
    // 1.0: there is no second half to render. The route changes at the end and the
    // camera stays where this leaves it until a return comes for it.
    cut: () => 1,
    onCut: () => {
      // ASSERTED, not trusted. The cover's opacity is a function of progress and
      // progress advances by `dt`, so a hitch can step straight over the window the
      // fade completes in and reach the cut with a half-transparent cover.
      handoff.cover();
      phase = 'parked';

      // A PAINTED FRAME, not merely an assigned opacity. One rAF schedules before
      // the paint this frame's mutations imply; the second lands after it. Changing
      // the route in the same turn would hide the scene while the browser was still
      // holding the frame before the cover went up.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (disposed || phase !== 'parked') return;
          if (deps.openBlog()) return;
          // Refused — the warp is running, or the city is not ready. There is no
          // blog behind this cover and nothing else will remove it, so undo the
          // whole trip rather than leaving the visitor sealed in.
          console.warn('[blogDisplay] the blog route was refused; returning to the scene');
          beginReturn();
        });
      });
    },
    onComplete: () => {
      // Reached on the same frame as the cut — `step()` falls straight through from
      // one branch to the other. The cut has already taken ownership of what happens
      // next, so there is deliberately nothing to do here.
    },
  });

  const returnClock: TransitionClock = createTransitionClock({
    duration: () => limits.returnDuration,
    cut: () => 1,
    onCut: () => {},
    onComplete: () => {
      handoff.set(0);
      releaseToRig();
    },
  });

  /**
   * Ends a return that cannot start, without stranding anyone.
   *
   * The flight waits for the page image, and the cover is opaque while it waits. If
   * the image never arrives that wait is forever: a visitor looking at a still
   * picture with no way to reach the scene behind it and no sign anything is wrong.
   * So the failure path still delivers them — straight to the pose they left, no
   * journey, cover down.
   */
  const bailOutOfReturn = (): void => {
    camera.position.copy(returnToPosition);
    camera.quaternion.copy(returnToQuaternion);
    display.setActivation(1);
    handoff.set(0);
    releaseToRig();
  };

  const startReturnFlight = (): void => {
    if (disposed || phase !== 'returning') return;

    // Re-solved here as well as in `init`: the image this waited for can take long
    // enough for another resize to have moved the panel underneath it.
    holdAtPanel();

    // REDUCED MOTION ARRIVES, IT DOES NOT TRAVEL. The update loop skips the motion
    // branch under this preference, so a started clock would tick out with the
    // camera parked at the panel and then drop the cover onto it — leaving the
    // visitor nose-against the display instead of where they clicked.
    if (reducedMotion) {
      bailOutOfReturn();
      return;
    }

    if (!returnClock.start()) return;
  };

  const requestPage = (width: number, height: number, onSettled?: () => void): void => {
    const mine = ++requestGeneration;
    void pageImages
      .request(width, height)
      .then((page) => {
        if (disposed) return;
        // Superseded while this one was decoding. Applying it would put an older,
        // wrong-aspect page on the panel AFTER the newer one, where it would stay
        // until the next resize.
        if (mine !== requestGeneration) return;
        display.setPage(page.canvas);
        // The cover wears the SAME bytes the texture was built from, so the frame
        // it covers and the frame behind it are one image rather than two.
        return handoff.setSource(page.href);
      })
      .then(() => {
        if (disposed || mine !== requestGeneration) return;
        onSettled?.();
      })
      .catch((error: unknown) => {
        // Loud, because the failure is otherwise invisible: the panel would show its
        // own core colour and the flight would still run, which looks like a design
        // decision rather than a fault.
        console.error('[blogDisplay] the blog page image did not resolve', error);
        if (disposed || mine !== requestGeneration) return;
        onSettled?.();
      });
  };

  const beginReturn = (): void => {
    if (disposed || phase !== 'parked') return;
    phase = 'returning';

    // Raised SYNCHRONOUSLY, because `App` calls this from a layout effect: the cover
    // has to be up in the very commit that unhides `.app__scene`, which is still
    // showing the last frame the canvas drew — the panel filling the screen.
    handoff.cover();

    // Where it ends: exactly where they were standing when they clicked. The rig
    // still holds this pose, because nothing wrote to the rig while this module
    // owned the camera.
    returnToPosition.copy(fromPosition);
    returnToQuaternion.copy(fromQuaternion);

    const queued = pendingViewport;
    pendingViewport = null;

    if (!queued) {
      startReturnFlight();
      return;
    }

    // A resize landed while the blog was open. Apply it BEFORE anything becomes
    // visible: the panel's shape, then the page laid out for that shape, then the
    // pose solved from the panel that results. Revealing first and correcting after
    // would show the visitor a stretched page and a camera aimed at where the panel
    // used to be.
    viewportWidth = queued.width;
    viewportHeight = queued.height;
    display.setAspect(queued.width / queued.height);

    let settled = false;
    const proceed = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      startReturnFlight();
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[blogDisplay] the page image did not arrive; returning without it');
      // Still delivered, cover down, rather than held on a still image.
      holdAtPanel();
      bailOutOfReturn();
    }, RETURN_TEXTURE_TIMEOUT_MS);

    requestPage(queued.width, queued.height, proceed);
  };

  return {
    get ownsCamera() {
      return phase !== 'rest';
    },

    get isBusy() {
      return phase !== 'rest';
    },

    commit() {
      if (disposed || phase !== 'rest') return;
      // The double-click guard, and the whole of it: two clicks in one frame start
      // one approach.
      if (!approachClock.start()) return;

      fromPosition.copy(camera.position);
      fromQuaternion.copy(camera.quaternion);

      phase = 'approaching';
      // Both other camera owners stand down for the whole run. The controller,
      // because a damped drag and a cinematic writing the same transform is a camera
      // fighting itself; the yaw follow, because a panel that keeps turning is a
      // panel the camera is chasing rather than arriving at.
      deps.beginExternalControl();
      display.freezeFollow(true);
      // Three seconds of approach is ample for a chunk that is already being
      // fetched, which is the point of firing this at the click rather than the cut.
      deps.onApproachStart();

      // Under reduced motion the camera never moves — but the route still changes
      // and the cover still goes up. Concealing a document's arrival is not a motion
      // effect, and without it the visitor would jump from a 3D scene to a page.
      //
      // Through the clock's own cut rather than a parallel call, so there is one
      // path to the route change and one place the guards live.
      if (reducedMotion) approachClock.step(limits.duration);
    },

    beginReturn,

    dismissCover() {
      if (disposed) return;
      // Not conditional on the phase. `App` calls this when the blog has painted,
      // and the blog painting is exactly when this element has no more work to do —
      // it sits at z 75 under `.blog-root`'s 90, so it is already invisible.
      handoff.set(0);
    },

    setViewport(width, height) {
      if (disposed) return;

      // QUEUED, NOT APPLIED. `setAspect` disposes a geometry and builds another, and
      // `setPage` uploads a texture — both inside a window where `frameloop` is
      // `never`, so nothing would render the replacements and `e2e/blog.spec.ts`'s
      // pinned `__vertigoGl` counts would move. It is also work laid out for a frame
      // nobody will ever see.
      if (phase === 'parked') {
        pendingViewport = { width, height };
        return;
      }

      viewportWidth = width;
      viewportHeight = height;

      // THE PANEL FOLLOWS THE VIEWPORT'S SHAPE, and this is what keeps the seam
      // possible: the readable core can only become the viewport if it has the
      // viewport's proportions, on every window size.
      display.setAspect(width / height);

      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        requestPage(viewportWidth, viewportHeight);
      }, RESIZE_DEBOUNCE_MS);
    },

    update(dt) {
      if (disposed) return;

      approachClock.step(dt);
      returnClock.step(dt);

      // Nothing to drive: `parked` holds a pose that was written once, and `rest`
      // belongs to the rig. Under reduced motion neither clock is ever running.
      if (returnClock.committed) {
        const p = returnClock.progress;
        // The SAME curve as the approach, with the endpoints swapped.
        // `cinematicTravel` is odd-symmetric, so this is its exact time-reversal —
        // see its docblock for the one-line proof.
        const t = cinematicTravel(p, limits.accelerationPower);

        camera.position.lerpVectors(returnFromPosition, returnToPosition, t);
        camera.quaternion.slerpQuaternions(returnFromQuaternion, returnToQuaternion, t);

        // Mirrored: the approach sheds screen-ness as the panel becomes a page, so
        // coming back it regains it as the page becomes a panel.
        display.setScreenPresence(smootherstep(limits.screenFadeStart, 1, 1 - p));

        // The cover lifts at the point of the run where it landed. Forward it rises
        // over [handoffStart, handoffStart + handoffFade] and the route changes at 1;
        // backward that window sits at the START, measured from the same edge, so
        // the page is held for exactly as long as it was held on the way in.
        handoff.set(
          1 -
            smootherstep(
              1 - Math.min(1, limits.handoffStart + limits.handoffFade),
              1 - limits.handoffStart,
              p,
            ),
        );
      } else if (approachClock.committed) {
        const p = approachClock.progress;
        const t = cinematicTravel(p, limits.accelerationPower);

        solveDestination();

        camera.position.lerpVectors(fromPosition, toPosition, t);
        camera.quaternion.slerpQuaternions(fromQuaternion, toQuaternion, t);

        // The panel sheds its screen-ness on the way in: the additive gloss is the
        // one term that reaches inside the readable core, and an HTML document has
        // no such thing.
        display.setScreenPresence(1 - smootherstep(limits.screenFadeStart, 1, p));

        // THE FADE'S END IS CLAMPED TO 1, and that is a real guard rather than
        // tidiness: the two numbers together can land past the cut, and the fade
        // would then still be climbing when the route changed — a partly transparent
        // cover over the one moment it must be opaque.
        handoff.set(
          smootherstep(
            limits.handoffStart,
            Math.min(1, limits.handoffStart + limits.handoffFade),
            p,
          ),
        );
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;

      // The clocks FIRST, and `cancel` rather than letting them run out. The `onCut`
      // this refuses to fire changes a route: a teardown that fired it would open
      // the blog because the city was being torn down.
      approachClock.cancel();
      returnClock.cancel();

      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
        resizeTimer = null;
      }

      // A body-level element nothing else will clear. Unlike the lab's, this one is
      // always removed: there is no cached document that could restore wanting it.
      handoff.dispose();

      // If the city is disposed mid-flight the controller must not be left standing
      // down, or a rebuilt scene would boot with a camera nothing writes to.
      if (phase !== 'rest') releaseToRig();
    },
  };
}

