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
 * import in the app entry chunk, and that chunk is under a hard byte budget
 * asserted at build time (`ENTRY_BUDGET_BYTES` in vite.config.ts, which carries
 * its own history and the rule for raising it). Gating the panel here is what
 * keeps its bytes out of the number that budget is measured against.
 *
 * No percentage is quoted, on purpose. This comment used to carry one and it
 * was wrong twice — the entry moves with ordinary application growth, the
 * budget itself has been raised, and a reader deciding whether there is room
 * for one more static import needs today's figure rather than the figure that
 * happened to be true when someone typed it. `VERTIGO_SKIP_BUDGETS=1 npx vite
 * build` prints every chunk's real size, and an ordinary `npx vite build`
 * prints the entry against its budget.
 *
 * Declared with a `typeof` guard rather than read directly, because the
 * `checks/` harnesses bundle app modules for Node with esbuild, where the
 * define does not exist (the same hazard documented in cityDistrictBindings.ts).
 */
declare const __VERTIGO_ENV__: string | undefined

/**
 * True everywhere except a production deployment: local dev, `vite preview`,
 * and every Vercel Preview build.
 *
 * Preview keeps the tools deliberately. A preview deployment is where you
 * verify a change on real hardware, which is exactly when you want the FPS
 * meter and the bounds wireframe — and it is noindexed and unadvertised.
 *
 * One expression, deliberately. This used to read the define through an
 * `environment()` helper, and esbuild does not propagate a constant through a
 * call — the production bundle carried `function Tg(){return"production"}` and
 * every gated branch with it (SEC-11). Written inline, the right-hand side
 * folds to a literal and the minifier drops the branches.
 */
export const DEBUG_TOOLS_ENABLED =
  (typeof __VERTIGO_ENV__ === 'undefined' ? 'development' : __VERTIGO_ENV__) !== 'production'
