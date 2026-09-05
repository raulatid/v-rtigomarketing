/** DOM overlays: loading/status, instructions, and crosshair. No framework. */

export class StatusOverlay {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly spinner: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'status-overlay';
    this.el.className = 'overlay';

    this.spinner = document.createElement('div');
    this.spinner.className = 'spinner';

    this.title = document.createElement('div');
    this.title.className = 'status-title';
    this.title.textContent = 'Cargando la ciudad…';

    this.detail = document.createElement('div');
    this.detail.className = 'status-detail';

    this.el.append(this.spinner, this.title, this.detail);
    parent.appendChild(this.el);
  }

  setLoading(message: string, detail = ''): void {
    this.el.classList.remove('hidden', 'error');
    this.spinner.style.display = 'block';
    this.title.textContent = message;
    this.detail.textContent = detail;
  }

  setError(message: string, detail = ''): void {
    this.el.classList.remove('hidden');
    this.el.classList.add('error');
    this.spinner.style.display = 'none';
    this.title.textContent = message;
    this.detail.textContent = detail;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  dispose(): void {
    this.el.remove();
  }
}

/**
 * How long the controls plate is owed on screen after the viewer arrives, in
 * milliseconds, whatever their hands do in the meantime.
 *
 * JUDGED, like `BEACON_DWELL_MS`: three short lines, read by someone who has
 * just landed in a city and is looking at the city. This plate is the ONLY
 * place the controls are taught — rotation in particular has no affordance —
 * so losing it unread is losing the lesson. It used to fade on the first
 * `pointerdown`, which a click, a tap, or a finger of the arriving pinch all
 * are; the mobile audit (M22) found it at `opacity: 0` in every run.
 */
export const CONTROLS_HINT_MIN_MS = 15000;

/**
 * Non-blocking controls hint (pointer-events: none) so it never intercepts a
 * drag on the canvas.
 *
 * Fades once the viewer has DEMONSTRATED a drag — the controller's drag
 * threshold crossed, not a bare press — and never sooner than
 * `CONTROLS_HINT_MIN_MS` after the arrival it was offered on. Once per page
 * load: a second visit to the city does not bring it back.
 */
export class ControlsHint {
  private readonly el: HTMLDivElement;
  /** When the plate was offered, or null before the first settled arrival. */
  private shownAt: number | null = null;
  private fadeTimer = 0;
  private faded = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'controls-hint';
    this.el.className = 'overlay';
    // Pan is the one gesture that needs no teaching — people try it first — so
    // it leads, and the two that are NOT discoverable follow it. Rotation in
    // particular has no affordance at all now that it is on the right button.
    //
    // TWO SETS, because the instructions name inputs one device does not have.
    // Teaching the wrong device's controls is worse than teaching none: it says the
    // site was not built for the thing in your hand.
    //
    // 'Acercar' is gone from both. It taught the wheel and the pinch, and neither
    // moves the camera any more (`adr/009`) — the wheel navigates between worlds and
    // a pinch does nothing. Getting closer is what CLICKING a district does, which the
    // last line already teaches, so the gesture list is shorter by one and the site no
    // longer promises a control it removed.
    //
    // Keyed on `(pointer: coarse)` rather than on width: what decides this is
    // the input, not the viewport, and a small window on a laptop still has a
    // mouse. A one-shot read is right here, unlike the layout-mode reads —
    // this text is written once at construction and the hint fades out on the
    // first interaction, so there is no later moment for a change event to
    // matter.
    const coarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.el.innerHTML = coarse
      ? `
      <span><kbd>Arrastra</kbd> mover</span>
      <span><kbd>Dos dedos</kbd> girar</span>
      <span><kbd>Toca</kbd> un distrito iluminado</span>`
      : `
      <span><kbd>Arrastra</kbd> mover</span>
      <span><kbd>Botón derecho</kbd> girar</span>
      <span><kbd>Clic</kbd> en un distrito iluminado</span>`;
    parent.appendChild(this.el);
  }

  /**
   * The viewer has arrived and the plate is in front of them. Starts the
   * reading clock. Idempotent: the first arrival is the one that counts.
   */
  offer(now = Date.now()): void {
    if (this.faded || this.shownAt !== null) return;
    this.shownAt = now;
  }

  /**
   * The viewer has crossed the drag threshold. Fades the plate now if the
   * reading time is up, otherwise when it is. A drag that somehow lands before
   * any arrival is owed the full reading time from that moment.
   */
  demonstrated(now = Date.now()): void {
    if (this.faded || this.fadeTimer !== 0) return;
    if (this.shownAt === null) this.shownAt = now;
    const remaining = CONTROLS_HINT_MIN_MS - (now - this.shownAt);
    if (remaining <= 0) {
      this.fadeOut();
      return;
    }
    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = 0;
      this.fadeOut();
    }, remaining) as unknown as number;
  }

  fadeOut(): void {
    this.faded = true;
    this.el.classList.add('faded');
  }

  dispose(): void {
    if (this.fadeTimer !== 0) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = 0;
    }
    this.el.remove();
  }
}
