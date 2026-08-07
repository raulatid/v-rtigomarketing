/**
 * Projected label for an interactive district.
 *
 * Two jobs, and the second is the reason it is a `<button>` rather than a div:
 *
 * 1. It names the district on screen. On desktop it appears on hover; on
 *    devices with no hover it stays visible, because otherwise nothing on a
 *    touch screen would say the district is interactive at all.
 * 2. It is the district's **keyboard** affordance. A WebGL raycast cannot be
 *    tabbed to or activated by Enter, so accessibility cannot depend on picking.
 */
export interface DistrictLabelEvents {
  onActivate: () => void;
}

export class DistrictLabel {
  private readonly el: HTMLButtonElement;
  private readonly events: DistrictLabelEvents;
  /** True where the pointer cannot hover, so the label must persist. */
  private readonly hoverUnsupported: boolean;

  private visible = false;
  private onScreen = false;

  constructor(parent: HTMLElement, label: string, events: DistrictLabelEvents) {
    this.events = events;
    this.hoverUnsupported =
      typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;

    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'district-label';
    this.el.textContent = label;
    this.el.setAttribute('aria-label', `${label} — abrir distrito`);
    this.el.addEventListener('click', this.onClick);
    parent.appendChild(this.el);

    this.setVisible(this.hoverUnsupported);
  }

  /**
   * Places the label at a projected screen position.
   *
   * `onScreen` is false when the anchor is behind the camera or outside the
   * frustum; the label is hidden rather than clamped to an edge, which would
   * point at nothing.
   */
  setPosition(x: number, y: number, onScreen: boolean): void {
    this.onScreen = onScreen;
    // transform only — this runs every frame, and anything touching layout here
    // would show up in the frame budget.
    this.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
    this.applyVisibility();
  }

  /** Hover state on pointer devices. Ignored where hover is unsupported. */
  setHovered(hovered: boolean): void {
    if (this.hoverUnsupported) return;
    this.setVisible(hovered);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.el.classList.toggle('shown', this.visible && this.onScreen);
  }

  private readonly onClick = (event: MouseEvent): void => {
    // The label sits over the canvas; without this the click would also reach
    // the canvas listeners underneath.
    event.stopPropagation();
    this.events.onActivate();
  };

  dispose(): void {
    this.el.removeEventListener('click', this.onClick);
    this.el.remove();
  }
}
