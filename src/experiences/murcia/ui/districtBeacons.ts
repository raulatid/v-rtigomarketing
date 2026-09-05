import * as THREE from 'three';
import { worldToClient, type ElementRect } from '../../../interaction/screenSpace';

/**
 * The two places in the city worth clicking, named on arrival.
 *
 * ## Why this exists
 *
 * A viewer lands in Murcia and is shown a city. Two things in it are clickable —
 * the services district and the blog cluster — and until this, nothing said so.
 * `#controls-hint` ends with "Toca un distrito iluminado", which names a thing
 * the viewer cannot pick out of a skyline; the mobile audit
 * (`mobile-responsiveness-2026-09-02.md`, M22) found that pill had already faded
 * to nothing in every run by the time the city came to rest.
 *
 * `DECISIONS.md` §15 predicted the gap in the course of arguing something else:
 * "the page is `overflow: hidden` with a full-viewport canvas, so nothing
 * signals that scroll does anything; AN AFFORDANCE HAS TO BE DRAWN ANYWAY".
 * ADR 009 then deleted the rail and the return button without replacing what
 * they advertised.
 *
 * ## What it is not
 *
 * NOT A CONTROL. `pointer-events: none` and `aria-hidden`, both load-bearing.
 * ADR 009's whole direction is that navigation is a gesture and parallel
 * controls get deleted, so this points at the district and the district stays
 * the only way in. `DistrictA11y` already gives assistive technology a real
 * focusable route to every service, so a decorative echo here would be read out
 * twice and navigate nowhere.
 *
 * NOT A SECOND HELP SYSTEM either (`plans/012` TASK 14). It is a third class in
 * the family `overlays.ts` already holds, mounted into the same `.murcia-ui`
 * host and driven by the lifecycle `ControlsHint` already uses — armed by
 * `setActive`, dismissed by the same first-interaction signal, disposed with the
 * experience.
 *
 * ## Why DOM and not a sprite
 *
 * The city is drawn through Earth's composer on the borrowed route, and its
 * bloom thresholds at 0.62 linear luminance. Anything drawn into a scene texture
 * has to be dimmed under that knee or it halos — `PROJECT_MEMORY.md` note 58
 * records a wordmark that bloomed at `rgba(255,255,255,0.92)`. A DOM overlay
 * sits outside the composer entirely, so the type stays crisp at full white and
 * the accent hairline is free to glow because CSS is doing the glowing.
 */

/** One pinned label: which world point, and what it says. */
export interface BeaconSpec {
  /** Stable, and used as the element's `data-beacon` for tests. */
  id: string;
  /** Writes the world point to pin to. Called every frame; must not allocate. */
  anchor(out: THREE.Vector3): THREE.Vector3;
  /** The place's name. */
  label: string;
  /** What it holds — one short line under the name. */
  caption: string;
}

interface Pinned {
  spec: BeaconSpec;
  root: HTMLDivElement;
  /** Last position written, so an unchanged frame writes no style. */
  x: number;
  y: number;
  onScreen: boolean;
}

/**
 * How long the beacons stay before retiring on their own, in milliseconds.
 *
 * JUDGED, in the sense `adr/012` uses for the navigation constants: long enough
 * to read a name and a line under it without hurrying, short enough that a
 * viewer who ignores them is not looking at labels while they explore. Plan 012
 * TASK 12's complaint about the existing hints is that they go too fast, so this
 * is deliberately longer than the 5s the gesture hint waits before appearing.
 */
export const BEACON_DWELL_MS = 6000;

/**
 * The beat between the transition settling and the beacons appearing.
 *
 * Two jobs. It lets the arrival land before anything is written over it — the
 * warp's last frames are still a camera move, and a label fading up into that
 * reads as part of the motion rather than as a thing addressed to the viewer.
 * And it covers the tail of the gesture that brought them here: it is at least
 * `NAVIGATION_COOLDOWN.minSeconds` (0.35s), the window the navigation machine
 * itself holds after an arrival before it will accept another commit.
 */
export const BEACON_ARM_DELAY_MS = 400;

export class DistrictBeacons {
  private readonly el: HTMLDivElement;
  private readonly pins: Pinned[] = [];
  private readonly world = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  /** Scheduled but not yet shown. See `arm()` for why the two are separate. */
  private pending = false;
  /** On screen, and therefore dismissable. */
  private revealed = false;
  private suppressed = false;
  private timer = 0;

  constructor(parent: HTMLElement, specs: readonly BeaconSpec[]) {
    this.el = document.createElement('div');
    this.el.className = 'district-beacons';
    // The whole layer is decoration. `DistrictA11y` is the real route in.
    this.el.setAttribute('aria-hidden', 'true');

    for (const spec of specs) {
      // `textContent` throughout, never `innerHTML`. The controls hint used to
      // build its markup by assignment, and `DECISIONS.md:1756` recorded that as
      // the reason it could not be given CMS copy — the services label below IS
      // CMS copy. (Its rows are JSX in NavigationControl.tsx since 2026-09-05.)
      const root = document.createElement('div');
      root.className = 'district-beacon';
      root.dataset.beacon = spec.id;

      const plate = document.createElement('div');
      plate.className = 'district-beacon__plate';

      const label = document.createElement('span');
      label.className = 'district-beacon__label';
      label.textContent = spec.label;

      const caption = document.createElement('span');
      caption.className = 'district-beacon__caption';
      caption.textContent = spec.caption;

      plate.append(label, caption);

      // The leader and the dot are drawn, not written — a hint that points has
      // to point at something, and the dot lands on the same plane the ground
      // marker pulses on.
      const leader = document.createElement('span');
      leader.className = 'district-beacon__leader';
      const dot = document.createElement('span');
      dot.className = 'district-beacon__dot';

      root.append(plate, leader, dot);
      this.el.append(root);
      this.pins.push({ spec, root, x: NaN, y: NaN, onScreen: false });
    }

    parent.appendChild(this.el);
  }

  /**
   * Offer the beacons, if they are not already showing.
   *
   * ── The trap this signature exists for ──
   * Arming must NOT happen at the moment the city becomes active. The gesture
   * that carries a viewer into Murcia is a pinch or a wheel, and on touch its
   * own `pointerup` lands after the arrival — so a beacon armed on `setActive`
   * is dismissed by the gesture that brought the viewer here, before they have
   * seen it. That is not hypothetical: it is exactly what happened to
   * `#controls-hint`, which the mobile audit found at `opacity: 0` in every run.
   * The caller arms this after the transition has settled AND the arriving
   * gesture's pointers have lifted; `dismiss()` before then is ignored because
   * there is nothing armed to dismiss.
   */
  arm(): void {
    if (this.pending || this.revealed) return;
    this.pending = true;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.pending = false;
      this.revealed = true;
      this.el.dataset.visible = 'true';
      this.timer = setTimeout(() => {
        this.timer = 0;
        this.dismiss();
      }, BEACON_DWELL_MS) as unknown as number;
    }, BEACON_ARM_DELAY_MS) as unknown as number;
  }

  /**
   * Retire them. The viewer is exploring, or the dwell ran out.
   *
   * DELIBERATELY INERT while the reveal is still pending. An interaction inside
   * that window is the tail of the gesture that carried the viewer into the
   * city, not a decision to explore, and treating it as one is precisely how
   * `#controls-hint` came to be at `opacity: 0` in every single run of the
   * mobile audit — it took the arriving pinch's own press as its first
   * interaction and faded before the city had finished arriving. Something the
   * viewer never saw cannot be something they dismissed.
   */
  dismiss(): void {
    if (!this.revealed) return;
    this.revealed = false;
    this.clearTimer();
    delete this.el.dataset.visible;
  }

  /** For tests and for the caller's own guards. */
  get isShowing(): boolean {
    return this.revealed;
  }

  /**
   * Suppressed while something else owns the viewer's attention — a district
   * entered, the blog open. Faded rather than dismissed: this is a state of the
   * world, not the viewer telling us they are done, so it lifts again.
   */
  setSuppressed(suppressed: boolean): void {
    // Latched, because the caller is the frame loop. Assigning the same value
    // to a dataset property still goes through `setAttribute`, and an attribute
    // write is a style invalidation — one per frame, for a value that changes
    // when a viewer enters a district and at no other time.
    if (suppressed === this.suppressed) return;
    this.suppressed = suppressed;
    if (suppressed) this.el.dataset.suppressed = 'true';
    else delete this.el.dataset.suppressed;
  }

  /**
   * Re-pin every beacon to its world point.
   *
   * Takes the canvas rect rather than measuring it: this runs per frame per
   * beacon, and `getBoundingClientRect()` is a layout read. The caller already
   * holds a rect that changes only on resize.
   */
  update(rect: ElementRect, camera: THREE.Camera): void {
    // Nothing showing means nothing painted, and the projection is skipped
    // entirely — the beacons cost nothing for the rest of the visit.
    if (!this.revealed) return;

    for (const pin of this.pins) {
      pin.spec.anchor(this.world);
      const point = worldToClient(rect, camera, this.world, this.projected);

      if (point === null) {
        if (pin.onScreen) {
          pin.onScreen = false;
          delete pin.root.dataset.pinned;
        }
        continue;
      }

      // Rounded before comparing, so a sub-pixel camera drift does not write a
      // style every frame for a beacon that has not visibly moved.
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (!pin.onScreen) {
        pin.onScreen = true;
        pin.root.dataset.pinned = 'true';
      }
      if (x === pin.x && y === pin.y) continue;
      pin.x = x;
      pin.y = y;
      pin.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }

  dispose(): void {
    this.clearTimer();
    this.el.remove();
  }

  private clearTimer(): void {
    if (this.timer === 0) return;
    clearTimeout(this.timer);
    this.timer = 0;
  }
}
