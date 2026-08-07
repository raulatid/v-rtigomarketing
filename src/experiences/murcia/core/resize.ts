import * as THREE from 'three';

export interface ViewportSize {
  width: number;
  height: number;
  aspect: number;
}

/**
 * Observes the container and reports size changes.
 *
 * Uses ResizeObserver rather than the window `resize` event: on iOS the URL bar
 * collapsing changes the viewport without firing `resize` reliably, and Phase 4
 * needs a dependable signal because the navigation bounds are recomputed from
 * the viewport footprint.
 *
 * `orientationchange` is also observed, because the resulting layout change can
 * settle after the observer has already fired.
 */
export function attachViewportObserver(
  container: HTMLElement,
  onResize: (size: ViewportSize) => void,
): () => void {
  let lastWidth = 0;
  let lastHeight = 0;

  const emit = (): void => {
    const width = Math.max(1, Math.round(container.clientWidth));
    const height = Math.max(1, Math.round(container.clientHeight));
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    onResize({ width, height, aspect: width / height });
  };

  const observer = new ResizeObserver(emit);
  observer.observe(container);
  window.addEventListener('orientationchange', emit);

  emit();

  return () => {
    observer.disconnect();
    window.removeEventListener('orientationchange', emit);
  };
}

/** Applies a viewport size to the renderer and camera. */
export function applyViewportSize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  size: ViewportSize,
): void {
  camera.aspect = size.aspect;
  camera.updateProjectionMatrix();
  // updateStyle must stay on: createRenderer's initial setSize writes inline
  // width/height, and inline styles beat the stylesheet. Passing false here
  // would leave the canvas pinned at its first size while the drawing buffer
  // resized — which also makes getBoundingClientRect lie to the drag
  // controller's pointer projection.
  renderer.setSize(size.width, size.height, true);
}
