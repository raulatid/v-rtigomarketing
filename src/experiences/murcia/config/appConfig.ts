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
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags';

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
  /**
   * A COMPILE-TIME gate in front of the runtime one, and the pair is not
   * redundant. `enabled` is what the shell decides, so it is a value and cannot
   * be folded; DEBUG_TOOLS_ENABLED is a literal, so Rollup removes everything
   * below it from a production build. Measured on the emitted chunk: without it
   * the whole parser shipped to every visitor, inert, behind a boolean that is
   * always false there.
   *
   * The `checks/` harnesses bundle this module for Node with esbuild, where the
   * define does not exist — buildFlags.ts reads it behind a `typeof` guard and
   * resolves to development, so they keep the overrides they rely on. That guard
   * is the reason this import is safe here at all.
   */
  if (!DEBUG_TOOLS_ENABLED || !enabled) return { ...base };

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

  // Same-origin paths under /models/ only. This value is handed straight to
  // GLTFLoader, so accepting an arbitrary URL would let any link fetch and
  // decode a third-party asset in the page's context.
  const model = params.get('model');
  if (model !== null) {
    const path = sameOriginModelPath(model);
    if (path !== null) next.modelPathOverride = path;
    else if (model.length > 0) {
      console.warn(`[murcia] ignoring ?model= "${model}" — must be a path under /models/.`);
    }
  }

  return next;
}

/**
 * The normalised path, or null if the value would leave the origin.
 *
 * Parsed against a placeholder origin rather than pattern-matched: the WHATWG
 * parser treats a backslash as a slash, so `/\evil.example/x.glb` passed the
 * old "single leading slash" regex and resolved off-origin (SEC-1). Resolving
 * relative to a fixed base and comparing `origin` catches that, `//host`,
 * absolute URLs and percent-encoded variants at once; the `/models/` prefix
 * then rules out `..` traversal into anything else the site serves.
 */
function sameOriginModelPath(value: string): string | null {
  const base = 'https://model.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  if (!url.pathname.startsWith('/models/')) return null;
  // A percent-encoded separator survives normalisation: `..%2f` is not resolved
  // away the way `../` is, so `/models/..%2fassets/x.glb` clears the prefix
  // check above and becomes a traversal on any host that decodes it before
  // routing. Refuse the encoding rather than guess which host does.
  if (/%(2f|5c)/i.test(url.pathname)) return null;
  return url.pathname;
}

function isTruthy(value: string): boolean {
  return value === '1' || value === 'true';
}
