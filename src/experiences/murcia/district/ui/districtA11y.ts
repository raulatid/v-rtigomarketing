import type { DistrictSnapshot } from '../districtState';
import { controlLabel } from '../display/displayConfig';

/**
 * The district's keyboard and screen-reader surface.
 *
 * The projected display is the only surface a *pointer* uses (plan 003 §4), and
 * it is drawn in a fragment shader. A raycast cannot be tabbed to and a shader
 * cannot be read aloud, so without this the services district is reachable by
 * mouse and touch and by nothing else. The DOM panel and the per-building labels
 * it replaces were carrying that job as a side effect of being DOM.
 *
 * Deliberately NOT a second visible UI. These are the `.nav-control` pattern
 * from `styles.css`: clipped to a pixel, unclipped on `:focus-visible` so a
 * sighted keyboard user can see what they landed on. Everything here drives the
 * same `DistrictState` transitions the display's controls do — there is one
 * navigation model, and this is a second way to reach it, not a second copy of
 * it (plan 003 §20).
 *
 * The live region is what makes the display's content audible. It carries the
 * counter, the title and the current mode, because none of those are anywhere
 * else in the accessibility tree.
 */

export interface DistrictA11yEvents {
  onEnter(): void;
  onPrevious(): void;
  onNext(): void;
  /** SABER MÁS while reading is closed, and the close while it is open. */
  onDetailToggle(): void;
  onBack(): void;
}

/** What the announcement needs, resolved by the caller from the active index. */
export interface DistrictA11yView {
  /** e.g. "Servicios · 02 / 05". */
  eyebrow: string;
  title: string;
  summary: string;
}

export class DistrictA11y {
  private readonly root: HTMLElement;
  private readonly live: HTMLElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly detailButton: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly locale: string;
  /** Last announcement, so an unchanged snapshot does not re-announce. */
  private announced = '';

  constructor(
    parent: HTMLElement,
    districtLabel: string,
    locale: string,
    events: DistrictA11yEvents,
  ) {
    this.locale = locale;

    this.root = document.createElement('div');
    this.root.className = 'district-a11y';

    // A group rather than a landmark: it is a control cluster inside the scene,
    // not a region of the page.
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', districtLabel);

    this.live = document.createElement('p');
    this.live.className = 'district-a11y-live';
    // Polite: paging through services must not interrupt whatever is being read.
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    this.root.appendChild(this.live);

    const button = (label: string, onActivate: () => void): HTMLButtonElement => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'district-a11y-control';
      el.textContent = label;
      el.addEventListener('click', onActivate);
      this.root.appendChild(el);
      return el;
    };

    // Order here IS tab order, and it matches the way the display reads: the way
    // in, then paging, then depth, then out.
    this.enterButton = button(`${districtLabel}: explorar`, events.onEnter);
    this.previousButton = button('Servicio anterior', events.onPrevious);
    this.nextButton = button('Servicio siguiente', events.onNext);
    this.detailButton = button(controlLabel(locale, 'detail'), events.onDetailToggle);
    this.backButton = button(controlLabel(locale, 'back'), events.onBack);

    parent.appendChild(this.root);
    this.applyVisibility(false, false);
  }

  update(snapshot: DistrictSnapshot, view: DistrictA11yView | null): void {
    this.applyVisibility(snapshot.districtActive, snapshot.detailOpen);

    if (!snapshot.districtActive || !view) {
      this.announced = '';
      this.live.textContent = '';
      return;
    }

    // The summary is announced in both modes and the detail copy is not.
    // Reading long copy is what the display is for; duplicating it into a live
    // region would make every page change read the whole service aloud.
    const message = snapshot.detailOpen
      ? `${view.eyebrow}. ${view.title}. ${controlLabel(this.locale, 'detail')}.`
      : `${view.eyebrow}. ${view.title}. ${view.summary}`;

    if (message === this.announced) return;
    this.announced = message;
    this.live.textContent = message;
  }

  private applyVisibility(active: boolean, detailOpen: boolean): void {
    this.enterButton.hidden = active;
    // Pagination stands down while reading, exactly as it does on the display
    // (plan 003 §11) — a control that is inert on screen must not still be
    // tabbable, or the two navigation models have diverged.
    this.previousButton.hidden = !active || detailOpen;
    this.nextButton.hidden = !active || detailOpen;
    this.detailButton.hidden = !active;
    this.backButton.hidden = !active;

    this.detailButton.textContent = detailOpen
      ? `${controlLabel(this.locale, 'detail')}: cerrar`
      : controlLabel(this.locale, 'detail');
    this.detailButton.setAttribute('aria-expanded', detailOpen ? 'true' : 'false');
  }

  dispose(): void {
    this.root.remove();
  }
}
