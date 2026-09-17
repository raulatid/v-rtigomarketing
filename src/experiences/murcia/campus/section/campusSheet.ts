import { CAMPUS_COMPACT_FRACTION, CAMPUS_DOCK_QUERY } from '../campusMobileLayout';
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
  layer.style.transition += ', transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
  layer.style.setProperty('--campus-sheet-compact', `${CAMPUS_COMPACT_FRACTION * 100}dvh`);
  let expanded = false;
  // The whole copy fits inside the compact stop, so there is nothing to
  // expand: the sheet opens in full and the grip is withdrawn. Kept apart from
  // `expanded`, which stays the reader's own choice for the stops that need it.
  let fits = false;
  const compactHeight = () => window.innerHeight * CAMPUS_COMPACT_FRACTION;
  const limit = () => Math.max(0, layer.offsetHeight - compactHeight());
  const sync = () => {
    const open = expanded || fits;
    layer.dataset.sheetStop = open ? 'expanded' : 'compact';
    grip.hidden = fits;
    grip.setAttribute('aria-expanded', String(open));
    grip.setAttribute('aria-label', open ? labels.collapse : labels.expand);
    body.tabIndex = !dock.matches && open ? 0 : -1;
    if (!open) body.scrollTop = 0;
  };
  /** Re-measures the copy against the compact stop. Call after the copy changes. */
  const fit = () => {
    if (dock.matches) {
      fits = false;
    } else {
      // Measured under the stylesheet's measuring state, which lifts the
      // compact clamps WITHOUT touching the transform — flushing a changed
      // transform would start a transition back from wherever it landed.
      layer.dataset.sheetMeasuring = 'true';
      const full = layer.offsetHeight;
      delete layer.dataset.sheetMeasuring;
      fits = full <= compactHeight() + 0.5;
    }
    sync();
  };
  const drag = attachSheetDrag({
    grip,
    enabled: () => !dock.matches && !fits,
    expanded: () => expanded,
    setExpanded(value) { expanded = value; sync(); },
    position: () => new DOMMatrixReadOnly(getComputedStyle(layer).transform).m42,
    limit,
    render(position) {
      if (position === null) {
        layer.removeAttribute('data-sheet-dragging');
        layer.style.removeProperty('transform');
      } else {
        layer.dataset.sheetDragging = 'true';
        layer.style.transform = `translateY(${position}px)`;
      }
    },
  });
  const resize = () => { drag.reset(); fit(); };
  window.addEventListener('resize', resize);
  dock.addEventListener('change', resize);
  sync();
  return {
    fit,
    reset() { drag.reset(); expanded = false; sync(); },
    dispose() {
      drag.dispose();
      window.removeEventListener('resize', resize);
      dock.removeEventListener('change', resize);
      grip.remove();
    },
  };
}
