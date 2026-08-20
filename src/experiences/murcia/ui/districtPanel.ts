import type { DistrictContent } from '../../../content/types';
import type { ScreenRect } from '../camera/cameraFraming';

/**
 * Content panel for a selected district.
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
 * a CSS change to its width from silently breaking the composition. Note that
 * opening an accordion section changes only the height of content *inside* the
 * scrolling body, so the reported rectangle never moves and the camera framing
 * is never invalidated by it.
 */

export type SheetStop = 'peek' | 'expanded';

export interface DistrictPanelEvents {
  onClose: () => void;
  /** Fired when the mobile sheet settles at a new stop. */
  onStopChanged?: (stop: SheetStop) => void;
}

/** Breakpoint shared with the stylesheet. */
const DESKTOP_MIN_WIDTH = 768;

interface AccordionSection {
  header: HTMLButtonElement;
  heading: HTMLHeadingElement;
  region: HTMLDivElement;
}

export class DistrictPanel {
  private readonly el: HTMLElement;
  private readonly handle: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly summaryEl: HTMLParagraphElement;
  private readonly introEl: HTMLParagraphElement;
  private readonly listEl: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly events: DistrictPanelEvents;
  private readonly instanceId: string;

  private sections: AccordionSection[] = [];
  /** Index of the one open section, or -1. Only ever one at a time. */
  private openIndex = -1;

  private open = false;
  private stop: SheetStop = 'peek';
  private reducedMotion = false;
  /** Element focused before opening, restored on close. */
  private previouslyFocused: HTMLElement | null = null;
  private readonly revealTimers: number[] = [];

  /**
   * `instanceId` keeps ids unique. One panel per district, and duplicate ids
   * would break both `aria-labelledby` and any future id-based styling the
   * moment a second district exists.
   */
  constructor(parent: HTMLElement, instanceId: string, events: DistrictPanelEvents) {
    this.events = events;
    this.instanceId = instanceId;
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

    this.titleEl = document.createElement('h2');
    this.titleEl.id = titleId;
    this.titleEl.className = 'district-panel-title reveal';

    this.summaryEl = document.createElement('p');
    this.summaryEl.className = 'district-panel-summary reveal';

    this.introEl = document.createElement('p');
    this.introEl.className = 'district-panel-intro reveal';

    this.listEl = document.createElement('div');
    this.listEl.className = 'district-panel-services';

    this.body = document.createElement('div');
    this.body.className = 'district-panel-body';
    this.body.append(this.titleEl, this.summaryEl, this.introEl, this.listEl);

    this.el.append(this.handle, this.closeButton, this.body);
    parent.appendChild(this.el);

    this.closeButton.addEventListener('click', this.onCloseClick);
    this.handle.addEventListener('click', this.onHandleClick);
    this.el.addEventListener('keydown', this.onKeyDown);
    // Delegated, so the listener count does not scale with the service count and
    // dispose() stays a single removal regardless of how the content changes.
    this.listEl.addEventListener('click', this.onSectionClick);
    this.listEl.addEventListener('keydown', this.onSectionKeyDown);
  }

  get isOpen(): boolean {
    return this.open;
  }

  get currentStop(): SheetStop {
    return this.stop;
  }

  /** Index of the open accordion section, or -1. Exposed for testing. */
  get openSectionIndex(): number {
    return this.openIndex;
  }

  static get isDesktopLayout(): boolean {
    return window.innerWidth >= DESKTOP_MIN_WIDTH;
  }

  /**
   * Opens with a staged reveal: structure first, then the copy, then the
   * sections.
   *
   * The stages start immediately and run *alongside* the camera flight, rather
   * than after it. Waiting for arrival makes the click feel unacknowledged;
   * showing the finished panel up front makes the flight feel decorative.
   */
  show(content: DistrictContent, reducedMotion: boolean): void {
    this.clearTimers();
    this.reducedMotion = reducedMotion;
    this.previouslyFocused = document.activeElement as HTMLElement | null;

    this.titleEl.textContent = content.label;
    this.summaryEl.textContent = content.summary;
    this.introEl.textContent = content.intro;

    // Reset the stop *before* building, so the sections are constructed against
    // coherent state rather than against whatever stop the last open left behind.
    this.stop = 'peek';
    this.el.dataset['stop'] = this.stop;

    this.buildSections(content, reducedMotion);

    this.el.hidden = false;
    this.open = true;

    // Force layout so the entry transition runs from the closed state rather
    // than being collapsed into the same style recalculation.
    void this.el.offsetWidth;
    this.el.classList.add('open');

    if (reducedMotion) {
      this.revealAll();
    } else {
      this.revealTimers.push(
        window.setTimeout(() => this.titleEl.classList.add('shown'), 300),
        window.setTimeout(() => this.summaryEl.classList.add('shown'), 400),
        window.setTimeout(() => this.introEl.classList.add('shown'), 500),
        window.setTimeout(() => {
          for (const section of this.sections) {
            section.heading.classList.add('shown');
            section.region.classList.add('shown');
          }
        }, 640),
      );
    }

    this.closeButton.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.open) return;
    this.clearTimers();
    this.open = false;
    this.el.classList.remove('open');
    this.el.hidden = true;
    this.titleEl.classList.remove('shown');
    this.summaryEl.classList.remove('shown');
    this.introEl.classList.remove('shown');
    for (const section of this.sections) {
      section.heading.classList.remove('shown');
      section.region.classList.remove('shown');
    }

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

  // --- Accordion -------------------------------------------------------------

  /**
   * Builds one `h3 > button` header and one region per service.
   *
   * A heading rather than a bare button because the panel title is already an
   * `h2`: assistive technology should get a real document outline, not a stack
   * of controls.
   */
  private buildSections(content: DistrictContent, reducedMotion: boolean): void {
    const nodes: HTMLElement[] = [];
    this.sections = content.services.map((service, index) => {
      const headerId = `district-${this.instanceId}-header-${service.id}`;
      const regionId = `district-${this.instanceId}-region-${service.id}`;

      const heading = document.createElement('h3');
      heading.className = 'district-service-heading reveal';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'district-service-header';
      header.id = headerId;
      header.setAttribute('aria-controls', regionId);
      header.dataset['index'] = String(index);

      const chevron = document.createElement('span');
      chevron.className = 'district-service-chevron';
      chevron.setAttribute('aria-hidden', 'true');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = service.title;

      header.append(titleSpan, chevron);
      heading.appendChild(header);

      // The region is the grid wrapper; the inner div is the grid child that
      // clips. Two elements are needed because `grid-template-rows: 0fr -> 1fr`
      // animates the *track*, and the content has to be able to overflow it.
      const region = document.createElement('div');
      region.className = 'district-service-region reveal';
      region.id = regionId;
      region.setAttribute('role', 'region');
      region.setAttribute('aria-labelledby', headerId);

      const inner = document.createElement('div');
      inner.className = 'district-service-inner';
      const paragraph = document.createElement('p');
      paragraph.textContent = service.body;
      inner.appendChild(paragraph);
      region.appendChild(inner);

      if (!reducedMotion) {
        const delay = `${index * 70}ms`;
        heading.style.transitionDelay = delay;
        region.style.transitionDelay = delay;
      }

      nodes.push(heading, region);
      return { header, heading, region };
    });

    this.listEl.replaceChildren(...nodes);
    // Start with the first section open: an all-collapsed list of buttons reads
    // as a menu rather than as content.
    //
    // `fromUser: false` matters. Opening a section normally raises the mobile
    // sheet to its reading stop — but this open is the panel's initial state,
    // not a gesture, so routing it through the same path would jump straight to
    // 85% the instant the panel appeared and the peek stop would never be seen.
    this.openIndex = -1;
    if (this.sections.length > 0) this.setOpenSection(0, { fromUser: false });
  }

  /**
   * Opens one section and closes whatever was open.
   *
   * Single-open is the point: in a 380px column several open sections make the
   * reader lose their place, which is what the accordion exists to prevent.
   *
   * `fromUser` distinguishes a gesture from the initial state. Only a gesture
   * scrolls the header into view or raises the mobile sheet.
   */
  private setOpenSection(index: number, options: { fromUser?: boolean } = {}): void {
    const fromUser = options.fromUser ?? true;
    const next = index === this.openIndex ? -1 : index;
    this.openIndex = next;

    this.sections.forEach((section, i) => {
      const expanded = i === next;
      section.header.setAttribute('aria-expanded', String(expanded));
      section.region.classList.toggle('expanded', expanded);
      // Collapsed content must leave the tab order, or a keyboard user tabs
      // into text they cannot see.
      section.region.inert = !expanded;
    });

    if (next === -1 || !fromUser) return;

    // On mobile the peek stop is for orientation, not reading: revealing a
    // paragraph into a 40%-tall window would put most of it below the fold, so
    // opening a section raises the sheet in the same gesture. The camera
    // deliberately does not follow — at the reading stop the user has chosen
    // content over scene.
    if (!DistrictPanel.isDesktopLayout && this.stop === 'peek') {
      this.setStop('expanded');
    }

    this.sections[next]?.heading.scrollIntoView({
      block: 'nearest',
      behavior: this.reducedMotion ? 'auto' : 'smooth',
    });
  }

  private sectionIndexFrom(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    const header = target.closest('.district-service-header');
    if (!(header instanceof HTMLElement)) return null;
    const index = Number(header.dataset['index']);
    return Number.isInteger(index) ? index : null;
  }

  private readonly onSectionClick = (event: MouseEvent): void => {
    const index = this.sectionIndexFrom(event.target);
    if (index === null) return;
    this.setOpenSection(index);
  };

  /**
   * Arrow, Home and End move between headers, per the WAI-ARIA accordion
   * pattern. Enter and Space come free with a real `<button>`.
   */
  private readonly onSectionKeyDown = (event: KeyboardEvent): void => {
    const index = this.sectionIndexFrom(event.target);
    if (index === null || this.sections.length === 0) return;

    const last = this.sections.length - 1;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.sections[next]?.header.focus();
  };

  // --- Sheet -----------------------------------------------------------------

  private setStop(stop: SheetStop): void {
    if (this.stop === stop) return;
    this.stop = stop;
    this.el.dataset['stop'] = stop;
    this.events.onStopChanged?.(stop);
  }

  private revealAll(): void {
    this.titleEl.classList.add('shown');
    this.summaryEl.classList.add('shown');
    this.introEl.classList.add('shown');
    for (const section of this.sections) {
      section.heading.classList.add('shown');
      section.region.classList.add('shown');
    }
  }

  private clearTimers(): void {
    for (const timer of this.revealTimers) window.clearTimeout(timer);
    this.revealTimers.length = 0;
  }

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
    }
  };

  dispose(): void {
    this.clearTimers();
    this.closeButton.removeEventListener('click', this.onCloseClick);
    this.handle.removeEventListener('click', this.onHandleClick);
    this.el.removeEventListener('keydown', this.onKeyDown);
    this.listEl.removeEventListener('click', this.onSectionClick);
    this.listEl.removeEventListener('keydown', this.onSectionKeyDown);
    this.sections = [];
    this.el.remove();
  }
}
