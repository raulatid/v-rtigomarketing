import * as THREE from 'three';
import type { CursorManager } from '../../../interaction/cursorManager';
import { clientToNdc } from '../../../interaction/screenSpace';
import type { CampusStage } from './section/campusState';

/**
 * The city's pointer and keyboard, routed into the services section.
 *
 * The lab's campus listened on its canvas itself — a lake click with a drag
 * slop, a horizontal swipe, the arrow keys, Escape. On the site that canvas is
 * shared: `createCameraInput` pans the city on it, Earth draws on it, and the
 * experience can be frozen while the other world shows. So the core copy lost
 * its listeners, and this class is them again, written the way
 * `DistrictInteraction` — the display district's interaction, which this
 * replaces — learned to write them:
 *
 *   - one listener set, registered once, removed in `dispose`;
 *   - an `enabled` gate, because frozen has to mean deaf as well as still;
 *   - a press ledger measured against its own threshold per pointer type, so
 *     the release of a pan is never a tap on whatever it ends over;
 *   - every way a pointer sequence can end closes it, including a release that
 *     lands on something above the canvas;
 *   - hover coalesced to one raycast a frame, through the cursor manager.
 *
 * ## Two modes, never both
 *
 * In the OVERVIEW the lake and the campus's buildings are the targets: a tap
 * on either enters, and a hover over either lights the buildings
 * (`onHoverChange`) — what lights is what answers a tap. The water node holds
 * the entrance pools too, so a hit on water counts only near the lake's
 * centre — the lab's own rule.
 *
 * INSIDE, the rig is externally controlled for the whole visit, so the pan
 * refuses every press (`createCameraInput`) and this is the only listener that
 * acts: a horizontal drag steps once per gesture, left for the next service
 * the way a carousel is pulled; the arrow keys step; Escape goes back one
 * level. A press during a flight is ignored rather than treated as "stop" —
 * the campus's flights cannot be cancelled mid-air, and they are short.
 */

/** Horizontal travel that commits a swipe, in CSS pixels. The lab's value. */
export const SWIPE_COMMIT_PX = 60;

/** A hit on the water counts within this multiple of the lake's radius. */
const LAKE_REACH = 1.1;

export interface CampusSectionIntents {
  readonly stage: CampusStage;
  /** False when the section could not take the camera. */
  enter(): boolean;
  next(): void;
  previous(): void;
  /** One level out: the detail, then the section. */
  back(): void;
}

export interface CampusInteractionDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  cursor: CursorManager;
  /** True while a pointer is panning the city. Its release is never a tap. */
  isDragging: () => boolean;
  /** Tap tolerance per pointer type, the numbers the pan uses. */
  tapThresholdPx: { mouse: number; touch: number };
  lake: { readonly mesh: THREE.Object3D; readonly center: THREE.Vector3; readonly radius: number };
  /** The architecture: a target like the lake, and what the hover lights. */
  buildings?: readonly THREE.Object3D[];
  /** When the pointer lands on or leaves a target. Never on touch. */
  onHoverChange?: (hovering: boolean) => void;
  section: CampusSectionIntents;
  /** Names the cursor request, so retracting ours cannot clear another's. */
  id: string;
}

/** Keys typed into a field are the field's, whatever the scene is doing. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export class CampusInteraction {
  private readonly deps: CampusInteractionDeps;
  private readonly cursorKey: string;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly ndc = new THREE.Vector2();
  private readonly hoverSupported: boolean;
  /** The lake and the buildings, raycast together so the nearest decides. */
  private readonly targets: THREE.Object3D[];
  private readonly buildingMeshes = new Set<THREE.Object3D>();

  private enabled = true;
  private hovering = false;
  private hoverDirty = false;
  private pointerX = 0;
  private pointerY = 0;

  /** Where the current pointer sequence began, to tell a tap from a drag. */
  private press: { id: number; x: number; y: number; touch: boolean } | null = null;
  /** The swipe being measured inside the section; committed at most once. */
  private swipe: { id: number; x: number; y: number; committed: boolean } | null = null;

  constructor(deps: CampusInteractionDeps) {
    this.deps = deps;
    this.cursorKey = `campus:${deps.id}`;
    const buildings = deps.buildings ?? [];
    this.targets = [deps.lake.mesh, ...buildings];
    for (const building of buildings) building.traverse((object) => this.buildingMeshes.add(object));
    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

    // Capture phase, as the display district's was. It still runs after
    // `createCameraInput`'s pointerdown, which registered first on the same
    // target — at the target node listeners fire in registration order,
    // whatever their capture flag — and that is fine: nothing here needs to
    // stop the pan. Outside, the tap test tells a pan from a tap; inside, the
    // pan is already refusing presses because the rig is not its to move.
    deps.canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    deps.canvas.addEventListener('pointermove', this.onPointerMove);
    deps.canvas.addEventListener('pointerup', this.onPointerUp);
    deps.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKeyDown);
    // Bookkeeping only, for a release that lands on something above the canvas.
    window.addEventListener('pointerup', this.onWindowPointerRelease, { capture: true, passive: true });
    window.addEventListener('pointercancel', this.onWindowPointerRelease, { capture: true, passive: true });
  }

  /** Input gate, for while Earth is showing or the blog approach flies. */
  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      // A pointer that is down when this is switched off has been abandoned;
      // leaving it on the books would outlive the whole visit elsewhere.
      this.press = null;
      this.swipe = null;
      this.hoverDirty = false;
      this.setHovering(false);
    }
  }

  /** Whether a tap at this client point would land on the lake or a building. */
  targetAt(clientX: number, clientY: number): boolean {
    const rect = this.deps.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.targets, true, this.hits);
    const hit = this.hits[0];
    if (!hit) return false;
    if (this.buildingMeshes.has(hit.object)) return true;
    const { center, radius } = this.deps.lake;
    return Math.hypot(hit.point.x - center.x, hit.point.z - center.z) <= radius * LAKE_REACH;
  }

  /** One hover raycast at most, and only in the overview. */
  update(): void {
    if (!this.hoverDirty) return;
    this.hoverDirty = false;
    if (!this.enabled || !this.hoverSupported) return;
    if (this.deps.section.stage !== 'overview' || this.deps.isDragging()) {
      this.setHovering(false);
      return;
    }
    this.setHovering(this.targetAt(this.pointerX, this.pointerY));
  }

  private setHovering(next: boolean): void {
    if (next === this.hovering) return;
    this.hovering = next;
    this.deps.cursor.request(this.cursorKey, next ? 'pointer' : '');
    this.deps.onHoverChange?.(next);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.press === null) {
      this.press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch',
      };
    }
    if (this.deps.section.stage !== 'overview' && this.swipe === null) {
      this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, committed: false };
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    const swipe = this.swipe;
    if (swipe && swipe.id === event.pointerId) {
      if (swipe.committed) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      // More sideways than up or down, and far enough: one step per gesture,
      // however far the drag goes on.
      if (Math.abs(dx) < SWIPE_COMMIT_PX || Math.abs(dx) <= Math.abs(dy)) return;
      swipe.committed = true;
      if (dx < 0) this.deps.section.next();
      else this.deps.section.previous();
      return;
    }
    // Coalesced to one raycast per frame in update().
    this.hoverDirty = true;
  };

  /** Forgets a pointer sequence, whatever ended it. */
  private endPointerSequence(pointerId: number): void {
    if (this.press?.id === pointerId) this.press = null;
    if (this.swipe?.id === pointerId) this.swipe = null;
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press?.id === event.pointerId ? this.press : null;
    const swiping = this.swipe?.id === event.pointerId;
    this.endPointerSequence(event.pointerId);

    // The gate comes AFTER the bookkeeping, and the order is load-bearing: a
    // release ends its sequence whether or not anyone is listening. The display
    // district shipped with it the other way round and went deaf on phones,
    // where leaving Murcia is a pinch and the fingers are still down when the
    // city is switched off.
    if (!this.enabled) return;
    if (swiping || event.button !== 0) return;
    if (this.deps.section.stage !== 'overview') return;

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hoverDirty = true;

    if (this.deps.isDragging()) return;
    // Measured against the press, independently of the pan: a release with no
    // press on record — the browser cancelled the pointer — is not a tap.
    if (!press) return;
    const threshold = press.touch ? this.deps.tapThresholdPx.touch : this.deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > threshold) return;

    // A finger is resolved where it LANDED: the guard above proved it did not
    // drag, and where a fingertip rolls to on its way up is not the intent.
    const x = press.touch ? press.x : event.clientX;
    const y = press.touch ? press.y : event.clientY;
    if (this.targetAt(x, y) && this.deps.section.enter()) this.setHovering(false);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.endPointerSequence(event.pointerId);
  };

  private readonly onWindowPointerRelease = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.deps.canvas.contains(target)) return;
    this.endPointerSequence(event.pointerId);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // On `window`, so it would fire while Earth owns the screen.
    if (!this.enabled || event.defaultPrevented) return;
    if (this.deps.section.stage === 'overview') return;
    if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
    const { section } = this.deps;
    if (event.key === 'ArrowRight') section.next();
    else if (event.key === 'ArrowLeft') section.previous();
    // Nothing is prevented: the keys stay available to whatever else
    // listens, as they were under the display district.
    else if (event.key === 'Escape') section.back();
  };

  dispose(): void {
    const { canvas } = this.deps;
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, { capture: true });
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, { capture: true });
    this.deps.cursor.request(this.cursorKey, '');
  }
}
