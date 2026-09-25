/**
 * Whether the vantage endpoints may answer, and against what — decided once,
 * as a value, the way `server/config.ts` decides whether mail may be sent.
 *
 * ── Where the solution lives ──
 *
 * In the environment, never in the repository and never in the browser. The
 * browser only reports where its camera rests; `VIEW_SOLUTION` is what that
 * report is compared against, and it is set in the Vercel project like any
 * other secret. `capture()` in the authoring overlay prints a stage ready to
 * paste into it.
 *
 * ── Failing closed ──
 *
 * Every refusal here CLOSES the endpoints rather than opening them. In
 * production a missing secret, a missing solution or a missing durable store
 * is a failure — a winner decided against an in-memory store that a cold start
 * forgets would be a prize awarded twice.
 */

/**
 * The switch to turn the whole thing off by hand. False answers every request
 * with a decoy and touches nothing. Once someone has won, the endpoints close
 * by themselves (see `WINNER_KEY`); this is for retiring the code afterwards.
 */
export const VIEW_OPEN = true

export type Vec3 = [number, number, number]

export interface ViewTolerance {
  /** World units around the stage's camera position. */
  positionUnits: number
  /** Between the camera's view direction and the stage's. */
  angleDegrees: number
  /** |fov - stage fov|. */
  fovDegrees: number
}

export interface ViewStage {
  position: Vec3
  /** Normalised at read time. */
  forward: Vec3
  fov: number
  tolerance: ViewTolerance
}

export type ViewStoreConfig = { kind: 'upstash'; url: string; token: string } | { kind: 'memory' }

export interface ViewConfig {
  /** HMAC key for progress tokens and hashed addresses. Never logged. */
  secret: string
  /** In order. The last one is the final stage — the one a claim needs. */
  stages: ViewStage[]
  store: ViewStoreConfig
  perIpPerHour: number
  globalPerMinute: number
  timeoutMs: number
  /** Authoring only: responses carry the verdict. Refused in production. */
  debug: boolean
}

export type ViewConfigResult = { ok: true; config: ViewConfig } | { ok: false; message: string }

export type ViewEnv = Record<string, string | undefined>

/** Shorter than this is a key that can be guessed offline from one token. */
export const SECRET_MIN_LENGTH = 32

const DEFAULT_PER_IP_PER_HOUR = 60
/**
 * The real bound on a brute force. ~10⁷ distinguishable poses at the shipped
 * tolerances; at 30 a minute that is the better part of a year, from every
 * address at once. A flood also silences legitimate visitors for its duration,
 * which is the accepted price.
 */
const DEFAULT_GLOBAL_PER_MINUTE = 30
const DEFAULT_TIMEOUT_MS = 3_000

const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development']

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

function fail(message: string): ViewConfigResult {
  return { ok: false, message }
}

function positiveNumber(env: ViewEnv, name: string, fallback: number): number | string {
  const raw = clean(env[name])
  if (raw.length === 0) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return name + ' must be a positive number'
  return parsed
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Strict: a stage that does not parse is a failure, not a stage skipped. A
 * typo that silently dropped the final stage would move the prize to whatever
 * stage came before it.
 */
export function parseStages(raw: string): ViewStage[] | string {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return 'VIEW_SOLUTION is not valid JSON'
  }
  if (!Array.isArray(value) || value.length === 0) {
    return 'VIEW_SOLUTION must be a non-empty array of stages'
  }
  const stages: ViewStage[] = []
  for (let i = 0; i < value.length; i++) {
    const stage = value[i] as Record<string, unknown> | null
    const tolerance = (stage?.tolerance ?? null) as Record<string, unknown> | null
    if (
      stage === null ||
      typeof stage !== 'object' ||
      !isVec3(stage.position) ||
      !isVec3(stage.forward) ||
      !isPositive(stage.fov) ||
      tolerance === null ||
      !isPositive(tolerance.positionUnits) ||
      !isPositive(tolerance.angleDegrees) ||
      !isPositive(tolerance.fovDegrees)
    ) {
      return 'VIEW_SOLUTION stage ' + (i + 1) + ' is malformed'
    }
    const [fx, fy, fz] = stage.forward
    const length = Math.hypot(fx, fy, fz)
    if (!(length > 0)) return 'VIEW_SOLUTION stage ' + (i + 1) + ' has a zero forward'
    stages.push({
      position: [...stage.position] as Vec3,
      forward: [fx / length, fy / length, fz / length],
      fov: stage.fov,
      tolerance: {
        positionUnits: tolerance.positionUnits,
        angleDegrees: tolerance.angleDegrees,
        fovDegrees: tolerance.fovDegrees,
      },
    })
  }
  return stages
}

export function readViewConfig(env: ViewEnv): ViewConfigResult {
  // SEC-9 and the exact-value rule, mirrored from `server/config.ts`.
  if (clean(env.VERCEL).length > 0 && clean(env.VERCEL_ENV).length === 0) {
    return fail('VERCEL is set but VERCEL_ENV is not — refusing to guess the environment')
  }
  const environment = clean(env.VERCEL_ENV)
  if (environment.length > 0 && !VERCEL_ENVIRONMENTS.includes(environment)) {
    return fail('VERCEL_ENV must be one of ' + VERCEL_ENVIRONMENTS.join(', '))
  }
  const isProduction = environment === 'production'

  const secret = clean(env.VIEW_SECRET)
  if (secret.length < SECRET_MIN_LENGTH) {
    return fail('VIEW_SECRET must be at least ' + SECRET_MIN_LENGTH + ' characters')
  }

  const rawSolution = clean(env.VIEW_SOLUTION)
  if (rawSolution.length === 0) return fail('VIEW_SOLUTION is missing')
  const stages = parseStages(rawSolution)
  if (typeof stages === 'string') return fail(stages)

  const url = clean(env.KV_REST_API_URL)
  const token = clean(env.KV_REST_API_TOKEN)
  let store: ViewStoreConfig
  if (url.length > 0 && token.length > 0) {
    if (!url.startsWith('https://')) return fail('KV_REST_API_URL must be https')
    store = { kind: 'upstash', url: url.replace(/\/+$/, ''), token }
  } else if (url.length > 0 || token.length > 0) {
    return fail('KV_REST_API_URL and KV_REST_API_TOKEN must be set together')
  } else if (isProduction) {
    return fail('a durable store is required in production — set the KV_REST_API_URL / KV_REST_API_TOKEN pair')
  } else {
    store = { kind: 'memory' }
  }

  const perIpPerHour = positiveNumber(env, 'VIEW_RATE_PER_HOUR', DEFAULT_PER_IP_PER_HOUR)
  if (typeof perIpPerHour === 'string') return fail(perIpPerHour)
  const globalPerMinute = positiveNumber(env, 'VIEW_RATE_GLOBAL_PER_MINUTE', DEFAULT_GLOBAL_PER_MINUTE)
  if (typeof globalPerMinute === 'string') return fail(globalPerMinute)
  const timeoutMs = positiveNumber(env, 'VIEW_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  if (typeof timeoutMs === 'string') return fail(timeoutMs)

  const debugRequested = clean(env.VIEW_DEBUG).length > 0 && clean(env.VIEW_DEBUG) !== '0'
  if (debugRequested && isProduction) {
    return fail('VIEW_DEBUG is not allowed in production — it answers with the verdict')
  }

  return {
    ok: true,
    config: {
      secret,
      stages,
      store,
      perIpPerHour,
      globalPerMinute,
      timeoutMs,
      debug: debugRequested,
    },
  }
}
