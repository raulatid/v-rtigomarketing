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
 * Under the copy, when a service has them: «Qué medimos», a label over the
 * names of what gets measured, and the figure's legend — a key in the
 * figure's colour and one line saying what it draws. The legend's space is
 * kept from the start, but it only fades in on `revealCaption`, which the
 * section calls once the figure it names has formed.
 *
 * Back and paging arrows take the pointer when requested by the host.
 * They report clicks; navigation remains the caller's responsibility.
 *
 * On the site the layer mounts into Murcia's own UI host (`container`), which
 * is full-viewport with `pointer-events: none`, rather than the body. The
 * styles stay inline, so this file still works back in the lab unchanged —
 * except the layout, which the site asks to place itself (`hostLayout`).
 */

import { attachCampusSheet } from './campusSheet';

const FADE_MS = 450;
const CAPTION_FADE_MS = 250;
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
  /** What the figure draws, in one line. Shown on `revealCaption`. */
  readonly caption?: string | null;
  /** The names of what gets measured. Empty or absent draws no block. */
  readonly measures?: readonly string[];
  /** `#rrggbb`, the figure's colour: the legend's key, as `--campus-accent`. */
  readonly accent?: string;
}

export interface CampusOverlayOptions {
  /**
   * The back arrow was clicked. Omit it and there is no arrow — the lab's
   * section is left with Escape. On a phone there is no Escape, which is why
   * the site asks for one.
   */
  onClose?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** `leave` names the back arrow; `measures` labels the list of what gets measured. */
  labels: { readonly leave: string; readonly measures?: string; readonly expand?: string; readonly collapse?: string; readonly previous?: string; readonly next?: string };
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
  /** Fades the current copy's legend in. Survives a swap still in flight. */
  revealCaption(): void;
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

  // «Qué medimos». Every visual choice here is the host's when it lays the
  // plate out; the lab gets a plain centred list.
  const measures = document.createElement('div');
  measures.className = 'campus-overlay__measures';
  const measuresLabel = document.createElement('div');
  measuresLabel.className = 'campus-overlay__measures-label';
  measuresLabel.textContent = labels.measures ?? '';
  measuresLabel.hidden = true;
  const measuresList = document.createElement('ul');
  measuresList.className = 'campus-overlay__measures-list';
  if (inlineLayout) {
    measures.style.cssText = 'margin-top:20px;font-size:13px;';
    measuresLabel.style.cssText = 'opacity:0.55;';
    measuresList.style.cssText = 'list-style:none;margin:6px 0 0;padding:0;opacity:0.85;';
  }
  measures.style.transition = `opacity ${CAPTION_FADE_MS}ms ease`;
  measures.append(measuresLabel, measuresList);

  // The figure's legend. Its opacity is behaviour, so it stays inline; the
  // rest is the host's, like the list's.
  const caption = document.createElement('div');
  caption.className = 'campus-overlay__caption';
  caption.style.cssText =
    (inlineLayout ? 'margin-top:18px;font-size:13px;' : '') +
    `opacity:0;transition:opacity ${CAPTION_FADE_MS}ms ease;`;
  const key = document.createElement('span');
  key.className = 'campus-overlay__key';
  key.setAttribute('aria-hidden', 'true');
  if (inlineLayout) {
    key.style.cssText =
      'display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:50%;background:var(--campus-accent,#fff);';
  }
  const captionText = document.createElement('span');
  caption.append(key, captionText);

  const hint = document.createElement('div');
  hint.style.cssText =
    'margin-top:26px;font-size:12px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55;';

  const body = document.createElement('div');
  body.className = 'campus-overlay__body';
  body.append(title);
  const pagingButtons: HTMLButtonElement[] = [];
  let navigation: HTMLDivElement | null = null;
  if (options.onPrevious && options.onNext && labels.previous && labels.next) {
    navigation = document.createElement('div');
    navigation.className = 'campus-overlay__navigation';
    if (inlineLayout) navigation.style.cssText = 'display:flex;justify-content:space-between;gap:12px;margin-top:24px;';
    for (const [direction, label, activate] of [
      ['previous', labels.previous, options.onPrevious],
      ['next', labels.next, options.onNext],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `campus-overlay__page campus-overlay__page--${direction}`;
      button.setAttribute('aria-label', label);
      button.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;background:none;color:inherit;cursor:pointer;pointer-events:auto;';
      button.innerHTML = '<svg width="28" height="24" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (direction === 'previous' ? '<path d="M25 12H3M11 4l-8 8 8 8"/>' : '<path d="M3 12h22M17 4l8 8-8 8"/>') + '</svg>';
      button.disabled = true;
      button.addEventListener('click', () => { if (visible && !disposed) activate(); });
      pagingButtons.push(button);
      navigation.append(button);
    }
  }
  body.append(subtitle, detail, measures, caption, hint);
  if (navigation) body.append(navigation);
  layer.append(body);

  // The back control comes first in the plate so it sits
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
  const sheet = options.hostLayout && labels.expand && labels.collapse
    ? attachCampusSheet(layer, body, { expand: labels.expand, collapse: labels.collapse }) : null;

  let disposed = false;
  let visible = false;
  let pending: ReturnType<typeof setTimeout> | null = null;
  /** The current copy's legend was asked for. Reset by every new copy. */
  let captionWanted = false;

  const write = (copy: OverlayCopy): void => {
    body.scrollTop = 0;
    // The docked plate scrolls the detail alone on a short screen (murcia.css).
    detail.scrollTop = 0;
    title.textContent = copy.title;
    subtitle.textContent = copy.subtitle;
    hint.textContent = copy.hint ?? '';
    hint.hidden = !copy.hint;
    detail.textContent = copy.detail ?? '';
    detail.hidden = !copy.detail;

    const items = copy.measures ?? [];
    measuresList.replaceChildren(
      ...items.map((item) => {
        const row = document.createElement('li');
        row.textContent = item;
        return row;
      }),
    );
    measures.hidden = items.length === 0;
    measures.style.opacity = captionWanted ? '1' : '0';
    measures.style.visibility = captionWanted ? 'visible' : 'hidden';

    captionText.textContent = copy.caption ?? '';
    caption.hidden = !copy.caption;
    caption.style.opacity = captionWanted ? '1' : '0';
    if (copy.accent) layer.style.setProperty('--campus-accent', copy.accent);
    else layer.style.removeProperty('--campus-accent');
    // The sheet decides from this copy whether it has anything to expand.
    sheet?.fit();
  };

  const cancelPending = (): void => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };

  return {
    show(copy) {
      if (disposed) return;
      for (const button of pagingButtons) button.disabled = false;
      cancelPending();
      captionWanted = false;
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

    revealCaption() {
      if (disposed) return;
      captionWanted = true;
      // Mid-swap the old copy is still written; `write` applies it to the new one.
      if (pending === null) {
        caption.style.opacity = '1';
        measures.style.opacity = '1';
        measures.style.visibility = 'visible';
      }
    },

    hide() {
      if (disposed) return;
      for (const button of pagingButtons) button.disabled = true;
      cancelPending();
      visible = false;
      captionWanted = false;
      layer.style.opacity = '0';
      layer.style.visibility = 'hidden';
      layer.style.transitionDelay = `0s, ${FADE_MS}ms`;
      sheet?.reset();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      sheet?.dispose();
      layer.remove();
    },
  };
}
