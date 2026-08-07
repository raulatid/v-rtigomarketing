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
  // Renderer
  pixelRatioCap: number;
  antialiasEnabled: boolean;
  shadowsEnabled: boolean;

  /**
   * Path (served from /public) to the Draco decoder. Shell-scoped: the loader
   * stack is shared infrastructure created once for all environments
   * (docs/plans/002 Amendment A7).
   */
  dracoDecoderPath: string;

  // Debug
  statsEnabled: boolean;
  navigationDebugEnabled: boolean;
  showGridHelper: boolean;
  overlayUpdatesPerSecond: number;

  /** Overrides the active environment's model path when set via ?model=. */
  modelPathOverride: string | null;
}

export function createAppConfig(): AppConfig {
  return {
    pixelRatioCap: 2,
    antialiasEnabled: true,
    shadowsEnabled: false,
    dracoDecoderPath: 'draco/',

    statsEnabled: true,
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
 * Examples: ?debugNavigation=1  ?dpr=1.5  ?grid=1  ?shadows=1  ?model=...
 */
export function applyQueryOverrides(base: AppConfig, search: string): AppConfig {
  const params = new URLSearchParams(search);
  const next: AppConfig = { ...base };

  const debugNav = params.get('debugNavigation');
  if (debugNav !== null) next.navigationDebugEnabled = isTruthy(debugNav);

  const grid = params.get('grid');
  if (grid !== null) next.showGridHelper = isTruthy(grid);

  const shadows = params.get('shadows');
  if (shadows !== null) next.shadowsEnabled = isTruthy(shadows);

  const stats = params.get('stats');
  if (stats !== null) next.statsEnabled = isTruthy(stats);

  const dpr = params.get('dpr');
  if (dpr !== null) {
    const value = Number(dpr);
    if (Number.isFinite(value) && value > 0) next.pixelRatioCap = value;
  }

  const model = params.get('model');
  if (model !== null && model.length > 0) next.modelPathOverride = model;

  return next;
}

function isTruthy(value: string): boolean {
  return value === '1' || value === 'true';
}
