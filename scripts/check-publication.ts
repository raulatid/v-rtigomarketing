import { loadEnv } from 'vite'
import { verifyPublication } from './publicationHygiene'

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env }
const production = (env.VERCEL_ENV ?? env.VITE_VERCEL_ENV ?? 'development').trim() === 'production'
verifyPublication('dist', env, production)
console.log('[publication] final output verified')
