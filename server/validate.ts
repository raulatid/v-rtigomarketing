/**
 * What the server believes about a submission, decided without trusting a word
 * of it.
 *
 * ── Why these rules are a second copy ──
 *
 * The two forms validate in the browser as well, and this is deliberately not a
 * module they share. `ContactSection.tsx` records the same choice for its email
 * pattern ("restated here rather than shared: the two forms must be able to
 * diverge"), and the reason is stronger on this side: a rule shared with the
 * browser is one an attacker reads, and one that changes silently when the form
 * changes. The client's copy exists to be KIND — to say "revisa el email" before
 * a round trip. This copy exists to be RIGHT. When they disagree, this one wins.
 *
 * This is the answer to API-3, "the audit form has no server-side controls", and
 * the website rules below are the answer to API-2.
 */

/**
 * Field length caps, in characters after trimming.
 *
 * The same numbers are `maxLength` on the inputs in `AuditSection.tsx` and
 * `ContactSection.tsx`. Duplicated on purpose — see the note above — and each
 * side carries a comment naming the other, so a change to one is a change
 * somebody has to make twice on purpose rather than once by accident.
 */
export const CAPS = {
  name: 80,
  email: 254,
  website: 200,
  phone: 32,
  message: 2000,
} as const

/** The three options the audit form's select offers. Nothing else is a plan. */
export const PLANS = ['seo-tecnico', 'contenido', 'completa'] as const

export type Plan = (typeof PLANS)[number]

export interface AuditSubmission {
  plan: Plan
  name: string
  email: string
  /** Absolute, http(s), and checked — never fetched. */
  website: string
  /** The one optional field. `''` when not given. */
  phone: string
}

export interface ContactSubmission {
  name: string
  email: string
  message: string
}

export interface SubmissionMeta {
  /**
   * The hidden field's content. Non-empty means something that is not a person
   * filled in an input no person can see. What to DO about that is
   * handleSubmission's decision, not this module's.
   */
  honeypot: string
  /** The client's mount time in ms, or null when absent or unusable. */
  startedAt: number | null
}

export type ParseResult<T> =
  | { ok: true; value: T; meta: SubmissionMeta }
  | { ok: false; fields: Record<string, string> }

/**
 * Deliberately loose, and the same shape the rest of the repository settled on
 * (`src/content/invariants.ts`): the job is to catch what could not be replied
 * to, not to adjudicate RFC 5322.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * C0 and C1 control characters, which belong in no field on this form. Tab,
 * newline and carriage return are deliberately NOT in the class: the message
 * field keeps its newlines, and the single-line fields fold theirs below, where
 * the email rule can still see that they were there.
 *
 * Both of these are written with ESCAPES rather than literal characters, and
 * that is not a style choice: U+2028 and U+2029 are line terminators in
 * JavaScript source, so a literal one inside a regex ends the literal in the
 * middle of its character class and the file stops parsing.
 */
const CONTROL_CHARACTERS = new RegExp(
  '[' +
    '\u0000-\u0008' + // NUL through backspace
    '\u000B\u000C' + // vertical tab, form feed
    '\u000E-\u001F' + // shift-out through unit separator, ESC included
    '\u007F-\u009F' + // delete, and the C1 block
    ']',
  'g',
)

/** Any run of newline-ish whitespace, for fields that are one line by nature. */
const LINE_BREAKS = new RegExp('[\r\n\u2028\u2029]+', 'g')
/**
 * Hosts that are only ever interesting to something that FETCHES the value.
 *
 * Nothing fetches it — that is the disposition on API-2 and it is recorded in
 * adr/014 — but a lead form has no business carrying `169.254.169.254` either
 * way, and refusing it here means the answer does not depend on nobody ever
 * writing a crawler later.
 */
function isForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return true
  }

  // IPv6 arrives from `new URL()` wrapped in brackets.
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1)
    if (inner === '::1' || inner === '::') return true
    // Link-local fe80::/10 and unique-local fc00::/7.
    if (/^fe[89ab]/.test(inner) || /^f[cd]/.test(inner)) return true
    // An IPv4-mapped address is still an IPv4 address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(inner)
    if (mapped) return isForbiddenIpv4(mapped[1])
    return false
  }

  // Bare integers and short forms: `127.1` and `2130706433` both reach loopback.
  if (/^\d+$/.test(host)) return true
  if (/^\d+(\.\d+){1,3}$/.test(host)) return isForbiddenIpv4(host)

  // A company website has a dot in it. Without this, an internal name that is
  // not in any range above still gets through.
  if (!host.includes('.')) return true

  return false
}

function isForbiddenIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  // A short form like `127.1` means 127.0.0.1; only the first octet is needed
  // for every range this refuses.
  const [a, b] = parts
  if (a === 0 || a === 127) return true
  if (a === 10) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

/** A field arriving as anything but a string is a client this does not have. */
function asString(raw: unknown): string | null {
  if (raw === undefined || raw === null) return ''
  return typeof raw === 'string' ? raw : null
}

function clean(raw: string, { multiline }: { multiline: boolean }): string {
  const withoutControls = raw.replace(CONTROL_CHARACTERS, '')
  const flattened = multiline
    ? withoutControls
    : withoutControls.replace(LINE_BREAKS, ' ').replace(/[ \t]{2,}/g, ' ')
  return flattened.trim()
}

interface TextRule {
  key: string
  raw: unknown
  cap: number
  required?: boolean
  multiline?: boolean
  missing: string
  tooLong: string
}

/** Reads one text field, writing at most one message into `fields`. */
function readText(rule: TextRule, fields: Record<string, string>): string {
  const asText = asString(rule.raw)
  if (asText === null) {
    fields[rule.key] = rule.missing
    return ''
  }
  const value = clean(asText, { multiline: rule.multiline === true })
  if (value.length === 0) {
    if (rule.required !== false) fields[rule.key] = rule.missing
    return ''
  }
  if (value.length > rule.cap) {
    fields[rule.key] = rule.tooLong
    return value
  }
  return value
}

function readMeta(body: Record<string, unknown>): SubmissionMeta {
  const honeypotRaw = asString(body.empresa)
  const startedAtRaw = body.startedAt
  const startedAt =
    typeof startedAtRaw === 'number' && Number.isFinite(startedAtRaw) ? startedAtRaw : null
  return { honeypot: honeypotRaw === null ? 'no-string' : honeypotRaw.trim(), startedAt }
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function readEmail(raw: unknown, fields: Record<string, string>): string {
  const value = readText(
    {
      key: 'email',
      raw,
      cap: CAPS.email,
      missing: 'Introduce tu email.',
      tooLong: 'Ese email es demasiado largo.',
    },
    fields,
  )
  if (fields.email !== undefined || value.length === 0) return value

  // The address becomes `reply_to` on the notification, so a newline in it is
  // the classic way to append a Bcc:. `clean` has already removed them; this
  // rejects rather than repairs, because a repaired address is not the one the
  // person typed and replying to it would go somewhere they did not choose.
  const original = typeof raw === 'string' ? raw : ''
  if (/[\r\n]|%0a|%0d/i.test(original)) {
    fields.email = 'El formato del email no es válido.'
    return value
  }
  if (!EMAIL_PATTERN.test(value)) {
    fields.email = 'El formato del email no es válido.'
  }
  return value
}

function readName(raw: unknown, fields: Record<string, string>): string {
  return readText(
    {
      key: 'name',
      raw,
      cap: CAPS.name,
      missing: 'Introduce tu nombre.',
      tooLong: 'Ese nombre es demasiado largo.',
    },
    fields,
  )
}

function readWebsite(raw: unknown, fields: Record<string, string>): string {
  const value = readText(
    {
      key: 'website',
      raw,
      cap: CAPS.website,
      missing: 'Introduce la URL de tu web.',
      tooLong: 'Esa URL es demasiado larga.',
    },
    fields,
  )
  if (fields.website !== undefined || value.length === 0) return value

  const invalid = 'El formato de la URL no es válido.'
  // A bare domain is what people type, and the client has always accepted it.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    fields.website = invalid
    return value
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fields.website = invalid
    return value
  }
  // Credentials render one way to a careful reader of an inbox and another way
  // to a hurried one.
  if (url.username.length > 0 || url.password.length > 0) {
    fields.website = invalid
    return value
  }
  if (url.hostname.length === 0 || isForbiddenHost(url.hostname)) {
    fields.website = invalid
    return value
  }
  if (url.href.length > CAPS.website) {
    fields.website = 'Esa URL es demasiado larga.'
    return value
  }

  return url.href
}

export function parseAuditBody(raw: unknown): ParseResult<AuditSubmission> {
  const body = asObject(raw)
  if (body === null) return { ok: false, fields: { form: 'No hemos podido leer el formulario.' } }

  const fields: Record<string, string> = {}

  const planRaw = asString(body.plan)
  const plan = planRaw === null ? '' : planRaw.trim()
  if (!(PLANS as readonly string[]).includes(plan)) {
    fields.plan = 'Selecciona un tipo de auditoría.'
  }

  const name = readName(body.name, fields)
  const email = readEmail(body.email, fields)
  const website = readWebsite(body.website, fields)
  const phone = readText(
    {
      key: 'phone',
      raw: body.phone,
      cap: CAPS.phone,
      required: false,
      missing: '',
      tooLong: 'Ese teléfono es demasiado largo.',
    },
    fields,
  )

  if (Object.keys(fields).length > 0) return { ok: false, fields }

  return {
    ok: true,
    value: { plan: plan as Plan, name, email, website, phone },
    meta: readMeta(body),
  }
}

export function parseContactBody(raw: unknown): ParseResult<ContactSubmission> {
  const body = asObject(raw)
  if (body === null) return { ok: false, fields: { form: 'No hemos podido leer el formulario.' } }

  const fields: Record<string, string> = {}

  const name = readName(body.name, fields)
  const email = readEmail(body.email, fields)
  // Prose, so its newlines survive: this is the only multiline field on either
  // form, and flattening it would rewrite what somebody wrote.
  const message = readText(
    {
      key: 'message',
      raw: body.message,
      cap: CAPS.message,
      multiline: true,
      missing: 'Cuéntanos en qué podemos ayudarte.',
      tooLong: 'Ese mensaje es demasiado largo.',
    },
    fields,
  )

  if (Object.keys(fields).length > 0) return { ok: false, fields }

  return { ok: true, value: { name, email, message }, meta: readMeta(body) }
}
