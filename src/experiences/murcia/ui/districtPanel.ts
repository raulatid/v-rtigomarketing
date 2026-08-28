import type { ScreenRect } from '../camera/cameraFraming';

/**
 * Content panel for the selected service building.
 *
 * One component, two layouts. On desktop it docks to the right; below 768px it
 * is a bottom sheet with two stops. That split is not decoration: at the shipped
 * camera elevation the screen's vertical axis maps to *distance*, so the bottom
 * of frame is near foreground ground and the top is the far city. A sheet
 * therefore covers the cheapest part of the image, where a side panel on a
 * narrow screen would cover the city itself.
 *
 * The panel does not know about the camera. It reports its own rectangle through
 * `getObstructionRect()` and the framing code measures it — which is what keeps
 * a CSS change to its width from silently breaking the composition.
 *
 * It shows ONE service at a time. Stepping to a neighbour goes through
 * `onStep`, which the interaction turns into a building selection — the panel
 * never decides what it shows next, it only reports the gesture.
 */

export type SheetStop = 'peek' | 'expanded';

/** What the panel renders. Assembled by the interaction from content + tour position. */
export interface ServicePanelView {
  /** e.g. "Servicios · 2 / 5" */
  eyebrow: string;
  title: string;
  body: string;
  /** Titles of the neighbours, for the step buttons' accessible names. */
  prevTitle: string;
  nextTitle: string;
}

export interface DistrictPanelEvents {
  onClose: () => void;
  /** Prev (-1) or next (+1) requested. Wrap-around is the caller's decision. */
  onStep: (direction: -1 | 1) => void;
  /** Fired when the mobile sheet settles at a new stop. */
  onStopChanged?: (stop: SheetStop) => void;
}

/** Breakpoint shared with the stylesheet. */
const DESKTOP_MIN_WIDTH = 768;

/** Staged reveal on first open, ms. Copy arrives while the camera is still flying. */
const REVEAL_DELAYS = { eyebrow: 300, title: 380, copy: 480, nav: 600 } as const;
/** Shorter restage on a swap: the panel is already there, only the text changed. */
const SWAP_DELAYS = { eyebrow: 40, title: 100, copy: 180, nav: 0 } as const;

export class DistrictPanel {
  private readonly el: HTMLElement;
  private readonly handle: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly eyebrowEl: HTMLParagraphElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly copyEl: HTMLDivElement;
  private readonly nav: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly body: HTMLDivElement;
  private readonly events: DistrictPanelEvents;

  private open = false;
  private stop: SheetStop = 'peek';
  /** Element focused before opening, restored on close. */
  private previouslyFocused: HTMLElement | null = null;
  private readonly revealTimers: number[] = [];

  /**
   * `instanceId` keeps ids unique. One panel per district, and duplicate ids
   * would break `aria-labelledby` the moment a second district exists.
   */
  constructor(parent: HTMLElement, instanceId: string, events: DistrictPanelEvents) {
    this.events = events;
    const titleId = `district-panel-title-${instanceId}`;

    this.el = document.createElement('section');
    this.el.className = 'district-panel';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'false');
    this.el.setAttribute('aria-labelledby', titleId);
    this.el.hidden = true;

    this.handle = document.createElement('button');
    this.handle.type = 'button';
    this.handle.className = 'district-panel-handle';
    this.handle.setAttribute('aria-label', 'Desplegar o plegar el panel');

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'district-panel-close';
    this.closeButton.setAttribute('aria-label', 'Cerrar');
    this.closeButton.textContent = '×';

    this.eyebrowEl = document.createElement('p');
    this.eyebrowEl.className = 'district-panel-eyebrow reveal';

    this.titleEl = document.createElement('h2');
    this.titleEl.id = titleId;
    this.titleEl.className = 'district-panel-title reveal';

    this.copyEl = document.createElement('div');
    this.copyEl.className = 'district-panel-copy reveal';

    this.prevButton = this.makeStepButton(-1, 'Anterior');
    this.nextButton = this.makeStepButton(1, 'Siguiente');
    this.nav = document.createElement('nav');
    this.nav.className = 'district-panel-nav reveal';
    this.nav.setAttribute('aria-label', 'Recorrer los servicios');
    this.nav.append(this.prevButton, this.nextButton);

    // Header row (eyebrow + close) is fixed; the body is the only thing that
    // scrolls — the case panel's structure, which this panel's design copies.
    const header = document.createElement('div');
    header.className = 'district-panel-header';
    header.append(this.eyebrowEl, this.closeButton);

    this.body = document.createElement('div');
    this.body.className = 'district-panel-body';
    // Nav before copy in the DOM: on the mobile peek stop the sheet is 40%
    // tall, and the step buttons must be reachable without expanding it. On
    // desktop CSS sends the nav to the foot of the card with `order`.
    this.body.append(this.titleEl, this.nav, this.copyEl);

    this.el.append(this.handle, header, this.body);
    parent.appendChild(this.el);

    this.closeButton.addEventListener('click', this.onCloseClick);
    this.handle.addEventListener('click', this.onHandleClick);
    this.el.addEventListener('keydown', this.onKeyDown);
    this.nav.addEventListener('click', this.onStepClick);
  }

  get isOpen(): boolean {
    return this.open;
  }

  get currentStop(): SheetStop {
    return this.stop;
  }

  static get isDesktopLayout(): boolean {
    return window.innerWidth >= DESKTOP_MIN_WIDTH;
  }

  /**
   * Opens with a staged reveal: structure first, then the copy.
   *
   * The stages start immediately and run *alongside* the camera flight, rather
   * than after it. Waiting for arrival makes the click feel unacknowledged;
   * showing the finished panel up front makes the flight feel decorative.
   */
  show(view: ServicePanelView, reducedMotion: boolean): void {
    this.clearTimers();
    this.previouslyFocused = document.activeElement as HTMLElement | null;

    this.render(view);

    // Reset the stop *before* showing, so the sheet opens at peek regardless
    // of where the last open left it.
    this.stop = 'peek';
    this.el.dataset['stop'] = this.stop;

    this.el.hidden = false;
    this.open = true;

    // Force layout so the entry transition runs from the closed state rather
    // than being collapsed into the same style recalculation.
    void this.el.offsetWidth;
    this.el.classList.add('open');

    this.unreveal();
    if (reducedMotion) {
      this.revealAll();
    } else {
      this.reveal(REVEAL_DELAYS);
    }

    this.closeButton.focus({ preventScroll: true });
  }

  /**
   * Replaces the service while the panel stays open — the viewer stepped to a
   * neighbouring building, or tapped one.
   *
   * Deliberately NOT `hide()` + `show()`: that would reset the sheet to peek,
   * steal focus back to the close button mid-tour, and replay the entry
   * transition on a panel that never left. The stop and the focused element
   * are the viewer's; only the text is ours to change.
   */
  swap(view: ServicePanelView, reducedMotion: boolean): void {
    if (!this.open) {
      this.show(view, reducedMotion);
      return;
    }
    this.clearTimers();
    this.render(view);
    this.body.scrollTop = 0;

    if (reducedMotion) {
      this.revealAll();
      return;
    }
    // Restage the text only. The nav stays put — it is what the viewer is
    // pressing, and a control that blinks under the finger reads as broken.
    for (const el of [this.eyebrowEl, this.titleEl, this.copyEl]) el.classList.remove('shown');
    void this.body.offsetWidth;
    this.reveal(SWAP_DELAYS, { nav: false });
  }

  hide(): void {
    if (!this.open) return;
    this.clearTimers();
    this.open = false;
    this.el.classList.remove('open');
    this.el.hidden = true;
    this.unreveal();

    // Returning focus to where it was is the half of focus management that is
    // usually forgotten; without it a keyboard user lands back at the top.
    this.previouslyFocused?.focus?.({ preventScroll: true });
    this.previouslyFocused = null;
  }

  /**
   * Rectangle the panel covers once settled, in client coordinates, or null when
   * closed.
   *
   * Measured rather than derived from the breakpoint, so the framing follows the
   * real CSS and a width change cannot silently break the composition.
   *
   * **Uses the offset box, not `getBoundingClientRect()`.** The camera framing is
   * computed at the instant the panel opens, while the entry transition is still
   * at `translateX(100%)` / `translateY(100%)` — and `getBoundingClientRect()`
   * reports the *transformed* box, so it would hand back a rectangle sitting
   * entirely off-screen, overlapping nothing, and the framing offset would come
   * out as zero. `offsetLeft/Top/Width/Height` are layout values, unaffected by
   * transforms, so they describe where the panel is about to be. The element is
   * `position: fixed` with no positioned ancestor, so its offset parent is null
   * and these are already viewport-relative.
   */
  getObstructionRect(): ScreenRect | null {
    if (!this.open) return null;
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    if (width <= 0 || height <= 0) return null;
    return { left: this.el.offsetLeft, top: this.el.offsetTop, width, height };
  }

  // --- Content ---------------------------------------------------------------

  private render(view: ServicePanelView): void {
    this.eyebrowEl.textContent = view.eyebrow;
    this.titleEl.textContent = view.title;

    // One <p> per paragraph. The body is authored as plain text with blank
    // lines between paragraphs (Sanity `text`, max 900 chars).
    const paragraphs = view.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    this.copyEl.replaceChildren(
      ...paragraphs.map((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
      }),
    );

    this.prevButton.setAttribute('aria-label', `Anterior: ${view.prevTitle}`);
    this.nextButton.setAttribute('aria-label', `Siguiente: ${view.nextTitle}`);
  }

  private makeStepButton(direction: -1 | 1, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'district-panel-step';
    button.dataset['step'] = String(direction);

    const chevron = document.createElement('span');
    chevron.className = 'district-panel-chevron';
    chevron.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = label;

    if (direction < 0) button.append(chevron, text);
    else button.append(text, chevron);
    return button;
  }

  // --- Reveal ----------------------------------------------------------------

  private reveal(
    delays: { eyebrow: number; title: number; copy: number; nav: number },
    include: { nav: boolean } = { nav: true },
  ): void {
    const stage = (el: HTMLElement, delay: number): void => {
      this.revealTimers.push(window.setTimeout(() => el.classList.add('shown'), delay));
    };
    stage(this.eyebrowEl, delays.eyebrow);
    stage(this.titleEl, delays.title);
    stage(this.copyEl, delays.copy);
    if (include.nav) stage(this.nav, delays.nav);
  }

  private revealAll(): void {
    for (const el of [this.eyebrowEl, this.titleEl, this.copyEl, this.nav]) el.classList.add('shown');
  }

  private unreveal(): void {
    for (const el of [this.eyebrowEl, this.titleEl, this.copyEl, this.nav]) el.classList.remove('shown');
  }

  private clearTimers(): void {
    for (const timer of this.revealTimers) window.clearTimeout(timer);
    this.revealTimers.length = 0;
  }

  // --- Sheet -----------------------------------------------------------------

  private setStop(stop: SheetStop): void {
    if (this.stop === stop) return;
    this.stop = stop;
    this.el.dataset['stop'] = stop;
    this.events.onStopChanged?.(stop);
  }

  // --- Input -----------------------------------------------------------------

  private readonly onStepClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('.district-panel-step');
    if (!(button instanceof HTMLElement)) return;
    const step = Number(button.dataset['step']);
    if (step !== -1 && step !== 1) return;
    // A step does NOT change the sheet stop. The viewer is touring buildings
    // and the camera is what moves; raising the sheet would hide the very
    // thing they just asked to see.
    this.events.onStep(step);
  };

  private readonly onCloseClick = (): void => {
    this.events.onClose();
  };

  private readonly onHandleClick = (): void => {
    this.setStop(this.stop === 'peek' ? 'expanded' : 'peek');
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.events.onClose();
      return;
    }
    // Arrow keys tour the buildings while the panel has focus. Not on a text
    // field — there are none — and not when a modifier is held.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.events.onStep(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.events.onStep(1);
    }
  };

  dispose(): void {
    this.clearTimers();
    this.closeButton.removeEventListener('click', this.onCloseClick);
    this.handle.removeEventListener('click', this.onHandleClick);
    this.el.removeEventListener('keydown', this.onKeyDown);
    this.nav.removeEventListener('click', this.onStepClick);
    this.el.remove();
  }
}
