import { loadEnv } from 'vite'
import { verifyPublication } from './publicationHygiene'
import { buildEnvironmentProblem, resolveBuildEnvironment } from './buildEnvironment'

// `.env` is loaded for the secret scan, which needs every secret's value. The
// build environment is not taken from it: it is the one vite.config.ts used.
const problem = buildEnvironmentProblem(process.env, process.cwd())
if (problem) throw new Error('[publication] ' + problem)
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const production = resolveBuildEnvironment(process.env).value === 'production'
verifyPublication('dist', env, production)
console.log('[publication] final output verified')
