import { defineConfig, devices } from '@playwright/test'

/**
 * The smoke tier. A LOCAL command, deliberately not part of `npm run build`.
 *
 * Vercel's build container would have to download Chromium on every deploy and
 * has no server to point at, so this cannot be a deploy gate without making
 * every deploy slower and more fragile. If CI is ever added, this is the first
 * thing that moves into it — see plan 000 section 6.
 *
 * Run against `vite preview`, never the dev server: the things worth smoke
 * testing here (the SEO branch, the minified boot chunk, real asset paths, the
 * production define) only exist in a built artifact. PROJECT_MEMORY records
 * three failure classes that "only the production path can tell you".
 *
 * Chromium only, and that is a stated limitation rather than an oversight:
 * WebKit and Firefox are not installed on this machine, and Safari on iOS is
 * where the KTX2 transcoder and compileAsync are most likely to differ. No code
 * change can close that gap.
 */
export default defineConfig({
  testDir: './e2e',
  // Long, because the intro is real: it waits on 2.43 MB of Earth textures and
  // will not release into an unready scene. A short timeout here would be
  // testing the network rather than the boot sequence.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  // Serial. Every spec drives a WebGL context, and parallel contexts on one
  // machine compete for the GPU and produce timing failures that look like
  // real ones.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Every spec starts with a cookie choice already stored, so the consent
    // banner (ConsentBanner.tsx, mounted at phase 'site') never sits under a
    // coordinate click, in a screenshot baseline or over the blog building.
    // The one spec that wants to see it, consent.spec.ts, clears this with its
    // own `test.use`. Project-level `use` blocks merge with this one, so all
    // three projects are seeded; specs that open their own contexts
    // (degraded.spec.ts) are not, and assert nothing the banner touches.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [
            {
              name: 'vertigo:consent',
              value: JSON.stringify({ v: 3, preferences: false, analytics: false, at: '2026-01-01T00:00:00.000Z' }),
            },
          ],
        },
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      // The mobile spec is the mobile projects' business. The desktop
      // screenshot baselines are sized to 1600x900 and would fail on anything
      // else, so the split is by file rather than by skip-inside-test.
      testIgnore: '**/mobile.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // A fixed viewport, because the screenshot baselines are sized to it
        // and because the ground-footprint behaviour this project cares about
        // is aspect-dependent.
        viewport: { width: 1600, height: 900 },
      },
    },
    // Mobile, and the device profile is the point rather than the viewport.
    //
    // PROJECT_MEMORY, "Things that will bite you again": a context with
    // `hasTouch: true` still reports `hover: hover`, so every `(hover: none)`
    // and `(pointer: coarse)` rule stays inert and a touch bug looks fixed when
    // it is not. A real descriptor is what makes those rules apply — and this
    // project now has a lot of behaviour behind them.
    //
    // BOTH OF THESE ARE CHROMIUM. `devices['iPhone 15']` defaults to WebKit,
    // which is not installed here; the entry below borrows its geometry
    // (viewport, DPR 3, touch) on the engine that is. That is emulation of a
    // SHAPE, not of a browser: it exercises layout, breakpoints, touch
    // dispatch and DPR, and it proves nothing whatsoever about Safari. The iOS
    // audit's device matrix is the thing that closes that gap, and no config
    // here can.
    {
      name: 'mobile-android',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-ios-shaped',
      testMatch: '**/mobile.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    // Locally, reusing a preview server you already have open is the whole
    // difference between a 5-second run and a 40-second one. On CI it is a
    // trap: there is nothing legitimate already listening on 4173, so a hit
    // means a stale process from an earlier job, and the suite would silently
    // grade an artifact that is no longer on disk. `npm run e2e` rebuilds via
    // `pree2e` either way, so the local reuse is of a server serving a `dist/`
    // that was just regenerated.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
