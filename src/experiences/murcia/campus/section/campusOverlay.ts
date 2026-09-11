/**
 * The section's copy: a DOM layer over the canvas, white on the scene.
 *
 * Follows the `camera-navigation/demo/*` idiom: one element appended to the
 * body, inline styles, no pointer events, removed on dispose. Real text
 * rather than a canvas texture, because the copy has to stay crisp at any
 * size and this is what the site would ship.
 *
 * `show` fades the current copy out, swaps it, and fades the new copy in.
 * The swap waits for the fade, so text never changes while readable.
 *
 * The one thing that takes the pointer is the back arrow at the top-left, when
 * the host asks for one. It only reports a click: what it means is the
 * caller's to decide.
 *
 * On the site the layer mounts into Murcia's own UI host (`container`), which
 * is full-viewport with `pointer-events: none`, rather than the body. The
 * styles stay inline, so this file still works back in the lab unchanged —
 * except the layout, which the site asks to place itself (`hostLayout`).
 */

const FADE_MS = 450;
const Z_INDEX = 30;

const fontPromises = new Map<string, Promise<void>>();

/**
 * Loaded once per url, never removed: fonts are a document resource. Only
 * when the host asks; a site that already declares the family in CSS passes
 * the family name alone.
 */
function loadFont(family: string, url: string): Promise<void> {
  let promise = fontPromises.get(url);
  if (!promise) {
    promise = (async () => {
      try {
        const face = new FontFace(family, `url('${url}') format('woff2')`, { weight: '400 700' });
        await face.load();
        document.fonts.add(face);
      } catch (error) {
        console.warn(`[service-campus]  did not load; the copy falls back to the system stack`, error);
      }
    })();
    fontPromises.set(url, promise);
  }
  return promise;
}

export interface OverlayCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly hint?: string;
  /** The rest of the service's copy, under the subtitle. */
  readonly detail?: string;
}

export interface CampusOverlayOptions {
  /**
   * The back arrow was clicked. Omit it and there is no arrow — the lab's
   * section is left with Escape. On a phone there is no Escape, which is why
   * the site asks for one.
   */
  onClose?: () => void;
  /** `leave` names the back arrow. */
  labels: { readonly leave: string };
  /** Where the layer mounts. Defaults to the body. */
  container?: HTMLElement;
  /** A family already declared by the host, or the one `fontUrl` registers. */
  fontFamily?: string;
  /** Registers `fontFamily` from this woff2. Omit when the host's CSS declares it. */
  fontUrl?: string;
  /**
   * The host's stylesheet places the layer: its position, width and alignment,
   * and the detail's alignment with it, are left off the inline
   * styles, which a stylesheet cannot override. The site docks the copy beside
   * the subject on a wide screen; the lab keeps the centred card.
   */
  hostLayout?: boolean;
}

export interface CampusOverlay {
  show(copy: OverlayCopy): void;
  hide(): void;
  dispose(): void;
}

export function createCampusOverlay(options: CampusOverlayOptions): CampusOverlay {
  const { labels } = options;
  const family = options.fontFamily ?? 'ui-sans-serif';
  if (options.fontFamily && options.fontUrl) void loadFont(options.fontFamily, options.fontUrl);

  const inlineLayout = !options.hostLayout;

  const layer = document.createElement('div');
  // A selector for tests and e2e, and the site's hook for its glass plate
  // (murcia.css). The lab styles nothing through it.
  layer.className = 'campus-overlay';
  layer.style.cssText =
    (inlineLayout
      ? 'position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);width:min(720px,88vw);text-align:center;'
      : '') +
    `z-index:${Z_INDEX};pointer-events:none;color:#fff;` +
    `font-family:'${family}',ui-sans-serif,system-ui,sans-serif;` +
    // Hidden as well as transparent: the buttons opt back into the pointer, and
    // at opacity 0 they would still catch a press meant for the city. The
    // visibility switch waits for the fade, so nothing pops.
    `opacity:0;visibility:hidden;transition:opacity ${FADE_MS}ms ease,visibility 0s linear ${FADE_MS}ms;`;

  const title = document.createElement('div');
  // A hook for the host's heading face, as the layer's class is for its plate.
  title.className = 'campus-overlay__title';
  title.style.cssText = 'font-size:clamp(28px,4vw,44px);font-weight:600;letter-spacing:-0.01em;line-height:1.1;';
  const subtitle = document.createElement('div');
  subtitle.className = 'campus-overlay__subtitle';
  subtitle.style.cssText =
    (inlineLayout ? 'margin-top:12px;' : '') +
    'font-size:clamp(15px,1.5vw,19px);font-weight:400;line-height:1.45;opacity:0.82;';
  // The spacing and line height are the host's too: the site opens them up
  // in the docked plate.
  const detail = document.createElement('div');
  detail.className = 'campus-overlay__detail';
  detail.style.cssText =
    (inlineLayout ? 'margin:18px auto 0;max-width:560px;line-height:1.55;' : '') +
    'font-size:clamp(14px,1.2vw,16px);font-weight:400;opacity:0.75;';
  const hint = document.createElement('div');
  hint.style.cssText =
    'margin-top:26px;font-size:12px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55;';

  layer.append(title, subtitle, detail, hint);

  // The one thing here that takes the pointer, first in the plate so it sits
  // at its top-left. A block, not inline: in the centred card an inline button
  // would be centred with the text, and the arrow belongs in the corner.
  const { onClose } = options;
  if (onClose) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'campus-overlay__back';
    // A bare arrow, no button chrome. The padding is the hit area (44 px
    // tall with the mark), and the negative margin takes it back so the mark
    // sits where the plate's padding puts it. The margin is the host's when it
    // lays the plate out: the site lifts the arrow in the docked plate.
    back.style.cssText =
      `display:flex;width:fit-content;align-items:center;${inlineLayout ? 'margin:-10px 0 12px;' : ''}` +
      'padding:10px 12px 10px 0;' +
      'border:0;background:none;color:#fff;cursor:pointer;pointer-events:auto;';
    // Drawn, not a glyph, so it is the same arrow in every face. The underline
    // is in the drawing, not a border, so the hit padding does not stretch it.
    back.innerHTML =
      '<svg width="40" height="26" viewBox="0 0 40 26" fill="none" stroke="currentColor" stroke-width="1.75"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M39 9H2M9 2L2 9l7 7"/><path d="M1 25H39" opacity="0.55"/></svg>';
    back.setAttribute('aria-label', labels.leave);
    back.addEventListener('click', () => onClose());
    layer.prepend(back);
  }

  (options.container ?? document.body).appendChild(layer);

  let disposed = false;
  let visible = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const write = (copy: OverlayCopy): void => {
    title.textContent = copy.title;
    subtitle.textContent = copy.subtitle;
    hint.textContent = copy.hint ?? '';
    hint.hidden = !copy.hint;
    detail.textContent = copy.detail ?? '';
    detail.hidden = !copy.detail;
  };

  const cancelPending = (): void => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };

  return {
    show(copy) {
      if (disposed) return;
      cancelPending();
      if (!visible) {
        write(copy);
        visible = true;
        layer.style.visibility = 'visible';
        layer.style.transitionDelay = '0s, 0s';
        // Next frame, so the transition sees a change rather than an initial value.
        requestAnimationFrame(() => {
          if (!disposed && visible) layer.style.opacity = '1';
        });
        return;
      }
      layer.style.opacity = '0';
      pending = setTimeout(() => {
        pending = null;
        if (disposed) return;
        write(copy);
        layer.style.opacity = '1';
      }, FADE_MS);
    },

    hide() {
      if (disposed) return;
      cancelPending();
      visible = false;
      layer.style.opacity = '0';
      layer.style.visibility = 'hidden';
      layer.style.transitionDelay = `0s, ${FADE_MS}ms`;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      layer.remove();
    },
  };
}
