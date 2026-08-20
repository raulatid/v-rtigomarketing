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
 * Non-blocking controls hint (pointer-events: none) so it never intercepts a
 * drag on the canvas. Fades out after the first interaction.
 */
export class ControlsHint {
  private readonly el: HTMLDivElement;

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

  fadeOut(): void {
    this.el.classList.add('faded');
  }

  dispose(): void {
    this.el.remove();
  }
}
