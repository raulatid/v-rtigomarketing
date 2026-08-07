/**
 * Whether this browser can give us a WebGL context at all.
 *
 * Checked before mounting the Canvas rather than left to `SceneErrorBoundary`,
 * so the common case is a deliberate answer instead of a caught exception: an
 * unsupported device, WebGL disabled in settings, or a headless/blocked
 * environment. The boundary still covers everything else — a context lost after
 * creation, a driver reset, a throw inside a scene component.
 *
 * The probe canvas is thrown away immediately; contexts are a limited resource
 * and this one exists only to answer the question. The result is cached because
 * repeatedly creating and dropping contexts is itself a way to exhaust them.
 *
 * `webgl2` specifically: three 0.174's WebGLRenderer requires WebGL 2, so
 * probing for `webgl` would report support the renderer cannot actually use.
 */
let cached: boolean | null = null

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    cached = canvas.getContext('webgl2') !== null
  } catch {
    // Some browsers throw rather than return null when the context is blocked.
    cached = false
  }
  return cached
}
