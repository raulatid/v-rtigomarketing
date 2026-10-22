import * as THREE from 'three';
import type { CursorManager } from '../../../interaction/cursorManager';
import { clientToNdc } from '../../../interaction/screenSpace';
import { POI_DEFINITIONS, type PoiId } from './poiConfig';

/**
 * The canvas's pointer for the points of interest: the dots, and the tower's
 * base, which has no listener of its own.
 *
 * Written the way `CampusInteraction` is — one listener set, an `enabled`
 * gate, a press ledger against the pan's own thresholds per pointer type, a
 * finger resolved where it landed, hover coalesced to one resolve a frame and
 * only for a mouse — and for the reasons written there.
 *
 * ## What it owns, and what it does not
 *
 * The dots are drawn by `poiMarkers.ts` and asked where they are (`dotAt`).
 * The tower's base is raycast here, because nothing else in the city listens
 * for it: its hover, and a tap on it, which is a tap on its dot. The blog's panel and the campus keep their own
 * listeners (trap: blog #17, never two over one object): a tap on the BLOG or
 * SERVICIOS dot is handed to the host as an intent, and the host routes it
 * into the entry those places already have, which refuses a camera already
 * taken. So a dot over its own building, tapped, starts one flight, whichever
 * listener hears it first.
 *
 * A dot is nearer the eye than any surface: it is drawn over everything, so a
 * tap that lands on one is the dot's, whatever is behind it.
 */

export interface PoiTower {
  readonly base: THREE.Object3D | null;
  setBaseHover(on: boolean): void;
}

export interface PoiInteractionDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  cursor: CursorManager;
  /** True while a pointer is panning the city. Its release is never a tap. */
  isDragging: () => boolean;
  /** Tap tolerance per pointer type, the numbers the pan uses. */
  tapThresholdPx: { mouse: number; touch: number };
  markers: {
    dotAt(clientX: number, clientY: number, touch: boolean): PoiId | null;
    setPointed(id: PoiId | null): void;
  };
  tower: PoiTower;
  /** The city's overview is showing: the only time a dot or the base answers. */
  available(): boolean;
  /** A clickable point of interest was tapped. */
  activate(id: PoiId): void;
  /**
   * Whether a place that is clickable by kind goes anywhere now. Absent means
   * always. Conócenos needs it: without its CMS document the section is not
   * built, and the base then names itself and promises no click.
   */
  clickable?(id: PoiId): boolean;
}

const CLICKABLE = new Set(POI_DEFINITIONS.filter((definition) => definition.clickable).map((d) => d.id));

export class PoiInteraction {
  private readonly deps: PoiInteractionDeps;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly ndc = new THREE.Vector2();
  private readonly hoverSupported: boolean;

  private enabled = true;
  private hoverDirty = false;
  private pointerX = 0;
  private pointerY = 0;
  private pointed: PoiId | null = null;
  /** The mouse is over the tower's base itself, rather than its dot. */
  private overBase = false;
  private cursorShown = false;

  private press: { id: number; x: number; y: number; touch: boolean } | null = null;

  constructor(deps: PoiInteractionDeps) {
    this.deps = deps;
    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

    deps.canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    deps.canvas.addEventListener('pointermove', this.onPointerMove);
    deps.canvas.addEventListener('pointerup', this.onPointerUp);
    deps.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('pointerup', this.onWindowPointerRelease, { capture: true, passive: true });
    window.addEventListener('pointercancel', this.onWindowPointerRelease, { capture: true, passive: true });
  }

  private isClickable(id: PoiId): boolean {
    return CLICKABLE.has(id) && (this.deps.clickable?.(id) ?? true);
  }

  /** A mouse is over the tower's base itself. */
  get baseHovered(): boolean {
    return this.overBase;
  }

  /** Input gate, for while Earth is showing. */
  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      this.press = null;
      this.hoverDirty = false;
      this.setHover(null, false);
    }
  }

  /** Whether a client point lands on the tower's base. */
  baseAt(clientX: number, clientY: number): boolean {
    const base = this.deps.tower.base;
    if (!base) return false;
    const rect = this.deps.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObject(base, false, this.hits);
    return this.hits.length > 0;
  }

  /** One hover resolve at most a frame. Also stands the hover down when the overview goes. */
  update(): void {
    if (!this.enabled) return;
    if (!this.deps.available() || this.deps.isDragging()) {
      this.hoverDirty = false;
      this.setHover(null, false);
      return;
    }
    if (!this.hoverDirty) return;
    this.hoverDirty = false;
    if (!this.hoverSupported) return;
    const dot = this.deps.markers.dotAt(this.pointerX, this.pointerY, false);
    this.setHover(dot, dot === null && this.baseAt(this.pointerX, this.pointerY));
  }

  private setHover(dot: PoiId | null, overBase: boolean): void {
    if (dot !== this.pointed) {
      this.pointed = dot;
      this.deps.markers.setPointed(dot);
    }
    this.overBase = overBase;
    // The base's tint answers its dot and the glass alike: what lights is the
    // place the dot names.
    this.deps.tower.setBaseHover(dot === 'conocenos' || overBase);
    const cursor = dot !== null ? this.isClickable(dot) : overBase && this.isClickable('conocenos');
    if (cursor !== this.cursorShown) {
      this.cursorShown = cursor;
      this.deps.cursor.request('marker:poi', cursor ? 'pointer' : '');
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.press !== null) return;
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse' };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hoverDirty = true;
  };

  private endPointerSequence(pointerId: number): void {
    if (this.press?.id === pointerId) this.press = null;
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press?.id === event.pointerId ? this.press : null;
    this.endPointerSequence(event.pointerId);
    // After the bookkeeping, for `CampusInteraction`'s reason.
    if (!this.enabled || event.button !== 0) return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.hoverDirty = true;
    if (!press || this.deps.isDragging()) return;
    const threshold = press.touch ? this.deps.tapThresholdPx.touch : this.deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > threshold) return;
    if (!this.deps.available()) return;

    const x = press.touch ? press.x : event.clientX;
    const y = press.touch ? press.y : event.clientY;
    // A dot first, for the reason in the header; the base is the dot's place.
    const target = this.deps.markers.dotAt(x, y, press.touch) ?? (this.baseAt(x, y) ? 'conocenos' : null);
    if (target !== null && this.isClickable(target)) this.deps.activate(target);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.endPointerSequence(event.pointerId);
  };

  private readonly onWindowPointerRelease = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.deps.canvas.contains(target)) return;
    this.endPointerSequence(event.pointerId);
  };

  dispose(): void {
    const { canvas } = this.deps;
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, { capture: true });
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, { capture: true });
    this.deps.cursor.request('marker:poi', '');
  }
}
