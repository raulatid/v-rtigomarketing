/**
 * Whether this deployment may send mail, decided once, as a value.
 *
 * A pure function of an env object rather than reads of `process.env` scattered
 * through two function handlers — the arrangement `content/lib/config.ts` uses
 * and for the same reason: "a production deployment with no key fails" is then
 * a unit test rather than something someone remembers to try by hand.
 *
 * ── The rule this file exists for ──
 *
 * A DRY RUN IS A DEVELOPMENT AFFORDANCE THAT PRODUCTION MAY NOT HAVE.
 *
 * `src/app/auditSubmission.ts` used to carry the honesty rule while there was no
 * backend: a demo build could resolve, a production build had to reject, because
 * a "Solicitud recibida" nobody will read is a lie. The backend exists now, so
 * the rule moved here and changed shape. The lie available today is a production
 * deployment that quietly stopped sending — one variable dropped from the Vercel
 * project — while every visitor still reads the receipt. So in production a
 * missing key is a FAILURE, never a quiet fall back to doing nothing.
 *
 * Outside production the opposite is true: `npm run dev` on a fresh clone must
 * exercise the whole form with nothing configured at all.
 */

export interface SendingMailConfig {
  mode: 'send'
  /** Never logged, never returned to a client, never put in a message. */
  apiKey: string
  /** `Name <address@domain>` or a bare address. Never guessed. */
  from: string
  /**
   * Replaces the CMS recipient when set. Required while `from` is Resend's
   * sandbox sender, which delivers only to the account owner.
   */
  toOverride?: string
  timeoutMs: number
  perIpPerHour: number
  perEmailPerHour: number
}

export interface DryRunMailConfig {
  mode: 'dry-run'
  /** Which branch produced the dry run, for the one log line it writes. */
  reason: 'no-key' | 'forced'
  timeoutMs: number
  perIpPerHour: number
  perEmailPerHour: number
}

export type MailConfig = SendingMailConfig | DryRunMailConfig

export type MailConfigResult = { ok: true; config: MailConfig } | { ok: false; message: string }

export type MailEnv = Record<string, string | undefined>

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_PER_IP_PER_HOUR = 5
const DEFAULT_PER_EMAIL_PER_HOUR = 3

/** The only values Vercel ever sets. Anything else is a hand-edit or a typo. */
const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development']

/**
 * Deliberately loose, and the same shape `src/content/invariants.ts` settled on:
 * the only thing this needs to catch is an override nobody could deliver to.
 */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Resend's sandbox sender. Delivers ONLY to the account owner's own address. */
const SANDBOX_SENDER = 'resend.dev'

function fail(message: string): MailConfigResult {
  return { ok: false, message }
}

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

/** `Name <a@b.com>` → `a@b.com`; a bare address is returned unchanged. */
function addressOf(from: string): string {
  const angled = /<([^>]*)>\s*$/.exec(from)
  return (angled ? angled[1] : from).trim()
}

interface Limits {
  timeoutMs: number
  perIpPerHour: number
  perEmailPerHour: number
}

/**
 * An invalid value FAILS rather than falling back, which is the lesson
 * `SANITY_TIMEOUT_MS` records: a typo must not become `setTimeout(fn, NaN)`,
 * which fires immediately and then reports every request as timing out.
 */
function readLimits(env: MailEnv): { ok: true; limits: Limits } | { ok: false; message: string } {
  const numbers: Array<[keyof Limits, string, number]> = [
    ['timeoutMs', 'MAIL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS],
    ['perIpPerHour', 'MAIL_RATE_PER_HOUR', DEFAULT_PER_IP_PER_HOUR],
    ['perEmailPerHour', 'MAIL_RATE_EMAIL_PER_HOUR', DEFAULT_PER_EMAIL_PER_HOUR],
  ]

  const limits: Limits = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    perIpPerHour: DEFAULT_PER_IP_PER_HOUR,
    perEmailPerHour: DEFAULT_PER_EMAIL_PER_HOUR,
  }

  for (const [key, name, fallback] of numbers) {
    const raw = clean(env[name])
    if (raw.length === 0) {
      limits[key] = fallback
      continue
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, message: name + ' must be a positive number — got "' + raw + '"' }
    }
    limits[key] = parsed
  }

  return { ok: true, limits }
}

export function readMailConfig(env: MailEnv): MailConfigResult {
  // SEC-9, mirrored from content/lib/config.ts and vite.config.ts. Vercel always
  // sets VERCEL=1; VERCEL_ENV arrives only while "Automatically expose System
  // Environment Variables" is on. Without it every deployment reads as
  // development and the production guard below could never fire.
  if (clean(env.VERCEL).length > 0 && clean(env.VERCEL_ENV).length === 0) {
    return fail(
      'VERCEL is set but VERCEL_ENV is not — enable "Automatically expose System ' +
        'Environment Variables" in the Vercel project. Refusing to guess the environment.',
    )
  }

  // Mirrored too: a value outside the three fails rather than reading as "not
  // production". Every rule below is spelled `isProduction`, so `Production` or
  // `prod` would leave MAIL_DRY_RUN permitted and a missing key silently
  // downgraded to a dry run — a deployed form answering "recibido" and sending
  // nothing, which is the exact failure this file exists to make impossible.
  const environment = clean(env.VERCEL_ENV)
  if (environment.length > 0 && !VERCEL_ENVIRONMENTS.includes(environment)) {
    return fail(
      'VERCEL_ENV must be one of ' +
        VERCEL_ENVIRONMENTS.join(', ') +
        ' — got "' +
        environment +
        '". It is a Vercel system variable; do not set it by hand.',
    )
  }

  const isProduction = environment === 'production'

  const read = readLimits(env)
  if (!read.ok) return fail(read.message)
  const { limits } = read

  // The escape hatch, and the one place it is refused. In production this switch
  // turns every enquiry into a receipt nobody receives — the same shape as
  // CONTENT_SOURCE=fixture, refused for the same reason (SEC-7).
  const forcedDryRun = clean(env.MAIL_DRY_RUN)
  if (forcedDryRun.length > 0 && forcedDryRun !== '0') {
    if (isProduction) {
      return fail(
        'MAIL_DRY_RUN is not allowed in production — a dry run there is a form that ' +
          'reports success and sends nothing. Remove it from the Production environment.',
      )
    }
    return { ok: true, config: { mode: 'dry-run', reason: 'forced', ...limits } }
  }

  // Blank is absent. An empty Vercel variable must not become `Bearer ` on the
  // wire, which reads as a 401 from Resend rather than as a misconfiguration.
  const apiKey = clean(env.RESEND_API_KEY)
  if (apiKey.length === 0) {
    if (isProduction) {
      return fail(
        'RESEND_API_KEY is missing in production — refusing to accept submissions the site ' +
          'cannot deliver. Set it in the Vercel Production environment, or take the forms down.',
      )
    }
    return { ok: true, config: { mode: 'dry-run', reason: 'no-key', ...limits } }
  }

  // Never defaulted. A guessed sender produces a Resend 403 that reads like an
  // outage, and the address is a DNS-verification fact rather than a preference.
  const from = clean(env.MAIL_FROM)
  if (from.length === 0) {
    return fail(
      'MAIL_FROM is required whenever RESEND_API_KEY is set — e.g. ' +
        '"Vértigo <no-reply@vertigomkt.com>", on a domain verified in Resend. Refusing to guess one.',
    )
  }

  const rawOverride = clean(env.MAIL_TO_OVERRIDE)
  if (rawOverride.length > 0 && !ADDRESS_PATTERN.test(rawOverride)) {
    return fail('MAIL_TO_OVERRIDE must be an email address — got "' + rawOverride + '"')
  }
  const toOverride = rawOverride.length > 0 ? rawOverride : undefined

  // The arrangement that cannot deliver, refused at the point it is chosen
  // rather than at the point a visitor discovers it. Resend's sandbox sender
  // reaches the account owner and nobody else, so pointing it at the CMS
  // address 422s on every single submission.
  if (addressOf(from).toLowerCase().endsWith('@' + SANDBOX_SENDER) && toOverride === undefined) {
    return fail(
      'MAIL_FROM uses Resend\'s sandbox sender (' +
        SANDBOX_SENDER +
        '), which delivers only to the Resend account owner. Set MAIL_TO_OVERRIDE to that ' +
        'address, or verify a domain and send from it.',
    )
  }

  return {
    ok: true,
    config: { mode: 'send', apiKey, from, ...(toOverride ? { toOverride } : {}), ...limits },
  }
}
