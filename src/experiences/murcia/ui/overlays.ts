/** DOM overlays: loading/status. No framework. */

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

  // Accessibility audit 2026-11-18, M8: the overlay was only faded out, and
  // «Cargando la ciudad… /models/…glb» stayed in the accessibility tree over a
  // city that had long loaded. A status while loading, an alert when it fails,
  // and out of the tree once hidden.
  setLoading(message: string, detail = ''): void {
    this.el.setAttribute('role', 'status');
    this.el.removeAttribute('aria-hidden');
    this.el.classList.remove('hidden', 'error');
    this.spinner.style.display = 'block';
    this.title.textContent = message;
    this.detail.textContent = detail;
  }

  setError(message: string, detail = ''): void {
    this.el.setAttribute('role', 'alert');
    this.el.removeAttribute('aria-hidden');
    this.el.classList.remove('hidden');
    this.el.classList.add('error');
    this.spinner.style.display = 'none';
    this.title.textContent = message;
    this.detail.textContent = detail;
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.el.removeAttribute('role');
    this.el.setAttribute('aria-hidden', 'true');
  }

  dispose(): void {
    this.el.remove();
  }
}
