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
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A fixed viewport, because the screenshot baselines are sized to it
        // and because the ground-footprint behaviour this project cares about
        // is aspect-dependent.
        viewport: { width: 1600, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
