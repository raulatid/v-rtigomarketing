import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Developer check using the workspace's existing test runner, separate from the website's CI graph.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {environment: 'node', include: ['tests/**/*.test.ts']},
})
