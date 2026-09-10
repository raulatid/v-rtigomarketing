/**
 * A cinematic, as a scalar that walks 0 -> 1 once.
 *
 * Ported unchanged from `vertigo-lab`'s `blog-transition` (plan 022). Eighty lines
 * with no dependencies, and every hazard its docblocks record applies here too.
 *
 * ## Two callers, one clock
 *
 * It lived in `experiences/murcia/blogDisplay/` while the blog approach was its
 * only caller. The camera-navigation port gave it a second — the Earth <-> Murcia
 * transition, which used to be counted by a GSAP timeline — so it moved here
 * rather than being copied. `utils/` is the floor both an application concern
 * and an experience may reach; the module imports nothing, so nothing follows it.
 *
 * ## Why the scene transition stopped using GSAP
 *
 * Read what that timeline actually was: two `to` tweens on a proxy object with
 * `ease: 'none'`, separated by a `call`. A LINEAR ramp with a callback in the
 * middle. Every curve already lives in `utils/warpTransition`, and a GSAP ease
 * there would compound with those curves and destroy the width relationship the
 * three bells depend on — so the library was contributing a clock, and `step(dt)`
 * is already a clock.
 *
 * GSAP is NOT removed from the project: `useMasterTimeline` still owns the intro,
 * where a real timeline with real easing earns its keep (DECISIONS 26.3).
 *
 * ## What that GAINED, rather than merely preserved
 *
 * The GSAP timeline needed a `visibilitychange` guard, because it advanced on its
 * own wall clock and a hidden tab returned having fast-forwarded — possibly PAST
 * the substitution frame, which would swap the scene with nothing covering it.
 *
 * That hazard cannot be reintroduced here. This advances only when `step(dt)` is
 * called, `requestAnimationFrame` does not run in a hidden tab, and
 * `graphics/frameDelta.ts` clamps every delta to `MAX_FRAME_DELTA` regardless. A
 * tab hidden across a whole cinematic resumes on the frame it left, so the guard
 * was deleted with the timeline rather than ported.
 *
 * ## What it buys, beyond advancing a number
 *
 * `start()` returning false IS THE ENTIRE DOUBLE-CLICK GUARD. The source pairs this
 * clock with a four-phase state machine policing a continuous scroll stream; a click
 * produces none of those problems, so the machine is not copied and this refusal is
 * the whole of the protection. Two clicks in a frame start one approach, and one
 * navigation.
 *
 * ## Why not a library
 *
 * `update(dt)` is already a clock. Every curve lives in `blogTransition`. An
 * animation library would contribute the one thing the frame loop already has, in a
 * repository with a single runtime dependency pinned exactly.
 *
 * A wall-clock library would also need a `visibilitychange` guard — a hidden tab
 * returns having fast-forwarded, possibly past the cut, which here would navigate
 * with nothing covering it. That hazard is structurally absent: this advances only
 * when `step(dt)` is called, rAF does not run in a hidden tab, and `host/loop.ts`
 * clamps `dt` to 0.1s regardless.
 *
 * ## `cut` sits at the END here, not the middle
 *
 * The source cuts at 0.5 because it swaps one world for another and then keeps
 * rendering the new one for the second half. This transition leaves the document
 * entirely, so there is no second half — `cut` is 1.0, `onCut` navigates, and
 * `onComplete` is reached only if the navigation somehow does not happen.
 */

export interface TransitionClockOptions {
  /** Seconds. Read once per run. */
  readonly duration: () => number;
  /** 0..1, where the navigation happens. Read once per run. */
  readonly cut: () => number;
  /**
   * The substitution. Fires once, on the frame progress crosses `cut`, with the
   * handoff image already at full cover. Navigate here — nothing else.
   */
  readonly onCut: () => void;
  /**
   * The approach finished. Progress and `committed` are already pinned back when
   * this runs, so a handler that reads them sees rest rather than the last frame.
   */
  readonly onComplete: () => void;
}

export interface TransitionClock {
  /** 0 at rest. Only meaningful while `committed`. */
  readonly progress: number;
  /** True while the approach owns the camera. `OrbitControls` stands down on this. */
  readonly committed: boolean;
  /** Begins a run. Returns false if one is already in flight. */
  start(): boolean;
  /** Advances by `dt` seconds. No-op when not committed. */
  step(dt: number): void;
  /**
   * Stops immediately and pins back to rest WITHOUT firing either callback.
   *
   * For disposal only — and here that matters more than it did at the source. The
   * `onCut` this refuses to fire is a NAVIGATION, so a teardown that fired it would
   * send a visitor to `/blog` because the city was torn down under them.
   */
  cancel(): void;
}

export function createTransitionClock(options: TransitionClockOptions): TransitionClock {
  let committed = false;
  let progress = 0;
  let elapsed = 0;
  let cutFired = false;
  /** Snapshotted at `start`, so nothing can move a running approach. */
  let runDuration = 0;
  let runCut = 1;

  return {
    get progress() {
      return progress;
    },
    get committed() {
      return committed;
    },

    start() {
      if (committed) return false;

      const duration = options.duration();
      const cut = options.cut();
      // A zero or negative duration would divide by zero and land at Infinity.
      // Refuse rather than clamp: a transition nobody can see is a mistake in the
      // limits, and silently substituting a default would hide it.
      if (!Number.isFinite(duration) || duration <= 0) return false;

      runDuration = duration;
      runCut = Number.isFinite(cut) ? Math.min(1, Math.max(0, cut)) : 1;
      committed = true;
      elapsed = 0;
      progress = 0;
      cutFired = false;
      return true;
    },

    step(dt) {
      if (!committed || !Number.isFinite(dt)) return;

      elapsed += Math.max(0, dt);
      progress = Math.min(1, elapsed / runDuration);

      // Before the completion check, so an approach short enough to finish in one
      // frame still navigates.
      if (!cutFired && progress >= runCut) {
        cutFired = true;

        // PINNED TO EXACTLY `cut` FOR THIS ONE FRAME, and this is what makes the
        // handoff airtight.
        //
        // The handoff image's opacity is a function of progress, reaching 1 at
        // `handoffStart + handoffFade` — before `cut`. Every frame overshoots its
        // target by some amount, and pinning means the frame on which the navigation
        // is requested is painted at exactly the progress the cover was computed for,
        // rather than at whatever the overshoot happened to be.
        //
        // `elapsed` is deliberately NOT rewound with it: the overshoot is real time
        // that passed, and dropping it would make every run one frame longer than its
        // duration. Only the painted progress is pinned, for one frame.
        progress = runCut;
        options.onCut();
      }

      if (progress >= 1) {
        // Pinned BEFORE the callback, so a handler reading either sees rest.
        committed = false;
        progress = 0;
        elapsed = 0;
        options.onComplete();
      }
    },

    cancel() {
      committed = false;
      progress = 0;
      elapsed = 0;
      cutFired = false;
    },
  };
}
