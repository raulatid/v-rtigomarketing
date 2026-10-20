import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

/**
 * Where a build is going, read the same way by every step that asks.
 *
 * From the PROCESS environment only: Vercel's system variables, or a variable
 * exported in the shell for a local rehearsal. Never from a `.env` file.
 * `vite build` cannot see `.env` when its config is evaluated, while
 * `content:build` (`node --env-file-if-exists`) and `check:publication`
 * (`loadEnv`) can, so a value written there split one build into two
 * environments: a development bundle verified as production. A `.env` that
 * names either variable is therefore refused rather than half-applied.
 */

/** The only values Vercel sets. Anything else is a hand-edit or a typo. */
export const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development']

const NAMES = ['VERCEL_ENV', 'VITE_VERCEL_ENV'] as const

/** The files Vite loads for a production build, `.env` (the one node loads) first. */
const DOTENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local']

export interface BuildEnvironment {
  /** Which variable decided it, or `default` when neither is set. */
  source: 'VERCEL_ENV' | 'VITE_VERCEL_ENV' | 'default'
  /** Trimmed, so a value pasted from a dashboard with a trailing space still reads. */
  value: string
}

/** `VERCEL_ENV`, else `VITE_VERCEL_ENV`, else development. Not validated: see {@link buildEnvironmentProblem}. */
export function resolveBuildEnvironment(env: Record<string, string | undefined>): BuildEnvironment {
  for (const name of NAMES) {
    const value = (env[name] ?? '').trim()
    if (value) return { source: name, value }
  }
  return { source: 'default', value: 'development' }
}

/**
 * Why this build must not proceed, or null.
 *
 * Two refusals: a `.env` file that names the build environment (see above), and
 * a value outside the three Vercel uses — every production rule is spelled
 * `=== 'production'`, so `Production` or `prod` would read as "not production".
 */
export function buildEnvironmentProblem(
  env: Record<string, string | undefined>,
  dir: string,
): string | null {
  for (const file of DOTENV_FILES) {
    const full = path.join(dir, file)
    if (!fs.existsSync(full)) continue
    const parsed = parseEnv(fs.readFileSync(full, 'utf8'))
    const named = NAMES.filter((name) => (parsed[name] ?? '').trim() !== '')
    if (named.length > 0) {
      return (
        `${file} sets ${named.join(' and ')}. The build environment is read from the process ` +
        'environment only, so steps disagreed about it; export it in the shell instead ' +
        '(PowerShell: $env:VERCEL_ENV = "production").'
      )
    }
  }
  const { source, value } = resolveBuildEnvironment(env)
  if (!VERCEL_ENVIRONMENTS.includes(value)) {
    return (
      `${source}="${value}" is not one of ${VERCEL_ENVIRONMENTS.join(', ')}. ` +
      'An unrecognised value would silently mean "not production".'
    )
  }
  return null
}
