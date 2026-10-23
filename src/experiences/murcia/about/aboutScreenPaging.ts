/**
 * The screen stop's paging: the plate's arrows, under the screen.
 *
 * Stop 1 has no plate — the tower's screen is what it says — so the arrows
 * that close the plate at the other stops (`campusOverlay.ts`, as in the
 * services) stand on their own under it. Same buttons, same classes, so they
 * look and answer like the plate's. Placed by murcia.css (`.about-paging`).
 */

const FADE_MS = 450;

export interface AboutScreenPagingOptions {
  container: HTMLElement;
  labels: { readonly previous: string; readonly next: string };
  onPrevious: () => void;
  onNext: () => void;
}

export interface AboutScreenPaging {
  /** `hasPrevious`/`hasNext` false leaves that arrow out: the row does not wrap. */
  show(state: { readonly hasPrevious: boolean; readonly hasNext: boolean }): void;
  hide(): void;
  dispose(): void;
}

export function createAboutScreenPaging(options: AboutScreenPagingOptions): AboutScreenPaging {
  const layer = document.createElement('div');
  layer.className = 'about-paging';
  // Hidden as well as transparent, as the plate is: at opacity 0 the buttons
  // would still catch a press meant for the city.
  layer.style.cssText =
    `opacity:0;visibility:hidden;transition:opacity ${FADE_MS}ms ease,visibility 0s linear ${FADE_MS}ms;`;

  let visible = false;
  let disposed = false;

  // The plate's paging buttons (`campusOverlay.ts`), as they are written there.
  const buttons = (
    [
      ['previous', options.labels.previous, options.onPrevious],
      ['next', options.labels.next, options.onNext],
    ] as const
  ).map(([direction, label, activate]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `campus-overlay__page campus-overlay__page--${direction}`;
    button.setAttribute('aria-label', label);
    button.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;background:none;color:inherit;cursor:pointer;pointer-events:auto;';
    button.innerHTML = '<svg width="28" height="24" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (direction === 'previous' ? '<path d="M25 12H3M11 4l-8 8 8 8"/>' : '<path d="M3 12h22M17 4l8 8-8 8"/>') + '</svg>';
    button.disabled = true;
    button.addEventListener('click', () => { if (visible && !disposed) activate(); });
    return button;
  });
  layer.append(...buttons);
  options.container.appendChild(layer);

  return {
    show(state) {
      if (disposed) return;
      for (const [button, has] of [[buttons[0]!, state.hasPrevious], [buttons[1]!, state.hasNext]] as const) {
        button.disabled = !has;
        // Inline, as the button's own `display` is: a lone arrow stays centred.
        button.style.display = has ? 'flex' : 'none';
      }
      if (visible) return;
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
      for (const button of buttons) button.disabled = true;
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
