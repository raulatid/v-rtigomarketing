/**
 * What this build is allowed to do, decided at build time.
 *
 * The debug affordances in this repo are genuinely useful — the `/debug` tuning
 * console is how the intro was timed, and `?stats=1` / `?debugNavigation=1` are
 * how the city's feel was measured. They are also all reachable by any visitor,
 * on a public marketing site, which is a different matter. This is the seam
 * that keeps the first without the second.
 *
 * `__VERTIGO_ENV__` is replaced by vite.config.ts with the literal build
 * environment, so the whole `/debug` panel is dead code in production and the
 * minifier drops it. That is worth having on its own: the panel is a static
 * import in the app entry chunk, which is at ~96% of its hard budget.
 *
 * Re-measure rather than trusting that number — it said 94% for long enough to
 * be wrong by 3 points, which mattered when the question was how many case
 * studies could be added before the build failed. `VERTIGO_SKIP_BUDGETS=1 npx
 * vite build` prints every chunk's real size.
 *
 * Declared with a `typeof` guard rather than read directly, because the
 * `checks/` harnesses bundle app modules for Node with esbuild, where the
 * define does not exist (the same hazard documented in cityDistrictBindings.ts).
 */
declare const __VERTIGO_ENV__: string | undefined

function environment(): string {
  return typeof __VERTIGO_ENV__ === 'undefined' ? 'development' : __VERTIGO_ENV__
}

/**
 * True everywhere except a production deployment: local dev, `vite preview`,
 * and every Vercel Preview build.
 *
 * Preview keeps the tools deliberately. A preview deployment is where you
 * verify a change on real hardware, which is exactly when you want the FPS
 * meter and the bounds wireframe — and it is noindexed and unadvertised.
 */
export const DEBUG_TOOLS_ENABLED = environment() !== 'production'

// A `BUILD_ENV = environment()` export lived here for "diagnostics" and had no
// readers. `environment()` is still the single source of truth for the flag
// above; re-export it if something ever actually needs the string.
