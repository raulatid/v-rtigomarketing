import { defineCliConfig } from 'sanity/cli'

/**
 * Project and dataset come from `sanity-studio/.env` rather than being
 * hardcoded, so this file is the same in every checkout.
 *
 * ── Two .env files, two prefixes, on purpose ──
 * The Sanity CLI loads `.env` from THIS directory (via Vite's `loadEnv`) and
 * exposes only `SANITY_STUDIO_`-prefixed variables. The repository root has its
 * own `.env` holding `SANITY_PROJECT_ID` / `SANITY_DATASET` for the content
 * build, and the two share nothing.
 *
 * That is not duplication for its own sake: the `SANITY_STUDIO_` prefix is what
 * marks a value as safe to compile into the Studio's browser bundle. The
 * content build's variables — which may include a read token — must never carry
 * a prefix that would put them there.
 */
export default defineCliConfig({
  // Preview components reuse the public site's presentational React components.
  vite: (config) => ({...config, resolve: {...config.resolve, dedupe: ['react', 'react-dom']}}),
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
  // The hosted Studio this repository deploys to (`npm run deploy`). Printed by
  // the CLI after the first deploy so later ones do not prompt for it. A public
  // identifier — it names the app, it does not grant access — so it lives in
  // source rather than in .env.
  deployment: {
    appId: 'jzjqwjibbxtjbjv0uvrp3ny6',
  },
})
