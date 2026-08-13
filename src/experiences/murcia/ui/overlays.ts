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
    this.el.innerHTML = `
      <span><kbd>Arrastra</kbd> mover</span>
      <span><kbd>Botón derecho</kbd> girar</span>
      <span><kbd>Rueda</kbd> acercar</span>
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
