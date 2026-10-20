import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildEnvironmentProblem, resolveBuildEnvironment } from './buildEnvironment'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-env-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('resolveBuildEnvironment', () => {
  it('prefers VERCEL_ENV, then VITE_VERCEL_ENV, then development', () => {
    expect(resolveBuildEnvironment({ VERCEL_ENV: 'preview', VITE_VERCEL_ENV: 'production' }).value).toBe('preview')
    expect(resolveBuildEnvironment({ VITE_VERCEL_ENV: ' production ' })).toEqual({
      source: 'VITE_VERCEL_ENV',
      value: 'production',
    })
    expect(resolveBuildEnvironment({})).toEqual({ source: 'default', value: 'development' })
  })
})

describe('buildEnvironmentProblem', () => {
  it('accepts the three Vercel values from the process environment', () => {
    for (const value of ['production', 'preview', 'development']) {
      expect(buildEnvironmentProblem({ VERCEL_ENV: value }, dir)).toBeNull()
    }
  })

  it('refuses an unrecognised value', () => {
    expect(buildEnvironmentProblem({ VERCEL_ENV: 'Production' }, dir)).toMatch(/not one of/)
  })

  it('refuses a build environment written in a .env file, even when the shell agrees', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_DATASET=production\nVITE_VERCEL_ENV=production\n')
    expect(buildEnvironmentProblem({ VITE_VERCEL_ENV: 'production' }, dir)).toMatch(/\.env sets VITE_VERCEL_ENV/)
  })

  it('checks the mode files Vite loads too', () => {
    fs.writeFileSync(path.join(dir, '.env.production.local'), 'VERCEL_ENV=production\n')
    expect(buildEnvironmentProblem({}, dir)).toMatch(/\.env\.production\.local sets VERCEL_ENV/)
  })

  it('lets an empty entry through, as copied from .env.example', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'VITE_VERCEL_ENV=\nSANITY_DATASET=production\n')
    expect(buildEnvironmentProblem({}, dir)).toBeNull()
  })
})
