/**
 * Viewport size, as the Murcia experience consumes it.
 *
 * This module used to also export `attachViewportObserver` (a ResizeObserver
 * wrapper) and `applyViewportSize`. Both were superseded by
 * MurciaExperience.setViewport, which is driven by R3F's own size reporting, and
 * neither had a caller left — the whole module is imported type-only. They are
 * gone rather than kept "just in case": `applyViewportSize` also forced a value
 * import of three into a file that otherwise contributes nothing at runtime.
 */
export interface ViewportSize {
  width: number;
  height: number;
  aspect: number;
}
