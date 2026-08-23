import { defineCliConfig } from 'sanity/cli'

/**
 * Project and dataset are supplied by `sanity init` / `sanity.cli` locally
 * rather than hardcoded, so this file is the same in every checkout. The
 * application build reads its own SANITY_PROJECT_ID and SANITY_DATASET from the
 * environment and shares nothing with this package.
 */
export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
})
