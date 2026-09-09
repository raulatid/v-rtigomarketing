/**
 * The page, as a full-screen element, covering the crossing between the panel and
 * the real blog.
 *
 * The lab's version of this covered a document swap: it called `location.assign`
 * behind the element and the browser held the old pixels until the new document
 * painted. Nothing here swaps documents — `App` changes a route, the scene is
 * hidden and frozen, and `<LazyBlog>` mounts as a sibling — so what this covers is
 * narrower and better defined: the gap between the last frame the canvas drew and
 * the first frame the blog paints, which is however long the lazy chunk takes.
 *
 * ## Why DOM rather than a quad in the scene
 *
 * A quad stops being drawn the moment the frame loop stops, and the frame loop
 * stopping is precisely the event this exists to cover — `<LazyScene suspended>`
 * sets `frameloop="never"`. A body-level element outlives the loop, the canvas and
 * the renderer.
 *
 * ## Why an `<img>` and not a canvas
 *
 * It wears `pageImage`'s own `href` directly — a data URI on the plate route, the
 * captured asset's URL on the screenshot route — so it is the same bytes the
 * texture was built from rather than a re-encode of the bitmap. It also lets
 * `setSource` wait on `decode()`, so the element is provably ready long before the
 * approach reaches it.
 */

/**
 * Above the scene and everything in it, and BELOW the blog.
 *
 * The ladder `styles.css` documents: canvas 10, intro 20, warp overlay and Earth
 * readout 40, footer 42, rail 45, header 50/70, context-lost 80, `.blog-root` 90,
 * debug overlay 100, cursor 999.
 *
 * 75 is chosen against two of those deliberately.
 *
 * BELOW `.blog-root` at 90, which is what makes this cover fail safe rather than
 * fail dangerous: when the blog mounts it paints over this element on its own, so
 * dismissing it is tidying up rather than the mechanism. An element at 95 would
 * have hidden the very page it exists to introduce, and every path that forgot to
 * dismiss it would have been a blank site instead of a redundant image.
 *
 * BELOW `.context-lost` at 80, so a graphics context lost mid-approach still
 * reports itself (§23: a lost context is a stated failure, not a blank screen)
 * rather than being covered by a picture of a blog.
 */
const Z_INDEX = 75;

const VISIBILITY_EPSILON = 0.001;

/**
 * How long the element may stay at full cover with nobody dismissing it.
 *
 * ## Why a timer at all, when `App` already dismisses this
 *
 * Because the thing this covers is the frame loop stopping. Every other teardown
 * path in this feature runs from `MurciaExperience.update()`, and `update()` is not
 * called at all while the blog is open — so a dismissal driven from the loop would
 * be unreachable in exactly the situation it was written for. This timer belongs to
 * the DOM and runs whether or not React re-rendered, whether or not the chunk
 * loaded, and whether or not a frame is ever drawn again.
 *
 * ## Why six seconds
 *
 * It is not a timeout on the blog chunk. `blogApproach` fires its prefetch three
 * seconds before this element goes up, so a chunk that is going to arrive has
 * almost certainly arrived; cutting a slow one short would replace a still image
 * with a blank one, which is worse. This is a last resort against a state that is
 * already broken — the blog threw, or the effect that dismisses this never ran —
 * and in that state showing the visitor what is actually behind the cover is more
 * honest than holding a picture over it, because at least they can navigate.
 */
const FAILSAFE_MS = 6000;

export interface HandoffImage {
  /**
   * Replaces the image, and does not resolve until it has DECODED.
   *
   * The decode is the point, not the assignment. Without it the first frame of the
   * fade could land on an element the browser has not finished reading, which paints
   * nothing — a hole in the cover at the only moment there must not be one.
   */
  setSource(src: string): Promise<void>;
  /**
   * 0..1, written every frame. Clamped here so a curve change cannot leak.
   *
   * Reaching full cover arms the failsafe; dropping back below it disarms.
   */
  set(alpha: number): void;
  /**
   * Full cover now, asserted rather than ramped.
   *
   * For the two frames where the opacity must not be a function of anything: the
   * cut, where a hitch can step straight over the window the fade completes in, and
   * the start of a return, which has to be covered before the scene is unhidden.
   */
  cover(): void;
  dispose(): void;
}

export function createHandoffImage(src: string): HandoffImage {
  const element = document.createElement('img');
  // Greppable in devtools: a stray full-screen overlay is otherwise very hard to
  // attribute to the module that made it.
  element.dataset['blogOverlay'] = 'handoff';
  element.alt = '';
  element.src = src;
  element.style.cssText =
    `position:fixed;inset:0;z-index:${Z_INDEX};` +
    // LOAD-BEARING on the screenshot route, where the asset is one fixed capture
    // size and this is what fits it to the window — matching, exactly, the cover
    // fit `pageImage`'s screenshot branch performs on the canvas, top-left anchor
    // included. On the plate route the source is already at the viewport's own
    // aspect so this has nothing to do, and it is still set: a resize between the
    // last page image and the handoff would otherwise stretch the page rather than
    // crop it, and a stretched page is a visible seam where a cropped one is a
    // wrong-but-aligned one.
    'width:100%;height:100%;object-fit:cover;object-position:top left;' +
    // NO CSS TRANSITION. The opacity is written every frame from a curve; a
    // transition here would add a second easing on top of it and the fade would
    // arrive late at exactly the frame it must be complete.
    'opacity:0;pointer-events:none;visibility:hidden;';
  document.body.appendChild(element);

  let disposed = false;
  // -1 rather than 0, so the first `set(0)` is not skipped as a no-op.
  let current = -1;
  let failsafe: number | null = null;

  const disarm = (): void => {
    if (failsafe === null) return;
    window.clearTimeout(failsafe);
    failsafe = null;
  };

  const arm = (): void => {
    if (disposed || failsafe !== null) return;
    failsafe = window.setTimeout(() => {
      failsafe = null;
      console.warn(
        '[blogDisplay] the handoff cover was never dismissed; removing it so the page is reachable',
      );
      // Removed outright rather than faded: this path is reached only when
      // something upstream is already wrong, and a fade would be an animation
      // nothing is driving.
      element.remove();
    }, FAILSAFE_MS);
  };

  const write = (alpha: number): void => {
    const next = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
    // Cheap, and it matters: this runs every frame, and writing an unchanged
    // opacity still dirties style on some engines.
    if (next === current) return;
    current = next;
    element.style.opacity = String(next);
    // `visibility` rather than `display`, so the element keeps its compositing
    // layer and the first frame of the fade does not pay for a fresh composite.
    element.style.visibility = next > VISIBILITY_EPSILON ? 'visible' : 'hidden';

    if (next >= 1) arm();
    else disarm();
  };

  return {
    async setSource(next) {
      if (disposed) return;
      element.src = next;
      try {
        await element.decode();
      } catch {
        // Not fatal to the run — the approach still happens and the route still
        // changes. It only means the cover is a blank element, so say so rather
        // than letting it be a mystery later.
        console.warn('[blogDisplay] the handoff image did not decode; the cut will be bare');
      }
    },

    set(alpha) {
      if (disposed) return;
      write(alpha);
    },

    cover() {
      if (disposed) return;
      write(1);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      disarm();
      element.remove();
    },
  };
}
