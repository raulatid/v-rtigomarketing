import { SWIPE_COMMIT_PX } from '../campus/campusInteraction';

/**
 * The keyboard and the swipe inside Conócenos, written the way
 * `campus/campusInteraction.ts` writes them and for its reasons: one listener
 * set, an `enabled` gate (frozen has to mean deaf as well as still), a swipe
 * that steps once per gesture, and keys typed into a field left alone.
 *
 * The way IN is not here. The tower's base and its dot are the points of
 * interest's (`pointsOfInterest/poiInteraction.ts`), which hand the tap to the
 * host as an intent.
 */

export interface AboutIntents {
  /** Inside the section: at a stop or on the way to one. */
  readonly engaged: boolean;
  next(): void;
  previous(): void;
  back(): void;
}

/** Keys typed into a field are the field's, whatever the scene is doing. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export class AboutInteraction {
  private enabled = true;
  private swipe: { id: number; x: number; y: number; committed: boolean } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly intents: AboutIntents,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerEnd, { capture: true, passive: true });
    window.addEventListener('pointercancel', this.onPointerEnd, { capture: true, passive: true });
    window.addEventListener('keydown', this.onKeyDown);
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) this.swipe = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || !this.intents.engaged || this.swipe !== null) return;
    this.swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, committed: false };
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const swipe = this.swipe;
    if (!this.enabled || !swipe || swipe.id !== event.pointerId || swipe.committed) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dy) < SWIPE_COMMIT_PX || Math.abs(dy) <= Math.abs(dx)) return;
    swipe.committed = true;
    // Pushed up for the next stop, as a finger rolls the wheel forward to step
    // on (`createNavigationInput`) and to travel from Earth to Murcia.
    if (dy < 0) this.intents.next();
    else this.intents.previous();
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (this.swipe?.id === event.pointerId) this.swipe = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // On `window`, so it would fire while Earth owns the screen.
    if (!this.enabled || event.defaultPrevented || !this.intents.engaged) return;
    if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
    if (event.key === 'ArrowRight') this.intents.next();
    else if (event.key === 'ArrowLeft') this.intents.previous();
    else if (event.key === 'Escape') this.intents.back();
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerEnd, { capture: true });
    window.removeEventListener('pointercancel', this.onPointerEnd, { capture: true });
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
