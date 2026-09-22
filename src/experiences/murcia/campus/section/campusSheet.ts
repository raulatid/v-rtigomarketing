import { CAMPUS_DOCK_QUERY, campusCompactFraction } from '../campusMobileLayout';
import { attachSheetDrag } from '../../../../interaction/sheetDrag';

let nextSheetId = 0;

/** The existing campus overlay becomes a two-stop sheet on narrow/short layouts.
 * Only its grip captures a drag; the body keeps native vertical scrolling.
 * The grip is a bare pill (the CSS ::before); `labels` name it for assistive
 * tech only — the visible text came off on 2026-09-16 at the client's request. */
export function attachCampusSheet(layer: HTMLElement, body: HTMLElement, labels: {
  expand: string; collapse: string;
}) {
  const dock = window.matchMedia(CAMPUS_DOCK_QUERY);
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'campus-overlay__handle';
  body.id ||= `campus-sheet-body-${++nextSheetId}`;
  grip.setAttribute('aria-controls', body.id);
  layer.prepend(grip);
  layer.style.transition += ', height 300ms cubic-bezier(0.32, 0.72, 0, 1)';
  /**
   * The compact stop, published for the stylesheet and re-derived on every
   * resize. It was a constant set once; it is a function of the viewport now,
   * because the space the particle field cannot use belongs to the sheet
   * (`campusCompactFraction`), and how much that is depends on the screen.
   *
   * Still `dvh` rather than the pixels this has to hand: the unit is what lets
   * the sheet follow a collapsing URL bar between resize events, which is the
   * reason it was written in `dvh` in the first place.
   */
  const publishCompact = () => {
    const fraction = campusCompactFraction(window.innerWidth, window.innerHeight);
    layer.style.setProperty('--campus-sheet-compact', `${(fraction * 100).toFixed(3)}dvh`);
  };
  publishCompact();
  let expanded = false;
  // The whole copy fits inside the compact stop, so there is nothing to
  // expand: the sheet opens in full and the grip is withdrawn. Kept apart from
  // `expanded`, which stays the reader's own choice for the stops that need it.
  let fits = false;
  let fullHeight = 0;
  const compactHeight = () =>
    window.innerHeight * campusCompactFraction(window.innerWidth, window.innerHeight);
  const limit = () => Math.max(0, fullHeight - compactHeight());
  const sync = () => {
    const open = expanded || fits;
    layer.dataset.sheetStop = open ? 'expanded' : 'compact';
    grip.hidden = fits;
    grip.setAttribute('aria-expanded', String(open));
    grip.setAttribute('aria-label', open ? labels.collapse : labels.expand);
    body.tabIndex = !dock.matches ? 0 : -1;
  };
  /** Re-measures the copy against the compact stop. Call after the copy changes. */
  const fit = () => {
    if (dock.matches) {
      fits = false;
    } else {
      // Measure the full copy independently of the current stop. Preserve the
      // reading position because temporarily growing the body can clamp it.
      const scrollTop = body.scrollTop;
      layer.dataset.sheetMeasuring = 'true';
      fullHeight = layer.offsetHeight;
      layer.style.setProperty('--campus-sheet-full', `${fullHeight}px`);
      delete layer.dataset.sheetMeasuring;
      fits = fullHeight <= compactHeight() + 0.5;
      body.scrollTop = scrollTop;
    }
    sync();
  };
  const drag = attachSheetDrag({
    grip,
    enabled: () => !dock.matches && !fits,
    expanded: () => expanded,
    setExpanded(value) { expanded = value; sync(); },
    position: () => Math.max(0, fullHeight - layer.getBoundingClientRect().height),
    limit,
    render(position) {
      if (position === null) {
        layer.removeAttribute('data-sheet-dragging');
        layer.style.removeProperty('height');
      } else {
        layer.dataset.sheetDragging = 'true';
        layer.style.height = `${fullHeight - position}px`;
      }
    },
  });
  // The stop itself moves with the viewport now, so it is republished before
  // the copy is re-measured against it — `fit()` compares the sheet's full
  // height to `compactHeight()`, and the two have to be reading one number.
  const resize = () => { publishCompact(); drag.reset(); fit(); };
  window.addEventListener('resize', resize);
  dock.addEventListener('change', resize);
  let disposed = false;
  void document.fonts?.ready.then(() => { if (!disposed) fit(); });
  sync();
  return {
    fit,
    reset() { drag.reset(); expanded = false; sync(); },
    dispose() {
      disposed = true;
      drag.dispose();
      window.removeEventListener('resize', resize);
      dock.removeEventListener('change', resize);
      grip.remove();
    },
  };
}
