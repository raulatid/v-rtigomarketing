/**
 * The screen stop's controls: the way out and the step on, and nothing else.
 *
 * Stop 1 has no plate — the tower's screen is what it says — but a mouse still
 * needs somewhere to click. So the plate's own two arrows (`campusOverlay.ts`:
 * the back arrow and the paging arrow), on a small smoked-glass bar under the
 * screen. They report clicks; navigation remains the caller's, as the plate's
 * does. Placed and dressed by murcia.css (`.about-controls`).
 */

const FADE_MS = 450;

export interface AboutControlsOptions {
  container: HTMLElement;
  labels: { readonly leave: string; readonly next: string };
  onBack: () => void;
  onNext: () => void;
}

export interface AboutControls {
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createAboutControls(options: AboutControlsOptions): AboutControls {
  const layer = document.createElement('div');
  layer.className = 'about-controls';
  // Hidden as well as transparent, for the plate's reason: at opacity 0 the
  // buttons would still catch a press meant for the city.
  layer.style.cssText =
    `opacity:0;visibility:hidden;transition:opacity ${FADE_MS}ms ease,visibility 0s linear ${FADE_MS}ms;`;

  let visible = false;
  let disposed = false;

  const button = (modifier: string, label: string, svg: string, activate: () => void): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'about-controls__button about-controls__button--' + modifier;
    element.setAttribute('aria-label', label);
    element.innerHTML = svg;
    element.addEventListener('click', () => { if (visible && !disposed) activate(); });
    return element;
  };

  // The plate's drawings, so the arrows are the same in every stop.
  layer.append(
    button(
      'back',
      options.labels.leave,
      '<svg width="40" height="26" viewBox="0 0 40 26" fill="none" stroke="currentColor" stroke-width="1.75"' +
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M39 9H2M9 2L2 9l7 7"/><path d="M1 25H39" opacity="0.55"/></svg>',
      options.onBack,
    ),
    button(
      'next',
      options.labels.next,
      '<svg width="28" height="24" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.75"' +
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h22M17 4l8 8-8 8"/></svg>',
      options.onNext,
    ),
  );
  options.container.appendChild(layer);

  return {
    show() {
      if (disposed || visible) return;
      visible = true;
      layer.style.visibility = 'visible';
      layer.style.transitionDelay = '0s, 0s';
      // Next frame, so the transition sees a change rather than an initial value.
      requestAnimationFrame(() => {
        if (!disposed && visible) layer.style.opacity = '1';
      });
    },

    hide() {
      if (disposed) return;
      visible = false;
      layer.style.opacity = '0';
      layer.style.visibility = 'hidden';
      layer.style.transitionDelay = `0s, ${FADE_MS}ms`;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      layer.remove();
    },
  };
}
