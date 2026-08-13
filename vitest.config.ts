import { defineConfig } from 'vitest/config'
import glsl from 'vite-plugin-glsl'

/**
 * The unit tier. Deliberately a separate config rather than a `test` block bolted
 * onto `vite.config.ts`.
 *
 * That file cannot be reused: `introEntry()` rewrites `build.rollupOptions.input`
 * from its `config()` hook, and `seoAssets()` / `assertChunkBudgets()` are
 * `apply: 'build'` plugins that emit robots.txt and abort on a chunk budget.
 * None of that has any meaning for a test run, and the input rewrite is actively
 * wrong for one.
 *
 * Three things are carried across, and only three — see plan 000 section 1.
 *
 * Vitest is pinned to 3.x on purpose. Vitest 4 ships its own Vite (8.x) rather
 * than using the project's, which would put the test tier on a different bundler
 * from the build — the "Vite pinned at 5" debt in PROJECT_MEMORY exists precisely
 * so a bundler bump gets its own verification pass instead of arriving as a
 * ride-along. `npm ls vite` must keep reporting a single deduped 5.x.
 */
export default defineConfig({
  // Without this, any module that imports a .glsl file fails to resolve — which
  // is most of src/space and all of src/shaders. Same plugin and same version as
  // the app build, so a shader import resolves the way it does in production.
  plugins: [glsl()],

  define: {
    // Fidelity, not a requirement: buildFlags.ts reads this behind a `typeof`
    // guard so the esbuild harness bundles work without it. Setting it means the
    // runner and a dev build agree on DEBUG_TOOLS_ENABLED rather than agreeing by
    // coincidence. Do not remove the guard on the strength of this line.
    __VERTIGO_ENV__: JSON.stringify('development'),
  },

  test: {
    // Node by default, jsdom opted into per file with `// @vitest-environment jsdom`.
    //
    // A global jsdom would hand every module a `window` and hide an accidental
    // DOM dependency in the boot chunk — the one property vite.config.ts asserts
    // on the emitted bundle, and the most expensive thing in this repo to break.
    environment: 'node',

    // The dividing rule from plan 000, made mechanical: a unit test lives beside
    // its module under src/ and needs no scene. checks/ is bundled by esbuild and
    // run by node, and must never be picked up here.
    include: ['src/**/*.test.ts'],

    // No globals. `noUnusedLocals` is on and this repo has no ambient-global
    // habit, so `describe`/`it`/`expect` are imported like anything else.
    globals: false,

    coverage: {
      provider: 'v8',
      // SCOPED, deliberately, to the modules the unit tier is responsible for.
      //
      // A repository-wide percentage would be dominated by the WebGL surface,
      // which is untestable by design here — every renderer, R3F layer and
      // shader wrapper. That number would end up either set so low it means
      // nothing, or high enough to force tests written to raise it. Both are
      // worse than no number.
      //
      // Anything measured by a harness in checks/ is also absent: those run in
      // a separate esbuild bundle under plain node, so nothing they execute is
      // instrumented here. Their coverage is the assertion count, not a
      // percentage.
      include: [
        'src/sceneVisibility.ts',
        'src/sequenceState.ts',
        'src/app/warpTransition.ts',
        'src/utils/easing.ts',
        'src/utils/fibonacciSphere.ts',
        'src/intro-draw/bootState.ts',
        'src/intro-draw/playhead.ts',
        'src/orbit-system/geoUtils.ts',
        'src/experiences/murcia/navigation/navigationBounds.ts',
        'src/experiences/murcia/camera/cameraFraming.ts',
        'src/experiences/murcia/content/districts.ts',
      ],
      thresholds: {
        // Set at what the suite actually achieves, rounded down. The point of a
        // threshold is to notice a REGRESSION — a module added to the list above
        // with no tests, or coverage dropping when someone deletes a case. It is
        // not a target to climb.
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
})
