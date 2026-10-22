/**
 * The screen stop's hint: scrolling, or a swipe, moves on.
 *
 * Stop 1 has no plate — the tower's screen is what it says — and no buttons
 * either (user direction, 2026-10-22): the wheel, the swipe and ←/→ walk the
 * stops, and this says so. The drawing is the scene hint's (`components/
 * SceneHint.tsx`), held still: the mouse with its chevrons over it for a fine
 * pointer, a finger pushing up a phone for a coarse one, over one sentence.
 * Placed and dressed by murcia.css (`.about-hint`), which picks the glyph by
 * `(pointer: coarse)` as the scene hint does.
 *
 * Text, not a control: nothing here takes a press, and it is hidden from
 * assistive technology like the scene hint.
 */

const FADE_MS = 450;

export interface AboutHintOptions {
  container: HTMLElement;
  sentence: string;
}

export interface AboutHint {
  show(): void;
  hide(): void;
  dispose(): void;
}

/** The scene hint's way-in mouse: the chevrons above, pointing up, the way the wheel steps on. */
const MOUSE =
  '<svg class="about-hint__glyph about-hint__glyph--mouse" viewBox="6 1 12 34" fill="none" stroke="currentColor"' +
  ' stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
  '<rect x="7" y="14" width="10" height="20" rx="5"/><path d="M12 18v4"/>' +
  '<path d="M8 12l4-4 4 4"/><path d="M8 6l4-4 4 4"/></svg>';

/** The scene hint's phone, with one finger on it and the way it pushes. */
const SWIPE =
  '<svg class="about-hint__glyph about-hint__glyph--swipe" viewBox="0 0 48 48" fill="none" stroke="currentColor"' +
  ' stroke-linecap="round" stroke-linejoin="round" focusable="false">' +
  '<rect x="9" y="2" width="26" height="44" rx="4" stroke-width="1.6"/><path d="M20 6h8" stroke-width="1.6"/>' +
  '<path d="M22 40V30" stroke-width="5"/><path d="M22 23V11M17 16l5-5 5 5" stroke-width="1.6"/></svg>';

export function createAboutHint(options: AboutHintOptions): AboutHint {
  const layer = document.createElement('div');
  layer.className = 'about-hint';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    `opacity:0;visibility:hidden;transition:opacity ${FADE_MS}ms ease,visibility 0s linear ${FADE_MS}ms;`;
  layer.innerHTML = MOUSE + SWIPE;
  const sentence = document.createElement('span');
  sentence.className = 'about-hint__sentence';
  sentence.textContent = options.sentence;
  layer.append(sentence);
  options.container.appendChild(layer);

  let visible = false;
  let disposed = false;

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
