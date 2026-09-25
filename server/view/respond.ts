/**
 * `POST /api/view` and `POST /api/claim`: a Web `Request` in, a Web `Response`
 * out, like `server/endpoint.ts`, so both are unit-testable with `new Request`
 * and servable by the dev server's middleware.
 *
 * ── /api/view ──
 *
 * The browser reports where its camera came to rest, with the last token it
 * was given. The token is the progress: its stage says which vantage point is
 * next. A rest at that point earns the next stage; any other rest earns the
 * same stage re-issued, so progress is never lost to a miss; no progress earns
 * a decoy. Every answer is `200 { t }` with a 44-character `t`.
 *
 * ── /api/claim ──
 *
 * A token of the FINAL stage plus an email. The first valid claim wins,
 * atomically, and gets a claim code; the team is notified. Every later claim —
 * and every invalid one — gets `{ code: null }`. Once a winner exists the view
 * endpoint closes too.
 *
 * ── What a refusal looks like ──
 *
 * A body that is not a sample at all is a 422, as on the forms. Everything
 * else that declines — closed, unconfigured, rate-limited, store down — answers
 * like a miss. None of it is shown to a visitor; the reasons are in the log.
 */

import { readMailConfig, type MailEnv } from '../config.js'
import { clientIp, json, readJsonBody } from '../endpoint.js'
import { cmsRecipient } from '../recipient.js'
import { sendEmail } from '../resend.js'
import { readViewConfig, VIEW_OPEN, type ViewConfig, type ViewEnv, type Vec3 } from './config.js'
import { measure, type ViewSample } from './solution.js'
import { createMemoryStore, createUpstashStore, type ViewStore } from './store.js'
import { decoyToken, issueToken, keyedHash, verifyToken } from './token.js'

export const WINNER_KEY = 'v:winner'

/** Far outside the city; a coordinate beyond this is not a camera. */
const COORDINATE_LIMIT = 100_000
const TOKEN_FIELD_MAX = 64
const EMAIL_MAX = 254
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface ViewRespondOptions {
  now?: () => number
  log?: (line: string) => void
  fetchImpl?: typeof fetch
  /** Injected by tests; otherwise built from the config. */
  store?: ViewStore
}

// ── Module state, as in `server/endpoint.ts` ──

/**
 * The memory store has to outlive a request to mean anything under the dev
 * server; the Upstash one is stateless and cached only to save the allocation.
 */
let cachedStore: { signature: string; store: ViewStore } | null = null
/** Logged once per distinct message, so a missing variable does not flood the log. */
let lastConfigMessage = ''

export function resetViewStateForTests(): void {
  cachedStore = null
  lastConfigMessage = ''
}

function storeFor(config: ViewConfig, fetchImpl: typeof fetch | undefined): ViewStore {
  const signature = config.store.kind === 'upstash' ? 'upstash:' + config.store.url : 'memory'
  if (cachedStore === null || cachedStore.signature !== signature) {
    const store =
      config.store.kind === 'upstash'
        ? createUpstashStore({
            url: config.store.url,
            token: config.store.token,
            timeoutMs: config.timeoutMs,
            ...(fetchImpl ? { fetchImpl } : {}),
          })
        : createMemoryStore()
    cachedStore = { signature, store }
  }
  return cachedStore.store
}

function configOrLog(env: ViewEnv, log: (line: string) => void): ViewConfig | null {
  const result = readViewConfig(env)
  if (result.ok) return result.config
  if (result.message !== lastConfigMessage) {
    lastConfigMessage = result.message
    // Names variables, never values.
    log('[view] closed: ' + result.message)
  }
  return null
}

/** One request against both windows. Counted even when refused, so hammering costs the hammerer. */
async function admit(
  store: ViewStore,
  config: ViewConfig,
  ip: string | null,
  nowMs: number,
): Promise<boolean> {
  const hour = Math.floor(nowMs / 3_600_000)
  const minute = Math.floor(nowMs / 60_000)
  const address = await keyedHash(config.secret, ip ?? 'unknown')
  const perIp = await store.incr('v:rl:ip:' + address + ':' + hour, 3_600)
  const global = await store.incr('v:rl:g:' + minute, 60)
  return perIp <= config.perIpPerHour && global <= config.globalPerMinute
}

function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { allow: 'POST' } })
  }
  if (request.method !== 'POST') {
    return json(405, { ok: false, code: 'method_not_allowed' }, { allow: 'POST' })
  }
  return null
}

function invalid(): Response {
  return json(422, { ok: false, code: 'invalid' })
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= COORDINATE_LIMIT)
  )
}

function readToken(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > TOKEN_FIELD_MAX) return undefined
  return value
}

export function parseViewBody(body: unknown): { sample: ViewSample; token: string | null } | null {
  if (body === null || typeof body !== 'object') return null
  const { p, f, fov, t } = body as Record<string, unknown>
  if (!isVec3(p) || !isVec3(f) || Math.hypot(...f) === 0) return null
  if (typeof fov !== 'number' || !Number.isFinite(fov) || fov <= 0 || fov >= 180) return null
  const token = readToken(t)
  if (token === undefined) return null
  return { sample: { position: p, forward: f, fov }, token }
}

export async function respondView(
  request: Request,
  env: ViewEnv,
  options: ViewRespondOptions = {},
): Promise<Response> {
  const early = preflight(request)
  if (early) return early
  const read = await readJsonBody(request)
  if (!read.ok) return read.response
  const parsed = parseViewBody(read.value)
  if (parsed === null) return invalid()

  const log = options.log ?? ((line: string) => console.log(line))
  const decoy = () => json(200, { t: decoyToken() })
  if (!VIEW_OPEN) return decoy()
  const config = configOrLog(env, log)
  if (config === null) return decoy()

  const now = (options.now ?? Date.now)()
  const store = options.store ?? storeFor(config, options.fetchImpl)
  try {
    if (await store.exists(WINNER_KEY)) return decoy()
    if (!(await admit(store, config, clientIp(request), now))) return decoy()
  } catch (error) {
    log('[view] store: ' + (error instanceof Error ? error.message : 'unknown'))
    return decoy()
  }

  const held = await verifyToken(config.secret, parsed.token, now)
  const next = held + 1
  const deviation = next <= config.stages.length ? measure(parsed.sample, config.stages[next - 1]) : null

  let t: string
  if (deviation?.inside) t = await issueToken(config.secret, next, now)
  else if (held > 0) t = await issueToken(config.secret, held, now)
  else t = decoyToken()

  // Authoring only; `readViewConfig` refuses `debug` in production.
  if (config.debug) return json(200, { t, dbg: { stage: next, held, ...deviation } })
  return json(200, { t })
}

export function parseClaimBody(body: unknown): { token: string; email: string } | null {
  if (body === null || typeof body !== 'object') return null
  const { t, email } = body as Record<string, unknown>
  const token = readToken(t)
  if (typeof token !== 'string') return null
  if (typeof email !== 'string') return null
  const address = email.trim()
  if (address.length > EMAIL_MAX || !ADDRESS_PATTERN.test(address)) return null
  return { token, email: address }
}

/** 128 random bits as eight groups of four hex digits: readable aloud, unguessable. */
function claimCode(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Buffer.from(bytes).toString('hex').toUpperCase()
  return hex.match(/.{4}/g)!.join('-')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Tells the team. A failure here does NOT undo the win: the record is already
 * in the store, which is the source of truth, and the claimant holds the code.
 */
async function notify(
  env: MailEnv,
  record: { code: string; email: string; at: string },
  log: (line: string) => void,
  fetchImpl: typeof fetch | undefined,
): Promise<void> {
  const mail = readMailConfig(env)
  if (!mail.ok) {
    log('[view] claim registered; notification not sent: mail not configured')
    return
  }
  if (mail.config.mode !== 'send') {
    log('[view] claim registered; notification skipped (mail dry run)')
    return
  }
  let to: string
  try {
    to = mail.config.toOverride ?? cmsRecipient()
  } catch {
    log('[view] claim registered; notification not sent: no recipient')
    return
  }
  const outcome = await sendEmail(
    {
      subject: 'Reclamación registrada',
      text:
        'Se ha registrado una reclamación.\n\n' +
        'Código: ' + record.code + '\n' +
        'Email: ' + record.email + '\n' +
        'Fecha: ' + record.at + '\n\n' +
        'El registro también está en el store, clave ' + WINNER_KEY + '.',
      html:
        '<p>Se ha registrado una reclamación.</p>' +
        '<p>Código: <code>' + escapeHtml(record.code) + '</code><br>' +
        'Email: ' + escapeHtml(record.email) + '<br>' +
        'Fecha: ' + escapeHtml(record.at) + '</p>' +
        '<p>El registro también está en el store, clave <code>' + WINNER_KEY + '</code>.</p>',
      replyTo: record.email,
    },
    {
      apiKey: mail.config.apiKey,
      from: mail.config.from,
      to,
      timeoutMs: mail.config.timeoutMs,
      ...(fetchImpl ? { fetchImpl } : {}),
    },
  )
  log(outcome.ok ? '[view] claim registered; team notified' : '[view] claim registered; notification failed: ' + outcome.detail)
}

export async function respondClaim(
  request: Request,
  env: ViewEnv & MailEnv,
  options: ViewRespondOptions = {},
): Promise<Response> {
  const early = preflight(request)
  if (early) return early
  const read = await readJsonBody(request)
  if (!read.ok) return read.response
  const parsed = parseClaimBody(read.value)
  if (parsed === null) return invalid()

  const log = options.log ?? ((line: string) => console.log(line))
  const none = () => json(200, { code: null })
  if (!VIEW_OPEN) return none()
  const config = configOrLog(env, log)
  if (config === null) return none()

  const nowMs = (options.now ?? Date.now)()
  const store = options.store ?? storeFor(config, options.fetchImpl)

  let record: { code: string; email: string; at: string }
  try {
    if (!(await admit(store, config, clientIp(request), nowMs))) return none()
    const stage = await verifyToken(config.secret, parsed.token, nowMs)
    if (stage !== config.stages.length) return none()

    record = { code: claimCode(), email: parsed.email, at: new Date(nowMs).toISOString() }
    if (!(await store.setIfAbsent(WINNER_KEY, JSON.stringify(record)))) return none()
  } catch (error) {
    // Usually nothing was written and the claimant can simply retry. The one
    // unlucky case — the write landed but its answer was lost — leaves a record
    // with their email and no code on their screen; the email is what the team
    // verifies against then.
    log('[view] store: ' + (error instanceof Error ? error.message : 'unknown'))
    return none()
  }

  await notify(env, record, log, options.fetchImpl)
  return json(200, { code: record.code })
}
