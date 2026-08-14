/**
 * Application-scoped configuration.
 *
 * Owns only what belongs to the shell: the renderer, debug tooling, and the
 * query-parameter overrides. Anything that differs between environments lives
 * in an EnvironmentConfig instead (see environmentConfig.ts).
 *
 * See docs/plans/002 Amendment A5 — this prototype becomes one of two
 * environments inside a single renderer / canvas / THREE.Scene, so a single
 * mutable global config would not survive the migration.
 */
export interface AppConfig {
  // Renderer settings used to live here (pixel-ratio cap, antialias, shadows).
  // They belong to whoever creates the WebGLRenderer, and that is now the
  // application's R3F Canvas (ADR 001), so they were removed rather than left
  // as options that silently do nothing.

  // The Draco decoder path left too, on 2026-08-14, and for the same reason
  // the renderer settings above did: it belongs to whoever owns the decoder,
  // and that is now `graphics/decoders.ts` — which owns one pool for the whole
  // application instead of one per consumer. All three call sites had passed
  // the identical string.

  // Debug
  statsEnabled: boolean;
  /**
   * The F3 diagnostics panel. Off by default: it was constructed
   * unconditionally and shown by default standalone, which also meant a
   * permanent window-level keydown listener in production.
   */
  debugOverlayEnabled: boolean;
  navigationDebugEnabled: boolean;
  showGridHelper: boolean;
  overlayUpdatesPerSecond: number;

  /** Overrides the active environment's model path when set via ?model=. */
  modelPathOverride: string | null;
}

export function createAppConfig(): AppConfig {
  return {
    // Off by default. Standalone this was on, which is right for a prototype
    // and wrong for a marketing site — ?stats=1 still turns it on.
    statsEnabled: false,
    debugOverlayEnabled: false,
    navigationDebugEnabled: false,
    showGridHelper: false,
    overlayUpdatesPerSecond: 4,

    modelPathOverride: null,
  };
}

/**
 * Applies query-parameter overrides for quick experimentation without editing
 * code. Returns a new object rather than mutating a shared singleton.
 *
 * Examples: ?debugNavigation=1  ?grid=1  ?stats=1  ?debug=1  ?model=/models/x.glb
 *
 * `enabled` is passed in rather than read from `import.meta.env` here, for the
 * reason documented in scene/cityDistrictBindings.ts: the `checks/` harnesses
 * bundle this module for Node with esbuild, where `import.meta.env` does not
 * exist. The shell decides; this only applies the decision.
 *
 * When disabled, EVERY parameter is ignored — including `?model=`. On a public
 * production site none of these should be reachable by anyone with a link.
 */
export function applyQueryOverrides(
  base: AppConfig,
  search: string,
  enabled: boolean,
): AppConfig {
  if (!enabled) return { ...base };

  const params = new URLSearchParams(search);
  const next: AppConfig = { ...base };

  const debugNav = params.get('debugNavigation');
  if (debugNav !== null) next.navigationDebugEnabled = isTruthy(debugNav);

  const grid = params.get('grid');
  if (grid !== null) next.showGridHelper = isTruthy(grid);

  const stats = params.get('stats');
  if (stats !== null) next.statsEnabled = isTruthy(stats);

  const debugOverlay = params.get('debug');
  if (debugOverlay !== null) next.debugOverlayEnabled = isTruthy(debugOverlay);

  // Same-origin absolute paths only. This value is handed straight to
  // GLTFLoader, so accepting an arbitrary URL would let any link fetch and
  // execute a third-party asset in the page's context. A single leading slash
  // rules out both absolute URLs and protocol-relative "//host/..." ones.
  const model = params.get('model');
  if (model !== null && /^\/(?!\/)/.test(model)) {
    next.modelPathOverride = model;
  } else if (model !== null && model.length > 0) {
    console.warn(`[murcia] ignoring ?model= "${model}" — must be a root-relative path.`);
  }

  return next;
}

function isTruthy(value: string): boolean {
  return value === '1' || value === 'true';
}
